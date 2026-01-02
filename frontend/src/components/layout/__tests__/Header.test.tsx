import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@/test/utils';
import { userEvent } from '@testing-library/user-event';
import { Header } from '../Header';
import { useAuthStore } from '@/stores/auth';

// Mock the auth store
vi.mock('@/stores/auth', () => ({
  useAuthStore: vi.fn(),
}));

// Mock Next.js Link component
vi.mock('next/link', () => ({
  default: ({ children, href, onClick, className }: any) => (
    <a href={href} onClick={onClick} className={className}>
      {children}
    </a>
  ),
}));

describe('Header Component', () => {
  beforeEach(() => {
    // Default mock implementation
    (useAuthStore as any).mockReturnValue({
      user: {
        id: '1',
        name: 'John Doe',
        email: 'john@example.com',
        tenantSlug: 'test-tenant',
        roles: ['user'],
      },
    });
  });

  describe('Basic Rendering', () => {
    it('renders header element', () => {
      render(<Header />);
      const header = document.querySelector('header');
      expect(header).toBeInTheDocument();
    });

    it('renders search input', () => {
      render(<Header />);
      const searchInput = screen.getByPlaceholderText(/search issues, changes, applications/i);
      expect(searchInput).toBeInTheDocument();
    });

    it('search input has correct type', () => {
      render(<Header />);
      const searchInput = screen.getByPlaceholderText(/search issues, changes, applications/i);
      expect(searchInput).toHaveAttribute('type', 'text');
    });

    it('renders Create button', () => {
      render(<Header />);
      expect(screen.getByText('Create')).toBeInTheDocument();
    });

    it('renders notifications bell button', () => {
      render(<Header />);
      const bellButton = document.querySelector('button[class*="rounded-full"]');
      expect(bellButton).toBeInTheDocument();
    });

    it('renders user avatar', () => {
      render(<Header />);
      const avatar = document.querySelector('.rounded-full.bg-blue-600');
      expect(avatar).toBeInTheDocument();
    });
  });

  describe('Search Functionality', () => {
    it('search input is focusable', () => {
      render(<Header />);
      const searchInput = screen.getByPlaceholderText(/search issues, changes, applications/i);
      searchInput.focus();
      expect(searchInput).toHaveFocus();
    });

    it('has search icon', () => {
      render(<Header />);
      const searchIcon = document.querySelector('svg.text-gray-400');
      expect(searchIcon).toBeInTheDocument();
    });

    it('search input accepts text input', async () => {
      const user = userEvent.setup();
      render(<Header />);
      const searchInput = screen.getByPlaceholderText(/search issues, changes, applications/i);

      await user.type(searchInput, 'test query');
      expect(searchInput).toHaveValue('test query');
    });
  });

  describe('Create Menu', () => {
    it('does not show create menu initially', () => {
      render(<Header />);
      expect(screen.queryByText('New Issue')).not.toBeInTheDocument();
    });

    it('shows create menu when Create button clicked', async () => {
      const user = userEvent.setup();
      render(<Header />);

      await user.click(screen.getByText('Create'));

      await waitFor(() => {
        expect(screen.getByText('New Issue')).toBeInTheDocument();
      });
    });

    it('hides create menu when Create button clicked again', async () => {
      const user = userEvent.setup();
      render(<Header />);

      // Open menu
      await user.click(screen.getByText('Create'));
      await waitFor(() => {
        expect(screen.getByText('New Issue')).toBeInTheDocument();
      });

      // Close menu
      await user.click(screen.getByText('Create'));
      await waitFor(() => {
        expect(screen.queryByText('New Issue')).not.toBeInTheDocument();
      });
    });

    it('create menu has New Issue link', async () => {
      const user = userEvent.setup();
      render(<Header />);

      await user.click(screen.getByText('Create'));

      await waitFor(() => {
        const link = screen.getByText('New Issue');
        expect(link).toBeInTheDocument();
        expect(link.closest('a')).toHaveAttribute('href', '/issues/new');
      });
    });

    it('create menu has New Change link', async () => {
      const user = userEvent.setup();
      render(<Header />);

      await user.click(screen.getByText('Create'));

      await waitFor(() => {
        const link = screen.getByText('New Change');
        expect(link).toBeInTheDocument();
        expect(link.closest('a')).toHaveAttribute('href', '/changes/new');
      });
    });

    it('create menu has New Request link', async () => {
      const user = userEvent.setup();
      render(<Header />);

      await user.click(screen.getByText('Create'));

      await waitFor(() => {
        const link = screen.getByText('New Request');
        expect(link).toBeInTheDocument();
        expect(link.closest('a')).toHaveAttribute('href', '/requests/new');
      });
    });

    it('closes create menu when menu item clicked', async () => {
      const user = userEvent.setup();
      render(<Header />);

      await user.click(screen.getByText('Create'));
      await waitFor(() => {
        expect(screen.getByText('New Issue')).toBeInTheDocument();
      });

      await user.click(screen.getByText('New Issue'));

      await waitFor(() => {
        expect(screen.queryByText('New Issue')).not.toBeInTheDocument();
      });
    });
  });

  describe('Notifications', () => {
    it('does not show notifications panel initially', () => {
      render(<Header />);
      expect(screen.queryByText('Notifications')).not.toBeInTheDocument();
    });

    it('shows notification indicator dot', () => {
      render(<Header />);
      const indicator = document.querySelector('.bg-red-500.rounded-full');
      expect(indicator).toBeInTheDocument();
    });

    it('shows notifications panel when bell clicked', async () => {
      const user = userEvent.setup();
      render(<Header />);

      const bellButton = document.querySelector('button[class*="rounded-full"]');
      await user.click(bellButton!);

      await waitFor(() => {
        expect(screen.getByText('Notifications')).toBeInTheDocument();
      });
    });

    it('hides notifications panel when bell clicked again', async () => {
      const user = userEvent.setup();
      render(<Header />);

      const bellButton = document.querySelector('button[class*="rounded-full"]');

      // Open panel
      await user.click(bellButton!);
      await waitFor(() => {
        expect(screen.getByText('Notifications')).toBeInTheDocument();
      });

      // Close panel
      await user.click(bellButton!);
      await waitFor(() => {
        expect(screen.queryByText('Notifications')).not.toBeInTheDocument();
      });
    });

    it('shows "No new notifications" when empty', async () => {
      const user = userEvent.setup();
      render(<Header />);

      const bellButton = document.querySelector('button[class*="rounded-full"]');
      await user.click(bellButton!);

      await waitFor(() => {
        expect(screen.getByText('No new notifications')).toBeInTheDocument();
      });
    });

    it('has "View all notifications" link', async () => {
      const user = userEvent.setup();
      render(<Header />);

      const bellButton = document.querySelector('button[class*="rounded-full"]');
      await user.click(bellButton!);

      await waitFor(() => {
        const link = screen.getByText('View all notifications');
        expect(link).toBeInTheDocument();
        expect(link.closest('a')).toHaveAttribute('href', '/notifications');
      });
    });

    it('closes notifications panel when "View all" clicked', async () => {
      const user = userEvent.setup();
      render(<Header />);

      const bellButton = document.querySelector('button[class*="rounded-full"]');
      await user.click(bellButton!);

      await waitFor(() => {
        expect(screen.getByText('Notifications')).toBeInTheDocument();
      });

      await user.click(screen.getByText('View all notifications'));

      await waitFor(() => {
        expect(screen.queryByText('Notifications')).not.toBeInTheDocument();
      });
    });
  });

  describe('User Avatar', () => {
    it('displays user initial', () => {
      (useAuthStore as any).mockReturnValue({
        user: { name: 'Alice Smith', email: 'alice@example.com', tenantSlug: 'test', roles: [] },
      });

      render(<Header />);
      const avatar = document.querySelector('.rounded-full.bg-blue-600');
      expect(avatar).toHaveTextContent('A');
    });

    it('displays first letter of name in uppercase', () => {
      (useAuthStore as any).mockReturnValue({
        user: { name: 'bob jones', email: 'bob@example.com', tenantSlug: 'test', roles: [] },
      });

      render(<Header />);
      const avatar = document.querySelector('.rounded-full.bg-blue-600');
      expect(avatar).toHaveTextContent('B');
    });

    it('displays "U" when user has no name', () => {
      (useAuthStore as any).mockReturnValue({
        user: { name: '', email: 'user@example.com', tenantSlug: 'test', roles: [] },
      });

      render(<Header />);
      const avatar = document.querySelector('.rounded-full.bg-blue-600');
      expect(avatar).toHaveTextContent('U');
    });

    it('displays "U" when user is null', () => {
      (useAuthStore as any).mockReturnValue({
        user: null,
      });

      render(<Header />);
      const avatar = document.querySelector('.rounded-full.bg-blue-600');
      expect(avatar).toHaveTextContent('U');
    });
  });

  describe('Styling', () => {
    it('has correct header height', () => {
      render(<Header />);
      const header = document.querySelector('header');
      expect(header).toHaveClass('h-16');
    });

    it('has white background', () => {
      render(<Header />);
      const header = document.querySelector('header');
      expect(header).toHaveClass('bg-white');
    });

    it('has border bottom', () => {
      render(<Header />);
      const header = document.querySelector('header');
      expect(header).toHaveClass('border-b');
    });

    it('Create button has blue background', () => {
      render(<Header />);
      const createButton = screen.getByText('Create').closest('button');
      expect(createButton).toHaveClass('bg-blue-600');
    });

    it('Create button has hover effect', () => {
      render(<Header />);
      const createButton = screen.getByText('Create').closest('button');
      expect(createButton).toHaveClass('hover:bg-blue-700');
    });
  });

  describe('Accessibility', () => {
    it('search input has correct focus styles', () => {
      render(<Header />);
      const searchInput = screen.getByPlaceholderText(/search issues, changes, applications/i);
      expect(searchInput).toHaveClass('focus:ring-2');
      expect(searchInput).toHaveClass('focus:ring-blue-500');
    });

    it('notification button has hover effect', () => {
      render(<Header />);
      const bellButton = document.querySelector('button[class*="rounded-full"]');
      expect(bellButton).toHaveClass('hover:bg-gray-100');
    });

    it('all interactive elements are keyboard accessible', () => {
      render(<Header />);

      const searchInput = screen.getByPlaceholderText(/search issues, changes, applications/i);
      const createButton = screen.getByText('Create').closest('button');
      const bellButton = document.querySelector('button[class*="rounded-full"]');

      expect(searchInput?.tagName).toBe('INPUT');
      expect(createButton?.tagName).toBe('BUTTON');
      expect(bellButton?.tagName).toBe('BUTTON');
    });
  });
});
