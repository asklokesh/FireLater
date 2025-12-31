import { FastifyInstance } from 'fastify';
import { notificationService } from '../services/notifications.js';
import { authenticateTenant } from '../middleware/auth.js';

export async function notificationRoutes(fastify: FastifyInstance) {
  // Register cleanup handler for graceful shutdown
  fastify.addHook('onClose', async (instance) => {
    if (notificationService.redisClient) {
      await notificationService.redisClient.quit();
    }
  });

  // ... existing route definitions
}