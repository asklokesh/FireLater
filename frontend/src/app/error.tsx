'use client';

import { useEffect } from 'react';
import { ErrorDisplay, describeError } from '@/components/ui/error-boundary';
import { reportClientError } from '@/lib/api';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Application error:', error);
    reportClientError(error);
  }, [error]);

  const known = describeError(error);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <ErrorDisplay
        error={error}
        reset={reset}
        title="Application Error"
        message={known.message ?? 'We encountered an unexpected error. Our team has been notified.'}
        code={known.code}
        requestId={known.requestId}
      />
    </div>
  );
}
