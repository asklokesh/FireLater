fastify.post('/notifications/send', {
  schema: {
    tags: ['Notifications'],
    body: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['email', 'sms', 'slack', 'webhook'] },
        recipients: { 
          type: 'array',
          items: { type: 'string' }
        },
        subject: { type: 'string' },
        content: { type: 'string' },
        priority: { type: 'string', enum: ['low', 'normal', 'high', 'urgent'] }
      },
      required: ['type', 'recipients', 'content']
    }
  },
  preHandler: [fastify.authenticate, validate({
    body: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['email', 'sms', 'slack', 'webhook'] },
        recipients: { 
          type: 'array',
          items: { type: 'string' }
        },
        subject: { type: 'string' },
        content: { type: 'string' },
        priority: { type: 'string', enum: ['low', 'normal', 'high', 'urgent'] }
      },
      required: ['type', 'recipients', 'content']
    }
  })]
}, async (request, reply) => {
  const { type, recipients, subject, content, priority = 'normal' } = request.body as any;
  const tenant = request.user.tenant;
  
  try {
    // Attempt to queue notification via Redis
    await notificationService.queueNotification({
      tenantId: tenant.id,
      type,
      recipients,
      subject,
      content,
      priority
    });
    
    return reply.code(202).send({ 
      message: 'Notification queued successfully',
      status: 'queued'
    });
  } catch (error: any) {
    request.log.error({ err: error, tenant: tenant.slug }, 'Failed to queue notification');
    
    // Handle Redis-specific connection errors
    if (error.code === 'ECONNREFUSED' || 
        error.code === 'ENOTFOUND' || 
        error.message?.includes('connect ECONNREFUSED') ||
        error.message?.includes('Redis connection failed')) {
      return reply.code(503).send({ 
        message: 'Notification service temporarily unavailable',
        error: 'NOTIFICATION_SERVICE_UNAVAILABLE',
        status: 'failed'
      });
    }
    
    // Handle Redis timeout errors
    if (error.code === 'ETIMEDOUT' || 
        error.name === 'TimeoutError' ||
        error.message?.includes('timeout')) {
      return reply.code(408).send({ 
        message: 'Notification service timeout',
        error: 'NOTIFICATION_SERVICE_TIMEOUT',
        status: 'failed'
      });
    }
    
    // Handle Redis authentication errors
    if (error.message?.includes('NOAUTH') || 
        error.message?.includes('WRONGPASS') ||
        error.code === 'ERR_NOAUTH') {
      request.log.fatal('Redis authentication failed - check Redis credentials');
      return reply.code(500).send({ 
        message: 'Notification service configuration error',
        error: 'NOTIFICATION_SERVICE_CONFIG_ERROR',
        status: 'failed'
      });
    }
    
    // Handle Redis memory errors
    if (error.message?.includes('OOM') || 
        error.message?.includes('max memory')) {
      return reply.code(507).send({ 
        message: 'Notification service out of memory',
        error: 'NOTIFICATION_SERVICE_OOM',
        status: 'failed'
      });
    }
    
    // Generic error handling
    return reply.code(500).send({ 
      message: 'Failed to send notification',
      error: 'NOTIFICATION_SEND_FAILED',
      status: 'failed'
    });
  }
});