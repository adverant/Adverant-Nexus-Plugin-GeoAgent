import { Router, Request, Response, NextFunction } from 'express';
import { databaseManager } from '../database/database-manager';
import { GeoAgentError } from '../types';
import { logger } from '../utils/logger';

const router = Router();

router.post('/point-to-cell', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { point, resolution = 9 } = req.body;
    if (!point) {
      throw new GeoAgentError('Missing point', 400, 'VALIDATION_ERROR');
    }
    const query = `
      SELECT geoagent.h3_point_to_cell(
        ST_GeomFromGeoJSON($1), $2
      ) as h3_index
    `;
    const result = await databaseManager.query(query, [JSON.stringify(point), resolution]);
    res.json({ h3_index: result.rows[0].h3_index, resolution });
  } catch (error) {
    next(error);
  }
});

export const h3Router = router;
