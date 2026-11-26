import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@/test/utils';
import { api } from '@/lib/api';
import { ERROR_MESSAGES } from '@/lib/errorMessages';
import DashboardError from '../error';

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => { data.set(k, String(v)); },
    removeItem: (k: string) => { data.delete(k); },
    clear: () => data.clear(),
  };
}

describe('(dashboard)/error.tsx', () => {
  let post: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    post = vi.spyOn(api, 'post').mockResolvedValue({ data: { received: true } });
    vi.stubGlobal('localStorage', memoryStorage({ accessToken: 'token' }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('shows the friendly message and the error code, and reports the error once', () => {
    const error = Object.assign(new Error('Request failed with status code 429'), {
      isAxiosError: true,
      response: { status: 429, data: { code: 'RATE_LIMITED', message: 'rate limit exceeded for key 10.0.0.5', requestId: 'req-42' } },
    });
    render(<DashboardError error={error} reset={() => {}} />);

    expect(screen.getByText(ERROR_MESSAGES.RATE_LIMITED)).toBeInTheDocument();
    expect(screen.getByText('Error code: RATE_LIMITED (reference req-42)')).toBeInTheDocument();
    expect(screen.queryByText(/10\.0\.0\.5/)).not.toBeInTheDocument();

    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith('/v1/client-errors', expect.objectContaining({
      message: 'Request failed with status code 429',
      code: 'RATE_LIMITED',
    }));
  });

  it('keeps the generic page message for errors without a code, still reporting them', () => {
    render(<DashboardError error={new Error('TypeError: x is undefined')} reset={() => {}} />);
    expect(screen.getByText('There was a problem loading this page. Please try again.')).toBeInTheDocument();
    expect(screen.queryByText(/x is undefined/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Error code/)).not.toBeInTheDocument();
    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0][1]).toMatchObject({ message: 'TypeError: x is undefined' });
    expect(post.mock.calls[0][1]).not.toHaveProperty('code', expect.anything());
  });
});
