/**
 * HyperModal Routes Index
 *
 * Centralized export of all HyperModal routes for GeoAgent API.
 * Provides 19 endpoints across 5 modules for multi-modal geospatial processing.
 *
 * Route Modules:
 * - lidar: LiDAR point cloud processing (3 endpoints)
 * - spectral: Hyperspectral analysis (4 endpoints)
 * - sar: SAR processing (4 endpoints)
 * - thermal: Thermal imaging (4 endpoints)
 * - fusion: Multi-modal fusion (2 endpoints)
 * - jobs: Job management (3 endpoints)
 *
 * Total: 20 endpoints
 */

import { Router } from 'express';
import lidarRoutes from './lidar';
import spectralRoutes from './spectral';
import sarRoutes from './sar';
import thermalRoutes from './thermal';
import fusionRoutes from './fusion';
import jobsRoutes from './jobs';
import { logger } from '../../utils/logger';

const router = Router();

/**
 * Register all HyperModal route modules
 */
export function registerHyperModalRoutes(): Router {
  // LiDAR routes (3 endpoints)
  router.use('/lidar', lidarRoutes);
  logger.info('Registered HyperModal LiDAR routes');

  // Hyperspectral routes (4 endpoints)
  router.use('/spectral', spectralRoutes);
  logger.info('Registered HyperModal spectral routes');

  // SAR routes (4 endpoints)
  router.use('/sar', sarRoutes);
  logger.info('Registered HyperModal SAR routes');

  // Thermal routes (4 endpoints)
  router.use('/thermal', thermalRoutes);
  logger.info('Registered HyperModal thermal routes');

  // Fusion routes (2 endpoints)
  router.use('/fusion', fusionRoutes);
  logger.info('Registered HyperModal fusion routes');

  // Job management routes (3 endpoints)
  router.use('/', jobsRoutes);
  logger.info('Registered HyperModal job management routes');

  logger.info('All HyperModal routes registered successfully (20 endpoints)');

  return router;
}

/**
 * Get route statistics
 */
export function getHyperModalRouteInfo() {
  return {
    totalEndpoints: 20,
    modules: {
      lidar: { endpoints: 3, paths: ['/ingest', '/process', '/datasets/:id'] },
      spectral: { endpoints: 4, paths: ['/ingest', '/unmix', '/identify', '/vegetation', '/minerals'] },
      sar: { endpoints: 4, paths: ['/ingest', '/interferometry', '/coherence', '/change'] },
      thermal: { endpoints: 4, paths: ['/ingest', '/heatmap', '/anomaly', '/extract'] },
      fusion: { endpoints: 2, paths: ['/multimodal', '/report'] },
      jobs: { endpoints: 3, paths: ['/jobs/:jobId', 'DELETE /jobs/:jobId', '/queue/stats'] },
    },
    basePath: '/api/v1/hypermodal',
  };
}

export default router;
