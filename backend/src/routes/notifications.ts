fastify.post('/notifications/send', {
  schema: {
    tags: ['Notifications'],
    body: {
      type: 'object',
      properties: {
        to: { type: 'string', format: 'email' },
        subject: { type: 'string' },
        body: { type: 'string' },
        templateId: { type: 'string' },
        templateData: { type: 'object' }
      },
      required: ['to', 'subject', 'body']
    }
  },
  preHandler: [fastify.authenticate]
}, async (request, reply) => {
  const { to, subject, body, templateId, templateData } = request.body as {
    to: string;
    subject: string;
    body: string;
    templateId?: string;
    templateData?: Record<string, any>;
  };
  const tenant = request.user.tenant;

  try {
    // Send email with retry configuration
    await emailService.send({
      to,
      subject,
      body,
      templateId,
      templateData,
      tenantSlug: tenant.slug
    }, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000
      }
    });

    return reply.code(200).send({ message: 'Notification sent successfully' });
  } catch (error: any) {
    request.log.error({ err: error, to, tenant: tenant.slug }, 'Email delivery failed');

    // Handle specific email delivery errors
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      return reply.code(503).send({ 
        message: 'Email service unavailable', 
        error: 'SERVICE_UNAVAILABLE' 
      });
    }

    if (error.response?.status === 429) {
      return reply.code(429).send({ 
        message: 'Rate limit exceeded with email provider', 
        error: 'RATE_LIMIT_EXCEEDED' 
      });
    }

    if (error.code === 'ECONNABORTED' || error.name === 'TimeoutError') {
      return reply.code(408).send({ 
        message: 'Email delivery timeout', 
        error: 'REQUEST_TIMEOUT' 
      });
    }

    // Handle invalid recipient errors
    if (error.message?.includes('Invalid recipient') || 
        error.response?.status === 400) {
      return reply.code(400).send({ 
        message: 'Invalid email recipient', 
        error: 'INVALID_RECIPIENT' 
      });
    }

    // Handle authentication errors with email provider
    if (error.code === 'EAUTH' || error.message?.includes('Authentication')) {
      return reply.code(503).send({ 
        message: 'Email provider authentication failed', 
        error: 'AUTHENTICATION_FAILED' 
      });
    }

    // Generic error for unhandled cases
    return reply.code(500).send({ 
      message: 'Failed to send notification', 
      error: 'INTERNAL_ERROR' 
    });
  }
});