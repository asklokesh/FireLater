fastify.post('/webhooks/:provider', {
  schema: {
    tags: ['Notifications'],
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
          enum: ['slack', 'teams', 'webhook', 'email']
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
    await notificationService.processWebhook(tenant.slug, provider, payload, {
      attempts: 5,
      backoff: {
        type: 'exponential',
        delay: 2000
      },
      timeout: 30000
    });
    
    return reply.code(200).send({ message: 'Webhook queued for delivery' });
  } catch (error: any) {
    request.log.error({ err: error, provider, tenant: tenant.slug }, 'Webhook queuing failed');
    return reply.code(500).send({ 
      message: 'Failed to queue webhook for delivery', 
      provider,
      error: 'INTERNAL_ERROR' 
    });
  }
});