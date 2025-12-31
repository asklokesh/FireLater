fastify.post('/deliver', {
  schema: {
    body: {
      type: 'object',
      properties: {
        notificationId: { type: 'string', format: 'uuid' },
        recipient: { type: 'string' },
        channel: { type: 'string', enum: ['email', 'sms', 'slack', 'webhook'] }
      },
      required: ['notificationId', 'recipient', 'channel']
    }
  },
  preHandler: [fastify.authenticate, validate({
    body: {
      type: 'object',
      properties: {
        notificationId: { type: 'string', format: 'uuid' },
        recipient: { type: 'string' },
        channel: { type: 'string', enum: ['email', 'sms', 'slack', 'webhook'] }
      },
      required: ['notificationId', 'recipient', 'channel']
    }
  })]
}, async (request, reply) => {
  const { notificationId, recipient, channel } = request.body as {
    notificationId: string;
    recipient: string;
    channel: string;
  };
  const tenant = request.user.tenant;

  try {
    // Process notification delivery with proper error handling
    await notificationService.deliver(tenant.slug, notificationId, recipient, channel, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000
      }
    });

    return reply.code(200).send({ 
      message: 'Notification delivered successfully',
      notificationId,
      recipient,
      channel
    });
  } catch (error: any) {
    request.log.error({ 
      err: error, 
      notificationId, 
      recipient, 
      channel,
      tenant: tenant.slug 
    }, 'Notification delivery failed');

    // Handle specific delivery errors
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      return reply.code(503).send({ 
        message: 'External service unavailable', 
        notificationId,
        error: 'SERVICE_UNAVAILABLE' 
      });
    }

    if (error.response?.status >= 400 && error.response?.status < 500) {
      return reply.code(400).send({ 
        message: 'Invalid notification configuration or recipient', 
        notificationId,
        error: 'BAD_REQUEST',
        details: error.response.data
      });
    }

    if (error.response?.status >= 500) {
      return reply.code(502).send({ 
        message: 'External service error', 
        notificationId,
        error: 'BAD_GATEWAY' 
      });
    }

    // Handle timeout errors
    if (error.code === 'ECONNABORTED' || error.name === 'TimeoutError') {
      return reply.code(408).send({ 
        message: 'Request timeout when delivering notification', 
        notificationId,
        error: 'REQUEST_TIMEOUT' 
      });
    }

    // Handle network errors
    if (error.code === 'ENETUNREACH' || error.code === 'EHOSTUNREACH') {
      return reply.code(503).send({ 
        message: 'Network error when delivering notification', 
        notificationId,
        error: 'NETWORK_ERROR' 
      });
    }

    // Handle delivery-specific errors
    if (error.name === 'DeliveryError') {
      return reply.code(422).send({ 
        message: 'Notification delivery failed', 
        notificationId,
        error: 'DELIVERY_FAILED',
        details: error.message
      });
    }

    return reply.code(500).send({ 
      message: 'Failed to deliver notification', 
      notificationId,
      error: 'INTERNAL_ERROR' 
    });
  }
});