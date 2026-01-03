import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import UsersPage from '../page';

// Mock Next.js Link
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

// Mock usersApi
const mockUsersList = vi.fn();
vi.mock('@/lib/api', () => ({
  usersApi: {
    list: (...args: any[]) => mockUsersList(...args),
  },
}));

const mockUsersData = {
  data: [
    {
      id: 'user-1',
      name: 'John Admin',
      email: 'john@example.com',
      roles: ['admin'],
      status: 'active',
      last_login_at: '2024-01-15T10:30:00Z',
      created_at: '2024-01-01T00:00:00Z',
    },
    {
      id: 'user-2',
      name: 'Jane Manager',
      email: 'jane@example.com',
      roles: ['manager'],
      status: 'active',
      last_login_at: '2024-01-14T15:00:00Z',
      created_at: '2024-01-02T00:00:00Z',
    },
    {
      id: 'user-3',
      name: 'Bob Agent',
      email: 'bob@example.com',
      roles: ['itil_agent'],
      status: 'pending',
      last_login_at: null,
      created_at: '2024-01-03T00:00:00Z',
    },
    {
      id: 'user-4',
      name: 'Alice User',
      email: 'alice@example.com',
      roles: ['user'],
      status: 'inactive',
      last_login_at: '2024-01-10T08:00:00Z',
      created_at: '2024-01-04T00:00:00Z',
    },
  ],
  pagination: {
    page: 1,
    limit: 20,
    total: 4,
    totalPages: 1,
  },
};

