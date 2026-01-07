import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mock next/navigation
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

// Mock the APIs
vi.mock('@/lib/api', () => ({
  applicationsApi: {
    create: vi.fn(),
  },
  usersApi: {
    list: vi.fn(),
  },
  groupsApi: {
    list: vi.fn(),
  },
}));

import NewApplicationPage from '../page';
import { applicationsApi, usersApi, groupsApi } from '@/lib/api';

describe('NewApplicationPage', () => {
  const mockUsers = [
    { id: 'user-1', name: 'John Doe', email: 'john@example.com' },
    { id: 'user-2', name: 'Jane Smith', email: 'jane@example.com' },
  ];

  const mockGroups = [
    { id: 'group-1', name: 'Support Team' },
    { id: 'group-2', name: 'Engineering' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockPush.mockClear();
    vi.mocked(usersApi.list).mockResolvedValue({ data: mockUsers });
    vi.mocked(groupsApi.list).mockResolvedValue({ data: mockGroups });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('rendering', () => {
    it('should render the form with all sections', async () => {
      render(<NewApplicationPage />);

      expect(screen.getByText('New Application')).toBeInTheDocument();
      expect(screen.getByText('Basic Information')).toBeInTheDocument();
      expect(screen.getByText('Classification')).toBeInTheDocument();
      expect(screen.getByText('Ownership')).toBeInTheDocument();
      expect(screen.getByText('URLs & Links')).toBeInTheDocument();
    });

    it('should load users and groups on mount', async () => {
      render(<NewApplicationPage />);

      await waitFor(() => {
        expect(usersApi.list).toHaveBeenCalledWith({ limit: 100 });
        expect(groupsApi.list).toHaveBeenCalledWith({ limit: 100 });
      });
    });

    it('should populate owner dropdown with users', async () => {
      render(<NewApplicationPage />);

      await waitFor(() => {
        // Check that users appear in the dropdown
        expect(screen.getByText(/john doe \(john@example.com\)/i)).toBeInTheDocument();
      });

      expect(screen.getByText(/jane smith \(jane@example.com\)/i)).toBeInTheDocument();
    });

    it('should populate support group dropdown', async () => {
      render(<NewApplicationPage />);

      await waitFor(() => {
        expect(screen.getByText('Support Team')).toBeInTheDocument();
      });

      expect(screen.getByText('Engineering')).toBeInTheDocument();
    });
  });

  describe('form validation', () => {
    it('should show error when application name is empty', async () => {
      const user = userEvent.setup();
      render(<NewApplicationPage />);

      // Fill in short name but not application name
      const shortNameInput = screen.getByPlaceholderText(/cust-portal/i);
      await user.type(shortNameInput, 'TEST');

      // Submit form
      const form = screen.getByRole('button', { name: /create application/i }).closest('form');
      fireEvent.submit(form!);

      await waitFor(() => {
        expect(screen.getByText('Application name is required')).toBeInTheDocument();
      });
    });

    it('should show error when short name is empty', async () => {
      const user = userEvent.setup();
      render(<NewApplicationPage />);

      // Fill in name but not short name - use placeholder instead of label
      await user.type(screen.getByPlaceholderText(/customer portal/i), 'Test Application');

      // Submit form
      const form = screen.getByRole('button', { name: /create application/i }).closest('form');
      fireEvent.submit(form!);

      await waitFor(() => {
        expect(screen.getByText('Short name is required')).toBeInTheDocument();
      });
    });

    it('should convert short name to uppercase', async () => {
      const user = userEvent.setup();
      render(<NewApplicationPage />);

      const shortNameInput = screen.getByPlaceholderText(/cust-portal/i);
      await user.type(shortNameInput, 'test-app');

      expect(shortNameInput).toHaveValue('TEST-APP');
    });

    it('should remove invalid characters from short name', async () => {
      const user = userEvent.setup();
      render(<NewApplicationPage />);

      const shortNameInput = screen.getByPlaceholderText(/cust-portal/i);
      await user.type(shortNameInput, 'test app!@#$');

      // Only uppercase letters, numbers, and hyphens should remain
      expect(shortNameInput).toHaveValue('TESTAPP');
    });
  });

  describe('form submission', () => {
    it('should submit form with correct data', async () => {
      const user = userEvent.setup();
      vi.mocked(applicationsApi.create).mockResolvedValue({ id: 'new-app-id' });

      render(<NewApplicationPage />);

      await waitFor(() => {
        expect(usersApi.list).toHaveBeenCalled();
      });

      // Fill in required fields - use placeholder instead of label
      await user.type(screen.getByPlaceholderText(/customer portal/i), 'Test Application');
      await user.type(screen.getByPlaceholderText(/cust-portal/i), 'TEST-APP');

      // Fill in optional fields
      const descriptionTextarea = screen.getByPlaceholderText(/describe the application/i);
      await user.type(descriptionTextarea, 'Test description');

      // Submit
      await user.click(screen.getByRole('button', { name: /create application/i }));

      await waitFor(() => {
        expect(applicationsApi.create).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'Test Application',
            description: 'Test description',
          })
        );
      });
    });

    it('should redirect to application detail on success', async () => {
      const user = userEvent.setup();
      vi.mocked(applicationsApi.create).mockResolvedValue({ id: 'new-app-123' });

      render(<NewApplicationPage />);

      // Fill in required fields - use placeholder instead of label
      await user.type(screen.getByPlaceholderText(/customer portal/i), 'Test Application');
      await user.type(screen.getByPlaceholderText(/cust-portal/i), 'TEST');

      // Submit
      await user.click(screen.getByRole('button', { name: /create application/i }));

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/applications/new-app-123');
      });
    });

    it('should show error on submission failure', async () => {
      const user = userEvent.setup();
      vi.mocked(applicationsApi.create).mockRejectedValue(new Error('Server error'));

      render(<NewApplicationPage />);

      // Fill in required fields - use placeholder instead of label
      await user.type(screen.getByPlaceholderText(/customer portal/i), 'Test Application');
      await user.type(screen.getByPlaceholderText(/cust-portal/i), 'TEST');

      // Submit
      await user.click(screen.getByRole('button', { name: /create application/i }));

      await waitFor(() => {
        expect(screen.getByText(/server error/i)).toBeInTheDocument();
      });
    });

    it('should disable submit button while submitting', async () => {
      const user = userEvent.setup();
      vi.mocked(applicationsApi.create).mockImplementation(() => new Promise(() => {})); // Hang

      render(<NewApplicationPage />);

      // Fill in required fields - use placeholder instead of label
      await user.type(screen.getByPlaceholderText(/customer portal/i), 'Test Application');
      await user.type(screen.getByPlaceholderText(/cust-portal/i), 'TEST');

      // Submit
      await user.click(screen.getByRole('button', { name: /create application/i }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /create application/i })).toBeDisabled();
      });
    });
  });

  describe('select fields', () => {
    it('should have environment dropdown with options', async () => {
      render(<NewApplicationPage />);

      // Find by text content in label, then get the sibling select
      const environmentLabel = screen.getByText('Environment');
      const environmentSelect = environmentLabel.parentElement?.querySelector('select');
      expect(environmentSelect).toBeTruthy();

      // Check default value
      expect(environmentSelect).toHaveValue('production');
    });

    it('should have criticality dropdown with options', async () => {
      render(<NewApplicationPage />);

      const criticalityLabel = screen.getByText('Criticality');
      const criticalitySelect = criticalityLabel.parentElement?.querySelector('select');
      expect(criticalitySelect).toBeTruthy();

      // Check default value
      expect(criticalitySelect).toHaveValue('medium');
    });

    it('should have status dropdown with options', async () => {
      render(<NewApplicationPage />);

      const statusLabel = screen.getByText('Status');
      const statusSelect = statusLabel.parentElement?.querySelector('select');
      expect(statusSelect).toBeTruthy();

      // Check default value
      expect(statusSelect).toHaveValue('operational');
    });
  });

  describe('navigation', () => {
    it('should have back link to applications list', async () => {
      render(<NewApplicationPage />);

      const backButton = screen.getAllByRole('button').find(
        btn => btn.closest('a')?.getAttribute('href') === '/applications'
      );

      expect(backButton).toBeTruthy();
    });

    it('should have cancel button linking to applications list', async () => {
      render(<NewApplicationPage />);

      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      expect(cancelButton.closest('a')).toHaveAttribute('href', '/applications');
    });
  });
});
