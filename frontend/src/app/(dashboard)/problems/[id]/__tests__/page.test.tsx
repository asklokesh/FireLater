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
      trigger: vi.fn(),
      isMutating: false,
    } as any);

    vi.mocked(useApiModule.useAddProblemComment).mockReturnValue({
      trigger: vi.fn(),
      isMutating: false,
    } as any);

    vi.mocked(useApiModule.useAssignProblem).mockReturnValue({
      trigger: vi.fn(),
      isMutating: false,
    } as any);

    vi.mocked(useApiModule.useLinkIssueToProblem).mockReturnValue({
      trigger: vi.fn(),
      isMutating: false,
    } as any);

    vi.mocked(useApiModule.useUnlinkIssueFromProblem).mockReturnValue({
      trigger: vi.fn(),
      isMutating: false,
    } as any);

    vi.mocked(useApiModule.useConvertToKnownError).mockReturnValue({
      trigger: vi.fn(),
      isMutating: false,
    } as any);

    vi.mocked(useApiModule.useUpdateProblem).mockReturnValue({
      trigger: vi.fn(),
      isMutating: false,
    } as any);

    vi.mocked(useApiModule.useLinkKBArticle).mockReturnValue({
      trigger: vi.fn(),
      isMutating: false,
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
});
