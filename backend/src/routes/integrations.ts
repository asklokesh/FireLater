fastify.post('/webhooks/:provider', {
  schema: {
    tags: ['Integrations'],
    params: {
      type: 'object',
      properties: {
        provider: { type: 'string' }
      },
      required: ['provider']
    },
    body: {
      type: 'object',
      additionalProperties: true
    }
  },
  preHandler: [fastify.authenticate, validate({
    params: {
      type: 'object',
      properties: {
        provider: { 
          type: 'string',
          enum: ['github', 'slack', 'pagerduty', 'datadog']
        }
      },
      required: ['provider']
    },
    body: {
      type: 'object',
      additionalProperties: true
    }
  })]
}, async (request, reply) => {
  const { provider } = request.params as { provider: string };
  const payload = request.body as Record<string, any>;
  const tenant = request.user.tenant;
  
  try {
    // Process webhook with retry configuration
    await webhooksService.process(tenant.slug, provider, payload, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000
      }
    });
    
    return reply.code(200).send({ message: 'Webhook processed successfully' });
  } catch (error: any) {
    request.log.error({ err: error, provider, tenant: tenant.slug }, 'Webhook processing failed');
    
    // Handle specific error cases
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      return reply.code(503).send({ 
        message: 'External service unavailable', 
        provider,
        error: 'SERVICE_UNAVAILABLE' 
      });
    }
    
    if (error.response?.status >= 400 && error.response?.status < 500) {
      return reply.code(400).send({ 
        message: 'Invalid webhook payload or configuration', 
        provider,
        error: 'BAD_REQUEST',
        details: error.response.data
      });
    }
    
    if (error.response?.status >= 500) {
      return reply.code(502).send({ 
        message: 'External service error', 
        provider,
        error: 'BAD_GATEWAY' 
      });
    }
    
    // Handle timeout errors
    if (error.code === 'ECONNABORTED' || error.name === 'TimeoutError') {
      return reply.code(408).send({ 
        message: 'Request timeout when connecting to external service', 
        provider,
        error: 'REQUEST_TIMEOUT' 
      });
    }
    
    // Handle network errors
    if (error.code === 'ENETUNREACH' || error.code === 'EHOSTUNREACH') {
      return reply.code(503).send({ 
        message: 'Network error when connecting to external service', 
        provider,
        error: 'NETWORK_ERROR' 
      });
    }
    
    return reply.code(500).send({ 
      message: 'Failed to process webhook', 
      provider,
      error: 'INTERNAL_ERROR' 
    });
  }
});