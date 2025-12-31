import { FastifyInstance } from 'fastify';
import { notificationService } from '../services/notifications.js';
import { authenticateTenant } from '../middleware/auth.js';
import { redisClient } from '../config/redis.js';

// Add Redis connection with retry logic
const connectWithRetry = async (maxRetries = 5, delay = 1000) => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await redisClient.connect();
      console.log('Redis connected successfully');
      return;
    } catch (error) {
      console.error(`Redis connection attempt ${i + 1} failed:`, error);
      if (i === maxRetries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)));
    }
  }
};

// Handle Redis disconnection
redisClient.on('error', (err) => {
  console.error('Redis connection error:', err);
});

redisClient.on('connect', () => {
  console.log('Redis client connected');
});

redisClient.on('reconnecting', () => {
  console.log('Redis client reconnecting');
});

redisClient.on('end', () => {
  console.log('Redis client disconnected');
});

// Initialize Redis connection with retry logic
try {
  await connectWithRetry();
} catch (error) {
  console.error('Failed to connect to Redis after retries:', error);
  process.exit(1);
}

export default async function notificationRoutes(fastify: FastifyInstance) {
  // Route implementations with proper Redis error handling
  fastify.get('/notifications', {
    preHandler: [fastify.authenticate, authenticateTenant]
  }, async (request, reply) => {
    try {
      const { tenantSlug } = request.user;
      const notifications = await notificationService.getNotifications(tenantSlug);
      return reply.send(notifications);
    } catch (error: any) {
      if (error.code === 'ECONNREFUSED' || error.message.includes('Redis')) {
        request.log.error({ err: error }, 'Redis connection failed');
        return reply.code(503).send({ 
          error: 'Service Unavailable', 
          message: 'Notification service temporarily unavailable' 
        });
      }
      request.log.error({ err: error }, 'Failed to fetch notifications');
      return reply.code(500).send({ error: 'Internal Server Error' });
    }
  });
}