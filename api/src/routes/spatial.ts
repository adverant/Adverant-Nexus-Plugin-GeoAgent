import { Router, Request, Response, NextFunction } from 'express';
import { databaseManager } from '../database/database-manager';
import { GeoAgentError } from '../types';
import { logger } from '../utils/logger';

const router = Router();

router.post('/buffer', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { geometry, distance, units = 'meters' } = req.body;
    if (!geometry || !distance) {
      throw new GeoAgentError('Missing required fields', 400, 'VALIDATION_ERROR');
    }
    const distanceMeters = units === 'kilometers' ? distance * 1000 : distance;
    const query = `
      SELECT ST_AsGeoJSON(
        ST_Buffer(ST_GeomFromGeoJSON($1)::geography, $2)::geometry
      ) as buffered_geometry
    `;
    const result = await databaseManager.query(query, [JSON.stringify(geometry), distanceMeters]);
    res.json({
      type: 'Feature',
      geometry: JSON.parse(result.rows[0].buffered_geometry),
      properties: { buffer_distance: distance, buffer_units: units }
    });
  } catch (error) {
    next(error);
  }
});

export const spatialRouter = router;
