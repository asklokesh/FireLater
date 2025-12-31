fastify.post('/send', {
  schema: {
    body: {
      type: 'object',
      properties: {
        to: { type: 'string', format: 'email' },
        subject: { type: 'string' },
        body: { type: 'string' },
        templateId: { type: 'string' }
      },
      required: ['to', 'subject', 'body']
    }
  },
  preHandler: [fastify.authenticate, validate]
}, async (request, reply) => {
  const { to, subject, body, templateId } = request.body as {
    to: string;
    subject: string;
    body: string;
    templateId?: string;
  };

  try {
    const result = await notificationService.sendEmail({
      to,
      subject,
      body,
      templateId,
      tenantSlug: request.tenantSlug!
    });

    if (!result.success) {
      request.log.warn({
        to,
        subject,
        error: result.error,
        tenant: request.tenantSlug
      }, 'Email delivery failed');

      return reply.code(500).send({
        message: 'Failed to send notification',
        error: result.error
      });
    }

    return reply.code(200).send({
      message: 'Notification sent successfully',
      id: result.id
    });
  } catch (error: any) {
    request.log.error({
      err: error,
      to,
      subject,
      tenant: request.tenantSlug
    }, 'Unexpected error sending notification');

    return reply.code(500).send({
      message: 'Failed to send notification',
      error: error.message || 'Internal server error'
    });
  }
});