'use client';

import { Component, ErrorInfo as ReactErrorInfo, ReactNode } from 'react';
import Link from 'next/link';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { parseApiError } from '@/lib/errorMessages';

/** Friendly message plus the error code, for errors that carry a known API error code. */
export function describeError(error: unknown): { message?: string; code?: string; requestId?: string } {
  const info = parseApiError(error);
  if (info.code === 'UNKNOWN' || info.code === 'CANCELED') return {};
  return { message: info.message, code: info.code, requestId: info.requestId };
}

interface FallbackInfo {
  message: string;
  code: string;
  reset: () => void;
}

interface Props {
  children: ReactNode;
  /** Custom fallback: an element, or a renderer that gets the friendly message and code. */
  fallback?: ReactNode | ((info: FallbackInfo) => ReactNode);
  /** Called with the error for reporting (e.g. error tracking). */
  onError?: (error: unknown, info: ReactErrorInfo) => void;
  /** When this value changes (e.g. the route), a previously caught error is cleared. */
  resetKey?: string | number;
}

interface State {
  hasError: boolean;
  error: unknown;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: unknown): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: unknown, errorInfo: ReactErrorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  componentDidUpdate(prev: Props, prevState: State) {
    // Reset only when an error was already showing before this update (so a child that throws in
    // the same commit as the key change keeps its own error and is reported once).
    if (prevState.hasError && this.state.hasError && prev.resetKey !== this.props.resetKey) {
      this.handleRetry();
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      const { fallback } = this.props;
      if (typeof fallback === 'function') {
        const info = parseApiError(this.state.error);
        return fallback({ message: info.message, code: info.code, reset: this.handleRetry });
      }
      if (fallback) {
        return fallback;
      }

      const known = describeError(this.state.error);
      const raw = this.state.error instanceof Error ? this.state.error.message : '';
      return (
        <div role="alert" className="min-h-[400px] flex items-center justify-center p-6">
          <div className="text-center max-w-md">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-error-subtle mb-5">
              <AlertTriangle className="w-7 h-7 text-error" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Something went wrong
            </h2>
            <p className={known.code ? 'text-gray-600 mb-2' : 'text-gray-600 mb-6'}>
              {known.message || raw || 'An unexpected error occurred'}
            </p>
            {known.code && <ErrorCodeLine code={known.code} requestId={known.requestId} />}
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={this.handleRetry}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Try Again
              </button>
              <Link
                href="/"
                className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
              >
                <Home className="w-4 h-4" />
                Go Home
              </Link>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

/** The error code (and request reference) line shown under a friendly message, for support. */
export function ErrorCodeLine({ code, requestId }: { code: string; requestId?: string }) {
  return (
    <p className="text-xs text-muted mb-6">
      Error code: {code}
      {requestId ? ` (reference ${requestId})` : ''}
    </p>
  );
}

// Functional error display component for Next.js error pages
interface ErrorDisplayProps {
  error?: Error;
  reset?: () => void;
  title?: string;
  message?: string;
  /** Error code shown under the message (for support). */
  code?: string;
  requestId?: string;
}

export function ErrorDisplay({ error, reset, title, message, code, requestId }: ErrorDisplayProps) {
  return (
    <div role="alert" className="min-h-[400px] flex items-center justify-center p-6">
      <div className="text-center max-w-md">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-error-subtle mb-5">
          <AlertTriangle className="w-7 h-7 text-error" />
        </div>
        <h2 className="text-xl font-semibold text-foreground mb-2">
          {title || 'Something went wrong'}
        </h2>
        <p className={code ? 'text-secondary mb-2' : 'text-secondary mb-6'}>
          {message || error?.message || 'An unexpected error occurred. Please try again.'}
        </p>
        {code && <ErrorCodeLine code={code} requestId={requestId} />}
        <div className="flex items-center justify-center gap-3">
          {reset && (
            <button
              onClick={reset}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-fg rounded-lg hover:bg-primary-hover transition-all duration-150 active:scale-[0.98]"
            >
              <RefreshCw className="w-4 h-4" />
              Try Again
            </button>
          )}
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-4 py-2 bg-surface-hover text-secondary border border-border rounded-lg hover:bg-surface-hover transition-all duration-150"
          >
            <Home className="w-4 h-4" />
            Go Home
          </Link>
        </div>
      </div>
    </div>
  );
}
