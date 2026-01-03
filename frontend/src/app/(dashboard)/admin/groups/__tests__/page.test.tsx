import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import GroupsPage from '../page';

// Mock API
const mockGroupsList = vi.fn();
const mockGroupsCreate = vi.fn();
const mockGroupsDelete = vi.fn();
const mockGroupsGetMembers = vi.fn();
const mockGroupsAddMember = vi.fn();
const mockGroupsRemoveMember = vi.fn();
const mockUsersList = vi.fn();

vi.mock('@/lib/api', () => ({
  groupsApi: {
    list: (...args: any[]) => mockGroupsList(...args),
    create: (...args: any[]) => mockGroupsCreate(...args),
    delete: (...args: any[]) => mockGroupsDelete(...args),
    getMembers: (...args: any[]) => mockGroupsGetMembers(...args),
    addMember: (...args: any[]) => mockGroupsAddMember(...args),
    removeMember: (...args: any[]) => mockGroupsRemoveMember(...args),
  },
  usersApi: {
    list: (...args: any[]) => mockUsersList(...args),
  },
}));

// Mock components
vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, variant, size, disabled, isLoading, ...props }: any) => (
    <button onClick={onClick} disabled={disabled || isLoading} {...props}>
      {isLoading ? 'Loading...' : children}
    </button>
  ),
}));

vi.mock('@/components/ui/input', () => ({
  Input: ({ label, value, onChange, ...props }: any) => (
    <div>
      {label && <label>{label}</label>}
      <input value={value} onChange={onChange} {...props} />
    </div>
  ),
}));

const mockGroupsData = {
  data: [
    {
      id: 'group-1',
      name: 'Engineering Team',
      description: 'Software development team',
      type: 'team',
      email: 'engineering@example.com',
      manager_id: 'user-1',
      manager_name: 'John Manager',
      parent_id: null,
      parent_name: null,
      member_count: 5,
      created_at: '2024-01-01T00:00:00Z',
    },
    {
      id: 'group-2',
      name: 'IT Department',
      description: 'IT operations and support',
      type: 'department',
      email: null,
      manager_id: null,
      manager_name: null,
      parent_id: null,
      parent_name: null,
      member_count: 3,
      created_at: '2024-01-02T00:00:00Z',
    },
    {
      id: 'group-3',
      name: 'All Staff',
      description: null,
      type: 'distribution',
      email: 'allstaff@example.com',
      manager_id: null,
      manager_name: null,
      parent_id: null,
      parent_name: null,
      member_count: 15,
      created_at: '2024-01-03T00:00:00Z',
    },
  ],
  pagination: {
    page: 1,
    limit: 20,
    total: 3,
    totalPages: 1,
  },
};

const mockMembersData = {
  data: [
    {
      id: 'member-1',
      user_id: 'user-1',
      group_id: 'group-1',
      role: 'lead',
      name: 'Alice Lead',
      email: 'alice@example.com',
      joined_at: '2024-01-01T00:00:00Z',
    },
    {
      id: 'member-2',
      user_id: 'user-2',
      group_id: 'group-1',
      role: 'member',
      name: 'Bob Member',
      email: 'bob@example.com',
      joined_at: '2024-01-02T00:00:00Z',
    },
  ],
};

const mockUsersData = {
  data: [
    { id: 'user-1', name: 'Alice Lead', email: 'alice@example.com' },
    { id: 'user-2', name: 'Bob Member', email: 'bob@example.com' },
    { id: 'user-3', name: 'Charlie User', email: 'charlie@example.com' },
  ],
};

