import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

const scope = { setTag: vi.fn(), setExtras: vi.fn(), setUser: vi.fn() };
vi.mock('@sentry/node', () => ({
  init: vi.fn(),
  captureException: vi.fn(),
  flush: vi.fn(async () => true),
  withScope: vi.fn((cb: (s: typeof scope) => void) => cb(scope)),
}));

import * as Sentry from '@sentry/node';
import {
  initErrorTracking, captureError, flushErrorTracking, captureJobFailure, isFinalAttempt,
  resetErrorTrackingForTests,
} from '../../src/utils/errorTracking.js';
import { registerErrorHandling } from '../../src/middleware/errorHandler.js';
import { BadRequestError, NotFoundError, InternalError } from '../../src/utils/errors.js';

const DSN = 'https://public@example.ingest.sentry.io/1';

function tags(): Record<string, string> {
  return Object.fromEntries(scope.setTag.mock.calls.map(([k, v]) => [k, v]));
}

function build(err: unknown) {
  const app = Fastify({ logger: false });
  registerErrorHandling(app, { logger: { error: vi.fn(), warn: vi.fn() } });
  app.addHook('onRequest', async (req) => {
    (req as any).user = { userId: 'u-1', email: 'alice@example.com', tenantSlug: 'acme' };
  });
  app.get('/items/:id', async () => { throw err; });
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  resetErrorTrackingForTests();
  delete process.env.SENTRY_DSN;
});

describe('errorTracking without DSN', () => {
  it('is a no-op', async () => {
    expect(initErrorTracking()).toBe(false);
    captureError(new Error('x'));
    expect(await flushErrorTracking(100)).toBe(true);
    expect(Sentry.init).not.toHaveBeenCalled();
    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(Sentry.flush).not.toHaveBeenCalled();
  });
});

describe('errorTracking with DSN', () => {
  beforeEach(() => { initErrorTracking({ dsn: DSN, environment: 'test', tracesSampleRate: 0 }); });

  it('initialises Sentry and flushes with the given timeout', async () => {
    expect(Sentry.init).toHaveBeenCalledWith(expect.objectContaining({ dsn: DSN, sendDefaultPii: false, tracesSampleRate: 0 }));
    await flushErrorTracking(1234);
    expect(Sentry.flush).toHaveBeenCalledWith(1234);
  });

  it.each([new BadRequestError('bad'), new NotFoundError('User', '1')])('does not capture 4xx (%s)', async (err) => {
    const res = await build(err).inject({ method: 'GET', url: '/items/1' });
    expect(res.statusCode).toBeLessThan(500);
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('captures 5xx with tenant, code, route and requestId tags and user id only', async () => {
    const err = new Error('boom');
    const res = await build(err).inject({ method: 'GET', url: '/items/1', headers: { 'x-request-id': 'req-42' } });
    expect(res.statusCode).toBe(500);
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    expect(Sentry.captureException).toHaveBeenCalledWith(err);
    expect(tags()).toMatchObject({ tenant: 'acme', code: 'INTERNAL_ERROR', route: '/items/:id', requestId: 'req-42' });
    expect(scope.setUser).toHaveBeenCalledWith({ id: 'u-1' });
  });

  it('captures non-operational internal errors', async () => {
    await build(new InternalError('bad state')).inject({ method: 'GET', url: '/items/1' });
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });

  it('beforeSend strips auth/cookie headers, bodies and emails', () => {
    const { beforeSend } = vi.mocked(Sentry.init).mock.calls[0][0] as any;
    const out = beforeSend({
      message: 'failed for bob@example.com',
      request: {
        headers: { Authorization: 'Bearer t', cookie: 'sid=1', 'user-agent': 'ua' },
        data: { password: 'x' },
        cookies: { sid: '1' },
      },
      user: { id: 'u-1', email: 'bob@example.com', ip_address: '1.2.3.4' },
      extra: { nested: ['contact carol@example.org'] },
    }, {});
    expect(out.request.headers).toEqual({ 'user-agent': 'ua' });
    expect(out.request.data).toBeUndefined();
    expect(out.request.cookies).toBeUndefined();
    expect(out.user).toEqual({ id: 'u-1' });
    expect(JSON.stringify(out)).not.toMatch(/@example\./);
  });

  it('captures job failures only on the final attempt', () => {
    const job = { id: '7', name: 'sync', attemptsMade: 1, opts: { attempts: 3 }, data: { tenantSlug: 'acme' } };
    expect(isFinalAttempt(job)).toBe(false);
    captureJobFailure('cloud-sync', job, new Error('x'));
    expect(Sentry.captureException).not.toHaveBeenCalled();

    job.attemptsMade = 3;
    captureJobFailure('cloud-sync', job, new Error('x'));
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    expect(tags()).toMatchObject({ queue: 'cloud-sync', jobName: 'sync', jobId: '7', tenant: 'acme' });
    expect(scope.setExtras).toHaveBeenCalledWith(expect.objectContaining({
      queue: 'cloud-sync', jobName: 'sync', jobId: '7', attemptsMade: 3, tenantSlug: 'acme',
    }));
  });
});
