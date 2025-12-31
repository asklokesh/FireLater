import { FastifyInstance } from 'fastify';
import { z } from 'zod';

// Add input sanitization utility
const sanitizeInput = (input: string): string => {
  return input.replace(/[<>{}[\]|\\^`]/g, '').trim();
};

// Add notification payload validation schema
const notificationPayloadSchema = z.object({
  type: z.string().min(1).max(50),
  recipient: z.string().email().or(z.string().uuid()),
  subject: z.string().min(1).max(255),
  content: z.string().min(1).max(10000),
  metadata: z.record(z.unknown()).optional(),
});

export default async function notificationRoutes(fastify: FastifyInstance) {
  // Process notification with retry logic and error handling
  fastify.post('/process', {
    schema: {
      body: {
        type: 'object',
        required: ['type', 'recipient', 'subject', 'content'],
        properties: {
          type: { type: 'string' },
          recipient: { type: 'string' },
          subject: { type: 'string' },
          content: { type: 'string' },
          metadata: { type: 'object' }
        }
      }
    }
  }, async (request, reply) => {
    const { tenantSlug } = request.user!;
    let payload: any;
    
    try {
      // Validate and sanitize input
      payload = notificationPayloadSchema.parse(request.body);
      payload.subject = sanitizeInput(payload.subject);
      payload.content = sanitizeInput(payload.content);
      
      if (payload.metadata) {
        // Stringify and truncate metadata to prevent oversized payloads
        payload.metadata = JSON.stringify(payload.metadata).substring(0, 1000);
      }
    } catch (error) {
      fastify.log.error({ error }, 'Invalid notification payload');
      return reply.code(400).send({ error: 'Invalid notification payload' });
    }

    // Implement retry logic with exponential backoff
    let lastError: Error | null = null;
    const maxRetries = 3;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Process notification with timeout
        await Promise.race([
          notificationService.process(tenantSlug, payload),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Notification processing timeout')), 30000)
          )
        ]);
        
        lastError = null;
        break;
      } catch (error) {
        lastError = error;
        fastify.log.warn({ error, attempt }, `Notification processing failed, attempt ${attempt}`);
        
        if (attempt < maxRetries) {
          // Exponential backoff: 1s, 2s, 4s
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        }
      }
    }
    
    if (lastError) {
      fastify.log.error({ error: lastError }, 'Notification processing failed after retries');
      // Store failed notification for manual review
      await notificationService.storeFailed(tenantSlug, payload, lastError.message);
      return reply.code(500).send({ error: 'Failed to process notification after retries' });
    }
    
    return { success: true };
  });

  // Get notification status
  fastify.get('/status/:id', {
    preHandler: [fastify.authenticate, fastify.authorize('read:notifications')],
    schema: {
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' }
        }
      }
    }
  }, async (request, reply) => {
    const { tenantSlug } = request.user!;
    const { id } = request.params as { id: string };
    
    try {
      const status = await notificationService.getStatus(tenantSlug, id);
      if (!status) {
        return reply.code(404).send({ error: 'Notification not found' });
      }
      
      return status;
    } catch (error) {
      fastify.log.error({ error }, 'Failed to get notification status');
      return reply.code(500).send({ error: 'Failed to get notification status' });
    }
  });

  // Retry failed notification
  fastify.post('/retry/:id', {
    preHandler: [fastify.authenticate, fastify.authorize('write:notifications')],
    schema: {
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' }
        }
      }
    }
  }, async (request, reply) => {
    const { tenantSlug } = request.user!;
    const { id } = request.params as { id: string };
    
    try {
      const notification = await notificationService.getFailed(tenantSlug, id);
      if (!notification) {
        return reply.code(404).send({ error: 'Failed notification not found' });
      }
      
      // Retry with same logic as initial processing
      let lastError: Error | null = null;
      const maxRetries = 3;
      
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          await Promise.race([
            notificationService.process(tenantSlug, notification.payload),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Notification processing timeout')), 30000)
            )
          ]);
          
          lastError = null;
          // Remove from failed notifications on success
          await notificationService.removeFailed(tenantSlug, id);
          break;
        } catch (error) {
          lastError = error;
          fastify.log.warn({ error, attempt }, `Failed notification retry attempt ${attempt}`);
          
          if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
          }
        }
      }
      
      if (lastError) {
        fastify.log.error({ error: lastError }, 'Failed notification retry failed after retries');
        return reply.code(500).send({ error: 'Failed to retry notification after retries' });
      }
      
      return { success: true };
    } catch (error) {
      fastify.log.error({ error }, 'Failed to retry notification');
      return reply.code(500).send({ error: 'Failed to retry notification' });
    }
  });
}