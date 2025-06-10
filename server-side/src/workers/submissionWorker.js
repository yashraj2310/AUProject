// --- Load Environment Variables from root ---
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

console.log(
  "WORKER ENV: Loaded MONGO_URI:",
  process.env.MONGO_URI ? "OK (value not shown)" : "MISSING!"
);
console.log(
  "WORKER ENV: Loaded REDIS_HOST:",
  process.env.REDIS_HOST || "127.0.0.1"
);
console.log("WORKER ENV: Loaded REDIS_PORT:", process.env.REDIS_PORT || "6379");
console.log(
  "WORKER ENV: Loaded DOCKER_CONTAINER_UID:",
  process.env.DOCKER_CONTAINER_UID || "1001"
);
console.log(
  "WORKER ENV: Loaded WORKER_CONCURRENCY:",
  process.env.WORKER_CONCURRENCY || "1"
);

// --- Node Modules ---
import fs from "fs/promises";
import os from "os";
import { spawn } from "child_process";

// --- BullMQ + Redis ---
import IORedis from "ioredis";
import { Worker } from "bullmq";

// --- Mongoose & Models ---
import mongoose from "mongoose";
import { Submission } from "../models/submission.model.js";
import { Problem } from "../models/problem.model.js";
import { Contest } from "../models/contest.model.js";
import { ContestScore } from "../models/contestScore.model.js";

// --- MongoDB Connection Function ---
import connectDB from "../database/db.js";

// --- Complexity Estimator ---
import {
  estimateTimeComplexity,
  estimateSpaceComplexity,
} from "../utils/complexityEstimator.js";

// --- Constants ---
const DOCKER_IMAGE_MAP = {
  cpp: "898465023886.dkr.ecr.ap-south-1.amazonaws.com/execution-engine-cpp",
  c: "898465023886.dkr.ecr.ap-south-1.amazonaws.com/execution-engine-c",
  java: "898465023886.dkr.ecr.ap-south-1.amazonaws.com/execution-engine-java",
  javascript:
    "898465023886.dkr.ecr.ap-south-1.amazonaws.com/execution-engine-nodejs",
  python: "898465023886.dkr.ecr.ap-south-1.amazonaws.com/execution-engine-python",
};

const REDIS_CONNECTION_OPTIONS_FOR_WORKER = {
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: parseInt(process.env.REDIS_PORT || "6379", 10),
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
};

// --- Helper Functions ---
const getCodeFileName = (language) => {
  switch (language.toLowerCase()) {
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
      throw new Error(`Unsupported language: ${language}`);
  }
};

const cleanupTempDir = async (dirPath) => {
  try {
    if (dirPath && (await fs.stat(dirPath).catch(() => false))) {
      await fs.rm(dirPath, { recursive: true, force: true });
    }
  } catch (err) {
    console.error(`Worker: Failed to clean temp dir ${dirPath}:`, err.message);
  }
};

function toDockerMountPath(winPath) {
  if (process.platform !== "win32") {
    return winPath;
  }
  let drive = winPath[0].toLowerCase();
  let tail = winPath.slice(2).replace(/\\/g, "/");
  if (winPath[1] !== ":") {
    console.warn(
      `toDockerMountPath: Received possibly non-standard Windows path: ${winPath}. Attempting direct use.`
    );
    return winPath;
  }
  return `/${drive}${tail}`;
}

