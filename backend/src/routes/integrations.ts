// Add webhook handling route after the setup route
fastify.post('/webhook/:provider', {
  schema: {
    params: {
      type: 'object',
      required: ['provider'],
      properties: {
        provider: { type: 'string' }
      }
    },
    body: {
      type: 'object',
      additionalProperties: true
    }
  }
}, async (request, reply) => {
  const { provider } = request.params as { provider: string };
  const payload = request.body as Record<string, any>;
  const signature = request.headers['x-hub-signature'] || request.headers['x-signature'];
  
  try {
    // Get tenant context from request headers or payload
    const { tenantSlug } = getTenantContext(request);
    
    if (!tenantSlug) {
      request.log.warn({ provider }, 'Webhook received without tenant context');
      return reply.code(400).send({ message: 'Tenant context required' });
    }
    
    // Validate webhook signature if required by the provider
    const isValid = await integrationsService.validateWebhookSignature(
      tenantSlug, 
      provider, 
      payload, 
      signature as string
    );
    
    if (!isValid) {
      request.log.warn({ provider, tenantSlug }, 'Invalid webhook signature');
      return reply.code(401).send({ message: 'Invalid signature' });
    }
    
    // Process the webhook event
    await integrationsService.handleWebhookEvent(tenantSlug, provider, payload);
    
    return reply.code(200).send({ message: 'Webhook processed successfully' });
  } catch (error: any) {
    request.log.error({ err: error, provider }, 'Webhook processing failed');
    
    // Handle specific integration errors
    if (error.code === 'TENANT_NOT_FOUND') {
      return reply.code(404).send({ message: 'Tenant not found' });
    }
    
    if (error.code === 'INVALID_PROVIDER') {
      return reply.code(400).send({ message: 'Unsupported provider' });
    }
    
    // Handle external API call errors
    if (error.code === 'EXTERNAL_API_ERROR') {
      return reply.code(502).send({ 
        message: 'External service error', 
        details: error.message 
      });
    }
    
    if (error.code === 'EXTERNAL_API_TIMEOUT') {
      return reply.code(504).send({ 
        message: 'External service timeout', 
        details: error.message 
      });
    }
    
    // Handle network errors
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      return reply.code(502).send({ 
        message: 'Network error connecting to external service',
        details: error.message 
      });
    }
    
    return reply.code(500).send({ message: 'Webhook processing failed' });
  }
});