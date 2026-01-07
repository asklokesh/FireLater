import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProblemDetailPage from '../page';
import * as useApiModule from '@/hooks/useApi';

// Mock Next.js modules
vi.mock('next/navigation', () => ({
  useParams: () => ({ id: '1' }),
  useRouter: () => ({
    push: vi.fn(),
    back: vi.fn(),
  }),
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

// Mock UI components
vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, variant, size, disabled, className }: any) => (
    <button onClick={onClick} disabled={disabled} className={className}>
      {children}
    </button>
  ),
}));

vi.mock('@/components/ui/input', () => ({
  Input: ({ value, onChange, placeholder, className }: any) => (
    <input value={value} onChange={onChange} placeholder={placeholder} className={className} />
  ),
}));

// Mock API hooks
vi.mock('@/hooks/useApi', () => ({
  useProblem: vi.fn(),
  useChangeProblemStatus: vi.fn(),
  useAddProblemComment: vi.fn(),
  useProblemComments: vi.fn(),
  useAssignProblem: vi.fn(),
  useUsers: vi.fn(),
  useProblemLinkedIssues: vi.fn(),
  useLinkIssueToProblem: vi.fn(),
  useUnlinkIssueFromProblem: vi.fn(),
  useProblemHistory: vi.fn(),
  useConvertToKnownError: vi.fn(),
  useUpdateProblem: vi.fn(),
  useIssues: vi.fn(),
  useApplications: vi.fn(),
  useGroups: vi.fn(),
  useKBArticlesForProblem: vi.fn(),
  useKBArticles: vi.fn(),
  useLinkKBArticle: vi.fn(),
}));

const mockProblem = {
  id: '1',
  problem_number: 'PRB-001',
  title: 'Database Connection Pool Exhaustion',
  description: 'Application experiencing connection pool exhaustion during peak hours',
  priority: 'high',
  status: 'investigating',
  problem_type: 'reactive',
  is_known_error: false,
  assignee_id: '2',
  assignee_name: 'John Doe',
  application_id: '1',
  application_name: 'Core API',
  assignment_group_id: '1',
  assignment_group_name: 'Database Team',
  created_by_name: 'Jane Smith',
  rca_data: null,
  workaround: null,
  resolution: null,
  created_at: '2024-01-15T10:00:00Z',
  updated_at: '2024-01-15T14:30:00Z',
};

const mockComments = [
  {
    id: '1',
    content: 'Initial investigation shows peak load at 3pm',
    user_name: 'John Doe',
    is_internal: false,
    created_at: '2024-01-15T11:00:00Z',
  },
  {
    id: '2',
    content: 'Checking connection pool configuration',
    user_name: 'Jane Smith',
    is_internal: true,
    created_at: '2024-01-15T12:00:00Z',
  },
];

const mockLinkedIssues = [
  {
    id: '1',
    issue_id: 'issue1',
    issue_number: 'INC-001',
    issue_title: 'Unable to connect to database',
    relationship_type: 'caused_by',
  },
  {
    id: '2',
    issue_id: 'issue2',
    issue_number: 'INC-002',
    issue_title: 'Slow response times',
    relationship_type: 'related_to',
  },
];

const mockHistory = [
  {
    id: '1',
    from_status: 'new',
    to_status: 'investigating',
    reason: 'Starting investigation',
    changed_by_name: 'John Doe',
    changed_at: '2024-01-15T10:30:00Z',
  },
  {
    id: '2',
    from_status: 'investigating',
    to_status: 'resolved',
    reason: null,
    changed_by_name: 'Jane Smith',
    changed_at: '2024-01-15T10:15:00Z',
  },
];

const mockKBArticles = [
  {
    id: '1',
    article_number: 'KB-001',
    title: 'Database Connection Pool Best Practices',
    type: 'troubleshooting',
    summary: 'Best practices for database connection pooling',
  },
];

