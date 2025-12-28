'use client';

import { useEffect } from 'react';
import { ErrorDisplay } from '@/components/ui/error-boundary';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Dashboard error:', error);
  }, [error]);

  return (
    <ErrorDisplay
      error={error}
      reset={reset}
      title="Something went wrong"
      message="There was a problem loading this page. Please try again."
    />
  );
}
