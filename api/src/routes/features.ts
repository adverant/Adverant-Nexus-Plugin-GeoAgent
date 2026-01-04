import { Router, Request, Response, NextFunction } from 'express';
import { databaseManager } from '../database/database-manager';
import { GeoAgentError } from '../types';
import { logger } from '../utils/logger';

const router = Router();

/**
 * GET /api/v1/features
 * Get features with spatial and attribute filters
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string || 'default';
    const {
      layer_id,
      bbox,
      limit = 100,
      offset = 0,
      properties,
    } = req.query;

    let query = `
      SELECT
        feature_id,
        layer_id,
        ST_AsGeoJSON(geom) as geometry,
        properties,
        metadata,
        h3_index_7,
        h3_index_9,
        h3_index_12,
        created_at,
        updated_at
      FROM geoagent.geospatial_features
      WHERE tenant_id = $1
    `;

    const params: any[] = [tenantId];
    let paramIndex = 2;

    if (layer_id) {
      query += ` AND layer_id = $${paramIndex}`;
      params.push(layer_id);
      paramIndex++;
    }

    if (bbox) {
      // bbox format: minLon,minLat,maxLon,maxLat
      const [minLon, minLat, maxLon, maxLat] = (bbox as string).split(',').map(Number);
      query += ` AND ST_Intersects(geom, ST_MakeEnvelope($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, 4326))`;
      params.push(minLon, minLat, maxLon, maxLat);
      paramIndex += 4;
    }

    if (properties) {
      // Filter by JSONB properties
      query += ` AND properties @> $${paramIndex}::jsonb`;
      params.push(JSON.stringify(properties));
      paramIndex++;
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await databaseManager.query(query, params);

    // Parse geometry JSON
    const features = result.rows.map(row => ({
      ...row,
      geometry: JSON.parse(row.geometry),
    }));

    res.json({
      type: 'FeatureCollection',
      features: features.map(f => ({
        type: 'Feature',
        id: f.feature_id,
        geometry: f.geometry,
        properties: {
          ...f.properties,
          layer_id: f.layer_id,
          h3_index_7: f.h3_index_7,
          h3_index_9: f.h3_index_9,
          h3_index_12: f.h3_index_12,
          created_at: f.created_at,
          updated_at: f.updated_at,
        },
      })),
      metadata: {
        count: features.length,
        limit,
        offset,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/features/:id
 * Get feature by ID
 */
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const tenantId = req.headers['x-tenant-id'] as string || 'default';

    const query = `
      SELECT
        feature_id,
        layer_id,
        ST_AsGeoJSON(geom) as geometry,
        properties,
        metadata,
        h3_index_7,
        h3_index_9,
        h3_index_12,
        created_at,
        updated_at
      FROM geoagent.geospatial_features
      WHERE feature_id = $1 AND tenant_id = $2
    `;

    const result = await databaseManager.query(query, [id, tenantId]);

    if (result.rowCount === 0) {
      throw new GeoAgentError('Feature not found', 404, 'FEATURE_NOT_FOUND');
    }

    const feature = result.rows[0];
    feature.geometry = JSON.parse(feature.geometry);

    res.json({
      type: 'Feature',
      id: feature.feature_id,
      geometry: feature.geometry,
      properties: {
        ...feature.properties,
        layer_id: feature.layer_id,
        h3_index_7: feature.h3_index_7,
        h3_index_9: feature.h3_index_9,
        h3_index_12: feature.h3_index_12,
        created_at: feature.created_at,
        updated_at: feature.updated_at,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/features
 * Create new feature
 */
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string || 'default';
    const { layer_id, geometry, properties, metadata } = req.body;

    if (!layer_id || !geometry) {
      throw new GeoAgentError('Missing required fields', 400, 'VALIDATION_ERROR');
    }

    // Convert GeoJSON to PostGIS geometry
    const query = `
      INSERT INTO geoagent.geospatial_features (
        tenant_id,
        layer_id,
        geom,
        properties,
        metadata
      ) VALUES (
        $1, $2,
        ST_GeomFromGeoJSON($3),
        $4, $5
      )
      RETURNING
        feature_id,
        layer_id,
        ST_AsGeoJSON(geom) as geometry,
        properties,
        metadata,
        h3_index_7,
        h3_index_9,
        h3_index_12,
        created_at
    `;

    const result = await databaseManager.query(query, [
      tenantId,
      layer_id,
      JSON.stringify(geometry),
      properties || {},
      metadata || {},
    ]);

    const feature = result.rows[0];
    feature.geometry = JSON.parse(feature.geometry);

    logger.info({ featureId: feature.feature_id }, 'Feature created');

    res.status(201).json({
      type: 'Feature',
      id: feature.feature_id,
      geometry: feature.geometry,
      properties: {
        ...feature.properties,
        layer_id: feature.layer_id,
        h3_index_7: feature.h3_index_7,
        h3_index_9: feature.h3_index_9,
        h3_index_12: feature.h3_index_12,
        created_at: feature.created_at,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/features/batch
 * Create multiple features
 */
router.post('/batch', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string || 'default';
    const { layer_id, features } = req.body;

    if (!layer_id || !features || !Array.isArray(features)) {
      throw new GeoAgentError('Missing required fields', 400, 'VALIDATION_ERROR');
    }

    const client = await databaseManager.getClient();

    try {
      await client.query('BEGIN');

      const insertedFeatures = [];

      for (const feature of features) {
        const query = `
          INSERT INTO geoagent.geospatial_features (
            tenant_id,
            layer_id,
            geom,
            properties,
            metadata
          ) VALUES (
            $1, $2,
            ST_GeomFromGeoJSON($3),
            $4, $5
          )
          RETURNING
            feature_id,
            ST_AsGeoJSON(geom) as geometry,
            properties,
            h3_index_7,
            h3_index_9,
            h3_index_12,
            created_at
        `;

        const result = await client.query(query, [
          tenantId,
          layer_id,
          JSON.stringify(feature.geometry),
          feature.properties || {},
          feature.metadata || {},
        ]);

        const inserted = result.rows[0];
        inserted.geometry = JSON.parse(inserted.geometry);
        insertedFeatures.push(inserted);
      }

      await client.query('COMMIT');

      logger.info({ count: insertedFeatures.length }, 'Batch features created');

      res.status(201).json({
        type: 'FeatureCollection',
        features: insertedFeatures.map(f => ({
          type: 'Feature',
          id: f.feature_id,
          geometry: f.geometry,
          properties: {
            ...f.properties,
            layer_id,
            h3_index_7: f.h3_index_7,
            h3_index_9: f.h3_index_9,
            h3_index_12: f.h3_index_12,
            created_at: f.created_at,
          },
        })),
        metadata: {
          count: insertedFeatures.length,
        },
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/v1/features/:id
 * Update feature
 */
router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const tenantId = req.headers['x-tenant-id'] as string || 'default';
    const { geometry, properties, metadata } = req.body;

    let query = `
      UPDATE geoagent.geospatial_features
      SET updated_at = NOW()
    `;
    const params: any[] = [];
    let paramIndex = 1;

    if (geometry) {
      query += `, geom = ST_GeomFromGeoJSON($${paramIndex})`;
      params.push(JSON.stringify(geometry));
      paramIndex++;
    }

    if (properties !== undefined) {
      query += `, properties = $${paramIndex}`;
      params.push(properties);
      paramIndex++;
    }

    if (metadata !== undefined) {
      query += `, metadata = $${paramIndex}`;
      params.push(metadata);
      paramIndex++;
    }

    query += ` WHERE feature_id = $${paramIndex} AND tenant_id = $${paramIndex + 1}
      RETURNING
        feature_id,
        layer_id,
        ST_AsGeoJSON(geom) as geometry,
        properties,
        metadata,
        h3_index_7,
        h3_index_9,
        h3_index_12,
        updated_at
    `;
    params.push(id, tenantId);

    const result = await databaseManager.query(query, params);

    if (result.rowCount === 0) {
      throw new GeoAgentError('Feature not found', 404, 'FEATURE_NOT_FOUND');
    }

    const feature = result.rows[0];
    feature.geometry = JSON.parse(feature.geometry);

    logger.info({ featureId: id }, 'Feature updated');

    res.json({
      type: 'Feature',
      id: feature.feature_id,
      geometry: feature.geometry,
      properties: {
        ...feature.properties,
        layer_id: feature.layer_id,
        h3_index_7: feature.h3_index_7,
        h3_index_9: feature.h3_index_9,
        h3_index_12: feature.h3_index_12,
        updated_at: feature.updated_at,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/v1/features/:id
 * Delete feature
 */
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const tenantId = req.headers['x-tenant-id'] as string || 'default';

    const query = `
      DELETE FROM geoagent.geospatial_features
      WHERE feature_id = $1 AND tenant_id = $2
      RETURNING feature_id
    `;

    const result = await databaseManager.query(query, [id, tenantId]);

    if (result.rowCount === 0) {
      throw new GeoAgentError('Feature not found', 404, 'FEATURE_NOT_FOUND');
    }

    logger.info({ featureId: id }, 'Feature deleted');

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export const featuresRouter = router;