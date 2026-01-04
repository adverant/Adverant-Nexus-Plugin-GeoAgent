import { Router, Request, Response, NextFunction } from 'express';
import { databaseManager } from '../database/database-manager';
import { GeoAgentError } from '../types';
import { logger } from '../utils/logger';

const router = Router();

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string || 'default';
    const query = `
      SELECT fence_id, fence_name, fence_type, ST_AsGeoJSON(geom) as geometry,
             is_active, metadata
      FROM geoagent.geofences
      WHERE tenant_id = $1 AND is_active = true
    `;
    const result = await databaseManager.query(query, [tenantId]);
    res.json({
      geofences: result.rows.map(row => ({
        ...row,
        geometry: JSON.parse(row.geometry)
      }))
    });
  } catch (error) {
    next(error);
  }
});

export const geofencingRouter = router;
