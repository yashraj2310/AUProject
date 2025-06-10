// server-side/src/workers/submissionWorker.js

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import fs from 'fs/promises';
import os from 'os';
import Docker from 'dockerode';
import IORedis from 'ioredis';
import { Worker } from 'bullmq';
import { PassThrough } from 'stream';

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

console.log('🚀 Submission worker using Dockerode initialized');
console.log('WORKER ENV: Loaded MONGO_URI:', process.env.MONGO_URI ? 'OK' : 'MISSING!');
console.log('WORKER ENV: Loaded REDIS_HOST:', process.env.REDIS_HOST);
console.log('WORKER ENV: Loaded REDIS_PORT:', process.env.REDIS_PORT);
console.log('WORKER ENV: Loaded DOCKER_CONTAINER_UID:', process.env.DOCKER_CONTAINER_UID);
console.log('WORKER ENV: Loaded WORKER_CONCURRENCY:', process.env.WORKER_CONCURRENCY);

// ── Dockerode Client ────────────────────────────────
const docker = new Docker({ socketPath: '/var/run/docker.sock' });

// ── Redis Connection Options ─────────────────────────
const REDIS_CONN_OPTS = {
  host: process.env.REDIS_HOST,
  port: parseInt(process.env.REDIS_PORT, 10),
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
function getCodeFileName(lang) {
  switch (lang.toLowerCase()) {
    case 'cpp': return 'Main.cpp';
    case 'c': return 'Main.c';
    case 'java': return 'Main.java';
    case 'python': return 'script.py';
    case 'javascript': return 'script.js';
    default: throw new Error(`Unsupported language: ${lang}`);
  }
}

// ── Core: execute test case via Dockerode ────────────
async function executeSingleTestCaseInDocker(
  language,
  code,
  stdin,
  timeLimitSec,
  memoryLimitKB,
  submissionIdForLog
) {
  let tempDir;
  let container;
  try {
    // Setup workspace
    tempDir = await fs.mkdtemp(
      path.join(os.tmpdir(), `sub-${submissionIdForLog.toString().slice(-6)}-exec-`)
    );
    const codeFile = path.join(tempDir, getCodeFileName(language));
    const inputFile = path.join(tempDir, 'input.txt');
    await fs.writeFile(codeFile, code);
    await fs.writeFile(inputFile, stdin || '');

    // Select image and limits
    const image = DOCKER_IMAGE_MAP[language.toLowerCase()];
    if (!image) throw new Error(`Unsupported language: ${language}`);
    const memBytes = memoryLimitKB * 1024;

    // Create container (keep container around until cleanup)
    container = await docker.createContainer({
      Image: image,
      HostConfig: {
        AutoRemove: false,
        NetworkMode: 'none',
        Memory: memBytes,
        MemorySwap: memBytes,
        PidsLimit: 128,
        Binds: [`${tempDir}:/sandbox`],
        User: process.env.DOCKER_CONTAINER_UID,
      },
      WorkingDir: '/sandbox',
      Cmd: [String(timeLimitSec), String(memoryLimitKB)],
    });

    // Start & attach multiplexed stream
    await container.start();
    const stream = await container.attach({ stream: true, stdout: true, stderr: true });

    const stdout = new PassThrough();
    const stderr = new PassThrough();
    container.modem.demuxStream(stream, stdout, stderr);

    let rawOutput = '';
    stdout.on('data', chunk => rawOutput += chunk.toString());

    await container.wait();

    // Parse output
    const lines = rawOutput.split('\n');
    const statusLine = (lines[0] || '').trim() || 'UNKNOWN';
    let scriptTime = parseFloat((lines[1] || '').trim());
    let scriptMemory = parseInt((lines[2] || '').trim(), 10);
    if (isNaN(scriptTime)) scriptTime = 0;
    if (isNaN(scriptMemory)) scriptMemory = 0;
    const scriptOutput = lines.slice(3).join('\n');

    return { scriptStatus: statusLine, scriptTime, scriptMemory, scriptOutput, dockerRawStderr: '' };
  } catch (err) {
    console.error(`WORKER_ERROR (${submissionIdForLog}):`, err);
    return { scriptStatus: 'DOCKER_RUNTIME_ERROR', scriptTime: 0, scriptMemory: 0, scriptOutput: err.message, dockerRawStderr: '' };
  } finally {
    // Cleanup container and tempDir
    if (container) {
      try { await container.remove({ force: true }); } catch {};
    }
    if (tempDir) {
      try { await fs.rm(tempDir, { recursive: true, force: true }); } catch {};
    }
  }
}

// ── Process Submission Job ───────────────────────────
async function processSubmissionJob(job) {
  const { submissionId } = job.data;
  console.log(`Worker: Starting job ${job.id} for submission ${submissionId}`);

  const submission = await Submission.findById(submissionId);
  const problem = await Problem.findById(submission.problemId).select('+testCases');

  await Submission.findByIdAndUpdate(submissionId, {
    verdict: 'Compiling',
    testCaseResults: [],
    compileOutput: null,
    stderr: null,
    executionTime: 0,
    memoryUsed: 0,
  });

  let overallVerdict = 'Accepted';
  let maxTime = 0;
  let maxMemory = 0;
  let finalCompile = null;
  let finalErr = null;
  const results = [];

  const testCases =
    submission.submissionType === 'run'
      ? problem.testCases.filter(tc => tc.isSample)
      : problem.testCases;

  for (let i = 0; i < testCases.length; ++i) {
    const tc = testCases[i];
    await Submission.findByIdAndUpdate(submissionId, {
      verdict: `Running Test Case ${i + 1}/${testCases.length}`,
    });

    const res = await executeSingleTestCaseInDocker(
      submission.language,
      submission.code,
      tc.input,
      problem.cpuTimeLimit || 2,
      problem.memoryLimit || 128000,
      submissionId
    );

    maxTime = Math.max(maxTime, res.scriptTime);
    maxMemory = Math.max(maxMemory, res.scriptMemory);

    let status;
    if (res.scriptStatus === 'COMPILATION_ERROR') {
      status = 'Compilation Error';
      overallVerdict = 'Compilation Error';
      finalCompile = res.scriptOutput;
      finalErr = res.scriptOutput;
    } else if (res.scriptStatus === 'DOCKER_RUNTIME_ERROR') {
      status = 'Internal System Error';
      overallVerdict = 'Internal System Error';
      finalErr = res.scriptOutput;
    } else if (res.scriptStatus === 'EXECUTED_SUCCESSFULLY') {
      const out = res.scriptOutput.trim();
      const exp = (tc.expectedOutput || '').trim();
      status = out === exp ? 'Accepted' : 'Wrong Answer';
      if (status === 'Wrong Answer') {
        overallVerdict = 'Wrong Answer';
        finalErr = `Expected \`${exp}\` but got \`${out}\``;
      }
    } else {
      status = 'Internal System Error';
      overallVerdict = 'Internal System Error';
      finalErr = res.scriptOutput;
    }

    results.push({
      input: tc.input,
      expectedOutput: tc.expectedOutput,
      actualOutput: res.scriptOutput,
      status,
      time: res.scriptTime,
      memory: res.scriptMemory,
      isSample: tc.isSample,
      isCustom: tc.isCustom,
    });

    if (overallVerdict !== 'Accepted') break;
  }

  const updateData = {
    verdict: overallVerdict,
    testCaseResults: results,
    executionTime: maxTime,
    memoryUsed: maxMemory,
  }; 
  if (finalCompile) updateData.compileOutput = finalCompile;
  if (finalErr)     updateData.stderr        = finalErr;

  await Submission.findByIdAndUpdate(submissionId, updateData);

  console.log(`✅ Updated submission ${submissionId} -> ${overallVerdict}`);
}

// ── Bootstrapping ────────────────────────────────────
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  (async () => {
    await connectDB();
    const worker = new Worker(
      'submission-processing',
      processSubmissionJob,
      { connection: new IORedis(REDIS_CONN_OPTS), concurrency: parseInt(process.env.WORKER_CONCURRENCY, 10) }
    );
    worker.on('completed', job =>
      console.log(`✅ Job ${job.id} completed for submission ${job.data.submissionId}`)
    );
    worker.on('failed', (job, err) =>
      console.error(`❌ Job ${job.id} failed:`, err)
    );
  })();
}
