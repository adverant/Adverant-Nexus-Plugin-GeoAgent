/**
 * BullMQ Job Queue for GeoAgent HyperModal Processing
 *
 * Manages the job queue for geospatial data processing tasks.
 * Adapted from FileProcessAgent's proven BullMQ pattern.
 *
 * Queue Architecture:
 * - Queue name: "geoagent-hypermodal"
 * - Job types: lidar, spectral, sar, thermal, fusion
 * - Priority support: 1-10 (10 = highest)
 * - Retry logic: 3 retries with exponential backoff
 * - Job lifecycle: pending → queued → processing → completed/failed
 */

import { Queue, QueueEvents, Job } from 'bullmq';
import IORedis from 'ioredis';
import { logger } from '../../utils/logger';

export type HyperModalJobType = 'lidar' | 'spectral' | 'sar' | 'thermal' | 'fusion';

export interface HyperModalJobData {
  jobId: string;
  userId: string;
  jobType: HyperModalJobType;
  operation: string;
  sourceUrl: string; // MinIO path
  metadata: Record<string, unknown>;
  options?: Record<string, unknown>;
}

export interface QueueStats {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: boolean;
}

/**
 * HyperModal Job Queue Manager
 */
export class HyperModalJobQueue {
  private queue: Queue<HyperModalJobData>;
  private queueEvents: QueueEvents;
  private connection: IORedis;
  private readonly queueName = 'geoagent-hypermodal';

