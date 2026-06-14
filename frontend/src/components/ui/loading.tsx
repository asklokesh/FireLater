'use client';

import { Loader2 } from 'lucide-react';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  text?: string;
  fullScreen?: boolean;
}

const sizeClasses = {
  sm: 'h-4 w-4',
  md: 'h-8 w-8',
  lg: 'h-10 w-10',
};

export function LoadingSpinner({ size = 'md', text, fullScreen }: LoadingSpinnerProps) {
  const content = (
    <div className="flex flex-col items-center justify-center gap-3">
      <Loader2 className={`${sizeClasses[size]} animate-spin text-primary`} />
      {text && <p className="text-sm text-muted">{text}</p>}
    </div>
  );

  if (fullScreen) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        {content}
      </div>
    );
  }

  return content;
}

interface PageLoadingProps {
  text?: string;
}

export function PageLoading({ text = 'Loading...' }: PageLoadingProps) {
  return (
    <div className="min-h-[400px] flex items-center justify-center">
      <LoadingSpinner size="lg" text={text} />
    </div>
  );
}

interface TableLoadingProps {
  rows?: number;
  columns?: number;
}

export function TableLoading({ rows = 5, columns = 4 }: TableLoadingProps) {
  return (
    <div className="animate-pulse space-y-3">
      <div className="h-9 bg-surface-hover rounded-lg" />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4">
          {Array.from({ length: columns }).map((_, j) => (
            <div
              key={j}
              className="h-8 bg-surface-hover rounded-md flex-1"
            />
          ))}
        </div>
      ))}
    </div>
  );
}

interface CardLoadingProps {
  count?: number;
}

export function CardLoading({ count = 3 }: CardLoadingProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="animate-pulse bg-surface border border-border rounded-xl p-5">
          <div className="h-4 bg-surface-hover rounded w-3/4 mb-4" />
          <div className="h-3 bg-surface-hover rounded w-full mb-2" />
          <div className="h-3 bg-surface-hover rounded w-5/6" />
        </div>
      ))}
    </div>
  );
}

interface InlineLoadingProps {
  text?: string;
}

export function InlineLoading({ text = 'Loading...' }: InlineLoadingProps) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-muted">
      <Loader2 className="h-3 w-3 animate-spin text-primary" />
      {text}
    </span>
  );
}
