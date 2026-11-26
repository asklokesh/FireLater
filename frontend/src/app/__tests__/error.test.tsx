import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { render, screen } from '@/test/utils';
import GlobalError from '../error';

describe('app/error.tsx', () => {
  const original = console.error;
  beforeAll(() => { console.error = vi.fn(); });
  afterAll(() => { console.error = original; });

  it('shows the friendly message mapped from an API error code', () => {
    const apiError = Object.assign(new Error('relation x does not exist'), {
      response: { status: 503, data: { code: 'SERVICE_UNAVAILABLE', message: 'pg down' } },
    });
    render(<GlobalError error={apiError} reset={() => {}} />);
    expect(screen.getByText(/temporarily unavailable/i)).toBeInTheDocument();
    expect(screen.queryByText(/relation x/)).not.toBeInTheDocument();
  });

  it('shows the error code line for coded errors', () => {
    const apiError = Object.assign(new Error('x'), { response: { status: 503, data: { code: 'SERVICE_UNAVAILABLE' } } });
    render(<GlobalError error={apiError} reset={() => {}} />);
    expect(screen.getByText(/Error code: SERVICE_UNAVAILABLE/)).toBeInTheDocument();
  });

  it('shows the generic message for unknown errors', () => {
    render(<GlobalError error={new Error('boom internals')} reset={() => {}} />);
    expect(screen.getByText(/unexpected error/i)).toBeInTheDocument();
    expect(screen.queryByText(/boom internals/)).not.toBeInTheDocument();
  });
});
