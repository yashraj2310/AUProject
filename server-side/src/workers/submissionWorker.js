// server-side/src/workers/submissionWorker.js

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import fs from "fs/promises";
import os from "os";
import Docker from "dockerode";
import IORedis from "ioredis";
import { Worker } from "bullmq";

import connectDB from "../database/db.js";
import { Submission } from "../models/submission.model.js";
import { Problem    } from "../models/problem.model.js";

// ── Load ENV ─────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

// ── Load lang-config.json at runtime ─────────────────
const langConfigPath = path.resolve(__dirname, "../../lang-config.json");
const langConfigJson = await fs.readFile(langConfigPath, "utf8");
const langConfig     = JSON.parse(langConfigJson);

// ── Dockerode & Redis Setup ───────────────────────────
const docker = new Docker({ socketPath: "/var/run/docker.sock" });
const REDIS_CONN_OPTS = {
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: +process.env.REDIS_PORT || 6379,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
};

// ── Core: generic runner via Docker ───────────────────
async function executeInDocker(language, code, stdin, timeLimit, memKB, submissionId) {
  const cfg = langConfig[language];
  if (!cfg) {
    return { status: "Internal SystemError", time: 0, memory: 0, output: `Unsupported language ${language}` };
  }

  // 1) Prepare temp dir
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), `sub-${submissionId}-`));
  await fs.chmod(tmp, 0o755);

  // 2) Write code + input
  const codeFile = cfg.compile
    ? cfg.compile.split(" ")[2]   // e.g. "Main.cpp"
    : cfg.run.split(" ")[1];      // e.g. "script.js"
  await fs.writeFile(path.join(tmp, codeFile), code);
  await fs.writeFile(path.join(tmp, "input.txt"), stdin || "");

  // 3) Build snippet
  const compilePart = cfg.compile ? `${cfg.compile} 2> compile_err.txt && ` : "";
  const runPart     = cfg.run;
  const wrapped     = `/usr/bin/time -f "%e %M" -o stats.txt timeout -s KILL ${timeLimit}s sh -c '${compilePart}${runPart}'`;

  // 4) Create container
  const container = await docker.createContainer({
    Image: cfg.image,
    HostConfig: {
      AutoRemove: true,
      NetworkMode: "none",
      Memory: memKB * 1024,
      MemorySwap: memKB * 1024,
      PidsLimit: 64,
      Binds: [`${tmp}:/sandbox`],
    },
    WorkingDir: "/sandbox",
    Cmd: ["sh", "-c", wrapped],
  });

  // 5) Run & wait
  const stream = await container.attach({ stream:true, stdout:true, stderr:true });
  const out = [], err = [];
  docker.modem.demuxStream(stream,
    { write: b => out.push(b) },
    { write: b => err.push(b) }
  );
  await container.start();
  await container.wait();

  // 6) Read stats
  let timeUsed = 0, memUsed = 0;
  try {
    const stats = await fs.readFile(path.join(tmp, "stats.txt"), "utf8");
    const [t,m] = stats.trim().split(/\s+/);
    timeUsed = parseFloat(t) || 0;
    memUsed  = parseInt(m,10)  || 0;
  } catch {}

  // 7) Read outputs
  const compileErr = await fs.readFile(path.join(tmp, "compile_err.txt"), "utf8").catch(() => "");
  const userErr    = await fs.readFile(path.join(tmp, "user_err.txt"),    "utf8").catch(() => "");
  const userOut    = await fs.readFile(path.join(tmp, "user_out.txt"),    "utf8").catch(() => "");

  // 8) Cleanup
  await fs.rm(tmp, { recursive:true, force:true });

  // 9) Determine status
  let status;
  if (compileErr)                status = "Compilation Error";
  else if (timeUsed >= timeLimit) status = "Time Limit Exceeded";
  else if (memUsed  > memKB)      status = "Memory Limit Exceeded";
  else if (userErr)               status = "Runtime Error";
  else                            status = "Accepted";

  const output = compileErr || userErr || userOut;
  return { status, time: timeUsed, memory: memUsed, output };
}

// ── Process Submission Job ───────────────────────────
async function processSubmissionJob(job) {
  const submissionId = job.data.submissionId;
  console.log(`🛠️  Processing submission ${submissionId}`);

  const submission = await Submission.findById(submissionId);
  if (!submission) return;

  const problem = await Problem.findById(submission.problemId)
    .select("testCases cpuTimeLimit memoryLimit");
  if (!problem) {
    await Submission.findByIdAndUpdate(submissionId, { verdict: "Internal SystemError" });
    return;
  }

  await Submission.findByIdAndUpdate(submissionId, {
    verdict: "Running", testCaseResults: []
  });

  let overall = "Accepted", maxTime = 0, maxMem = 0;
  let compileOutput = null, stderr = null;
  const results = [];

  const tcs = submission.submissionType === "run"
    ? problem.testCases.filter(tc => tc.isSample)
    : problem.testCases || [];

  for (let i = 0; i < tcs.length; i++) {
    const tc = tcs[i];
    const exec = await executeInDocker(
      submission.language,
      submission.code,
      submission.customInput || tc.input,
      problem.cpuTimeLimit,
      problem.memoryLimit,
      submissionId
    );

    maxTime = Math.max(maxTime, exec.time);
    maxMem  = Math.max(maxMem,  exec.memory);

    let status = exec.status;
    if (status === "Accepted") {
      const got = exec.output.trim(), exp = tc.expectedOutput.trim();
      if (got !== exp) {
        status = "Wrong Answer";
        overall = "Wrong Answer";
        stderr  = `Test #${i+1} expected ${exp}, got ${got}`;
      }
    } else {
      overall = status;
      if (status === "Compilation Error") compileOutput = exec.output;
      else stderr = exec.output;
    }

    results.push({
      testCaseId:     tc._id,
      input:          tc.input,
      expectedOutput: tc.expectedOutput,
      actualOutput:   exec.output,
      status,
      time:           exec.time,
      memory:         exec.memory,
      inputSize:      tc.input.length,
      isSample:       tc.isSample,
      isCustom:       false
    });

    if (status !== "Accepted") break;
  }

  await Submission.findByIdAndUpdate(submissionId, {
    verdict:         overall,
    testCaseResults: results,
    compileOutput,
    stderr,
    executionTime:   maxTime,
    memoryUsed:      maxMem
  });

  console.log(`✅  Done submission ${submissionId}: ${overall}`);
}

// ── Worker Bootstrapping ─────────────────────────────
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  (async () => {
    await connectDB();
    const worker = new Worker("submission-processing", processSubmissionJob, {
      connection: new IORedis(REDIS_CONN_OPTS),
      concurrency: Number(process.env.WORKER_CONCURRENCY) || 1
    });
    worker.on("completed", job => console.log(`✔️ Job ${job.id} completed`));
    worker.on("failed",    (job, err) => console.error(`❌ Job ${job.id} failed:`, err));
  })();
}
