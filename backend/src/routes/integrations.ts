// Add this export for testing purposes at the top of the file
export const webhookHandlers = {
  handleWebhook: async (request: FastifyRequest, reply: FastifyReply) => {
    const { provider } = request.params as { provider: string };
    const payload = request.body as Record<string, any>;
    const tenant = request.user.tenant;
    
    try {
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
      
      if (error.code === 'ECONNABORTED' || error.name === 'TimeoutError') {
        return reply.code(408).send({ 
          message: 'Request timeout when connecting to external service', 
          provider,
          error: 'REQUEST_TIMEOUT' 
        });
      }
      
      if (error.code === 'ENETUNREACH' || error.code === 'EHOSTUNREACH') {
        return reply.code(503).send({ 
          message: 'Network error when connecting to external service', 
          provider,
          error: 'NETWORK_ERROR' 
        });
      }
      
      if (error.code === 'ENOTFOUND' || error.code === 'EAI_AGAIN') {
        return reply.code(503).send({
          message: 'DNS lookup failed for external service',
          provider,
          error: 'DNS_ERROR'
        });
      }
      
      if (error.code === 'CERT_HAS_EXPIRED' || error.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' || 
          error.code === 'SELF_SIGNED_CERT_IN_CHAIN' || error.code === 'ERR_TLS_CERT_ALTNAME_INVALID') {
        return reply.code(503).send({
          message: 'SSL/TLS certificate error when connecting to external service',
          provider,
          error: 'SSL_ERROR'
        });
      }
      
      if (error.code === 'ETIMEDOUT') {
        return reply.code(408).send({
          message: 'Connection timeout when connecting to external service',
          provider,
          error: 'CONNECTION_TIMEOUT'
        });
      }
      
      return reply.code(500).send({ 
        message: 'Failed to process webhook', 
        provider,
        error: 'INTERNAL_ERROR' 
      });
    }
  }
};

// Update the route registration to use the exported handler
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
}, webhookHandlers.handleWebhook);