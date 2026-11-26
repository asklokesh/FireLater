'use client';

import { Component, ErrorInfo as ReactErrorInfo, ReactNode } from 'react';
import { parseApiError } from '@/lib/errorMessages';

interface Props {
  children: ReactNode;
  /** Optional custom fallback renderer. */
  fallback?: (info: { message: string; code: string; reset: () => void }) => ReactNode;
  /** Called with the error for reporting (e.g. error tracking). */
  onError?: (error: unknown, info: ReactErrorInfo) => void;
  /** When this value changes (e.g. the route), a previously caught error is cleared. */
  resetKey?: string | number;
}

interface State {
  error: unknown | null;
  hasError: boolean;
}

/** Catches render errors and shows a friendly message plus the error code for support. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, hasError: false };

  static getDerivedStateFromError(error: unknown): State {
    return { error, hasError: true };
  }

  componentDidCatch(error: unknown, info: ReactErrorInfo) {
    this.props.onError?.(error, info);
  }

  componentDidUpdate(prev: Props, prevState: State) {
    // Reset only when an error was already showing before this update (so a page that throws in
    // the same commit as the route change keeps its own error and is reported once).
    if (prevState.hasError && this.state.hasError && prev.resetKey !== this.props.resetKey) {
      this.reset();
    }
  }

  reset = () => this.setState({ error: null, hasError: false });

  render() {
    if (!this.state.hasError) return this.props.children;
    const info = parseApiError(this.state.error);
    if (this.props.fallback) {
      return this.props.fallback({ message: info.message, code: info.code, reset: this.reset });
    }
    return (
      <div role="alert" className="min-h-[300px] flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <h2 className="text-xl font-semibold text-foreground mb-2">Something went wrong</h2>
          <p className="text-secondary mb-2">{info.message}</p>
          {info.code !== 'UNKNOWN' && (
            <p className="text-xs text-muted mb-4">
              Error code: {info.code}
              {info.requestId ? ` · Reference: ${info.requestId}` : ''}
            </p>
          )}
          <button
            onClick={this.reset}
            className="px-4 py-2 bg-primary text-primary-fg rounded-lg hover:bg-primary-hover"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
