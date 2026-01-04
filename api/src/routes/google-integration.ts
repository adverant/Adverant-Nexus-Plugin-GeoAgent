/**
 * Google Geospatial Integration Routes
 *
 * Proxies requests to MageAgent's Google Cloud geospatial services,
 * enabling hybrid analysis that fuses GeoAgent's private PostGIS data
 * with Google's public planetary datasets.
 *
 * Features:
 * - Earth Engine satellite imagery analysis
 * - Vertex AI geospatial ML predictions
 * - BigQuery GIS large-scale spatial analytics
 * - Hybrid queries combining PostGIS + Google Cloud data
 */

import { Router, Request, Response, NextFunction } from 'express';
import axios, { AxiosError } from 'axios';
import { logger } from '../utils/logger';
import { config } from '../config';
import { databaseManager } from '../database/database-manager';
import { GeospatialFeature } from '../types';
import { Geometry } from 'geojson';

const router = Router();

// MageAgent Google geospatial endpoint
const MAGEAGENT_GOOGLE_ENDPOINT = config.mageagentUrl
  ? `${config.mageagentUrl}/api/google`
  : 'http://nexus-mageagent:8080/mageagent/api/google';

/**
 * Error handler for MageAgent proxy requests
 */
function handleMageAgentError(error: any, res: Response): void {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError;
    const status = axiosError.response?.status || 500;
    const message = axiosError.response?.data || axiosError.message;

    logger.error('MageAgent Google service error', {
      status,
      message,
      endpoint: axiosError.config?.url
    });

    res.status(status).json({
      error: 'Google geospatial service error',
      details: message,
      service: 'mageagent-google-proxy'
    });
  } else {
    logger.error('Unexpected error proxying to MageAgent', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

// ============================================================================
// EARTH ENGINE ROUTES
// ============================================================================

/**
 * POST /google/earth-engine
 * Execute Earth Engine operations on satellite imagery
 *
 * Operations:
 * - analyze: Regional analysis with reducers (mean, median, sum, min, max)
 * - time_series: Temporal analysis over date ranges
 * - get_image: Fetch specific imagery by asset ID
 * - list_collections: Browse available datasets
 */
router.post('/earth-engine', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { operation, ...params } = req.body;

    if (!operation) {
      return res.status(400).json({
        error: 'Missing required parameter: operation',
        validOperations: ['analyze', 'time_series', 'get_image', 'list_collections']
      });
    }

    logger.info('[Google EE Proxy] Forwarding request to MageAgent', {
      operation,
      params: Object.keys(params)
    });

    const response = await axios.post(`${MAGEAGENT_GOOGLE_ENDPOINT}/earth-engine`, req.body, {
      timeout: 60000,
      headers: {
        'Content-Type': 'application/json',
        'X-Source': 'geoagent',
        'X-Request-ID': req.headers['x-request-id'] as string || `geo-${Date.now()}`
      }
    });

    res.json(response.data);
  } catch (error) {
    handleMageAgentError(error, res);
  }
});

// ============================================================================
// VERTEX AI ROUTES
// ============================================================================

/**
 * POST /google/vertex-ai
 * Execute Vertex AI geospatial ML predictions
 *
 * Operations:
 * - predict: Run single/batch predictions
 * - batch_predict: Submit large-scale batch job
 * - list_models: Browse available models
 * - get_model: Get model details
 */
router.post('/vertex-ai', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { operation, ...params } = req.body;

    if (!operation) {
      return res.status(400).json({
        error: 'Missing required parameter: operation',
        validOperations: ['predict', 'batch_predict', 'list_models', 'get_model']
      });
    }

    logger.info('[Google Vertex AI Proxy] Forwarding request to MageAgent', {
      operation,
      params: Object.keys(params)
    });

    const response = await axios.post(`${MAGEAGENT_GOOGLE_ENDPOINT}/vertex-ai`, req.body, {
      timeout: 120000, // 2 minutes for AI inference
      headers: {
        'Content-Type': 'application/json',
        'X-Source': 'geoagent',
        'X-Request-ID': req.headers['x-request-id'] as string || `geo-${Date.now()}`
      }
    });

    res.json(response.data);
  } catch (error) {
    handleMageAgentError(error, res);
  }
});

// ============================================================================
// BIGQUERY GIS ROUTES
// ============================================================================

