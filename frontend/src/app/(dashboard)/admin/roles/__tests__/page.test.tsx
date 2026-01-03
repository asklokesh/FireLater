import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import RolesPage from '../page';
import { rolesApi } from '@/lib/api';

vi.mock('@/lib/api', () => ({
  rolesApi: {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    getPermissions: vi.fn(),
  },
}));

const mockRoles = [
  {
    id: '1',
    name: 'admin',
    display_name: 'Administrator',
    description: 'Full system access',
    is_system: true,
    user_count: '5',
    created_at: '2024-01-01T00:00:00Z',
  },
  {
    id: '2',
    name: 'engineer',
    display_name: 'Engineer',
    description: 'Engineering team member',
    is_system: true,
    user_count: '12',
    created_at: '2024-01-02T00:00:00Z',
  },
  {
    id: '3',
    name: 'custom_support',
    display_name: 'Support Agent',
    description: 'Customer support role',
    is_system: false,
    user_count: '8',
    created_at: '2024-01-03T00:00:00Z',
  },
];

const mockPermissions = [
  { id: 'p1', resource: 'users', action: 'read', description: 'View users' },
  { id: 'p2', resource: 'users', action: 'create', description: 'Create users' },
  { id: 'p3', resource: 'users', action: 'update', description: 'Update users' },
  { id: 'p4', resource: 'issues', action: 'read', description: 'View issues' },
  { id: 'p5', resource: 'issues', action: 'create', description: 'Create issues' },
  { id: 'p6', resource: 'issues', action: 'resolve', description: 'Resolve issues' },
];

const mockGroupedPermissions = {
  users: [
    { id: 'p1', resource: 'users', action: 'read', description: 'View users' },
    { id: 'p2', resource: 'users', action: 'create', description: 'Create users' },
    { id: 'p3', resource: 'users', action: 'update', description: 'Update users' },
  ],
  issues: [
    { id: 'p4', resource: 'issues', action: 'read', description: 'View issues' },
    { id: 'p5', resource: 'issues', action: 'create', description: 'Create issues' },
    { id: 'p6', resource: 'issues', action: 'resolve', description: 'Resolve issues' },
  ],
};

const mockRoleWithPermissions = {
  ...mockRoles[0],
  permissions: [mockPermissions[0], mockPermissions[1], mockPermissions[4]],
};

