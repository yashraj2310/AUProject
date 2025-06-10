// server-side/src/workers/submissionWorker.js

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import fs from 'fs/promises';
import os from 'os';
import Docker from 'dockerode';
import IORedis from 'ioredis';
import { Worker } from 'bullmq';
import mongoose from 'mongoose';

// Models & Utils
import connectDB from '../database/db.js';
import { Submission } from '../models/submission.model.js';
import { Problem } from '../models/problem.model.js';
import { Contest } from '../models/contest.model.js';
import { ContestScore } from '../models/contestScore.model.js';
import {
  estimateTimeComplexity,
  estimateSpaceComplexity,
} from '../utils/complexityEstimator.js';

// ── Load ENV ─────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

console.log(
  'WORKER ENV: Loaded MONGO_URI:',
  process.env.MONGO_URI ? 'OK (value not shown)' : 'MISSING!'
);
console.log('WORKER ENV: Loaded REDIS_HOST:', process.env.REDIS_HOST || '127.0.0.1');
console.log('WORKER ENV: Loaded REDIS_PORT:', process.env.REDIS_PORT || '6379');
console.log(
  'WORKER ENV: Loaded DOCKER_CONTAINER_UID:',
  process.env.DOCKER_CONTAINER_UID || '1001'
);
console.log(
  'WORKER ENV: Loaded WORKER_CONCURRENCY:',
  process.env.WORKER_CONCURRENCY || '1'
);

// ── Dockerode Client ────────────────────────────────
const docker = new Docker({ socketPath: '/var/run/docker.sock' });

// ── Redis Connection Options ─────────────────────────
const REDIS_CONN_OPTS = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
};

// ── Docker Image Map ─────────────────────────────────
const DOCKER_IMAGE_MAP = {
  cpp: '898465023886.dkr.ecr.ap-south-1.amazonaws.com/execution-engine-cpp',
  c: '898465023886.dkr.ecr.ap-south-1.amazonaws.com/execution-engine-c',
  java: '898465023886.dkr.ecr.ap-south-1.amazonaws.com/execution-engine-java',
  javascript:
    '898465023886.dkr.ecr.ap-south-1.amazonaws.com/execution-engine-nodejs',
  python:
    '898465023886.dkr.ecr.ap-south-1.amazonaws.com/execution-engine-python',
};

// ── Helpers ──────────────────────────────────────────
const getCodeFileName = (lang) => {
  switch (lang.toLowerCase()) {
    case 'cpp': return 'Main.cpp';
    case 'c': return 'Main.c';
    case 'java': return 'Main.java';
    case 'python': return 'script.py';
    case 'javascript': return 'script.js';
    default: throw new Error(`Unsupported language: ${lang}`);
  }
};

// ── Core: execute test case in Docker via Dockerode ──
async function executeSingleTestCaseInDocker(
  language,
  code,
  stdin,
  timeLimitSec,
  memoryLimitKB,
  submissionIdForLog
) {
  let tempDir;
  try {
    // 1) Create temp directory and write files
    tempDir = await fs.mkdtemp(
      path.join(os.tmpdir(), `sub-${submissionIdForLog.toString().slice(-6)}-exec-`)
    );
    const codeFile = path.join(tempDir, getCodeFileName(language));
    const inputFile = path.join(tempDir, 'input.txt');

    await fs.writeFile(codeFile, code);
    await fs.writeFile(inputFile, stdin || '');

    // 2) Docker image & resource limits
    const image = DOCKER_IMAGE_MAP[language.toLowerCase()];
    if (!image) {
      return {
        scriptStatus: 'INTERNAL_SYSTEM_ERROR',
        scriptTime: 0,
        scriptMemory: 0,
        scriptOutput: `Unsupported language: ${language}`,
        dockerRawStderr: '',
      };
    }
    const memBytes = memoryLimitKB * 1024;

    // 3) Create container
    const container = await docker.createContainer({
      Image: image,
      HostConfig: {
        AutoRemove: true,
        NetworkMode: 'none',
        Memory: memBytes,
        MemorySwap: memBytes,
        PidsLimit: 128,
        Binds: [`${tempDir}:/sandbox:ro`],
        User: process.env.DOCKER_CONTAINER_UID || '1001',
      },
      WorkingDir: '/sandbox',
      Cmd: [String(timeLimitSec), String(memoryLimitKB)],
    });

    // 4) Start & attach
    await container.start();
    const stream = await container.attach({ stream: true, stdout: true, stderr: true });
    let rawOutput = '';
    stream.on('data', (chunk) => { rawOutput += chunk.toString(); });

    // 5) Wait for finish
    await container.wait();

    // 6) Parse output lines
    const lines = rawOutput.trim().split('\n');
    return {
      scriptStatus:   lines[0]?.trim()   || 'UNKNOWN_SCRIPT_OUTPUT',
      scriptTime:     parseFloat(lines[1]?.trim()   || '0'),
      scriptMemory:   parseInt(lines[2]?.trim()   || '0', 10),
      scriptOutput:   lines.slice(3).join('\n'),
      dockerRawStderr: '',
    };

  } catch (err) {
    console.error(
      `WORKER_ERROR (${submissionIdForLog}): Dockerode error:`,
      err
    );
    return {
      scriptStatus: 'DOCKER_RUNTIME_ERROR',
      scriptTime: 0,
      scriptMemory: 0,
      scriptOutput: err.message,
      dockerRawStderr: '',
    };
  } finally {
    // Optional: cleanup tempDir
  }
}

