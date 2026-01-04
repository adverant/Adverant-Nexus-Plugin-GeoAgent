import { Router, Request, Response, NextFunction } from 'express';
import { databaseManager } from '../database/database-manager';
import { GeoAgentError } from '../types';
import { logger } from '../utils/logger';

const router = Router();

router.post('/upload', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { format, data, layer_id } = req.body;
    if (!format || !data || !layer_id) {
      throw new GeoAgentError('Missing required fields', 400, 'VALIDATION_ERROR');
    }
    // Queue ingestion job
    const jobId = `job_${Date.now()}`;
    res.json({ jobId, status: 'queued' });
  } catch (error) {
    next(error);
  }
});

export const ingestionRouter = router;
