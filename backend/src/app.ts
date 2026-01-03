import Fastify, { FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import csrf from '@fastify/csrf-protection';
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

  // Register auth routes with /auth prefix
  await app.register(authRoutes, { prefix: '/auth' });

  // Ensure app is ready
  await app.ready();

  return app;
}
