import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import NewProblemPage from '../page';
import * as useApiHooks from '@/hooks/useApi';

// Mock Next.js navigation
const mockPush = vi.fn();
const mockBack = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    back: mockBack,
  }),
}));

// Mock Next.js Link
vi.mock('next/link', () => ({
  default: ({ children, href }: any) => <a href={href}>{children}</a>,
}));

describe('NewProblemPage', () => {
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

  let mockUseCreateProblem: ReturnType<typeof vi.fn>;
  let mockUseApplications: ReturnType<typeof vi.fn>;
  let mockUseUsers: ReturnType<typeof vi.fn>;
  let mockUseGroups: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockUseCreateProblem = vi.fn(() => ({
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

    vi.spyOn(useApiHooks, 'useCreateProblem').mockImplementation(mockUseCreateProblem);
    vi.spyOn(useApiHooks, 'useApplications').mockImplementation(mockUseApplications);
    vi.spyOn(useApiHooks, 'useUsers').mockImplementation(mockUseUsers);
    vi.spyOn(useApiHooks, 'useGroups').mockImplementation(mockUseGroups);
  });

  describe('Basic Rendering', () => {
    it('renders page title and description', () => {
      render(<NewProblemPage />);

      expect(screen.getByText('Create New Problem')).toBeInTheDocument();
      expect(screen.getByText('Initiate root cause analysis for recurring or significant issues')).toBeInTheDocument();
    });

    it('renders back button', () => {
      render(<NewProblemPage />);

      const backButton = screen.getByRole('button', { name: '' });
      expect(backButton).toBeInTheDocument();
    });

    it('renders all form sections', () => {
      render(<NewProblemPage />);

      expect(screen.getByText('Problem Details')).toBeInTheDocument();
      expect(screen.getByText('Priority & Impact')).toBeInTheDocument();
      expect(screen.getByText('Assignment')).toBeInTheDocument();
    });
  });

  describe('Form Fields', () => {
    it('renders title input field', () => {
      render(<NewProblemPage />);

      expect(screen.getByLabelText(/title/i)).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Brief summary of the problem')).toBeInTheDocument();
    });

    it('renders description textarea', () => {
      render(<NewProblemPage />);

      expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/detailed description of the problem/i)).toBeInTheDocument();
    });

    it('renders problem type select with options', () => {
      render(<NewProblemPage />);

      const select = screen.getByLabelText(/problem type/i);
      expect(select).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /reactive \(from incident\)/i })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /proactive \(trend analysis\)/i })).toBeInTheDocument();
    });

    it('renders application select with options', () => {
      render(<NewProblemPage />);

      const select = screen.getByLabelText(/application/i);
      expect(select).toBeInTheDocument();
      expect(screen.getByText('Select an application (optional)')).toBeInTheDocument();
      expect(screen.getByText('Web Portal')).toBeInTheDocument();
      expect(screen.getByText('Mobile App')).toBeInTheDocument();
    });

    it('renders priority select with all options', () => {
      render(<NewProblemPage />);

      const select = screen.getByLabelText(/^priority$/i) as HTMLSelectElement;
      expect(select).toBeInTheDocument();
      const options = Array.from(select.options).map(opt => opt.text);
      expect(options).toContain('Critical');
      expect(options).toContain('High');
      expect(options).toContain('Medium');
      expect(options).toContain('Low');
    });

    it('renders urgency select with all options', () => {
      render(<NewProblemPage />);

      const select = screen.getByLabelText(/urgency/i) as HTMLSelectElement;
      expect(select).toBeInTheDocument();
      const options = Array.from(select.options).map(opt => opt.text);
      expect(options).toContain('Immediate');
      expect(options).toContain('High');
      expect(options).toContain('Medium');
      expect(options).toContain('Low');
    });

    it('renders impact select with all options', () => {
      render(<NewProblemPage />);

      const select = screen.getByLabelText(/impact/i);
      expect(select).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Widespread' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Significant' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Moderate' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Minor' })).toBeInTheDocument();
    });

    it('renders assignment group select with options', () => {
      render(<NewProblemPage />);

      const select = screen.getByLabelText(/assignment group/i);
      expect(select).toBeInTheDocument();
      expect(screen.getByText('Select a group (optional)')).toBeInTheDocument();
      expect(screen.getByText('Support Team')).toBeInTheDocument();
      expect(screen.getByText('Infrastructure Team')).toBeInTheDocument();
    });

    it('renders assigned to select with options', () => {
      render(<NewProblemPage />);

      const select = screen.getByLabelText(/assigned to/i);
      expect(select).toBeInTheDocument();
      expect(screen.getByText('Select a user (optional)')).toBeInTheDocument();
      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.getByText('Jane Smith')).toBeInTheDocument();
    });
  });

  describe('Form Interactions', () => {
    it('allows typing in title field', () => {
      render(<NewProblemPage />);

      const titleInput = screen.getByLabelText(/title/i);
      fireEvent.change(titleInput, { target: { value: 'Recurring login failures' } });
      expect(titleInput).toHaveValue('Recurring login failures');
    });

    it('allows typing in description field', () => {
      render(<NewProblemPage />);

      const descriptionInput = screen.getByLabelText(/description/i);
      fireEvent.change(descriptionInput, { target: { value: 'Multiple users reporting authentication issues' } });
      expect(descriptionInput).toHaveValue('Multiple users reporting authentication issues');
    });

    it('allows selecting problem type', () => {
      render(<NewProblemPage />);

      const select = screen.getByLabelText(/problem type/i);
      fireEvent.change(select, { target: { value: 'proactive' } });
      expect(select).toHaveValue('proactive');
    });

    it('allows selecting an application', () => {
      render(<NewProblemPage />);

      const select = screen.getByLabelText(/application/i);
      fireEvent.change(select, { target: { value: 'app-1' } });
      expect(select).toHaveValue('app-1');
    });

    it('allows changing priority', () => {
      render(<NewProblemPage />);

      const select = screen.getByLabelText(/^priority$/i);
      fireEvent.change(select, { target: { value: 'critical' } });
      expect(select).toHaveValue('critical');
    });

    it('allows changing urgency', () => {
      render(<NewProblemPage />);

      const select = screen.getByLabelText(/urgency/i);
      fireEvent.change(select, { target: { value: 'immediate' } });
      expect(select).toHaveValue('immediate');
    });

    it('allows changing impact', () => {
      render(<NewProblemPage />);

      const select = screen.getByLabelText(/impact/i);
      fireEvent.change(select, { target: { value: 'widespread' } });
      expect(select).toHaveValue('widespread');
    });

    it('allows selecting assignment group', () => {
      render(<NewProblemPage />);

      const select = screen.getByLabelText(/assignment group/i);
      fireEvent.change(select, { target: { value: 'group-1' } });
      expect(select).toHaveValue('group-1');
    });

    it('allows selecting assigned to user', () => {
      render(<NewProblemPage />);

      const select = screen.getByLabelText(/assigned to/i);
      fireEvent.change(select, { target: { value: 'user-1' } });
      expect(select).toHaveValue('user-1');
    });
  });

  describe('Form Validation', () => {
    it('shows error when title is empty', async () => {
      render(<NewProblemPage />);

      const form = screen.getByRole('button', { name: /create problem/i }).closest('form');
      fireEvent.submit(form!);

      await waitFor(() => {
        expect(screen.getByText('Title is required')).toBeInTheDocument();
      });
    });

    it('shows error when title is too short', async () => {
      render(<NewProblemPage />);

      const titleInput = screen.getByLabelText(/title/i);
      fireEvent.change(titleInput, { target: { value: 'Bad' } });

      const form = screen.getByRole('button', { name: /create problem/i }).closest('form');
      fireEvent.submit(form!);

      await waitFor(() => {
        expect(screen.getByText('Title must be at least 5 characters')).toBeInTheDocument();
      });
    });

    it('shows error when description is empty', async () => {
      render(<NewProblemPage />);

      const titleInput = screen.getByLabelText(/title/i);
      fireEvent.change(titleInput, { target: { value: 'Valid title' } });

      const form = screen.getByRole('button', { name: /create problem/i }).closest('form');
      fireEvent.submit(form!);

      await waitFor(() => {
        expect(screen.getByText('Description is required')).toBeInTheDocument();
      });
    });

    it('shows error when description is too short', async () => {
      render(<NewProblemPage />);

      const titleInput = screen.getByLabelText(/title/i);
      fireEvent.change(titleInput, { target: { value: 'Valid title' } });

      const descriptionInput = screen.getByLabelText(/description/i);
      fireEvent.change(descriptionInput, { target: { value: 'Short' } });

      const submitButton = screen.getByRole('button', { name: /create problem/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Description must be at least 10 characters')).toBeInTheDocument();
      });
    });

    it('clears validation error when user corrects title', async () => {
      render(<NewProblemPage />);

      const form = screen.getByRole('button', { name: /create problem/i }).closest('form');
      fireEvent.submit(form!);

      await waitFor(() => {
        expect(screen.getByText('Title is required')).toBeInTheDocument();
      });

      const titleInput = screen.getByLabelText(/title/i);
      fireEvent.change(titleInput, { target: { value: 'Valid title' } });

      expect(screen.queryByText('Title is required')).not.toBeInTheDocument();
    });

    it('clears validation error when user corrects description', async () => {
      render(<NewProblemPage />);

      const titleInput = screen.getByLabelText(/title/i);
      fireEvent.change(titleInput, { target: { value: 'Valid title' } });

      const form = screen.getByRole('button', { name: /create problem/i }).closest('form');
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
    it('calls createProblem with correct data on valid submission', async () => {
      const mockMutateAsync = vi.fn().mockResolvedValue({});
      mockUseCreateProblem.mockReturnValue({
        mutateAsync: mockMutateAsync,
        isPending: false,
      });

      render(<NewProblemPage />);

      fireEvent.change(screen.getByLabelText(/title/i), {
        target: { value: 'Critical recurring issue' },
      });
      fireEvent.change(screen.getByLabelText(/description/i), {
        target: { value: 'Multiple incidents related to database connectivity failures' },
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

      const submitButton = screen.getByRole('button', { name: /create problem/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalledWith({
          title: 'Critical recurring issue',
          description: 'Multiple incidents related to database connectivity failures',
          priority: 'critical',
          urgency: 'immediate',
          impact: 'widespread',
          problemType: 'reactive',
          applicationId: undefined,
          assignedTo: undefined,
          assignedGroup: undefined,
        });
      });
    });

    it('includes optional problem type when changed', async () => {
      const mockMutateAsync = vi.fn().mockResolvedValue({});
      mockUseCreateProblem.mockReturnValue({
        mutateAsync: mockMutateAsync,
        isPending: false,
      });

      render(<NewProblemPage />);

      fireEvent.change(screen.getByLabelText(/title/i), {
        target: { value: 'Proactive analysis' },
      });
      fireEvent.change(screen.getByLabelText(/description/i), {
        target: { value: 'Trend analysis shows increasing errors' },
      });
      fireEvent.change(screen.getByLabelText(/problem type/i), {
        target: { value: 'proactive' },
      });

      const submitButton = screen.getByRole('button', { name: /create problem/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalledWith(
          expect.objectContaining({
            problemType: 'proactive',
          })
        );
      });
    });

    it('includes optional application when selected', async () => {
      const mockMutateAsync = vi.fn().mockResolvedValue({});
      mockUseCreateProblem.mockReturnValue({
        mutateAsync: mockMutateAsync,
        isPending: false,
      });

      render(<NewProblemPage />);

      fireEvent.change(screen.getByLabelText(/title/i), {
        target: { value: 'Application error' },
      });
      fireEvent.change(screen.getByLabelText(/description/i), {
        target: { value: 'Multiple error reports for specific application' },
      });
      fireEvent.change(screen.getByLabelText(/application/i), {
        target: { value: 'app-1' },
      });

      const submitButton = screen.getByRole('button', { name: /create problem/i });
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
      mockUseCreateProblem.mockReturnValue({
        mutateAsync: mockMutateAsync,
        isPending: false,
      });

      render(<NewProblemPage />);

      fireEvent.change(screen.getByLabelText(/title/i), {
        target: { value: 'Network problem' },
      });
      fireEvent.change(screen.getByLabelText(/description/i), {
        target: { value: 'Recurring network connectivity issues' },
      });
      fireEvent.change(screen.getByLabelText(/assignment group/i), {
        target: { value: 'group-2' },
      });
      fireEvent.change(screen.getByLabelText(/assigned to/i), {
        target: { value: 'user-2' },
      });

      const submitButton = screen.getByRole('button', { name: /create problem/i });
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

    it('redirects to problems page after successful submission', async () => {
      const mockMutateAsync = vi.fn().mockResolvedValue({});
      mockUseCreateProblem.mockReturnValue({
        mutateAsync: mockMutateAsync,
        isPending: false,
      });

      render(<NewProblemPage />);

      fireEvent.change(screen.getByLabelText(/title/i), {
        target: { value: 'New problem title' },
      });
      fireEvent.change(screen.getByLabelText(/description/i), {
        target: { value: 'Detailed description of the problem' },
      });

      const submitButton = screen.getByRole('button', { name: /create problem/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/problems');
      });
    });

    it('displays error message on submission failure', async () => {
      const mockMutateAsync = vi.fn().mockRejectedValue(new Error('Failed to create problem'));
      mockUseCreateProblem.mockReturnValue({
        mutateAsync: mockMutateAsync,
        isPending: false,
      });

      render(<NewProblemPage />);

      fireEvent.change(screen.getByLabelText(/title/i), {
        target: { value: 'New problem title' },
      });
      fireEvent.change(screen.getByLabelText(/description/i), {
        target: { value: 'Detailed description' },
      });

      const submitButton = screen.getByRole('button', { name: /create problem/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Failed to create problem')).toBeInTheDocument();
      });
    });

    it('displays generic error message on non-Error failure', async () => {
      const mockMutateAsync = vi.fn().mockRejectedValue('Unknown error');
      mockUseCreateProblem.mockReturnValue({
        mutateAsync: mockMutateAsync,
        isPending: false,
      });

      render(<NewProblemPage />);

      fireEvent.change(screen.getByLabelText(/title/i), {
        target: { value: 'New problem title' },
      });
      fireEvent.change(screen.getByLabelText(/description/i), {
        target: { value: 'Detailed description' },
      });

      const submitButton = screen.getByRole('button', { name: /create problem/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Failed to create problem. Please try again.')).toBeInTheDocument();
      });
    });

    it('does not submit form if validation fails', async () => {
      const mockMutateAsync = vi.fn();
      mockUseCreateProblem.mockReturnValue({
        mutateAsync: mockMutateAsync,
        isPending: false,
      });

      render(<NewProblemPage />);

      const form = screen.getByRole('button', { name: /create problem/i }).closest('form');
      fireEvent.submit(form!);

      await waitFor(() => {
        expect(screen.getByText('Title is required')).toBeInTheDocument();
      });

      expect(mockMutateAsync).not.toHaveBeenCalled();
    });
  });

  describe('Back Button', () => {
    it('calls router.back when back button is clicked', () => {
      render(<NewProblemPage />);

      const backButton = screen.getByRole('button', { name: '' });
      fireEvent.click(backButton);

      expect(mockBack).toHaveBeenCalled();
    });
  });

  describe('Cancel Button', () => {
    it('renders cancel button with link to problems page', () => {
      render(<NewProblemPage />);

      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      expect(cancelButton).toBeInTheDocument();
      expect(cancelButton.closest('a')).toHaveAttribute('href', '/problems');
    });
  });

  describe('Loading States', () => {
    it('shows loading state on submit button when creating problem', () => {
      mockUseCreateProblem.mockReturnValue({
        mutateAsync: vi.fn(),
        isPending: true,
      });

      render(<NewProblemPage />);

      const submitButton = screen.getByRole('button', { name: /create problem/i });
      expect(submitButton).toBeInTheDocument();
    });
  });

  describe('Default Values', () => {
    it('defaults priority to medium', () => {
      render(<NewProblemPage />);

      const select = screen.getByLabelText(/^priority$/i);
      expect(select).toHaveValue('medium');
    });

    it('defaults urgency to medium', () => {
      render(<NewProblemPage />);

      const select = screen.getByLabelText(/urgency/i);
      expect(select).toHaveValue('medium');
    });

    it('defaults impact to moderate', () => {
      render(<NewProblemPage />);

      const select = screen.getByLabelText(/impact/i);
      expect(select).toHaveValue('moderate');
    });

    it('defaults problem type to reactive', () => {
      render(<NewProblemPage />);

      const select = screen.getByLabelText(/problem type/i);
      expect(select).toHaveValue('reactive');
    });
  });
});