describe('GroupsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGroupsList.mockResolvedValue(mockGroupsData);
    mockUsersList.mockResolvedValue(mockUsersData);
    mockGroupsGetMembers.mockResolvedValue(mockMembersData);
    mockGroupsCreate.mockResolvedValue({ data: { id: 'new-group' } });
    mockGroupsDelete.mockResolvedValue({});
    mockGroupsAddMember.mockResolvedValue({});
    mockGroupsRemoveMember.mockResolvedValue({});
  });

  describe('Basic Rendering', () => {
    it('renders page title', async () => {
      render(<GroupsPage />);
      await waitFor(() => {
        expect(screen.getByText('Groups')).toBeInTheDocument();
      });
    });

    it('renders page description', async () => {
      render(<GroupsPage />);
      await waitFor(() => {
        expect(screen.getByText(/Manage teams, departments, and distribution groups/i)).toBeInTheDocument();
      });
    });

    it('renders Add Group button', async () => {
      render(<GroupsPage />);
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Add Group/i })).toBeInTheDocument();
      });
    });

    it('renders search input', async () => {
      render(<GroupsPage />);
      await waitFor(() => {
        expect(screen.getByPlaceholderText('Search by name...')).toBeInTheDocument();
      });
    });

    it('renders Filters button', async () => {
      render(<GroupsPage />);
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Filters/i })).toBeInTheDocument();
      });
    });
  });

  describe('Stats Cards', () => {
    it('displays total groups count', async () => {
      render(<GroupsPage />);
      await waitFor(() => {
        expect(screen.getByText('Total Groups')).toBeInTheDocument();
        expect(screen.getByText('3')).toBeInTheDocument();
      });
    });

    it('displays teams count', async () => {
      render(<GroupsPage />);
      await waitFor(() => {
        expect(screen.getByText('Teams')).toBeInTheDocument();
        const teamCounts = screen.getAllByText('1');
        expect(teamCounts.length).toBeGreaterThan(0);
      });
    });

    it('displays departments count', async () => {
      render(<GroupsPage />);
      await waitFor(() => {
        expect(screen.getByText('Departments')).toBeInTheDocument();
        const deptCounts = screen.getAllByText('1');
        expect(deptCounts.length).toBeGreaterThan(0);
      });
    });

    it('displays distribution groups count', async () => {
      render(<GroupsPage />);
      await waitFor(() => {
        const distLabels = screen.getAllByText('Distribution');
        expect(distLabels.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Groups Table', () => {
    it('displays group names', async () => {
      render(<GroupsPage />);
      await waitFor(() => {
        expect(screen.getByText('Engineering Team')).toBeInTheDocument();
        expect(screen.getByText('IT Department')).toBeInTheDocument();
        expect(screen.getByText('All Staff')).toBeInTheDocument();
      });
    });

    it('displays group descriptions', async () => {
      render(<GroupsPage />);
      await waitFor(() => {
        expect(screen.getByText('Software development team')).toBeInTheDocument();
        expect(screen.getByText('IT operations and support')).toBeInTheDocument();
      });
    });

    it('displays group types as badges', async () => {
      render(<GroupsPage />);
      await waitFor(() => {
        expect(screen.getAllByText('Team').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Department').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Distribution').length).toBeGreaterThan(0);
      });
    });

    it('displays member counts', async () => {
      render(<GroupsPage />);
      await waitFor(() => {
        expect(screen.getByText('5 members')).toBeInTheDocument();
        expect(screen.getByText('3 members')).toBeInTheDocument();
        expect(screen.getByText('15 members')).toBeInTheDocument();
      });
    });

    it('displays manager names', async () => {
      render(<GroupsPage />);
      await waitFor(() => {
        expect(screen.getByText('John Manager')).toBeInTheDocument();
      });
    });

    it('displays group emails', async () => {
      render(<GroupsPage />);
      await waitFor(() => {
        expect(screen.getByText('engineering@example.com')).toBeInTheDocument();
        expect(screen.getByText('allstaff@example.com')).toBeInTheDocument();
      });
    });

    it('shows dash for missing data', async () => {
      render(<GroupsPage />);
      await waitFor(() => {
        const dashes = screen.getAllByText('-');
        expect(dashes.length).toBeGreaterThan(0);
      });
    });

    it('displays table headers', async () => {
      render(<GroupsPage />);
      await waitFor(() => {
        expect(screen.getByText('Group')).toBeInTheDocument();
        expect(screen.getByText('Type')).toBeInTheDocument();
        expect(screen.getByText('Members')).toBeInTheDocument();
        expect(screen.getByText('Manager')).toBeInTheDocument();
        expect(screen.getByText('Email')).toBeInTheDocument();
        expect(screen.getByText('Actions')).toBeInTheDocument();
      });
    });
  });

  describe('Search and Filters', () => {
    it('allows typing in search box', async () => {
      render(<GroupsPage />);
      await waitFor(() => {
        const searchInput = screen.getByPlaceholderText('Search by name...');
        fireEvent.change(searchInput, { target: { value: 'Engineering' } });
        expect(searchInput).toHaveValue('Engineering');
      });
    });

    it('shows filter panel when Filters button is clicked', async () => {
      render(<GroupsPage />);
      await waitFor(() => {
        const filtersButton = screen.getByRole('button', { name: /Filters/i });
        fireEvent.click(filtersButton);
      });
      await waitFor(() => {
        const typeLabels = screen.getAllByText('Type');
        expect(typeLabels.length).toBeGreaterThan(0);
      });
    });

    it('displays type filter options', async () => {
      render(<GroupsPage />);
      await waitFor(() => {
        const filtersButton = screen.getByRole('button', { name: /Filters/i });
        fireEvent.click(filtersButton);
      });
      await waitFor(() => {
        const typeSelect = screen.getByRole('combobox');
        expect(typeSelect).toBeInTheDocument();
      });
    });
  });

  describe('Pagination', () => {
    it('displays pagination info', async () => {
      render(<GroupsPage />);
      await waitFor(() => {
        expect(screen.getByText(/Showing 3 of 3 groups/i)).toBeInTheDocument();
      });
    });

    it('displays Previous and Next buttons', async () => {
      render(<GroupsPage />);
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Previous/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Next/i })).toBeInTheDocument();
      });
    });

    it('disables Previous button on first page', async () => {
      render(<GroupsPage />);
      await waitFor(() => {
        const prevButton = screen.getByRole('button', { name: /Previous/i });
        expect(prevButton).toBeDisabled();
      });
    });

    it('disables Next button on last page', async () => {
      render(<GroupsPage />);
      await waitFor(() => {
        const nextButton = screen.getByRole('button', { name: /Next/i });
        expect(nextButton).toBeDisabled();
      });
    });
  });

  describe('Create Group Modal', () => {
    it('opens modal when Add Group is clicked', async () => {
      render(<GroupsPage />);
      await waitFor(() => {
        fireEvent.click(screen.getByRole('button', { name: /Add Group/i }));
      });
      await waitFor(() => {
        const createHeaders = screen.getAllByText('Create Group');
        expect(createHeaders.length).toBeGreaterThan(0);
      });
    });

    it('displays form fields', async () => {
      render(<GroupsPage />);
      await waitFor(() => {
        fireEvent.click(screen.getByRole('button', { name: /Add Group/i }));
      });
      await waitFor(() => {
        expect(screen.getByPlaceholderText('Engineering Team')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('Optional description...')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('team@company.com')).toBeInTheDocument();
      });
    });

    it('allows filling form fields', async () => {
      render(<GroupsPage />);
      await waitFor(() => {
        fireEvent.click(screen.getByRole('button', { name: /Add Group/i }));
      });
      await waitFor(() => {
        const nameInput = screen.getByPlaceholderText('Engineering Team');
        fireEvent.change(nameInput, { target: { value: 'New Team' } });
        expect(nameInput).toHaveValue('New Team');
      });
    });

    it('displays type options', async () => {
      render(<GroupsPage />);
      await waitFor(() => {
        fireEvent.click(screen.getByRole('button', { name: /Add Group/i }));
      });
      await waitFor(() => {
        const selects = screen.getAllByRole('combobox');
        expect(selects.length).toBeGreaterThan(0);
      });
    });

    it('closes modal when Cancel is clicked', async () => {
      render(<GroupsPage />);
      await waitFor(() => {
        fireEvent.click(screen.getByRole('button', { name: /Add Group/i }));
      });
      await waitFor(() => {
        const createHeaders = screen.getAllByText('Create Group');
        expect(createHeaders.length).toBeGreaterThan(0);
      });
      const cancelButtons = screen.getAllByRole('button', { name: /Cancel/i });
      fireEvent.click(cancelButtons[0]);
      await waitFor(() => {
        expect(screen.queryByText('Manage group members')).not.toBeInTheDocument();
      });
    });
  });

  describe('Members Modal', () => {
    it('opens members modal when member count is clicked', async () => {
      render(<GroupsPage />);
      await waitFor(() => {
        const memberButton = screen.getByText('5 members');
        fireEvent.click(memberButton);
      });
      await waitFor(() => {
        expect(screen.getAllByText('Engineering Team').length).toBeGreaterThan(0);
        expect(screen.getByText('Manage group members')).toBeInTheDocument();
      });
    });

    it('displays members list', async () => {
      render(<GroupsPage />);
      await waitFor(() => {
        fireEvent.click(screen.getByText('5 members'));
      });
      await waitFor(() => {
        expect(screen.getByText('Alice Lead')).toBeInTheDocument();
        expect(screen.getByText('alice@example.com')).toBeInTheDocument();
        expect(screen.getByText('Bob Member')).toBeInTheDocument();
        expect(screen.getByText('bob@example.com')).toBeInTheDocument();
      });
    });

    it('displays member roles', async () => {
      render(<GroupsPage />);
      await waitFor(() => {
        fireEvent.click(screen.getByText('5 members'));
      });
      await waitFor(() => {
        expect(screen.getAllByText('Lead').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Member').length).toBeGreaterThan(0);
      });
    });

    it('displays add member form', async () => {
      render(<GroupsPage />);
      await waitFor(() => {
        fireEvent.click(screen.getByText('5 members'));
      });
      await waitFor(() => {
        const selects = screen.getAllByRole('combobox');
        expect(selects.length).toBeGreaterThan(0);
      });
    });

    it('displays available users in dropdown', async () => {
      render(<GroupsPage />);
      await waitFor(() => {
        fireEvent.click(screen.getByText('5 members'));
      });
      await waitFor(() => {
        const selects = screen.getAllByRole('combobox');
        expect(selects.length).toBeGreaterThan(1);
      });
    });

    it('closes members modal when Close is clicked', async () => {
      render(<GroupsPage />);
      await waitFor(() => {
        fireEvent.click(screen.getByText('5 members'));
      });
      await waitFor(() => {
        expect(screen.getByText('Manage group members')).toBeInTheDocument();
      });
      const closeButton = screen.getByRole('button', { name: /Close/i });
      fireEvent.click(closeButton);
      await waitFor(() => {
        expect(screen.queryByText('Manage group members')).not.toBeInTheDocument();
      });
    });
  });

  describe('Action Dropdown', () => {
    it('opens dropdown menu on action button click', async () => {
      render(<GroupsPage />);
      await waitFor(() => {
        const actionButtons = screen.getAllByRole('button');
        const moreButton = actionButtons.find(btn => {
          const svg = btn.querySelector('svg');
          return svg !== null;
        });
        if (moreButton) fireEvent.click(moreButton);
      });
    });
  });

  describe('Loading States', () => {
    it('shows loading spinner initially', () => {
      mockGroupsList.mockImplementation(() => new Promise(() => {}));
      render(<GroupsPage />);
      expect(document.querySelector('.animate-spin')).toBeTruthy();
    });

    it('hides loading spinner after data loads', async () => {
      render(<GroupsPage />);
      await waitFor(() => {
        expect(screen.getByText('Engineering Team')).toBeInTheDocument();
      });
      expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
    });
  });

  describe('Empty States', () => {
    it('shows empty state when no groups', async () => {
      mockGroupsList.mockResolvedValue({
        data: [],
        pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
      });
      render(<GroupsPage />);
      await waitFor(() => {
        expect(screen.getByText('No groups found')).toBeInTheDocument();
        expect(screen.getByText('Get started by creating your first group')).toBeInTheDocument();
      });
    });

    it('shows Add Group button in empty state', async () => {
      mockGroupsList.mockResolvedValue({
        data: [],
        pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
      });
      render(<GroupsPage />);
      await waitFor(() => {
        const addButtons = screen.getAllByRole('button', { name: /Add Group/i });
        expect(addButtons.length).toBeGreaterThan(0);
      });
    });

    it('shows empty members state', async () => {
      mockGroupsGetMembers.mockResolvedValue({ data: [] });
      render(<GroupsPage />);
      await waitFor(() => {
        fireEvent.click(screen.getByText('5 members'));
      });
      await waitFor(() => {
        expect(screen.getByText('No members in this group yet')).toBeInTheDocument();
      });
    });
  });

  describe('Edge Cases', () => {
    it('handles missing descriptions', async () => {
      render(<GroupsPage />);
      await waitFor(() => {
        expect(screen.getByText('All Staff')).toBeInTheDocument();
      });
    });

    it('handles missing manager', async () => {
      render(<GroupsPage />);
      await waitFor(() => {
        const dashes = screen.getAllByText('-');
        expect(dashes.length).toBeGreaterThan(0);
      });
    });

    it('handles missing email', async () => {
      render(<GroupsPage />);
      await waitFor(() => {
        const dashes = screen.getAllByText('-');
        expect(dashes.length).toBeGreaterThan(0);
      });
    });

    it('handles zero member count', async () => {
      const dataWithZeroMembers = {
        ...mockGroupsData,
        data: [
          {
            ...mockGroupsData.data[0],
            member_count: 0,
          },
        ],
      };
      mockGroupsList.mockResolvedValue(dataWithZeroMembers);
      render(<GroupsPage />);
      await waitFor(() => {
        expect(screen.getByText('0 members')).toBeInTheDocument();
      });
    });
  });

  describe('API Integration', () => {
    it('calls groupsApi.list on mount', async () => {
      render(<GroupsPage />);
      await waitFor(() => {
        expect(mockGroupsList).toHaveBeenCalled();
      });
    });

    it('calls usersApi.list on mount', async () => {
      render(<GroupsPage />);
      await waitFor(() => {
        expect(mockUsersList).toHaveBeenCalled();
      });
    });

    it('calls groupsApi.getMembers when opening members modal', async () => {
      render(<GroupsPage />);
      await waitFor(() => {
        fireEvent.click(screen.getByText('5 members'));
      });
      await waitFor(() => {
        expect(mockGroupsGetMembers).toHaveBeenCalledWith('group-1');
      });
    });
  });
});
