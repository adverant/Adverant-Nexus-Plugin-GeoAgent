import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

export const config = {
  // Service Configuration
  service: {
    name: 'geoagent-api',
    version: process.env.SERVICE_VERSION || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT || '9095', 10),
    wsPort: parseInt(process.env.WS_PORT || '9096', 10),
  },

  // PostgreSQL/PostGIS Configuration
  postgres: {
    host: process.env.POSTGRES_HOST || 'nexus-postgres',
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    database: process.env.POSTGRES_DATABASE || 'unified_nexus',
    user: process.env.POSTGRES_USER || 'unified_nexus',
    password: process.env.POSTGRES_PASSWORD!, // Required: Set via environment variable
    schema: 'geoagent',
    ssl: process.env.POSTGRES_SSL === 'true',
    max: parseInt(process.env.POSTGRES_MAX_CONNECTIONS || '20', 10),
    idleTimeoutMillis: parseInt(process.env.POSTGRES_IDLE_TIMEOUT || '30000', 10),
    connectionTimeoutMillis: parseInt(process.env.POSTGRES_CONNECTION_TIMEOUT || '2000', 10),
  },

  // Redis Configuration
  redis: {
    host: process.env.REDIS_HOST || 'nexus-redis',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '0', 10),
    keyPrefix: 'geoagent:',
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
  },

  // GraphRAG Integration
  graphrag: {
    url: process.env.GRAPHRAG_URL || 'http://nexus-graphrag:8090',
    apiKey: process.env.GRAPHRAG_API_KEY,
    timeout: parseInt(process.env.GRAPHRAG_TIMEOUT_MS || '30000', 10),
  },

  // MageAgent Integration
  mageAgent: {
    url: process.env.MAGEAGENT_URL || 'http://nexus-mageagent:8080',
    apiKey: process.env.MAGEAGENT_API_KEY,
    timeout: parseInt(process.env.MAGEAGENT_TIMEOUT_MS || '60000', 10),
  },

  // Qdrant Vector Database
  qdrant: {
    url: process.env.QDRANT_URL || 'http://nexus-qdrant:6333',
    apiKey: process.env.QDRANT_API_KEY,
    collection: 'geoagent_features',
    vectorSize: 1024, // VoyageAI voyage-3 dimensions
  },

  // Neo4j Graph Database
  neo4j: {
    uri: process.env.NEO4J_URI || 'bolt://nexus-neo4j:7687',
    user: process.env.NEO4J_USER || 'neo4j',
    password: process.env.NEO4J_PASSWORD!, // Required: Set via environment variable
    database: process.env.NEO4J_DATABASE || 'neo4j',
  },

  // H3 Configuration
  h3: {
    defaultResolution: parseInt(process.env.H3_DEFAULT_RESOLUTION || '9', 10),
    minResolution: parseInt(process.env.H3_MIN_RESOLUTION || '0', 10),
    maxResolution: parseInt(process.env.H3_MAX_RESOLUTION || '15', 10),
  },

  // File Upload Configuration
  upload: {
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '104857600', 10), // 100MB default
    allowedFormats: ['geojson', 'kml', 'kmz', 'shp', 'gpx', 'csv'],
    tempDir: process.env.TEMP_DIR || '/tmp/geoagent',
  },

  // Queue Configuration
  queue: {
    defaultJobOptions: {
      removeOnComplete: true,
      removeOnFail: false,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
    },
    workerConcurrency: parseInt(process.env.WORKER_CONCURRENCY || '5', 10),
  },

  // CORS Configuration
  cors: {
    origins: process.env.CORS_ORIGINS?.split(',') || [
      'http://localhost:*',
      'https://localhost:*',
      'vscode-webview://*',
    ],
    credentials: true,
  },

  // Rate Limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10), // 1 minute
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  },

  // Logging
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    pretty: process.env.NODE_ENV === 'development',
  },

  // Security
  security: {
    jwtSecret: process.env.JWT_SECRET!, // Required: Set via environment variable
    bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || '10', 10),
    apiKeyHeader: 'X-API-Key',
  },

  // Spatial Defaults
  spatial: {
    defaultSRID: 4326, // WGS84
    defaultProximityRadius: 1000, // meters
    maxFeaturesPerQuery: parseInt(process.env.MAX_FEATURES_PER_QUERY || '10000', 10),
    simplifyTolerance: 0.00001, // degrees
  },

  // Feature Flags
  features: {
    enableWebSocket: process.env.ENABLE_WEBSOCKET !== 'false',
    enableH3: process.env.ENABLE_H3 !== 'false',
    enableMachineLearning: process.env.ENABLE_ML === 'true',
    enableCaching: process.env.ENABLE_CACHING !== 'false',
    enableMetrics: process.env.ENABLE_METRICS !== 'false',
  },

  // Health Check
  healthCheck: {
    interval: parseInt(process.env.HEALTH_CHECK_INTERVAL || '30000', 10),
    timeout: parseInt(process.env.HEALTH_CHECK_TIMEOUT || '5000', 10),
  },
};

// Validate required configuration
const requiredEnvVars: string[] = [
  'POSTGRES_PASSWORD',
  'NEO4J_PASSWORD',
  'JWT_SECRET',
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`Missing required environment variable: ${envVar}`);
    process.exit(1);
  }
}

// Log configuration (without sensitive data)
if (config.service.environment === 'development') {
  console.log('GeoAgent Configuration:');
  console.log('- Service:', `${config.service.name} v${config.service.version}`);
  console.log('- Environment:', config.service.environment);
  console.log('- API Port:', config.service.port);
  console.log('- WebSocket Port:', config.service.wsPort);
  console.log('- PostgreSQL:', `${config.postgres.host}:${config.postgres.port}/${config.postgres.database}`);
  console.log('- Redis:', `${config.redis.host}:${config.redis.port}`);
  console.log('- GraphRAG:', config.graphrag.url);
  console.log('- MageAgent:', config.mageAgent.url);
  console.log('- H3 Resolution:', config.h3.defaultResolution);
  console.log('- Features:', Object.entries(config.features).filter(([_, v]) => v).map(([k]) => k).join(', '));
}