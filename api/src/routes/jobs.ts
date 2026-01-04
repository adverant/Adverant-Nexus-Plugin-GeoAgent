import { Router, Request, Response, NextFunction } from 'express';
import { databaseManager } from '../database/database-manager';
import { GeoAgentError } from '../types';
import { logger } from '../utils/logger';

const router = Router();

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string || 'default';
    const query = `
      SELECT job_id, job_type, status, metadata, created_at, completed_at
      FROM geoagent.spatial_jobs
      WHERE tenant_id = $1
      ORDER BY created_at DESC LIMIT 50
    `;
    const result = await databaseManager.query(query, [tenantId]);
    res.json({ jobs: result.rows });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const tenantId = req.headers['x-tenant-id'] as string || 'default';
    const query = `
      SELECT job_id, job_type, status, result, metadata, created_at, completed_at
      FROM geoagent.spatial_jobs
      WHERE job_id = $1 AND tenant_id = $2
    `;
    const result = await databaseManager.query(query, [id, tenantId]);
    if (result.rowCount === 0) {
      throw new GeoAgentError('Job not found', 404, 'JOB_NOT_FOUND');
    }
    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

export const jobsRouter = router;
