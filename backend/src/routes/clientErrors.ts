import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { captureException } from '../lib/errorTracking.js';
import { logger } from '../utils/logger.js';

const clientErrorSchema = z.object({
  message: z.string().max(2000),
  stack: z.string().max(10000).optional(),
  componentStack: z.string().max(10000).optional(),
  code: z.string().max(100).optional(),
  url: z.string().max(2000).optional(),
});

/** Receives frontend render errors (from the React ErrorBoundary) and forwards them to error tracking. */
export default async function clientErrorRoutes(app: FastifyInstance) {
  app.post('/', { preHandler: [authenticate] }, async (request, reply) => {
    const body = clientErrorSchema.parse(request.body);
    const err = new Error(body.message);
    if (body.stack) err.stack = body.stack;
    err.name = 'ClientError';
    const context = {
      source: 'frontend',
      tenantSlug: request.user.tenantSlug,
      userId: request.user.userId,
      requestId: String(request.id),
      url: body.url,
      errorCode: body.code,
      componentStack: body.componentStack,
      operation: 'frontend.render',
    };
    logger.error({ err, ...context }, 'Client error reported');
    captureException(err, context);
    return reply.status(202).send({ received: true });
  });
}
