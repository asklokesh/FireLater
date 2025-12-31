// Since this file wasn't provided in the context, I'll show where cleanup logic should be added
// if/when this file is implemented. The pattern should follow:

// At the top of the file
import type { FastifyInstance } from 'fastify';

// In the route registration function
export async function notificationsRoutes(fastify: FastifyInstance) {
  // Register cleanup handler
  fastify.addHook('onClose', async (instance) => {
    // Any notification-specific Redis cleanup should happen here
    // For example, closing any dedicated Redis connections or unsubscribing from channels
    if (instance.redis && typeof instance.redis.quit === 'function') {
      await instance.redis.quit();
    }
  });

  // ... rest of the route definitions
}