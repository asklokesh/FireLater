import { FastifyInstance } from 'fastify';
import { notificationService } from '../services/notifications.js';
import { redisClient } from '../config/redis.js';

export default async function notificationRoutes(fastify: FastifyInstance) {
  // Register cleanup handler for Redis connection
  fastify.addHook('onClose', async () => {
    if (redisClient.isOpen) {
      await redisClient.quit();
    }
  });

  // Existing route definitions...
}