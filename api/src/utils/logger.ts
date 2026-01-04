import pino from 'pino';
import { config } from '../config';

// Create pino logger instance
export const logger = pino({
  name: config.service.name,
  level: config.logging.level,

  // Pretty print in development
  transport: config.logging.pretty ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
      ignore: 'pid,hostname',
      translateTime: 'yyyy-mm-dd HH:MM:ss.l',
    }
  } : undefined,

  // Base configuration
  base: {
    service: config.service.name,
    version: config.service.version,
    env: config.service.environment,
  },

  // Serializers for common objects
  serializers: {
    req: (req: any) => ({
      method: req.method,
      url: req.url,
      path: req.path,
      query: req.query,
      headers: {
        'user-agent': req.headers['user-agent'],
        'x-request-id': req.headers['x-request-id'],
      },
    }),
    res: (res: any) => ({
      statusCode: res.statusCode,
      headers: res.getHeaders?.(),
    }),
    err: pino.stdSerializers.err,
  },

  // Timestamp configuration
  timestamp: pino.stdTimeFunctions.isoTime,

  // Redact sensitive fields
  redact: {
    paths: [
      'password',
      'token',
      'apiKey',
      'req.headers.authorization',
      'req.headers["x-api-key"]',
    ],
    censor: '[REDACTED]',
  },
});

// Create child loggers for different components
export const createLogger = (component: string) => {
  return logger.child({ component });
};

// Specific component loggers
export const dbLogger = createLogger('database');
export const apiLogger = createLogger('api');
export const wsLogger = createLogger('websocket');
export const queueLogger = createLogger('queue');
export const spatialLogger = createLogger('spatial');

// Log uncaught exceptions and rejections
process.on('uncaughtException', (err) => {
  logger.fatal(err, 'Uncaught exception');
  process.exit(1);
});

process.on('unhandledRejection', (err) => {
  logger.fatal(err as Error, 'Unhandled rejection');
  process.exit(1);
});

// Helper function for request logging
export const logRequest = (req: any, res: any, next: any) => {
  const startTime = Date.now();

  // Log request
  apiLogger.info({
    req,
    msg: 'Request received',
  });

  // Log response
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    apiLogger.info({
      req,
      res,
      duration,
      msg: 'Request completed',
    });
  });

  next();
};