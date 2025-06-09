

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs/promises";
import os from "os";
import Docker from "dockerode";
import IORedis from "ioredis";
import { Worker } from "bullmq";
import mongoose from "mongoose";
import connectDB from "../database/db.js";
import { Submission } from "../models/submission.model.js";
import { Problem } from "../models/problem.model.js";
import { Contest } from "../models/contest.model.js";
import {
  estimateTimeComplexity,
  estimateSpaceComplexity,
} from "../utils/complexityEstimator.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

console.log("WORKER ENV: MONGO_URI", process.env.MONGO_URI ? "OK" : "MISSING");
console.log("WORKER ENV: REDIS_HOST", process.env.REDIS_HOST || "127.0.0.1");
console.log("WORKER ENV: REDIS_PORT", process.env.REDIS_PORT || "6379");
console.log(
  "WORKER ENV: DOCKER_CONTAINER_UID",
  process.env.DOCKER_CONTAINER_UID || "1001"
);
console.log(
  "WORKER ENV: WORKER_CONCURRENCY",
  process.env.WORKER_CONCURRENCY || "1"
);

const DOCKER_IMAGE_MAP = {
  cpp: "898465023886.dkr.ecr.ap-south-1.amazonaws.com/execution-engine-cpp",
  java: "898465023886.dkr.ecr.ap-south-1.amazonaws.com/execution-engine-java",
  javascript:
    "898465023886.dkr.ecr.ap-south-1.amazonaws.com/execution-engine-nodejs",
  python:
    "898465023886.dkr.ecr.ap-south-1.amazonaws.com/execution-engine-python",
};

const redisOptions = {
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: parseInt(process.env.REDIS_PORT || "6379", 10),
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
};

const docker = new Docker({ socketPath: "/var/run/docker.sock" });

function getCodeFileName(lang) {
  switch (lang.toLowerCase()) {
    case "cpp":
      return "Main.cpp";
    case "c":
      return "Main.c";
    case "java":
      return "Main.java";
    case "python":
      return "script.py";
    case "javascript":
      return "script.js";
    default:
      throw new Error("Unsupported language: " + lang);
  }
}

async function executeSingleTestCaseInDocker(
  language,
  code,
  stdin,
  timeLimitSec,
  memoryLimitKB,
  submissionId
) {
  // 1) create temp dir & write code + input.txt
  const tempDir = await fs.mkdtemp(
    path.join(os.tmpdir(), `sub-${submissionId.slice(-6)}-exec-`)
  );
  const codeFile = path.join(tempDir, getCodeFileName(language));
  await fs.writeFile(codeFile, code);
  const inputFile = path.join(tempDir, "input.txt");
  await fs.writeFile(inputFile, stdin || "");

  // 2) figure out image & host<->container mounts
  const image = DOCKER_IMAGE_MAP[language.toLowerCase()];
  if (!image) {
    return { scriptStatus: "INTERNAL_SYSTEM_ERROR", scriptOutput: "No image" };
  }
  const binds = [`${tempDir}:/sandbox:ro`];
  const memBytes = Math.max(32, Math.floor(memoryLimitKB / 1024)) * 1024 * 1024;

  // 3) create & start container
  const container = await docker.createContainer({
    Image: image,
    Cmd: [String(timeLimitSec), String(memoryLimitKB)],
    HostConfig: {
      Binds: binds,
      NetworkMode: "none",
      Memory: memBytes,
      MemorySwap: memBytes,
      PidsLimit: 128,
      CapDrop: ["ALL"],
      CpuQuota: 100000, // 1 CPU
      AutoRemove: true,
    },
  });
  await container.start();

  // 4) stream logs
  const logStream = await container.attach({
    stream: true,
    stdout: true,
    stderr: true,
  });
  let raw = "";
  logStream.on("data", (chunk) => (raw += chunk.toString()));

  // 5) wait for exit
  const { StatusCode } = await container.wait();
  // At this point Docker has auto-removed the container (AutoRemove:true)

  // 6) parse results: first line = status, second = time, third = mem, rest = output
  const lines = raw.trim().split("\n");
  return {
    scriptStatus: lines[0] || "UNKNOWN",
    scriptTime: parseFloat(lines[1]) || 0,
    scriptMemory: parseInt(lines[2], 10) || 0,
    scriptOutput: lines.slice(3).join("\n"),
  };
}

