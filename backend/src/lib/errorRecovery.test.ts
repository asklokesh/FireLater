import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  registerDefaultRecoveryHandlers, clearRecoveryHandlers, attemptRecovery, withRecovery, listRecoveryHandlers,
} from './errorRecovery.js';
import { CacheError, ServiceUnavailableError, NotFoundError } from './errors.js';

describe('error recovery', () => {
  beforeEach(() => {
    clearRecoveryHandlers();
    registerDefaultRecoveryHandlers();
  });

  it('registers defaults', () => {
    expect(listRecoveryHandlers()).toEqual(['cache-fallback', 'transient-retry']);
  });

  it('falls back to source of truth on cache error', async () => {
    const fallback = vi.fn().mockResolvedValue('from-db');
    const r = await attemptRecovery(new CacheError(), { fallback });
    expect(r).toEqual({ recovered: true, value: 'from-db', handler: 'cache-fallback' });
  });

  it('retries on transient error', async () => {
    const retry = vi.fn().mockResolvedValue(1);
    const r = await attemptRecovery(new ServiceUnavailableError(), { retry });
    expect(r.recovered).toBe(true);
  });

  it('does not recover non-matching errors', async () => {
    expect((await attemptRecovery(new NotFoundError('x'), { retry: async () => 1 })).recovered).toBe(false);
  });

  it('failing handler does not mask original error', async () => {
    const err = new CacheError();
    await expect(withRecovery(async () => { throw err; }, { fallback: async () => { throw new Error('boom'); } })).rejects.toBe(err);
  });

  it('withRecovery returns recovered value', async () => {
    await expect(withRecovery(async () => { throw new CacheError(); }, { fallback: async () => 'x' })).resolves.toBe('x');
  });
});
