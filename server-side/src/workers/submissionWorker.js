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

// Models
import connectDB from '../database/db.js';
import { Submission } from '../models/submission.model.js';
import { Problem } from '../models/problem.model.js';

// ── Load ENV ─────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

console.log('🚀 Submission worker using Dockerode initialized');
console.log('WORKER ENV: Loaded MONGO_URI:', process.env.MONGO_URI ? 'OK (value not shown)' : 'MISSING!');
console.log('WORKER ENV: Loaded REDIS_HOST:', process.env.REDIS_HOST || '127.0.0.1');
console.log('WORKER ENV: Loaded REDIS_PORT:', process.env.REDIS_PORT || '6379');
console.log('WORKER ENV: Loaded DOCKER_CONTAINER_UID:', process.env.DOCKER_CONTAINER_UID || '1001');
console.log('WORKER ENV: Loaded WORKER_CONCURRENCY:', process.env.WORKER_CONCURRENCY || '1');

// ── Dockerode & Redis Setup ────────────────────────────
const docker = new Docker({ socketPath: '/var/run/docker.sock' });
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
  javascript: '898465023886.dkr.ecr.ap-south-1.amazonaws.com/execution-engine-nodejs',
  python: '898465023886.dkr.ecr.ap-south-1.amazonaws.com/execution-engine-python',
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
    // 1) Create temp directory for this execution
    tempDir = await fs.mkdtemp(
      path.join(os.tmpdir(), `sub-${submissionIdForLog.toString().slice(-6)}-exec-`)
    );
    const codeFileName = getCodeFileName(language);
    const codeFile = path.join(tempDir, codeFileName);
    const inputFile = path.join(tempDir, 'input.txt');

    await fs.writeFile(codeFile, code);
    await fs.writeFile(inputFile, stdin || '');

    // 2) Select Docker image and define resource limits
    const image = DOCKER_IMAGE_MAP[language.toLowerCase()];
    if (!image) {
      return { scriptStatus: 'INTERNAL_SYSTEM_ERROR', scriptTime: 0, scriptMemory: 0, scriptOutput: `Unsupported language: ${language}` };
    }
    const memBytes = memoryLimitKB * 1024;

    // 3) Create container
    const container = await docker.createContainer({
      Image: image,
      HostConfig: {
        AutoRemove: true, // Let Docker clean up the container itself after it stops
        NetworkMode: 'none',
        Memory: memBytes,
        MemorySwap: memBytes,
        PidsLimit: 128,
        Binds: [`${tempDir}:/sandbox`],
        User: process.env.DOCKER_CONTAINER_UID || '1001',
      },
      WorkingDir: '/sandbox',
      // FIX #1: Pass the filename as the 3rd argument to the entrypoint script
      Cmd: [String(timeLimitSec), String(memoryLimitKB), codeFileName],
    });

    // 4) Attach to streams and start the container
    const stream = await container.attach({ stream: true, stdout: true, stderr: true });
    let rawOutput = '';
    stream.on('data', (chunk) => { rawOutput += chunk.toString('utf8'); });

    await container.start();
    await container.wait(); // Wait for the container to finish execution

    // FIX #2: Use a robust separator for parsing, NOT split('\n')
    const separator = '---|||---';
    const parts = rawOutput.split(separator);

    if (parts.length < 2) {
      console.error(`WORKER_ERROR (${submissionIdForLog}): Invalid output format from container. Raw output: ${rawOutput}`);
      return { scriptStatus: 'INTERNAL_SYSTEM_ERROR', scriptTime: 0, scriptMemory: 0, scriptOutput: `Container failed. Log: ${rawOutput.slice(0, 500)}` };
    }

    const metadata = parts[0].trim().split('\n');
    const scriptOutput = parts[1]; // This is the user's stdout or stderr

    const statusLine = (metadata[0] || 'UNKNOWN_SCRIPT_OUTPUT').trim();
    const scriptTime = parseFloat(metadata[1] || '0');
    const scriptMemory = parseInt(metadata[2] || '0', 10);

    return {
      scriptStatus: statusLine,
      scriptTime: isNaN(scriptTime) ? 0 : scriptTime,
      scriptMemory: isNaN(scriptMemory) ? 0 : scriptMemory,
      scriptOutput,
    };

  } catch (err) {
    console.error(`WORKER_ERROR (${submissionIdForLog}): Dockerode error:`, err);
    return { scriptStatus: 'DOCKER_RUNTIME_ERROR', scriptTime: 0, scriptMemory: 0, scriptOutput: err.message };
  } finally {
    // FIX #4: Always clean up the temporary directory on the host machine
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(err => {
        console.error(`WORKER_ERROR (${submissionIdForLog}): Failed to cleanup temp dir ${tempDir}:`, err);
      });
    }
  }
}

