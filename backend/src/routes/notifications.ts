fastify.post('/send-email', {
  schema: {
    tags: ['Notifications'],
    body: {
      type: 'object',
      properties: {
        to: { type: 'string', format: 'email' },
        subject: { type: 'string', maxLength: 255 },
        body: { type: 'string' },
        tenantId: { type: 'string', pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' }
      },
      required: ['to', 'subject', 'body', 'tenantId'],
      additionalProperties: false
    }
  },
  preHandler: [fastify.authenticate, validate({
    body: {
      type: 'object',
      properties: {
        to: { type: 'string', format: 'email' },
        subject: { type: 'string', maxLength: 255 },
        body: { type: 'string' },
        tenantId: { type: 'string', pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' }
      },
      required: ['to', 'subject', 'body', 'tenantId'],
      additionalProperties: false
    }
  })]
}, async (request, reply) => {
  const { to, subject, body, tenantId } = request.body as { 
    to: string; 
    subject: string; 
    body: string; 
    tenantId: string;
  };
  
  try {
    // Attempt to send email
    await notificationService.sendEmail({
      to,
      subject,
      html: body,
      tenantId
    });
    
    return reply.code(200).send({ 
      message: 'Email sent successfully',
      status: 'sent'
    });
  } catch (error: any) {
    request.log.error({ err: error, to, subject, tenantId }, 'Email delivery failed');
    
    // Handle specific email delivery errors
    if (error.code === 'EENVELOPE' || error.code === 'EADDRNOTAVAIL') {
      return reply.code(400).send({ 
        message: 'Invalid email address',
        error: 'INVALID_EMAIL',
        status: 'failed'
      });
    }
    
    if (error.code === 'EMESSAGE' || error.code === 'ESTREAM') {
      return reply.code(400).send({ 
        message: 'Invalid email content',
        error: 'INVALID_CONTENT',
        status: 'failed'
      });
    }
    
    if (error.code === 'ETIMEDOUT' || error.code === 'ESOCKET') {
      return reply.code(503).send({ 
        message: 'Email service temporarily unavailable',
        error: 'SERVICE_UNAVAILABLE',
        status: 'failed'
      });
    }
    
    // Handle authentication/connection errors
    if (error.code === 'EAUTH' || error.code === 'ECONNREFUSED') {
      request.log.error({ err: error }, 'Email service authentication failed');
      return reply.code(503).send({ 
        message: 'Email service configuration error',
        error: 'CONFIGURATION_ERROR',
        status: 'failed'
      });
    }
    
    // Handle rate limiting
    if (error.responseCode === 454 || error.responseCode === 421) {
      return reply.code(429).send({ 
        message: 'Email service rate limit exceeded',
        error: 'RATE_LIMIT_EXCEEDED',
        status: 'failed'
      });
    }
    
    // Generic error response
    return reply.code(500).send({ 
      message: 'Failed to send email',
      error: 'EMAIL_DELIVERY_FAILED',
      status: 'failed'
    });
  }
});