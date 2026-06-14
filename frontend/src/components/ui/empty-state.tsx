'use client';

import { ReactNode } from 'react';
import { LucideIcon, Inbox, Plus } from 'lucide-react';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick?: () => void;
    href?: string;
  };
  children?: ReactNode;
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  children,
}: EmptyStateProps) {
  const buttonContent = action ? (
    <>
      <Plus className="w-4 h-4" />
      {action.label}
    </>
  ) : null;

  const renderActionButton = () => {
    if (!action) return null;

    const classes =
      'inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-fg rounded-lg hover:bg-primary-hover transition-all duration-150 text-sm font-medium shadow-sm active:scale-[0.98]';

    if (action.href) {
      return (
        <a href={action.href} className={classes}>
          {buttonContent}
        </a>
      );
    }

    if (action.onClick) {
      return (
        <button onClick={action.onClick} className={classes}>
          {buttonContent}
        </button>
      );
    }

    return null;
  };

  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary-subtle mb-5">
        <Icon className="w-7 h-7 text-primary" />
      </div>
      <h3 className="text-base font-semibold text-foreground tracking-tight mb-1.5">{title}</h3>
      {description && (
        <p className="text-sm text-secondary max-w-sm mb-5 leading-relaxed">{description}</p>
      )}
      {renderActionButton()}
      {children}
    </div>
  );
}

interface NoResultsProps {
  query?: string;
  onClear?: () => void;
}

export function NoResults({ query, onClear }: NoResultsProps) {
  return (
    <EmptyState
      title="No results found"
      description={
        query
          ? `No items match "${query}". Try adjusting your search or filters.`
          : 'No items match your current filters.'
      }
      action={
        onClear
          ? {
              label: 'Clear filters',
              onClick: onClear,
            }
          : undefined
      }
    />
  );
}