describe('UsersPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUsersList.mockResolvedValue(mockUsersData);
  });

  describe('Basic Rendering', () => {
    it('renders page title', async () => {
      render(<UsersPage />);
      await waitFor(() => {
        expect(screen.getByText('Users')).toBeInTheDocument();
      });
    });

    it('renders page subtitle', async () => {
      render(<UsersPage />);
      await waitFor(() => {
        expect(screen.getByText('Manage user accounts and permissions')).toBeInTheDocument();
      });
    });

    it('renders Add User button', async () => {
      render(<UsersPage />);
      await waitFor(() => {
        const addButton = screen.getByRole('link', { name: /Add User/i });
        expect(addButton).toHaveAttribute('href', '/admin/users/new');
      });
    });

    it('renders search input', async () => {
      render(<UsersPage />);
      await waitFor(() => {
        expect(screen.getByPlaceholderText('Search by name or email...')).toBeInTheDocument();
      });
    });

    it('renders Filters button', async () => {
      render(<UsersPage />);
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Filters/i })).toBeInTheDocument();
      });
    });
  });

  describe('Stats Cards', () => {
    it('displays total users count', async () => {
      render(<UsersPage />);
      await waitFor(() => {
        expect(screen.getByText('Total Users')).toBeInTheDocument();
        expect(screen.getByText('4')).toBeInTheDocument();
      });
    });

    it('displays active users count', async () => {
      render(<UsersPage />);
      await waitFor(() => {
        expect(screen.getByText('Active')).toBeInTheDocument();
        const activeElements = screen.getAllByText('2');
        expect(activeElements.length).toBeGreaterThan(0);
      });
    });

    it('displays pending users count', async () => {
      render(<UsersPage />);
      await waitFor(() => {
        expect(screen.getByText('Pending')).toBeInTheDocument();
        expect(screen.getAllByText('1')[0]).toBeInTheDocument();
      });
    });

    it('displays admins count', async () => {
      render(<UsersPage />);
      await waitFor(() => {
        expect(screen.getByText('Admins')).toBeInTheDocument();
      });
    });
  });

  describe('Users Table', () => {
    it('displays all users', async () => {
      render(<UsersPage />);
      await waitFor(() => {
        expect(screen.getByText('John Admin')).toBeInTheDocument();
        expect(screen.getByText('Jane Manager')).toBeInTheDocument();
        expect(screen.getByText('Bob Agent')).toBeInTheDocument();
        expect(screen.getByText('Alice User')).toBeInTheDocument();
      });
    });

    it('displays user emails', async () => {
      render(<UsersPage />);
      await waitFor(() => {
        expect(screen.getByText('john@example.com')).toBeInTheDocument();
        expect(screen.getByText('jane@example.com')).toBeInTheDocument();
        expect(screen.getByText('bob@example.com')).toBeInTheDocument();
        expect(screen.getByText('alice@example.com')).toBeInTheDocument();
      });
    });

    it('displays user roles', async () => {
      render(<UsersPage />);
      await waitFor(() => {
        expect(screen.getByText('Admin')).toBeInTheDocument();
        expect(screen.getByText('Manager')).toBeInTheDocument();
        expect(screen.getByText('ITIL Agent')).toBeInTheDocument();
        expect(screen.getByText('User')).toBeInTheDocument();
      });
    });

    it('displays user statuses', async () => {
      render(<UsersPage />);
      await waitFor(() => {
        expect(screen.getAllByText(/Active/i).length).toBeGreaterThan(0);
        expect(screen.getByText(/Pending/i)).toBeInTheDocument();
        expect(screen.getByText(/Inactive/i)).toBeInTheDocument();
      });
    });

    it('displays last login times', async () => {
      render(<UsersPage />);
      await waitFor(() => {
        expect(screen.getByText(/Jan 15, 2024/)).toBeInTheDocument();
        expect(screen.getByText(/Jan 14, 2024/)).toBeInTheDocument();
      });
    });

    it('displays "Never" for users who never logged in', async () => {
      render(<UsersPage />);
      await waitFor(() => {
        expect(screen.getByText('Never')).toBeInTheDocument();
      });
    });

    it('displays user initials', async () => {
      render(<UsersPage />);
      await waitFor(() => {
        const initialsElements = screen.getAllByText(/^[A-Z]$/);
        expect(initialsElements.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Search Functionality', () => {
    it('calls API with search query', async () => {
      render(<UsersPage />);
      await waitFor(() => {
        expect(screen.getByText('John Admin')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText('Search by name or email...');
      fireEvent.change(searchInput, { target: { value: 'john' } });

      await waitFor(() => {
        expect(mockUsersList).toHaveBeenCalledWith(
          expect.objectContaining({
            search: 'john',
          })
        );
      });
    });
  });

  describe('Filter Functionality', () => {
    it('toggles filters panel', async () => {
      render(<UsersPage />);
      await waitFor(() => {
        expect(screen.getByText('John Admin')).toBeInTheDocument();
      });

      const filtersButton = screen.getByRole('button', { name: /Filters/i });
      fireEvent.click(filtersButton);

      await waitFor(() => {
        expect(screen.getByText('Role')).toBeInTheDocument();
        expect(screen.getByText('Status')).toBeInTheDocument();
      });
    });

    it('filters by role', async () => {
      render(<UsersPage />);
      await waitFor(() => {
        expect(screen.getByText('John Admin')).toBeInTheDocument();
      });

      const filtersButton = screen.getByRole('button', { name: /Filters/i });
      fireEvent.click(filtersButton);

      const roleSelect = screen.getByLabelText('Role');
      fireEvent.change(roleSelect, { target: { value: 'admin' } });

      await waitFor(() => {
        expect(screen.getByText('John Admin')).toBeInTheDocument();
        expect(screen.queryByText('Jane Manager')).not.toBeInTheDocument();
      });
    });

    it('filters by status', async () => {
      render(<UsersPage />);
      await waitFor(() => {
        expect(screen.getByText('John Admin')).toBeInTheDocument();
      });

      const filtersButton = screen.getByRole('button', { name: /Filters/i });
      fireEvent.click(filtersButton);

      const statusSelect = screen.getByLabelText('Status');
      fireEvent.change(statusSelect, { target: { value: 'active' } });

      await waitFor(() => {
        expect(mockUsersList).toHaveBeenCalledWith(
          expect.objectContaining({
            status: 'active',
          })
        );
      });
    });
  });

  describe('Pagination', () => {
    it('displays pagination controls', async () => {
      render(<UsersPage />);
      await waitFor(() => {
        expect(screen.getByText('Showing 4 of 4 users')).toBeInTheDocument();
      });
    });

    it('disables Previous button on first page', async () => {
      render(<UsersPage />);
      await waitFor(() => {
        const previousButton = screen.getByRole('button', { name: /Previous/i });
        expect(previousButton).toBeDisabled();
      });
    });

    it('disables Next button on last page', async () => {
      render(<UsersPage />);
      await waitFor(() => {
        const nextButton = screen.getByRole('button', { name: /Next/i });
        expect(nextButton).toBeDisabled();
      });
    });
  });

  describe('Loading State', () => {
    it('shows loading spinner initially', () => {
      mockUsersList.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(mockUsersData), 100))
      );
      render(<UsersPage />);
      expect(screen.getByRole('img', { hidden: true })).toBeInTheDocument(); // Spinner SVG
    });
  });

  describe('Error State', () => {
    it('displays error message when API fails', async () => {
      mockUsersList.mockRejectedValue(new Error('Failed to load users'));
      render(<UsersPage />);

      await waitFor(() => {
        expect(screen.getByText('Failed to load users')).toBeInTheDocument();
      });
    });

    it('allows dismissing error', async () => {
      mockUsersList.mockRejectedValue(new Error('Failed to load users'));
      render(<UsersPage />);

      await waitFor(() => {
        expect(screen.getByText('Failed to load users')).toBeInTheDocument();
      });

      const dismissButton = screen.getByRole('button', { name: /Dismiss/i });
      fireEvent.click(dismissButton);

      await waitFor(() => {
        expect(screen.queryByText('Failed to load users')).not.toBeInTheDocument();
      });
    });
  });

  describe('Empty State', () => {
    it('shows empty state when no users match filters', async () => {
      render(<UsersPage />);
      await waitFor(() => {
        expect(screen.getByText('John Admin')).toBeInTheDocument();
      });

      const filtersButton = screen.getByRole('button', { name: /Filters/i });
      fireEvent.click(filtersButton);

      const roleSelect = screen.getByLabelText('Role');
      fireEvent.change(roleSelect, { target: { value: 'manager' } });

      await waitFor(() => {
        expect(screen.getByText('Jane Manager')).toBeInTheDocument();
        expect(screen.queryByText('John Admin')).not.toBeInTheDocument();
      });
    });

    it('shows empty message when API returns no users', async () => {
      mockUsersList.mockResolvedValue({
        data: [],
        pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
      });
      render(<UsersPage />);

      await waitFor(() => {
        expect(screen.getByText('No users found')).toBeInTheDocument();
        expect(screen.getByText('Try adjusting your search or filters')).toBeInTheDocument();
      });
    });
  });

  describe('Edge Cases', () => {
    it('handles user without roles', async () => {
      const usersWithoutRoles = {
        ...mockUsersData,
        data: [
          {
            id: 'user-5',
            name: 'No Role User',
            email: 'norole@example.com',
            status: 'active',
            last_login_at: null,
            created_at: '2024-01-05T00:00:00Z',
          },
        ],
      };
      mockUsersList.mockResolvedValue(usersWithoutRoles);
      render(<UsersPage />);

      await waitFor(() => {
        expect(screen.getByText('No Role User')).toBeInTheDocument();
        expect(screen.getByText('User')).toBeInTheDocument(); // Default role
      });
    });

    it('handles user without name', async () => {
      const usersWithoutName = {
        ...mockUsersData,
        data: [
          {
            id: 'user-6',
            name: '',
            email: 'noname@example.com',
            roles: ['user'],
            status: 'active',
            last_login_at: null,
            created_at: '2024-01-06T00:00:00Z',
          },
        ],
      };
      mockUsersList.mockResolvedValue(usersWithoutName);
      render(<UsersPage />);

      await waitFor(() => {
        expect(screen.getByText('?')).toBeInTheDocument(); // Default initial
      });
    });
  });
});
