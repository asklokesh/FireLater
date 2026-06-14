'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight, Home } from 'lucide-react';

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbsProps {
  items?: BreadcrumbItem[];
  showHome?: boolean;
  className?: string;
}

const pathLabels: Record<string, string> = {
  dashboard: 'Dashboard',
  issues: 'Issues',
  changes: 'Changes',
  catalog: 'Service Catalog',
  applications: 'Applications',
  cloud: 'Cloud Resources',
  oncall: 'On-Call',
  reports: 'Reports',
  admin: 'Admin',
  users: 'Users',
  groups: 'Groups',
  roles: 'Roles',
  settings: 'Settings',
  new: 'New',
  edit: 'Edit',
  requests: 'Requests',
  schedules: 'Schedules',
  resources: 'Resources',
  accounts: 'Accounts',
};

export function Breadcrumbs({ items, showHome = true, className = '' }: BreadcrumbsProps) {
  const pathname = usePathname();
  const breadcrumbItems = items || generateBreadcrumbs(pathname);

  if (breadcrumbItems.length === 0 && !showHome) {
    return null;
  }

  return (
    <nav className={`flex items-center text-sm ${className}`} aria-label="Breadcrumb">
      <ol className="flex items-center gap-1">
        {showHome && (
          <li className="flex items-center">
            <Link
              href="/dashboard"
              className="text-muted hover:text-secondary transition-colors duration-150 flex items-center"
            >
              <Home className="h-3.5 w-3.5" />
            </Link>
          </li>
        )}
        {breadcrumbItems.map((item, index) => {
          const isLast = index === breadcrumbItems.length - 1;

          return (
            <li key={index} className="flex items-center gap-1">
              <ChevronRight className="h-3.5 w-3.5 text-muted" />
              {isLast || !item.href ? (
                <span className="text-foreground font-medium">{item.label}</span>
              ) : (
                <Link
                  href={item.href}
                  className="text-muted hover:text-secondary transition-colors duration-150"
                >
                  {item.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function generateBreadcrumbs(pathname: string): BreadcrumbItem[] {
  const segments = pathname.split('/').filter(Boolean);
  const items: BreadcrumbItem[] = [];
  let currentPath = '';

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    currentPath += `/${segment}`;

    if (isUuid(segment)) {
      continue;
    }

    const label = pathLabels[segment] || formatSegment(segment);
    const isLast = i === segments.length - 1;

    items.push({
      label,
      href: isLast ? undefined : currentPath,
    });
  }

  return items;
}

function isUuid(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

function formatSegment(segment: string): string {
  return segment
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function useBreadcrumbs() {
  const pathname = usePathname();
  const segments = pathname.split('/').filter(Boolean);

  return {
    pathname,
    segments,
    isDetailPage: segments.length > 1 && isUuid(segments[segments.length - 1]),
    getLabel: (segment: string) => pathLabels[segment] || formatSegment(segment),
  };
}
