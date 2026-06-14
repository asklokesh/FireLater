'use client';

import { forwardRef, InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className = '', label, error, id, ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label htmlFor={id} className="block text-sm font-medium text-secondary mb-1.5">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={id}
          className={`
            w-full px-3 py-2 rounded-lg bg-surface text-foreground text-sm
            border shadow-sm
            placeholder:text-muted
            transition-colors duration-150
            focus:outline-none focus:ring-2
            disabled:bg-surface-hover disabled:cursor-not-allowed disabled:text-muted
            ${
              error
                ? 'border-error focus:border-error focus:ring-error/20'
                : 'border-border-strong focus:border-primary focus:ring-primary/20'
            }
            ${className}
          `}
          {...props}
        />
        {error && <p className="mt-1.5 text-sm text-error">{error}</p>}
      </div>
    );
  }
);

Input.displayName = 'Input';
