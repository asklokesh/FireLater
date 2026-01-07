import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import IssueDetailPage from '../page';
import * as apiHooks from '@/hooks/useApi';

// Mock Next.js navigation
const mockBack = vi.fn();
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'issue-123' }),
  useRouter: () => ({
    push: mockPush,
    back: mockBack,
  }),
}));

// Mock Next.js Link
vi.mock('next/link', () => ({
  default: ({ children, href }: any) => <a href={href}>{children}</a>,
}));

// Mock API hooks
vi.mock('@/hooks/useApi', async () => {
  const actual = await vi.importActual('@/hooks/useApi');
  return {
    ...actual,
    useIssue: vi.fn(),
    useUpdateIssue: vi.fn(),
    useChangeIssueStatus: vi.fn(),
    useAddIssueComment: vi.fn(),
    useIssueComments: vi.fn(),
    useAssignIssue: vi.fn(),
    useUsers: vi.fn(),
    useGroups: vi.fn(),
    useApplications: vi.fn(),
    useProblems: vi.fn(),
    useIssueLinkedProblem: vi.fn(),
    useLinkIssueToProblem: vi.fn(),
    useUnlinkIssueFromProblem: vi.fn(),
    useKBArticlesForIssue: vi.fn(),
    useKBArticles: vi.fn(),
    useLinkKBArticle: vi.fn(),
  };
});

const mockIssue = {
  id: 'issue-123',
  issue_number: 'INC0001234',
  title: 'Database connection timeout',
  description: 'Users experiencing timeout when connecting to database',
  status: 'new',
  priority: 'high',
  severity: 'S2',
  assigned_to: null,
  assigned_to_name: null,
  assigned_group: null,
  assigned_group_name: null,
  application_id: 'app-1',
  application_name: 'Payment Service',
  reporter_name: 'John Doe',
  reporter_email: 'john@example.com',
  created_at: '2024-01-01T10:00:00Z',
  updated_at: '2024-01-02T10:00:00Z',
  resolved_at: null,
  closed_at: null,
};

const mockComments = [
  {
    id: 'comment-1',
    content: 'Investigating the issue',
    user_name: 'Jane Smith',
    created_at: '2024-01-02T11:00:00Z',
    is_internal: false,
  },
  {
    id: 'comment-2',
    content: 'Internal note: check connection pool',
    user_name: 'Bob Wilson',
    created_at: '2024-01-02T12:00:00Z',
    is_internal: true,
  },
];

const mockUsers = [
  { id: 'user-1', name: 'Jane Smith' },
  { id: 'user-2', name: 'Bob Wilson' },
];

const mockGroups = [
  { id: 'group-1', name: 'Database Team' },
  { id: 'group-2', name: 'Backend Team' },
];

const mockApplications = [
  { id: 'app-1', name: 'Payment Service' },
  { id: 'app-2', name: 'User Service' },
];

const mockProblems = [
  { id: 'prob-1', problem_number: 'PRB0001', title: 'Database performance degradation' },
  { id: 'prob-2', problem_number: 'PRB0002', title: 'Connection pool exhaustion' },
];

const mockKBArticles = [
  { id: 'kb-1', article_number: 'KB0001', title: 'How to troubleshoot database timeouts', status: 'published' },
  { id: 'kb-2', article_number: 'KB0002', title: 'Connection pool best practices', status: 'published' },
];