  constructor(redisUrl?: string) {
    const redisConnectionString = redisUrl || process.env.REDIS_URL || 'redis://nexus-redis:6379';
    const parsedUrl = new URL(redisConnectionString);

    // Create Redis connection (required by BullMQ)
    this.connection = new IORedis({
      host: parsedUrl.hostname,
      port: parseInt(parsedUrl.port || '6379', 10),
      password: parsedUrl.password || undefined,
      maxRetriesPerRequest: null, // Required for BullMQ
      enableReadyCheck: false,
      retryStrategy: (times: number) => {
        const delay = Math.min(times * 1000, 10000);
        logger.warn(`Redis reconnection attempt ${times}, retrying in ${delay}ms`);
        return delay;
      },
    });

    // Create BullMQ queue
    this.queue = new Queue<HyperModalJobData>(this.queueName, {
      connection: this.connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000, // Start with 5 seconds
        },
        removeOnComplete: {
          age: 86400, // Keep completed jobs for 24 hours
          count: 1000, // Keep last 1000 completed jobs
        },
        removeOnFail: {
          age: 604800, // Keep failed jobs for 7 days
          count: 5000, // Keep last 5000 failed jobs
        },
      },
    });

    // Create queue events for monitoring
    this.queueEvents = new QueueEvents(this.queueName, {
      connection: this.connection.duplicate(),
    });

    // Set up event listeners
    this.setupEventListeners();

    logger.info('HyperModalJobQueue initialized', {
      queueName: this.queueName,
      redisUrl: redisConnectionString,
    });
  }

  /**
   * Set up event listeners for queue monitoring
   */
  private setupEventListeners(): void {
    this.queueEvents.on('completed', ({ jobId, returnvalue }) => {
      logger.info('HyperModal job completed', { jobId, returnvalue });
    });

    this.queueEvents.on('failed', ({ jobId, failedReason }) => {
      logger.error('HyperModal job failed', { jobId, failedReason });
    });

    this.queueEvents.on('progress', ({ jobId, data }) => {
      logger.debug('HyperModal job progress', { jobId, progress: data });
    });

    this.queueEvents.on('stalled', ({ jobId }) => {
      logger.warn('HyperModal job stalled', { jobId });
    });

    this.connection.on('error', (error) => {
      logger.error('Redis connection error (HyperModal queue)', {
        error: error.message,
      });
    });

    this.connection.on('ready', () => {
      logger.info('Redis connection ready (HyperModal queue)');
    });
  }

  /**
   * Add a new processing job to the queue
   *
   * @param jobData - Job data including type, operation, source
   * @param priority - Job priority (1-10, 10 = highest)
   * @returns BullMQ Job instance
   */
  async addJob(
    jobData: HyperModalJobData,
    priority: number = 5
  ): Promise<Job<HyperModalJobData>> {
    try {
      logger.debug('Adding HyperModal job to queue', {
        jobId: jobData.jobId,
        jobType: jobData.jobType,
        operation: jobData.operation,
        priority,
      });

      const job = await this.queue.add(
        jobData.jobType,
        jobData,
        {
          jobId: jobData.jobId,
          priority,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 5000,
          },
        }
      );

      logger.info('HyperModal job added to queue', {
        jobId: job.id,
        jobType: jobData.jobType,
        operation: jobData.operation,
      });

      return job;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to add HyperModal job to queue', {
        jobId: jobData.jobId,
        error: errorMessage,
      });
      throw new Error(`Failed to add job to queue: ${errorMessage}`);
    }
  }

  /**
   * Get job by ID
   *
   * @param jobId - Job ID to query
   * @returns Job instance or null if not found
   */
  async getJob(jobId: string): Promise<Job<HyperModalJobData> | null> {
    try {
      const job = await this.queue.getJob(jobId);
      return job || null;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to get HyperModal job', { jobId, error: errorMessage });
      throw new Error(`Failed to get job: ${errorMessage}`);
    }
  }

  /**
   * Get job state
   *
   * @param jobId - Job ID to query
   * @returns Job state or null if not found
   */
  async getJobState(jobId: string): Promise<string | null> {
    try {
      const job = await this.queue.getJob(jobId);
      if (!job) return null;

      const state = await job.getState();
      return state;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to get HyperModal job state', {
        jobId,
        error: errorMessage,
      });
      return null;
    }
  }

  /**
   * Cancel a job
   *
   * @param jobId - Job ID to cancel
   * @returns True if cancelled, false if job not found or already finished
   */
  async cancelJob(jobId: string): Promise<boolean> {
    try {
      const job = await this.queue.getJob(jobId);
      if (!job) {
        logger.warn('Cannot cancel HyperModal job - not found', { jobId });
        return false;
      }

      const state = await job.getState();
      if (state === 'completed' || state === 'failed') {
        logger.warn('Cannot cancel HyperModal job - already finished', {
          jobId,
          state,
        });
        return false;
      }

      await job.remove();
      logger.info('HyperModal job cancelled', { jobId });
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to cancel HyperModal job', {
        jobId,
        error: errorMessage,
      });
      throw new Error(`Failed to cancel job: ${errorMessage}`);
    }
  }

  /**
   * Get queue statistics
   *
   * @returns Queue statistics (waiting, active, completed, failed, delayed)
   */
  async getQueueStats(): Promise<QueueStats> {
    try {
      const [waiting, active, completed, failed, delayed, paused] = await Promise.all([
        this.queue.getWaitingCount(),
        this.queue.getActiveCount(),
        this.queue.getCompletedCount(),
        this.queue.getFailedCount(),
        this.queue.getDelayedCount(),
        this.queue.isPaused(),
      ]);

      return { waiting, active, completed, failed, delayed, paused };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to get HyperModal queue stats', {
        error: errorMessage,
      });
      throw new Error(`Failed to get queue stats: ${errorMessage}`);
    }
  }

  /**
   * Get jobs by state
   *
   * @param state - Job state to filter by
   * @param start - Pagination start (default: 0)
   * @param end - Pagination end (default: 100)
   * @returns Array of jobs
   */
  async getJobsByState(
    state: 'waiting' | 'active' | 'completed' | 'failed' | 'delayed',
    start: number = 0,
    end: number = 100
  ): Promise<Job<HyperModalJobData>[]> {
    try {
      let jobs: Job<HyperModalJobData>[] = [];

      switch (state) {
        case 'waiting':
          jobs = await this.queue.getWaiting(start, end);
          break;
        case 'active':
          jobs = await this.queue.getActive(start, end);
          break;
        case 'completed':
          jobs = await this.queue.getCompleted(start, end);
          break;
        case 'failed':
          jobs = await this.queue.getFailed(start, end);
          break;
        case 'delayed':
          jobs = await this.queue.getDelayed(start, end);
          break;
      }

      return jobs;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to get HyperModal jobs by state', {
        state,
        error: errorMessage,
      });
      throw new Error(`Failed to get jobs by state: ${errorMessage}`);
    }
  }

  /**
   * Pause the queue (stop processing new jobs)
   */
  async pause(): Promise<void> {
    try {
      await this.queue.pause();
      logger.info('HyperModal queue paused');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to pause HyperModal queue', { error: errorMessage });
      throw new Error(`Failed to pause queue: ${errorMessage}`);
    }
  }

  /**
   * Resume the queue (start processing jobs again)
   */
  async resume(): Promise<void> {
    try {
      await this.queue.resume();
      logger.info('HyperModal queue resumed');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to resume HyperModal queue', { error: errorMessage });
      throw new Error(`Failed to resume queue: ${errorMessage}`);
    }
  }

  /**
   * Clean old jobs from the queue
   *
   * @param grace - Grace period in milliseconds (jobs older than this will be cleaned)
   * @param limit - Maximum number of jobs to clean
   * @param type - Job type to clean (completed or failed)
   */
  async cleanOldJobs(
    grace: number = 86400000, // 24 hours
    limit: number = 1000,
    type: 'completed' | 'failed' = 'completed'
  ): Promise<string[]> {
    try {
      logger.info('Cleaning old HyperModal jobs', { grace, limit, type });

      const jobs = await this.queue.clean(grace, limit, type);

      logger.info('Old HyperModal jobs cleaned', {
        count: jobs.length,
        type,
      });
      return jobs;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to clean old HyperModal jobs', {
        error: errorMessage,
      });
      throw new Error(`Failed to clean old jobs: ${errorMessage}`);
    }
  }

  /**
   * Close the queue and clean up resources
   */
  async close(): Promise<void> {
    try {
      await this.queueEvents.close();
      await this.queue.close();
      await this.connection.quit();
      logger.info('HyperModalJobQueue closed');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to close HyperModal queue', { error: errorMessage });
      throw new Error(`Failed to close queue: ${errorMessage}`);
    }
  }
}

// Singleton instance
let queueInstance: HyperModalJobQueue | null = null;

/**
 * Get or create the singleton queue instance
 */
export function getHyperModalQueue(): HyperModalJobQueue {
  if (!queueInstance) {
    queueInstance = new HyperModalJobQueue();
  }
  return queueInstance;
}
