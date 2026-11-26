import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const h = vi.hoisted(() => {
  const instance: any = vi.fn(async () => ({ data: 'replayed' }));
  instance.get = vi.fn();
  instance.post = vi.fn(async () => ({ data: {} }));
  instance.defaults = { headers: { common: {} } };
  instance.interceptors = { request: { use: vi.fn() }, response: { use: vi.fn() } };
  return { instance };
});

vi.mock('axios', () => ({
  default: { create: vi.fn(() => h.instance), post: vi.fn() },
}));

describe('api response interceptor: automatic retry', () => {
  let onError: (e: any) => Promise<unknown>;

  beforeEach(async () => {
    vi.resetModules();
    vi.useFakeTimers();
    h.instance.mockClear();
    h.instance.interceptors.response.use.mockClear();
    await import('../api');
    onError = h.instance.interceptors.response.use.mock.calls[0][1];
  });

  it('replays an idempotent request once after a network failure', async () => {
    const config = { method: 'get', url: '/v1/issues', headers: {} };
    const p = onError({ isAxiosError: true, config });
    await vi.runAllTimersAsync();
    await expect(p).resolves.toEqual({ data: 'replayed' });
    expect(h.instance).toHaveBeenCalledTimes(1);
    expect((config as any)._retryCount).toBe(1);
  });

  it('rejects after the single replay is used up', async () => {
    const err = { isAxiosError: true, config: { method: 'get', headers: {}, _retryCount: 1 } };
    await expect(onError(err)).rejects.toBe(err);
    expect(h.instance).not.toHaveBeenCalled();
  });

  it('does not replay POSTs, 503s, 429s or cancelled requests', async () => {
    const cases = [
      { isAxiosError: true, config: { method: 'post', headers: {} } },
      { isAxiosError: true, config: { method: 'get', headers: {} }, response: { status: 503, data: { code: 'SERVICE_UNAVAILABLE' } } },
      { isAxiosError: true, config: { method: 'get', headers: {} }, response: { status: 429, data: { code: 'RATE_LIMITED' } } },
      { isAxiosError: true, code: 'ERR_CANCELED', config: { method: 'get', headers: {} } },
    ];
    for (const c of cases) {
      await expect(onError(c)).rejects.toBe(c);
    }
    expect(h.instance).not.toHaveBeenCalled();
  });
});

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => { data.set(k, String(v)); },
    removeItem: (k: string) => { data.delete(k); },
    clear: () => data.clear(),
  };
}

describe('reportClientError', () => {
  beforeEach(() => {
    vi.resetModules();
    h.instance.post.mockClear();
    vi.stubGlobal('localStorage', memoryStorage({ accessToken: 'token' }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not report when signed out (the endpoint needs a session)', async () => {
    vi.stubGlobal('localStorage', memoryStorage());
    const { reportClientError } = await import('../api');
    reportClientError(new Error('boom'));
    expect(h.instance.post).not.toHaveBeenCalled();
  });

  it('posts a trimmed error with its code to /v1/client-errors', async () => {
    const { reportClientError } = await import('../api');
    reportClientError(Object.assign(new Error('boom'), { response: { status: 404, data: { code: 'NOT_FOUND' } } }), 'at X');
    expect(h.instance.post).toHaveBeenCalledWith('/v1/client-errors', expect.objectContaining({
      message: 'boom', code: 'NOT_FOUND', componentStack: 'at X',
    }));
  });

  it('never throws, even when the request fails', async () => {
    h.instance.post.mockRejectedValueOnce(new Error('offline'));
    const { reportClientError } = await import('../api');
    expect(() => reportClientError(new Error('x'))).not.toThrow();
  });
});
