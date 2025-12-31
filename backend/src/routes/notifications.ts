fastify.get('/notifications', {
  preHandler: [fastify.authenticate]
}, async (request, reply) => {
  const tenant = (request as any).tenant;
  const userId = (request as any).user.id;
  
  // Generate cache key
  const cacheKey = `notifications:${tenant.slug}:${userId}:recent`;
  
  // Try to get from cache first
  try {
    const cachedData = await fastify.redis.get(cacheKey);
    if (cachedData) {
      reply.header('X-Cache', 'HIT');
      return { data: JSON.parse(cachedData) };
    }
  } catch (redisError) {
    fastify.log.warn({ err: redisError }, 'Failed to retrieve notifications from cache');
    // Continue without cache
  }
  
  try {
    const notifications = await notificationService.getRecentForUser(tenant.slug, userId);
    
    // Cache the result for 2 minutes
    try {
      await fastify.redis.setex(cacheKey, 120, JSON.stringify(notifications));
    } catch (redisError) {
      fastify.log.warn({ err: redisError }, 'Failed to cache notifications');
      // Non-critical - continue without caching
    }
    
    reply.header('X-Cache', 'MISS');
    return { data: notifications };
  } catch (error) {
    fastify.log.error({ error }, 'Failed to fetch notifications');
    return reply.code(500).send({ error: 'Failed to fetch notifications' });
  }
});