// ── Process Submission Job ───────────────────────────
async function processSubmissionJob(job) {
  const { submissionId } = job.data;
  console.log(`Worker: Starting job ${job.id} for submission ${submissionId}`);

  // Fetch submission & problem (unchanged)...
  const submission = await Submission.findById(submissionId);
  const problem    = await Problem.findById(submission.problemId).select('+testCases');

  // Initialize DB update for compile/run
  await Submission.findByIdAndUpdate(submissionId, {
    verdict: 'Compiling',
    testCaseResults: [],
    compileOutput: null,
    stderr: null,
    executionTime: 0,
    memoryUsed: 0,
  });

  let overallVerdict = 'Accepted';
  let maxTime = 0, maxMemory = 0;
  let finalCompileOutput = null, finalStderr = null;
  const results = [];

  // Choose test cases (sample vs full)...
  const testCases = submission.submissionType === 'run'
    ? problem.testCases.filter(tc => tc.isSample)
    : problem.testCases;

  for (let i = 0; i < testCases.length; ++i) {
    const tc = testCases[i];
    await Submission.findByIdAndUpdate(submissionId, {
      verdict: `Running Test Case ${i+1}/${testCases.length}`
    });

    const execRes = await executeSingleTestCaseInDocker(
      submission.language,
      submission.code,
      tc.input,
      problem.cpuTimeLimit || 2,
      problem.memoryLimit    || 128000,
      submissionId
    );

    maxTime   = Math.max(maxTime, execRes.scriptTime);
    maxMemory = Math.max(maxMemory, execRes.scriptMemory);

    // Determine status & handle errors (same logic as before)
    let status;
    switch (execRes.scriptStatus) {
      case 'COMPILATION_ERROR':
        status = 'Compilation Error';
        finalCompileOutput = execRes.scriptOutput;
        overallVerdict = 'Compilation Error';
        finalStderr = execRes.scriptOutput;
        break;
      case 'DOCKER_RUNTIME_ERROR':
        status = 'Internal System Error';
        overallVerdict = 'Internal System Error';
        finalStderr = execRes.scriptOutput;
        break;
      case 'EXECUTED_SUCCESSFULLY':
        {
          const out = execRes.scriptOutput.trim();
          const exp = (tc.expectedOutput||'').trim();
          status = out === exp ? 'Accepted' : 'Wrong Answer';
          if (status === 'Wrong Answer') {
            overallVerdict = 'Wrong Answer';
            finalStderr = `Expected \`${exp}\` but got \`${out}\``;
          }
        }
        break;
      default:
        status = 'Internal System Error';
        overallVerdict = 'Internal System Error';
        finalStderr = execRes.scriptOutput;
    }

    results.push({
      input: tc.input,
      expectedOutput: tc.expectedOutput,
      actualOutput: execRes.scriptOutput,
      status,
      time: execRes.scriptTime,
      memory: execRes.scriptMemory,
      isSample: tc.isSample,
    });

    if (overallVerdict !== 'Accepted') break;
  }

  // Finalize verdict & update DB
  const update = {
    verdict: overallVerdict,
    testCaseResults: results,
    executionTime: maxTime,
    memoryUsed: maxMemory,
    ...(finalCompileOutput && { compileOutput: finalCompileOutput }),
    ...(finalStderr && { stderr: finalStderr }),
  };
  await Submission.findByIdAndUpdate(submissionId, update);
  console.log(`✅ Updated submission ${submissionId} -> ${overallVerdict}`);
}

// ── Worker Bootstrapping ─────────────────────────────
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  (async () => {
    await connectDB();
    const worker = new Worker('submission-processing', processSubmissionJob, {
      connection: new IORedis(REDIS_CONN_OPTS),
      concurrency: parseInt(process.env.WORKER_CONCURRENCY || '1', 10),
    });
    worker.on('completed', job =>
      console.log(`✅ Job ${job.id} completed for submission ${job.data.submissionId}`)
    );
    worker.on('failed', (job, err) =>
      console.error(`❌ Job ${job.id} failed:`, err)
    );
  })();
}
