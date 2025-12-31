import { FastifyInstance } from 'fastify';
import { authMiddleware, tenantMiddleware } from '../middleware/auth.js';
import { notificationService } from '../services/notifications.js';
import { BadRequestError, ServiceUnavailableError } from '../utils/errors.js';

export default async function notificationRoutes(fastify: FastifyInstance) {
  // Send notification endpoint
  fastify.post('/send', {
    preHandler: [authMiddleware, tenantMiddleware],
    schema: {
      body: {
        type: 'object',
        required: ['to', 'subject', 'content'],
        properties: {
          to: { 
            type: 'string',
            format: 'email'
          },
          subject: { type: 'string' },
          content: { type: 'string' },
          type: { 
            type: 'string',
            enum: ['email', 'sms', 'push']
          }
        }
      }
    }
  }, async (request, reply) => {
    const { to, subject, content, type = 'email' } = request.body as {
      to: string;
      subject: string;
      content: string;
      type?: string;
    };
    const { tenantSlug } = request.user;

    try {
      // Validate email format
      if (type === 'email' && !to.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
        throw new BadRequestError('Invalid email format');
      }

      const result = await notificationService.send({
        tenantSlug,
        to,
        subject,
        content,
        type
      });

      request.log.info({ 
        notificationId: result.id, 
        type, 
        to,
        tenant: tenantSlug 
      }, 'Notification sent successfully');

      return reply.code(202).send({
        id: result.id,
        status: 'queued',
        message: 'Notification queued for delivery'
      });
    } catch (error: any) {
      request.log.error({ 
        err: error,
        to,
        subject,
        type,
        tenant: tenantSlug
      }, 'Failed to send notification');

      // Handle specific error cases
      if (error instanceof BadRequestError) {
        throw error;
      }

      if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
        throw new ServiceUnavailableError('Notification service unavailable');
      }

      if (error.message?.includes('rate limit')) {
        throw new ServiceUnavailableError('Notification rate limit exceeded');
      }

      // Generic error for unexpected failures
      throw new ServiceUnavailableError('Failed to send notification');
    }
  });
}