fastify.post('/send', {
  schema: {
    body: {
      type: 'object',
      properties: {
        userId: { type: 'string', pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' },
        message: { type: 'string', maxLength: 1000 },
        type: { type: 'string', enum: ['email', 'sms', 'push', 'slack'] }
      },
      required: ['userId', 'message', 'type']
    }
  },
  preHandler: [fastify.authenticate, validate({
    body: {
      type: 'object',
      properties: {
        userId: { type: 'string', pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' },
        message: { type: 'string', maxLength: 1000 },
        type: { type: 'string', enum: ['email', 'sms', 'push', 'slack'] }
      },
      required: ['userId', 'message', 'type']
    }
  })]
}, async (request, reply) => {
  const { userId, message, type } = request.body as { userId: string; message: string; type: string };
  const tenantSlug = request.user.tenant.slug;

  try {
    // Check Redis connection before attempting to queue notification
    await redis.ping();
    
    const notificationId = await notificationService.queueNotification({
      tenantSlug,
      userId,
      message,
      type
    });

    return reply.code(202).send({ 
      id: notificationId, 
      message: 'Notification queued successfully' 
    });
  } catch (error: any) {
    request.log.error({ err: error, tenant: tenantSlug }, 'Failed to queue notification');
    
    // Handle Redis connection errors specifically
    if (error.code === 'ECONNREFUSED' || error.message?.includes('connect ECONNREFUSED')) {
      return reply.code(503).send({ 
        message: 'Notification service temporarily unavailable', 
        error: 'SERVICE_UNAVAILABLE' 
      });
    }
    
    if (error.code === 'ETIMEDOUT' || error.message?.includes('timeout')) {
      return reply.code(504).send({ 
        message: 'Notification service timeout', 
        error: 'GATEWAY_TIMEOUT' 
      });
    }
    
    return reply.code(500).send({ 
      message: 'Failed to send notification', 
      error: 'INTERNAL_ERROR' 
    });
  }
});