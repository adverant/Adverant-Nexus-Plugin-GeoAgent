/**
 * HyperModal Job Management Routes
 *
 * Endpoints for job status and management:
 * - GET /jobs/:jobId - Get job status and progress
 * - DELETE /jobs/:jobId - Cancel job
 * - GET /queue/stats - Get queue statistics
 */

import { Router, Request, Response } from 'express';
import { getHyperModalQueue } from '../../services/hypermodal/job-queue';
import { logger } from '../../utils/logger';

const router = Router();

/**
 * GET /api/v1/hypermodal/jobs/:jobId
 *
 * Get job status and details
 */
router.get('/jobs/:jobId', async (req: Request, res: Response) => {
  const startTime = Date.now();
  const { jobId } = req.params;

  try {
    logger.debug('Getting HyperModal job status', { jobId });

    const queue = getHyperModalQueue();
    const job = await queue.getJob(jobId);

    if (!job) {
      return res.status(404).json({
        success: false,
        error: 'JOB_NOT_FOUND',
        message: `Job ${jobId} not found`,
      });
    }

    const state = await job.getState();
    const progress = job.progress || 0;

    const duration = Date.now() - startTime;

    logger.info('Job status retrieved', {
      jobId,
      state,
      progress,
      duration: `${duration}ms`,
    });

    res.status(200).json({
      success: true,
      job: {
        id: job.id,
        type: job.name,
        status: state,
        progress: typeof progress === 'number' ? progress : 0,
        data: job.data,
        result: job.returnvalue,
        failedReason: job.failedReason,
        attemptsMade: job.attemptsMade,
        createdAt: job.timestamp,
        processedOn: job.processedOn,
        finishedOn: job.finishedOn,
      },
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error('Failed to get job status', {
      jobId,
      error: errorMessage,
      duration: `${duration}ms`,
    });

    res.status(500).json({
      success: false,
      error: 'STATUS_QUERY_FAILED',
      message: 'Failed to retrieve job status',
      details: errorMessage,
    });
  }
});

/**
 * DELETE /api/v1/hypermodal/jobs/:jobId
 *
 * Cancel a job
 */
router.delete('/jobs/:jobId', async (req: Request, res: Response) => {
  const startTime = Date.now();
  const { jobId } = req.params;

  try {
    logger.info('Cancelling HyperModal job', { jobId });

    const queue = getHyperModalQueue();
    const cancelled = await queue.cancelJob(jobId);

    const duration = Date.now() - startTime;

    if (!cancelled) {
      return res.status(404).json({
        success: false,
        error: 'CANNOT_CANCEL',
        message: 'Job not found or already completed',
      });
    }

    logger.info('Job cancelled successfully', {
      jobId,
      duration: `${duration}ms`,
    });

    res.status(200).json({
      success: true,
      message: 'Job cancelled successfully',
      jobId,
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error('Failed to cancel job', {
      jobId,
      error: errorMessage,
      duration: `${duration}ms`,
    });

    res.status(500).json({
      success: false,
      error: 'CANCELLATION_FAILED',
      message: 'Failed to cancel job',
      details: errorMessage,
    });
  }
});

/**
 * GET /api/v1/hypermodal/queue/stats
 *
 * Get queue statistics
 */
router.get('/queue/stats', async (_req: Request, res: Response) => {
  const startTime = Date.now();

  try {
    logger.debug('Getting HyperModal queue stats');

    const queue = getHyperModalQueue();
    const stats = await queue.getQueueStats();

    const duration = Date.now() - startTime;

    logger.info('Queue stats retrieved', {
      stats,
      duration: `${duration}ms`,
    });

    res.status(200).json({
      success: true,
      stats,
      queue: 'geoagent:hypermodal',
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error('Failed to get queue stats', {
      error: errorMessage,
      duration: `${duration}ms`,
    });

    res.status(500).json({
      success: false,
      error: 'STATS_QUERY_FAILED',
      message: 'Failed to retrieve queue statistics',
      details: errorMessage,
    });
  }
});

export default router;
