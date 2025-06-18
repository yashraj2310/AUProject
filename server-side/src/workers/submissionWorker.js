import dotenv from "dotenv";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import fs from "fs/promises";
import os from "os";
import Docker from "dockerode";
import IORedis from "ioredis";
import { Worker } from "bullmq";
import { execSync } from "child_process";

import connectDB from "../database/db.js";
import { Submission } from "../models/submission.model.js";
import { Problem } from "../models/problem.model.js";

// ── Load ENV and Config ───────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const langConfigPath = path.resolve(__dirname, "../../lang-config.json");
const langConfigJson = await fs.readFile(langConfigPath, "utf8");
const langConfig     = JSON.parse(langConfigJson);

// ── Docker & Redis Setup ───────────────────────────────
const docker = new Docker({ socketPath: "/var/run/docker.sock" });
const REDIS_CONN_OPTS = {
  host:             process.env.REDIS_HOST || "127.0.0.1",
  port:            +process.env.REDIS_PORT || 6379,
  maxRetriesPerRequest: null,
  enableReadyCheck:     false,
};

async function executeInDocker(language, code, stdin, timeLimit, memKB, submissionId) {
  const cfg = langConfig[language];
  if (!cfg) {
    return {
      status: "Internal SystemError",
      time:   0,
      memory: 0,
      output: `Unsupported language ${language}`
    };
  }

  // 1) make temp dir
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), `sub-${submissionId}-`));
  console.log(`[DEBUG] temp dir: ${tmp}`);
  try {
    execSync(`chmod 777 ${tmp}`);

    // 2) write code + input.txt
    const srcFile = cfg.sourceFile;
    if (!srcFile) throw new Error(`lang-config.json missing sourceFile for ${language}`);
    await fs.writeFile(path.join(tmp, srcFile), code);
    await fs.writeFile(path.join(tmp, "input.txt"), stdin || "");

    // 3) strip any redirections from cfg.run
    const rawRun = cfg.run.split("<")[0].trim();
    const compilePart = cfg.compile
      ? `${cfg.compile} 2> compile_err.txt && `
      : "";

    // 4) build one—and only one—redirection
    const shellCmd = `${compilePart}${rawRun} < input.txt > user_out.txt 2> user_err.txt`;
    const wrapped  = `/usr/bin/time -f "%e %M" -o stats.txt timeout -s KILL ${timeLimit}s sh -c "${shellCmd.replace(/"/g, '\\"')}"`;
    console.log(`[DEBUG] container CMD: ${wrapped}`);

    // 5) create & run container
    const container = await docker.createContainer({
      Image: cfg.image,
      HostConfig: {
        NetworkMode: "none",
        Memory:      memKB * 1024,
        MemorySwap:  memKB * 1024,
        PidsLimit:   64,
        Binds:       [`${tmp}:/sandbox:z`]
      },
      WorkingDir: "/sandbox",
      Cmd:        ["sh","-c", wrapped],
      // User:       process.env.DOCKER_CONTAINER_UID || "1001"
    });

    await container.start();
    await container.wait();
    console.log("[DEBUG] container finished");

    // 6) read stats, outputs
    let timeUsed = 0, memUsed = 0;
    try {
      const stats = await fs.readFile(path.join(tmp,"stats.txt"), "utf8");
      const [t,m] = stats.trim().split(/\s+/);
      timeUsed = parseFloat(t) || 0;
      memUsed  = parseInt(m, 10) || 0;
    } catch {}

    const compileErr = await fs.readFile(path.join(tmp,"compile_err.txt"), "utf8").catch(()=> "");
    const userErr    = await fs.readFile(path.join(tmp,"user_err.txt"),   "utf8").catch(()=> "");
    const userOut    = await fs.readFile(path.join(tmp,"user_out.txt"),   "utf8").catch(()=> "");

    // 7) decide status
    let status;
    if      (compileErr)                status = "Compilation Error";
    else if (userErr && !userOut)       status = "Runtime Error";
    else if (timeUsed >= timeLimit)     status = "Time Limit Exceeded";
    else if (memUsed  > memKB)          status = "Memory Limit Exceeded";
    else                                 status = "Accepted";

    const output = compileErr || userErr || userOut;
    return { status, time: timeUsed, memory: memUsed, output };

  } catch (err) {
    console.error("[DEBUG] executeInDocker error:", err);
    return {
      status: "Internal SystemError",
      time:   0,
      memory: 0,
      output: err.message
    };
  } finally {
    console.log(`[DEBUG] preserving ${tmp} for inspection`);
    // remove if you’d rather clean up: await fs.rm(tmp,{recursive:true,force:true});
  }
}

