// server/src/queues/submissionQueue.js
import { Queue } from 'bullmq';
import IORedis from 'ioredis';

export const REDIS_CONNECTION_OPTIONS = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  maxRetriesPerRequest: null, 
  enableReadyCheck: false 
};

// Create the queue instance.

export const submissionProcessingQueue = new Queue('submission-processing', {
  connection: new IORedis(REDIS_CONNECTION_OPTIONS) // Each queue instance should have its own client for BullMQ v3+
});

submissionProcessingQueue.on('error', err => {
  console.error(`BullMQ Queue ('submission-processing') Error:`, err);
});

console.log("BullMQ 'submission-processing' queue initialized and connected to Redis.");

