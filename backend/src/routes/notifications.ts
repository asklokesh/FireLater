fastify.post('/send-email', {
  schema: sendEmailSchema,
  preHandler: [fastify.authenticate, fastify.authorize('notifications:send')]
}, async (request, reply) => {
  const { to, subject, body, templateId, variables } = request.body as SendEmailRequest;
  const { tenantSlug } = request.user;

  try {
    // Validate tenant exists
    const tenant = await tenantService.getBySlug(tenantSlug);
    if (!tenant) {
      return reply.code(404).send({ error: 'Tenant not found' });
    }

    // Process email through queue
    const jobId = await emailQueue.add('sendEmail', {
      to,
      subject,
      body,
      templateId,
      variables,
      tenantId: tenant.id
    }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: true,
      removeOnFail: false
    });

    // Store notification record
    const notification = await notificationService.create({
      tenantId: tenant.id,
      type: 'email',
      recipient: to,
      subject,
      status: 'queued',
      jobId: jobId
    });

    return reply.code(202).send({
      id: notification.id,
      jobId: jobId,
      message: 'Email queued for delivery'
    });
  } catch (error) {
    fastify.log.error({ error }, 'Failed to queue email');
    return reply.code(500).send({ error: 'Failed to send email' });
  }
});