'use client';

import { useT } from '@/i18n/useT';
import { useEffect } from 'react';
import { ErrorDisplay } from '@/components/ui/error-boundary';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const sh = useT('shared');
  useEffect(() => {
    console.error('Application error:', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <ErrorDisplay
        error={error}
        reset={reset}
        title={sh('errTitle')}
        message={sh('errBody')}
      />
    </div>
  );
}
