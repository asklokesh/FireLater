import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { render, screen } from '@/test/utils';
import { userEvent } from '@testing-library/user-event';
import { ErrorBoundary } from '../ErrorBoundary';

function Boom({ error }: { error: unknown }): never {
  throw error;
}

describe('ErrorBoundary (friendly messages)', () => {
  const original = console.error;
  beforeAll(() => { console.error = vi.fn(); });
  afterAll(() => { console.error = original; });

  it('renders children when nothing throws', () => {
    render(<ErrorBoundary><div>fine</div></ErrorBoundary>);
    expect(screen.getByText('fine')).toBeInTheDocument();
  });

  it('shows friendly message and error code for API errors', () => {
    const apiError = { response: { status: 503, data: { code: 'SERVICE_UNAVAILABLE', message: 'pg down', requestId: 'req-9' } } };
    render(<ErrorBoundary><Boom error={apiError} /></ErrorBoundary>);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/temporarily unavailable/i)).toBeInTheDocument();
    expect(screen.getByText(/SERVICE_UNAVAILABLE/)).toBeInTheDocument();
    expect(screen.getByText(/req-9/)).toBeInTheDocument();
    expect(screen.queryByText(/pg down/)).not.toBeInTheDocument();
  });

  it('hides technical text for generic errors', () => {
    render(<ErrorBoundary><Boom error={new Error('TypeError: x is undefined')} /></ErrorBoundary>);
    expect(screen.queryByText(/x is undefined/)).not.toBeInTheDocument();
    expect(screen.getByText(/unexpected error/i)).toBeInTheDocument();
  });

  it('calls onError and supports custom fallback', () => {
    const onError = vi.fn();
    render(
      <ErrorBoundary onError={onError} fallback={({ code }) => <p>custom {code}</p>}>
        <Boom error={{ response: { status: 404, data: { code: 'NOT_FOUND' } } }} />
      </ErrorBoundary>
    );
    expect(onError).toHaveBeenCalledTimes(1);
    expect(screen.getByText('custom NOT_FOUND')).toBeInTheDocument();
  });

  it('Try Again resets the boundary', async () => {
    let shouldThrow = true;
    function Maybe() {
      if (shouldThrow) throw new Error('x');
      return <div>recovered</div>;
    }
    render(<ErrorBoundary><Maybe /></ErrorBoundary>);
    shouldThrow = false;
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(screen.getByText('recovered')).toBeInTheDocument();
  });

  it('clears a caught error when resetKey changes (navigation)', () => {
    const { rerender } = render(
      <ErrorBoundary resetKey="/issues"><Boom error={new Error('x')} /></ErrorBoundary>
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    rerender(<ErrorBoundary resetKey="/problems"><div>other page</div></ErrorBoundary>);
    expect(screen.getByText('other page')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('does not reset or double-report when the new page throws in the same commit as the key change', () => {
    const onError = vi.fn();
    const { rerender } = render(
      <ErrorBoundary resetKey="/a" onError={onError}><div>fine</div></ErrorBoundary>
    );
    rerender(
      <ErrorBoundary resetKey="/b" onError={onError}><Boom error={new Error('page b broke')} /></ErrorBoundary>
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('keeps the error while resetKey is unchanged', () => {
    const { rerender } = render(
      <ErrorBoundary resetKey="/issues"><Boom error={new Error('x')} /></ErrorBoundary>
    );
    rerender(<ErrorBoundary resetKey="/issues"><div>other page</div></ErrorBoundary>);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});
