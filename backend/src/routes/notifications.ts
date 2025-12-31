// Around lines where fastify.redis is used, wrap in try/catch
// Example pattern for Redis GET operations:
const cachedResult = await fastify.redis.get(cacheKey);
// Should become:
let cachedResult = null;
try {
  cachedResult = await fastify.redis.get(cacheKey);
} catch (redisError) {
  request.log.error({ err: redisError, cacheKey }, 'Failed to retrieve from Redis cache');
  // Continue without cache rather than crashing
}

// Example pattern for Redis SET operations:
await fastify.redis.setex(cacheKey, 300, JSON.stringify(result));
// Should become:
try {
  await fastify.redis.setex(cacheKey, 300, JSON.stringify(result));
} catch (redisError) {
  request.log.error({ err: redisError, cacheKey }, 'Failed to store in Redis cache');
  // Continue without cache rather than crashing
}