async function processSubmissionJob(job) {
  const submissionId = job.data.submissionId;
  console.log(`🛠️  Processing ${submissionId}`);
  await connectDB();

  const submission = await Submission.findById(submissionId);
  if (!submission) return;
  const problem = await Problem.findById(submission.problemId)
    .select("testCases cpuTimeLimit memoryLimit");
  if (!problem) {
    await Submission.findByIdAndUpdate(submissionId, { verdict: "Internal SystemError" });
    return;
  }

  await Submission.findByIdAndUpdate(submissionId, {
    verdict: "Running",
    testCaseResults: []
  });

  let overall = "Accepted", maxTime = 0, maxMem = 0;
  let compileOutput = null, stderrOutput = null;
  const results = [];

  // pick testcases
  let tcs;
  if (submission.submissionType === "run" && submission.customInput) {
    tcs = [{ _id: null, input: submission.customInput, expectedOutput: "", isSample: false }];
  } else if (submission.submissionType === "run") {
    tcs = problem.testCases.filter(tc => tc.isSample);
  } else {
    tcs = problem.testCases || [];
  }

  for (let i = 0; i < tcs.length; i++) {
    const tc = tcs[i];
    const exec = await executeInDocker(
      submission.language,
      submission.code,
      tc.input,
      problem.cpuTimeLimit,
      problem.memoryLimit,
      submissionId
    );

    maxTime = Math.max(maxTime, exec.time);
    maxMem  = Math.max(maxMem,  exec.memory);

    let status = exec.status;
    if (status === "Accepted" && tc._id) {
      const got = exec.output.trim(), exp = tc.expectedOutput.trim();
      if (got !== exp) {
        status = "Wrong Answer";
        overall = "Wrong Answer";
        stderrOutput = `#${i+1} expected '${exp}', got '${got}'`;
      }
    } else if (status !== "Accepted") {
      overall = status;
      if (status === "Compilation Error") compileOutput = exec.output;
      else stderrOutput = exec.output;
    }

    results.push({
      testCaseId:    tc._id,
      input:         tc.input,
      expectedOutput: tc.expectedOutput,
      actualOutput:  exec.output,
      status,
      time:          exec.time,
      memory:        exec.memory,
      inputSize:     tc.input.length,
      isSample:      tc.isSample,
      isCustom:      tc._id === null
    });

    if (status !== "Accepted") break;
  }

  await Submission.findByIdAndUpdate(submissionId, {
    verdict:         overall,
    testCaseResults: results,
    compileOutput,
    stderr:          stderrOutput,
    executionTime:   maxTime,
    memoryUsed:      maxMem
  });

  console.log(`✅  Done ${submissionId}: ${overall}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  (async () => {
    const worker = new Worker("submission-processing", processSubmissionJob, {
      connection:  new IORedis(REDIS_CONN_OPTS),
      concurrency: Number(process.env.WORKER_CONCURRENCY) || 1
    });
    worker.on("completed", job => console.log(`✔️ Job ${job.id} completed`));
    worker.on("failed",    (job, err) => console.error(`❌ Job ${job.id} failed:`, err));
  })();
}
