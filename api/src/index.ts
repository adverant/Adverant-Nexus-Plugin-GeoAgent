import { config } from './config';
import { logger } from './utils/logger';
import { databaseManager } from './database/database-manager';
import { GeoAgentAPI } from './api';
import { createServer } from 'http';
import { flushPendingReports } from './middleware/usage-tracking';

/**
 * Validate system health before starting
 */
async function validateSystemHealth(): Promise<void> {
  logger.info('Running system health validations...');

  const validations = [
    {
      name: 'Database Connection',
      fn: async () => {
        await databaseManager.initialize();
      }
    },
    {
      name: 'PostGIS Extension',
      fn: async () => {
        try {
          const result = await databaseManager.query('SELECT PostGIS_Version() as version');
          if (result.rows[0]?.version) {
            logger.info(`PostGIS version: ${result.rows[0].version}`);
          }
        } catch (error) {
          logger.warn('PostGIS not available - running with limited spatial functionality');
          // Don't throw - allow service to continue without PostGIS
        }
      }
    },
    {
      name: 'GeoAgent Schema',
      fn: async () => {
        const result = await databaseManager.query(`
          SELECT EXISTS (
            SELECT 1 FROM information_schema.schemata
            WHERE schema_name = $1
          ) as exists
        `, [config.postgres.schema]);

        if (!result.rows[0].exists) {
          logger.warn('GeoAgent schema does not exist, will be created by migrations');
        }
      }
    },
    {
      name: 'Core Tables',
      fn: async () => {
        const tables = ['data_layers', 'geospatial_features', 'tracking_events', 'geofences'];
        const missing: string[] = [];

        for (const table of tables) {
          const result = await databaseManager.query(`
            SELECT EXISTS (
              SELECT 1 FROM information_schema.tables
              WHERE table_schema = $1 AND table_name = $2
            ) as exists
          `, [config.postgres.schema, table]);

          if (!result.rows[0].exists) {
            missing.push(table);
          }
        }

        if (missing.length > 0) {
          logger.warn(`Missing tables: ${missing.join(', ')}. Running migrations...`);
          await databaseManager.runMigrations();
        }
      }
    }
  ];

  for (const validation of validations) {
    try {
      await validation.fn();
      logger.info(`✓ ${validation.name} - OK`);
    } catch (error: any) {
      logger.error(`✗ ${validation.name} - FAILED`, { error: error.message });

      // Critical validations that should stop startup
      if (validation.name === 'Database Connection') {
        throw new Error(`Critical validation failed: ${validation.name}`);
      }
    }
  }

  logger.info('System health validations completed');
}

/**
 * Start the GeoAgent service
 */
async function startServer(): Promise<void> {
  try {
    logger.info('Starting GeoAgent service...');
    logger.info(`Environment: ${config.service.environment}`);
    logger.info(`Version: ${config.service.version}`);

    // Run health validations
    await validateSystemHealth();

    // Initialize the API
    const geoAgentAPI = new GeoAgentAPI();

    // Start the API server
    const server = createServer(geoAgentAPI.getApp());

    // Initialize WebSocket if enabled
    if (config.features.enableWebSocket) {
      await geoAgentAPI.initializeWebSocket(server);
    }

    // Start HTTP server
    server.listen(config.service.port, () => {
      logger.info(`🚀 GeoAgent API listening on port ${config.service.port}`);

      if (config.features.enableWebSocket) {
        logger.info(`🔌 WebSocket server enabled on port ${config.service.wsPort}`);
      }

      logger.info('🗺️ GeoAgent service ready for spatial operations');

      // Log enabled features
      const enabledFeatures = Object.entries(config.features)
        .filter(([_, enabled]) => enabled)
        .map(([feature]) => feature.replace('enable', ''));

      logger.info(`Enabled features: ${enabledFeatures.join(', ')}`);
    });

    // Graceful shutdown handlers
    const gracefulShutdown = async (signal: string) => {
      logger.info(`${signal} received, starting graceful shutdown...`);

      try {
        // Flush pending usage tracking reports
        try {
          await flushPendingReports();
          logger.info('Usage tracking reports flushed');
        } catch (error) {
          logger.error('Failed to flush usage reports', error);
        }

        // Stop accepting new connections
        server.close(() => {
          logger.info('HTTP server closed');
        });

        // Close WebSocket connections
        if (geoAgentAPI.getWebSocketServer()) {
          geoAgentAPI.getWebSocketServer().close();
          logger.info('WebSocket server closed');
        }

        // Close database connections
        await databaseManager.close();
        logger.info('Database connections closed');

        // Close Redis connections
        await geoAgentAPI.closeRedis();
        logger.info('Redis connections closed');

        logger.info('Graceful shutdown completed');
        process.exit(0);
      } catch (error) {
        logger.error('Error during graceful shutdown', error);
        process.exit(1);
      }
    };

    // Register shutdown handlers
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // Handle uncaught errors
    process.on('uncaughtException', (error) => {
      logger.fatal(error, 'Uncaught exception');
      process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.fatal({ reason, promise }, 'Unhandled rejection');
      process.exit(1);
    });

  } catch (error) {
    logger.error('Failed to start GeoAgent service', error);
    process.exit(1);
  }
}

// Start the server
startServer().catch((error) => {
  logger.error('Failed to start server', error);
  process.exit(1);
});