async function processSubmissionJob(job) {
  const { submissionId } = job.data;
  console.log("Worker:", job.id, "for submission", submissionId);

  // fetch submission + problem
  const submission = await Submission.findById(submissionId);
  const problem = await Problem.findById(submission.problemId).select(
    "+testCases"
  );
  if (!submission || !problem) {
    return Submission.findByIdAndUpdate(submissionId, {
      verdict: "Internal System Error",
    });
  }

  // reset
  await Submission.findByIdAndUpdate(submissionId, {
    verdict: "Compiling",
    testCaseResults: [],
    compileOutput: null,
    stderr: null,
    executionTime: 0,
    memoryUsed: 0,
  });

  let overall = "Accepted";
  let maxTime = 0,
    maxMem = 0,
    compileErr = null,
    stderrMsg = null;
  const results = [];

  // choose testcases
  const allCases =
    submission.submissionType === "run"
      ? problem.testCases.filter((tc) => tc.isSample)
      : problem.testCases.slice();
  if (submission.submissionType === "run" && submission.customInput) {
    allCases.push({
      input: submission.customInput,
      expectedOutput: null,
      isSample: false,
      isCustom: true,
    });
  }

  for (let i = 0; i < allCases.length; i++) {
    const tc = allCases[i];
    await Submission.findByIdAndUpdate(submissionId, {
      verdict: `Running ${i + 1}/${allCases.length}`,
    });

    const r = await executeSingleTestCaseInDocker(
      submission.language,
      submission.code,
      tc.input,
      problem.cpuTimeLimit || 2,
      problem.memoryLimit || 128 * 1024,
      submissionId
    );
    maxTime = Math.max(maxTime, r.scriptTime);
    maxMem = Math.max(maxMem, r.scriptMemory);

    // determine status
    let status = "Internal System Error",
      actual = r.scriptOutput;
    switch (r.scriptStatus) {
      case "COMPILATION_ERROR":
        status = "Compilation Error";
        compileErr = r.scriptOutput;
        overall = overall === "Accepted" ? status : overall;
        break;
      case "EXECUTED_SUCCESSFULLY":
        const out = (actual || "").trim();
        const exp = (tc.expectedOutput || "").trim();
        if (tc.isCustom) {
          status = "Custom Output";
        } else if (out === exp) {
          status = "Accepted";
        } else {
          status = "Wrong Answer";
          stderrMsg =
            stderrMsg ||
            `Mismatch #${i + 1}\nExpected: ${exp}\nGot: ${out}`;
          overall = "Wrong Answer";
        }
        break;
      case "TIME_LIMIT_EXCEEDED":
      case "TIME_LIMIT_EXCEEDED_EXTERNAL":
        status = "Time Limit Exceeded";
        overall = overall === "Accepted" ? status : overall;
        stderrMsg = stderrMsg || r.scriptOutput;
        break;
      case "MEMORY_LIMIT_EXCEEDED":
        status = "Memory Limit Exceeded";
        overall = overall === "Accepted" ? status : overall;
        stderrMsg = stderrMsg || r.scriptOutput;
        break;
      default:
        status = "Internal System Error";
        overall = overall === "Accepted" ? status : overall;
        stderrMsg = stderrMsg || r.scriptOutput;
    }

    results.push({
      input: tc.input,
      expectedOutput: tc.isCustom ? null : tc.expectedOutput,
      actualOutput: actual,
      status,
      time: r.scriptTime,
      memory: r.scriptMemory,
      isSample: !!tc.isSample,
      isCustom: !!tc.isCustom,
    });

    if (overall !== "Accepted" && submission.submissionType === "submit") {
      break;
    }
  }

  // estimate complexity on full submit + accepted
  let estTC, estSC;
  if (
    submission.submissionType === "submit" &&
    overall === "Accepted" &&
    results.length >= 3
  ) {
    estTC = estimateTimeComplexity(results);
    estSC = estimateSpaceComplexity(results);
  }

  // save verdict
  const update = {
    verdict: overall,
    testCaseResults: results,
    compileOutput: compileErr,
    executionTime: maxTime,
    memoryUsed: maxMem,
    stderr: stderrMsg,
    ...(estTC && { estimatedTimeComplexity: estTC }),
    ...(estSC && { estimatedSpaceComplexity: estSC }),
  };
  await Submission.findByIdAndUpdate(submissionId, update);
  console.log("✅ Done", submissionId, "→", overall);
}

// ──────────────────────────────────────────────────────────────────────

(async () => {
  await connectDB();
  console.log("✅ Worker connected to MongoDB");

  const worker = new Worker(
    "submission-processing",
    processSubmissionJob,
    {
      connection: new IORedis(redisOptions),
      concurrency: parseInt(process.env.WORKER_CONCURRENCY || "1", 10),
    }
  );

  worker.on("completed", (job) =>
    console.log("✅ Job completed:", job.id)
  );
  worker.on("failed", (job, err) =>
    console.error("❌ Job failed:", job.id, err)
  );
})();
