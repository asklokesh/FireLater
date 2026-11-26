import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { z } from 'zod';

vi.mock('../utils/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { errorHandlerPlugin } from './errorHandler.js';
import { InternalError, RateLimitError, BadRequestError, NotFoundError, ValidationError, ConflictError, ServiceUnavailableError, CacheError } from '../lib/errors.js';
import { setErrorTracker } from '../lib/errorTracking.js';
import { USER_MESSAGES } from '../lib/errors.js';
import { clearRecoveryHandlers, registerDefaultRecoveryHandlers } from '../lib/errorRecovery.js';
import { logger } from '../utils/logger.js';

describe('errorHandler plugin', () => {
  let app: FastifyInstance;
  const captured: any[] = [];

  beforeEach(async () => {
    captured.length = 0;
    vi.clearAllMocks();
    setErrorTracker({ name: 't', captureException: (e, c) => { captured.push([e, c]); } });
    clearRecoveryHandlers();
    registerDefaultRecoveryHandlers();
    app = Fastify({ logger: false });
    await app.register(errorHandlerPlugin);
    app.get('/nf', async () => { throw new NotFoundError('Issue', '1'); });
    app.get('/val', async () => { throw new ValidationError([{ field: 'a' }]); });
    app.get('/conflict', async () => { throw new ConflictError('dup'); });
    app.get('/zod', async () => { z.object({ a: z.string() }).parse({}); });
    app.get('/boom', async () => { throw new Error('secret db detail'); });
    app.get('/unavail', async () => { throw new ServiceUnavailableError(); });
    app.get('/inline', async (_req, reply) => reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Thing not found' }));
    app.get('/rate', async () => { throw new RateLimitError('slow down', 7); });
    app.get('/bad', async () => { throw new BadRequestError('Status must be open or closed'); });
    app.get('/stub', async (_req, reply) => reply.status(501).send({ message: 'Not implemented' }));
    app.get('/csrf', async () => { throw Object.assign(new Error('Missing csrf token'), { statusCode: 403, code: 'FST_CSRF_MISSING_SECRET' }); });
    let flaky = 0;
    app.get('/flaky', { config: { replayOnTransientError: true } }, async () => { if (flaky++ === 0) throw new ServiceUnavailableError(); return { ok: true, attempts: flaky }; });
    app.get('/alwaysdown', { config: { replayOnTransientError: true } }, async () => { throw new ServiceUnavailableError(); });
    let optOutCalls = 0;
    app.get('/noreplay', async () => { optOutCalls++; throw new ServiceUnavailableError(); });
    (app as any).optOutCalls = () => optOutCalls;
    app.get('/ip', { config: { replayOnTransientError: true } }, async (req) => {
      if (req.headers['x-error-recovery']) return { ip: req.ip };
      throw new ServiceUnavailableError();
    });
    app.get('/replay404', { config: { replayOnTransientError: true } }, async (req, reply) => {
      if (req.headers['x-error-recovery']) return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'gone' });
      throw new ServiceUnavailableError();
    });
    app.get('/inlineerr', async (_req, reply) => reply.status(409).send({ error: 'Name already in use by another SLA' }));
    app.get('/inlinecsrf', async (_req, reply) => reply.status(403).send({ statusCode: 403, error: 'Forbidden', message: 'Invalid CSRF token' }));
    app.get('/forged', { config: { replayOnTransientError: true } }, async () => { throw new Error('forged marker'); });
    app.get('/legacy', async () => { throw Object.assign(new Error('teapot'), { statusCode: 418, error: 'Teapot' }); });
    app.get('/pg', async () => { throw Object.assign(new Error('deadlock'), { code: '40P01' }); });
    app.get('/ctx', async (req) => { req.errorContext = { ...req.errorContext, operation: 'custom.op', tenantSlug: 'acme' }; throw new Error('x'); });
    app.get('/errctx', { preHandler: async (req: any) => { req.user = { userId: 'u1', tenantSlug: 'acme' }; } }, async () => {
      throw new InternalError('boom').withContext({ operation: 'svc.createOrder', orderId: 42, tenantSlug: 'other', headers: { authorization: 'Bearer x' } });
    });
    app.get('/inlinedup', async (_req, reply) => reply.code(400).send({ error: 'duplicate key value violates unique constraint "users_email_key"' }));
    app.get('/recover', async (req) => {
      req.errorContext = { ...req.errorContext, fallback: async () => ({ source: 'db' }) };
      throw new CacheError();
    });
  });
  afterEach(async () => { await app.close(); });

  it('formats AppError with code, userMessage and requestId', async () => {
    const res = await app.inject('/nf');
    expect(res.statusCode).toBe(404);
    const b = res.json();
    expect(b).toMatchObject({ statusCode: 404, error: 'Not Found', code: 'NOT_FOUND', retryable: false });
    expect(b.userMessage).toBeTruthy();
    expect(b.requestId).toBeTruthy();
  });

  it('includes validation details', async () => {
    const b = (await app.inject('/val')).json();
    expect(b.code).toBe('VALIDATION_ERROR');
    expect(b.details).toEqual([{ field: 'a' }]);
  });

  it('maps ZodError to 400 VALIDATION_ERROR', async () => {
    const res = await app.inject('/zod');
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('VALIDATION_ERROR');
    expect(Array.isArray(res.json().details)).toBe(true);
  });

  it('409 conflict', async () => {
    const res = await app.inject('/conflict');
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('CONFLICT');
  });

  it('inline error replies are enriched with the unified fields', async () => {
    const res = await app.inject('/inline');
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: 'Not Found', message: 'Thing not found', code: 'NOT_FOUND', retryable: false });
    expect(res.json().requestId).toBeTruthy();
    expect(res.json().userMessage).toBeTruthy();
  });

  it('sets Retry-After for rate limit errors', async () => {
    const res = await app.inject('/rate');
    expect(res.statusCode).toBe(429);
    expect(res.headers['retry-after']).toBe('7');
    expect(res.json()).toMatchObject({ code: 'RATE_LIMITED', retryable: true });
  });

  it('keeps the specific message as userMessage for 400/409 errors', async () => {
    expect((await app.inject('/bad')).json().userMessage).toBe('Status must be open or closed');
    expect((await app.inject('/conflict')).json().userMessage).toBe('dup');
    expect((await app.inject('/inline')).json().userMessage).not.toBe('Thing not found');
  });

  it('enriches message-only stub replies (501)', async () => {
    const res = await app.inject('/stub');
    expect(res.statusCode).toBe(501);
    expect(res.json()).toMatchObject({ statusCode: 501, message: 'Not implemented', code: 'INTERNAL_ERROR' });
    expect(res.json().requestId).toBeTruthy();
  });

  it('plugin-originated errors (csrf) go through the unified shape', async () => {
    const res = await app.inject('/csrf');
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ code: 'FORBIDDEN', retryable: false });
  });

  it('hides raw 500 messages outside development (including test)', async () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';
    try {
      expect((await app.inject('/boom')).body).not.toContain('secret db detail');
      process.env.NODE_ENV = 'development';
      expect((await app.inject('/boom')).json().message).toBe('secret db detail');
    } finally { process.env.NODE_ENV = prev; }
  });

  it('replays idempotent GETs once after a transient failure', async () => {
    const res = await app.inject('/flaky');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true });
  });

  it('returns 503 when the replay also fails and does not loop', async () => {
    const res = await app.inject('/alwaysdown');
    expect(res.statusCode).toBe(503);
    expect(res.json().code).toBe('SERVICE_UNAVAILABLE');
  });

  it('a client-supplied x-error-recovery header does not suppress tracking or disable replay', async () => {
    const res = await app.inject({ url: '/forged', headers: { 'x-error-recovery': '1' } });
    expect(res.statusCode).toBe(500);
    expect(captured).toHaveLength(1);
    captured.length = 0;
    const flaky = await app.inject({ url: '/flaky', headers: { 'x-error-recovery': '1' } });
    expect(flaky.statusCode).toBe(200);
  });

  it('tracks a failed replay once, not twice', async () => {
    await app.inject('/alwaysdown');
    expect(captured).toHaveLength(1);
  });

  it('does not replay routes that did not opt in', async () => {
    const res = await app.inject('/noreplay');
    expect(res.statusCode).toBe(503);
    expect((app as any).optOutCalls()).toBe(1);
  });

  it('replay keeps the client address', async () => {
    const res = await app.inject({ url: '/ip', remoteAddress: '203.0.113.9' });
    expect(res.statusCode).toBe(200);
    expect(res.json().ip).toBe('203.0.113.9');
  });

  it('does not turn a non-200 replay into a success', async () => {
    const res = await app.inject('/replay404');
    expect(res.statusCode).toBe(503);
  });

  it('keeps the specific reason of inline { error } replies in message, with the friendly userMessage from the code table', async () => {
    const b = (await app.inject('/inlineerr')).json();
    expect(b).toMatchObject({ code: 'CONFLICT', message: 'Name already in use by another SLA', userMessage: USER_MESSAGES.CONFLICT });
  });

  it('never uses raw inline error text as userMessage', async () => {
    const res = await app.inject('/inlinedup');
    expect(res.statusCode).toBe(400);
    const b = res.json();
    expect(b.code).toBe('BAD_REQUEST');
    expect(b.userMessage).toBe(USER_MESSAGES.BAD_REQUEST);
    expect(b.userMessage).not.toContain('duplicate key');
    expect(b.userMessage).not.toContain('users_email_key');
  });

  it('merges context set on the error into the tracked and logged context', async () => {
    await app.inject('/errctx');
    expect(captured).toHaveLength(1);
    const [, ctx] = captured[0];
    // the error's operation wins, the route stays as its own field, request identity is kept
    expect(ctx).toMatchObject({ operation: 'svc.createOrder', route: 'GET /errctx', orderId: 42, tenantSlug: 'acme', userId: 'u1', errorCode: 'INTERNAL_ERROR' });
    const logged = (logger.error as any).mock.calls[0][0];
    expect(logged).toMatchObject({ operation: 'svc.createOrder', route: 'GET /errctx', orderId: 42, tenantSlug: 'acme', userId: 'u1' });
    expect(logged.headers).toEqual({ authorization: '[REDACTED]' });
    expect(logged.err.context).toEqual({ operation: 'svc.createOrder', orderId: 42, tenantSlug: 'other', headers: { authorization: '[REDACTED]' } });
    expect(logged.err).toBeInstanceOf(InternalError);
    expect(logged.err.message).toBe('boom');
  });

  it('inline 403 replies (as sent by the csrf hook in index.ts) get the unified shape', async () => {
    const b = (await app.inject('/inlinecsrf')).json();
    expect(b).toMatchObject({ statusCode: 403, code: 'FORBIDDEN', message: 'Invalid CSRF token', retryable: false });
    expect(b.requestId).toBeTruthy();
  });

  it('captures inline 5xx replies in the tracker', async () => {
    await app.inject('/stub');
    expect(captured).toHaveLength(1);
  });

  it('legacy errors with statusCode keep status and label', async () => {
    const res = await app.inject('/legacy');
    expect(res.statusCode).toBe(418);
    expect(res.json().error).toBe('Teapot');
  });

  it('unknown errors become 500 INTERNAL_ERROR, tracked, and hide details in production', async () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const res = await app.inject('/boom');
      expect(res.statusCode).toBe(500);
      expect(res.json().code).toBe('INTERNAL_ERROR');
      expect(res.body).not.toContain('secret db detail');
    } finally { process.env.NODE_ENV = prev; }
    expect(captured).toHaveLength(1);
    expect(logger.error).toHaveBeenCalled();
  });

  it('does not track client errors', async () => {
    await app.inject('/nf');
    expect(captured).toHaveLength(0);
  });

  it('transient errors are 503 and retryable', async () => {
    const r1 = await app.inject('/unavail');
    expect(r1.statusCode).toBe(503);
    expect(r1.json().retryable).toBe(true);
    const r2 = await app.inject('/pg');
    expect(r2.statusCode).toBe(503);
    expect(r2.json()).toMatchObject({ code: 'DATABASE_ERROR', retryable: true });
  });

  it('logs and tracks with tenant/operation context', async () => {
    await app.inject('/ctx');
    const [, ctx] = captured[0];
    expect(ctx).toMatchObject({ tenantSlug: 'acme', operation: 'custom.op', method: 'GET', url: '/ctx' });
    expect((logger.error as any).mock.calls[0][0]).toMatchObject({ tenantSlug: 'acme', operation: 'custom.op', statusCode: 500 });
  });

  it('runs recovery handlers', async () => {
    const res = await app.inject('/recover');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ source: 'db' });
  });
});
