'use client';

import { useT } from '@/i18n/useT';
import { LanguageSwitcher } from '@/components/i18n/LanguageSwitcher';
import { useState, useEffect, useRef } from 'react';
import { Bell, Search, Plus, ChevronDown } from 'lucide-react';
import { useAuthStore } from '@/stores/auth';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export function Header() {
  const t = useT('header');
  const { user } = useAuthStore();
  const router = useRouter();
  const [searchText, setSearchText] = useState('');
  const [showNotifications, setShowNotifications] = useState(false);
  const [showCreateMenu, setShowCreateMenu] = useState(false);
  const createRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  const initials = user?.name
    ? user.name
        .split(' ')
        .map((n) => n[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : 'U';

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (createRef.current && !createRef.current.contains(e.target as Node)) {
        setShowCreateMenu(false);
      }
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setShowNotifications(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <header
      className="h-14 border-b border-border flex items-center justify-between px-6 sticky top-0 z-30"
      style={{ background: 'var(--color-header)', backdropFilter: 'blur(12px)' }}
    >
      {/* Search */}
      <div className="flex items-center flex-1 max-w-md">
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted pointer-events-none" />
          <input
            type="search"
            aria-label={t('searchLabel')}
            placeholder={t('search')}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const q = searchText.trim();
                router.push(q ? `/search?q=${encodeURIComponent(q)}` : '/search');
              }
            }}
            className="w-full pl-9 pr-4 py-1.5 bg-surface border border-border rounded-lg text-sm text-foreground placeholder:text-muted
              transition-colors duration-150 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 ms-4">
        <LanguageSwitcher />
        {/* Create button */}
        <div ref={createRef} className="relative">
          <button
            onClick={() => setShowCreateMenu(!showCreateMenu)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-primary-fg bg-primary rounded-lg
              hover:bg-primary-hover transition-all duration-150 shadow-sm active:scale-[0.98]"
          >
            <Plus className="h-4 w-4" />
            {t('create')}
            <ChevronDown className="h-3.5 w-3.5 opacity-70" />
          </button>
          {showCreateMenu && (
            <div className="absolute right-0 mt-2 w-44 bg-surface rounded-xl shadow-lg border border-border py-1 z-50">
              <Link
                href="/issues/new"
                className="flex items-center px-3 py-2 text-sm text-secondary hover:bg-surface-hover hover:text-foreground transition-colors duration-150"
                onClick={() => setShowCreateMenu(false)}
              >
                {t('newIssue')}
              </Link>
              <Link
                href="/changes/new"
                className="flex items-center px-3 py-2 text-sm text-secondary hover:bg-surface-hover hover:text-foreground transition-colors duration-150"
                onClick={() => setShowCreateMenu(false)}
              >
                {t('newChange')}
              </Link>
              <Link
                href="/requests/new"
                className="flex items-center px-3 py-2 text-sm text-secondary hover:bg-surface-hover hover:text-foreground transition-colors duration-150"
                onClick={() => setShowCreateMenu(false)}
              >
                {t('newRequest')}
              </Link>
            </div>
          )}
        </div>

        {/* Notifications */}
        <div ref={notifRef} className="relative">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative p-2 rounded-lg text-muted hover:text-secondary hover:bg-surface-hover transition-colors duration-150"
          >
            <Bell className="h-5 w-5" />
            <span className="absolute top-1.5 right-1.5 h-2 w-2 bg-error rounded-full ring-2 ring-header" />
          </button>
          {showNotifications && (
            <div className="absolute right-0 mt-2 w-80 bg-surface rounded-xl shadow-lg border border-border z-50 overflow-hidden">
              <div className="px-4 py-3 border-b border-border">
                <h3 className="text-sm font-semibold text-foreground">Notifications</h3>
              </div>
              <div className="max-h-80 overflow-y-auto">
                <div className="px-4 py-6 text-sm text-muted text-center">
                  {t('noNotifications')}
                </div>
              </div>
              <div className="border-t border-border">
                <Link
                  href="/notifications"
                  className="block px-4 py-2.5 text-sm text-center text-primary hover:bg-primary-subtle transition-colors duration-150"
                  onClick={() => setShowNotifications(false)}
                >
                  {t('viewAllNotifications')}
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* User avatar */}
        <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
          <span className="text-xs font-semibold text-white">{initials}</span>
        </div>
      </div>
    </header>
  );
}
