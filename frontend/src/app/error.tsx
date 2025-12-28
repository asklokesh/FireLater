'use client';

import { useEffect } from 'react';
import { ErrorDisplay } from '@/components/ui/error-boundary';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Application error:', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <ErrorDisplay
        error={error}
        reset={reset}
        title="Application Error"
        message="We encountered an unexpected error. Our team has been notified."
      />
    </div>
  );
}