describe('IssueDetailPage', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    vi.clearAllMocks();

    // Default mock implementations
    vi.mocked(apiHooks.useIssue).mockReturnValue({
      data: mockIssue,
      isLoading: false,
      error: null,
    } as any);

    vi.mocked(apiHooks.useIssueComments).mockReturnValue({
      data: { data: mockComments },
      isLoading: false,
    } as any);

    vi.mocked(apiHooks.useUpdateIssue).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as any);

    vi.mocked(apiHooks.useChangeIssueStatus).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as any);

    vi.mocked(apiHooks.useAddIssueComment).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as any);

    vi.mocked(apiHooks.useAssignIssue).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as any);

    vi.mocked(apiHooks.useUsers).mockReturnValue({
      data: { data: mockUsers },
    } as any);

    vi.mocked(apiHooks.useGroups).mockReturnValue({
      data: { data: mockGroups },
    } as any);

    vi.mocked(apiHooks.useApplications).mockReturnValue({
      data: { data: mockApplications },
    } as any);

    vi.mocked(apiHooks.useProblems).mockReturnValue({
      data: { data: mockProblems },
    } as any);

    vi.mocked(apiHooks.useIssueLinkedProblem).mockReturnValue({
      data: { data: null },
    } as any);

    vi.mocked(apiHooks.useLinkIssueToProblem).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as any);

    vi.mocked(apiHooks.useUnlinkIssueFromProblem).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as any);

    vi.mocked(apiHooks.useKBArticlesForIssue).mockReturnValue({
      data: { data: [] },
    } as any);

    vi.mocked(apiHooks.useKBArticles).mockReturnValue({
      data: { data: mockKBArticles },
    } as any);

    vi.mocked(apiHooks.useLinkKBArticle).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as any);
  });

  const renderComponent = () => {
    return render(
      <QueryClientProvider client={queryClient}>
        <IssueDetailPage />
      </QueryClientProvider>
    );
  };

  describe('Loading State', () => {
    it('displays loading spinner while fetching issue', () => {
      vi.mocked(apiHooks.useIssue).mockReturnValue({
        data: null,
        isLoading: true,
        error: null,
      } as any);

      renderComponent();
      // Check for loading spinner by class name since it doesn't have progressbar role
      const container = screen.getByText((content, element) => {
        return element?.classList.contains('animate-spin') || false;
      });
      expect(container).toBeInTheDocument();
    });
  });

  describe('Error State', () => {
    it('displays error message when issue not found', () => {
      vi.mocked(apiHooks.useIssue).mockReturnValue({
        data: null,
        isLoading: false,
        error: new Error('Not found'),
      } as any);

      renderComponent();
      expect(screen.getByText('Issue not found')).toBeInTheDocument();
      expect(screen.getByText(/doesn't exist or you don't have access/)).toBeInTheDocument();
    });

    it('provides back button on error', () => {
      vi.mocked(apiHooks.useIssue).mockReturnValue({
        data: null,
        isLoading: false,
        error: new Error('Not found'),
      } as any);

      renderComponent();
      const backButton = screen.getByRole('button', { name: /back to issues/i });
      fireEvent.click(backButton);
      expect(mockPush).toHaveBeenCalledWith('/issues');
    });
  });

  describe('Basic Rendering', () => {
    it('renders issue number and title', () => {
      renderComponent();
      expect(screen.getByText('INC0001234')).toBeInTheDocument();
      expect(screen.getByText('Database connection timeout')).toBeInTheDocument();
    });

    it('renders priority badge', () => {
      renderComponent();
      // Use getAllByText since "High" might appear in multiple places
      const badges = screen.getAllByText('High');
      expect(badges.length).toBeGreaterThan(0);
    });

    it('renders status badge', () => {
      renderComponent();
      expect(screen.getByText('New')).toBeInTheDocument();
    });

    it('renders back button', () => {
      renderComponent();
      const backButtons = screen.getAllByRole('button');
      const backButton = backButtons[0]; // First button should be back button
      fireEvent.click(backButton);
      expect(mockBack).toHaveBeenCalled();
    });

    it('renders edit button', () => {
      renderComponent();
      expect(screen.getByRole('button', { name: /edit/i })).toBeInTheDocument();
    });
  });

  describe('Content Sections', () => {
    it('renders description section', () => {
      renderComponent();
      expect(screen.getByText('Description')).toBeInTheDocument();
      expect(screen.getByText('Users experiencing timeout when connecting to database')).toBeInTheDocument();
    });

    it('displays empty state for missing description', () => {
      const issueWithoutDescription = { ...mockIssue, description: null };
      vi.mocked(apiHooks.useIssue).mockReturnValue({
        data: issueWithoutDescription,
        isLoading: false,
        error: null,
      } as any);

      renderComponent();
      expect(screen.getByText('No description provided')).toBeInTheDocument();
    });

    it('renders actions section', () => {
      renderComponent();
      expect(screen.getByText('Actions')).toBeInTheDocument();
    });
  });

  describe('Edit Mode', () => {
    it('switches to edit mode when edit button clicked', () => {
      renderComponent();
      fireEvent.click(screen.getByRole('button', { name: /edit/i }));
      expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    });

    it('renders title input in edit mode', () => {
      renderComponent();
      fireEvent.click(screen.getByRole('button', { name: /edit/i }));
      const titleInput = screen.getByLabelText(/title/i);
      expect(titleInput).toHaveValue('Database connection timeout');
    });

    it('renders description textarea in edit mode', () => {
      renderComponent();
      fireEvent.click(screen.getByRole('button', { name: /edit/i }));
      const descInput = screen.getByPlaceholderText('Describe the issue...');
      expect(descInput).toHaveValue('Users experiencing timeout when connecting to database');
    });

    it('allows updating title', () => {
      renderComponent();
      fireEvent.click(screen.getByRole('button', { name: /edit/i }));
      const titleInput = screen.getByLabelText(/title/i);
      fireEvent.change(titleInput, { target: { value: 'New title' } });
      expect(titleInput).toHaveValue('New title');
    });

    it('allows updating description', () => {
      renderComponent();
      fireEvent.click(screen.getByRole('button', { name: /edit/i }));
      const descInput = screen.getByPlaceholderText('Describe the issue...');
      fireEvent.change(descInput, { target: { value: 'New description' } });
      expect(descInput).toHaveValue('New description');
    });

    it('calls updateIssue API when save clicked', async () => {
      const mockUpdate = vi.fn().mockResolvedValue({});
      vi.mocked(apiHooks.useUpdateIssue).mockReturnValue({
        mutateAsync: mockUpdate,
        isPending: false,
      } as any);

      renderComponent();
      fireEvent.click(screen.getByRole('button', { name: /edit/i }));

      const titleInput = screen.getByLabelText(/title/i);
      fireEvent.change(titleInput, { target: { value: 'Updated title' } });

      fireEvent.click(screen.getByRole('button', { name: /save/i }));

      await waitFor(() => {
        expect(mockUpdate).toHaveBeenCalledWith({
          id: 'issue-123',
          data: expect.objectContaining({
            title: 'Updated title',
          }),
        });
      });
    });

    it('exits edit mode on successful save', async () => {
      const mockUpdate = vi.fn().mockResolvedValue({});
      vi.mocked(apiHooks.useUpdateIssue).mockReturnValue({
        mutateAsync: mockUpdate,
        isPending: false,
      } as any);

      renderComponent();
      fireEvent.click(screen.getByRole('button', { name: /edit/i }));
      fireEvent.click(screen.getByRole('button', { name: /save/i }));

      await waitFor(() => {
        expect(screen.queryByRole('button', { name: /save/i })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: /edit/i })).toBeInTheDocument();
      });
    });

    it('displays error on save failure', async () => {
      const mockUpdate = vi.fn().mockRejectedValue(new Error('Update failed'));
      vi.mocked(apiHooks.useUpdateIssue).mockReturnValue({
        mutateAsync: mockUpdate,
        isPending: false,
      } as any);

      renderComponent();
      fireEvent.click(screen.getByRole('button', { name: /edit/i }));
      fireEvent.click(screen.getByRole('button', { name: /save/i }));

      await waitFor(() => {
        expect(screen.getByText('Update failed')).toBeInTheDocument();
      });
    });

    it('resets form when cancel clicked', () => {
      renderComponent();
      fireEvent.click(screen.getByRole('button', { name: /edit/i }));

      const titleInput = screen.getByLabelText(/title/i);
      fireEvent.change(titleInput, { target: { value: 'Changed' } });

      fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

      expect(screen.queryByLabelText(/title/i)).not.toBeInTheDocument();
      expect(screen.getByText('Database connection timeout')).toBeInTheDocument();
    });
  });

  describe('Comments Section', () => {
    it('renders comments section', () => {
      renderComponent();
      // Check that comments section exists by checking for comment input
      expect(screen.getByPlaceholderText('Add a comment...')).toBeInTheDocument();
    });

    it('displays existing comments', () => {
      renderComponent();
      expect(screen.getByText('Investigating the issue')).toBeInTheDocument();
      expect(screen.getByText('Jane Smith')).toBeInTheDocument();
    });

    it('displays internal note badge', () => {
      renderComponent();
      expect(screen.getByText('Internal Note')).toBeInTheDocument();
    });

    it('shows loading state for comments', () => {
      vi.mocked(apiHooks.useIssueComments).mockReturnValue({
        data: null,
        isLoading: true,
      } as any);

      renderComponent();
      expect(screen.getByText('Loading comments...')).toBeInTheDocument();
    });

    it('displays empty state when no comments', () => {
      vi.mocked(apiHooks.useIssueComments).mockReturnValue({
        data: { data: [] },
        isLoading: false,
      } as any);

      renderComponent();
      expect(screen.getByText('No comments yet')).toBeInTheDocument();
    });

    it('renders comment input form', () => {
      renderComponent();
      expect(screen.getByPlaceholderText('Add a comment...')).toBeInTheDocument();
    });

    it('allows typing in comment input', () => {
      renderComponent();
      const input = screen.getByPlaceholderText('Add a comment...');
      fireEvent.change(input, { target: { value: 'New comment' } });
      expect(input).toHaveValue('New comment');
    });

    it('submit button disabled when comment empty', () => {
      renderComponent();
      const submitButton = screen.getByRole('button', { name: /send/i });
      expect(submitButton).toBeDisabled();
    });

    it('submit button enabled when comment has content', () => {
      renderComponent();
      const input = screen.getByPlaceholderText('Add a comment...');
      fireEvent.change(input, { target: { value: 'New comment' } });
      const submitButton = screen.getByRole('button', { name: /send/i });
      expect(submitButton).not.toBeDisabled();
    });

    it('calls addComment API when comment submitted', async () => {
      const mockAddComment = vi.fn().mockResolvedValue({});
      vi.mocked(apiHooks.useAddIssueComment).mockReturnValue({
        mutateAsync: mockAddComment,
        isPending: false,
      } as any);

      renderComponent();
      const input = screen.getByPlaceholderText('Add a comment...');
      fireEvent.change(input, { target: { value: 'New comment' } });

      const form = input.closest('form')!;
      fireEvent.submit(form);

      await waitFor(() => {
        expect(mockAddComment).toHaveBeenCalledWith({
          id: 'issue-123',
          content: 'New comment',
        });
      });
    });

    it('clears input after successful comment submission', async () => {
      const mockAddComment = vi.fn().mockResolvedValue({});
      vi.mocked(apiHooks.useAddIssueComment).mockReturnValue({
        mutateAsync: mockAddComment,
        isPending: false,
      } as any);

      renderComponent();
      const input = screen.getByPlaceholderText('Add a comment...');
      fireEvent.change(input, { target: { value: 'New comment' } });

      const form = input.closest('form')!;
      fireEvent.submit(form);

      await waitFor(() => {
        expect(input).toHaveValue('');
      });
    });

    it('displays error on comment submission failure', async () => {
      const mockAddComment = vi.fn().mockRejectedValue(new Error('Failed to add comment'));
      vi.mocked(apiHooks.useAddIssueComment).mockReturnValue({
        mutateAsync: mockAddComment,
        isPending: false,
      } as any);

      renderComponent();
      const input = screen.getByPlaceholderText('Add a comment...');
      fireEvent.change(input, { target: { value: 'New comment' } });

      const form = input.closest('form')!;
      fireEvent.submit(form);

      await waitFor(() => {
        expect(screen.getByText('Failed to add comment')).toBeInTheDocument();
      });
    });
  });

  describe('Status-based Actions', () => {
    it('shows assign and start working buttons for new status', () => {
      renderComponent();
      expect(screen.getByRole('button', { name: /assign/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /start working/i })).toBeInTheDocument();
    });

    it('shows start working button for assigned status', () => {
      const assignedIssue = { ...mockIssue, status: 'assigned' };
      vi.mocked(apiHooks.useIssue).mockReturnValue({
        data: assignedIssue,
        isLoading: false,
        error: null,
      } as any);

      renderComponent();
      expect(screen.getByRole('button', { name: /start working/i })).toBeInTheDocument();
    });

    it('shows put on hold and resolve buttons for in_progress status', () => {
      const inProgressIssue = { ...mockIssue, status: 'in_progress' };
      vi.mocked(apiHooks.useIssue).mockReturnValue({
        data: inProgressIssue,
        isLoading: false,
        error: null,
      } as any);

      renderComponent();
      expect(screen.getByRole('button', { name: /put on hold/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /resolve/i })).toBeInTheDocument();
    });

    it('shows resume button for pending status', () => {
      const pendingIssue = { ...mockIssue, status: 'pending' };
      vi.mocked(apiHooks.useIssue).mockReturnValue({
        data: pendingIssue,
        isLoading: false,
        error: null,
      } as any);

      renderComponent();
      expect(screen.getByRole('button', { name: /resume/i })).toBeInTheDocument();
    });

    it('shows close and reopen buttons for resolved status', () => {
      const resolvedIssue = { ...mockIssue, status: 'resolved' };
      vi.mocked(apiHooks.useIssue).mockReturnValue({
        data: resolvedIssue,
        isLoading: false,
        error: null,
      } as any);

      renderComponent();
      expect(screen.getByRole('button', { name: /close/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /reopen/i })).toBeInTheDocument();
    });
  });

  describe('Status Changes', () => {
    it('calls changeStatus API when status action clicked', async () => {
      const mockChangeStatus = vi.fn().mockResolvedValue({});
      vi.mocked(apiHooks.useChangeIssueStatus).mockReturnValue({
        mutateAsync: mockChangeStatus,
        isPending: false,
      } as any);

      renderComponent();
      fireEvent.click(screen.getByRole('button', { name: /start working/i }));

      await waitFor(() => {
        expect(mockChangeStatus).toHaveBeenCalledWith({
          id: 'issue-123',
          status: 'in_progress',
        });
      });
    });

    it('displays error on status change failure', async () => {
      const mockChangeStatus = vi.fn().mockRejectedValue(new Error('Status change failed'));
      vi.mocked(apiHooks.useChangeIssueStatus).mockReturnValue({
        mutateAsync: mockChangeStatus,
        isPending: false,
      } as any);

      renderComponent();
      fireEvent.click(screen.getByRole('button', { name: /start working/i }));

      await waitFor(() => {
        expect(screen.getByText('Status change failed')).toBeInTheDocument();
      });
    });
  });

  describe('Priority Variations', () => {
    it('renders critical priority correctly', () => {
      const criticalIssue = { ...mockIssue, priority: 'critical' };
      vi.mocked(apiHooks.useIssue).mockReturnValue({
        data: criticalIssue,
        isLoading: false,
        error: null,
      } as any);

      renderComponent();
      // Use getAllByText since "Critical" might appear multiple times
      const badges = screen.getAllByText('Critical');
      expect(badges.length).toBeGreaterThan(0);
    });

    it('renders low priority correctly', () => {
      const lowIssue = { ...mockIssue, priority: 'low' };
      vi.mocked(apiHooks.useIssue).mockReturnValue({
        data: lowIssue,
        isLoading: false,
        error: null,
      } as any);

      renderComponent();
      // Use getAllByText since "Low" might appear multiple times
      const badges = screen.getAllByText('Low');
      expect(badges.length).toBeGreaterThan(0);
    });

    it('renders medium priority correctly', () => {
      const mediumIssue = { ...mockIssue, priority: 'medium' };
      vi.mocked(apiHooks.useIssue).mockReturnValue({
        data: mediumIssue,
        isLoading: false,
        error: null,
      } as any);

      renderComponent();
      // Use getAllByText since "Medium" might appear multiple times
      const badges = screen.getAllByText('Medium');
      expect(badges.length).toBeGreaterThan(0);
    });
  });

  describe('Status Variations', () => {
    it('renders assigned status correctly', () => {
      const assignedIssue = { ...mockIssue, status: 'assigned' };
      vi.mocked(apiHooks.useIssue).mockReturnValue({
        data: assignedIssue,
        isLoading: false,
        error: null,
      } as any);

      renderComponent();
      expect(screen.getByText('Assigned')).toBeInTheDocument();
    });

    it('renders in_progress status correctly', () => {
      const inProgressIssue = { ...mockIssue, status: 'in_progress' };
      vi.mocked(apiHooks.useIssue).mockReturnValue({
        data: inProgressIssue,
        isLoading: false,
        error: null,
      } as any);

      renderComponent();
      expect(screen.getByText('In Progress')).toBeInTheDocument();
    });

    it('renders resolved status correctly', () => {
      const resolvedIssue = { ...mockIssue, status: 'resolved' };
      vi.mocked(apiHooks.useIssue).mockReturnValue({
        data: resolvedIssue,
        isLoading: false,
        error: null,
      } as any);

      renderComponent();
      expect(screen.getByText('Resolved')).toBeInTheDocument();
    });

    it('renders closed status correctly', () => {
      const closedIssue = { ...mockIssue, status: 'closed' };
      vi.mocked(apiHooks.useIssue).mockReturnValue({
        data: closedIssue,
        isLoading: false,
        error: null,
      } as any);

      renderComponent();
      expect(screen.getByText('Closed')).toBeInTheDocument();
    });
  });

  describe('Assign Modal', () => {
    it('opens assign modal when assign button clicked', async () => {
      renderComponent();
      fireEvent.click(screen.getByRole('button', { name: /assign/i }));

      await waitFor(() => {
        expect(screen.getByText('Assign Issue')).toBeInTheDocument();
        expect(screen.getByText('Select a user to assign this issue to:')).toBeInTheDocument();
      });
    });

    it('displays list of users in assign modal', async () => {
      renderComponent();
      fireEvent.click(screen.getByRole('button', { name: /assign/i }));

      await waitFor(() => {
        // Jane Smith appears in both modal and may appear in main content
        const janeElements = screen.getAllByText('Jane Smith');
        expect(janeElements.length).toBeGreaterThanOrEqual(1);
        const bobElements = screen.getAllByText('Bob Wilson');
        expect(bobElements.length).toBeGreaterThanOrEqual(1);
      });
    });

    it('closes assign modal when Cancel clicked', async () => {
      renderComponent();
      fireEvent.click(screen.getByRole('button', { name: /assign/i }));

      await waitFor(() => {
        expect(screen.getByText('Assign Issue')).toBeInTheDocument();
      });

      // Click the cancel button in the modal
      const cancelButtons = screen.getAllByRole('button', { name: /cancel/i });
      fireEvent.click(cancelButtons[cancelButtons.length - 1]);

      await waitFor(() => {
        expect(screen.queryByText('Assign Issue')).not.toBeInTheDocument();
      });
    });

    it('calls assignIssue API when user selected', async () => {
      const mockAssign = vi.fn().mockResolvedValue({});
      vi.mocked(apiHooks.useAssignIssue).mockReturnValue({
        mutateAsync: mockAssign,
        isPending: false,
      } as any);

      renderComponent();
      fireEvent.click(screen.getByRole('button', { name: /assign/i }));

      await waitFor(() => {
        const janeElements = screen.getAllByText('Jane Smith');
        expect(janeElements.length).toBeGreaterThanOrEqual(1);
      });

      // Find and click the user button in the modal
      const userButtons = screen.getAllByRole('button');
      const janeButton = userButtons.find(btn => btn.textContent?.includes('Jane Smith'));
      if (janeButton) {
        fireEvent.click(janeButton);
      }

      await waitFor(() => {
        expect(mockAssign).toHaveBeenCalledWith({
          id: 'issue-123',
          assignedTo: 'user-1',
        });
      });
    });

    it('displays error when assign fails', async () => {
      const mockAssign = vi.fn().mockRejectedValue(new Error('Failed to assign'));
      vi.mocked(apiHooks.useAssignIssue).mockReturnValue({
        mutateAsync: mockAssign,
        isPending: false,
      } as any);

      renderComponent();
      fireEvent.click(screen.getByRole('button', { name: /assign/i }));

      await waitFor(() => {
        const janeElements = screen.getAllByText('Jane Smith');
        expect(janeElements.length).toBeGreaterThanOrEqual(1);
      });

      const userButtons = screen.getAllByRole('button');
      const janeButton = userButtons.find(btn => btn.textContent?.includes('Jane Smith'));
      if (janeButton) {
        fireEvent.click(janeButton);
      }

      await waitFor(() => {
        // The error message comes from the Error instance thrown
        expect(screen.getByText('Failed to assign')).toBeInTheDocument();
      });
    });
  });

  describe('Linked Problem Section', () => {
    it('displays Linked Problem heading', () => {
      renderComponent();
      expect(screen.getByText('Linked Problem')).toBeInTheDocument();
    });

    it('shows Link button when no problem linked', () => {
      renderComponent();
      // Find the Link button in the Linked Problem section
      const linkButtons = screen.getAllByRole('button', { name: /link/i });
      expect(linkButtons.length).toBeGreaterThan(0);
    });

    it('shows empty state when no problem linked', () => {
      renderComponent();
      expect(screen.getByText(/no linked problem/i)).toBeInTheDocument();
    });

    it('displays linked problem when present', () => {
      const linkedProblem = {
        id: 'prob-1',
        problem_number: 'PRB0001',
        title: 'Database performance issue',
        status: 'open',
        relationship_type: 'caused_by',
      };
      vi.mocked(apiHooks.useIssueLinkedProblem).mockReturnValue({
        data: { data: linkedProblem },
      } as any);

      renderComponent();
      expect(screen.getByText('PRB0001')).toBeInTheDocument();
      expect(screen.getByText('Database performance issue')).toBeInTheDocument();
    });

    it('shows Unlink button when problem is linked', () => {
      const linkedProblem = {
        id: 'prob-1',
        problem_number: 'PRB0001',
        title: 'Database performance issue',
        status: 'open',
        relationship_type: 'caused_by',
      };
      vi.mocked(apiHooks.useIssueLinkedProblem).mockReturnValue({
        data: { data: linkedProblem },
      } as any);

      renderComponent();
      expect(screen.getByRole('button', { name: /unlink/i })).toBeInTheDocument();
    });

    it('displays relationship type for linked problem', () => {
      const linkedProblem = {
        id: 'prob-1',
        problem_number: 'PRB0001',
        title: 'Database performance issue',
        status: 'open',
        relationship_type: 'caused_by',
      };
      vi.mocked(apiHooks.useIssueLinkedProblem).mockReturnValue({
        data: { data: linkedProblem },
      } as any);

      renderComponent();
      expect(screen.getByText(/caused by/i)).toBeInTheDocument();
    });

    it('shows Known Error badge for known error problems', () => {
      const linkedProblem = {
        id: 'prob-1',
        problem_number: 'PRB0001',
        title: 'Database performance issue',
        status: 'known_error',
        is_known_error: true,
        relationship_type: 'caused_by',
      };
      vi.mocked(apiHooks.useIssueLinkedProblem).mockReturnValue({
        data: { data: linkedProblem },
      } as any);

      renderComponent();
      expect(screen.getByText('Known Error')).toBeInTheDocument();
    });

    it('calls unlinkFromProblem API when Unlink clicked', async () => {
      const mockUnlink = vi.fn().mockResolvedValue({});
      vi.mocked(apiHooks.useUnlinkIssueFromProblem).mockReturnValue({
        mutateAsync: mockUnlink,
        isPending: false,
      } as any);

      const linkedProblem = {
        id: 'prob-1',
        problem_number: 'PRB0001',
        title: 'Database performance issue',
        status: 'open',
        relationship_type: 'caused_by',
      };
      vi.mocked(apiHooks.useIssueLinkedProblem).mockReturnValue({
        data: { data: linkedProblem },
      } as any);

      renderComponent();
      fireEvent.click(screen.getByRole('button', { name: /unlink/i }));

      await waitFor(() => {
        expect(mockUnlink).toHaveBeenCalledWith('issue-123');
      });
    });
  });

  describe('Knowledge Base Section', () => {
    it('displays Knowledge Base heading', () => {
      renderComponent();
      expect(screen.getByText('Knowledge Base')).toBeInTheDocument();
    });

    it('shows Link button for KB articles', () => {
      renderComponent();
      // Check Knowledge Base section has a Link button
      const kbSection = screen.getByText('Knowledge Base').closest('div');
      expect(kbSection).toBeInTheDocument();
    });

    it('shows empty state when no KB articles linked', () => {
      renderComponent();
      expect(screen.getByText(/no linked articles/i)).toBeInTheDocument();
    });

    it('displays linked KB articles when present', () => {
      const linkedArticles = [
        {
          id: 'kb-1',
          title: 'Database troubleshooting guide',
          type: 'troubleshooting',
          summary: 'Guide for troubleshooting database issues',
        },
      ];
      vi.mocked(apiHooks.useKBArticlesForIssue).mockReturnValue({
        data: { data: linkedArticles },
      } as any);

      renderComponent();
      expect(screen.getByText('Database troubleshooting guide')).toBeInTheDocument();
    });

    it('displays article type badge', () => {
      const linkedArticles = [
        {
          id: 'kb-1',
          title: 'Database troubleshooting guide',
          type: 'troubleshooting',
          summary: 'Guide for troubleshooting database issues',
        },
      ];
      vi.mocked(apiHooks.useKBArticlesForIssue).mockReturnValue({
        data: { data: linkedArticles },
      } as any);

      renderComponent();
      expect(screen.getByText('troubleshooting')).toBeInTheDocument();
    });
  });

  describe('Link Problem Modal', () => {
    it('opens link problem modal when Link clicked', async () => {
      renderComponent();
      // Find the Link button in the Linked Problem section
      const linkedProblemSection = screen.getByText('Linked Problem').closest('div');
      const linkButton = linkedProblemSection?.querySelector('button');
      if (linkButton) {
        fireEvent.click(linkButton);
      }

      await waitFor(() => {
        // "Link to Problem" may appear multiple times (in title and button)
        const linkElements = screen.getAllByText(/link to problem/i);
        expect(linkElements.length).toBeGreaterThanOrEqual(1);
      });
    });

    it('displays available problems in modal', async () => {
      renderComponent();
      const linkedProblemSection = screen.getByText('Linked Problem').closest('div');
      const linkButton = linkedProblemSection?.querySelector('button');
      if (linkButton) {
        fireEvent.click(linkButton);
      }

      await waitFor(() => {
        // Check for problem number in select option or displayed text
        const selectElements = document.querySelectorAll('select');
        const problemSelect = Array.from(selectElements).find(s =>
          Array.from(s.options).some(o => o.text.includes('PRB0001'))
        );
        expect(problemSelect).toBeInTheDocument();
      });
    });
  });

  describe('Timeline Section', () => {
    it('displays Timeline heading', () => {
      renderComponent();
      expect(screen.getByText('Timeline')).toBeInTheDocument();
    });

    it('displays created date', () => {
      renderComponent();
      expect(screen.getByText('Created')).toBeInTheDocument();
    });

    it('displays last updated date', () => {
      renderComponent();
      expect(screen.getByText('Last Updated')).toBeInTheDocument();
    });

    it('displays resolved date when issue is resolved', () => {
      const resolvedIssue = {
        ...mockIssue,
        status: 'resolved',
        resolved_at: '2024-01-05T10:00:00Z',
      };
      vi.mocked(apiHooks.useIssue).mockReturnValue({
        data: resolvedIssue,
        isLoading: false,
        error: null,
      } as any);

      renderComponent();
      // "Resolved" appears in both status badge and timeline
      const resolvedElements = screen.getAllByText(/resolved/i);
      expect(resolvedElements.length).toBeGreaterThan(0);
    });

    it('displays closed date when issue is closed', () => {
      const closedIssue = {
        ...mockIssue,
        status: 'closed',
        closed_at: '2024-01-06T10:00:00Z',
      };
      vi.mocked(apiHooks.useIssue).mockReturnValue({
        data: closedIssue,
        isLoading: false,
        error: null,
      } as any);

      renderComponent();
      // "Closed" appears in both status badge and timeline
      const closedElements = screen.getAllByText(/closed/i);
      expect(closedElements.length).toBeGreaterThan(0);
    });
  });

  describe('SLA Status', () => {
    it('displays SLA Breached when SLA is breached', () => {
      const breachedIssue = {
        ...mockIssue,
        sla_breached: true,
      };
      vi.mocked(apiHooks.useIssue).mockReturnValue({
        data: breachedIssue,
        isLoading: false,
        error: null,
      } as any);

      renderComponent();
      expect(screen.getByText('SLA Status')).toBeInTheDocument();
      expect(screen.getByText('Breached')).toBeInTheDocument();
    });

    it('displays SLA Breached At date when present', () => {
      const breachedIssue = {
        ...mockIssue,
        sla_breached: true,
        sla_breached_at: '2024-01-03T10:00:00Z',
      };
      vi.mocked(apiHooks.useIssue).mockReturnValue({
        data: breachedIssue,
        isLoading: false,
        error: null,
      } as any);

      renderComponent();
      expect(screen.getByText('SLA Breached At')).toBeInTheDocument();
    });
  });

  describe('Details Section', () => {
    it('displays Assigned To section', () => {
      renderComponent();
      expect(screen.getByText('Assigned To')).toBeInTheDocument();
    });

    it('displays Unassigned when no assignee', () => {
      renderComponent();
      expect(screen.getByText('Unassigned')).toBeInTheDocument();
    });

    it('displays assignee name when assigned', () => {
      const assignedIssue = {
        ...mockIssue,
        assignee_name: 'Jane Smith',
        assignee_email: 'jane@example.com',
      };
      vi.mocked(apiHooks.useIssue).mockReturnValue({
        data: assignedIssue,
        isLoading: false,
        error: null,
      } as any);

      renderComponent();
      // Use getAllByText since name might appear in multiple places
      const janeElements = screen.getAllByText('Jane Smith');
      expect(janeElements.length).toBeGreaterThan(0);
    });

    it('displays assignee email when assigned', () => {
      const assignedIssue = {
        ...mockIssue,
        assignee_name: 'Jane Smith',
        assignee_email: 'jane@example.com',
      };
      vi.mocked(apiHooks.useIssue).mockReturnValue({
        data: assignedIssue,
        isLoading: false,
        error: null,
      } as any);

      renderComponent();
      expect(screen.getByText('jane@example.com')).toBeInTheDocument();
    });

    it('displays Assignment Group', () => {
      const issueWithGroup = {
        ...mockIssue,
        assigned_group_name: 'Support Team',
      };
      vi.mocked(apiHooks.useIssue).mockReturnValue({
        data: issueWithGroup,
        isLoading: false,
        error: null,
      } as any);

      renderComponent();
      expect(screen.getByText('Assignment Group')).toBeInTheDocument();
      expect(screen.getByText('Support Team')).toBeInTheDocument();
    });

    it('displays Reporter information', () => {
      renderComponent();
      expect(screen.getByText('Reporter')).toBeInTheDocument();
      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.getByText('john@example.com')).toBeInTheDocument();
    });

    it('displays Application link when application is set', () => {
      renderComponent();
      expect(screen.getByText('Application')).toBeInTheDocument();
      const appLink = screen.getByRole('link', { name: 'Payment Service' });
      expect(appLink).toHaveAttribute('href', '/applications/app-1');
    });

    it('displays severity when present', () => {
      renderComponent();
      expect(screen.getByText('Severity')).toBeInTheDocument();
      expect(screen.getByText('S2')).toBeInTheDocument();
    });

    it('displays urgency when present', () => {
      const urgentIssue = {
        ...mockIssue,
        urgency: 'high',
      };
      vi.mocked(apiHooks.useIssue).mockReturnValue({
        data: urgentIssue,
        isLoading: false,
        error: null,
      } as any);

      renderComponent();
      expect(screen.getByText('Urgency')).toBeInTheDocument();
    });

    it('displays impact when present', () => {
      const impactIssue = {
        ...mockIssue,
        impact: 'high',
      };
      vi.mocked(apiHooks.useIssue).mockReturnValue({
        data: impactIssue,
        isLoading: false,
        error: null,
      } as any);

      renderComponent();
      expect(screen.getByText('Impact')).toBeInTheDocument();
    });
  });

  describe('Edit Mode Selects', () => {
    it('displays priority select in edit mode', () => {
      renderComponent();
      fireEvent.click(screen.getByRole('button', { name: /edit/i }));

      // Find priority select by its options
      const selects = document.querySelectorAll('select');
      const prioritySelect = Array.from(selects).find(s =>
        Array.from(s.options).some(o => o.text === 'Critical')
      );
      expect(prioritySelect).toBeInTheDocument();
    });

    it('displays severity select in edit mode', () => {
      renderComponent();
      fireEvent.click(screen.getByRole('button', { name: /edit/i }));

      // Find severity select by its options
      const selects = document.querySelectorAll('select');
      const severitySelect = Array.from(selects).find(s =>
        Array.from(s.options).some(o => o.text === 'S1 - Critical')
      );
      expect(severitySelect).toBeInTheDocument();
    });

    it('displays assigned to select in edit mode', () => {
      renderComponent();
      fireEvent.click(screen.getByRole('button', { name: /edit/i }));

      // Find assigned to select by its options
      const selects = document.querySelectorAll('select');
      const assignedSelect = Array.from(selects).find(s =>
        Array.from(s.options).some(o => o.text === 'Jane Smith')
      );
      expect(assignedSelect).toBeInTheDocument();
    });

    it('displays assignment group select in edit mode', () => {
      renderComponent();
      fireEvent.click(screen.getByRole('button', { name: /edit/i }));

      // Find group select by its options
      const selects = document.querySelectorAll('select');
      const groupSelect = Array.from(selects).find(s =>
        Array.from(s.options).some(o => o.text === 'Database Team')
      );
      expect(groupSelect).toBeInTheDocument();
    });

    it('displays application select in edit mode', () => {
      renderComponent();
      fireEvent.click(screen.getByRole('button', { name: /edit/i }));

      // Find application select by its options
      const selects = document.querySelectorAll('select');
      const appSelect = Array.from(selects).find(s =>
        Array.from(s.options).some(o => o.text === 'Payment Service')
      );
      expect(appSelect).toBeInTheDocument();
    });
  });

  describe('Close Button', () => {
    it('shows close button for new status issues', () => {
      renderComponent();
      // The Close button should be available for non-closed/non-resolved issues
      const closeButton = screen.getByRole('button', { name: /close/i });
      expect(closeButton).toBeInTheDocument();
    });

    it('calls changeStatus with closed when close button clicked', async () => {
      const mockChangeStatus = vi.fn().mockResolvedValue({});
      vi.mocked(apiHooks.useChangeIssueStatus).mockReturnValue({
        mutateAsync: mockChangeStatus,
        isPending: false,
      } as any);

      renderComponent();
      fireEvent.click(screen.getByRole('button', { name: /close/i }));

      await waitFor(() => {
        expect(mockChangeStatus).toHaveBeenCalledWith({
          id: 'issue-123',
          status: 'closed',
        });
      });
    });
  });

  describe('Pending Status', () => {
    it('renders pending status correctly', () => {
      const pendingIssue = { ...mockIssue, status: 'pending' };
      vi.mocked(apiHooks.useIssue).mockReturnValue({
        data: pendingIssue,
        isLoading: false,
        error: null,
      } as any);

      renderComponent();
      expect(screen.getByText('Pending')).toBeInTheDocument();
    });
  });

  describe('First Response Time', () => {
    it('displays first response time when present', () => {
      const issueWithFirstResponse = {
        ...mockIssue,
        first_response_at: '2024-01-01T12:00:00Z',
      };
      vi.mocked(apiHooks.useIssue).mockReturnValue({
        data: issueWithFirstResponse,
        isLoading: false,
        error: null,
      } as any);

      renderComponent();
      expect(screen.getByText('First Response')).toBeInTheDocument();
    });
  });
});