/**
 * POST /google/bigquery
 * Execute BigQuery GIS spatial analytics
 *
 * Operations:
 * - spatial_query: Execute SQL with ST_* functions
 * - spatial_join: Join tables on spatial predicates
 * - import_geojson: Import GeoJSON to BigQuery
 * - export_geojson: Export BigQuery table to GeoJSON
 * - list_tables: List available tables
 * - get_table_metadata: Get table schema and stats
 */
router.post('/bigquery', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { operation, ...params } = req.body;

    if (!operation) {
      return res.status(400).json({
        error: 'Missing required parameter: operation',
        validOperations: [
          'spatial_query',
          'spatial_join',
          'import_geojson',
          'export_geojson',
          'list_tables',
          'get_table_metadata'
        ]
      });
    }

    logger.info('[Google BigQuery GIS Proxy] Forwarding request to MageAgent', {
      operation,
      params: Object.keys(params)
    });

    const response = await axios.post(`${MAGEAGENT_GOOGLE_ENDPOINT}/bigquery`, req.body, {
      timeout: 120000, // 2 minutes for large spatial queries
      headers: {
        'Content-Type': 'application/json',
        'X-Source': 'geoagent',
        'X-Request-ID': req.headers['x-request-id'] as string || `geo-${Date.now()}`
      }
    });

    res.json(response.data);
  } catch (error) {
    handleMageAgentError(error, res);
  }
});

// ============================================================================
// HYBRID ANALYSIS ROUTES (PostGIS + Google Cloud)
// ============================================================================

/**
 * POST /google/hybrid/enrich-features
 * Enrich GeoAgent features with Google Earth Engine satellite data
 *
 * Combines:
 * 1. PostGIS features from GeoAgent (private data)
 * 2. Earth Engine satellite imagery analysis (public data)
 *
 * Example: Add NDVI (vegetation index) to agricultural parcels
 */
