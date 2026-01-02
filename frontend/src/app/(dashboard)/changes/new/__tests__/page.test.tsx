import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import NewChangePage from '../page';
import * as useApiHooks from '@/hooks/useApi';

// Mock Next.js navigation
const mockPush = vi.fn();
const mockBack = vi.fn();
const mockSearchParams = {
  get: vi.fn(),
};

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    back: mockBack,
  }),
  useSearchParams: () => mockSearchParams,
}));

// Mock Next.js Link
vi.mock('next/link', () => ({
  default: ({ children, href }: any) => <a href={href}>{children}</a>,
}));

describe('NewChangePage', () => {
  const mockApplications = [
    { id: 'app-1', name: 'Web Portal' },
    { id: 'app-2', name: 'Mobile App' },
  ];

  const mockUsers = [
    { id: 'user-1', name: 'John Doe', email: 'john@example.com' },
    { id: 'user-2', name: 'Jane Smith', email: 'jane@example.com' },
  ];

  const mockGroups = [
    { id: 'group-1', name: 'Development Team' },
    { id: 'group-2', name: 'Infrastructure Team' },
  ];

  let mockUseCreateChange: ReturnType<typeof vi.fn>;
  let mockUseApplications: ReturnType<typeof vi.fn>;
  let mockUseUsers: ReturnType<typeof vi.fn>;
  let mockUseGroups: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams.get.mockReturnValue(null);

    mockUseCreateChange = vi.fn(() => ({
      mutateAsync: vi.fn(),
      isPending: false,
    }));

    mockUseApplications = vi.fn(() => ({
      data: { data: mockApplications },
      isLoading: false,
    }));

    mockUseUsers = vi.fn(() => ({
      data: { data: mockUsers },
      isLoading: false,
    }));

    mockUseGroups = vi.fn(() => ({
      data: { data: mockGroups },
      isLoading: false,
    }));

    vi.spyOn(useApiHooks, 'useCreateChange').mockImplementation(mockUseCreateChange);
    vi.spyOn(useApiHooks, 'useApplications').mockImplementation(mockUseApplications);
    vi.spyOn(useApiHooks, 'useUsers').mockImplementation(mockUseUsers);
    vi.spyOn(useApiHooks, 'useGroups').mockImplementation(mockUseGroups);
  });

  describe('Basic Rendering', () => {
    it('renders page title and description', () => {
      render(<NewChangePage />);

      expect(screen.getByText('Create Change Request')).toBeInTheDocument();
      expect(screen.getByText('Submit a new change request for approval')).toBeInTheDocument();
    });

    it('renders back button', () => {
      render(<NewChangePage />);

      const backButton = screen.getByRole('button', { name: '' });
      expect(backButton).toBeInTheDocument();
    });

    it('renders all form sections', () => {
      render(<NewChangePage />);

      expect(screen.getByText('Change Details')).toBeInTheDocument();
      expect(screen.getByText('Classification')).toBeInTheDocument();
      expect(screen.getByText('Schedule')).toBeInTheDocument();
      expect(screen.getByText('Assignment')).toBeInTheDocument();
      expect(screen.getByText('Implementation Plans')).toBeInTheDocument();
    });

    it('renders all required form fields', () => {
      render(<NewChangePage />);

      expect(screen.getByLabelText(/Title/)).toBeInTheDocument();
      expect(screen.getByLabelText(/Description/)).toBeInTheDocument();
      expect(screen.getByLabelText(/Planned Start/)).toBeInTheDocument();
      expect(screen.getByLabelText(/Planned End/)).toBeInTheDocument();
      expect(screen.getByLabelText(/Rollback Plan/)).toBeInTheDocument();
    });

    it('renders form action buttons', () => {
      render(<NewChangePage />);

      expect(screen.getByRole('button', { name: /Cancel/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Submit for Approval/i })).toBeInTheDocument();
    });
  });

  describe('Form Fields', () => {
    it('renders change type selector with all options', () => {
      render(<NewChangePage />);

      const typeSelect = screen.getByLabelText(/Change Type/i);
      expect(typeSelect).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /Standard/ })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /Normal/ })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /Emergency/ })).toBeInTheDocument();
    });

    it('renders risk level selector with all options', () => {
      render(<NewChangePage />);

      const riskSelect = screen.getByLabelText(/Risk Level/i);
      expect(riskSelect).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Low' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Medium' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'High' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Critical' })).toBeInTheDocument();
    });

    it('renders impact selector with all options', () => {
      render(<NewChangePage />);

      const impactSelect = screen.getByLabelText(/Impact/i);
      expect(impactSelect).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'None' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Minor' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Moderate' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Significant' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Major' })).toBeInTheDocument();
    });

    it('renders application selector with loaded applications', () => {
      render(<NewChangePage />);

      const appSelect = screen.getByLabelText(/Application/i);
      expect(appSelect).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /Web Portal/ })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /Mobile App/ })).toBeInTheDocument();
    });

    it('renders assignment group selector with loaded groups', () => {
      render(<NewChangePage />);

      const groupSelect = screen.getByLabelText(/Assignment Group/i);
      expect(groupSelect).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /Development Team/ })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /Infrastructure Team/ })).toBeInTheDocument();
    });

    it('renders optional text fields', () => {
      render(<NewChangePage />);

      expect(screen.getByLabelText(/Business Justification/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Implementation Plan/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Test Plan/i)).toBeInTheDocument();
    });
  });

  describe('Form Interaction', () => {
    it('updates title field on input', () => {
      render(<NewChangePage />);

      const titleInput = screen.getByLabelText(/Title/);
      fireEvent.change(titleInput, { target: { value: 'Update database schema' } });

      expect(titleInput).toHaveValue('Update database schema');
    });

    it('updates description field on input', () => {
      render(<NewChangePage />);

      const descInput = screen.getByLabelText(/Description/);
      fireEvent.change(descInput, { target: { value: 'Detailed description' } });

      expect(descInput).toHaveValue('Detailed description');
    });

    it('updates change type on selection', () => {
      render(<NewChangePage />);

      const typeSelect = screen.getByLabelText(/Change Type/i);
      fireEvent.change(typeSelect, { target: { value: 'emergency' } });

      expect(typeSelect).toHaveValue('emergency');
    });

    it('updates risk level on selection', () => {
      render(<NewChangePage />);

      const riskSelect = screen.getByLabelText(/Risk Level/i);
      fireEvent.change(riskSelect, { target: { value: 'high' } });

      expect(riskSelect).toHaveValue('high');
    });

    it('updates impact on selection', () => {
      render(<NewChangePage />);

      const impactSelect = screen.getByLabelText(/Impact/i);
      fireEvent.change(impactSelect, { target: { value: 'major' } });

      expect(impactSelect).toHaveValue('major');
    });
  });

  describe('Form Submission', () => {
    const fillValidForm = () => {
      const titleInput = screen.getByLabelText(/Title/);
      const descInput = screen.getByLabelText(/Description/);
      const startInput = screen.getByLabelText(/Planned Start/);
      const endInput = screen.getByLabelText(/Planned End/);
      const rollbackInput = screen.getByLabelText(/Rollback Plan/);

      fireEvent.change(titleInput, { target: { value: 'Update database schema' } });
      fireEvent.change(descInput, { target: { value: 'Migrate user table to new schema' } });
      fireEvent.change(startInput, { target: { value: '2026-01-15T14:00' } });
      fireEvent.change(endInput, { target: { value: '2026-01-15T16:00' } });
      fireEvent.change(rollbackInput, { target: { value: 'Restore from backup' } });
    };

    it('submits form with valid data', async () => {
      const mockMutate = vi.fn().mockResolvedValue({});
      mockUseCreateChange.mockReturnValue({
        mutateAsync: mockMutate,
        isPending: false,
      });

      render(<NewChangePage />);
      fillValidForm();

      const submitButton = screen.getByRole('button', { name: /Submit for Approval/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockMutate).toHaveBeenCalled();
      });
    });

    it('redirects to changes page on successful submission', async () => {
      const mockMutate = vi.fn().mockResolvedValue({});
      mockUseCreateChange.mockReturnValue({
        mutateAsync: mockMutate,
        isPending: false,
      });

      render(<NewChangePage />);
      fillValidForm();

      const submitButton = screen.getByRole('button', { name: /Submit for Approval/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/changes');
      });
    });

    it('displays error message on submission failure', async () => {
      const mockMutate = vi.fn().mockRejectedValue(new Error('Network error'));
      mockUseCreateChange.mockReturnValue({
        mutateAsync: mockMutate,
        isPending: false,
      });

      render(<NewChangePage />);
      fillValidForm();

      const submitButton = screen.getByRole('button', { name: /Submit for Approval/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument();
      });
    });

    it('shows loading state during submission', () => {
      mockUseCreateChange.mockReturnValue({
        mutateAsync: vi.fn(),
        isPending: true,
      });

      render(<NewChangePage />);

      const submitButton = screen.getByRole('button', { name: /Submit for Approval/i });
      expect(submitButton).toBeInTheDocument();
    });

    it('includes all form data in submission', async () => {
      const mockMutate = vi.fn().mockResolvedValue({});
      mockUseCreateChange.mockReturnValue({
        mutateAsync: mockMutate,
        isPending: false,
      });

      render(<NewChangePage />);
      fillValidForm();

      const typeSelect = screen.getByLabelText(/Change Type/i);
      const riskSelect = screen.getByLabelText(/Risk Level/i);
      const impactSelect = screen.getByLabelText(/Impact/i);

      fireEvent.change(typeSelect, { target: { value: 'emergency' } });
      fireEvent.change(riskSelect, { target: { value: 'high' } });
      fireEvent.change(impactSelect, { target: { value: 'major' } });

      const submitButton = screen.getByRole('button', { name: /Submit for Approval/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockMutate).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'Update database schema',
            description: 'Migrate user table to new schema',
            type: 'emergency',
            riskLevel: 'high',
            impact: 'major',
            rollbackPlan: 'Restore from backup',
          })
        );
      });
    });
  });

  describe('Navigation', () => {
    it('back button calls router.back()', () => {
      render(<NewChangePage />);

      const backButtons = screen.getAllByRole('button');
      const backButton = backButtons[0]; // First button is the back arrow

      fireEvent.click(backButton);

      expect(mockBack).toHaveBeenCalled();
    });

    it('cancel button links to changes page', () => {
      render(<NewChangePage />);

      const cancelButton = screen.getByRole('link', { name: /Cancel/i });
      expect(cancelButton).toHaveAttribute('href', '/changes');
    });
  });

  describe('URL Parameters', () => {
    it('pre-selects application from URL parameter', () => {
      mockSearchParams.get.mockReturnValue('app-1');

      render(<NewChangePage />);

      const appSelect = screen.getByLabelText(/Application/i) as HTMLSelectElement;
      expect(appSelect.value).toBe('app-1');
    });

    it('does not pre-select application when parameter is missing', () => {
      mockSearchParams.get.mockReturnValue(null);

      render(<NewChangePage />);

      const appSelect = screen.getByLabelText(/Application/i) as HTMLSelectElement;
      expect(appSelect.value).toBe('');
    });
  });

  describe('Loading States', () => {
    it('handles empty applications list', () => {
      mockUseApplications.mockReturnValue({
        data: { data: [] },
        isLoading: false,
      });

      render(<NewChangePage />);

      const appSelect = screen.getByLabelText(/Application/i);
      const options = appSelect.querySelectorAll('option');
      expect(options.length).toBe(1); // Only the "Select an application" option
    });

    it('handles empty groups list', () => {
      mockUseGroups.mockReturnValue({
        data: { data: [] },
        isLoading: false,
      });

      render(<NewChangePage />);

      const groupSelect = screen.getByLabelText(/Assignment Group/i);
      const options = groupSelect.querySelectorAll('option');
      expect(options.length).toBe(1); // Only the "Select a group" option
    });

    it('handles undefined data from API', () => {
      mockUseApplications.mockReturnValue({
        data: undefined,
        isLoading: false,
      });

      mockUseUsers.mockReturnValue({
        data: undefined,
        isLoading: false,
      });

      mockUseGroups.mockReturnValue({
        data: undefined,
        isLoading: false,
      });

      render(<NewChangePage />);

      expect(screen.getByLabelText(/Application/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Assignment Group/i)).toBeInTheDocument();
    });
  });
});
