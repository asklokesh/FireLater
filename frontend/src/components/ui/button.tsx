'use client';

import { forwardRef, ButtonHTMLAttributes } from 'react';
import { Loader2 } from 'lucide-react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
}

const variantClasses = {
  primary:
    'bg-primary text-primary-fg hover:bg-primary-hover shadow-sm',
  secondary:
    'bg-surface text-foreground border border-border-strong hover:bg-surface-hover shadow-sm',
  outline:
    'border border-border-strong bg-transparent text-foreground hover:bg-surface-hover',
  ghost:
    'bg-transparent text-secondary hover:bg-surface-hover hover:text-foreground',
  danger:
    'bg-error text-white hover:brightness-95 shadow-sm',
};

const sizeClasses = {
  sm: 'px-3 py-1.5 text-sm gap-1.5',
  md: 'px-4 py-2 text-sm gap-2',
  lg: 'px-5 py-2.5 text-[15px] gap-2',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = '', variant = 'primary', size = 'md', isLoading, disabled, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={`
          inline-flex items-center justify-center rounded-lg font-medium
          transition-all duration-150
          focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background
          disabled:opacity-50 disabled:pointer-events-none
          active:scale-[0.98]
          ${variantClasses[variant]}
          ${sizeClasses[size]}
          ${className}
        `}
        {...props}
      >
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : null}
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
