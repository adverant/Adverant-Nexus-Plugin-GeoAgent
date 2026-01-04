/**
 * GeoAgent Worker (Node.js)
 *
 * BullMQ consumer for HyperModal geospatial processing jobs.
 * Processes jobs from 'geoagent-hypermodal' queue.
 *
 * Architecture:
 * - Consumes BullMQ jobs (Redis-backed)
 * - Downloads files from MinIO
 * - Calls ML service for advanced processing
 * - Calls Go binary subprocess for heavy computation (future)
 * - Stores results in PostgreSQL + GraphRAG
 *
 * Based on VideoAgent worker-node pattern.
 */

import { Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import pino from 'pino';
import dotenv from 'dotenv';
import { processLiDARJob } from './processors/lidar-processor';
import { processSpectralJob } from './processors/spectral-processor';
import { processSARJob } from './processors/sar-processor';
import { processThermalJob } from './processors/thermal-processor';
import { processFusionJob } from './processors/fusion-processor';

// Load environment variables
dotenv.config();

// Configure logger
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname',
    },
  },
});

// Configuration
const REDIS_URL = process.env.REDIS_URL || 'redis://nexus-redis:6379';
const QUEUE_NAME = 'geoagent-hypermodal';
const CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY || '5', 10);

// Parse Redis URL
const redisUrl = new URL(REDIS_URL);
const connection = new IORedis({
  host: redisUrl.hostname,
  port: parseInt(redisUrl.port || '6379', 10),
  password: redisUrl.password || undefined,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

logger.info('GeoAgent Worker (Node.js) starting...', {
  queueName: QUEUE_NAME,
  concurrency: CONCURRENCY,
  redisUrl: REDIS_URL,
});

/**
 * Main job processor
 * Routes jobs to appropriate processor based on job type
 */
async function processJob(job: Job): Promise<any> {
  const { jobType, operation } = job.data;

  logger.info('Processing job', {
    jobId: job.id,
    jobType,
    operation,
    attemptsMade: job.attemptsMade,
  });

  try {
    let result: any;

    switch (jobType) {
      case 'lidar':
        result = await processLiDARJob(job);
        break;

      case 'spectral':
        result = await processSpectralJob(job);
        break;

      case 'sar':
        result = await processSARJob(job);
        break;

      case 'thermal':
        result = await processThermalJob(job);
        break;

      case 'fusion':
        result = await processFusionJob(job);
        break;

      default:
        throw new Error(`Unknown job type: ${jobType}`);
    }

    logger.info('Job completed successfully', {
      jobId: job.id,
      jobType,
      operation,
      processingTime: result.processingTime,
    });

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error('Job processing failed', {
      jobId: job.id,
      jobType,
      operation,
      error: errorMessage,
      attemptsMade: job.attemptsMade,
    });

    throw error;
  }
}

/**
 * Create BullMQ worker
 */
const worker = new Worker(QUEUE_NAME, processJob, {
  connection,
  concurrency: CONCURRENCY,
  limiter: {
    max: 10, // Max 10 jobs per...
    duration: 1000, // ...per second
  },
  // BullMQ v5: stalledInterval moved to top level (not in settings)
  stalledInterval: 30000, // Check for stalled jobs every 30s
  maxStalledCount: 2, // Max 2 stalls before marking as failed
});

/**
 * Event handlers for monitoring
 */
worker.on('completed', (job: Job, result: any) => {
  logger.info('Job completed event', {
    jobId: job.id,
    jobType: job.data.jobType,
    returnValue: result,
  });
});

worker.on('failed', (job: Job | undefined, error: Error) => {
  logger.error('Job failed event', {
    jobId: job?.id,
    jobType: job?.data.jobType,
    error: error.message,
    attemptsMade: job?.attemptsMade,
  });
});

worker.on('progress', (job: Job, progress: number | object | string | boolean) => {
  logger.debug('Job progress', {
    jobId: job.id,
    progress,
  });
});

worker.on('stalled', (jobId: string) => {
  logger.warn('Job stalled', { jobId });
});

worker.on('error', (error: Error) => {
  logger.error('Worker error', { error: error.message });
});

worker.on('ready', () => {
  logger.info('Worker ready to process jobs');
});

/**
 * Graceful shutdown
 */
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  await worker.close();
  await connection.quit();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully...');
  await worker.close();
  await connection.quit();
  process.exit(0);
});

logger.info('GeoAgent Worker (Node.js) started successfully', {
  queueName: QUEUE_NAME,
  concurrency: CONCURRENCY,
  pid: process.pid,
});
