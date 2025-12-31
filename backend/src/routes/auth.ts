  // Login route with stricter rate limiting
  app.post('/login', {
    config: {
      rateLimit: {
        ...loginRateLimit,
        keyGenerator: (request: FastifyRequest) => {
          const forwardedFor = request.headers['x-forwarded-for'];
          if (typeof forwardedFor === 'string') {
            return forwardedFor.split(',')[0].trim();
          }
          return request.ip || request.socket.remoteAddress || 'unknown';
        }
      }
    }
  }, async (request, reply) => {
    const { email, password, tenantSlug } = loginSchema.parse(request.body);
    
    // Validate tenantSlug format to prevent injection
    if (!tenantSlug || typeof tenantSlug !== 'string' || !tenantSlug.match(/^[a-zA-Z0-9][a-zA-Z0-9\-]*[a-zA-Z0-9]$|^[a-zA-Z0-9]$/)) {
      throw new BadRequestError('Invalid tenant identifier');
    }