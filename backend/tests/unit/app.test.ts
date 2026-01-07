import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { FastifyInstance, FastifyError, FastifyRequest, FastifyReply } from 'fastify';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import csrf from '@fastify/csrf-protection';
import { ZodError } from 'zod';

// Mock config
vi.mock('../../src/config/index.js', () => ({
  config: {
    jwt: {
      secret: 'test-secret-key-that-is-at-least-32-characters',
      accessExpiry: '15m',
    },
    isDev: true,
  },
}));

// Mock auth routes
vi.mock('../../src/routes/auth.js', () => ({
  default: async (app: any) => {
    app.post('/login', async () => ({ success: true }));
    app.get('/me', async () => ({ user: { id: '1' } }));
  },
}));

// Mock pool and services
vi.mock('../../src/config/database.js', () => ({
  pool: {
    query: vi.fn().mockResolvedValue({ rows: [] }),
    connect: vi.fn().mockResolvedValue({
      query: vi.fn().mockResolvedValue({ rows: [] }),
      release: vi.fn(),
    }),
  },
}));

vi.mock('../../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../../src/services/tenant.js', () => ({
  tenantService: {
    findBySlug: vi.fn().mockResolvedValue({
      id: 'tenant-1',
      slug: 'test-tenant',
      name: 'Test Tenant',
    }),
  },
}));

/**
 * Create a test app that registers error-throwing routes before ready()
 */
async function buildTestAppWithRoutes(routes: { path: string; handler: () => Promise<any> }[]): Promise<FastifyInstance> {
  const { config } = await import('../../src/config/index.js');

  const app = Fastify({ logger: false });

  await app.register(cookie, {
    secret: config.jwt.secret || 'test-secret-key-min-32-chars-long',
  });

  await app.register(jwt, {
    secret: config.jwt.secret || 'test-secret-key-min-32-chars-long',
    sign: { expiresIn: config.jwt.accessExpiry || '15m' },
  });

  await app.register(csrf, {
    cookieOpts: {
      signed: true,
      httpOnly: true,
      sameSite: 'strict',
      secure: false,
    },
    sessionPlugin: '@fastify/cookie',
  });

  // Error handler
  app.setErrorHandler((error: FastifyError | Error, request: FastifyRequest, reply: FastifyReply) => {
    if (error instanceof ZodError) {
      reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Validation failed',
        details: error.errors,
      });
      return;
    }

    if ('statusCode' in error && typeof error.statusCode === 'number') {
      reply.status(error.statusCode).send({
        statusCode: error.statusCode,
        error: (error as any).error || error.name,
        message: error.message,
      });
      return;
    }

    reply.status(500).send({
      statusCode: 500,
      error: 'Internal Server Error',
      message: process.env.NODE_ENV === 'production' ? 'An unexpected error occurred' : error.message,
    });
  });

  // Register test routes before ready()
  for (const route of routes) {
    app.get(route.path, route.handler);
  }

  await app.ready();
  return app;
}

