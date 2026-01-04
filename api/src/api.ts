import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { Server as HTTPServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import Redis from 'ioredis';
import { config } from './config';
import { logger, apiLogger, logRequest } from './utils/logger';
import { databaseManager } from './database/database-manager';
import { GeoAgentError } from './types';
import { usageTrackingMiddleware } from './middleware/usage-tracking';

// Import routes
import { layersRouter } from './routes/layers';
import { featuresRouter } from './routes/features';
import { spatialRouter } from './routes/spatial';
import { trackingRouter } from './routes/tracking';
import { geofencingRouter } from './routes/geofencing';
import { h3Router } from './routes/h3';
import { ingestionRouter } from './routes/ingestion';
import { jobsRouter } from './routes/jobs';
import googleIntegrationRouter from './routes/google-integration';
import { registerHyperModalRoutes } from './routes/hypermodal';

// Import WebSocket handler
import { GeoAgentWebSocketServer } from './websocket/websocket-server';

// Import services
import { QueueService } from './services/queue-service';

export class GeoAgentAPI {
  private app: Application;
  private io?: SocketIOServer;
  private wsServer?: GeoAgentWebSocketServer;
  private redisClient: Redis;
  private redisSubscriber: Redis;
  private queueService: QueueService;

  constructor() {
    this.app = express();
    this.redisClient = new Redis(config.redis);
    this.redisSubscriber = new Redis(config.redis);
    this.queueService = new QueueService(this.redisClient);

    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  /**
   * Set up Express middleware
   */
  private setupMiddleware(): void {
    // Security middleware
    this.app.use(helmet({
      crossOriginResourcePolicy: { policy: "cross-origin" },
      contentSecurityPolicy: false, // Disable for API
    }));

    // CORS configuration
    this.app.use(cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (mobile apps, Postman, etc.)
        if (!origin) return callback(null, true);

        // Check against allowed origins
        const allowed = config.cors.origins.some(pattern => {
          if (typeof pattern === 'string') {
            return pattern === origin || pattern === '*';
          }
          return pattern.test(origin);
        });

        if (allowed) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      },
      credentials: config.cors.credentials,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Tenant-ID'],
    }));

    // Compression
    this.app.use(compression());

    // Body parsing
    this.app.use(express.json({ limit: '50mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '50mb' }));

    // Usage tracking middleware for billing and analytics
    this.app.use(usageTrackingMiddleware);

    // Request logging
    this.app.use(logRequest);

    // Rate limiting
    const limiter = rateLimit({
      windowMs: config.rateLimit.windowMs,
      max: config.rateLimit.max,
      message: 'Too many requests, please try again later',
      standardHeaders: true,
      legacyHeaders: false,
    });

    this.app.use('/api/', limiter);

    // Trust proxy for accurate IP addresses
    this.app.set('trust proxy', 1);
  }

  /**
   * Set up API routes
   */
  private setupRoutes(): void {
    // Health check endpoint
    this.app.get('/health', async (req: Request, res: Response) => {
      try {
        const dbHealth = await databaseManager.healthCheck();
        const redisHealth = await this.checkRedisHealth();
        const queueHealth = await this.queueService.healthCheck();

        const healthy = dbHealth.healthy && redisHealth.healthy && queueHealth.healthy;

        res.status(healthy ? 200 : 503).json({
          status: healthy ? 'healthy' : 'unhealthy',
          timestamp: new Date().toISOString(),
          service: {
            name: config.service.name,
            version: config.service.version,
            environment: config.service.environment,
          },
          components: {
            database: dbHealth,
            redis: redisHealth,
            queue: queueHealth,
          },
        });
      } catch (error) {
        apiLogger.error(error, 'Health check failed');
        res.status(503).json({
          status: 'unhealthy',
          error: (error as Error).message,
        });
      }
    });

    // API version endpoint
    this.app.get('/api/v1', (req: Request, res: Response) => {
      res.json({
        service: 'GeoAgent API',
        version: config.service.version,
        endpoints: {
          layers: '/api/v1/layers',
          features: '/api/v1/features',
          spatial: '/api/v1/spatial',
          tracking: '/api/v1/tracking',
          geofencing: '/api/v1/geofencing',
          h3: '/api/v1/h3',
          ingestion: '/api/v1/ingestion',
          jobs: '/api/v1/jobs',
          google: '/api/v1/google',
          hypermodal: '/api/v1/hypermodal',
        },
        documentation: '/api/v1/docs',
      });
    });

    // Mount routers
    this.app.use('/api/v1/layers', layersRouter);
    this.app.use('/api/v1/features', featuresRouter);
    this.app.use('/api/v1/spatial', spatialRouter);
    this.app.use('/api/v1/tracking', trackingRouter);
    this.app.use('/api/v1/geofencing', geofencingRouter);
    this.app.use('/api/v1/h3', h3Router);
    this.app.use('/api/v1/ingestion', ingestionRouter);
    this.app.use('/api/v1/jobs', jobsRouter);
    this.app.use('/api/v1/google', googleIntegrationRouter);

    // Mount HyperModal routes (20 endpoints for multi-modal geospatial processing)
    const hyperModalRouter = registerHyperModalRoutes();
    this.app.use('/api/v1/hypermodal', hyperModalRouter);

    logger.info('[Google Integration Routes] Mounted at /api/v1/google', {
      endpoints: [
        'POST /api/v1/google/earth-engine (proxy to MageAgent Earth Engine)',
        'POST /api/v1/google/vertex-ai (proxy to MageAgent Vertex AI)',
        'POST /api/v1/google/bigquery (proxy to MageAgent BigQuery GIS)',
        'POST /api/v1/google/hybrid/enrich-features (PostGIS + Earth Engine)',
        'POST /api/v1/google/hybrid/change-detection (Time series analysis)',
        'GET /api/v1/google/health (Google services health check)'
      ],
      integration: 'Hybrid geospatial reasoning (PostGIS + Google Cloud)'
    });

    logger.info('[HyperModal Routes] Mounted at /api/v1/hypermodal', {
      endpoints: [
        'POST /api/v1/hypermodal/lidar/ingest (LiDAR point cloud ingestion)',
        'POST /api/v1/hypermodal/lidar/process (LiDAR processing)',
        'GET /api/v1/hypermodal/lidar/datasets/:id (Get LiDAR dataset)',
        'POST /api/v1/hypermodal/spectral/ingest (Hyperspectral data ingestion)',
        'POST /api/v1/hypermodal/spectral/unmix (Spectral unmixing)',
        'POST /api/v1/hypermodal/spectral/vegetation (Vegetation indices)',
        'POST /api/v1/hypermodal/spectral/minerals (Mineral identification)',
        'POST /api/v1/hypermodal/sar/ingest (SAR data ingestion)',
        'POST /api/v1/hypermodal/sar/interferometry (InSAR processing)',
        'POST /api/v1/hypermodal/sar/coherence (Coherence analysis)',
        'POST /api/v1/hypermodal/sar/change (Change detection)',
        'POST /api/v1/hypermodal/thermal/ingest (Thermal imagery ingestion)',
        'POST /api/v1/hypermodal/thermal/heatmap (Heatmap generation)',
        'POST /api/v1/hypermodal/thermal/anomaly (Thermal anomaly detection)',
        'POST /api/v1/hypermodal/thermal/extract (Temperature extraction)',
        'POST /api/v1/hypermodal/fusion/multimodal (Multi-modal fusion)',
        'POST /api/v1/hypermodal/fusion/report (Generate fusion report)',
        'GET /api/v1/hypermodal/jobs/:jobId (Get job status)',
        'DELETE /api/v1/hypermodal/jobs/:jobId (Cancel job)',
        'GET /api/v1/hypermodal/queue/stats (Queue statistics)'
      ],
      totalEndpoints: 20,
      integration: 'Multi-modal geospatial processing (LiDAR, Spectral, SAR, Thermal, Fusion)'
    });

    // 404 handler
    this.app.use((req: Request, res: Response) => {
      res.status(404).json({
        error: {
          message: 'Endpoint not found',
          code: 'NOT_FOUND',
          path: req.path,
        },
      });
    });
  }

  /**
   * Set up error handling middleware
   */
  private setupErrorHandling(): void {
    // Error handler
    this.app.use((err: any, req: Request, res: Response, next: NextFunction) => {
      apiLogger.error({
        error: err,
        request: {
          method: req.method,
          path: req.path,
          query: req.query,
          body: req.body,
        },
      }, 'Request error');

      // Handle GeoAgentError
      if (err instanceof GeoAgentError) {
        return res.status(err.statusCode).json({
          error: {
            message: err.message,
            code: err.code,
            context: err.context,
          },
        });
      }

      // Handle validation errors
      if (err.name === 'ValidationError') {
        return res.status(400).json({
          error: {
            message: 'Validation error',
            code: 'VALIDATION_ERROR',
            details: err.details || err.message,
          },
        });
      }

      // Handle database errors
      if (err.code === '23505') {
        return res.status(409).json({
          error: {
            message: 'Duplicate entry',
            code: 'DUPLICATE_ERROR',
            detail: err.detail,
          },
        });
      }

      // Handle CORS errors
      if (err.message === 'Not allowed by CORS') {
        return res.status(403).json({
          error: {
            message: 'CORS policy violation',
            code: 'CORS_ERROR',
          },
        });
      }

      // Default error response
      res.status(500).json({
        error: {
          message: config.service.environment === 'production'
            ? 'Internal server error'
            : err.message,
          code: 'INTERNAL_ERROR',
          ...(config.service.environment !== 'production' && {
            stack: err.stack,
          }),
        },
      });
    });
  }

  /**
   * Initialize WebSocket server
   */
  async initializeWebSocket(server: HTTPServer): Promise<void> {
    this.io = new SocketIOServer(server, {
      path: '/geoagent/socket.io',
      cors: {
        origin: config.cors.origins,
        credentials: config.cors.credentials,
        methods: ['GET', 'POST'],
      },
      transports: ['websocket', 'polling'],
      pingTimeout: 60000,
      pingInterval: 25000,
    });

    this.wsServer = new GeoAgentWebSocketServer(this.io, this.redisSubscriber);
    await this.wsServer.initialize();

    logger.info('WebSocket server initialized');
  }

  /**
   * Check Redis health
   */
  private async checkRedisHealth(): Promise<{ healthy: boolean; details: any }> {
    try {
      const ping = await this.redisClient.ping();
      const info = await this.redisClient.info('server');

      return {
        healthy: ping === 'PONG',
        details: {
          connected: this.redisClient.status === 'ready',
          version: info.match(/redis_version:([^\r\n]+)/)?.[1],
        },
      };
    } catch (error) {
      return {
        healthy: false,
        details: {
          error: (error as Error).message,
        },
      };
    }
  }

  /**
   * Close Redis connections
   */
  async closeRedis(): Promise<void> {
    await this.redisClient.quit();
    await this.redisSubscriber.quit();
    await this.queueService.close();
  }

  /**
   * Get Express app instance
   */
  getApp(): Application {
    return this.app;
  }

  /**
   * Get WebSocket server instance
   */
  getWebSocketServer(): GeoAgentWebSocketServer | undefined {
    return this.wsServer;
  }

  /**
   * Get Queue service instance
   */
  getQueueService(): QueueService {
    return this.queueService;
  }
}