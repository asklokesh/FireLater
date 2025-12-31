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
      required: ['to', 'subject', 'body', 'tenantId']
    }
  }
}, async (request, reply) => {
  const { to, subject, body, tenantId } = request.body as {
    to: string;
    subject: string;
    body: string;
    tenantId: string;
  };

  try {
    // Validate tenant exists
    const tenant = await tenantService.getById(tenantId);
    if (!tenant) {
      return reply.code(404).send({ error: 'Tenant not found' });
    }

    // Send email with proper error handling
    const result = await emailService.send({
      to,
      subject,
      body,
      tenantId
    });

    if (!result.success) {
      // Log delivery failure but don't crash the process
      fastify.log.error({
        error: result.error,
        to,
        subject,
        tenantId
      }, 'Email delivery failed');
      
      return reply.code(500).send({ 
        error: 'Failed to send email',
        code: 'EMAIL_DELIVERY_FAILED'
      });
    }

    return { success: true, messageId: result.messageId };
  } catch (error: any) {
    // Handle unexpected errors
    fastify.log.error({ error }, 'Unexpected error sending email');
    return reply.code(500).send({ 
      error: 'Failed to send email',
      code: 'EMAIL_SEND_ERROR'
    });
  }
});