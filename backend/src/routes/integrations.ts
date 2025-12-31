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
  preHandler: [fastify.authenticate]
}, async (request, reply) => {
  const { provider } = request.params as { provider: string };
  const payload = request.body as Record<string, any>;
  const tenant = request.user.tenant;
  
  try {
    // Validate provider
    if (!['github', 'slack', 'pagerduty', 'datadog'].includes(provider)) {
      return reply.code(400).send({ 
        error: 'Unsupported webhook provider',
        code: 'INVALID_PROVIDER'
      });
    }
    
    // Process webhook
    await webhooksService.process(tenant.slug, provider, payload);
    
    return reply.code(200).send({ message: 'Webhook processed successfully' });
  } catch (error: any) {
    fastify.log.error({ error }, 'Webhook processing failed');
    
    // Handle specific error types
    if (error.code === 'EXTERNAL_API_ERROR') {
      return reply.code(502).send({ 
        error: 'External service error',
        code: 'EXTERNAL_API_ERROR',
        details: error.message
      });
    }
    
    if (error.code === 'VALIDATION_ERROR') {
      return reply.code(400).send({ 
        error: 'Invalid webhook payload',
        code: 'VALIDATION_ERROR',
        details: error.message
      });
    }
    
    return reply.code(500).send({ 
      error: 'Failed to process webhook',
      code: 'WEBHOOK_PROCESSING_ERROR'
    });
  }
});