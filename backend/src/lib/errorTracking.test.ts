import { describe, it, expect, vi, beforeEach } from 'vitest';
import { flushErrorTracking, initErrorTracking, captureException, setErrorTracker, scrubContext, getErrorTracker } from './errorTracking.js';

describe('error tracking', () => {
  beforeEach(() => setErrorTracker({ name: 'noop', captureException: () => {} }));

  it('is log-only without SENTRY_DSN', async () => {
    const t = await initErrorTracking({} as any, async () => { throw new Error('should not load'); });
    expect(t.name).toBe('log');
  });

  it('uses Sentry when DSN set and package loads, passing scrubbed context', async () => {
    const scope = { setTag: vi.fn(), setUser: vi.fn(), setContext: vi.fn() };
    const sentry = {
      init: vi.fn(),
      withScope: (cb: any) => cb(scope),
      captureException: vi.fn(),
    };
    const t = await initErrorTracking({ SENTRY_DSN: 'https://k@example.test/1', NODE_ENV: 'production' } as any, async () => sentry);
    expect(t.name).toBe('sentry');
    expect(sentry.init).toHaveBeenCalledWith(expect.objectContaining({ dsn: 'https://k@example.test/1' }));
    const err = new Error('x');
    captureException(err, { tenantSlug: 'acme', userId: 'u1', operation: 'op', authorization: 'Bearer abc' });
    expect(sentry.captureException).toHaveBeenCalledWith(err);
    expect(scope.setTag).toHaveBeenCalledWith('tenant', 'acme');
    expect(scope.setUser).toHaveBeenCalledWith({ id: 'u1' });
    expect(scope.setContext).toHaveBeenCalledWith('error_context', expect.objectContaining({ authorization: '[REDACTED]' }));
  });

  it('falls back to log-only if Sentry cannot load', async () => {
    const t = await initErrorTracking({ SENTRY_DSN: 'x' } as any, async () => { throw new Error('not installed'); });
    expect(t.name).toBe('log');
    expect(getErrorTracker().name).toBe('log');
  });

  it('flushes Sentry before exit', async () => {
    const sentry = { init: vi.fn(), withScope: vi.fn(), captureException: vi.fn(), flush: vi.fn().mockResolvedValue(true) };
    await initErrorTracking({ SENTRY_DSN: 'x' } as any, async () => sentry);
    await flushErrorTracking(500);
    expect(sentry.flush).toHaveBeenCalledWith(500);
  });

  it('never throws from captureException', () => {
    setErrorTracker({ name: 'bad', captureException: () => { throw new Error('x'); } });
    expect(() => captureException(new Error('e'))).not.toThrow();
  });

  it('scrubs sensitive keys', () => {
    expect(scrubContext({ password: 'p', apiKey: 'k', userId: 'u' })).toEqual({ password: '[REDACTED]', apiKey: '[REDACTED]', userId: 'u' });
  });
});
