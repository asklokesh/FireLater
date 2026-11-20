import Fastify, { FastifyInstance, FastifyError, FastifyRequest, FastifyReply } from 'fastify';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import csrf from '@fastify/csrf-protection';
import { ZodError } from 'zod';
import authRoutes from './routes/auth.js';
import { config } from './config/index.js';
import { i18nOnRequest, localeForError, localizeErrorMessage, t } from './lib/i18n.js';

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

  // Resolve request locale (?lang= / Accept-Language)
  app.addHook('onRequest', i18nOnRequest);

  // Global error handler
  app.setErrorHandler(async (error: FastifyError | Error, request: FastifyRequest, reply: FastifyReply) => {
    const locale = await localeForError(request);
    // Handle Zod validation errors
    if (error instanceof ZodError) {
      reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: t(locale, 'errors.validationFailed'),
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
        message: localizeErrorMessage(locale, { statusCode: error.statusCode, message: error.message, name: error.name, messageKey: (error as { messageKey?: string }).messageKey }),
      });
      return;
    }

    // Handle unexpected errors
    reply.status(500).send({
      statusCode: 500,
      error: 'Internal Server Error',
      message: process.env.NODE_ENV === 'production' ? t(locale, 'errors.internal') : error.message,
    });
  });

  // Register auth routes with /auth prefix
  await app.register(authRoutes, { prefix: '/auth' });

  // Ensure app is ready
  await app.ready();

  return app;
}
