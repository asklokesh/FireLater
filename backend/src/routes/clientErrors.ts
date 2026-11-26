import { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validation.js';
import { captureException } from '../lib/errorTracking.js';
import { logger } from '../utils/logger.js';
import { clientErrorSchema, type ClientErrorInput } from '../schemas/client-errors.js';

/** Receives frontend render errors (from the React ErrorBoundary) and forwards them to error tracking. */
export default async function clientErrorRoutes(app: FastifyInstance) {
  app.post('/', { preHandler: [authenticate, validate({ body: clientErrorSchema })] }, async (request, reply) => {
    const body = request.body as ClientErrorInput;
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
