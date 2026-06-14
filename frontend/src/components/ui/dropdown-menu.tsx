'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

interface DropdownMenuProps {
  trigger: React.ReactNode;
  children: React.ReactNode;
  align?: 'left' | 'right';
}

export function DropdownMenu({ trigger, children, align = 'right' }: DropdownMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setIsOpen(false);
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPosition({
        top: rect.bottom + window.scrollY + 6,
        left: align === 'right' ? rect.right + window.scrollX - 192 : rect.left + window.scrollX,
      });
    }
  }, [isOpen, align]);

  return (
    <>
      <div
        ref={triggerRef}
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
      >
        {trigger}
      </div>
      {isOpen &&
        typeof window !== 'undefined' &&
        createPortal(
          <div
            ref={menuRef}
            className="fixed z-50 w-48 bg-surface rounded-xl shadow-lg border border-border py-1 focus:outline-none"
            style={{ top: position.top, left: position.left }}
          >
            {children}
          </div>,
          document.body
        )}
    </>
  );
}

interface DropdownMenuItemProps {
  onClick?: () => void;
  disabled?: boolean;
  variant?: 'default' | 'danger';
  children: React.ReactNode;
}

export function DropdownMenuItem({
  onClick,
  disabled = false,
  variant = 'default',
  children,
}: DropdownMenuItemProps) {
  const variantClasses = {
    default: 'text-secondary hover:bg-surface-hover hover:text-foreground',
    danger: 'text-error hover:bg-error-subtle',
  };

  return (
    <button
      className={`flex items-center w-full px-3 py-2 text-sm transition-colors duration-150 ${variantClasses[variant]} ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      onClick={(e) => {
        e.stopPropagation();
        if (!disabled && onClick) onClick();
      }}
      disabled={disabled}
      role="menuitem"
    >
      {children}
    </button>
  );
}

export function DropdownMenuDivider() {
  return <div className="border-t border-border my-1" />;
}
