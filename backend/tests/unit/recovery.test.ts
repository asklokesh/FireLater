import { describe, it, expect, afterEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { registerErrorHandling } from '../../src/middleware/errorHandler.js';
import { CircuitBreaker } from '../../src/utils/circuitBreaker.js';

const silentLogger = { error: () => {}, warn: () => {}, info: () => {} } as any;

describe('recovery handlers', () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app?.close();
  });

  it('returns 503 CIRCUIT_OPEN with Retry-After when the breaker is open', async () => {
    const breaker = new CircuitBreaker({ timeout: 1000, failureThreshold: 1, cooldownPeriod: 30000 });
    await breaker.call(() => Promise.reject(new Error('upstream down'))).catch(() => undefined);

    app = Fastify();
    registerErrorHandling(app, { logger: silentLogger });
    app.get('/upstream', async () => breaker.call(async () => 'ok'));
    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/upstream' });
    expect(res.statusCode).toBe(503);
    expect(res.json().code).toBe('CIRCUIT_OPEN');
    const retryAfter = Number(res.headers['retry-after']);
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(30);
  });
});