// ── Process Submission Job ───────────────────────────
async function processSubmissionJob(job) {
  const { submissionId } = job.data;
  console.log(`Worker: Starting job ${job.id} for submission ${submissionId}`);

  const submission = await Submission.findById(submissionId);
  if (!submission) { console.error(`Submission ${submissionId} not found.`); return; }
  const problem = await Problem.findById(submission.problemId).select('+testCases');
  if (!problem) {
    await Submission.findByIdAndUpdate(submissionId, { verdict: 'Internal System Error', stderr: 'Problem data not found.' });
    return;
  }
  
  await Submission.findByIdAndUpdate(submissionId, { verdict: 'Running...', testCaseResults: [] });

  let overallVerdict = 'Accepted';
  let maxTime = 0, maxMemory = 0;
  let finalCompileOutput = null, finalStderr = null;
  const results = [];
  let stopExecution = false;

  const testCases = submission.submissionType === 'run' ? problem.testCases.filter(tc => tc.isSample) : problem.testCases;

  for (let i = 0; i < testCases.length; i++) {
    const tc = testCases[i];
    await Submission.findByIdAndUpdate(submissionId, { verdict: `Running on Test Case ${i + 1}` });

    const execRes = await executeSingleTestCaseInDocker(
      submission.language,
      submission.code,
      tc.input,
      problem.cpuTimeLimit || 2,
      problem.memoryLimit || 256000, // 256MB in KB
      submissionId
    );

    maxTime = Math.max(maxTime, execRes.scriptTime);
    maxMemory = Math.max(maxMemory, execRes.scriptMemory);
    
    let status;
    // FIX #3: Expand the switch statement to handle all verdicts from the script
    switch (execRes.scriptStatus) {
      case 'EXECUTED_SUCCESSFULLY':
        const actualOutput = execRes.scriptOutput.trim().replace(/\r\n/g, '\n');
        const expectedOutput = (tc.expectedOutput || '').trim().replace(/\r\n/g, '\n');
        if (actualOutput === expectedOutput) {
          status = 'Accepted';
        } else {
          status = 'Wrong Answer';
          overallVerdict = 'Wrong Answer';
          finalStderr = `Test Case #${i + 1}:\nExpected: \`${expectedOutput.slice(0,200)}\`\nGot: \`${actualOutput.slice(0,200)}\``;
          stopExecution = true;
        }
        break;

      case 'COMPILATION_ERROR':
        status = 'Compilation Error';
        overallVerdict = 'Compilation Error';
        finalCompileOutput = execRes.scriptOutput;
        finalStderr = execRes.scriptOutput;
        stopExecution = true;
        break;

      case 'RUNTIME_ERROR':
        status = 'Runtime Error';
        overallVerdict = 'Runtime Error';
        finalStderr = execRes.scriptOutput;
        stopExecution = true;
        break;

      case 'TIME_LIMIT_EXCEEDED':
        status = 'Time Limit Exceeded';
        overallVerdict = 'Time Limit Exceeded';
        finalStderr = `Exceeded time limit of ${problem.cpuTimeLimit}s on Test Case #${i + 1}.`;
        stopExecution = true;
        break;

      case 'MEMORY_LIMIT_EXCEEDED':
        status = 'Memory Limit Exceeded';
        overallVerdict = 'Memory Limit Exceeded';
        finalStderr = `Exceeded memory limit of ${problem.memoryLimit}KB on Test Case #${i + 1}.`;
        stopExecution = true;
        break;
      
      default: // Catches DOCKER_RUNTIME_ERROR, INTERNAL_SYSTEM_ERROR, etc.
        status = 'Internal System Error';
        overallVerdict = 'Internal System Error';
        finalStderr = execRes.scriptOutput;
        stopExecution = true;
        break;
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

    if (stopExecution) break;
  }

  // Remove unused imports to clean up the code
  const { ContestScore, Contest, estimateTimeComplexity, estimateSpaceComplexity, ..._ } = {};

  const update = {
    verdict: overallVerdict,
    testCaseResults: results,
    executionTime: maxTime,
    memoryUsed: maxMemory,
    ...(finalCompileOutput && { compileOutput: finalCompileOutput }),
    ...(finalStderr && { stderr: finalStderr }),
  };
  await Submission.findByIdAndUpdate(submissionId, update);
  console.log(`✅ Updated submission ${submissionId} with verdict: ${overallVerdict}`);
}

// ── Worker Bootstrapping ─────────────────────────────
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  (async () => {
    await connectDB();
    const worker = new Worker('submission-processing', processSubmissionJob, {
      connection: new IORedis(REDIS_CONN_OPTS),
      concurrency: parseInt(process.env.WORKER_CONCURRENCY || '1', 10),
    });
    worker.on('completed', job => console.log(`✅ Job ${job.id} completed for submission ${job.data.submissionId}`));
    worker.on('failed', (job, err) => console.error(`❌ Job ${job.id} for submission ${job.data.submissionId} failed:`, err));
  })();
}