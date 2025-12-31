import { FastifyInstance } from 'fastify';
import { notificationService } from '../services/notifications.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validation.js';
import { z } from 'zod';

// Add Redis connection error handling during service initialization
export async function notificationRoutes(fastify: FastifyInstance) {
  try {
    // Test Redis connection during initialization
    await notificationService.testRedisConnection();
  } catch (error: any) {
    fastify.log.error({ err: error }, 'Failed to connect to Redis for notification service');
    throw new Error('Notification service unavailable: Redis connection failed');
  }

  // Apply authentication and authorization middleware
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', authorize(['read:notifications']));

  // Add Redis error handling middleware
  fastify.addHook('preHandler', async (request, reply) => {
    try {
      // Verify Redis connection is still active before processing requests
      await notificationService.testRedisConnection();
    } catch (error: any) {
      request.log.error({ err: error }, 'Redis connection failed during request processing');
      throw fastify.httpErrors.serviceUnavailable('Notification service temporarily unavailable');
    }
  });