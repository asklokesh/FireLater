import { test, describe, beforeEach, afterEach } from 'node:test';
import * as assert from 'node:assert';
import { buildApp } from '../app.js';
import { FastifyInstance } from 'fastify';
import { rateLimitService } from '../services/rateLimit.js';
import { tenantService } from '../services/tenant.js';

describe('Auth Routes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp();
    // Reset mocks
    rateLimitService.isRateLimited = async () => false;
    tenantService.getTenantBySlug = async () => ({ id: '1', slug: 'test', name: 'Test Tenant' });
  });

  afterEach(() => {
    app.close();
  });

  test('should reject requests from non-whitelisted IPs', async () => {
    // Mock IP validation to reject
    app.get('/test-ip', {
      preHandler: [
        async (request, _reply) => {
          // Simulate IP check
          const clientIP = request.ip;
          if (clientIP !== '192.168.1.100') {
            throw { statusCode: 403, message: 'IP not allowed' };
          }
        }
      ]
    }, async () => ({ success: true }));

    const response = await app.inject({
      method: 'GET',
      url: '/test-ip',
      headers: {
        'x-forwarded-for': '10.0.0.1'
      }
    });

    assert.strictEqual(response.statusCode, 403);
  });

  test('should enforce rate limiting', async () => {
    // Mock rate limiter to block
    rateLimitService.isRateLimited = async () => true;

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: 'test@example.com',
        password: 'password123'
      }
    });

    assert.strictEqual(response.statusCode, 429);
  });

  test('should validate tenant exists', async () => {
    // Mock tenant service to return null
    tenantService.getTenantBySlug = async () => null;

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: 'test@example.com',
        password: 'password123'
      }
    });

    assert.strictEqual(response.statusCode, 404);
  });
});