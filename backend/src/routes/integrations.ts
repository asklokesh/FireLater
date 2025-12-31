// Add input sanitization utility
const sanitizeInput = (input: string): string => {
  return input.replace(/[<>{}[\]|\\^`]/g, '').trim();
};

// List webhooks with caching and input sanitization
fastify.get('/webhooks', async (request, reply) => {
  const tenant = (request as any).tenant;
  const query = request.query as Record<string, any>;
  
  // Sanitize query parameters
  const sanitizedQuery: Record<string, any> = {};
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === 'string') {
      sanitizedQuery[key] = sanitizeInput(value);
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      sanitizedQuery[key] = value;
    }
    // Ignore other types to prevent injection
  }
  
  // Generate cache key
  const cacheKey = generateIntegrationsCacheKey(tenant.slug, 'webhooks', sanitizedQuery);
  
  // Try to get from cache first
  const cachedData = await fastify.redis.get(cacheKey);
  if (cachedData) {
    reply.header('X-Cache', 'HIT');
    return { data: JSON.parse(cachedData) };
  }
  
  try {
    // Implement retry logic for external API calls
    let webhooks;
    let lastError;
    
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        webhooks = await Promise.race([
          webhooksService.list(tenant.slug, sanitizedQuery),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Webhooks fetch timeout')), 30000)
          )
        ]);
        lastError = null;
        break;
      } catch (error) {
        lastError = error;
        if (attempt < 3) {
          // Exponential backoff: 1s, 2s, 4s
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        }
      }
    }
    
    if (lastError) {
      throw lastError;
    }
    
    // Cache the result for 5 minutes
    await fastify.redis.setex(cacheKey, 300, JSON.stringify(webhooks));
    reply.header('X-Cache', 'MISS');
    
    return { data: webhooks };
  } catch (error) {
    fastify.log.error({ error }, 'Failed to fetch webhooks');
    return reply.code(500).send({ error: 'Failed to fetch webhooks' });
  }
});