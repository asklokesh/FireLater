import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { notificationService } from '../services/notifications.js';
import { requirePermission } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';

// Add retry configuration
const RETRY_CONFIG = {
  maxAttempts: 3,
  backoffMultiplier: 2,
  initialDelayMs: 1000,
  maxDelayMs: 30000
};

// Add error handling utility
const handleNotificationError = async (
  error: Error,
  notificationId: string,
  attempt: number
) => {
  logger.error({
    msg: 'Notification processing failed',
    error: error.message,
    notificationId,
    attempt
  });

  // Update notification status with failure details
  await notificationService.updateStatus(
    notificationId,
    'failed',
    { 
      errorMessage: error.message,
      failedAt: new Date().toISOString(),
      attempt 
    }
  );
};

export default async function notificationRoutes(app: FastifyInstance) {
  // Process notification with retry mechanism
  app.post('/process/:id', {
    preHandler: [requirePermission('notifications:process')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    let lastError: Error | null = null;

    try {
      // Validate notification ID
      if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
        throw new Error('Invalid notification ID format');
      }

      // Mark as processing
      await notificationService.updateStatus(id, 'processing');

      // Implement retry with exponential backoff
      for (let attempt = 1; attempt <= RETRY_CONFIG.maxAttempts; attempt++) {
        try {
          await notificationService.processNotification(id);
          lastError = null;
          break;
        } catch (error) {
          lastError = error;
          
          // Log failed attempt
          logger.warn({
            msg: 'Notification processing attempt failed',
            notificationId: id,
            attempt,
            error: error.message
          });

          // Don't delay after final attempt
          if (attempt < RETRY_CONFIG.maxAttempts) {
            const delay = Math.min(
              RETRY_CONFIG.initialDelayMs * Math.pow(RETRY_CONFIG.backoffMultiplier, attempt - 1),
              RETRY_CONFIG.maxDelayMs
            );
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }

      if (lastError) {
        await handleNotificationError(lastError, id, RETRY_CONFIG.maxAttempts);
        return reply.code(500).send({
          error: 'Notification processing failed after retries',
          details: lastError.message
        });
      }

      // Success
      await notificationService.updateStatus(id, 'completed');
      return { success: true };

    } catch (error) {
      await handleNotificationError(error, id, 0);
      return reply.code(500).send({
        error: 'Failed to process notification',
        details: error.message
      });
    }
  });
}