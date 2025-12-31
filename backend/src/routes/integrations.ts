// Add webhook handling route with proper validation and error handling
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
  }
}, async (request, reply) => {
  const { provider } = request.params as { provider: string };
  const payload = request.body as Record<string, any>;
  const tenant = (request as any).tenant;
  
  try {
    // Validate provider
    if (!['github', 'slack', 'pagerduty', 'datadog'].includes(provider)) {
      return reply.code(400).send({ error: 'Unsupported webhook provider' });
    }
    
    // Process webhook
    await webhooksService.process(tenant.slug, provider, payload);
    
    return reply.code(200).send({ message: 'Webhook processed successfully' });
  } catch (error) {
    fastify.log.error({ error }, 'Webhook processing failed');
    return reply.code(500).send({ error: 'Failed to process webhook' });
  }
});