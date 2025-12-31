// Add proper error handling with retry logic for notification processing
fastify.post('/notifications/send', {
  preHandler: [authenticate, authorize('create:notifications')],
  schema: {
    tags: ['Notifications'],
    body: {
      type: 'object',
      required: ['type', 'recipient', 'content'],
      properties: {
        type: { 
          type: 'string',
          enum: ['email', 'sms', 'slack', 'webhook']
        },
        recipient: { type: 'string' },
        content: { 
          type: 'object',
          additionalProperties: true
        },
        priority: {
          type: 'string',
          enum: ['low', 'normal', 'high', 'urgent'],
          default: 'normal'
        },
        scheduledAt: { type: 'string', format: 'date-time' }
      }
    }
  }
}, async (request: FastifyRequest<{ 
  Body: { 
    type: string; 
    recipient: string; 
    content: Record<string, any>;
    priority?: string;
    scheduledAt?: string;
  } 
}>, reply) => {
  const { type, recipient, content, priority = 'normal', scheduledAt } = request.body;
  
  if (!request.tenantSlug) {
    throw new BadRequestError('Tenant context required');
  }
  
  try {
    // Process the notification with retry logic
    const maxRetries = 3;
    const retryDelay = 1000; // 1 second
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await notificationService.sendNotification(
          request.tenantSlug,
          { type, recipient, content, priority, scheduledAt }
        );
        return { message: 'Notification queued successfully' };
      } catch (error: any) {
        lastError = error;
        request.log.warn({ 
          err: error, 
          type, 
          attempt,
          tenantSlug: request.tenantSlug 
        }, `Notification processing attempt ${attempt} failed`);
        
        // Don't retry on validation or configuration errors
        if (error.code === 'VALIDATION_ERROR' || 
            error.code === 'CONFIGURATION_ERROR' || 
            error.code === 'TENANT_NOT_FOUND') {
          break;
        }
        
        // Exponential backoff for retryable errors
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, retryDelay * Math.pow(2, attempt - 1)));
        }
      }
    }
    
    // If we get here, all retries failed
    request.log.error({ 
      err: lastError, 
      type,
      tenantSlug: request.tenantSlug 
    }, 'Notification processing failed after all retries');
    
    // Handle specific notification errors
    if (lastError && (lastError as any).code === 'TENANT_NOT_FOUND') {
      throw new NotFoundError('Tenant not found');
    }
    
    if (lastError && (lastError as any).code === 'VALIDATION_ERROR') {
      throw new BadRequestError((lastError as any).message);
    }
    
    if (lastError && (lastError as any).code === 'CONFIGURATION_ERROR') {
      throw new BadRequestError('Notification provider not configured');
    }
    
    // Handle external service errors
    if (lastError && (lastError as any).code === 'EXTERNAL_API_ERROR') {
      throw new Error('External notification service error');
    }
    
    if (lastError && (lastError as any).code === 'EXTERNAL_API_TIMEOUT') {
      throw new Error('External notification service timeout');
    }
    
    throw new Error('Notification processing failed after retries');
  } catch (error: any) {
    request.log.error({ 
      err: error, 
      type,
      tenantSlug: request.tenantSlug 
    }, 'Unexpected error in notification processing');
    
    throw error;
  }
});