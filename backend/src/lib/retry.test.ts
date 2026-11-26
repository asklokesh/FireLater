import { describe, it, expect, vi } from 'vitest';
import { withRetry, Retry, computeBackoff } from './retry.js';
import { ServiceUnavailableError, NotFoundError } from './errors.js';

const sleep = vi.fn(async () => {});

describe('withRetry', () => {
  it('retries retryable errors until success', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new ServiceUnavailableError())
      .mockRejectedValueOnce(Object.assign(new Error('r'), { code: 'ECONNRESET' }))
      .mockResolvedValue('ok');
    await expect(withRetry(fn, { sleep, maxAttempts: 3 })).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does not retry non-retryable errors', async () => {
    const fn = vi.fn().mockRejectedValue(new NotFoundError('x'));
    await expect(withRetry(fn, { sleep })).rejects.toBeInstanceOf(NotFoundError);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('stops at maxAttempts and rethrows last error', async () => {
    const fn = vi.fn().mockRejectedValue(new ServiceUnavailableError());
    await expect(withRetry(fn, { sleep, maxAttempts: 4 })).rejects.toBeInstanceOf(ServiceUnavailableError);
    expect(fn).toHaveBeenCalledTimes(4);
  });

  it('calls onRetry with growing delay', async () => {
    const delays: number[] = [];
    const fn = vi.fn().mockRejectedValue(new ServiceUnavailableError());
    await withRetry(fn, { sleep, maxAttempts: 3, jitter: 0, baseDelayMs: 10, onRetry: (_e, _a, d) => delays.push(d) }).catch(() => {});
    expect(delays).toEqual([10, 20]);
  });

  it('computeBackoff respects max', () => {
    expect(computeBackoff(10, { baseDelayMs: 100, maxDelayMs: 500, jitter: 0 })).toBe(500);
  });

  it('@Retry decorator syntax retries a service method', async () => {
    class Svc {
      calls = 0;
      @Retry({ sleep, baseDelayMs: 1 })
      async fetch() {
        this.calls++;
        if (this.calls < 2) throw new ServiceUnavailableError();
        return 'done';
      }
      @Retry({ sleep })
      async missing() {
        this.calls++;
        throw new NotFoundError('x');
      }
    }
    const s = new Svc();
    await expect(s.fetch()).resolves.toBe('done');
    expect(s.calls).toBe(2);
    s.calls = 0;
    await expect(s.missing()).rejects.toBeInstanceOf(NotFoundError);
    expect(s.calls).toBe(1);
  });
});
