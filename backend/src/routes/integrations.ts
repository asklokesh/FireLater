// Add error handling for external API calls in integration setup/operations
fastify.post('/setup', {
  preHandler: [authMiddleware, tenantMiddleware]
}, async (request, reply) => {
  const { provider, config } = request.body as { provider: string; config: Record<string, any> };
  const tenant = request.user.tenant;
  
  try {
    // Validate integration configuration with external service
    const result = await integrationsService.setup(tenant.slug, provider, config);
    return reply.code(201).send(result);
  } catch (error: any) {
    request.log.error({ err: error, provider, tenant: tenant.slug }, 'Integration setup failed');
    
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      return reply.code(503).send({ 
        message: 'External service unavailable during setup', 
        provider,
        error: 'SERVICE_UNAVAILABLE' 
      });
    }
    
    if (error.response?.status === 401 || error.response?.status === 403) {
      return reply.code(400).send({ 
        message: 'Invalid credentials for external service', 
        provider,
        error: 'INVALID_CREDENTIALS' 
      });
    }
    
    if (error.response?.status >= 400 && error.response?.status < 500) {
      return reply.code(400).send({ 
        message: 'Invalid configuration for external service', 
        provider,
        error: 'BAD_REQUEST',
        details: error.response.data
      });
    }
    
    if (error.response?.status >= 500) {
      return reply.code(502).send({ 
        message: 'External service error during setup', 
        provider,
        error: 'BAD_GATEWAY' 
      });
    }
    
    return reply.code(500).send({ 
      message: 'Failed to setup integration', 
      provider,
      error: 'SETUP_FAILED' 
    });
  }
});