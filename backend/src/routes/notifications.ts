import { FastifyInstance, FastifyRequest } from 'fastify';
import { authenticateTenant } from '../middleware/auth.js';
import { BadRequestError, InternalServerError } from '../utils/errors.js';
import { redisClient } from '../config/redis.js';

// Add connection validation helper
async function validateRedisConnection() {
  try {
    await redisClient.ping();
    return true;
  } catch (error) {
    return false;
  }
}

// Add reconnection helper
async function ensureRedisConnection() {
  if (!await validateRedisConnection()) {
    try {
      await redisClient.connect();
    } catch (error) {
      throw new InternalServerError('Notification service temporarily unavailable');
    }
  }
}

export async function notificationRoutes(fastify: FastifyInstance) {
  // POST /api/v1/notifications/preferences
  fastify.post('/preferences', {
    preHandler: authenticateTenant,
    schema: {
      tags: ['notifications'],
      body: {
        type: 'object',
        properties: {
          email: { type: 'boolean' },
          sms: { type: 'boolean' },
          push: { type: 'boolean' },
          slack: { type: 'boolean' }
        }
      }
    }
  }, async (request: FastifyRequest<{ Body: any }>, reply) => {
    const { tenantSlug } = request;
    const { userId } = request.user;
    const preferences = request.body;

    try {
      await ensureRedisConnection();
      await redisClient.hset(`user:${userId}:notifications`, preferences);
      return { message: 'Preferences updated successfully' };
    } catch (error) {
      request.log.error({ err: error, tenant: tenantSlug, user: userId }, 'Failed to update notification preferences');
      if (error instanceof InternalServerError) throw error;
      throw new InternalServerError('Failed to update notification preferences');
    }
  });

  // GET /api/v1/notifications/preferences
  fastify.get('/preferences', {
    preHandler: authenticateTenant
  }, async (request, reply) => {
    const { userId } = request.user;

    try {
      await ensureRedisConnection();
      const preferences = await redisClient.hgetall(`user:${userId}:notifications`);
      
      // Convert string values to booleans
      const normalized = Object.fromEntries(
        Object.entries(preferences || {}).map(([key, value]) => [key, value === 'true'])
      );
      
      return normalized;
    } catch (error) {
      request.log.error({ err: error, user: userId }, 'Failed to fetch notification preferences');
      if (error instanceof InternalServerError) throw error;
      return {}; // Return empty preferences on failure
    }
  });

  // POST /api/v1/notifications/test
  fastify.post('/test', {
    preHandler: authenticateTenant,
    schema: {
      tags: ['notifications'],
      body: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['email', 'sms', 'push', 'slack'] },
          message: { type: 'string' }
        },
        required: ['type', 'message']
      }
    }
  }, async (request: FastifyRequest<{ Body: any }>, reply) => {
    const { tenantSlug } = request;
    const { userId } = request.user;
    const { type, message } = request.body;

    try {
      await ensureRedisConnection();
      const preferences = await redisClient.hgetall(`user:${userId}:notifications`);
      
      if (preferences?.[type] !== 'true') {
        throw new BadRequestError(`User has disabled ${type} notifications`);
      }

      // Add to notification queue
      await redisClient.lpush('notification_queue', JSON.stringify({
        userId,
        type,
        message,
        tenantSlug,
        timestamp: new Date().toISOString()
      }));

      return { message: 'Test notification queued successfully' };
    } catch (error) {
      request.log.error({ err: error, tenant: tenantSlug, user: userId }, 'Failed to queue test notification');
      if (error instanceof BadRequestError) throw error;
      if (error instanceof InternalServerError) throw error;
      throw new InternalServerError('Failed to queue test notification');
    }
  });
}