import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import Redis from 'ioredis';
import { REDIS_URL } from '../config/env.js';
import { logger } from '../utils/logger.js';

// Redis connection with retry logic
const redis = new Redis(REDIS_URL, {
  retryStrategy: (times) => {
    // Retry after increasing delays up to 30 seconds
    const delay = Math.min(times * 50, 30000);
    logger.warn(`Redis connection retry attempt ${times}, retrying in ${delay}ms`);
    return delay;
  },
  reconnectOnError: (err) => {
    logger.error('Redis reconnect on error:', err.message);
    return true; // Reconnect on all errors
  },
  maxRetriesPerRequest: 3,
  connectTimeout: 10000,
});

// Handle Redis connection events
redis.on('connect', () => {
  logger.info('Connected to Redis for notifications');
});

redis.on('error', (err) => {
  logger.error('Redis connection error:', err.message);
  // Don't throw here to prevent crashing the app
});

redis.on('close', () => {
  logger.warn('Redis connection closed');
});

redis.on('reconnecting', () => {
  logger.info('Redis reconnecting...');
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('Closing Redis connection...');
  await redis.quit();
});

export default async function notificationsRoutes(fastify: FastifyInstance) {
  // Add connection health check
  fastify.get('/health', async () => {
    try {
      const result = await redis.ping();
      return { status: 'ok', redis: result };
    } catch (error) {
      logger.error('Redis health check failed:', error);
      return { status: 'error', redis: error.message };
    }
  });

  // Example notification endpoint with proper error handling
  fastify.post('/send', {
    preHandler: [requirePermission('notifications:send')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const body = sendNotificationSchema.parse(request.body);

    try {
      // Check Redis connection before attempting to send
      if (!redis.status || redis.status === 'end') {
        logger.error('Redis connection is not available');
        return reply.code(503).send({ error: 'Notification service unavailable' });
      }

      // Add notification to queue
      const result = await redis.lpush('notifications', JSON.stringify({
        ...body,
        tenantSlug,
        createdAt: new Date().toISOString(),
      }));

      return { success: true, queued: result };
    } catch (error) {
      logger.error('Failed to queue notification:', error);
      return reply.code(500).send({ error: 'Failed to send notification' });
    }
  });
}