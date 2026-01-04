import { Router, Request, Response, NextFunction } from 'express';
import { databaseManager } from '../database/database-manager';
import { GeoAgentError } from '../types';
import { logger } from '../utils/logger';

const router = Router();

router.get('/assets/:id/locations', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const tenantId = req.headers['x-tenant-id'] as string || 'default';
    const query = `
      SELECT tracking_id, asset_id, ST_AsGeoJSON(location) as location,
             speed_kmh, heading_degrees, timestamp
      FROM geoagent.asset_tracking
      WHERE asset_id = $1 AND tenant_id = $2
      ORDER BY timestamp DESC LIMIT 100
    `;
    const result = await databaseManager.query(query, [id, tenantId]);
    res.json({
      locations: result.rows.map(row => ({
        ...row,
        location: JSON.parse(row.location)
      }))
    });
  } catch (error) {
    next(error);
  }
});

export const trackingRouter = router;
