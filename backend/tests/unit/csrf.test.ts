import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import csrf from '@fastify/csrf-protection';

describe('CSRF Protection', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify();

    await app.register(cookie, {
      secret: 'test-secret-for-csrf',
    });

    await app.register(csrf, {
      cookieOpts: {
        signed: true,
        httpOnly: true,
        sameSite: 'strict',
        secure: false, // test mode
      },
      sessionPlugin: '@fastify/cookie',
    });

    // CSRF protection hook (mirrors production implementation)
    app.addHook('preHandler', async (request, reply) => {
      const isStateChanging = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method);
      const isPublicRoute = request.url === '/csrf-token';

      if (isStateChanging && !isPublicRoute) {
        const authHeader = request.headers.authorization;
        const hasJWT = authHeader && authHeader.startsWith('Bearer ');

        // Require CSRF token if not using JWT
        if (!hasJWT) {
          try {
            await request.csrfProtection();
          } catch (error) {
            reply.code(403).send({
              statusCode: 403,
              error: 'Forbidden',
              message: 'Invalid CSRF token',
            });
          }
        }
      }
    });

    // CSRF token endpoint
    app.get('/csrf-token', async (request, reply) => {
      const token = await reply.generateCsrf();
      return { csrfToken: token };
    });

    // Test endpoint that requires CSRF protection
    app.post('/test-protected', async (request, reply) => {
      return { success: true };
    });

    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('should generate CSRF token on /csrf-token endpoint', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/csrf-token',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body).toHaveProperty('csrfToken');
    expect(typeof body.csrfToken).toBe('string');
    expect(body.csrfToken.length).toBeGreaterThan(0);
  });

  it('should set CSRF cookie when token is generated', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/csrf-token',
    });

    expect(response.statusCode).toBe(200);
    const cookies = response.cookies;
    expect(cookies.length).toBeGreaterThan(0);

    // Should have a _csrf cookie
    const csrfCookie = cookies.find(c => c.name === '_csrf');
    expect(csrfCookie).toBeDefined();
    expect(csrfCookie?.httpOnly).toBe(true);
    expect(csrfCookie?.sameSite).toBe('Strict');
  });

  it('should reject POST request without CSRF token and without JWT', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/test-protected',
      payload: { data: 'test' },
    });

    // Without JWT bearer token, CSRF protection is required
    expect(response.statusCode).toBe(403);
  });

  it('should accept POST request with JWT bearer token (no CSRF needed)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/test-protected',
      headers: {
        Authorization: 'Bearer fake-jwt-token',
      },
      payload: { data: 'test' },
    });

    // JWT provides inherent CSRF protection
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
  });

  it('should accept POST request with valid CSRF token (no JWT)', async () => {
    // First, get CSRF token
    const tokenResponse = await app.inject({
      method: 'GET',
      url: '/csrf-token',
    });

    const { csrfToken } = JSON.parse(tokenResponse.body);

    // Extract all cookie headers from response (including signed cookies)
    const cookieHeader = tokenResponse.headers['set-cookie'];
    const cookies = Array.isArray(cookieHeader)
      ? cookieHeader.map(c => c.split(';')[0]).join('; ')
      : cookieHeader ? cookieHeader.split(';')[0] : '';

    // Now make POST request with token and cookie (without JWT)
    const response = await app.inject({
      method: 'POST',
      url: '/test-protected',
      headers: {
        'x-csrf-token': csrfToken,
        cookie: cookies,
      },
      payload: { data: 'test' },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
  });

  it('should reject POST request with invalid CSRF token (no JWT)', async () => {
    // Get CSRF cookie first
    const tokenResponse = await app.inject({
      method: 'GET',
      url: '/csrf-token',
    });

    const cookies = tokenResponse.cookies.map(c => `${c.name}=${c.value}`).join('; ');

    // Try with wrong token and NO JWT (so CSRF is required)
    const response = await app.inject({
      method: 'POST',
      url: '/test-protected',
      headers: {
        'x-csrf-token': 'invalid-token',
        cookie: cookies,
      },
      payload: { data: 'test' },
    });

    expect(response.statusCode).toBe(403);
  });

  it('should reject POST request with token from different session (no JWT)', async () => {
    // Session 1: Get token
    const token1Response = await app.inject({
      method: 'GET',
      url: '/csrf-token',
    });
    const { csrfToken: token1 } = JSON.parse(token1Response.body);

    // Session 2: Get different token/cookie
    const token2Response = await app.inject({
      method: 'GET',
      url: '/csrf-token',
    });
    const cookies2 = token2Response.cookies.map(c => `${c.name}=${c.value}`).join('; ');

    // Try to use token from session 1 with cookie from session 2, NO JWT
    const response = await app.inject({
      method: 'POST',
      url: '/test-protected',
      headers: {
        'x-csrf-token': token1,
        cookie: cookies2,
      },
      payload: { data: 'test' },
    });

    expect(response.statusCode).toBe(403);
  });

  it('should allow GET requests without CSRF token', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/test-protected',
    });

    // GET requests don't require CSRF (plugin only checks state-changing methods)
    // This will fail with 404 since we only defined POST, but won't fail with 403
    expect(response.statusCode).toBe(404);
  });
});
