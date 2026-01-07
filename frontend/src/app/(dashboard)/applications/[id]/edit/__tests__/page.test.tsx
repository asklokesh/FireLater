import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import EditApplicationPage from '../page';

// Mock next/navigation
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useParams: vi.fn(() => ({ id: 'app-123' })),
  useRouter: vi.fn(() => ({ push: mockPush })),
}));

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

// Mock the API
vi.mock('@/lib/api', () => ({
  applicationsApi: {
    get: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  groupsApi: {
    list: vi.fn(),
  },
  usersApi: {
    list: vi.fn(),
  },
}));

import { applicationsApi, groupsApi, usersApi } from '@/lib/api';
import { useParams, useRouter } from 'next/navigation';

const mockApplication = {
  id: 'app-123',
  name: 'Customer Portal',
  short_name: 'CUST-PORTAL',
  description: 'Main customer-facing application',
  owner_id: 'user-1',
  owner_name: 'John Doe',
  support_group_id: 'grp-1',
  support_group_name: 'IT Support',
  environment: 'production',
  criticality: 'high',
  url: 'https://portal.example.com',
  documentation_url: 'https://docs.example.com/portal',
  version: '2.5.0',
  status: 'operational',
};

const mockUsers = [
  { id: 'user-1', name: 'John Doe', email: 'john@example.com' },
  { id: 'user-2', name: 'Jane Smith', email: 'jane@example.com' },
];

const mockGroups = [
  { id: 'grp-1', name: 'IT Support' },
  { id: 'grp-2', name: 'DevOps Team' },
];

const mockGet = applicationsApi.get as ReturnType<typeof vi.fn>;
const mockUpdate = applicationsApi.update as ReturnType<typeof vi.fn>;
const mockDelete = applicationsApi.delete as ReturnType<typeof vi.fn>;
const mockUsersApi = usersApi.list as ReturnType<typeof vi.fn>;
const mockGroupsApi = groupsApi.list as ReturnType<typeof vi.fn>;
const mockUseParams = useParams as ReturnType<typeof vi.fn>;

describe('EditApplicationPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseParams.mockReturnValue({ id: 'app-123' });
    mockGet.mockResolvedValue(mockApplication);
    mockUsersApi.mockResolvedValue({ data: mockUsers });
    mockGroupsApi.mockResolvedValue({ data: mockGroups });
    mockUpdate.mockResolvedValue({});
    mockDelete.mockResolvedValue({});
  });

  describe('Loading State', () => {
    it('shows loading spinner while loading', () => {
      mockGet.mockImplementation(() => new Promise(() => {}));
      render(<EditApplicationPage />);
      expect(document.querySelector('.animate-spin')).toBeInTheDocument();
    });
  });

  describe('Not Found State', () => {
    it('shows not found message when application does not exist', async () => {
      mockGet.mockResolvedValue(null);
      render(<EditApplicationPage />);
      await waitFor(() => {
        expect(screen.getByText('Application not found')).toBeInTheDocument();
      });
    });

    it('shows back button in not found state', async () => {
      mockGet.mockResolvedValue(null);
      render(<EditApplicationPage />);
      await waitFor(() => {
        expect(screen.getByRole('link', { name: /Back to Applications/i })).toBeInTheDocument();
      });
    });
  });

  describe('Basic Rendering', () => {
    it('renders page title', async () => {
      render(<EditApplicationPage />);
      await waitFor(() => {
        expect(screen.getByText('Edit Application')).toBeInTheDocument();
      });
    });

    it('renders application name in subtitle', async () => {
      render(<EditApplicationPage />);
      await waitFor(() => {
        expect(screen.getByText(/Update Customer Portal settings/)).toBeInTheDocument();
      });
    });

    it('renders delete button', async () => {
      render(<EditApplicationPage />);
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Delete/i })).toBeInTheDocument();
      });
    });

    it('renders back button link', async () => {
      render(<EditApplicationPage />);
      await waitFor(() => {
        const backLink = screen.getAllByRole('link').find(link => link.getAttribute('href') === '/applications/app-123');
        expect(backLink).toBeDefined();
      });
    });
  });

  describe('Form Population', () => {
    it('populates application name', async () => {
      render(<EditApplicationPage />);
      await waitFor(() => {
        const input = screen.getByDisplayValue('Customer Portal');
        expect(input).toBeInTheDocument();
      });
    });

    it('populates short name', async () => {
      render(<EditApplicationPage />);
      await waitFor(() => {
        const input = screen.getByDisplayValue('CUST-PORTAL');
        expect(input).toBeInTheDocument();
      });
    });

    it('populates description', async () => {
      render(<EditApplicationPage />);
      await waitFor(() => {
        const input = screen.getByDisplayValue('Main customer-facing application');
        expect(input).toBeInTheDocument();
      });
    });

    it('populates version', async () => {
      render(<EditApplicationPage />);
      await waitFor(() => {
        const input = screen.getByDisplayValue('2.5.0');
        expect(input).toBeInTheDocument();
      });
    });

    it('populates URL', async () => {
      render(<EditApplicationPage />);
      await waitFor(() => {
        const input = screen.getByDisplayValue('https://portal.example.com');
        expect(input).toBeInTheDocument();
      });
    });

    it('populates documentation URL', async () => {
      render(<EditApplicationPage />);
      await waitFor(() => {
        const input = screen.getByDisplayValue('https://docs.example.com/portal');
        expect(input).toBeInTheDocument();
      });
    });
  });

  describe('Form Sections', () => {
    it('renders Basic Information section', async () => {
      render(<EditApplicationPage />);
      await waitFor(() => {
        expect(screen.getByText('Basic Information')).toBeInTheDocument();
      });
    });

    it('renders Classification section', async () => {
      render(<EditApplicationPage />);
      await waitFor(() => {
        expect(screen.getByText('Classification')).toBeInTheDocument();
      });
    });

    it('renders Ownership section', async () => {
      render(<EditApplicationPage />);
      await waitFor(() => {
        expect(screen.getByText('Ownership')).toBeInTheDocument();
      });
    });

    it('renders URLs & Links section', async () => {
      render(<EditApplicationPage />);
      await waitFor(() => {
        expect(screen.getByText('URLs & Links')).toBeInTheDocument();
      });
    });
  });

  describe('Form Validation', () => {
    it('shows error when name is empty', async () => {
      render(<EditApplicationPage />);
      await waitFor(() => {
        expect(screen.getByDisplayValue('Customer Portal')).toBeInTheDocument();
      });

      const nameInput = screen.getByDisplayValue('Customer Portal');
      fireEvent.change(nameInput, { target: { value: '' } });

      // Use submit to bypass HTML5 validation
      const form = document.querySelector('form')!;
      fireEvent.submit(form);

      await waitFor(() => {
        expect(screen.getByText('Application name is required')).toBeInTheDocument();
      });
    });

    it('shows error when short name is empty', async () => {
      render(<EditApplicationPage />);
      await waitFor(() => {
        expect(screen.getByDisplayValue('CUST-PORTAL')).toBeInTheDocument();
      });

      const shortNameInput = screen.getByDisplayValue('CUST-PORTAL');
      fireEvent.change(shortNameInput, { target: { value: '' } });

      // Use submit to bypass HTML5 validation
      const form = document.querySelector('form')!;
      fireEvent.submit(form);

      await waitFor(() => {
        expect(screen.getByText('Short name is required')).toBeInTheDocument();
      });
    });
  });

  describe('Form Submission', () => {
    it('calls update API on submit', async () => {
      render(<EditApplicationPage />);
      await waitFor(() => {
        expect(screen.getByDisplayValue('Customer Portal')).toBeInTheDocument();
      });

      const saveButton = screen.getByRole('button', { name: /Save Changes/i });
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(mockUpdate).toHaveBeenCalledWith('app-123', expect.objectContaining({
          name: 'Customer Portal',
        }));
      });
    });

    it('navigates to detail page on success', async () => {
      render(<EditApplicationPage />);
      await waitFor(() => {
        expect(screen.getByDisplayValue('Customer Portal')).toBeInTheDocument();
      });

      const saveButton = screen.getByRole('button', { name: /Save Changes/i });
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/applications/app-123');
      });
    });

    it('shows error on update failure', async () => {
      mockUpdate.mockRejectedValue(new Error('Update failed'));
      render(<EditApplicationPage />);
      await waitFor(() => {
        expect(screen.getByDisplayValue('Customer Portal')).toBeInTheDocument();
      });

      const saveButton = screen.getByRole('button', { name: /Save Changes/i });
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText('Update failed')).toBeInTheDocument();
      });
    });

    it('shows loading state during submission', async () => {
      mockUpdate.mockImplementation(() => new Promise(() => {}));
      render(<EditApplicationPage />);
      await waitFor(() => {
        expect(screen.getByDisplayValue('Customer Portal')).toBeInTheDocument();
      });

      const saveButton = screen.getByRole('button', { name: /Save Changes/i });
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(saveButton).toBeDisabled();
      });
    });
  });

  describe('Delete Functionality', () => {
    it('opens delete confirmation modal', async () => {
      render(<EditApplicationPage />);
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Delete/i })).toBeInTheDocument();
      });

      const deleteButton = screen.getByRole('button', { name: /Delete/i });
      fireEvent.click(deleteButton);

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Delete Application' })).toBeInTheDocument();
      });
    });

    it('shows application name in delete confirmation', async () => {
      render(<EditApplicationPage />);
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Delete/i })).toBeInTheDocument();
      });

      const deleteButton = screen.getByRole('button', { name: /Delete/i });
      fireEvent.click(deleteButton);

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Delete Application' })).toBeInTheDocument();
      });

      // Check for the bold application name in the confirmation message
      const boldName = document.querySelector('strong');
      expect(boldName?.textContent).toBe('Customer Portal');
    });

    it('closes modal when cancel clicked', async () => {
      render(<EditApplicationPage />);
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Delete/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /Delete/i }));

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Delete Application' })).toBeInTheDocument();
      });

      const cancelButtons = screen.getAllByRole('button', { name: /Cancel/i });
      fireEvent.click(cancelButtons[cancelButtons.length - 1]);

      await waitFor(() => {
        expect(screen.queryByRole('heading', { name: 'Delete Application' })).not.toBeInTheDocument();
      });
    });

    it('calls delete API when confirmed', async () => {
      render(<EditApplicationPage />);
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Delete/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /Delete/i }));

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Delete Application' })).toBeInTheDocument();
      });

      const deleteApplicationButton = screen.getByRole('button', { name: /Delete Application/i });
      fireEvent.click(deleteApplicationButton);

      await waitFor(() => {
        expect(mockDelete).toHaveBeenCalledWith('app-123');
      });
    });

    it('navigates to applications list on delete success', async () => {
      render(<EditApplicationPage />);
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Delete/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /Delete/i }));

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Delete Application' })).toBeInTheDocument();
      });

      const deleteApplicationButton = screen.getByRole('button', { name: /Delete Application/i });
      fireEvent.click(deleteApplicationButton);

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/applications');
      });
    });

    it('shows error on delete failure', async () => {
      mockDelete.mockRejectedValue(new Error('Delete failed'));
      render(<EditApplicationPage />);
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Delete/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /Delete/i }));

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Delete Application' })).toBeInTheDocument();
      });

      const deleteApplicationButton = screen.getByRole('button', { name: /Delete Application/i });
      fireEvent.click(deleteApplicationButton);

      await waitFor(() => {
        expect(screen.getByText('Delete failed')).toBeInTheDocument();
      });
    });
  });

  describe('Dropdown Options', () => {
    it('populates owner dropdown with users', async () => {
      render(<EditApplicationPage />);
      await waitFor(() => {
        expect(screen.getByText('John Doe (john@example.com)')).toBeInTheDocument();
        expect(screen.getByText('Jane Smith (jane@example.com)')).toBeInTheDocument();
      });
    });

    it('populates support group dropdown with groups', async () => {
      render(<EditApplicationPage />);
      await waitFor(() => {
        expect(screen.getByText('IT Support')).toBeInTheDocument();
        expect(screen.getByText('DevOps Team')).toBeInTheDocument();
      });
    });
  });

  describe('Short Name Formatting', () => {
    it('converts short name to uppercase', async () => {
      render(<EditApplicationPage />);
      await waitFor(() => {
        expect(screen.getByDisplayValue('CUST-PORTAL')).toBeInTheDocument();
      });

      const shortNameInput = screen.getByDisplayValue('CUST-PORTAL');
      fireEvent.change(shortNameInput, { target: { value: 'new-name' } });

      await waitFor(() => {
        expect(screen.getByDisplayValue('NEW-NAME')).toBeInTheDocument();
      });
    });

    it('removes invalid characters from short name', async () => {
      render(<EditApplicationPage />);
      await waitFor(() => {
        expect(screen.getByDisplayValue('CUST-PORTAL')).toBeInTheDocument();
      });

      const shortNameInput = screen.getByDisplayValue('CUST-PORTAL');
      fireEvent.change(shortNameInput, { target: { value: 'test@123!' } });

      await waitFor(() => {
        expect(screen.getByDisplayValue('TEST123')).toBeInTheDocument();
      });
    });
  });

  describe('Info Message', () => {
    it('displays ownership info message', async () => {
      render(<EditApplicationPage />);
      await waitFor(() => {
        expect(screen.getByText(/The application owner is responsible for approving changes/)).toBeInTheDocument();
      });
    });
  });

  describe('Cancel Button', () => {
    it('links back to application detail page', async () => {
      render(<EditApplicationPage />);
      await waitFor(() => {
        const cancelLink = screen.getAllByRole('link').find(link =>
          link.getAttribute('href') === '/applications/app-123' && link.textContent?.includes('Cancel')
        );
        expect(cancelLink).toBeDefined();
      });
    });
  });
});