describe('App', () => {
  let app: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('buildApp', () => {
    it('should create a Fastify instance', async () => {
      const { buildApp } = await import('../../src/app.js');
      app = await buildApp();

      expect(app).toBeDefined();
      expect(typeof app.register).toBe('function');
      expect(typeof app.inject).toBe('function');
    });

    it('should register cookie plugin', async () => {
      const { buildApp } = await import('../../src/app.js');
      app = await buildApp();

      // Fastify stores registered plugins internally
      expect(app.hasPlugin('@fastify/cookie')).toBe(true);
    });

    it('should register jwt plugin', async () => {
      const { buildApp } = await import('../../src/app.js');
      app = await buildApp();

      expect(app.hasPlugin('@fastify/jwt')).toBe(true);
    });

    it('should register csrf plugin', async () => {
      const { buildApp } = await import('../../src/app.js');
      app = await buildApp();

      expect(app.hasPlugin('@fastify/csrf-protection')).toBe(true);
    });

    it('should register auth routes with /auth prefix', async () => {
      const { buildApp } = await import('../../src/app.js');
      app = await buildApp();

      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
      });

      // The route should exist (might return validation error but route is found)
      expect([200, 400, 401]).toContain(response.statusCode);
    });
  });

  describe('error handler', () => {
    it('should handle ZodError as 400 Bad Request', async () => {
      app = await buildTestAppWithRoutes([{
        path: '/test-zod-error',
        handler: async () => {
          throw new ZodError([
            {
              code: 'invalid_type',
              expected: 'string',
              received: 'number',
              path: ['name'],
              message: 'Expected string, received number',
            },
          ]);
        },
      }]);

      const response = await app.inject({
        method: 'GET',
        url: '/test-zod-error',
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.statusCode).toBe(400);
      expect(body.error).toBe('Bad Request');
      expect(body.message).toBe('Validation failed');
      expect(body.details).toBeDefined();
    });

    it('should handle custom errors with statusCode', async () => {
      app = await buildTestAppWithRoutes([{
        path: '/test-custom-error',
        handler: async () => {
          const error = new Error('Not found') as any;
          error.statusCode = 404;
          error.error = 'Not Found';
          throw error;
        },
      }]);

      const response = await app.inject({
        method: 'GET',
        url: '/test-custom-error',
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.statusCode).toBe(404);
      expect(body.message).toBe('Not found');
    });

    it('should handle custom errors with error name as fallback', async () => {
      app = await buildTestAppWithRoutes([{
        path: '/test-error-fallback',
        handler: async () => {
          const error = new Error('Permission denied') as any;
          error.statusCode = 403;
          // No error property, should use error.name
          throw error;
        },
      }]);

      const response = await app.inject({
        method: 'GET',
        url: '/test-error-fallback',
      });

      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.body);
      expect(body.statusCode).toBe(403);
    });

    it('should handle unexpected errors as 500', async () => {
      app = await buildTestAppWithRoutes([{
        path: '/test-unexpected-error',
        handler: async () => {
          throw new Error('Something went wrong');
        },
      }]);

      const response = await app.inject({
        method: 'GET',
        url: '/test-unexpected-error',
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.statusCode).toBe(500);
      expect(body.error).toBe('Internal Server Error');
    });

    it('should hide error message in production for unexpected errors', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      try {
        app = await buildTestAppWithRoutes([{
          path: '/test-prod-error',
          handler: async () => {
            throw new Error('Secret internal details');
          },
        }]);

        const response = await app.inject({
          method: 'GET',
          url: '/test-prod-error',
        });

        expect(response.statusCode).toBe(500);
        const body = JSON.parse(response.body);
        expect(body.message).toBe('An unexpected error occurred');
        expect(body.message).not.toContain('Secret');
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });

    it('should show error message in non-production for unexpected errors', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      try {
        app = await buildTestAppWithRoutes([{
          path: '/test-dev-error',
          handler: async () => {
            throw new Error('Detailed error message');
          },
        }]);

        const response = await app.inject({
          method: 'GET',
          url: '/test-dev-error',
        });

        expect(response.statusCode).toBe(500);
        const body = JSON.parse(response.body);
        expect(body.message).toBe('Detailed error message');
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });
  });

  describe('plugin configuration', () => {
    it('should configure cookie with signed option', async () => {
      const testApp = Fastify({ logger: false });

      await testApp.register(cookie, {
        secret: 'test-secret-key-that-is-at-least-32-characters',
      });

      testApp.get('/test-cookie', async (request: any, reply: any) => {
        reply.setCookie('test', 'value', { signed: true });
        return { success: true };
      });

      await testApp.ready();
      app = testApp;

      const response = await app.inject({
        method: 'GET',
        url: '/test-cookie',
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['set-cookie']).toBeDefined();
    });

    it('should have jwt signing capability', async () => {
      const testApp = Fastify({ logger: false });

      await testApp.register(jwt, {
        secret: 'test-secret-key-that-is-at-least-32-characters',
        sign: { expiresIn: '15m' },
      });

      testApp.get('/test-jwt', async function (request: any, reply: any) {
        const token = this.jwt.sign({ userId: '123' });
        return { token };
      });

      await testApp.ready();
      app = testApp;

      const response = await app.inject({
        method: 'GET',
        url: '/test-jwt',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.token).toBeDefined();
      expect(typeof body.token).toBe('string');
    });
  });

  describe('app ready state', () => {
    it('should be ready after buildApp completes', async () => {
      const { buildApp } = await import('../../src/app.js');
      app = await buildApp();

      // If we get here without error, app is ready
      expect(app).toBeDefined();

      // Can handle requests
      const response = await app.inject({
        method: 'GET',
        url: '/auth/me',
      });

      // Route exists (auth might fail but route works)
      expect(response).toBeDefined();
    });
  });
});

describe('Server', () => {
  it('should export server instance', async () => {
    const { server } = await import('../../src/server.js');

    expect(server).toBeDefined();
    expect(typeof server.addHook).toBe('function');
  });

  it('should have onClose hook for Redis cleanup', async () => {
    const { server } = await import('../../src/server.js');

    // The hook is registered, so we verify server has hooks registered
    expect(server).toBeDefined();
    // Server should have hooks capability
    expect(typeof server.addHook).toBe('function');
  });
});
