import Redis from 'ioredis';
import { logger } from '../utils/logger';

export class QueueService {
  private redis: Redis;

  constructor(redis: Redis) {
    this.redis = redis;
  }

  async enqueue(queue: string, data: any): Promise<string> {
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const job = {
      id: jobId,
      queue,
      data,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    await this.redis.lpush(`queue:${queue}`, JSON.stringify(job));
    await this.redis.set(`job:${jobId}`, JSON.stringify(job), 'EX', 86400);

    logger.info({ jobId, queue }, 'Job enqueued');
    return jobId;
  }

  async getJob(jobId: string): Promise<any> {
    const jobData = await this.redis.get(`job:${jobId}`);
    return jobData ? JSON.parse(jobData) : null;
  }

  async updateJob(jobId: string, updates: any): Promise<void> {
    const job = await this.getJob(jobId);
    if (job) {
      const updated = { ...job, ...updates, updatedAt: new Date().toISOString() };
      await this.redis.set(`job:${jobId}`, JSON.stringify(updated), 'EX', 86400);
    }
  }

  async healthCheck(): Promise<{ healthy: boolean; details: any }> {
    try {
      const ping = await this.redis.ping();
      return {
        healthy: ping === 'PONG',
        details: { connected: true },
      };
    } catch (error) {
      return {
        healthy: false,
        details: { error: (error as Error).message },
      };
    }
  }

  async close(): Promise<void> {
    await this.redis.quit();
  }
}