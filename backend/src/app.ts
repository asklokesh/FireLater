import Fastify, { FastifyInstance, FastifyError, FastifyRequest, FastifyReply } from 'fastify';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import csrf from '@fastify/csrf-protection';
import { ZodError } from 'zod';
import authRoutes from './routes/auth.js';
import { config } from './config/index.js';

/**
 * Build Fastify app instance for testing
 */
export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false,
  });

  // Register required plugins for auth routes
  await app.register(cookie, {
    secret: config.jwt.secret || 'test-secret-key-min-32-chars-long',
  });

  await app.register(jwt, {
    secret: config.jwt.secret || 'test-secret-key-min-32-chars-long',
    sign: {
      expiresIn: config.jwt.accessExpiry || '15m',
    },
  });

  await app.register(csrf, {
    cookieOpts: {
      signed: true,
      httpOnly: true,
      sameSite: 'strict',
      secure: false, // Allow for tests
    },
    sessionPlugin: '@fastify/cookie',
  });

  // Global error handler
  app.setErrorHandler((error: FastifyError | Error, request: FastifyRequest, reply: FastifyReply) => {
    // Handle Zod validation errors
    if (error instanceof ZodError) {
      reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Validation failed',
        details: error.errors,
      });
      return;
    }

    // Handle custom errors with statusCode
    if ('statusCode' in error && typeof error.statusCode === 'number') {
      const errorLabel = 'error' in error && typeof error.error === 'string' ? error.error : error.name;
      reply.status(error.statusCode).send({
        statusCode: error.statusCode,
        error: errorLabel,
        message: error.message,
      });
      return;
    }

    // Handle unexpected errors
    reply.status(500).send({
      statusCode: 500,
      error: 'Internal Server Error',
      message: process.env.NODE_ENV === 'production' ? 'An unexpected error occurred' : error.message,
    });
  });

  // Register auth routes with /auth prefix
  await app.register(authRoutes, { prefix: '/auth' });

  // Ensure app is ready
  await app.ready();

  return app;
}