const executeSingleTestCaseInDocker = async (
  language,
  code,
  stdin,
  timeLimitSec,
  memoryLimitKB,
  submissionIdForLog
) => {
  let tempDirHostOs = null;
  console.log(
    `WORKER_DEBUG (${submissionIdForLog}): Entered executeSingleTestCaseInDocker for lang ${language}`
  );
  try {
    tempDirHostOs = await fs.mkdtemp(
      path.join(
        os.tmpdir(),
        `sub-${submissionIdForLog.toString().slice(-6)}-exec-`
      )
    );
    console.log(
      `WORKER_DEBUG (${submissionIdForLog}): Created host tempDir: ${tempDirHostOs}`
    );

    const codeFileName = getCodeFileName(language);
    const codeFilePath = path.join(tempDirHostOs, codeFileName);
    const inputFilePath = path.join(tempDirHostOs, "input.txt");

    console.log(
      `WORKER_DEBUG (${submissionIdForLog}): Attempting to write code to: ${codeFilePath}`
    );
    await fs.writeFile(codeFilePath, code);
    console.log(
      `WORKER_SUCCESS (${submissionIdForLog}): Successfully wrote code to ${codeFilePath}`
    );

    try {
      const writtenCode = await fs.readFile(codeFilePath, "utf8");
      console.log(
        `WORKER_VERIFY (${submissionIdForLog}): Content of ${codeFilePath} (first 100 chars):\n${writtenCode.substring(
          0,
          100
        )}...`
      );
    } catch (readErr) {
      console.error(
        `WORKER_ERROR (${submissionIdForLog}): Failed to read back code file ${codeFilePath}:`,
        readErr
      );
    }

    console.log(
      `WORKER_DEBUG (${submissionIdForLog}): Attempting to write stdin to: ${inputFilePath}`
    );
    await fs.writeFile(inputFilePath, stdin || "");
    console.log(
      `WORKER_SUCCESS (${submissionIdForLog}): Successfully wrote stdin to ${inputFilePath}`
    );

    const dockerImage = DOCKER_IMAGE_MAP[language.toLowerCase()];
    if (!dockerImage) {
      console.error(
        `WORKER_ERROR (${submissionIdForLog}): Unsupported language or Docker image not mapped: ${language}`
      );
      return {
        scriptStatus: "INTERNAL_SYSTEM_ERROR",
        scriptTime: 0,
        scriptMemory: 0,
        scriptOutput: `Unsupported language: ${language}`,
        dockerRawStderr: "",
      };
    }
    console.log(
      `WORKER_DEBUG (${submissionIdForLog}): Using Docker image: ${dockerImage}`
    );

    const memoryLimitDocker = `${Math.max(
      32,
      Math.floor(memoryLimitKB / 1024)
    )}m`;
    const hostDirForMount = tempDirHostOs;
    console.log(
      `WORKER_DEBUG (${submissionIdForLog}): Host path for mount: ${hostDirForMount}`
    );

    const containerDir = "/sandbox";
    const dockerArgs = [
      "run",
      "--rm",
      "--network=none",
      `--user=${process.env.DOCKER_CONTAINER_UID || "1001"}`,
      `--memory=${memoryLimitDocker}`,
      `--memory-swap=${memoryLimitDocker}`,
      "--cpus=1.0",
      "--pids-limit=128",
      "--cap-drop=ALL",
      "-v",
      `${hostDirForMount}:${containerDir}`,
      dockerImage,
      String(timeLimitSec),
      String(memoryLimitKB),
    ];
    console.log(
      `WORKER_EXEC_COMMAND (${submissionIdForLog}): docker ${dockerArgs.join(
        " "
      )}`
    );

    return new Promise((resolve) => {
      const dockerProcess = spawn("docker", dockerArgs, {
        timeout: (timeLimitSec + 10) * 1000,
      });
      let rawStdout = "",
        rawStderr = "";
      if (dockerProcess.stdout) {
        dockerProcess.stdout.on("data", (data) => (rawStdout += data.toString()));
      } else {
        console.warn(
          `WORKER_WARN (${submissionIdForLog}): dockerProcess.stdout is null!`
        );
      }
      if (dockerProcess.stderr) {
        dockerProcess.stderr.on("data", (data) => (rawStderr += data.toString()));
      } else {
        console.warn(
          `WORKER_WARN (${submissionIdForLog}): dockerProcess.stderr is null!`
        );
      }
      dockerProcess.on("error", (err) => {
        console.error(
          `WORKER_ERROR (${submissionIdForLog}): Docker spawn error:`,
          err
        );
        resolve({
          scriptStatus: "DOCKER_SPAWN_ERROR",
          scriptTime: 0,
          scriptMemory: 0,
          scriptOutput: err.message,
          dockerRawStderr: rawStderr,
        });
      });
      dockerProcess.on("close", (code, signal) => {
        console.log(
          `WORKER_DEBUG (${submissionIdForLog}): Docker process closed. Code: ${code}, Signal: ${signal}`
        );
        console.log(
          `WORKER_RAW_STDOUT (${submissionIdForLog}):\n${rawStdout}`
        );
        console.log(
          `WORKER_RAW_STDERR (${submissionIdForLog}):\n${rawStderr}`
        );
        if (signal === "SIGTERM") {
          resolve({
            scriptStatus: "TIME_LIMIT_EXCEEDED_EXTERNAL",
            scriptTime: timeLimitSec,
            scriptMemory: 0,
            scriptOutput: "Execution surpassed external watchdog timeout.",
            dockerRawStderr: rawStderr,
          });
        } else if (code !== 0 && !rawStdout.trim()) {
          resolve({
            scriptStatus: "DOCKER_RUNTIME_ERROR",
            scriptTime: 0,
            scriptMemory: 0,
            scriptOutput: `Container exited code ${code} without script output. Check raw stderr.`,
            dockerRawStderr: rawStderr,
          });
        } else {
          const lines = rawStdout.trim().split("\n");
          resolve({
            scriptStatus: lines[0]?.trim() || "UNKNOWN_SCRIPT_OUTPUT",
            scriptTime: parseFloat(lines[1]?.trim()) || 0,
            scriptMemory: parseInt(lines[2]?.trim(), 10) || 0,
            scriptOutput: lines.slice(3).join("\n"),
            dockerRawStderr: rawStderr,
          });
        }
      });
    });
  } catch (error) {
    console.error(
      `WORKER_ERROR (${submissionIdForLog}): Outer catch in executeSingleTestCaseInDocker:`,
      error
    );
    return {
      scriptStatus: "INTERNAL_SYSTEM_ERROR",
      scriptTime: 0,
      scriptMemory: 0,
      scriptOutput: `Worker internal error during test case setup: ${error.message}`,
      dockerRawStderr: "",
    };
  } finally {
    if (tempDirHostOs) {
      // await cleanupTempDir(tempDirHostOs); // Re-enable for production
      console.log(
        `WORKER_DEBUG (${submissionIdForLog}): Skipping cleanup of ${tempDirHostOs} for debugging.`
      );
    }
  }
};