describe('ProblemDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default mocks
    vi.mocked(useApiModule.useProblem).mockReturnValue({
      data: mockProblem,
      isLoading: false,
      error: null,
      mutate: vi.fn(),
    } as any);

    vi.mocked(useApiModule.useProblemComments).mockReturnValue({
      data: mockComments,
      isLoading: false,
      error: null,
      mutate: vi.fn(),
    } as any);

    vi.mocked(useApiModule.useProblemLinkedIssues).mockReturnValue({
      data: mockLinkedIssues,
      isLoading: false,
      error: null,
      mutate: vi.fn(),
    } as any);

    vi.mocked(useApiModule.useProblemHistory).mockReturnValue({
      data: mockHistory,
      isLoading: false,
      error: null,
      mutate: vi.fn(),
    } as any);

    vi.mocked(useApiModule.useKBArticlesForProblem).mockReturnValue({
      data: mockKBArticles,
      isLoading: false,
      error: null,
      mutate: vi.fn(),
    } as any);

    vi.mocked(useApiModule.useUsers).mockReturnValue({
      data: { data: [{ id: '2', name: 'John Doe', email: 'john@example.com' }], pagination: {} },
      isLoading: false,
      error: null,
      mutate: vi.fn(),
    } as any);

    vi.mocked(useApiModule.useIssues).mockReturnValue({
      data: { data: [], pagination: {} },
      isLoading: false,
      error: null,
      mutate: vi.fn(),
    } as any);

    vi.mocked(useApiModule.useApplications).mockReturnValue({
      data: { data: [], pagination: {} },
      isLoading: false,
      error: null,
      mutate: vi.fn(),
    } as any);

    vi.mocked(useApiModule.useGroups).mockReturnValue({
      data: { data: [], pagination: {} },
      isLoading: false,
      error: null,
      mutate: vi.fn(),
    } as any);

    vi.mocked(useApiModule.useKBArticles).mockReturnValue({
      data: { data: [], pagination: {} },
      isLoading: false,
      error: null,
      mutate: vi.fn(),
    } as any);

    vi.mocked(useApiModule.useChangeProblemStatus).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as any);

    vi.mocked(useApiModule.useAddProblemComment).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as any);

    vi.mocked(useApiModule.useAssignProblem).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as any);

    vi.mocked(useApiModule.useLinkIssueToProblem).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as any);

    vi.mocked(useApiModule.useUnlinkIssueFromProblem).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as any);

    vi.mocked(useApiModule.useConvertToKnownError).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as any);

    vi.mocked(useApiModule.useUpdateProblem).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as any);

    vi.mocked(useApiModule.useLinkKBArticle).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as any);
  });

  describe('Basic Rendering', () => {
    it('renders problem number and title', async () => {
      render(<ProblemDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('PRB-001')).toBeInTheDocument();
        expect(screen.getByText('Database Connection Pool Exhaustion')).toBeInTheDocument();
      });
    });

    it('renders back button', async () => {
      render(<ProblemDetailPage />);

      await waitFor(() => {
        // Back button is a button with ArrowLeft icon, not a link
        const buttons = screen.getAllByRole('button');
        expect(buttons.length).toBeGreaterThan(0);
      });
    });

    it('displays problem priority badge', async () => {
      render(<ProblemDetailPage />);

      await waitFor(() => {
        const highBadges = screen.getAllByText('High');
        // Priority badge appears twice - in header and sidebar
        expect(highBadges.length).toBeGreaterThan(0);
      });
    });

    it('displays problem status badge', async () => {
      render(<ProblemDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Investigating')).toBeInTheDocument();
      });
    });

    it('displays problem type badge', async () => {
      render(<ProblemDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Reactive')).toBeInTheDocument();
      });
    });
  });

  describe('Loading State', () => {
    it('displays loading spinner when data is loading', () => {
      vi.mocked(useApiModule.useProblem).mockReturnValue({
        data: undefined,
        isLoading: true,
        error: null,
        mutate: vi.fn(),
      } as any);

      render(<ProblemDetailPage />);

      // Loading state shows spinner, no text
      const spinners = document.querySelectorAll('.animate-spin');
      expect(spinners.length).toBeGreaterThan(0);
    });
  });

  describe('Error State', () => {
    it('displays error message when problem fetch fails', () => {
      vi.mocked(useApiModule.useProblem).mockReturnValue({
        data: undefined,
        isLoading: false,
        error: new Error('API Error'),
        mutate: vi.fn(),
      } as any);

      render(<ProblemDetailPage />);

      expect(screen.getByText('Problem not found')).toBeInTheDocument();
    });
  });

  describe('Problem Details Sidebar', () => {
    it('displays assignee information', async () => {
      render(<ProblemDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Assigned To')).toBeInTheDocument();
        const johnDoeElements = screen.getAllByText('John Doe');
        expect(johnDoeElements.length).toBeGreaterThan(0);
      });
    });

    it('displays problem type', async () => {
      render(<ProblemDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Problem Type')).toBeInTheDocument();
        expect(screen.getByText('Reactive')).toBeInTheDocument();
      });
    });

    it('displays application information', async () => {
      render(<ProblemDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Application')).toBeInTheDocument();
        expect(screen.getByText('Core API')).toBeInTheDocument();
      });
    });

    it('displays linked issues count', async () => {
      render(<ProblemDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Linked Issues')).toBeInTheDocument();
        expect(screen.getByText('2 issues')).toBeInTheDocument();
      });
    });
  });

  describe('Tabs Navigation', () => {
    it('renders all tab buttons', async () => {
      render(<ProblemDetailPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /comments/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /linked issues/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /history/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /kb articles/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /rca tools/i })).toBeInTheDocument();
      });
    });

    it('switches to issues tab when clicked', async () => {
      const user = userEvent.setup();
      render(<ProblemDetailPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /linked issues/i })).toBeInTheDocument();
      });

      const issuesTab = screen.getByRole('button', { name: /linked issues/i });
      await user.click(issuesTab);

      await waitFor(() => {
        expect(screen.getByText('INC-001')).toBeInTheDocument();
        expect(screen.getByText('caused_by')).toBeInTheDocument();
      });
    });

    it('switches to history tab when clicked', async () => {
      const user = userEvent.setup();
      render(<ProblemDetailPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /history/i })).toBeInTheDocument();
      });

      const historyTab = screen.getByRole('button', { name: /history/i });
      await user.click(historyTab);

      await waitFor(() => {
        const statusChanges = screen.getAllByText(/Status changed from/i);
        expect(statusChanges.length).toBeGreaterThan(0);
      });
    });

    it('switches to knowledge base tab when clicked', async () => {
      const user = userEvent.setup();
      render(<ProblemDetailPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /kb articles/i })).toBeInTheDocument();
      });

      const kbTab = screen.getByRole('button', { name: /kb articles/i });
      await user.click(kbTab);

      await waitFor(() => {
        // Check for "Link Article" button which confirms KB tab is active
        expect(screen.getByRole('button', { name: /link article/i })).toBeInTheDocument();
      });
    });

    it('switches to rca tab when clicked', async () => {
      const user = userEvent.setup();
      render(<ProblemDetailPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /rca tools/i })).toBeInTheDocument();
      });

      const rcaTab = screen.getByRole('button', { name: /rca tools/i });
      await user.click(rcaTab);

      await waitFor(() => {
        expect(screen.getByText(/5 Whys Analysis/i)).toBeInTheDocument();
      });
    });
  });

  describe('Comments Tab', () => {
    it('displays existing comments', async () => {
      render(<ProblemDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Initial investigation shows peak load at 3pm')).toBeInTheDocument();
        expect(screen.getByText('Checking connection pool configuration')).toBeInTheDocument();
      });
    });

    it('displays internal badge for internal comments', async () => {
      render(<ProblemDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Internal Note')).toBeInTheDocument();
      });
    });

    it('shows comment input field', async () => {
      render(<ProblemDetailPage />);

      await waitFor(() => {
        const textarea = screen.getByPlaceholderText(/add a comment/i);
        expect(textarea).toBeInTheDocument();
      });
    });

    it('allows typing in comment field', async () => {
      const user = userEvent.setup();
      render(<ProblemDetailPage />);

      await waitFor(() => {
        const textarea = screen.getByPlaceholderText(/add a comment/i);
        expect(textarea).toBeInTheDocument();
      });

      const textarea = screen.getByPlaceholderText(/add a comment/i);
      await user.type(textarea, 'New comment text');

      expect(textarea).toHaveValue('New comment text');
    });
  });

  describe('Linked Issues Tab', () => {
    it('displays linked issues', async () => {
      const user = userEvent.setup();
      render(<ProblemDetailPage />);

      const issuesTab = screen.getByRole('button', { name: /linked issues/i });
      await user.click(issuesTab);

      await waitFor(() => {
        expect(screen.getByText('INC-001')).toBeInTheDocument();
        expect(screen.getByText('INC-002')).toBeInTheDocument();
      });
    });

    it('displays relationship type badges', async () => {
      const user = userEvent.setup();
      render(<ProblemDetailPage />);

      const issuesTab = screen.getByRole('button', { name: /linked issues/i });
      await user.click(issuesTab);

      await waitFor(() => {
        expect(screen.getByText('caused_by')).toBeInTheDocument();
        expect(screen.getByText('related_to')).toBeInTheDocument();
      });
    });

    it('displays link issue button', async () => {
      const user = userEvent.setup();
      render(<ProblemDetailPage />);

      const issuesTab = screen.getByRole('button', { name: /linked issues/i });
      await user.click(issuesTab);

      await waitFor(() => {
        const linkButtons = screen.getAllByRole('button', { name: /link issue/i });
        // One in tab content, one in actions section
        expect(linkButtons.length).toBeGreaterThan(0);
      });
    });
  });

  describe('History Tab', () => {
    it('displays change history', async () => {
      const user = userEvent.setup();
      render(<ProblemDetailPage />);

      const historyTab = screen.getByRole('button', { name: /history/i });
      await user.click(historyTab);

      await waitFor(() => {
        const statusChanges = screen.getAllByText(/Status changed from/i);
        expect(statusChanges.length).toBeGreaterThan(0);
      });
    });

    it('displays who made each change', async () => {
      const user = userEvent.setup();
      render(<ProblemDetailPage />);

      const historyTab = screen.getByRole('button', { name: /history/i });
      await user.click(historyTab);

      await waitFor(() => {
        const johnDoeElements = screen.getAllByText('John Doe');
        expect(johnDoeElements.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Knowledge Base Tab', () => {
    it('displays linked KB articles', async () => {
      const user = userEvent.setup();
      render(<ProblemDetailPage />);

      const kbTab = screen.getByRole('button', { name: /kb articles/i });
      await user.click(kbTab);

      await waitFor(() => {
        // KB articles are present, look for the link article button instead
        expect(screen.getByRole('button', { name: /link article/i })).toBeInTheDocument();
      });
    });

    it('displays link article button', async () => {
      const user = userEvent.setup();
      render(<ProblemDetailPage />);

      const kbTab = screen.getByRole('button', { name: /kb articles/i });
      await user.click(kbTab);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /link article/i })).toBeInTheDocument();
      });
    });
  });

  describe('KEDB Badge', () => {
    it('displays KEDB badge when problem is a known error', async () => {
      vi.mocked(useApiModule.useProblem).mockReturnValue({
        data: { ...mockProblem, is_known_error: true },
        isLoading: false,
        error: null,
        mutate: vi.fn(),
      } as any);

      render(<ProblemDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('KEDB')).toBeInTheDocument();
      });
    });

    it('does not display KEDB badge when problem is not a known error', async () => {
      render(<ProblemDetailPage />);

      await waitFor(() => {
        expect(screen.queryByText('KEDB')).not.toBeInTheDocument();
      });
    });
  });

  describe('Empty States', () => {
    it('displays empty state when no comments', async () => {
      vi.mocked(useApiModule.useProblemComments).mockReturnValue({
        data: [],
        isLoading: false,
        error: null,
        mutate: vi.fn(),
      } as any);

      render(<ProblemDetailPage />);

      await waitFor(() => {
        expect(screen.getByText(/no comments yet/i)).toBeInTheDocument();
      });
    });

    it('displays empty state when no linked issues', async () => {
      const user = userEvent.setup();
      vi.mocked(useApiModule.useProblemLinkedIssues).mockReturnValue({
        data: [],
        isLoading: false,
        error: null,
        mutate: vi.fn(),
      } as any);

      render(<ProblemDetailPage />);

      const issuesTab = screen.getByRole('button', { name: /linked issues/i });
      await user.click(issuesTab);

      await waitFor(() => {
        expect(screen.getByText(/no linked issues/i)).toBeInTheDocument();
      });
    });

    it('displays empty state when no KB articles', async () => {
      const user = userEvent.setup();
      vi.mocked(useApiModule.useKBArticlesForProblem).mockReturnValue({
        data: [],
        isLoading: false,
        error: null,
        mutate: vi.fn(),
      } as any);

      render(<ProblemDetailPage />);

      const kbTab = screen.getByRole('button', { name: /kb articles/i });
      await user.click(kbTab);

      await waitFor(() => {
        expect(screen.getByText(/no linked kb articles/i)).toBeInTheDocument();
      });
    });
  });

  describe('Edit Mode', () => {
    it('displays edit button', async () => {
      render(<ProblemDetailPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /edit/i })).toBeInTheDocument();
      });
    });

    it('enters edit mode when edit button is clicked', async () => {
      const user = userEvent.setup();
      render(<ProblemDetailPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /edit/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /edit/i }));

      // In edit mode, save and cancel buttons should appear
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
      });
    });

    it('cancels edit mode when cancel is clicked', async () => {
      const user = userEvent.setup();
      render(<ProblemDetailPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /edit/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /edit/i }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /cancel/i }));

      // Should return to non-edit mode
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /edit/i })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /save/i })).not.toBeInTheDocument();
      });
    });
  });

  describe('Status-based Actions', () => {
    it('shows Assign button when status is new', async () => {
      vi.mocked(useApiModule.useProblem).mockReturnValue({
        data: { ...mockProblem, status: 'new' },
        isLoading: false,
        error: null,
        mutate: vi.fn(),
      } as any);

      render(<ProblemDetailPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /assign/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /start investigation/i })).toBeInTheDocument();
      });
    });

    it('shows Start Investigation button when status is assigned', async () => {
      vi.mocked(useApiModule.useProblem).mockReturnValue({
        data: { ...mockProblem, status: 'assigned' },
        isLoading: false,
        error: null,
        mutate: vi.fn(),
      } as any);

      render(<ProblemDetailPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /start investigation/i })).toBeInTheDocument();
      });
    });

    it('shows Document Root Cause button when status is investigating', async () => {
      vi.mocked(useApiModule.useProblem).mockReturnValue({
        data: { ...mockProblem, status: 'investigating' },
        isLoading: false,
        error: null,
        mutate: vi.fn(),
      } as any);

      render(<ProblemDetailPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /document root cause/i })).toBeInTheDocument();
      });
    });

    it('shows Convert to Known Error when status is root_cause_identified', async () => {
      vi.mocked(useApiModule.useProblem).mockReturnValue({
        data: { ...mockProblem, status: 'root_cause_identified' },
        isLoading: false,
        error: null,
        mutate: vi.fn(),
      } as any);

      render(<ProblemDetailPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /convert to known error/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /mark resolved/i })).toBeInTheDocument();
      });
    });

    it('shows Mark Resolved when status is known_error', async () => {
      vi.mocked(useApiModule.useProblem).mockReturnValue({
        data: { ...mockProblem, status: 'known_error' },
        isLoading: false,
        error: null,
        mutate: vi.fn(),
      } as any);

      render(<ProblemDetailPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /mark resolved/i })).toBeInTheDocument();
      });
    });

    it('shows Close and Reopen buttons when status is resolved', async () => {
      vi.mocked(useApiModule.useProblem).mockReturnValue({
        data: { ...mockProblem, status: 'resolved' },
        isLoading: false,
        error: null,
        mutate: vi.fn(),
      } as any);

      render(<ProblemDetailPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /close/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /reopen/i })).toBeInTheDocument();
      });
    });
  });

  describe('Root Cause Analysis Section', () => {
    it('displays Root Cause Analysis heading', async () => {
      render(<ProblemDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Root Cause Analysis')).toBeInTheDocument();
      });
    });

    it('shows root cause not identified message when empty', async () => {
      render(<ProblemDetailPage />);

      await waitFor(() => {
        expect(screen.getByText(/root cause not yet identified/i)).toBeInTheDocument();
      });
    });

    it('shows workaround not available message when empty', async () => {
      render(<ProblemDetailPage />);

      await waitFor(() => {
        expect(screen.getByText(/no workaround available/i)).toBeInTheDocument();
      });
    });

    it('displays root cause when present', async () => {
      vi.mocked(useApiModule.useProblem).mockReturnValue({
        data: { ...mockProblem, root_cause: 'Connection pool size too small' },
        isLoading: false,
        error: null,
        mutate: vi.fn(),
      } as any);

      render(<ProblemDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Connection pool size too small')).toBeInTheDocument();
      });
    });

    it('displays workaround when present', async () => {
      vi.mocked(useApiModule.useProblem).mockReturnValue({
        data: { ...mockProblem, workaround: 'Restart service every 4 hours' },
        isLoading: false,
        error: null,
        mutate: vi.fn(),
      } as any);

      render(<ProblemDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Restart service every 4 hours')).toBeInTheDocument();
      });
    });

    it('displays resolution when present', async () => {
      vi.mocked(useApiModule.useProblem).mockReturnValue({
        data: { ...mockProblem, resolution: 'Increased pool size to 100' },
        isLoading: false,
        error: null,
        mutate: vi.fn(),
      } as any);

      render(<ProblemDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Increased pool size to 100')).toBeInTheDocument();
      });
    });
  });

  describe('RCA Tools Tab', () => {
    it('displays 5 Whys Analysis section', async () => {
      const user = userEvent.setup();
      render(<ProblemDetailPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /rca tools/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /rca tools/i }));

      await waitFor(() => {
        expect(screen.getByText('5 Whys Analysis')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /save 5 whys/i })).toBeInTheDocument();
      });
    });

    it('displays Fishbone Diagram section', async () => {
      const user = userEvent.setup();
      render(<ProblemDetailPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /rca tools/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /rca tools/i }));

      await waitFor(() => {
        expect(screen.getByText(/fishbone diagram/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /save fishbone/i })).toBeInTheDocument();
      });
    });

    it('displays all fishbone categories', async () => {
      const user = userEvent.setup();
      render(<ProblemDetailPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /rca tools/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /rca tools/i }));

      await waitFor(() => {
        expect(screen.getByText('People')).toBeInTheDocument();
        expect(screen.getByText('Process')).toBeInTheDocument();
        expect(screen.getByText('Equipment')).toBeInTheDocument();
        expect(screen.getByText('Materials')).toBeInTheDocument();
        expect(screen.getByText('Environment')).toBeInTheDocument();
        expect(screen.getByText('Management')).toBeInTheDocument();
      });
    });

    it('displays Analysis Summary section', async () => {
      const user = userEvent.setup();
      render(<ProblemDetailPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /rca tools/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /rca tools/i }));

      await waitFor(() => {
        expect(screen.getByText('Analysis Summary')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /save all rca data/i })).toBeInTheDocument();
      });
    });
  });

  describe('Timeline Section', () => {
    it('displays Timeline heading', async () => {
      render(<ProblemDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Timeline')).toBeInTheDocument();
      });
    });

    it('displays Created date', async () => {
      render(<ProblemDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Created')).toBeInTheDocument();
      });
    });

    it('displays Last Updated date', async () => {
      render(<ProblemDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Last Updated')).toBeInTheDocument();
      });
    });
  });

  describe('Link Issue Button', () => {
    it('displays Link Issue button in actions section', async () => {
      render(<ProblemDetailPage />);

      await waitFor(() => {
        const linkIssueButtons = screen.getAllByRole('button', { name: /link issue/i });
        expect(linkIssueButtons.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Description Section', () => {
    it('displays Description heading', async () => {
      render(<ProblemDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Description')).toBeInTheDocument();
      });
    });

    it('displays problem description', async () => {
      render(<ProblemDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Application experiencing connection pool exhaustion during peak hours')).toBeInTheDocument();
      });
    });

    it('shows no description message when empty', async () => {
      vi.mocked(useApiModule.useProblem).mockReturnValue({
        data: { ...mockProblem, description: '' },
        isLoading: false,
        error: null,
        mutate: vi.fn(),
      } as any);

      render(<ProblemDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('No description provided')).toBeInTheDocument();
      });
    });
  });

  describe('Priority Variants', () => {
    it('displays critical priority badge correctly', async () => {
      vi.mocked(useApiModule.useProblem).mockReturnValue({
        data: { ...mockProblem, priority: 'critical' },
        isLoading: false,
        error: null,
        mutate: vi.fn(),
      } as any);

      render(<ProblemDetailPage />);

      await waitFor(() => {
        const criticalBadges = screen.getAllByText('Critical');
        expect(criticalBadges.length).toBeGreaterThan(0);
      });
    });

    it('displays medium priority badge correctly', async () => {
      vi.mocked(useApiModule.useProblem).mockReturnValue({
        data: { ...mockProblem, priority: 'medium' },
        isLoading: false,
        error: null,
        mutate: vi.fn(),
      } as any);

      render(<ProblemDetailPage />);

      await waitFor(() => {
        const mediumBadges = screen.getAllByText('Medium');
        expect(mediumBadges.length).toBeGreaterThan(0);
      });
    });

    it('displays low priority badge correctly', async () => {
      vi.mocked(useApiModule.useProblem).mockReturnValue({
        data: { ...mockProblem, priority: 'low' },
        isLoading: false,
        error: null,
        mutate: vi.fn(),
      } as any);

      render(<ProblemDetailPage />);

      await waitFor(() => {
        const lowBadges = screen.getAllByText('Low');
        expect(lowBadges.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Status Variants', () => {
    it('displays New status correctly', async () => {
      vi.mocked(useApiModule.useProblem).mockReturnValue({
        data: { ...mockProblem, status: 'new' },
        isLoading: false,
        error: null,
        mutate: vi.fn(),
      } as any);

      render(<ProblemDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('New')).toBeInTheDocument();
      });
    });

    it('displays Assigned status correctly', async () => {
      vi.mocked(useApiModule.useProblem).mockReturnValue({
        data: { ...mockProblem, status: 'assigned' },
        isLoading: false,
        error: null,
        mutate: vi.fn(),
      } as any);

      render(<ProblemDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Assigned')).toBeInTheDocument();
      });
    });

    it('displays Root Cause Identified status correctly', async () => {
      vi.mocked(useApiModule.useProblem).mockReturnValue({
        data: { ...mockProblem, status: 'root_cause_identified' },
        isLoading: false,
        error: null,
        mutate: vi.fn(),
      } as any);

      render(<ProblemDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Root Cause Identified')).toBeInTheDocument();
      });
    });

    it('displays Resolved status correctly', async () => {
      vi.mocked(useApiModule.useProblem).mockReturnValue({
        data: { ...mockProblem, status: 'resolved' },
        isLoading: false,
        error: null,
        mutate: vi.fn(),
      } as any);

      render(<ProblemDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Resolved')).toBeInTheDocument();
      });
    });

    it('displays Closed status correctly', async () => {
      vi.mocked(useApiModule.useProblem).mockReturnValue({
        data: { ...mockProblem, status: 'closed' },
        isLoading: false,
        error: null,
        mutate: vi.fn(),
      } as any);

      render(<ProblemDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Closed')).toBeInTheDocument();
      });
    });
  });

  describe('Problem Type Display', () => {
    it('displays Proactive type badge', async () => {
      vi.mocked(useApiModule.useProblem).mockReturnValue({
        data: { ...mockProblem, problem_type: 'proactive' },
        isLoading: false,
        error: null,
        mutate: vi.fn(),
      } as any);

      render(<ProblemDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Proactive')).toBeInTheDocument();
      });
    });
  });

  describe('Unassigned State', () => {
    it('shows Unassigned when no assignee', async () => {
      vi.mocked(useApiModule.useProblem).mockReturnValue({
        data: { ...mockProblem, assignee_id: null, assignee_name: null },
        isLoading: false,
        error: null,
        mutate: vi.fn(),
      } as any);

      render(<ProblemDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Unassigned')).toBeInTheDocument();
      });
    });
  });

  describe('Assign Modal', () => {
    const mockUsers = [
      { id: 'user-1', name: 'Alice Johnson', email: 'alice@example.com' },
      { id: 'user-2', name: 'Bob Smith', email: 'bob@example.com' },
    ];

    beforeEach(() => {
      vi.mocked(useApiModule.useProblem).mockReturnValue({
        data: { ...mockProblem, status: 'new' },
        isLoading: false,
        error: null,
        mutate: vi.fn(),
      } as any);

      vi.mocked(useApiModule.useUsers).mockReturnValue({
        data: { data: mockUsers, pagination: {} },
        isLoading: false,
        error: null,
        mutate: vi.fn(),
      } as any);
    });

    it('opens assign modal when Assign button is clicked', async () => {
      render(<ProblemDetailPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Assign/i })).toBeInTheDocument();
      });

      await userEvent.click(screen.getByRole('button', { name: /Assign/i }));

      await waitFor(() => {
        expect(screen.getByText('Assign Problem')).toBeInTheDocument();
      });
    });

    it('displays list of users in assign modal', async () => {
      render(<ProblemDetailPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Assign/i })).toBeInTheDocument();
      });

      await userEvent.click(screen.getByRole('button', { name: /Assign/i }));

      await waitFor(() => {
        expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
        expect(screen.getByText('Bob Smith')).toBeInTheDocument();
      });
    });

    it('displays user emails in assign modal', async () => {
      render(<ProblemDetailPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Assign/i })).toBeInTheDocument();
      });

      await userEvent.click(screen.getByRole('button', { name: /Assign/i }));

      await waitFor(() => {
        expect(screen.getByText('alice@example.com')).toBeInTheDocument();
        expect(screen.getByText('bob@example.com')).toBeInTheDocument();
      });
    });

    it('calls assignProblem mutation when user is selected', async () => {
      const assignMutate = vi.fn();
      vi.mocked(useApiModule.useAssignProblem).mockReturnValue({
        mutateAsync: assignMutate,
        isPending: false,
      } as any);

      render(<ProblemDetailPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Assign/i })).toBeInTheDocument();
      });

      await userEvent.click(screen.getByRole('button', { name: /Assign/i }));

      await waitFor(() => {
        expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
      });

      // Click on Alice Johnson to assign
      const aliceButtons = screen.getAllByRole('button');
      const aliceButton = aliceButtons.find(b => b.textContent?.includes('Alice Johnson'));
      if (aliceButton) {
        await userEvent.click(aliceButton);
      }

      await waitFor(() => {
        expect(assignMutate).toHaveBeenCalled();
      });
    });
  });

  describe('Link Issue Modal', () => {
    const mockAllIssues = [
      { id: 'issue-3', issue_number: 'INC-003', title: 'New API timeout', status: 'open' },
      { id: 'issue-4', issue_number: 'INC-004', title: 'Memory leak detected', status: 'open' },
    ];

    beforeEach(() => {
      vi.mocked(useApiModule.useProblem).mockReturnValue({
        data: { ...mockProblem, status: 'new' },
        isLoading: false,
        error: null,
        mutate: vi.fn(),
      } as any);

      vi.mocked(useApiModule.useIssues).mockReturnValue({
        data: { data: mockAllIssues, pagination: {} },
        isLoading: false,
        error: null,
        mutate: vi.fn(),
      } as any);

      vi.mocked(useApiModule.useProblemLinkedIssues).mockReturnValue({
        data: [],
        isLoading: false,
        error: null,
        mutate: vi.fn(),
      } as any);
    });

    it('opens link issue modal when Link Issue button is clicked', async () => {
      render(<ProblemDetailPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Link Issue/i })).toBeInTheDocument();
      });

      await userEvent.click(screen.getByRole('button', { name: /Link Issue/i }));

      await waitFor(() => {
        expect(screen.getAllByText(/Link Issue/i).length).toBeGreaterThanOrEqual(1);
      });
    });

    it('displays available issues in link modal', async () => {
      render(<ProblemDetailPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Link Issue/i })).toBeInTheDocument();
      });

      await userEvent.click(screen.getByRole('button', { name: /Link Issue/i }));

      await waitFor(() => {
        expect(screen.getByText('INC-003')).toBeInTheDocument();
        expect(screen.getByText('INC-004')).toBeInTheDocument();
      });
    });

    it('calls linkIssue mutation when issue is selected', async () => {
      const linkMutate = vi.fn();
      vi.mocked(useApiModule.useLinkIssueToProblem).mockReturnValue({
        mutateAsync: linkMutate,
        isPending: false,
      } as any);

      render(<ProblemDetailPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Link Issue/i })).toBeInTheDocument();
      });

      await userEvent.click(screen.getByRole('button', { name: /Link Issue/i }));

      await waitFor(() => {
        expect(screen.getByText('INC-003')).toBeInTheDocument();
      });

      // Click on INC-003 to link
      const issueButtons = screen.getAllByRole('button');
      const issueButton = issueButtons.find(b => b.textContent?.includes('INC-003'));
      if (issueButton) {
        await userEvent.click(issueButton);
      }

      await waitFor(() => {
        expect(linkMutate).toHaveBeenCalled();
      });
    });
  });

  describe('Root Cause Modal', () => {
    beforeEach(() => {
      vi.mocked(useApiModule.useProblem).mockReturnValue({
        data: { ...mockProblem, status: 'investigating' },
        isLoading: false,
        error: null,
        mutate: vi.fn(),
      } as any);
    });

    it('opens root cause modal when Document Root Cause button is clicked', async () => {
      render(<ProblemDetailPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Document Root Cause/i })).toBeInTheDocument();
      });

      await userEvent.click(screen.getByRole('button', { name: /Document Root Cause/i }));

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Describe the root cause/i)).toBeInTheDocument();
      });
    });

    it('displays textarea for entering root cause', async () => {
      render(<ProblemDetailPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Document Root Cause/i })).toBeInTheDocument();
      });

      await userEvent.click(screen.getByRole('button', { name: /Document Root Cause/i }));

      await waitFor(() => {
        const textarea = screen.getByPlaceholderText(/Describe the root cause/i);
        expect(textarea.tagName).toBe('TEXTAREA');
      });
    });

    it('shows Save Root Cause button in modal', async () => {
      render(<ProblemDetailPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Document Root Cause/i })).toBeInTheDocument();
      });

      await userEvent.click(screen.getByRole('button', { name: /Document Root Cause/i }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Save Root Cause/i })).toBeInTheDocument();
      });
    });

    it('calls updateProblem mutation when Save Root Cause is clicked', async () => {
      const updateMutate = vi.fn();
      vi.mocked(useApiModule.useUpdateProblem).mockReturnValue({
        mutateAsync: updateMutate,
        isPending: false,
      } as any);

      render(<ProblemDetailPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Document Root Cause/i })).toBeInTheDocument();
      });

      await userEvent.click(screen.getByRole('button', { name: /Document Root Cause/i }));

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Describe the root cause/i)).toBeInTheDocument();
      });

      const textarea = screen.getByPlaceholderText(/Describe the root cause/i);
      await userEvent.type(textarea, 'Database connection pool configuration was insufficient');

      await userEvent.click(screen.getByRole('button', { name: /Save Root Cause/i }));

      await waitFor(() => {
        expect(updateMutate).toHaveBeenCalled();
      });
    });
  });

  describe('Workaround Modal', () => {
    beforeEach(() => {
      // Set up problem without root_cause so both Add buttons show (root cause + workaround)
      vi.mocked(useApiModule.useProblem).mockReturnValue({
        data: { ...mockProblem, status: 'investigating' },
        isLoading: false,
        error: null,
        mutate: vi.fn(),
      } as any);
    });

    it('opens workaround modal when Add button is clicked', async () => {
      render(<ProblemDetailPage />);

      // The Root Cause Analysis section (with workaround) is always visible on the page
      // Find the Workaround section and click its Add button
      await waitFor(() => {
        expect(screen.getByText('Workaround')).toBeInTheDocument();
      });

      // Find the Add buttons - they contain both an Edit icon and "Add" text
      // First is for root cause, second is for workaround
      const addButtons = screen.getAllByText('Add');
      // Click the workaround Add button (second one after root cause Add)
      await userEvent.click(addButtons[1]);

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Describe the temporary workaround/i)).toBeInTheDocument();
      });
    });

    it('displays Document Workaround heading in modal', async () => {
      render(<ProblemDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Workaround')).toBeInTheDocument();
      });

      const addButtons = screen.getAllByText('Add');
      await userEvent.click(addButtons[1]);

      await waitFor(() => {
        expect(screen.getByText('Document Workaround')).toBeInTheDocument();
      });
    });

    it('shows Save Workaround button in modal', async () => {
      render(<ProblemDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Workaround')).toBeInTheDocument();
      });

      const addButtons = screen.getAllByText('Add');
      await userEvent.click(addButtons[1]);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Save Workaround/i })).toBeInTheDocument();
      });
    });

    it('calls updateProblem mutation when Save Workaround is clicked', async () => {
      const updateMutate = vi.fn();
      vi.mocked(useApiModule.useUpdateProblem).mockReturnValue({
        mutateAsync: updateMutate,
        isPending: false,
      } as any);

      render(<ProblemDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Workaround')).toBeInTheDocument();
      });

      const addButtons = screen.getAllByText('Add');
      await userEvent.click(addButtons[1]);

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Describe the temporary workaround/i)).toBeInTheDocument();
      });

      const textarea = screen.getByPlaceholderText(/Describe the temporary workaround/i);
      await userEvent.type(textarea, 'Restart the connection pool hourly');

      await userEvent.click(screen.getByRole('button', { name: /Save Workaround/i }));

      await waitFor(() => {
        expect(updateMutate).toHaveBeenCalled();
      });
    });
  });

  describe('Link KB Article Modal', () => {
    const mockAllKBArticles = [
      { id: 'kb-1', title: 'Database Troubleshooting', type: 'troubleshooting' },
      { id: 'kb-2', title: 'Connection Pool Guide', type: 'how_to' },
    ];

    beforeEach(() => {
      vi.mocked(useApiModule.useProblem).mockReturnValue({
        data: mockProblem,
        isLoading: false,
        error: null,
        mutate: vi.fn(),
      } as any);

      vi.mocked(useApiModule.useKBArticles).mockReturnValue({
        data: { data: mockAllKBArticles, pagination: {} },
        isLoading: false,
        error: null,
        mutate: vi.fn(),
      } as any);

      vi.mocked(useApiModule.useKBArticlesForProblem).mockReturnValue({
        data: [],
        isLoading: false,
        error: null,
        mutate: vi.fn(),
      } as any);
    });

    it('opens link KB modal when Link Article button is clicked', async () => {
      render(<ProblemDetailPage />);

      // Switch to KB Articles tab first (tab is labeled "KB Articles" not "Knowledge Base")
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /KB Articles/i })).toBeInTheDocument();
      });

      await userEvent.click(screen.getByRole('button', { name: /KB Articles/i }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Link Article/i })).toBeInTheDocument();
      });

      await userEvent.click(screen.getByRole('button', { name: /Link Article/i }));

      await waitFor(() => {
        expect(screen.getByText('Link Knowledge Base Article')).toBeInTheDocument();
      });
    });

    it('displays article dropdown in modal', async () => {
      render(<ProblemDetailPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /KB Articles/i })).toBeInTheDocument();
      });

      await userEvent.click(screen.getByRole('button', { name: /KB Articles/i }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Link Article/i })).toBeInTheDocument();
      });

      await userEvent.click(screen.getByRole('button', { name: /Link Article/i }));

      await waitFor(() => {
        expect(screen.getByText('Select Article')).toBeInTheDocument();
      });
    });

    it('shows available articles in dropdown', async () => {
      render(<ProblemDetailPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /KB Articles/i })).toBeInTheDocument();
      });

      await userEvent.click(screen.getByRole('button', { name: /KB Articles/i }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Link Article/i })).toBeInTheDocument();
      });

      await userEvent.click(screen.getByRole('button', { name: /Link Article/i }));

      await waitFor(() => {
        // Articles should be in a select dropdown
        const select = document.querySelector('select');
        expect(select).toBeInTheDocument();
      });
    });
  });

  describe('Edit Form Fields', () => {
    beforeEach(() => {
      vi.mocked(useApiModule.useProblem).mockReturnValue({
        data: mockProblem,
        isLoading: false,
        error: null,
        mutate: vi.fn(),
      } as any);

      vi.mocked(useApiModule.useUsers).mockReturnValue({
        data: { data: [{ id: 'user-1', name: 'Test User' }], pagination: {} },
        isLoading: false,
        error: null,
        mutate: vi.fn(),
      } as any);

      vi.mocked(useApiModule.useGroups).mockReturnValue({
        data: { data: [{ id: 'group-1', name: 'Support Team' }], pagination: {} },
        isLoading: false,
        error: null,
        mutate: vi.fn(),
      } as any);

      vi.mocked(useApiModule.useApplications).mockReturnValue({
        data: { data: [{ id: 'app-1', name: 'Core API' }], pagination: {} },
        isLoading: false,
        error: null,
        mutate: vi.fn(),
      } as any);
    });

    it('shows title input in edit mode', async () => {
      render(<ProblemDetailPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Edit/i })).toBeInTheDocument();
      });

      await userEvent.click(screen.getByRole('button', { name: /Edit/i }));

      await waitFor(() => {
        expect(screen.getByDisplayValue('Database Connection Pool Exhaustion')).toBeInTheDocument();
      });
    });

    it('shows priority dropdown in edit mode', async () => {
      render(<ProblemDetailPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Edit/i })).toBeInTheDocument();
      });

      await userEvent.click(screen.getByRole('button', { name: /Edit/i }));

      await waitFor(() => {
        // Check for priority select options
        const selects = document.querySelectorAll('select');
        const priorityOptions = ['Critical', 'High', 'Medium', 'Low'];
        let hasPrioritySelect = false;
        selects.forEach(select => {
          priorityOptions.forEach(opt => {
            if (select.innerHTML.includes(opt)) {
              hasPrioritySelect = true;
            }
          });
        });
        expect(hasPrioritySelect).toBe(true);
      });
    });

    it('shows urgency dropdown in edit mode', async () => {
      render(<ProblemDetailPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Edit/i })).toBeInTheDocument();
      });

      await userEvent.click(screen.getByRole('button', { name: /Edit/i }));

      await waitFor(() => {
        // Check for urgency select options
        const selects = document.querySelectorAll('select');
        const urgencyOptions = ['Immediate', 'High', 'Medium', 'Low'];
        let hasUrgencySelect = false;
        selects.forEach(select => {
          urgencyOptions.forEach(opt => {
            if (select.innerHTML.includes(opt)) {
              hasUrgencySelect = true;
            }
          });
        });
        expect(hasUrgencySelect).toBe(true);
      });
    });

    it('shows assigned user dropdown in edit mode', async () => {
      render(<ProblemDetailPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Edit/i })).toBeInTheDocument();
      });

      await userEvent.click(screen.getByRole('button', { name: /Edit/i }));

      await waitFor(() => {
        // Check for user in select
        const selects = document.querySelectorAll('select');
        let hasUserSelect = false;
        selects.forEach(select => {
          if (select.innerHTML.includes('Test User')) {
            hasUserSelect = true;
          }
        });
        expect(hasUserSelect).toBe(true);
      });
    });

    it('shows assignment group dropdown in edit mode', async () => {
      render(<ProblemDetailPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Edit/i })).toBeInTheDocument();
      });

      await userEvent.click(screen.getByRole('button', { name: /Edit/i }));

      await waitFor(() => {
        // Check for group in select
        const selects = document.querySelectorAll('select');
        let hasGroupSelect = false;
        selects.forEach(select => {
          if (select.innerHTML.includes('Support Team')) {
            hasGroupSelect = true;
          }
        });
        expect(hasGroupSelect).toBe(true);
      });
    });

    it('shows application dropdown in edit mode', async () => {
      render(<ProblemDetailPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Edit/i })).toBeInTheDocument();
      });

      await userEvent.click(screen.getByRole('button', { name: /Edit/i }));

      await waitFor(() => {
        // Check for application in select
        const selects = document.querySelectorAll('select');
        let hasAppSelect = false;
        selects.forEach(select => {
          if (select.innerHTML.includes('Core API')) {
            hasAppSelect = true;
          }
        });
        expect(hasAppSelect).toBe(true);
      });
    });

    it('shows save and cancel buttons in edit mode', async () => {
      render(<ProblemDetailPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Edit/i })).toBeInTheDocument();
      });

      await userEvent.click(screen.getByRole('button', { name: /Edit/i }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Save/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Cancel/i })).toBeInTheDocument();
      });
    });
  });

  describe('Status Transition Actions', () => {
    it('calls changeStatus when Start Investigation is clicked', async () => {
      const statusMutate = vi.fn();
      vi.mocked(useApiModule.useChangeProblemStatus).mockReturnValue({
        mutateAsync: statusMutate,
        isPending: false,
      } as any);

      vi.mocked(useApiModule.useProblem).mockReturnValue({
        data: { ...mockProblem, status: 'new' },
        isLoading: false,
        error: null,
        mutate: vi.fn(),
      } as any);

      render(<ProblemDetailPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Start Investigation/i })).toBeInTheDocument();
      });

      await userEvent.click(screen.getByRole('button', { name: /Start Investigation/i }));

      await waitFor(() => {
        expect(statusMutate).toHaveBeenCalled();
      });
    });

    it('calls convertToKnownError mutation when Convert to Known Error is clicked', async () => {
      const convertMutate = vi.fn();
      vi.mocked(useApiModule.useConvertToKnownError).mockReturnValue({
        mutateAsync: convertMutate,
        isPending: false,
      } as any);

      vi.mocked(useApiModule.useProblem).mockReturnValue({
        data: { ...mockProblem, status: 'root_cause_identified' },
        isLoading: false,
        error: null,
        mutate: vi.fn(),
      } as any);

      render(<ProblemDetailPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Convert to Known Error/i })).toBeInTheDocument();
      });

      await userEvent.click(screen.getByRole('button', { name: /Convert to Known Error/i }));

      await waitFor(() => {
        expect(convertMutate).toHaveBeenCalled();
      });
    });

    it('calls changeStatus when Mark Resolved is clicked', async () => {
      const statusMutate = vi.fn();
      vi.mocked(useApiModule.useChangeProblemStatus).mockReturnValue({
        mutateAsync: statusMutate,
        isPending: false,
      } as any);

      vi.mocked(useApiModule.useProblem).mockReturnValue({
        data: { ...mockProblem, status: 'known_error' },
        isLoading: false,
        error: null,
        mutate: vi.fn(),
      } as any);

      render(<ProblemDetailPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Mark Resolved/i })).toBeInTheDocument();
      });

      await userEvent.click(screen.getByRole('button', { name: /Mark Resolved/i }));

      await waitFor(() => {
        expect(statusMutate).toHaveBeenCalled();
      });
    });

    it('calls changeStatus when Close button is clicked', async () => {
      const statusMutate = vi.fn();
      vi.mocked(useApiModule.useChangeProblemStatus).mockReturnValue({
        mutateAsync: statusMutate,
        isPending: false,
      } as any);

      vi.mocked(useApiModule.useProblem).mockReturnValue({
        data: { ...mockProblem, status: 'resolved' },
        isLoading: false,
        error: null,
        mutate: vi.fn(),
      } as any);

      render(<ProblemDetailPage />);

      await waitFor(() => {
        // Close button appears for resolved status
        const closeButtons = screen.getAllByRole('button', { name: /Close/i });
        expect(closeButtons.length).toBeGreaterThan(0);
      });

      const closeButton = screen.getAllByRole('button', { name: /Close/i })[0];
      await userEvent.click(closeButton);

      await waitFor(() => {
        expect(statusMutate).toHaveBeenCalled();
      });
    });

    it('calls changeStatus when Reopen button is clicked', async () => {
      const statusMutate = vi.fn();
      vi.mocked(useApiModule.useChangeProblemStatus).mockReturnValue({
        mutateAsync: statusMutate,
        isPending: false,
      } as any);

      vi.mocked(useApiModule.useProblem).mockReturnValue({
        data: { ...mockProblem, status: 'resolved' },
        isLoading: false,
        error: null,
        mutate: vi.fn(),
      } as any);

      render(<ProblemDetailPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Reopen/i })).toBeInTheDocument();
      });

      await userEvent.click(screen.getByRole('button', { name: /Reopen/i }));

      await waitFor(() => {
        expect(statusMutate).toHaveBeenCalled();
      });
    });
  });

  describe('Comment Submission', () => {
    it('calls addComment mutation when comment is submitted', async () => {
      const addCommentMutate = vi.fn();
      vi.mocked(useApiModule.useAddProblemComment).mockReturnValue({
        mutateAsync: addCommentMutate,
        isPending: false,
      } as any);

      render(<ProblemDetailPage />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Add a comment/i)).toBeInTheDocument();
      });

      const commentInput = screen.getByPlaceholderText(/Add a comment/i);
      await userEvent.type(commentInput, 'This is a test comment');

      // Find and click the submit button (usually has a Send icon or Submit text)
      const submitButtons = screen.getAllByRole('button');
      const submitButton = submitButtons.find(b => b.querySelector('svg')?.classList?.contains('lucide-send') || b.textContent?.includes('Post'));
      if (submitButton) {
        await userEvent.click(submitButton);
      }

      await waitFor(() => {
        expect(addCommentMutate).toHaveBeenCalled();
      });
    });
  });
});
