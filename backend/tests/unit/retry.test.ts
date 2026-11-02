import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { withRetry, retryable, isTransientError, computeBackoff } from '../../src/utils/retry.js';
import {
  AppError,
  ErrorCode,
  NotFoundError,
  ValidationError,
  ServiceUnavailableError,
  ExternalServiceError,
  RateLimitError,
} from '../../src/utils/errors.js';

const transient = () => Object.assign(new Error('reset'), { code: 'ECONNRESET' });

describe('retry utility', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('succeeds after transient failures', async () => {
    const op = vi.fn().mockRejectedValueOnce(transient()).mockRejectedValueOnce(transient()).mockResolvedValue('ok');
    const p = withRetry(op);
    await vi.runAllTimersAsync();
    await expect(p).resolves.toBe('ok');
    expect(op).toHaveBeenCalledTimes(3);
  });

  it.each([
    ['NotFoundError', new NotFoundError('Issue', '1')],
    ['ValidationError', new ValidationError([{ field: 'x' }])],
    ['CIRCUIT_OPEN', new ServiceUnavailableError('open', { code: ErrorCode.CIRCUIT_OPEN, retryAfterSeconds: 5 })],
  ])('does not retry %s', async (_name, err) => {
    const op = vi.fn().mockRejectedValue(err);
    await expect(withRetry(op)).rejects.toBe(err);
    expect(op).toHaveBeenCalledTimes(1);
    expect((err as any).attempts).toBe(1);
  });

  it('caps attempts and rethrows final error with attempt count', async () => {
    const errors = [transient(), transient(), transient(), transient()];
    let i = 0;
    const op = vi.fn().mockImplementation(() => Promise.reject(errors[i++]));
    const p = withRetry(op, { maxAttempts: 4 }).catch((e) => e);
    await vi.runAllTimersAsync();
    const err = await p;
    expect(err).toBe(errors[3]);
    expect(err.attempts).toBe(4);
    expect(op).toHaveBeenCalledTimes(4);
  });

  it('defaults to 3 attempts', async () => {
    const op = vi.fn().mockRejectedValue(transient());
    const p = withRetry(op).catch((e) => e);
    await vi.runAllTimersAsync();
    expect((await p).attempts).toBe(3);
    expect(op).toHaveBeenCalledTimes(3);
  });

  it('computes exponential backoff bounded by the cap', () => {
    expect(computeBackoff(1, 200, 2, 2000)).toBe(200);
    expect(computeBackoff(2, 200, 2, 2000)).toBe(400);
    expect(computeBackoff(4, 200, 2, 2000)).toBe(1600);
    expect(computeBackoff(5, 200, 2, 2000)).toBe(2000);
    expect(computeBackoff(10, 200, 2, 2000)).toBe(2000);
  });

  it('waits the un-jittered delay when jitter is disabled', async () => {
    const op = vi.fn().mockRejectedValueOnce(transient()).mockResolvedValue('ok');
    const p = withRetry(op, { jitter: false, baseDelayMs: 300 });
    await vi.advanceTimersByTimeAsync(299);
    expect(op).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(p).resolves.toBe('ok');
    expect(op).toHaveBeenCalledTimes(2);
  });

  it('applies full jitter within [0, ceiling)', async () => {
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    for (const r of [0, 0.5, 0.999]) {
      setTimeoutSpy.mockClear();
      const op = vi.fn().mockRejectedValueOnce(transient()).mockResolvedValue('ok');
      const p = withRetry(op, { random: () => r });
      await vi.runAllTimersAsync();
      await p;
      const delay = setTimeoutSpy.mock.calls[0][1] as number;
      expect(delay).toBeGreaterThanOrEqual(0);
      expect(delay).toBeLessThan(200);
      expect(delay).toBe(Math.floor(r * 200));
    }
    setTimeoutSpy.mockRestore();
  });

  it('stops further attempts when aborted', async () => {
    const controller = new AbortController();
    const op = vi.fn().mockRejectedValue(transient());
    const p = withRetry(op, { signal: controller.signal, jitter: false }).catch((e) => e);
    await vi.advanceTimersByTimeAsync(50);
    controller.abort();
    await vi.runAllTimersAsync();
    const err = await p;
    expect(err.code).toBe('ECONNRESET');
    expect(op).toHaveBeenCalledTimes(1);
  });

  it('does not call the operation when signal already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const op = vi.fn().mockResolvedValue('ok');
    await expect(withRetry(op, { signal: controller.signal })).rejects.toBeDefined();
    expect(op).not.toHaveBeenCalled();
  });

  it('retryable wraps a function and preserves this and args', async () => {
    const svc = {
      calls: 0,
      async fetch(this: any, x: number) {
        this.calls++;
        if (this.calls < 2) throw transient();
        return x * 2;
      },
    };
    const wrapped = retryable(svc.fetch, { operationName: 'svc.fetch' });
    const p = wrapped.call(svc, 21);
    await vi.runAllTimersAsync();
    await expect(p).resolves.toBe(42);
    expect(svc.calls).toBe(2);
  });
});

describe('isTransientError', () => {
  it.each(['40001', '40P01', '57P01', '08000', '08006', '08P01', 'ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EAI_AGAIN'])(
    'is true for code %s',
    (code) => {
      expect(isTransientError(Object.assign(new Error('x'), { code }))).toBe(true);
    }
  );

  it('is true for retryable 5xx AppErrors', () => {
    expect(isTransientError(new ServiceUnavailableError())).toBe(true);
    expect(isTransientError(new ExternalServiceError('t', { code: ErrorCode.UPSTREAM_TIMEOUT }))).toBe(true);
  });

  it('is false for CIRCUIT_OPEN, 4xx AppErrors and unclassified errors', () => {
    expect(isTransientError(new ServiceUnavailableError('o', { code: ErrorCode.CIRCUIT_OPEN }))).toBe(false);
    expect(isTransientError(new RateLimitError())).toBe(false);
    expect(isTransientError(new NotFoundError('x'))).toBe(false);
    expect(isTransientError(new AppError(409, 'Conflict', 'c', undefined, { retryable: true }))).toBe(false);
    expect(isTransientError(new AppError(500, 'Internal', 'i'))).toBe(false);
    expect(isTransientError(new Error('boom'))).toBe(false);
    expect(isTransientError(Object.assign(new Error('x'), { code: '23505' }))).toBe(false);
    expect(isTransientError(undefined)).toBe(false);
  });
});
