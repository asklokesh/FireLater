import { FastifyInstance } from 'fastify';
import { notificationService } from '../services/notifications.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { BadRequestError, NotFoundError } from '../utils/errors.js';
import { redisClient } from '../config/redis.js';

// Add Redis connection state tracking
let isRedisConnected = false;

// Add Redis error handling
redisClient.on('error', (err) => {
  isRedisConnected = false;
  console.error('Redis connection error:', err);
});

redisClient.on('connect', () => {
  isRedisConnected = true;
});

redisClient.on('end', () => {
  isRedisConnected = false;
});

export default async function notificationRoutes(fastify: FastifyInstance) {
  // Add health check for Redis connection
  fastify.get('/notifications/health', {
    preHandler: [authenticate, authorize('read:notifications')]
  }, async (request, reply) => {
    if (!isRedisConnected) {
      return reply.code(503).send({ 
        status: 'error', 
        message: 'Notification service unavailable: Redis connection failed' 
      });
    }
    
    try {
      await redisClient.ping();
      return { status: 'ok', redis: 'connected' };
    } catch (err) {
      return reply.code(503).send({ 
        status: 'error', 
        message: 'Redis ping failed', 
        error: err instanceof Error ? err.message : 'Unknown error' 
      });
    }
  });
}