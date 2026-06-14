'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  AlertCircle,
  AlertTriangle,
  RefreshCw,
  ShoppingCart,
  Server,
  Users,
  Settings,
  FileText,
  Phone,
  Cloud,
  LogOut,
  Menu,
  X,
  BookOpen,
  Clock,
  Workflow,
  HardDrive,
  Mail,
  Plug,
  ScrollText,
  GitBranch,
  Lock,
  CheckSquare,
  BarChart2,
  UserCheck,
  KeyRound,
  Building2,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth';

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Issues', href: '/issues', icon: AlertCircle },
  { name: 'Problems', href: '/problems', icon: AlertTriangle },
  { name: 'Changes', href: '/changes', icon: RefreshCw },
  { name: 'Service Catalog', href: '/catalog', icon: ShoppingCart },
  { name: 'Applications', href: '/applications', icon: Server },
  { name: 'Assets', href: '/assets', icon: HardDrive },
  { name: 'Knowledge Base', href: '/knowledge-base', icon: BookOpen },
  { name: 'On-Call', href: '/oncall', icon: Phone },
  { name: 'Cloud', href: '/cloud', icon: Cloud },
  { name: 'Reports', href: '/reports', icon: FileText },
];

const adminNavigation = [
  { name: 'Users', href: '/admin/users', icon: Users },
  { name: 'SLA Policies', href: '/admin/sla', icon: Clock },
  { name: 'Workflows', href: '/admin/workflows', icon: Workflow },
  { name: 'Email Integration', href: '/admin/email', icon: Mail },
  { name: 'Integrations', href: '/admin/integrations', icon: Plug },
  { name: 'Audit Logs', href: '/admin/audit-logs', icon: ScrollText },
  { name: 'SoD Policies', href: '/admin/sod-policies', icon: GitBranch },
  { name: 'Data Security', href: '/admin/data-security', icon: Lock },
  { name: 'Maker-Checker', href: '/admin/maker-checker', icon: CheckSquare },
  { name: 'Compliance Reports', href: '/admin/compliance-reports', icon: BarChart2 },
  { name: 'Recertification', href: '/admin/access-recertification', icon: UserCheck },
  { name: 'PAM Grants', href: '/admin/pam', icon: KeyRound },
  { name: 'Vendor Risk', href: '/admin/vendor-risk', icon: Building2 },
  { name: 'Settings', href: '/admin/settings', icon: Settings },
];

interface SidebarProps {
  className?: string;
}

function NavItem({
  item,
  isActive,
  onClick,
}: {
  item: { name: string; href: string; icon: React.ElementType };
  isActive: boolean;
  onClick?: () => void;
}) {
  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={`
        relative flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors duration-150
        ${
          isActive
            ? 'bg-sidebar-active text-sidebar-active-fg font-medium'
            : 'text-secondary hover:bg-sidebar-hover hover:text-foreground'
        }
      `}
    >
      {isActive && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-primary rounded-full" />
      )}
      <item.icon
        className={`h-[18px] w-[18px] flex-shrink-0 ${isActive ? 'text-sidebar-active-fg' : 'text-muted'}`}
      />
      {item.name}
    </Link>
  );
}

export function Sidebar({ className = '' }: SidebarProps) {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const isAdmin = user?.roles?.includes('admin');

  const closeMobileMenu = useCallback(() => {
    setIsMobileMenuOpen(false);
  }, []);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMobileMenu();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [closeMobileMenu]);

  useEffect(() => {
    document.body.style.overflow = isMobileMenuOpen ? 'hidden' : 'unset';
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isMobileMenuOpen]);

  const initials = user?.name
    ? user.name
        .split(' ')
        .map((n) => n[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : 'U';

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className="flex items-center h-16 px-5 border-b border-border">
        <div className="flex items-center gap-2.5">
          <div className="h-7 w-7 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
            <span className="text-xs font-bold text-white">FL</span>
          </div>
          <span className="text-[15px] font-semibold tracking-tight text-foreground">FireLater</span>
        </div>
        <button
          className="ml-auto lg:hidden p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-sidebar-hover transition-colors duration-150"
          onClick={closeMobileMenu}
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {navigation.map((item) => (
          <NavItem
            key={item.name}
            item={item}
            isActive={pathname.startsWith(item.href)}
            onClick={closeMobileMenu}
          />
        ))}

        {isAdmin && (
          <>
            <div className="pt-5 pb-2">
              <p className="px-3 text-xs font-medium uppercase tracking-wider text-muted">
                Administration
              </p>
            </div>
            {adminNavigation.map((item) => (
              <NavItem
                key={item.name}
                item={item}
                isActive={pathname.startsWith(item.href)}
                onClick={closeMobileMenu}
              />
            ))}
          </>
        )}
      </nav>

      {/* User footer */}
      <div className="px-3 py-3 border-t border-border">
        <div className="flex items-center gap-3 px-2 py-2 rounded-lg">
          <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
            <span className="text-xs font-semibold text-white">{initials}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate leading-tight">{user?.name}</p>
            <p className="text-xs text-muted truncate leading-tight">{user?.email}</p>
          </div>
          <button
            onClick={() => logout()}
            className="p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-sidebar-hover transition-colors duration-150 flex-shrink-0"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile menu button */}
      <button
        className="fixed top-4 left-4 z-50 lg:hidden p-2 rounded-lg bg-surface border border-border text-secondary shadow-sm"
        onClick={() => setIsMobileMenuOpen(true)}
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Mobile backdrop */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-foreground/20 backdrop-blur-sm lg:hidden"
          onClick={closeMobileMenu}
        />
      )}

      {/* Mobile sidebar */}
      <div
        className={`
          fixed inset-y-0 left-0 z-50 w-64 bg-sidebar border-r border-border
          transform transition-transform duration-300 ease-in-out lg:hidden
          ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        <div className="flex flex-col h-full">{sidebarContent}</div>
      </div>

      {/* Desktop sidebar */}
      <div
        className={`hidden lg:flex lg:flex-col lg:h-full lg:w-64 bg-sidebar border-r border-border ${className}`}
      >
        {sidebarContent}
      </div>
    </>
  );
}

export function MobileMenuButton() {
  return null;
}
