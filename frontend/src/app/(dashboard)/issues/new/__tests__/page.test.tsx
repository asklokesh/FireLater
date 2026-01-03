import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import NewIssuePage from '../page';
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

describe('NewIssuePage', () => {
  const mockApplications = [
    { id: 'app-1', name: 'Web Portal' },
    { id: 'app-2', name: 'Mobile App' },
  ];

  const mockUsers = [
    { id: 'user-1', name: 'John Doe', email: 'john@example.com' },
    { id: 'user-2', name: 'Jane Smith', email: 'jane@example.com' },
  ];

  const mockGroups = [
    { id: 'group-1', name: 'Support Team' },
    { id: 'group-2', name: 'Infrastructure Team' },
  ];

  let mockUseCreateIssue: ReturnType<typeof vi.fn>;
  let mockUseApplications: ReturnType<typeof vi.fn>;
  let mockUseUsers: ReturnType<typeof vi.fn>;
  let mockUseGroups: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams.get.mockReturnValue(null);

    mockUseCreateIssue = vi.fn(() => ({
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

    vi.spyOn(useApiHooks, 'useCreateIssue').mockImplementation(mockUseCreateIssue);
    vi.spyOn(useApiHooks, 'useApplications').mockImplementation(mockUseApplications);
    vi.spyOn(useApiHooks, 'useUsers').mockImplementation(mockUseUsers);
    vi.spyOn(useApiHooks, 'useGroups').mockImplementation(mockUseGroups);
  });

  describe('Basic Rendering', () => {
    it('renders page title and description', () => {
      render(<NewIssuePage />);

      expect(screen.getByText('Create New Issue')).toBeInTheDocument();
      expect(screen.getByText('Report a new IT incident or problem')).toBeInTheDocument();
    });

    it('renders back button', () => {
      render(<NewIssuePage />);

      const backButton = screen.getByRole('button', { name: '' });
      expect(backButton).toBeInTheDocument();
    });

    it('renders all form sections', () => {
      render(<NewIssuePage />);

      expect(screen.getByText('Issue Details')).toBeInTheDocument();
      expect(screen.getByText('Priority & Impact')).toBeInTheDocument();
      expect(screen.getByText('Assignment')).toBeInTheDocument();
    });
  });

  describe('Form Fields', () => {
    it('renders title input field', () => {
      render(<NewIssuePage />);

      expect(screen.getByLabelText(/title/i)).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Brief summary of the issue')).toBeInTheDocument();
    });

    it('renders description textarea', () => {
      render(<NewIssuePage />);

      expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/detailed description/i)).toBeInTheDocument();
    });

    it('renders application select with options', () => {
      render(<NewIssuePage />);

      const select = screen.getByLabelText(/application/i);
      expect(select).toBeInTheDocument();
      expect(screen.getByText('Select an application (optional)')).toBeInTheDocument();
      expect(screen.getByText('Web Portal')).toBeInTheDocument();
      expect(screen.getByText('Mobile App')).toBeInTheDocument();
    });

    it('renders priority select with all options', () => {
      render(<NewIssuePage />);

      const select = screen.getByLabelText(/^priority$/i) as HTMLSelectElement;
      expect(select).toBeInTheDocument();
      const options = Array.from(select.options).map(opt => opt.text);
      expect(options).toContain('Critical');
      expect(options).toContain('High');
      expect(options).toContain('Medium');
      expect(options).toContain('Low');
    });

    it('renders urgency select with all options', () => {
      render(<NewIssuePage />);

      const select = screen.getByLabelText(/urgency/i);
      expect(select).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Immediate' })).toBeInTheDocument();
    });

    it('renders impact select with all options', () => {
      render(<NewIssuePage />);

      const select = screen.getByLabelText(/impact/i);
      expect(select).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Widespread' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Significant' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Moderate' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Minor' })).toBeInTheDocument();
    });

    it('renders assignment group select with options', () => {
      render(<NewIssuePage />);

      const select = screen.getByLabelText(/assignment group/i);
      expect(select).toBeInTheDocument();
      expect(screen.getByText('Select a group (optional)')).toBeInTheDocument();
      expect(screen.getByText('Support Team')).toBeInTheDocument();
      expect(screen.getByText('Infrastructure Team')).toBeInTheDocument();
    });

    it('renders assigned to select with options', () => {
      render(<NewIssuePage />);

      const select = screen.getByLabelText(/assigned to/i);
      expect(select).toBeInTheDocument();
      expect(screen.getByText('Select a user (optional)')).toBeInTheDocument();
      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.getByText('Jane Smith')).toBeInTheDocument();
    });
  });

  describe('Form Interactions', () => {
    it('allows typing in title field', () => {
      render(<NewIssuePage />);

      const titleInput = screen.getByLabelText(/title/i);
      fireEvent.change(titleInput, { target: { value: 'System outage' } });
      expect(titleInput).toHaveValue('System outage');
    });

    it('allows typing in description field', () => {
      render(<NewIssuePage />);

      const descriptionInput = screen.getByLabelText(/description/i);
      fireEvent.change(descriptionInput, { target: { value: 'Users cannot access the system' } });
      expect(descriptionInput).toHaveValue('Users cannot access the system');
    });

    it('allows selecting an application', () => {
      render(<NewIssuePage />);

      const select = screen.getByLabelText(/application/i);
      fireEvent.change(select, { target: { value: 'app-1' } });
      expect(select).toHaveValue('app-1');
    });

    it('allows changing priority', () => {
      render(<NewIssuePage />);

      const select = screen.getByLabelText(/^priority$/i);
      fireEvent.change(select, { target: { value: 'critical' } });
      expect(select).toHaveValue('critical');
    });

    it('allows changing urgency', () => {
      render(<NewIssuePage />);

      const select = screen.getByLabelText(/urgency/i);
      fireEvent.change(select, { target: { value: 'immediate' } });
      expect(select).toHaveValue('immediate');
    });

    it('allows changing impact', () => {
      render(<NewIssuePage />);

      const select = screen.getByLabelText(/impact/i);
      fireEvent.change(select, { target: { value: 'widespread' } });
      expect(select).toHaveValue('widespread');
    });

    it('allows selecting assignment group', () => {
      render(<NewIssuePage />);

      const select = screen.getByLabelText(/assignment group/i);
      fireEvent.change(select, { target: { value: 'group-1' } });
      expect(select).toHaveValue('group-1');
    });

    it('allows selecting assigned to user', () => {
      render(<NewIssuePage />);

      const select = screen.getByLabelText(/assigned to/i);
      fireEvent.change(select, { target: { value: 'user-1' } });
      expect(select).toHaveValue('user-1');
    });
  });

  describe('Form Validation', () => {
    it('shows error when title is empty', async () => {
      render(<NewIssuePage />);

      const form = screen.getByRole('button', { name: /create issue/i }).closest('form');
      fireEvent.submit(form!);

      await waitFor(() => {
        expect(screen.getByText('Title is required')).toBeInTheDocument();
      });
    });

    it('shows error when title is too short', async () => {
      render(<NewIssuePage />);

      const titleInput = screen.getByLabelText(/title/i);
      fireEvent.change(titleInput, { target: { value: 'Bad' } });

      const form = screen.getByRole('button', { name: /create issue/i }).closest('form');
      fireEvent.submit(form!);

      await waitFor(() => {
        expect(screen.getByText('Title must be at least 5 characters')).toBeInTheDocument();
      });
    });

    it('shows error when description is empty', async () => {
      render(<NewIssuePage />);

      const titleInput = screen.getByLabelText(/title/i);
      fireEvent.change(titleInput, { target: { value: 'Valid title' } });

      const form = screen.getByRole('button', { name: /create issue/i }).closest('form');
      fireEvent.submit(form!);

      await waitFor(() => {
        expect(screen.getByText('Description is required')).toBeInTheDocument();
      });
    });

    it('shows error when description is too short', async () => {
      render(<NewIssuePage />);

      const titleInput = screen.getByLabelText(/title/i);
      fireEvent.change(titleInput, { target: { value: 'Valid title' } });

      const descriptionInput = screen.getByLabelText(/description/i);
      fireEvent.change(descriptionInput, { target: { value: 'Short' } });

      const submitButton = screen.getByRole('button', { name: /create issue/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Description must be at least 10 characters')).toBeInTheDocument();
      });
    });

    it('clears validation error when user corrects title', async () => {
      render(<NewIssuePage />);

      const form = screen.getByRole('button', { name: /create issue/i }).closest('form');
      fireEvent.submit(form!);

      await waitFor(() => {
        expect(screen.getByText('Title is required')).toBeInTheDocument();
      });

      const titleInput = screen.getByLabelText(/title/i);
      fireEvent.change(titleInput, { target: { value: 'Valid title' } });

      expect(screen.queryByText('Title is required')).not.toBeInTheDocument();
    });

    it('clears validation error when user corrects description', async () => {
      render(<NewIssuePage />);

      const titleInput = screen.getByLabelText(/title/i);
      fireEvent.change(titleInput, { target: { value: 'Valid title' } });

      const form = screen.getByRole('button', { name: /create issue/i }).closest('form');
      fireEvent.submit(form!);

      await waitFor(() => {
        expect(screen.getByText('Description is required')).toBeInTheDocument();
      });

      const descriptionInput = screen.getByLabelText(/description/i);
      fireEvent.change(descriptionInput, { target: { value: 'This is a valid description' } });

      expect(screen.queryByText('Description is required')).not.toBeInTheDocument();
    });
  });

  describe('Form Submission', () => {
    it('calls createIssue with correct data on valid submission', async () => {
      const mockMutateAsync = vi.fn().mockResolvedValue({});
      mockUseCreateIssue.mockReturnValue({
        mutateAsync: mockMutateAsync,
        isPending: false,
      });

      render(<NewIssuePage />);

      fireEvent.change(screen.getByLabelText(/title/i), {
        target: { value: 'Critical system outage' },
      });
      fireEvent.change(screen.getByLabelText(/description/i), {
        target: { value: 'The production server is down and users cannot access the application' },
      });
      fireEvent.change(screen.getByLabelText(/^priority$/i), {
        target: { value: 'critical' },
      });
      fireEvent.change(screen.getByLabelText(/urgency/i), {
        target: { value: 'immediate' },
      });
      fireEvent.change(screen.getByLabelText(/impact/i), {
        target: { value: 'widespread' },
      });

      const submitButton = screen.getByRole('button', { name: /create issue/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalledWith({
          title: 'Critical system outage',
          description: 'The production server is down and users cannot access the application',
          priority: 'critical',
          urgency: 'immediate',
          impact: 'widespread',
          applicationId: undefined,
          assignedTo: undefined,
          assignedGroup: undefined,
        });
      });
    });

    it('includes optional application when selected', async () => {
      const mockMutateAsync = vi.fn().mockResolvedValue({});
      mockUseCreateIssue.mockReturnValue({
        mutateAsync: mockMutateAsync,
        isPending: false,
      });

      render(<NewIssuePage />);

      fireEvent.change(screen.getByLabelText(/title/i), {
        target: { value: 'Application error' },
      });
      fireEvent.change(screen.getByLabelText(/description/i), {
        target: { value: 'Error occurs when clicking submit button' },
      });
      fireEvent.change(screen.getByLabelText(/application/i), {
        target: { value: 'app-1' },
      });

      const submitButton = screen.getByRole('button', { name: /create issue/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalledWith(
          expect.objectContaining({
            applicationId: 'app-1',
          })
        );
      });
    });

    it('includes assignment when selected', async () => {
      const mockMutateAsync = vi.fn().mockResolvedValue({});
      mockUseCreateIssue.mockReturnValue({
        mutateAsync: mockMutateAsync,
        isPending: false,
      });

      render(<NewIssuePage />);

      fireEvent.change(screen.getByLabelText(/title/i), {
        target: { value: 'Network issue' },
      });
      fireEvent.change(screen.getByLabelText(/description/i), {
        target: { value: 'Cannot connect to internal network' },
      });
      fireEvent.change(screen.getByLabelText(/assignment group/i), {
        target: { value: 'group-2' },
      });
      fireEvent.change(screen.getByLabelText(/assigned to/i), {
        target: { value: 'user-2' },
      });

      const submitButton = screen.getByRole('button', { name: /create issue/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalledWith(
          expect.objectContaining({
            assignedGroup: 'group-2',
            assignedTo: 'user-2',
          })
        );
      });
    });

    it('redirects to issues page after successful submission', async () => {
      const mockMutateAsync = vi.fn().mockResolvedValue({});
      mockUseCreateIssue.mockReturnValue({
        mutateAsync: mockMutateAsync,
        isPending: false,
      });

      render(<NewIssuePage />);

      fireEvent.change(screen.getByLabelText(/title/i), {
        target: { value: 'New issue title' },
      });
      fireEvent.change(screen.getByLabelText(/description/i), {
        target: { value: 'Detailed description of the issue' },
      });

      const submitButton = screen.getByRole('button', { name: /create issue/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/issues');
      });
    });

    it('displays error message on submission failure', async () => {
      const mockMutateAsync = vi.fn().mockRejectedValue(new Error('Failed to create issue'));
      mockUseCreateIssue.mockReturnValue({
        mutateAsync: mockMutateAsync,
        isPending: false,
      });

      render(<NewIssuePage />);

      fireEvent.change(screen.getByLabelText(/title/i), {
        target: { value: 'New issue title' },
      });
      fireEvent.change(screen.getByLabelText(/description/i), {
        target: { value: 'Detailed description' },
      });

      const submitButton = screen.getByRole('button', { name: /create issue/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Failed to create issue')).toBeInTheDocument();
      });
    });

    it('does not submit form if validation fails', async () => {
      const mockMutateAsync = vi.fn();
      mockUseCreateIssue.mockReturnValue({
        mutateAsync: mockMutateAsync,
        isPending: false,
      });

      render(<NewIssuePage />);

      const form = screen.getByRole('button', { name: /create issue/i }).closest('form');
      fireEvent.submit(form!);

      await waitFor(() => {
        expect(screen.getByText('Title is required')).toBeInTheDocument();
      });

      expect(mockMutateAsync).not.toHaveBeenCalled();
    });
  });

  describe('Back Button', () => {
    it('calls router.back when back button is clicked', () => {
      render(<NewIssuePage />);

      const backButton = screen.getByRole('button', { name: '' });
      fireEvent.click(backButton);

      expect(mockBack).toHaveBeenCalled();
    });
  });

  describe('Cancel Button', () => {
    it('renders cancel button with link to issues page', () => {
      render(<NewIssuePage />);

      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      expect(cancelButton).toBeInTheDocument();
      expect(cancelButton.closest('a')).toHaveAttribute('href', '/issues');
    });
  });

  describe('Loading States', () => {
    it('shows loading state on submit button when creating issue', () => {
      mockUseCreateIssue.mockReturnValue({
        mutateAsync: vi.fn(),
        isPending: true,
      });

      render(<NewIssuePage />);

      const submitButton = screen.getByRole('button', { name: /create issue/i });
      expect(submitButton).toBeInTheDocument();
    });
  });

  describe('Query Parameter Handling', () => {
    it('pre-selects application when provided via query param', () => {
      mockSearchParams.get.mockReturnValue('app-2');

      render(<NewIssuePage />);

      const select = screen.getByLabelText(/application/i);
      expect(select).toHaveValue('app-2');
    });
  });

  describe('Default Values', () => {
    it('defaults priority to medium', () => {
      render(<NewIssuePage />);

      const select = screen.getByLabelText(/^priority$/i);
      expect(select).toHaveValue('medium');
    });

    it('defaults urgency to medium', () => {
      render(<NewIssuePage />);

      const select = screen.getByLabelText(/urgency/i);
      expect(select).toHaveValue('medium');
    });

    it('defaults impact to moderate', () => {
      render(<NewIssuePage />);

      const select = screen.getByLabelText(/impact/i);
      expect(select).toHaveValue('moderate');
    });
  });
});