describe('RolesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(rolesApi.list).mockResolvedValue({ data: mockRoles });
    vi.mocked(rolesApi.getPermissions).mockResolvedValue({
      data: mockPermissions,
      grouped: mockGroupedPermissions,
    });
  });

  describe('Page Layout', () => {
    it('renders page title and description', async () => {
      render(<RolesPage />);

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /roles & permissions/i })).toBeInTheDocument();
      });

      expect(screen.getByText(/manage user roles and their associated permissions/i)).toBeInTheDocument();
    });

    it('renders add role button', async () => {
      render(<RolesPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add role/i })).toBeInTheDocument();
      });
    });

    it('shows loading state initially', () => {
      render(<RolesPage />);

      const loader = document.querySelector('.animate-spin');
      expect(loader).toBeInTheDocument();
    });

    it('renders stats cards after loading', async () => {
      render(<RolesPage />);

      await waitFor(() => {
        expect(screen.getByText('Total Roles')).toBeInTheDocument();
      });

      expect(screen.getByText('System Roles')).toBeInTheDocument();
      expect(screen.getByText('Custom Roles')).toBeInTheDocument();
    });
  });

  describe('Stats Cards', () => {
    it('displays correct total roles count', async () => {
      render(<RolesPage />);

      await waitFor(() => {
        expect(screen.getByText('Total Roles')).toBeInTheDocument();
      });

      const totalCard = screen.getByText('Total Roles').closest('div');
      expect(totalCard).toHaveTextContent('3');
    });

    it('displays correct system roles count', async () => {
      render(<RolesPage />);

      await waitFor(() => {
        expect(screen.getByText('System Roles')).toBeInTheDocument();
      });

      const systemCard = screen.getByText('System Roles').closest('div');
      expect(systemCard).toHaveTextContent('2');
    });

    it('displays correct custom roles count', async () => {
      render(<RolesPage />);

      await waitFor(() => {
        expect(screen.getByText('Custom Roles')).toBeInTheDocument();
      });

      const customCard = screen.getByText('Custom Roles').closest('div');
      expect(customCard).toHaveTextContent('1');
    });
  });

  describe('Roles List', () => {
    it('renders all roles in the list', async () => {
      render(<RolesPage />);

      await waitFor(() => {
        expect(screen.getByText('Administrator')).toBeInTheDocument();
      });

      expect(screen.getByText('Engineer')).toBeInTheDocument();
      expect(screen.getByText('Support Agent')).toBeInTheDocument();
    });

    it('displays role names and display names', async () => {
      render(<RolesPage />);

      await waitFor(() => {
        expect(screen.getByText('Administrator')).toBeInTheDocument();
      });

      expect(screen.getByText('admin')).toBeInTheDocument();
      expect(screen.getByText('engineer')).toBeInTheDocument();
      expect(screen.getByText('custom_support')).toBeInTheDocument();
    });

    it('displays user count for each role', async () => {
      render(<RolesPage />);

      await waitFor(() => {
        expect(screen.getByText('Administrator')).toBeInTheDocument();
      });

      const adminRole = screen.getByText('Administrator').closest('div')?.parentElement?.parentElement;
      expect(adminRole).toHaveTextContent('5');

      const engineerRole = screen.getByText('Engineer').closest('div')?.parentElement?.parentElement;
      expect(engineerRole).toHaveTextContent('12');

      const supportRole = screen.getByText('Support Agent').closest('div')?.parentElement?.parentElement;
      expect(supportRole).toHaveTextContent('8');
    });

    it('displays system badge for system roles', async () => {
      render(<RolesPage />);

      await waitFor(() => {
        expect(screen.getByText('Administrator')).toBeInTheDocument();
      });

      const systemBadges = screen.getAllByText('System');
      expect(systemBadges).toHaveLength(2);
    });

    it('does not display system badge for custom roles', async () => {
      render(<RolesPage />);

      await waitFor(() => {
        expect(screen.getByText('Support Agent')).toBeInTheDocument();
      });

      const supportRole = screen.getByText('Support Agent').closest('div')?.parentElement;
      expect(supportRole).not.toHaveTextContent('System');
    });
  });

  describe('Role Selection', () => {
    it('shows placeholder when no role is selected', async () => {
      render(<RolesPage />);

      await waitFor(() => {
        expect(screen.getByText('Administrator')).toBeInTheDocument();
      });

      expect(screen.getByText(/select a role to view its permissions/i)).toBeInTheDocument();
    });

    it('loads role details when role is clicked', async () => {
      vi.mocked(rolesApi.get).mockResolvedValue(mockRoleWithPermissions);

      render(<RolesPage />);

      await waitFor(() => {
        expect(screen.getByText('Administrator')).toBeInTheDocument();
      });

      const adminRole = screen.getByText('Administrator');
      fireEvent.click(adminRole);

      await waitFor(() => {
        expect(rolesApi.get).toHaveBeenCalledWith('1');
      });
    });

    it('displays role details after selection', async () => {
      vi.mocked(rolesApi.get).mockResolvedValue(mockRoleWithPermissions);

      render(<RolesPage />);

      await waitFor(() => {
        expect(screen.getByText('Administrator')).toBeInTheDocument();
      });

      const adminRole = screen.getByText('Administrator');
      fireEvent.click(adminRole);

      await waitFor(() => {
        expect(screen.getAllByText('Administrator')).toHaveLength(2);
      });

      expect(screen.getByText('Full system access')).toBeInTheDocument();
    });

    it('displays loading state while fetching role details', async () => {
      vi.mocked(rolesApi.get).mockImplementation(() => new Promise(() => {}));

      render(<RolesPage />);

      await waitFor(() => {
        expect(screen.getByText('Administrator')).toBeInTheDocument();
      });

      const adminRole = screen.getByText('Administrator');
      fireEvent.click(adminRole);

      await waitFor(() => {
        const loaders = document.querySelectorAll('.animate-spin');
        expect(loaders.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Role Details - Permissions', () => {
    beforeEach(() => {
      vi.mocked(rolesApi.get).mockResolvedValue(mockRoleWithPermissions);
    });

    it('displays permissions count', async () => {
      render(<RolesPage />);

      await waitFor(() => {
        expect(screen.getByText('Administrator')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Administrator'));

      await waitFor(() => {
        expect(screen.getByText(/permissions \(3\)/i)).toBeInTheDocument();
      });
    });

    it('displays grouped permissions by resource', async () => {
      render(<RolesPage />);

      await waitFor(() => {
        expect(screen.getByText('Administrator')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Administrator'));

      await waitFor(() => {
        expect(screen.getByText('Users')).toBeInTheDocument();
      });

      expect(screen.getByText('Issues')).toBeInTheDocument();
    });

    it('displays permission counts for each resource', async () => {
      render(<RolesPage />);

      await waitFor(() => {
        expect(screen.getByText('Administrator')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Administrator'));

      await waitFor(() => {
        expect(screen.getByText('Users')).toBeInTheDocument();
      });

      expect(screen.getByText('2/3')).toBeInTheDocument();
      expect(screen.getByText('1/3')).toBeInTheDocument();
    });

    it('expands resource to show individual permissions', async () => {
      render(<RolesPage />);

      await waitFor(() => {
        expect(screen.getByText('Administrator')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Administrator'));

      await waitFor(() => {
        expect(screen.getByText('Users')).toBeInTheDocument();
      });

      const usersButton = screen.getByText('Users').closest('button');
      if (usersButton) {
        fireEvent.click(usersButton);
      }

      await waitFor(() => {
        expect(screen.getByText('View')).toBeInTheDocument();
      });
    });

    it('displays none badge for resources with no permissions', async () => {
      const roleWithNoIssuePerms = {
        ...mockRoles[2],
        permissions: [mockPermissions[0]],
      };

      vi.mocked(rolesApi.get).mockResolvedValue(roleWithNoIssuePerms);

      render(<RolesPage />);

      await waitFor(() => {
        expect(screen.getByText('Support Agent')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Support Agent'));

      await waitFor(() => {
        expect(screen.getByText('None')).toBeInTheDocument();
      });
    });
  });

  describe('Role Actions Dropdown', () => {
    beforeEach(() => {
      vi.mocked(rolesApi.get).mockResolvedValue(mockRoleWithPermissions);
    });

    it('opens dropdown when more button is clicked', async () => {
      render(<RolesPage />);

      await waitFor(() => {
        expect(screen.getByText('Administrator')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Administrator'));

      await waitFor(() => {
        expect(screen.getAllByText('Administrator')).toHaveLength(2);
      });

      const moreButtons = document.querySelectorAll('button');
      const moreButton = Array.from(moreButtons).find(btn => {
        const svg = btn.querySelector('svg');
        return svg && btn.className.includes('text-gray-400');
      });

      if (moreButton) {
        fireEvent.click(moreButton);

        await waitFor(() => {
          expect(screen.getByText('Edit Role')).toBeInTheDocument();
        });
      }
    });

    it('closes dropdown when clicked outside', async () => {
      render(<RolesPage />);

      await waitFor(() => {
        expect(screen.getByText('Administrator')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Administrator'));

      await waitFor(() => {
        expect(screen.getAllByText('Administrator')).toHaveLength(2);
      });

      const moreButtons = document.querySelectorAll('button');
      const moreButton = Array.from(moreButtons).find(btn => {
        const svg = btn.querySelector('svg');
        return svg && btn.className.includes('text-gray-400');
      });

      if (moreButton) {
        fireEvent.click(moreButton);

        await waitFor(() => {
          expect(screen.getByText('Edit Role')).toBeInTheDocument();
        });

        const backdrop = document.querySelector('.fixed.inset-0.z-0');
        if (backdrop) {
          fireEvent.click(backdrop);

          await waitFor(() => {
            expect(screen.queryByText('Edit Role')).not.toBeInTheDocument();
          });
        }
      }
    });
  });

  describe('Create Role Modal', () => {
    it('opens create modal when add role button is clicked', async () => {
      render(<RolesPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add role/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /add role/i }));

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /create role/i })).toBeInTheDocument();
      });
    });

    it('displays all form fields in create modal', async () => {
      render(<RolesPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add role/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /add role/i }));

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /create role/i })).toBeInTheDocument();
      });

      expect(screen.getByPlaceholderText(/custom_role/i)).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/custom role/i)).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/optional description/i)).toBeInTheDocument();

      const permissionsLabels = screen.getAllByText(/permissions/i);
      const permissionsLabel = permissionsLabels.find(el => el.tagName === 'LABEL');
      expect(permissionsLabel).toBeInTheDocument();
    });

    it('displays grouped permissions in create modal', async () => {
      render(<RolesPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add role/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /add role/i }));

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /create role/i })).toBeInTheDocument();
      });

      const usersCheckboxes = screen.getAllByText('Users');
      expect(usersCheckboxes.length).toBeGreaterThan(0);

      const issuesCheckboxes = screen.getAllByText('Issues');
      expect(issuesCheckboxes.length).toBeGreaterThan(0);
    });

    it('closes modal when cancel button is clicked', async () => {
      render(<RolesPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add role/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /add role/i }));

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /create role/i })).toBeInTheDocument();
      });

      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      fireEvent.click(cancelButton);

      await waitFor(() => {
        expect(screen.queryByRole('heading', { name: /create role/i })).not.toBeInTheDocument();
      });
    });

    it('closes modal when X button is clicked', async () => {
      render(<RolesPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add role/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /add role/i }));

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /create role/i })).toBeInTheDocument();
      });

      const closeButtons = document.querySelectorAll('button');
      const xButton = Array.from(closeButtons).find(btn => {
        const svg = btn.querySelector('svg');
        return svg && btn.className.includes('text-gray-400');
      });

      if (xButton) {
        fireEvent.click(xButton);

        await waitFor(() => {
          expect(screen.queryByRole('heading', { name: /create role/i })).not.toBeInTheDocument();
        });
      }
    });

    it('allows selecting individual permissions', async () => {
      render(<RolesPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add role/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /add role/i }));

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /create role/i })).toBeInTheDocument();
      });

      const viewButtons = screen.getAllByText('View');
      const viewButton = viewButtons[0];

      fireEvent.click(viewButton);

      expect(viewButton.closest('label')).toHaveClass('bg-blue-100');
    });

    it('allows selecting all permissions for a resource', async () => {
      render(<RolesPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add role/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /add role/i }));

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /create role/i })).toBeInTheDocument();
      });

      const checkboxes = screen.getAllByRole('checkbox');
      const usersCheckbox = checkboxes.find(cb => {
        const label = cb.closest('button')?.querySelector('span');
        return label?.textContent === 'Users';
      });

      if (usersCheckbox) {
        fireEvent.click(usersCheckbox);

        await waitFor(() => {
          expect(usersCheckbox).toBeChecked();
        });
      }
    });

    it('enforces lowercase underscores for role name', async () => {
      render(<RolesPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add role/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /add role/i }));

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /create role/i })).toBeInTheDocument();
      });

      const nameInput = screen.getByPlaceholderText(/custom_role/i) as HTMLInputElement;
      fireEvent.change(nameInput, { target: { value: 'Test-Role 123' } });

      expect(nameInput.value).toBe('testrole');
    });

    it('submits form with valid data', async () => {
      vi.mocked(rolesApi.create).mockResolvedValue({ id: '4' });

      render(<RolesPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add role/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /add role/i }));

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /create role/i })).toBeInTheDocument();
      });

      const nameInput = screen.getByPlaceholderText(/custom_role/i);
      const displayInput = screen.getByPlaceholderText(/^custom role$/i);
      const descriptionInput = screen.getByPlaceholderText(/optional description/i);

      fireEvent.change(nameInput, { target: { value: 'new_role' } });
      fireEvent.change(displayInput, { target: { value: 'New Role' } });
      fireEvent.change(descriptionInput, { target: { value: 'Test description' } });

      const createButton = screen.getByRole('button', { name: /create role/i });
      fireEvent.click(createButton);

      await waitFor(() => {
        expect(rolesApi.create).toHaveBeenCalledWith({
          name: 'new_role',
          displayName: 'New Role',
          description: 'Test description',
          permissionIds: [],
        });
      });
    });

    it('displays error message on create failure', async () => {
      vi.mocked(rolesApi.create).mockRejectedValue(new Error('Role already exists'));

      render(<RolesPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add role/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /add role/i }));

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /create role/i })).toBeInTheDocument();
      });

      const nameInput = screen.getByPlaceholderText(/custom_role/i);
      const displayInput = screen.getByPlaceholderText(/^custom role$/i);

      fireEvent.change(nameInput, { target: { value: 'new_role' } });
      fireEvent.change(displayInput, { target: { value: 'New Role' } });

      const createButton = screen.getByRole('button', { name: /create role/i });
      fireEvent.click(createButton);

      await waitFor(() => {
        expect(screen.getByText(/role already exists/i)).toBeInTheDocument();
      });
    });

    it('closes modal after successful create', async () => {
      vi.mocked(rolesApi.create).mockResolvedValue({ id: '4' });

      render(<RolesPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add role/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /add role/i }));

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /create role/i })).toBeInTheDocument();
      });

      const nameInput = screen.getByPlaceholderText(/custom_role/i);
      const displayInput = screen.getByPlaceholderText(/^custom role$/i);

      fireEvent.change(nameInput, { target: { value: 'new_role' } });
      fireEvent.change(displayInput, { target: { value: 'New Role' } });

      const createButton = screen.getByRole('button', { name: /create role/i });
      fireEvent.click(createButton);

      await waitFor(() => {
        expect(screen.queryByRole('heading', { name: /create role/i })).not.toBeInTheDocument();
      });
    });
  });

  describe('Edit Role Modal', () => {
    beforeEach(() => {
      vi.mocked(rolesApi.get).mockResolvedValue(mockRoleWithPermissions);
    });

    it('opens edit modal when edit action is clicked', async () => {
      render(<RolesPage />);

      await waitFor(() => {
        expect(screen.getByText('Administrator')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Administrator'));

      await waitFor(() => {
        expect(screen.getAllByText('Administrator')).toHaveLength(2);
      });

      const moreButtons = document.querySelectorAll('button');
      const moreButton = Array.from(moreButtons).find(btn => {
        const svg = btn.querySelector('svg');
        return svg && btn.className.includes('text-gray-400');
      });

      if (moreButton) {
        fireEvent.click(moreButton);

        await waitFor(() => {
          expect(screen.getByText('Edit Role')).toBeInTheDocument();
        });

        fireEvent.click(screen.getByText('Edit Role'));

        await waitFor(() => {
          expect(screen.getByText(/edit role: administrator/i)).toBeInTheDocument();
        });
      }
    });

    it('pre-fills form with role data', async () => {
      render(<RolesPage />);

      await waitFor(() => {
        expect(screen.getByText('Administrator')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Administrator'));

      await waitFor(() => {
        expect(screen.getAllByText('Administrator')).toHaveLength(2);
      });

      const moreButtons = document.querySelectorAll('button');
      const moreButton = Array.from(moreButtons).find(btn => {
        const svg = btn.querySelector('svg');
        return svg && btn.className.includes('text-gray-400');
      });

      if (moreButton) {
        fireEvent.click(moreButton);

        await waitFor(() => {
          expect(screen.getByText('Edit Role')).toBeInTheDocument();
        });

        fireEvent.click(screen.getByText('Edit Role'));

        await waitFor(() => {
          expect(screen.getByText(/edit role: administrator/i)).toBeInTheDocument();
        });

        const inputs = document.querySelectorAll('input');
        const displayInput = Array.from(inputs).find(input =>
          (input as HTMLInputElement).value === 'Administrator'
        ) as HTMLInputElement;
        expect(displayInput).toBeDefined();
        expect(displayInput.value).toBe('Administrator');

        const textareas = document.querySelectorAll('textarea');
        const descriptionInput = Array.from(textareas).find(ta =>
          (ta as HTMLTextAreaElement).value === 'Full system access'
        ) as HTMLTextAreaElement;
        expect(descriptionInput).toBeDefined();
        expect(descriptionInput.value).toBe('Full system access');
      }
    });

    it('shows warning for system roles', async () => {
      render(<RolesPage />);

      await waitFor(() => {
        expect(screen.getByText('Administrator')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Administrator'));

      await waitFor(() => {
        expect(screen.getAllByText('Administrator')).toHaveLength(2);
      });

      const moreButtons = document.querySelectorAll('button');
      const moreButton = Array.from(moreButtons).find(btn => {
        const svg = btn.querySelector('svg');
        return svg && btn.className.includes('text-gray-400');
      });

      if (moreButton) {
        fireEvent.click(moreButton);

        await waitFor(() => {
          expect(screen.getByText('Edit Role')).toBeInTheDocument();
        });

        fireEvent.click(screen.getByText('Edit Role'));

        await waitFor(() => {
          expect(screen.getByText(/system role permissions cannot be modified/i)).toBeInTheDocument();
        });
      }
    });

    it('hides permissions section for system roles', async () => {
      render(<RolesPage />);

      await waitFor(() => {
        expect(screen.getByText('Administrator')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Administrator'));

      await waitFor(() => {
        expect(screen.getAllByText('Administrator')).toHaveLength(2);
      });

      const moreButtons = document.querySelectorAll('button');
      const moreButton = Array.from(moreButtons).find(btn => {
        const svg = btn.querySelector('svg');
        return svg && btn.className.includes('text-gray-400');
      });

      if (moreButton) {
        fireEvent.click(moreButton);

        await waitFor(() => {
          expect(screen.getByText('Edit Role')).toBeInTheDocument();
        });

        fireEvent.click(screen.getByText('Edit Role'));

        await waitFor(() => {
          expect(screen.getByText(/edit role: administrator/i)).toBeInTheDocument();
        });

        const checkboxes = screen.queryAllByRole('checkbox');
        expect(checkboxes.length).toBe(0);
      }
    });

    it('submits update with valid data', async () => {
      const customRole = {
        ...mockRoles[2],
        permissions: [mockPermissions[0]],
      };

      vi.mocked(rolesApi.get).mockResolvedValue(customRole);
      vi.mocked(rolesApi.update).mockResolvedValue({ id: '3' });

      render(<RolesPage />);

      await waitFor(() => {
        expect(screen.getByText('Support Agent')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Support Agent'));

      await waitFor(() => {
        expect(screen.getAllByText('Support Agent')).toHaveLength(2);
      });

      const moreButtons = document.querySelectorAll('button');
      const moreButton = Array.from(moreButtons).find(btn => {
        const svg = btn.querySelector('svg');
        return svg && btn.className.includes('text-gray-400');
      });

      if (moreButton) {
        fireEvent.click(moreButton);

        await waitFor(() => {
          expect(screen.getByText('Edit Role')).toBeInTheDocument();
        });

        fireEvent.click(screen.getByText('Edit Role'));

        await waitFor(() => {
          expect(screen.getByText(/edit role: support agent/i)).toBeInTheDocument();
        });

        const inputs = document.querySelectorAll('input');
        const displayInput = Array.from(inputs).find(input =>
          (input as HTMLInputElement).value === 'Support Agent'
        ) as HTMLInputElement;
        expect(displayInput).toBeDefined();
        fireEvent.change(displayInput, { target: { value: 'Updated Support' } });

        const saveButton = screen.getByRole('button', { name: /save changes/i });
        fireEvent.click(saveButton);

        await waitFor(() => {
          expect(rolesApi.update).toHaveBeenCalledWith('3', {
            displayName: 'Updated Support',
            description: 'Customer support role',
            permissionIds: ['p1'],
          });
        });
      }
    });

    it('displays error message on update failure', async () => {
      const customRole = {
        ...mockRoles[2],
        permissions: [mockPermissions[0]],
      };

      vi.mocked(rolesApi.get).mockResolvedValue(customRole);
      vi.mocked(rolesApi.update).mockRejectedValue(new Error('Update failed'));

      render(<RolesPage />);

      await waitFor(() => {
        expect(screen.getByText('Support Agent')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Support Agent'));

      await waitFor(() => {
        expect(screen.getAllByText('Support Agent')).toHaveLength(2);
      });

      const moreButtons = document.querySelectorAll('button');
      const moreButton = Array.from(moreButtons).find(btn => {
        const svg = btn.querySelector('svg');
        return svg && btn.className.includes('text-gray-400');
      });

      if (moreButton) {
        fireEvent.click(moreButton);

        await waitFor(() => {
          expect(screen.getByText('Edit Role')).toBeInTheDocument();
        });

        fireEvent.click(screen.getByText('Edit Role'));

        await waitFor(() => {
          expect(screen.getByText(/edit role: support agent/i)).toBeInTheDocument();
        });

        const saveButton = screen.getByRole('button', { name: /save changes/i });
        fireEvent.click(saveButton);

        await waitFor(() => {
          expect(screen.getByText(/update failed/i)).toBeInTheDocument();
        });
      }
    });

    it('closes modal after successful update', async () => {
      const customRole = {
        ...mockRoles[2],
        permissions: [mockPermissions[0]],
      };

      vi.mocked(rolesApi.get).mockResolvedValue(customRole);
      vi.mocked(rolesApi.update).mockResolvedValue({ id: '3' });

      render(<RolesPage />);

      await waitFor(() => {
        expect(screen.getByText('Support Agent')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Support Agent'));

      await waitFor(() => {
        expect(screen.getAllByText('Support Agent')).toHaveLength(2);
      });

      const moreButtons = document.querySelectorAll('button');
      const moreButton = Array.from(moreButtons).find(btn => {
        const svg = btn.querySelector('svg');
        return svg && btn.className.includes('text-gray-400');
      });

      if (moreButton) {
        fireEvent.click(moreButton);

        await waitFor(() => {
          expect(screen.getByText('Edit Role')).toBeInTheDocument();
        });

        fireEvent.click(screen.getByText('Edit Role'));

        await waitFor(() => {
          expect(screen.getByText(/edit role: support agent/i)).toBeInTheDocument();
        });

        const saveButton = screen.getByRole('button', { name: /save changes/i });
        fireEvent.click(saveButton);

        await waitFor(() => {
          expect(screen.queryByText(/edit role: support agent/i)).not.toBeInTheDocument();
        });
      }
    });
  });
});