const processSubmissionJob = async (job) => {
  const { submissionId } = job.data;
  console.log(`Worker: Starting job ${job.id} for submission ${submissionId}`);

  let submission;
  try {
    submission = await Submission.findById(submissionId);
    if (!submission) {
      console.error(
        `Worker: Submission ${submissionId} not found for job ${job.id}.`
      );
      return;
    }
  } catch (e) {
    console.error(
      `Worker: Error fetching submission ${submissionId} for job ${job.id}:`,
      e
    );
    throw e;
  }

  let problem;
  try {
    problem = await Problem.findById(submission.problemId).select("+testCases");
    if (!problem) {
      console.error(
        `Worker: Problem ${submission.problemId} not found for submission ${submissionId}`
      );
      await Submission.findByIdAndUpdate(submissionId, {
        verdict: "Internal System Error",
        compileOutput: "Problem details not found.",
      });
      return;
    }
  } catch (e) {
    console.error(
      `Worker: Error fetching problem ${submission.problemId} for submission ${submissionId}:`,
      e
    );
    await Submission.findByIdAndUpdate(submissionId, {
      verdict: "Internal System Error",
      compileOutput: "Error fetching problem details.",
    });
    return;
  }

  await Submission.findByIdAndUpdate(submissionId, {
    verdict: "Compiling",
    testCaseResults: [],
    compileOutput: null,
    stderr: null,
    executionTime: 0,
    memoryUsed: 0,
    estimatedTimeComplexity: null,
    estimatedSpaceComplexity: null,
  });

  let overallVerdict = "Accepted";
  let maxTime = 0,
    maxMemory = 0;
  let finalCompileOutput = null,
    finalStderrForSubmission = null;
  const resultsForDB = [];

  // build test cases to run...
  let testCasesToRun;
  if (submission.submissionType === "run") {
    testCasesToRun = problem.testCases.filter((tc) => tc.isSample);
    if (submission.customInput && submission.customInput.trim().length) {
      testCasesToRun.push({
        input: submission.customInput,
        expectedOutput: null,
        isSample: false,
        isCustom: true,
      });
    }
  } else {
    testCasesToRun = problem.testCases;
  }

  if (!testCasesToRun.length) {
    console.warn(
      `Worker: No test cases to run for submission ${submissionId} (type: ${submission.submissionType}).`
    );
    await Submission.findByIdAndUpdate(submissionId, {
      verdict: "Internal System Error",
      compileOutput: "No test cases available for this run/submission type.",
    });
    return;
  }

  for (let i = 0; i < testCasesToRun.length; i++) {
    const tc = testCasesToRun[i];
    await Submission.findByIdAndUpdate(submissionId, {
      verdict: `Running Test Case ${i + 1}/${testCasesToRun.length}`,
    });
    const execResult = await executeSingleTestCaseInDocker(
      submission.language,
      submission.code,
      tc.input,
      problem.cpuTimeLimit || 2,
      problem.memoryLimit || 128000,
      submissionId
    );
    console.log(
      `WORKER_DEBUG (${submissionId}): execResult from Docker for TC ${i +
        1}:`,
      JSON.stringify(execResult, null, 2)
    );

    // compute input size
    let currentInputSize = 0;
    const inputString = tc.input?.trim() || "";
    try {
      const parsedInput = JSON.parse(inputString);
      if (Array.isArray(parsedInput)) {
        currentInputSize = parsedInput.length;
      } else if (typeof parsedInput === "string") {
        currentInputSize = parsedInput.length;
      } else if (typeof parsedInput === "number") {
        currentInputSize = Math.max(
          1,
          Math.floor(Math.log10(Math.abs(parsedInput)) + 1)
        );
      } else {
        currentInputSize = inputString.length;
      }
    } catch {
      currentInputSize = inputString.length;
    }
    currentInputSize = Math.max(1, currentInputSize);

    console.log(
      `WORKER_TC_INFO (${submissionId}): TC ${i + 1} - Status: ${execResult.scriptStatus}, InputSize: ${currentInputSize}, Time: ${execResult.scriptTime}, Memory: ${execResult.scriptMemory}`
    );

    maxTime = Math.max(maxTime, execResult.scriptTime || 0);
    maxMemory = Math.max(maxMemory, execResult.scriptMemory || 0);

    let tcStatus;
    let tcActualOutput = execResult.scriptOutput;

    if (tc.isCustom) {
      tcStatus = "Custom Output";
    } else {
      switch (execResult.scriptStatus) {
        case "COMPILATION_ERROR":
          tcStatus = "Compilation Error";
          finalCompileOutput = execResult.scriptOutput;
          if (overallVerdict === "Accepted") overallVerdict = "Compilation Error";
          if (!finalStderrForSubmission)
            finalStderrForSubmission = execResult.scriptOutput;
          break;
        case "DOCKER_SPAWN_ERROR":
        case "DOCKER_RUNTIME_ERROR":
        case "UNKNOWN_SCRIPT_OUTPUT":
        case "INTERNAL_SYSTEM_ERROR":
          tcStatus = "Internal System Error";
          if (overallVerdict === "Accepted")
            overallVerdict = "Internal System Error";
          if (!finalStderrForSubmission)
            finalStderrForSubmission =
              execResult.scriptOutput +
              (execResult.dockerRawStderr
                ? `\nDocker stderr: ${execResult.dockerRawStderr}`
                : "");
          break;
        case "TIME_LIMIT_EXCEEDED_EXTERNAL":
        case "TIME_LIMIT_EXCEEDED":
          tcStatus = "Time Limit Exceeded";
          if (overallVerdict === "Accepted")
            overallVerdict = "Time Limit Exceeded";
          if (!finalStderrForSubmission)
            finalStderrForSubmission =
              execResult.scriptOutput || "Execution timed out.";
          maxTime = Math.max(maxTime, problem.cpuTimeLimit || 2);
          break;
        case "MEMORY_LIMIT_EXCEEDED":
          tcStatus = "Memory Limit Exceeded";
          if (overallVerdict === "Accepted")
            overallVerdict = "Memory Limit Exceeded";
          if (!finalStderrForSubmission)
            finalStderrForSubmission =
              execResult.scriptOutput || "Memory limit exceeded.";
          break;
        case "RUNTIME_ERROR":
          tcStatus = "Runtime Error";
          if (overallVerdict === "Accepted") overallVerdict = "Runtime Error";
          if (!finalStderrForSubmission)
            finalStderrForSubmission = execResult.scriptOutput;
          break;
        case "EXECUTED_SUCCESSFULLY":
          {
            const userOutputTrimmed = (tcActualOutput || "")
              .trim()
              .replace(/\r\n/g, "\n");
            const expectedOutputTrimmed = (tc.expectedOutput || "")
              .trim()
              .replace(/\r\n/g, "\n");
            if (userOutputTrimmed === expectedOutputTrimmed) {
              tcStatus = "Accepted";
            } else {
              tcStatus = "Wrong Answer";
              if (overallVerdict === "Accepted") overallVerdict = "Wrong Answer";
              if (!finalStderrForSubmission)
                finalStderrForSubmission = `Output Mismatch on Test Case ${i +
                  1}:\nExpected:\n'${expectedOutputTrimmed}'\nGot:\n'${userOutputTrimmed}'`;
            }
          }
          break;
        default:
          tcStatus = "Internal System Error";
          if (overallVerdict === "Accepted")
            overallVerdict = "Internal System Error";
          if (!finalStderrForSubmission)
            finalStderrForSubmission = `Unknown script status: ${execResult.scriptStatus}. Output: ${execResult.scriptOutput}`;
      }
    }

    resultsForDB.push({
      input: tc.input,
      expectedOutput: tc.isCustom ? null : tc.expectedOutput,
      actualOutput: tcActualOutput,
      status: tcStatus,
      time: execResult.scriptTime || 0,
      memory: execResult.scriptMemory || 0,
      inputSize: currentInputSize,
      isSample: !!tc.isSample,
      isCustom: !!tc.isCustom,
    });

    if (
      overallVerdict === "Compilation Error" ||
      (submission.submissionType === "submit" && overallVerdict !== "Accepted")
    ) {
      break;
    }
  }

  if (
    submission.submissionType === "run" &&
    overallVerdict === "Accepted" &&
    !finalCompileOutput
  ) {
    overallVerdict = "Partial - Sample Run";
  }

  let estimatedTC = null,
    estimatedSC = null;
  if (
    submission.submissionType === "submit" &&
    overallVerdict === "Accepted" &&
    resultsForDB.length >= 3
  ) {
    try {
      estimatedTC = estimateTimeComplexity(resultsForDB);
      estimatedSC = estimateSpaceComplexity(resultsForDB);
      console.log(
        `WORKER_COMPLEXITY (${submissionId}): Estimated TC: ${estimatedTC}, Estimated SC: ${estimatedSC}`
      );
    } catch (estimationError) {
      console.error(
        `WORKER_ERROR (${submissionId}): Failed to estimate complexity:`,
        estimationError
      );
    }
  }

  // --- (Optional) Contest Scoring Logic ---
  if (submission.contestId && submission.submissionType === "submit") {
    console.log(
      `WORKER_CONTEST (${submissionId}): Processing contest score for contest ${submission.contestId}`
    );
    try {
      const contest = await Contest.findById(submission.contestId);
      // … your contest scoring updates …
    } catch (contestScoreError) {
      console.error(
        `Worker (contest scoring) failed for submission ${submissionId}:`,
        contestScoreError
      );
    }
  }

  const finalUpdateData = {
    verdict: overallVerdict,
    testCaseResults: resultsForDB,
    compileOutput: finalCompileOutput,
    executionTime: maxTime,
    memoryUsed: maxMemory,
    ...(finalStderrForSubmission &&
      !["Accepted", "Partial - Sample Run", "Wrong Answer"].includes(
        overallVerdict
      ) && { stderr: finalStderrForSubmission }),
    ...(estimatedTC != null && { estimatedTimeComplexity: estimatedTC }),
    ...(estimatedSC != null && { estimatedSpaceComplexity: estimatedSC }),
  };

  await Submission.findByIdAndUpdate(submissionId, finalUpdateData);
  console.log(
    `✅ Updated submission ${submissionId} with verdict: ${overallVerdict}`
  );
};