router.post('/hybrid/enrich-features', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { layerId, featureIds, imageCollection, bands, reducer = 'mean' } = req.body;

    if (!layerId || !imageCollection || !bands) {
      return res.status(400).json({
        error: 'Missing required parameters',
        required: ['layerId', 'imageCollection', 'bands'],
        example: {
          layerId: 'agricultural-parcels',
          featureIds: [1, 2, 3], // optional - all features if omitted
          imageCollection: 'COPERNICUS/S2',
          bands: ['B4', 'B8'], // Red and NIR for NDVI
          reducer: 'mean'
        }
      });
    }

    logger.info('[Hybrid Enrichment] Starting feature enrichment', {
      layerId,
      featureCount: featureIds?.length || 'all',
      imageCollection
    });

    // STEP 1: Fetch features from PostGIS (GeoAgent private data)
    let features: GeospatialFeature[];
    try {
      let query: string;
      let params: any[];

      if (featureIds && featureIds.length > 0) {
        // Fetch specific features by ID
        query = `
          SELECT
            feature_id,
            layer_id,
            ST_AsGeoJSON(geom)::json as geom,
            geom_type,
            properties,
            name,
            description,
            tags,
            created_at,
            updated_at,
            tenant_id
          FROM geospatial_features
          WHERE layer_id = $1 AND feature_id = ANY($2)
        `;
        params = [layerId, featureIds];
      } else {
        // Fetch all features in layer
        query = `
          SELECT
            feature_id,
            layer_id,
            ST_AsGeoJSON(geom)::json as geom,
            geom_type,
            properties,
            name,
            description,
            tags,
            created_at,
            updated_at,
            tenant_id
          FROM geospatial_features
          WHERE layer_id = $1
          LIMIT 1000
        `;
        params = [layerId];
      }

      const result = await databaseManager.query<GeospatialFeature>(query, params);
      features = result.rows;

      if (features.length === 0) {
        return res.status(404).json({
          error: 'No features found',
          layerId,
          featureIds
        });
      }

      logger.info(`[Hybrid Enrichment] Fetched ${features.length} features from PostGIS`);
    } catch (dbError) {
      logger.error('[Hybrid Enrichment] Failed to fetch features from PostGIS', {
        error: dbError instanceof Error ? dbError.message : 'Unknown error',
        layerId
      });
      return res.status(500).json({
        error: 'Failed to fetch features from database',
        details: dbError instanceof Error ? dbError.message : 'Unknown error'
      });
    }

    // STEP 2 & 3: For each feature, call Earth Engine API to analyze satellite imagery
    const enrichmentResults: Array<{
      feature_id: string;
      success: boolean;
      satellite_data?: any;
      error?: string;
    }> = [];

    for (const feature of features) {
      try {
        // Extract geometry for Earth Engine analysis
        const geometry = feature.geom;

        logger.debug('[Hybrid Enrichment] Analyzing feature with Earth Engine', {
          feature_id: feature.feature_id,
          geometry_type: geometry.type
        });

        // Call MageAgent's Earth Engine API for satellite analysis
        const eeResponse = await axios.post(
          `${MAGEAGENT_GOOGLE_ENDPOINT}/earth-engine`,
          {
            operation: 'analyze',
            geometry: geometry,
            imageCollection: imageCollection,
            bands: bands,
            reducer: reducer,
            scale: 30, // 30m resolution (Landsat/Sentinel-2 standard)
          },
          {
            timeout: 60000,
            headers: {
              'Content-Type': 'application/json',
              'X-Source': 'geoagent',
              'X-Request-ID': req.headers['x-request-id'] as string || `geo-${Date.now()}`
            }
          }
        );

        enrichmentResults.push({
          feature_id: feature.feature_id,
          success: true,
          satellite_data: eeResponse.data
        });

        logger.debug('[Hybrid Enrichment] Earth Engine analysis complete', {
          feature_id: feature.feature_id,
          bands: bands,
          reducer: reducer
        });
      } catch (eeError) {
        const errorMessage = axios.isAxiosError(eeError)
          ? eeError.response?.data || eeError.message
          : 'Unknown error';

        logger.error('[Hybrid Enrichment] Earth Engine analysis failed for feature', {
          feature_id: feature.feature_id,
          error: errorMessage
        });

        enrichmentResults.push({
          feature_id: feature.feature_id,
          success: false,
          error: errorMessage
        });
      }
    }

    // STEP 4 & 5: Merge satellite data with feature properties and update PostGIS
    const updatePromises = enrichmentResults
      .filter(result => result.success && result.satellite_data)
      .map(async (result) => {
        try {
          // Find original feature
          const feature = features.find(f => f.feature_id === result.feature_id);
          if (!feature) return { feature_id: result.feature_id, updated: false };

          // Merge satellite data into properties
          const enrichedProperties = {
            ...feature.properties,
            satellite_enrichment: {
              image_collection: imageCollection,
              bands: bands,
              reducer: reducer,
              data: result.satellite_data,
              enriched_at: new Date().toISOString()
            }
          };

          // Update feature in PostGIS with enriched properties
          await databaseManager.query(
            `UPDATE geospatial_features
             SET properties = $1, updated_at = NOW()
             WHERE feature_id = $2 AND layer_id = $3`,
            [JSON.stringify(enrichedProperties), result.feature_id, layerId]
          );

          logger.debug('[Hybrid Enrichment] Feature updated with satellite data', {
            feature_id: result.feature_id
          });

          return { feature_id: result.feature_id, updated: true };
        } catch (updateError) {
          logger.error('[Hybrid Enrichment] Failed to update feature', {
            feature_id: result.feature_id,
            error: updateError instanceof Error ? updateError.message : 'Unknown error'
          });
          return { feature_id: result.feature_id, updated: false };
        }
      });

    const updateResults = await Promise.all(updatePromises);

    // Compile final response
    const successCount = enrichmentResults.filter(r => r.success).length;
    const updatedCount = updateResults.filter(r => r.updated).length;

    logger.info('[Hybrid Enrichment] Enrichment workflow completed', {
      layerId,
      total_features: features.length,
      successful_analyses: successCount,
      updated_features: updatedCount
    });

    res.json({
      status: 'completed',
      summary: {
        layer_id: layerId,
        total_features: features.length,
        successful_analyses: successCount,
        updated_features: updatedCount,
        failed_analyses: enrichmentResults.filter(r => !r.success).length
      },
      results: enrichmentResults,
      updates: updateResults
    });
  } catch (error) {
    handleMageAgentError(error, res);
  }
});

/**
 * POST /google/hybrid/change-detection
 * Detect changes using satellite imagery over time
 *
 * Combines:
 * 1. GeoAgent area of interest (AOI) from PostGIS
 * 2. Earth Engine time series analysis
 *
 * Example: Detect deforestation in monitored regions
 */
