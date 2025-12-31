// Add Redis cleanup to the main server file close handler
// This should be added where the Fastify server is initialized

const server = fastify({
  // existing configuration
});

// Add server close handler for Redis cleanup
server.addHook('onClose', async (instance) => {
  if (instance.redis && typeof instance.redis.quit === 'function') {
    try {
      await instance.redis.quit();
    } catch (error) {
      instance.log.error('Error closing Redis connection:', error);
    }
  }
});