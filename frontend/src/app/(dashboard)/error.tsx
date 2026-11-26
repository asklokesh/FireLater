'use client';

import { useEffect } from 'react';
import { ErrorDisplay, describeError } from '@/components/ui/error-boundary';
import { reportClientError } from '@/lib/api';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Dashboard error:', error);
    reportClientError(error);
  }, [error]);

  // Errors with an API error code get their friendly message and code; anything else stays generic
  const known = describeError(error);

  return (
    <ErrorDisplay
      error={error}
      reset={reset}
      title="Something went wrong"
      message={known.message ?? 'There was a problem loading this page. Please try again.'}
      code={known.code}
      requestId={known.requestId}
    />
  );
}
