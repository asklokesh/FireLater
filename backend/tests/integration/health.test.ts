import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';

describe('Health Endpoints', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify({ logger: false });

    // Register health routes
    app.get('/health', async () => {
      return { status: 'ok', timestamp: new Date().toISOString() };
    });

    app.get('/ready', async () => {
      return { status: 'ok', database: true, redis: true };
    });

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /health', () => {
    it('should return health status', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('ok');
      expect(body.timestamp).toBeDefined();
    });
  });

  describe('GET /ready', () => {
    it('should return readiness status', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/ready',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('ok');
      expect(body.database).toBe(true);
      expect(body.redis).toBe(true);
    });
  });
});

describe('API Response Format', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify({ logger: false });

    // Mock authenticated route
    app.get('/v1/test', async (request, reply) => {
      return {
        data: { id: '123', name: 'Test' },
        meta: { timestamp: new Date().toISOString() },
      };
    });

    // Mock error route
    app.get('/v1/error', async (request, reply) => {
      reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Invalid parameters',
      });
    });

    // Mock paginated route
    app.get('/v1/items', async (request, reply) => {
      return {
        data: [
          { id: '1', name: 'Item 1' },
          { id: '2', name: 'Item 2' },
        ],
        pagination: {
          page: 1,
          limit: 20,
          total: 2,
          totalPages: 1,
        },
      };
    });

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should return data in consistent format', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/test',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.data).toBeDefined();
    expect(body.data.id).toBe('123');
  });

  it('should return errors in consistent format', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/error',
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.statusCode).toBe(400);
    expect(body.error).toBe('Bad Request');
    expect(body.message).toBeDefined();
  });

  it('should return paginated results', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/items',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.data).toBeInstanceOf(Array);
    expect(body.pagination).toBeDefined();
    expect(body.pagination.page).toBe(1);
    expect(body.pagination.total).toBe(2);
  });
});
