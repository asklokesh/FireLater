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
  { name: 'Settings', href: '/admin/settings', icon: Settings },
];

interface SidebarProps {
  className?: string;
}

export function Sidebar({ className = '' }: SidebarProps) {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const isAdmin = user?.roles?.includes('admin');

  const closeMobileMenu = useCallback(() => {
    setIsMobileMenuOpen(false);
  }, []);

  // Close mobile menu on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeMobileMenu();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [closeMobileMenu]);

  // Prevent body scroll when mobile menu is open
  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isMobileMenuOpen]);

  const sidebarContent = (
    <>
      <div className="flex items-center h-16 px-4 bg-gray-800">
        <span className="text-xl font-bold text-white">FireLater</span>
        <button
          className="ml-auto lg:hidden p-2 text-gray-400 hover:text-white"
          onClick={closeMobileMenu}
        >
          <X className="h-6 w-6" />
        </button>
      </div>

      <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
        {navigation.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.name}
              href={item.href}
              onClick={closeMobileMenu}
              className={`
                flex items-center px-3 py-2 text-sm font-medium rounded-md
                ${
                  isActive
                    ? 'bg-gray-800 text-white'
                    : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                }
              `}
            >
              <item.icon className="mr-3 h-5 w-5 flex-shrink-0" />
              {item.name}
            </Link>
          );
        })}

        {isAdmin && (
          <>
            <div className="pt-4 mt-4 border-t border-gray-700">
              <p className="px-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Administration
              </p>
            </div>
            {adminNavigation.map((item) => {
              const isActive = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={closeMobileMenu}
                  className={`
                    flex items-center px-3 py-2 text-sm font-medium rounded-md
                    ${
                      isActive
                        ? 'bg-gray-800 text-white'
                        : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                    }
                  `}
                >
                  <item.icon className="mr-3 h-5 w-5 flex-shrink-0" />
                  {item.name}
                </Link>
              );
            })}
          </>
        )}
      </nav>

      <div className="flex items-center px-4 py-3 border-t border-gray-700">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white truncate">{user?.name}</p>
          <p className="text-xs text-gray-400 truncate">{user?.email}</p>
        </div>
        <button
          onClick={() => logout()}
          className="ml-3 p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-md"
          title="Logout"
        >
          <LogOut className="h-5 w-5" />
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile menu button */}
      <button
        className="fixed top-4 left-4 z-50 lg:hidden p-2 rounded-md bg-gray-900 text-white shadow-lg"
        onClick={() => setIsMobileMenuOpen(true)}
      >
        <Menu className="h-6 w-6" />
      </button>

      {/* Mobile backdrop */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black bg-opacity-50 lg:hidden"
          onClick={closeMobileMenu}
        />
      )}

      {/* Mobile sidebar */}
      <div
        className={`
          fixed inset-y-0 left-0 z-50 w-64 bg-gray-900 transform transition-transform duration-300 ease-in-out lg:hidden
          ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        <div className="flex flex-col h-full">
          {sidebarContent}
        </div>
      </div>

      {/* Desktop sidebar */}
      <div className={`hidden lg:flex lg:flex-col lg:h-full lg:bg-gray-900 lg:w-64 ${className}`}>
        {sidebarContent}
      </div>
    </>
  );
}

export function MobileMenuButton() {
  return null; // Handled internally by Sidebar component
}
