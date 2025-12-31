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
  } catch (error) {
    request.log.error({ err: error, provider, tenant: tenant.slug }, 'Webhook processing failed');
    return reply.code(500).send({ message: 'Failed to process webhook' });
  }
});