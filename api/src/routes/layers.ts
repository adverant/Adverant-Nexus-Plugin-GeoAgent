import { Router, Request, Response, NextFunction } from 'express';
import { databaseManager } from '../database/database-manager';
import { GeoAgentError } from '../types';
import { logger } from '../utils/logger';

const router = Router();

/**
 * GET /api/v1/layers
 * Get all layers for a tenant
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string || 'default';

    const query = `
      SELECT
        layer_id,
        layer_name,
        layer_type,
        style,
        visibility,
        metadata,
        created_at,
        updated_at
      FROM geoagent.layers
      WHERE tenant_id = $1
      ORDER BY created_at DESC
    `;

    const result = await databaseManager.query(query, [tenantId]);

    res.json({
      layers: result.rows,
      count: result.rowCount,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/layers/:id
 * Get layer by ID
 */
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const tenantId = req.headers['x-tenant-id'] as string || 'default';

    const query = `
      SELECT
        layer_id,
        layer_name,
        layer_type,
        style,
        visibility,
        metadata,
        created_at,
        updated_at
      FROM geoagent.layers
      WHERE layer_id = $1 AND tenant_id = $2
    `;

    const result = await databaseManager.query(query, [id, tenantId]);

    if (result.rowCount === 0) {
      throw new GeoAgentError('Layer not found', 404, 'LAYER_NOT_FOUND');
    }

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/layers
 * Create new layer
 */
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string || 'default';
    const { layer_name, layer_type, style, visibility, metadata } = req.body;

    if (!layer_name || !layer_type) {
      throw new GeoAgentError('Missing required fields', 400, 'VALIDATION_ERROR');
    }

    const query = `
      INSERT INTO geoagent.layers (
        tenant_id,
        layer_name,
        layer_type,
        style,
        visibility,
        metadata
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;

    const result = await databaseManager.query(query, [
      tenantId,
      layer_name,
      layer_type,
      style || {},
      visibility !== undefined ? visibility : true,
      metadata || {},
    ]);

    logger.info({ layerId: result.rows[0].layer_id }, 'Layer created');

    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/v1/layers/:id
 * Update layer
 */
router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const tenantId = req.headers['x-tenant-id'] as string || 'default';
    const { layer_name, layer_type, style, visibility, metadata } = req.body;

    const query = `
      UPDATE geoagent.layers
      SET
        layer_name = COALESCE($3, layer_name),
        layer_type = COALESCE($4, layer_type),
        style = COALESCE($5, style),
        visibility = COALESCE($6, visibility),
        metadata = COALESCE($7, metadata),
        updated_at = NOW()
      WHERE layer_id = $1 AND tenant_id = $2
      RETURNING *
    `;

    const result = await databaseManager.query(query, [
      id,
      tenantId,
      layer_name,
      layer_type,
      style,
      visibility,
      metadata,
    ]);

    if (result.rowCount === 0) {
      throw new GeoAgentError('Layer not found', 404, 'LAYER_NOT_FOUND');
    }

    logger.info({ layerId: id }, 'Layer updated');

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/v1/layers/:id
 * Delete layer
 */
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const tenantId = req.headers['x-tenant-id'] as string || 'default';

    const query = `
      DELETE FROM geoagent.layers
      WHERE layer_id = $1 AND tenant_id = $2
      RETURNING layer_id
    `;

    const result = await databaseManager.query(query, [id, tenantId]);

    if (result.rowCount === 0) {
      throw new GeoAgentError('Layer not found', 404, 'LAYER_NOT_FOUND');
    }

    logger.info({ layerId: id }, 'Layer deleted');

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export const layersRouter = router;