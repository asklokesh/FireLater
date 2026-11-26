import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@/test/utils';
import { userEvent } from '@testing-library/user-event';
import { ErrorBoundary, ErrorDisplay } from '../error-boundary';

// Component that throws an error
function ThrowError({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error('Test error message');
  }
  return <div>No error</div>;
}

describe('ErrorBoundary Component', () => {
  // Suppress console.error for these tests
  const originalError = console.error;
  beforeAll(() => {
    console.error = vi.fn();
  });
  afterAll(() => {
    console.error = originalError;
  });

  describe('Error Handling', () => {
    it('renders children when no error', () => {
      render(
        <ErrorBoundary>
          <div>Child content</div>
        </ErrorBoundary>
      );
      expect(screen.getByText('Child content')).toBeInTheDocument();
    });

    it('renders error UI when error occurs', () => {
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );
      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    });

    it('displays error message when available', () => {
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );
      expect(screen.getByText('Test error message')).toBeInTheDocument();
    });

    it('renders custom fallback when provided', () => {
      render(
        <ErrorBoundary fallback={<div>Custom error fallback</div>}>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );
      expect(screen.getByText('Custom error fallback')).toBeInTheDocument();
      expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
    });
  });

  describe('Error UI Elements', () => {
    it('renders error icon', () => {
      const { container } = render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );
      const icon = container.querySelector('svg');
      expect(icon).toBeInTheDocument();
    });

    it('renders Try Again button', () => {
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );
      expect(screen.getByText('Try Again')).toBeInTheDocument();
    });

    it('renders Go Home link', () => {
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );
      const homeLink = screen.getByText('Go Home').closest('a');
      expect(homeLink).toHaveAttribute('href', '/');
    });
  });

  describe('Recovery Behavior', () => {
    it('renders Try Again button that is clickable', async () => {
      const user = userEvent.setup();

      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      // Verify error is displayed with retry button
      expect(screen.getByText('Test error message')).toBeInTheDocument();
      const tryAgainButton = screen.getByText('Try Again');
      expect(tryAgainButton).toBeInTheDocument();

      // Verify button is clickable (doesn't throw)
      await user.click(tryAgainButton);

      // Button click triggers re-render, component throws again, error shown again
      expect(screen.getByText('Test error message')).toBeInTheDocument();
    });
  });

  describe('Styling', () => {
    it('applies correct container classes', () => {
      const { container } = render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );
      const errorContainer = container.querySelector('.min-h-\\[400px\\]');
      expect(errorContainer).toBeInTheDocument();
      expect(errorContainer).toHaveClass('flex');
      expect(errorContainer).toHaveClass('items-center');
      expect(errorContainer).toHaveClass('justify-center');
    });

    it('error icon has correct styling', () => {
      const { container } = render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );
      const iconWrapper = container.querySelector('.bg-red-100');
      expect(iconWrapper).toBeInTheDocument();
      expect(iconWrapper).toHaveClass('rounded-full');
    });

    it('Try Again button has correct styling', () => {
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );
      const button = screen.getByText('Try Again').closest('button');
      expect(button).toHaveClass('bg-blue-600');
      expect(button).toHaveClass('text-white');
    });
  });
});

