import Fastify, { FastifyInstance } from 'fastify';

// Add Redis cleanup to the main server file close handler
// This should be added where the Fastify server is initialized

const server = Fastify({
  // existing configuration
  logger: true,
});

// Add server close handler for Redis cleanup
server.addHook('onClose', async (instance: FastifyInstance) => {
  if ((instance as any).redis && typeof (instance as any).redis.quit === 'function') {
    try {
      await (instance as any).redis.quit();
    } catch (error) {
      instance.log.error({ err: error }, 'Error closing Redis connection');
    }
  }
});

export { server };