router.post('/hybrid/change-detection', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { aoiLayerId, startDate, endDate, imageCollection, changeThreshold } = req.body;

    if (!aoiLayerId || !startDate || !endDate || !imageCollection) {
      return res.status(400).json({
        error: 'Missing required parameters',
        required: ['aoiLayerId', 'startDate', 'endDate', 'imageCollection'],
        example: {
          aoiLayerId: 'forest-monitoring-areas',
          startDate: '2023-01-01',
          endDate: '2024-01-01',
          imageCollection: 'LANDSAT/LC08/C02/T1_L2',
          changeThreshold: 0.3 // 30% change threshold
        }
      });
    }

    logger.info('[Hybrid Change Detection] Starting analysis', {
      aoiLayerId,
      dateRange: `${startDate} to ${endDate}`,
      imageCollection
    });

    // STEP 1: Fetch AOI geometries from PostGIS
    let aoiFeatures: GeospatialFeature[];
    try {
      const result = await databaseManager.query<GeospatialFeature>(
        `SELECT
          feature_id,
          layer_id,
          ST_AsGeoJSON(geom)::json as geom,
          geom_type,
          properties,
          name,
          description,
          tenant_id
        FROM geospatial_features
        WHERE layer_id = $1
        LIMIT 100`,
        [aoiLayerId]
      );

      aoiFeatures = result.rows;

      if (aoiFeatures.length === 0) {
        return res.status(404).json({
          error: 'No AOI features found',
          layerId: aoiLayerId
        });
      }

      logger.info(`[Hybrid Change Detection] Fetched ${aoiFeatures.length} AOI features`);
    } catch (dbError) {
      logger.error('[Hybrid Change Detection] Failed to fetch AOI from PostGIS', {
        error: dbError instanceof Error ? dbError.message : 'Unknown error',
        layerId: aoiLayerId
      });
      return res.status(500).json({
        error: 'Failed to fetch AOI from database',
        details: dbError instanceof Error ? dbError.message : 'Unknown error'
      });
    }

    // STEP 2: Call Earth Engine time series API for change detection
    const changeDetectionResults: Array<{
      feature_id: string;
      success: boolean;
      change_detected?: boolean;
      change_statistics?: any;
      error?: string;
    }> = [];

    for (const aoiFeature of aoiFeatures) {
      try {
        const geometry = aoiFeature.geom;

        logger.debug('[Hybrid Change Detection] Analyzing AOI with Earth Engine', {
          feature_id: aoiFeature.feature_id,
          geometry_type: geometry.type
        });

        // Call Earth Engine time series analysis
        const eeResponse = await axios.post(
          `${MAGEAGENT_GOOGLE_ENDPOINT}/earth-engine`,
          {
            operation: 'time_series',
            geometry: geometry,
            imageCollection: imageCollection,
            startDate: startDate,
            endDate: endDate,
            changeThreshold: changeThreshold || 0.3,
            scale: 30
          },
          {
            timeout: 120000, // 2 minutes for time series
            headers: {
              'Content-Type': 'application/json',
              'X-Source': 'geoagent',
              'X-Request-ID': req.headers['x-request-id'] as string || `geo-${Date.now()}`
            }
          }
        );

        const timeSeriesData = eeResponse.data;

        // Determine if significant change detected
        const changeDetected = timeSeriesData.change_magnitude
          ? Math.abs(timeSeriesData.change_magnitude) > (changeThreshold || 0.3)
          : false;

        changeDetectionResults.push({
          feature_id: aoiFeature.feature_id,
          success: true,
          change_detected: changeDetected,
          change_statistics: timeSeriesData
        });

        logger.debug('[Hybrid Change Detection] Time series analysis complete', {
          feature_id: aoiFeature.feature_id,
          change_detected: changeDetected
        });
      } catch (eeError) {
        const errorMessage = axios.isAxiosError(eeError)
          ? eeError.response?.data || eeError.message
          : 'Unknown error';

        logger.error('[Hybrid Change Detection] Earth Engine analysis failed', {
          feature_id: aoiFeature.feature_id,
          error: errorMessage
        });

        changeDetectionResults.push({
          feature_id: aoiFeature.feature_id,
          success: false,
          error: errorMessage
        });
      }
    }

    // STEP 3 & 4: Store change statistics and detected changes in PostGIS
    const storageResults: Array<{
      feature_id: string;
      stored: boolean;
      change_feature_id?: string;
    }> = [];

    for (const result of changeDetectionResults) {
      if (!result.success || !result.change_detected) {
        storageResults.push({
          feature_id: result.feature_id,
          stored: false
        });
        continue;
      }

      try {
        const aoiFeature = aoiFeatures.find(f => f.feature_id === result.feature_id);
        if (!aoiFeature) continue;

        // Update original AOI feature with change statistics
        const updatedProperties = {
          ...aoiFeature.properties,
          change_detection: {
            analysis_date: new Date().toISOString(),
            date_range: { start: startDate, end: endDate },
            image_collection: imageCollection,
            change_detected: result.change_detected,
            statistics: result.change_statistics
          }
        };

        await databaseManager.query(
          `UPDATE geospatial_features
           SET properties = $1, updated_at = NOW()
           WHERE feature_id = $2 AND layer_id = $3`,
          [JSON.stringify(updatedProperties), result.feature_id, aoiLayerId]
        );

        // Create new change polygon feature if significant change detected
        let changeFeatureId: string | undefined;
        if (result.change_statistics?.change_geometry) {
          const newFeatureId = `change_${Date.now()}_${Math.random().toString(36).substring(7)}`;

          await databaseManager.query(
            `INSERT INTO geospatial_features (
              feature_id,
              layer_id,
              geom,
              geom_type,
              properties,
              name,
              description,
              tags,
              tenant_id
            ) VALUES (
              $1,
              $2,
              ST_GeomFromGeoJSON($3),
              'Polygon',
              $4,
              $5,
              $6,
              $7,
              $8
            )`,
            [
              newFeatureId,
              `${aoiLayerId}_changes`, // Store in related layer
              JSON.stringify(result.change_statistics.change_geometry),
              JSON.stringify({
                change_magnitude: result.change_statistics.change_magnitude,
                analysis_date: new Date().toISOString(),
                source_aoi: result.feature_id
              }),
              `Change detected in ${aoiFeature.name || result.feature_id}`,
              `Detected change from ${startDate} to ${endDate}`,
              ['change-detection', 'satellite', imageCollection],
              aoiFeature.tenant_id
            ]
          );

          changeFeatureId = newFeatureId;

          logger.debug('[Hybrid Change Detection] Created change polygon feature', {
            change_feature_id: newFeatureId,
            source_aoi: result.feature_id
          });
        }

        storageResults.push({
          feature_id: result.feature_id,
          stored: true,
          change_feature_id: changeFeatureId
        });

        logger.debug('[Hybrid Change Detection] Results stored in PostGIS', {
          feature_id: result.feature_id
        });
      } catch (storageError) {
        logger.error('[Hybrid Change Detection] Failed to store results', {
          feature_id: result.feature_id,
          error: storageError instanceof Error ? storageError.message : 'Unknown error'
        });

        storageResults.push({
          feature_id: result.feature_id,
          stored: false
        });
      }
    }

    // Compile final response
    const changesDetected = changeDetectionResults.filter(r => r.change_detected).length;
    const successfulAnalyses = changeDetectionResults.filter(r => r.success).length;
    const storedResults = storageResults.filter(r => r.stored).length;

    logger.info('[Hybrid Change Detection] Analysis workflow completed', {
      aoiLayerId,
      total_aois: aoiFeatures.length,
      successful_analyses: successfulAnalyses,
      changes_detected: changesDetected,
      results_stored: storedResults
    });

    res.json({
      status: 'completed',
      summary: {
        aoi_layer_id: aoiLayerId,
        date_range: { start: startDate, end: endDate },
        image_collection: imageCollection,
        total_aois: aoiFeatures.length,
        successful_analyses: successfulAnalyses,
        changes_detected: changesDetected,
        results_stored: storedResults
      },
      detection_results: changeDetectionResults,
      storage_results: storageResults
    });
  } catch (error) {
    handleMageAgentError(error, res);
  }
});

// ============================================================================
// HEALTH CHECK
// ============================================================================

/**
 * GET /google/health
 * Check health of Google Cloud services via MageAgent proxy
 */
router.get('/health', async (req: Request, res: Response) => {
  try {
    const response = await axios.get(`${MAGEAGENT_GOOGLE_ENDPOINT}/health`, {
      timeout: 5000
    });

    res.json({
      ...response.data,
      proxy: 'geoagent',
      endpoint: MAGEAGENT_GOOGLE_ENDPOINT
    });
  } catch (error) {
    handleMageAgentError(error, res);
  }
});

export default router;
