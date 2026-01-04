import { Server as SocketIOServer, Socket } from 'socket.io';
import Redis from 'ioredis';
import { logger } from '../utils/logger';

export class GeoAgentWebSocketServer {
  private io: SocketIOServer;
  private redisSubscriber: Redis;
  private activeSessions: Map<string, Set<string>> = new Map();

  constructor(io: SocketIOServer, redisSubscriber: Redis) {
    this.io = io;
    this.redisSubscriber = redisSubscriber;
  }

  async initialize(): Promise<void> {
    // Set up Redis subscriptions for real-time events
    this.redisSubscriber.on('message', (channel, message) => {
      this.handleRedisMessage(channel, message);
    });

    // Subscribe to tracking updates
    await this.redisSubscriber.subscribe('geoagent:tracking:*');
    await this.redisSubscriber.subscribe('geoagent:geofence:*');

    // Set up Socket.IO event handlers
    this.io.on('connection', (socket: Socket) => {
      this.handleConnection(socket);
    });

    logger.info('WebSocket server initialized');
  }

  private handleConnection(socket: Socket): void {
    const sessionId = socket.id;
    const tenantId = socket.handshake.query.tenantId as string || 'default';

    logger.info({ sessionId, tenantId }, 'WebSocket client connected');

    // Track active sessions per tenant
    if (!this.activeSessions.has(tenantId)) {
      this.activeSessions.set(tenantId, new Set());
    }
    this.activeSessions.get(tenantId)!.add(sessionId);

    // Join tenant room
    socket.join(`tenant:${tenantId}`);

    // Handle tracking subscriptions
    socket.on('subscribe:tracking', (assetIds: string[]) => {
      assetIds.forEach(assetId => {
        socket.join(`tracking:${assetId}`);
      });
      socket.emit('subscribed:tracking', { assetIds });
    });

    // Handle geofence subscriptions
    socket.on('subscribe:geofence', (fenceIds: string[]) => {
      fenceIds.forEach(fenceId => {
        socket.join(`geofence:${fenceId}`);
      });
      socket.emit('subscribed:geofence', { fenceIds });
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      this.activeSessions.get(tenantId)?.delete(sessionId);
      if (this.activeSessions.get(tenantId)?.size === 0) {
        this.activeSessions.delete(tenantId);
      }
      logger.info({ sessionId }, 'WebSocket client disconnected');
    });
  }

  private handleRedisMessage(channel: string, message: string): void {
    try {
      const data = JSON.parse(message);

      if (channel.startsWith('geoagent:tracking:')) {
        const assetId = channel.split(':')[2];
        this.io.to(`tracking:${assetId}`).emit('tracking:update', data);
      } else if (channel.startsWith('geoagent:geofence:')) {
        const fenceId = channel.split(':')[2];
        this.io.to(`geofence:${fenceId}`).emit('geofence:event', data);
      }
    } catch (error) {
      logger.error({ error, channel, message }, 'Error handling Redis message');
    }
  }

  broadcastToTenant(tenantId: string, event: string, data: any): void {
    this.io.to(`tenant:${tenantId}`).emit(event, data);
  }

  getActiveSessions(): Map<string, Set<string>> {
    return this.activeSessions;
  }
}