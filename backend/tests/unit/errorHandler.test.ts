import { describe, it, expect, vi, afterEach } from 'vitest';
import Fastify from 'fastify';
import { z } from 'zod';
import { registerErrorHandling } from '../../src/middleware/errorHandler.js';
import {
  AppError, NotFoundError, BadRequestError, ValidationError, UnauthorizedError, ForbiddenError,
  ConflictError, RateLimitError, ServiceUnavailableError, ExternalServiceError, DatabaseError, InternalError,
} from '../../src/utils/errors.js';

function build(thrower: () => unknown) {
  const log = { error: vi.fn(), warn: vi.fn() };
  const app = Fastify({ logger: false });
  registerErrorHandling(app, { logger: log });
  app.get('/t', async () => { throw thrower(); });
  app.post('/v', { schema: { body: { type: 'object', required: ['a'], properties: { a: { type: 'string' } } } } }, async () => ({ ok: true }));
  return { app, log };
}

const env = process.env.NODE_ENV;
afterEach(() => { process.env.NODE_ENV = env; });

describe('registerErrorHandling', () => {
  const cases: [AppError, number, string][] = [
    [new NotFoundError('User', '1'), 404, 'NOT_FOUND'],
    [new BadRequestError('bad'), 400, 'BAD_REQUEST'],
    [new ValidationError({ a: ['x'] }), 400, 'VALIDATION_FAILED'],
    [new UnauthorizedError(), 401, 'UNAUTHORIZED'],
    [new ForbiddenError(), 403, 'FORBIDDEN'],
    [new ConflictError('dup'), 409, 'CONFLICT'],
    [new RateLimitError(), 429, 'RATE_LIMITED'],
    [new ServiceUnavailableError(), 503, 'SERVICE_UNAVAILABLE'],
    [new ExternalServiceError(), 502, 'EXTERNAL_SERVICE_ERROR'],
    [new DatabaseError(), 500, 'DATABASE_ERROR'],
    [new InternalError(), 500, 'INTERNAL_ERROR'],
  ];
  it.each(cases)('maps %s', async (err, status, code) => {
    const { app, log } = build(() => err);
    const res = await app.inject({ method: 'GET', url: '/t' });
    const body = res.json();
    expect(res.statusCode).toBe(status);
    expect(body).toMatchObject({ statusCode: status, error: err.error, code, message: err.message });
    expect(body.requestId).toBe(res.headers['x-request-id']);
    expect(status >= 500 ? log.error : log.warn).toHaveBeenCalledTimes(1);
    expect(log.error.mock.calls.length + log.warn.mock.calls.length).toBe(1);
  });

  it('maps ZodError to the legacy validation body', async () => {
    const { app } = build(() => { try { z.object({ a: z.string() }).parse({}); } catch (e) { return e; } });
    const body = (await app.inject({ method: 'GET', url: '/t' })).json();
    expect(body).toMatchObject({ statusCode: 400, error: 'Validation Error', message: 'Request validation failed', code: 'VALIDATION_FAILED' });
    expect(body.details).toBeDefined();
  });

  it('maps Fastify validation failure', async () => {
    const { app } = build(() => new Error('x'));
    const res = await app.inject({ method: 'POST', url: '/v', payload: {} });
    expect(res.json()).toMatchObject({ statusCode: 400, error: 'Validation Error', message: 'Request validation failed', code: 'VALIDATION_FAILED' });
  });

  it('maps pg 23505 and 08006', async () => {
    let r = await build(() => Object.assign(new Error('dup key'), { code: '23505' })).app.inject({ method: 'GET', url: '/t' });
    expect(r.json()).toMatchObject({ statusCode: 409, code: 'CONFLICT' });
    r = await build(() => Object.assign(new Error('conn'), { code: '08006' })).app.inject({ method: 'GET', url: '/t' });
    expect(r.json()).toMatchObject({ statusCode: 503, code: 'DATABASE_UNAVAILABLE' });
  });

  it('handles thrown non-Error values', async () => {
    const r = await build(() => 'boom').app.inject({ method: 'GET', url: '/t' });
    expect(r.json()).toMatchObject({ statusCode: 500, code: 'INTERNAL_ERROR' });
  });

  it('handles unknown routes', async () => {
    const r = await build(() => 'x').app.inject({ method: 'GET', url: '/nope' });
    expect(r.statusCode).toBe(404);
    expect(r.json()).toMatchObject({ code: 'NOT_FOUND', requestId: r.headers['x-request-id'] });
  });

  it('redacts 5xx messages in production', async () => {
    process.env.NODE_ENV = 'production';
    const r = await build(() => new Error('Secret internals')).app.inject({ method: 'GET', url: '/t' });
    expect(r.body).not.toContain('Secret');
    expect(r.body).not.toContain('stack');
  });

  it('sets Retry-After', async () => {
    const r = await build(() => new RateLimitError('slow', { retryAfterSeconds: 30 })).app.inject({ method: 'GET', url: '/t' });
    expect(r.headers['retry-after']).toBe('30');
  });

  it('reuses only valid incoming x-request-id', async () => {
    const { app } = build(() => new BadRequestError('b'));
    let r = await app.inject({ method: 'GET', url: '/t', headers: { 'x-request-id': 'abc-123' } });
    expect(r.headers['x-request-id']).toBe('abc-123');
    expect(r.json().requestId).toBe('abc-123');
    r = await app.inject({ method: 'GET', url: '/t', headers: { 'x-request-id': 'bad id!' } });
    expect(r.headers['x-request-id']).not.toBe('bad id!');
  });

  it('logs request context', async () => {
    const { app, log } = build(() => new Error('kaboom'));
    await app.inject({ method: 'GET', url: '/t' });
    const entry = log.error.mock.calls[0][0];
    expect(entry).toMatchObject({ method: 'GET', route: '/t', statusCode: 500, code: 'INTERNAL_ERROR' });
    expect(entry.requestId).toBeDefined();
    expect(entry.err.message).toBe('kaboom');
  });
});
