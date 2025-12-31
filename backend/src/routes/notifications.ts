fastify.post('/send', {
  schema: {
    body: {
      type: 'object',
      properties: {
        to: { type: 'string', format: 'email' },
        subject: { type: 'string', minLength: 1, maxLength: 255 },
        body: { type: 'string', minLength: 1 },
        templateId: { type: 'string', pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' }
      },
      required: ['to', 'subject', 'body']
    }
  },
  preHandler: [fastify.authenticate, validate({
    body: {
      type: 'object',
      properties: {
        to: { type: 'string', format: 'email' },
        subject: { type: 'string', minLength: 1, maxLength: 255 },
        body: { type: 'string', minLength: 1 },
        templateId: { type: 'string', pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' }
      },
      required: ['to', 'subject', 'body']
    }
  })]
}, async (request, reply) => {
  const { to, subject, body, templateId } = request.body as { 
    to: string; 
    subject: string; 
    body: string; 
    templateId?: string;
  };
  
  try {
    await notificationService.sendEmail({
      to,
      subject,
      body,
      templateId
    });
    
    return { message: 'Email sent successfully' };
  } catch (error: any) {
    request.log.error({ err: error, to, subject }, 'Failed to send email notification');
    
    // Handle specific email delivery errors
    if (error.code === 'EENVELOPE' || error.code === 'EENVELOPE_ADDRESS') {
      return reply.code(400).send({ 
        message: 'Invalid email address', 
        error: 'INVALID_EMAIL_ADDRESS' 
      });
    }
    
    if (error.code === 'EMESSAGE' || error.code === 'ESTREAM') {
      return reply.code(400).send({ 
        message: 'Invalid email content', 
        error: 'INVALID_EMAIL_CONTENT' 
      });
    }
    
    // Handle SMTP connection errors
    if (error.code === 'ESOCKET' || error.code === 'ECONNECTION') {
      return reply.code(503).send({ 
        message: 'Email service unavailable', 
        error: 'EMAIL_SERVICE_UNAVAILABLE' 
      });
    }
    
    // Handle authentication errors
    if (error.code === 'EAUTH') {
      return reply.code(503).send({ 
        message: 'Email service authentication failed', 
        error: 'EMAIL_AUTH_FAILED' 
      });
    }
    
    // Handle rate limiting
    if (error.code === 'ETOOMANYREQUESTS') {
      return reply.code(429).send({ 
        message: 'Email sending rate limit exceeded', 
        error: 'RATE_LIMIT_EXCEEDED' 
      });
    }
    
    // Handle general delivery failures
    if (error.response?.status >= 400 && error.response?.status < 500) {
      return reply.code(400).send({ 
        message: 'Email delivery failed due to client error', 
        error: 'EMAIL_DELIVERY_FAILED',
        details: error.response.data
      });
    }
    
    if (error.response?.status >= 500) {
      return reply.code(502).send({ 
        message: 'Email service error', 
        error: 'BAD_GATEWAY' 
      });
    }
    
    // Handle timeout errors
    if (error.code === 'ECONNABORTED' || error.name === 'TimeoutError') {
      return reply.code(408).send({ 
        message: 'Email delivery timeout', 
        error: 'REQUEST_TIMEOUT' 
      });
    }
    
    // Handle network errors
    if (error.code === 'ENETUNREACH' || error.code === 'EHOSTUNREACH') {
      return reply.code(503).send({ 
        message: 'Network error when connecting to email service', 
        error: 'NETWORK_ERROR' 
      });
    }
    
    return reply.code(500).send({ 
      message: 'Failed to send email notification', 
      error: 'INTERNAL_ERROR' 
    });
  }
});