import Fastify, { FastifyInstance } from 'fastify';

/**
 * Build Fastify app instance for testing
 */
export function buildApp(): FastifyInstance {
  const app = Fastify({
    logger: false,
  });

  return app;
}