const isMainModule =
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  (async () => {
    try {
      await connectDB();
      console.log("✅ Worker successfully connected to MongoDB.");
      mongoose.connection.on("connected", () =>
        console.log("WORKER MONGO: Mongoose reconnected!")
      );
      mongoose.connection.on("error", (err) =>
        console.error("WORKER MONGO: Mongoose connection error:", err)
      );
      mongoose.connection.on("disconnected", () =>
        console.warn("WORKER MONGO: Mongoose disconnected!")
      );
      mongoose.connection.on("close", () =>
        console.warn("WORKER MONGO: Mongoose connection closed.")
      );

      console.log("✅ Initializing BullMQ Worker…");
      const worker = new Worker(
        "submission-processing",
        processSubmissionJob,
        {
          connection: new IORedis(REDIS_CONNECTION_OPTIONS_FOR_WORKER),
          concurrency: parseInt(process.env.WORKER_CONCURRENCY || "1", 10),
        }
      );
      worker.on("completed", (job) =>
        console.log(
          `✅ Job ${job.id} (submission ${job.data.submissionId}) completed.`
        )
      );
      worker.on("failed", (job, err) => {
        console.error(
          `❌ Job ${job.id} (submission ${job.data.submissionId}) failed: ${err.message}`,
          err
        );
        Submission.findByIdAndUpdate(job.data.submissionId, {
          verdict: "Internal System Error",
          stderr: `Worker job processing failed: ${err.message}`,
        }).catch((updateErr) =>
          console.error(
            "Error updating submission on worker job failure:",
            updateErr
          )
        );
      });
      worker.on("error", (err) =>
        console.error("❌ Worker instance encountered an error:", err)
      );

      console.log(
        `✅ Submission Worker listening on 'submission-processing' (concurrency ${process.env.WORKER_CONCURRENCY ||
          "1"}).`
      );

      const gracefulShutdown = async (signal) => {
        console.log(`🛑 Received ${signal}, shutting down…`);
        try {
          await worker.close();
          console.log("Worker closed gracefully.");
        } catch (e) {
          console.error("Error during worker shutdown:", e);
        }
        try {
          if (mongoose.connection.readyState === 1) {
            await mongoose.disconnect();
            console.log("Mongoose disconnected on shutdown.");
          }
        } catch (e) {
          console.error("Error disconnecting mongoose:", e);
        }
        process.exit(0);
      };
      process.on("SIGINT", () => gracefulShutdown("SIGINT"));
      process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
    } catch (startupError) {
      console.error(
        "❌ FATAL ERROR during worker startup (DB or BullMQ):",
        startupError
      );
      if (
        mongoose.connection &&
        [1, 2].includes(mongoose.connection.readyState)
      ) {
        await mongoose.disconnect().catch((e) =>
          console.error("Error disconnecting mongoose on startup fail:", e)
        );
      }
      process.exit(1);
    }
  })();
}
