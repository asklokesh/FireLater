// Replace the webhook error handling block with proper retry logic
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
    
    // Process the webhook event with retry logic
    const maxRetries = 3;
    const retryDelay = 1000; // 1 second
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await integrationsService.handleWebhookEvent(tenantSlug, provider, payload);
        return reply.code(200).send({ message: 'Webhook processed successfully' });
      } catch (error: any) {
        lastError = error;
        request.log.warn({ 
          err: error, 
          provider, 
          attempt,
          tenantSlug 
        }, `Webhook processing attempt ${attempt} failed`);
        
        // Don't retry on validation or auth errors
        if (error.code === 'TENANT_NOT_FOUND' || 
            error.code === 'INVALID_PROVIDER' || 
            error.code === 'INVALID_SIGNATURE') {
          break;
        }
        
        // Exponential backoff for retryable errors
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, retryDelay * Math.pow(2, attempt - 1)));
        }
      }
    }
    
    // If we get here, all retries failed
    request.log.error({ 
      err: lastError, 
      provider, 
      tenantSlug 
    }, 'Webhook processing failed after all retries');
    
    // Handle specific integration errors
    if (lastError && (lastError as any).code === 'TENANT_NOT_FOUND') {
      return reply.code(404).send({ message: 'Tenant not found' });
    }
    
    if (lastError && (lastError as any).code === 'INVALID_PROVIDER') {
      return reply.code(400).send({ message: 'Unsupported provider' });
    }
    
    // Handle external API call errors
    if (lastError && (lastError as any).code === 'EXTERNAL_API_ERROR') {
      return reply.code(502).send({ 
        message: 'External service error', 
        details: (lastError as any).message 
      });
    }
    
    if (lastError && (lastError as any).code === 'EXTERNAL_API_TIMEOUT') {
      return reply.code(504).send({ 
        message: 'External service timeout', 
        details: (lastError as any).message 
      });
    }
    
    // Handle network errors
    if (lastError && ((lastError as any).code === 'ENOTFOUND' || (lastError as any).code === 'ECONNREFUSED')) {
      return reply.code(502).send({ 
        message: 'Network error connecting to external service',
        details: (lastError as any).message 
      });
    }
    
    return reply.code(500).send({ message: 'Webhook processing failed after retries' });
  } catch (error: any) {
    request.log.error({ err: error, provider }, 'Unexpected error in webhook processing');
    return reply.code(500).send({ message: 'Internal server error' });
  }
});