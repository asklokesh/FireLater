fastify.post('/send', {
  schema: {
    tags: ['Notifications'],
    body: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['email', 'sms', 'slack', 'webhook'] },
        recipient: { type: 'string' },
        subject: { type: 'string' },
        content: { type: 'string' },
        metadata: { type: 'object' }
      },
      required: ['type', 'recipient', 'content']
    }
  },
  preHandler: [fastify.authenticate]
}, async (request, reply) => {
  const { type, recipient, subject, content, metadata } = request.body as any;
  const tenant = request.user.tenant;
  
  try {
    // Process notification with retry configuration
    await notificationService.send(tenant.slug, {
      type,
      recipient,
      subject,
      content,
      metadata
    }, {
      attempts: 5,
      backoff: {
        type: 'exponential',
        delay: 2000
      },
      jitter: 0.3
    });
    
    return reply.code(202).send({ message: 'Notification queued for delivery' });
  } catch (error: any) {
    request.log.error({ err: error, tenant: tenant.slug, type }, 'Notification delivery failed');
    
    // Handle specific error cases
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      return reply.code(503).send({ 
        message: 'External notification service unavailable', 
        type,
        error: 'SERVICE_UNAVAILABLE' 
      });
    }
    
    if (error.response?.status >= 400 && error.response?.status < 500) {
      return reply.code(400).send({ 
        message: 'Invalid notification payload or configuration', 
        type,
        error: 'BAD_REQUEST',
        details: error.response.data
      });
    }
    
    if (error.response?.status >= 500) {
      return reply.code(502).send({ 
        message: 'External notification service error', 
        type,
        error: 'BAD_GATEWAY' 
      });
    }
    
    // Handle timeout errors
    if (error.code === 'ECONNABORTED' || error.name === 'TimeoutError') {
      return reply.code(408).send({ 
        message: 'Request timeout when connecting to notification service', 
        type,
        error: 'REQUEST_TIMEOUT' 
      });
    }
    
    // Handle network errors
    if (error.code === 'ENETUNREACH' || error.code === 'EHOSTUNREACH') {
      return reply.code(503).send({ 
        message: 'Network error when connecting to notification service', 
        type,
        error: 'NETWORK_ERROR' 
      });
    }
    
    // Handle DNS lookup failures
    if (error.code === 'ENOTFOUND' || error.code === 'EAI_AGAIN') {
      return reply.code(503).send({
        message: 'DNS lookup failed for notification service',
        type,
        error: 'DNS_ERROR'
      });
    }
    
    // Handle SSL/TLS errors
    if (error.code === 'CERT_HAS_EXPIRED' || error.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' || 
        error.code === 'SELF_SIGNED_CERT_IN_CHAIN' || error.code === 'ERR_TLS_CERT_ALTNAME_INVALID') {
      return reply.code(503).send({
        message: 'SSL/TLS certificate error when connecting to notification service',
        type,
        error: 'SSL_ERROR'
      });
    }
    
    // Handle connection timeout errors
    if (error.code === 'ETIMEDOUT') {
      return reply.code(408).send({
        message: 'Connection timeout when connecting to notification service',
        type,
        error: 'CONNECTION_TIMEOUT'
      });
    }
    
    return reply.code(500).send({ 
      message: 'Failed to queue notification', 
      type,
      error: 'INTERNAL_ERROR' 
    });
  }
});