describe('ErrorDisplay Component', () => {
  describe('Rendering', () => {
    it('renders with default title', () => {
      render(<ErrorDisplay />);
      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    });

    it('renders with custom title', () => {
      render(<ErrorDisplay title="Custom Error Title" />);
      expect(screen.getByText('Custom Error Title')).toBeInTheDocument();
    });

    it('renders with default message', () => {
      render(<ErrorDisplay />);
      expect(screen.getByText('An unexpected error occurred. Please try again.')).toBeInTheDocument();
    });

    it('renders with custom message', () => {
      render(<ErrorDisplay message="Custom error message" />);
      expect(screen.getByText('Custom error message')).toBeInTheDocument();
    });

    it('renders error message from Error object', () => {
      const error = new Error('Error object message');
      render(<ErrorDisplay error={error} />);
      expect(screen.getByText('Error object message')).toBeInTheDocument();
    });

    it('custom message takes precedence over error object', () => {
      const error = new Error('Error object message');
      render(<ErrorDisplay error={error} message="Custom message" />);
      expect(screen.getByText('Custom message')).toBeInTheDocument();
      expect(screen.queryByText('Error object message')).not.toBeInTheDocument();
    });
  });

  describe('Reset Functionality', () => {
    it('renders Try Again button when reset provided', () => {
      render(<ErrorDisplay reset={() => {}} />);
      expect(screen.getByText('Try Again')).toBeInTheDocument();
    });

    it('does not render Try Again button when reset not provided', () => {
      render(<ErrorDisplay />);
      expect(screen.queryByText('Try Again')).not.toBeInTheDocument();
    });

    it('calls reset when Try Again button clicked', async () => {
      const handleReset = vi.fn();
      const user = userEvent.setup();

      render(<ErrorDisplay reset={handleReset} />);

      const tryAgainButton = screen.getByText('Try Again');
      await user.click(tryAgainButton);

      expect(handleReset).toHaveBeenCalledTimes(1);
    });
  });

  describe('Navigation', () => {
    it('always renders Go Home link', () => {
      render(<ErrorDisplay />);
      const homeLink = screen.getByText('Go Home').closest('a');
      expect(homeLink).toHaveAttribute('href', '/');
    });

    it('Go Home link has correct styling', () => {
      render(<ErrorDisplay />);
      const homeLink = screen.getByText('Go Home').closest('a');
      expect(homeLink).toHaveClass('bg-gray-100');
      expect(homeLink).toHaveClass('text-gray-700');
    });
  });

  describe('Visual Elements', () => {
    it('renders error icon', () => {
      const { container } = render(<ErrorDisplay />);
      const icon = container.querySelector('svg');
      expect(icon).toBeInTheDocument();
    });

    it('icon wrapper has correct styling', () => {
      const { container } = render(<ErrorDisplay />);
      const iconWrapper = container.querySelector('.bg-red-100');
      expect(iconWrapper).toBeInTheDocument();
      expect(iconWrapper).toHaveClass('w-16');
      expect(iconWrapper).toHaveClass('h-16');
      expect(iconWrapper).toHaveClass('rounded-full');
    });
  });

  describe('Layout', () => {
    it('applies correct container classes', () => {
      const { container } = render(<ErrorDisplay />);
      const errorContainer = container.querySelector('.min-h-\\[50vh\\]');
      expect(errorContainer).toBeInTheDocument();
      expect(errorContainer).toHaveClass('flex');
      expect(errorContainer).toHaveClass('items-center');
      expect(errorContainer).toHaveClass('justify-center');
    });

    it('centers content', () => {
      const { container } = render(<ErrorDisplay />);
      const contentWrapper = container.querySelector('.text-center');
      expect(contentWrapper).toBeInTheDocument();
    });

    it('button group has correct spacing', () => {
      const { container } = render(<ErrorDisplay reset={() => {}} />);
      const buttonGroup = container.querySelector('.flex.items-center.justify-center.gap-3');
      expect(buttonGroup).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('handles undefined error gracefully', () => {
      render(<ErrorDisplay error={undefined} />);
      expect(screen.getByText('An unexpected error occurred. Please try again.')).toBeInTheDocument();
    });

    it('handles empty error message', () => {
      const error = new Error('');
      render(<ErrorDisplay error={error} />);
      expect(screen.getByText('An unexpected error occurred. Please try again.')).toBeInTheDocument();
    });

    it('works with all props provided', () => {
      const handleReset = vi.fn();
      const error = new Error('Test error');

      render(
        <ErrorDisplay
          error={error}
          reset={handleReset}
          title="Custom Title"
          message="Custom Message"
        />
      );

      expect(screen.getByText('Custom Title')).toBeInTheDocument();
      expect(screen.getByText('Custom Message')).toBeInTheDocument();
      expect(screen.getByText('Try Again')).toBeInTheDocument();
      expect(screen.getByText('Go Home')).toBeInTheDocument();
    });
  });
});

function Boom({ error }: { error: unknown }): never {
  throw error;
}

describe('ErrorBoundary (friendly messages, reporting, reset)', () => {
  const original = console.error;
  beforeAll(() => { console.error = vi.fn(); });
  afterAll(() => { console.error = original; });

  it('shows friendly message and error code for API errors', () => {
    const apiError = { response: { status: 503, data: { code: 'SERVICE_UNAVAILABLE', message: 'pg down', requestId: 'req-9' } } };
    render(<ErrorBoundary><Boom error={apiError} /></ErrorBoundary>);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/temporarily unavailable/i)).toBeInTheDocument();
    expect(screen.getByText(/Error code: SERVICE_UNAVAILABLE/)).toBeInTheDocument();
    expect(screen.getByText(/req-9/)).toBeInTheDocument();
    expect(screen.queryByText(/pg down/)).not.toBeInTheDocument();
  });

  it('shows no code line for errors without an API error code', () => {
    render(<ErrorBoundary><Boom error={new Error('x is undefined')} /></ErrorBoundary>);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText(/Error code/)).not.toBeInTheDocument();
  });

  it('calls onError and supports a fallback renderer', () => {
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

  it('does not reset or double-report when the new child throws in the same commit as the key change', () => {
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

describe('ErrorDisplay error code line', () => {
  it('shows the code and request reference when given', () => {
    render(<ErrorDisplay message="Too many requests." code="RATE_LIMITED" requestId="req-1" />);
    expect(screen.getByText('Error code: RATE_LIMITED (reference req-1)')).toBeInTheDocument();
  });

  it('shows no code line without a code', () => {
    render(<ErrorDisplay message="m" />);
    expect(screen.queryByText(/Error code/)).not.toBeInTheDocument();
  });
});
