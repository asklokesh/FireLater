import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@/test/utils';
import { userEvent } from '@testing-library/user-event';
import { Sidebar } from '../Sidebar';
import { useAuthStore } from '@/stores/auth';

// Mock the auth store
vi.mock('@/stores/auth', () => ({
  useAuthStore: vi.fn(),
}));

// Mock Next.js navigation hooks
const mockPathname = vi.fn();
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname(),
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}));

// Mock Next.js Link component
vi.mock('next/link', () => ({
  default: ({ children, href, onClick, className }: any) => (
    <a href={href} onClick={onClick} className={className}>
      {children}
    </a>
  ),
}));

describe('Sidebar Component', () => {
  const mockLogout = vi.fn();

  beforeEach(() => {
    mockPathname.mockReturnValue('/dashboard');

    (useAuthStore as any).mockReturnValue({
      user: {
        id: '1',
        name: 'John Doe',
        email: 'john@example.com',
        tenantSlug: 'test-tenant',
        roles: ['user'],
      },
      logout: mockLogout,
    });

    // Mock window properties
    Object.defineProperty(document.body.style, 'overflow', {
      writable: true,
      value: 'unset',
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Basic Rendering', () => {
    it('renders FireLater logo', () => {
      render(<Sidebar />);
      const logos = screen.getAllByText('FireLater');
      expect(logos.length).toBeGreaterThan(0);
      expect(logos[0]).toBeInTheDocument();
    });

    it('renders all main navigation items', () => {
      render(<Sidebar />);

      expect(screen.getAllByText('Dashboard')[0]).toBeInTheDocument();
      expect(screen.getAllByText('Issues')[0]).toBeInTheDocument();
      expect(screen.getAllByText('Problems')[0]).toBeInTheDocument();
      expect(screen.getAllByText('Changes')[0]).toBeInTheDocument();
      expect(screen.getAllByText('Service Catalog')[0]).toBeInTheDocument();
      expect(screen.getAllByText('Applications')[0]).toBeInTheDocument();
      expect(screen.getAllByText('Assets')[0]).toBeInTheDocument();
      expect(screen.getAllByText('Knowledge Base')[0]).toBeInTheDocument();
      expect(screen.getAllByText('On-Call')[0]).toBeInTheDocument();
      expect(screen.getAllByText('Cloud')[0]).toBeInTheDocument();
      expect(screen.getAllByText('Reports')[0]).toBeInTheDocument();
    });

    it('renders user information', () => {
      render(<Sidebar />);
      expect(screen.getAllByText('John Doe')[0]).toBeInTheDocument();
      expect(screen.getAllByText('john@example.com')[0]).toBeInTheDocument();
    });

    it('renders logout button', () => {
      render(<Sidebar />);
      const logoutButton = document.querySelector('button[title="Logout"]');
      expect(logoutButton).toBeInTheDocument();
    });

    it('does not render admin navigation for regular users', () => {
      render(<Sidebar />);
      expect(screen.queryByText('Administration')).not.toBeInTheDocument();
      expect(screen.queryByText('Users')).not.toBeInTheDocument();
    });
  });

  describe('Admin Navigation', () => {
    beforeEach(() => {
      (useAuthStore as any).mockReturnValue({
        user: {
          id: '1',
          name: 'Admin User',
          email: 'admin@example.com',
          tenantSlug: 'test-tenant',
          roles: ['admin'],
        },
        logout: mockLogout,
      });
    });

    it('renders admin section for admin users', () => {
      render(<Sidebar />);
      expect(screen.getAllByText('Administration')[0]).toBeInTheDocument();
    });

    it('renders all admin navigation items', () => {
      render(<Sidebar />);

      expect(screen.getAllByText('Users')[0]).toBeInTheDocument();
      expect(screen.getAllByText('SLA Policies')[0]).toBeInTheDocument();
      expect(screen.getAllByText('Workflows')[0]).toBeInTheDocument();
      expect(screen.getAllByText('Email Integration')[0]).toBeInTheDocument();
      expect(screen.getAllByText('Integrations')[0]).toBeInTheDocument();
      expect(screen.getAllByText('Settings')[0]).toBeInTheDocument();
    });

    it('admin section has divider', () => {
      render(<Sidebar />);
      const divider = document.querySelector('.border-t.border-gray-700');
      expect(divider).toBeInTheDocument();
    });

    it('admin section has uppercase label', () => {
      render(<Sidebar />);
      const labels = screen.getAllByText('Administration');
      expect(labels[0]).toHaveClass('uppercase');
      expect(labels[0]).toHaveClass('text-xs');
    });
  });

  describe('Active Navigation State', () => {
    it('highlights active navigation item', () => {
      mockPathname.mockReturnValue('/dashboard');
      render(<Sidebar />);

      const dashboardLink = screen.getAllByText('Dashboard')[0].closest('a');
      expect(dashboardLink).toHaveClass('bg-gray-800');
      expect(dashboardLink).toHaveClass('text-white');
    });

    it('does not highlight inactive items', () => {
      mockPathname.mockReturnValue('/dashboard');
      render(<Sidebar />);

      const issuesLink = screen.getAllByText('Issues')[0].closest('a');
      expect(issuesLink).toHaveClass('text-gray-300');
      expect(issuesLink).not.toHaveClass('bg-gray-800');
    });

    it('highlights item when on sub-path', () => {
      mockPathname.mockReturnValue('/issues/123');
      render(<Sidebar />);

      const issuesLink = screen.getAllByText('Issues')[0].closest('a');
      expect(issuesLink).toHaveClass('bg-gray-800');
      expect(issuesLink).toHaveClass('text-white');
    });

    it('highlights admin item when active', () => {
      mockPathname.mockReturnValue('/admin/users');
      (useAuthStore as any).mockReturnValue({
        user: {
          id: '1',
          name: 'Admin User',
          email: 'admin@example.com',
          tenantSlug: 'test-tenant',
          roles: ['admin'],
        },
        logout: mockLogout,
      });

      render(<Sidebar />);

      const usersLink = screen.getAllByText('Users')[0].closest('a');
      expect(usersLink).toHaveClass('bg-gray-800');
      expect(usersLink).toHaveClass('text-white');
    });
  });

  describe('Navigation Links', () => {
    it('Dashboard link has correct href', () => {
      render(<Sidebar />);
      const link = screen.getAllByText('Dashboard')[0].closest('a');
      expect(link).toHaveAttribute('href', '/dashboard');
    });

    it('Issues link has correct href', () => {
      render(<Sidebar />);
      const link = screen.getAllByText('Issues')[0].closest('a');
      expect(link).toHaveAttribute('href', '/issues');
    });

    it('Admin Users link has correct href', () => {
      (useAuthStore as any).mockReturnValue({
        user: {
          id: '1',
          name: 'Admin User',
          email: 'admin@example.com',
          tenantSlug: 'test-tenant',
          roles: ['admin'],
        },
        logout: mockLogout,
      });

      render(<Sidebar />);
      const link = screen.getAllByText('Users')[0].closest('a');
      expect(link).toHaveAttribute('href', '/admin/users');
    });

    it('all navigation items have hover effects', () => {
      render(<Sidebar />);
      const issuesLink = screen.getAllByText('Issues')[0].closest('a');
      expect(issuesLink).toHaveClass('hover:bg-gray-700');
      expect(issuesLink).toHaveClass('hover:text-white');
    });
  });

  describe('Logout Functionality', () => {
    it('calls logout when logout button clicked', async () => {
      const user = userEvent.setup();
      render(<Sidebar />);

      const logoutButton = document.querySelector('button[title="Logout"]');
      await user.click(logoutButton!);

      expect(mockLogout).toHaveBeenCalledTimes(1);
    });

    it('logout button has hover effect', () => {
      render(<Sidebar />);
      const logoutButton = document.querySelector('button[title="Logout"]');
      expect(logoutButton).toHaveClass('hover:bg-gray-700');
      expect(logoutButton).toHaveClass('hover:text-white');
    });

    it('logout button has accessible title', () => {
      render(<Sidebar />);
      const logoutButton = document.querySelector('button[title="Logout"]');
      expect(logoutButton).toHaveAttribute('title', 'Logout');
    });
  });

  describe('Mobile Menu', () => {
    it('renders mobile menu button', () => {
      render(<Sidebar />);
      const menuButton = document.querySelector('button.fixed.lg\\:hidden');
      expect(menuButton).toBeInTheDocument();
    });

    it('mobile menu is closed by default', () => {
      const { container } = render(<Sidebar />);
      const mobileSidebar = container.querySelector('.lg\\:hidden.fixed.inset-y-0');
      expect(mobileSidebar).toHaveClass('-translate-x-full');
    });

    it('opens mobile menu when button clicked', async () => {
      const user = userEvent.setup();
      const { container } = render(<Sidebar />);

      const menuButton = document.querySelector('button.fixed.lg\\:hidden');
      await user.click(menuButton!);

      await waitFor(() => {
        const mobileSidebar = container.querySelector('.lg\\:hidden.fixed.inset-y-0');
        expect(mobileSidebar).toHaveClass('translate-x-0');
      });
    });

    it('shows backdrop when mobile menu opens', async () => {
      const user = userEvent.setup();
      const { container } = render(<Sidebar />);

      const menuButton = document.querySelector('button.fixed.lg\\:hidden');
      await user.click(menuButton!);

      await waitFor(() => {
        const backdrop = container.querySelector('.bg-black.bg-opacity-50');
        expect(backdrop).toBeInTheDocument();
      });
    });

    it('closes mobile menu when close button clicked', async () => {
      const user = userEvent.setup();
      const { container } = render(<Sidebar />);

      // Open menu
      const menuButton = document.querySelector('button.fixed.lg\\:hidden');
      await user.click(menuButton!);

      await waitFor(() => {
        const mobileSidebar = container.querySelector('.lg\\:hidden.fixed.inset-y-0');
        expect(mobileSidebar).toHaveClass('translate-x-0');
      });

      // Close menu - find close button by class
      const closeButton = container.querySelector('button.ml-auto.lg\\:hidden');
      if (closeButton) {
        await user.click(closeButton);

        await waitFor(() => {
          const mobileSidebar = container.querySelector('.lg\\:hidden.fixed.inset-y-0');
          expect(mobileSidebar).toHaveClass('-translate-x-full');
        });
      }
    });

    it('closes mobile menu when backdrop clicked', async () => {
      const user = userEvent.setup();
      const { container } = render(<Sidebar />);

      // Open menu
      const menuButton = document.querySelector('button.fixed.lg\\:hidden');
      await user.click(menuButton!);

      await waitFor(() => {
        const mobileSidebar = container.querySelector('.lg\\:hidden.fixed.inset-y-0');
        expect(mobileSidebar).toHaveClass('translate-x-0');
      });

      // Click backdrop
      const backdrop = container.querySelector('.bg-black.bg-opacity-50');
      await user.click(backdrop!);

      await waitFor(() => {
        const mobileSidebar = container.querySelector('.lg\\:hidden.fixed.inset-y-0');
        expect(mobileSidebar).toHaveClass('-translate-x-full');
      });
    });

    it('closes mobile menu when navigation item clicked', async () => {
      const user = userEvent.setup();
      const { container } = render(<Sidebar />);

      // Open menu
      const menuButton = document.querySelector('button.fixed.lg\\:hidden');
      await user.click(menuButton!);

      await waitFor(() => {
        const mobileSidebar = container.querySelector('.lg\\:hidden.fixed.inset-y-0');
        expect(mobileSidebar).toHaveClass('translate-x-0');
      });

      // Click navigation item
      const dashboardLink = screen.getAllByText('Dashboard')[0];
      await user.click(dashboardLink);

      await waitFor(() => {
        const mobileSidebar = container.querySelector('.lg\\:hidden.fixed.inset-y-0');
        expect(mobileSidebar).toHaveClass('-translate-x-full');
      });
    });
  });

  describe('Keyboard Navigation', () => {
    it('closes mobile menu on Escape key', async () => {
      const user = userEvent.setup();
      const { container } = render(<Sidebar />);

      // Open menu
      const menuButton = document.querySelector('button.fixed.lg\\:hidden');
      await user.click(menuButton!);

      await waitFor(() => {
        const mobileSidebar = container.querySelector('.lg\\:hidden.fixed.inset-y-0');
        expect(mobileSidebar).toHaveClass('translate-x-0');
      });

      // Press Escape
      await user.keyboard('{Escape}');

      await waitFor(() => {
        const mobileSidebar = container.querySelector('.lg\\:hidden.fixed.inset-y-0');
        expect(mobileSidebar).toHaveClass('-translate-x-full');
      });
    });

    it('navigation links are keyboard accessible', () => {
      render(<Sidebar />);
      const dashboardLink = screen.getAllByText('Dashboard')[0].closest('a');
      expect(dashboardLink?.tagName).toBe('A');
    });
  });

  describe('Body Scroll Management', () => {
    it('prevents body scroll when mobile menu opens', async () => {
      const user = userEvent.setup();
      render(<Sidebar />);

      const menuButton = document.querySelector('button.fixed.lg\\:hidden');
      await user.click(menuButton!);

      await waitFor(() => {
        expect(document.body.style.overflow).toBe('hidden');
      });
    });

    it('restores body scroll when mobile menu closes', async () => {
      const user = userEvent.setup();
      const { container } = render(<Sidebar />);

      // Open menu
      const menuButton = document.querySelector('button.fixed.lg\\:hidden');
      await user.click(menuButton!);

      await waitFor(() => {
        expect(document.body.style.overflow).toBe('hidden');
      });

      // Close menu via backdrop
      const backdrop = container.querySelector('.bg-black.bg-opacity-50');
      await user.click(backdrop!);

      await waitFor(() => {
        expect(document.body.style.overflow).toBe('unset');
      });
    });
  });

  describe('Styling', () => {
    it('has dark background', () => {
      const { container } = render(<Sidebar />);
      const sidebar = container.querySelector('.bg-gray-900');
      expect(sidebar).toBeInTheDocument();
    });

    it('has correct width', () => {
      const { container } = render(<Sidebar />);
      const desktopSidebar = container.querySelector('.lg\\:w-64');
      expect(desktopSidebar).toBeInTheDocument();
    });

    it('logo has correct styling', () => {
      render(<Sidebar />);
      const logo = screen.getAllByText('FireLater')[0];
      expect(logo).toHaveClass('text-xl');
      expect(logo).toHaveClass('font-bold');
      expect(logo).toHaveClass('text-white');
    });

    it('navigation items have rounded corners', () => {
      render(<Sidebar />);
      const dashboardLink = screen.getAllByText('Dashboard')[0].closest('a');
      expect(dashboardLink).toHaveClass('rounded-md');
    });

    it('user info section has border top', () => {
      const { container } = render(<Sidebar />);
      const userSection = container.querySelector('.border-t.border-gray-700');
      expect(userSection).toBeInTheDocument();
    });
  });

  describe('User Display', () => {
    it('truncates long user names', () => {
      (useAuthStore as any).mockReturnValue({
        user: {
          id: '1',
          name: 'Very Long User Name That Should Be Truncated',
          email: 'verylongemail@example.com',
          tenantSlug: 'test-tenant',
          roles: ['user'],
        },
        logout: mockLogout,
      });

      render(<Sidebar />);
      const userName = screen.getAllByText('Very Long User Name That Should Be Truncated')[0];
      expect(userName).toHaveClass('truncate');
    });

    it('truncates long email addresses', () => {
      (useAuthStore as any).mockReturnValue({
        user: {
          id: '1',
          name: 'User',
          email: 'verylongemailaddress@example.com',
          tenantSlug: 'test-tenant',
          roles: ['user'],
        },
        logout: mockLogout,
      });

      render(<Sidebar />);
      const email = screen.getAllByText('verylongemailaddress@example.com')[0];
      expect(email).toHaveClass('truncate');
    });

    it('displays user email in smaller text', () => {
      render(<Sidebar />);
      const email = screen.getAllByText('john@example.com')[0];
      expect(email).toHaveClass('text-xs');
      expect(email).toHaveClass('text-gray-400');
    });
  });

  describe('Accessibility', () => {
    it('mobile menu button is accessible', () => {
      render(<Sidebar />);
      const menuButton = document.querySelector('button.fixed.lg\\:hidden');
      expect(menuButton?.tagName).toBe('BUTTON');
    });

    it('logout button is accessible', () => {
      render(<Sidebar />);
      const logoutButton = document.querySelector('button[title="Logout"]');
      expect(logoutButton?.tagName).toBe('BUTTON');
    });

    it('all navigation links are accessible', () => {
      render(<Sidebar />);
      const links = screen.getAllByRole('link');
      expect(links.length).toBeGreaterThan(0);
      links.forEach(link => {
        expect(link.tagName).toBe('A');
      });
    });
  });
});
