// Add proper error boundaries for webhook delivery
export async function deliverWebhook(
  request: FastifyRequest<{
    Params: { tenantSlug: string; id: string };
    Body: { payload: any; url: string; secret?: string };
  }>,
  reply: FastifyReply
) {
  try {
    const { tenantSlug, id } = request.params;
    const { payload, url, secret } = request.body;

    if (!id) {
      throw new BadRequestError('Notification ID is required');
    }

    if (!url) {
      throw new BadRequestError('Webhook URL is required');
    }

    // Validate URL format
    try {
      new URL(url);
    } catch {
      throw new BadRequestError('Invalid webhook URL format');
    }

    const notification = await notificationService.findById(tenantSlug, id);
    if (!notification) {
      throw new NotFoundError('Notification', id);
    }

    // Deliver webhook with timeout and error handling
    const webhookResponse = await Promise.race([
      fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(secret && { 'X-Signature': createWebhookSignature(payload, secret) })
        },
        body: JSON.stringify(payload)
      }).catch(err => {
        logger.error({ err, url, notificationId: id }, 'Webhook delivery failed');
        throw new Error(`Webhook delivery failed: ${err.message}`);
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Webhook delivery timeout')), 10000)
      )
    ]);

    if (!webhookResponse.ok) {
      const responseText = await webhookResponse.text().catch(() => 'Unknown error');
      logger.warn({ 
        status: webhookResponse.status, 
        responseText, 
        url, 
        notificationId: id 
      }, 'Webhook delivery returned non-OK status');
    }

    return reply.send({ 
      success: true, 
      status: webhookResponse.status,
      notificationId: id 
    });
  } catch (error) {
    logger.error({ error, params: request.params, body: request.body }, 'Webhook delivery error');
    
    if (error instanceof BadRequestError || error instanceof NotFoundError) {
      return reply.code(400).send({ error: error.message });
    }
    
    if (error.message.includes('timeout')) {
      return reply.code(408).send({ error: 'Webhook delivery timeout' });
    }
    
    return reply.code(502).send({ 
      error: 'Webhook delivery failed',
      details: error.message 
    });
  }
}