import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import IssuesPage from '../page';
import * as useApiHooks from '@/hooks/useApi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock Next.js Link
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

// Mock Next.js router
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockIssuesData = {
  data: [
    {
      id: '1',
      issue_number: 'ISS-001',
      title: 'API timeout errors',
      description: 'Users experiencing timeout errors',
      status: 'in_progress',
      priority: 'high',
      created_at: '2026-01-10T10:00:00Z',
      updated_at: '2026-01-10T10:00:00Z',
      reporter_name: 'John Doe',
      assignee_name: 'Jane Smith',
      application_name: 'Core API',
      category: 'performance',
    },
    {
      id: '2',
      issue_number: 'ISS-002',
      title: 'Login page not loading',
      description: 'Login page shows blank screen',
      status: 'new',
      priority: 'critical',
      created_at: '2026-01-11T10:00:00Z',
      updated_at: '2026-01-11T10:00:00Z',
      reporter_name: 'Bob Johnson',
      assignee_name: null,
      application_name: 'Auth Service',
      category: 'bug',
    },
    {
      id: '3',
      issue_number: 'ISS-003',
      title: 'Feature request: Dark mode',
      description: 'Add dark mode to application',
      status: 'resolved',
      priority: 'low',
      created_at: '2026-01-09T10:00:00Z',
      updated_at: '2026-01-12T10:00:00Z',
      reporter_name: 'Alice Williams',
      assignee_name: 'Jane Smith',
      application_name: 'Web Portal',
      category: 'enhancement',
    },
  ],
  pagination: {
    page: 1,
    limit: 20,
    total: 3,
    totalPages: 1,
  },
};

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('IssuesPage', () => {
  let mockUseIssues: ReturnType<typeof vi.fn>;
  let mockUseChangeIssueStatus: ReturnType<typeof vi.fn>;
  let mockUseDeleteIssue: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockUseIssues = vi.fn(() => ({
      data: mockIssuesData,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    }));

    mockUseChangeIssueStatus = vi.fn(() => ({
      mutateAsync: vi.fn(),
      isPending: false,
    }));

    mockUseDeleteIssue = vi.fn(() => ({
      mutateAsync: vi.fn(),
      isPending: false,
    }));

    vi.spyOn(useApiHooks, 'useIssues').mockImplementation(mockUseIssues);
    vi.spyOn(useApiHooks, 'useChangeIssueStatus').mockImplementation(mockUseChangeIssueStatus);
    vi.spyOn(useApiHooks, 'useDeleteIssue').mockImplementation(mockUseDeleteIssue);
  });

  describe('Basic Rendering', () => {
    it('renders page title and description', () => {
      render(<IssuesPage />, { wrapper: createWrapper() });

      expect(screen.getByText('Issues')).toBeInTheDocument();
      expect(screen.getByText(/Manage and track IT incidents/i)).toBeInTheDocument();
    });

    it('renders new issue button', () => {
      render(<IssuesPage />, { wrapper: createWrapper() });

      const newIssueButton = screen.getByText('New Issue').closest('a');
      expect(newIssueButton).toHaveAttribute('href', '/issues/new');
    });

    it('renders search input', () => {
      render(<IssuesPage />, { wrapper: createWrapper() });

      expect(screen.getByPlaceholderText(/Search by number or title/i)).toBeInTheDocument();
    });

    it('renders filter button', () => {
      render(<IssuesPage />, { wrapper: createWrapper() });

      expect(screen.getByText(/Filters/i)).toBeInTheDocument();
    });
  });

  describe('Issue List', () => {
    it('displays issue numbers', () => {
      render(<IssuesPage />, { wrapper: createWrapper() });

      expect(screen.getByText('ISS-001')).toBeInTheDocument();
      expect(screen.getByText('ISS-002')).toBeInTheDocument();
      expect(screen.getByText('ISS-003')).toBeInTheDocument();
    });

    it('displays issue titles', () => {
      render(<IssuesPage />, { wrapper: createWrapper() });

      expect(screen.getByText('API timeout errors')).toBeInTheDocument();
      expect(screen.getByText('Login page not loading')).toBeInTheDocument();
      expect(screen.getByText('Feature request: Dark mode')).toBeInTheDocument();
    });

    it('displays issue status badges', () => {
      render(<IssuesPage />, { wrapper: createWrapper() });

      expect(screen.getByText('New')).toBeInTheDocument();
      expect(screen.getByText('In Progress')).toBeInTheDocument();
      expect(screen.getByText('Resolved')).toBeInTheDocument();
    });

    it('displays priority badges', () => {
      render(<IssuesPage />, { wrapper: createWrapper() });

      expect(screen.getByText('Critical')).toBeInTheDocument();
      expect(screen.getByText('High')).toBeInTheDocument();
      expect(screen.getByText('Low')).toBeInTheDocument();
    });


    it('displays application names', () => {
      render(<IssuesPage />, { wrapper: createWrapper() });

      expect(screen.getByText(/Core API/)).toBeInTheDocument();
      expect(screen.getByText(/Auth Service/)).toBeInTheDocument();
      expect(screen.getByText(/Web Portal/)).toBeInTheDocument();
    });

    it('handles unassigned issues', () => {
      render(<IssuesPage />, { wrapper: createWrapper() });

      const unassignedElements = screen.getAllByText(/Unassigned/i);
      expect(unassignedElements.length).toBeGreaterThan(0);
    });
  });

  describe('Filter Panel', () => {
    it('toggles filter panel on button click', () => {
      render(<IssuesPage />, { wrapper: createWrapper() });

      const filterButton = screen.getByText(/Filters/i);
      fireEvent.click(filterButton);

      const statusLabels = screen.getAllByText(/Status/i);
      expect(statusLabels.length).toBeGreaterThan(0);
    });

    it('shows status filter options', () => {
      render(<IssuesPage />, { wrapper: createWrapper() });

      const filterButton = screen.getByText(/Filters/i);
      fireEvent.click(filterButton);

      const statusSelects = screen.getAllByDisplayValue(/All Status/i);
      expect(statusSelects.length).toBeGreaterThan(0);
    });

    it('shows priority filter options', () => {
      render(<IssuesPage />, { wrapper: createWrapper() });

      const filterButton = screen.getByText(/Filters/i);
      fireEvent.click(filterButton);

      const prioritySelects = screen.getAllByDisplayValue(/All Priorities/i);
      expect(prioritySelects.length).toBeGreaterThan(0);
    });

    it('shows assigned to filter options', () => {
      render(<IssuesPage />, { wrapper: createWrapper() });

      const filterButton = screen.getByText(/Filters/i);
      fireEvent.click(filterButton);

      const assignedSelects = screen.getAllByDisplayValue(/All/i);
      expect(assignedSelects.length).toBeGreaterThan(0);
    });
  });

  describe('Search', () => {
    it('allows entering search query', () => {
      render(<IssuesPage />, { wrapper: createWrapper() });

      const searchInput = screen.getByPlaceholderText(/Search by number or title/i);
      fireEvent.change(searchInput, { target: { value: 'timeout' } });

      expect(searchInput).toHaveValue('timeout');
    });
  });

  describe('Loading State', () => {
    it('shows loading indicator when fetching issues', () => {
      mockUseIssues.mockReturnValue({
        data: null,
        isLoading: true,
        error: null,
        refetch: vi.fn(),
      });

      render(<IssuesPage />, { wrapper: createWrapper() });

      expect(screen.queryByText('ISS-001')).not.toBeInTheDocument();
    });
  });

  describe('Error State', () => {
    it('shows error message when fetch fails', () => {
      mockUseIssues.mockReturnValue({
        data: null,
        isLoading: false,
        error: { message: 'Failed to load issues' },
        refetch: vi.fn(),
      });

      render(<IssuesPage />, { wrapper: createWrapper() });

      expect(screen.getByText(/Error loading issues/i)).toBeInTheDocument();
    });

    it('shows retry message on error', () => {
      mockUseIssues.mockReturnValue({
        data: null,
        isLoading: false,
        error: { message: 'Network error' },
        refetch: vi.fn(),
      });

      render(<IssuesPage />, { wrapper: createWrapper() });

      expect(screen.getByText(/Please try refreshing/i)).toBeInTheDocument();
    });
  });

  describe('Empty State', () => {
    it('shows empty state when no issues', () => {
      mockUseIssues.mockReturnValue({
        data: { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 } },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<IssuesPage />, { wrapper: createWrapper() });

      expect(screen.getByText(/No issues found/i)).toBeInTheDocument();
    });

    it('shows suggestion to adjust filters in empty state', () => {
      mockUseIssues.mockReturnValue({
        data: { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 } },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<IssuesPage />, { wrapper: createWrapper() });

      expect(screen.getByText(/Try adjusting your search or filters/i)).toBeInTheDocument();
    });
  });

  describe('Pagination', () => {
    it('shows pagination count when there are multiple pages', () => {
      mockUseIssues.mockReturnValue({
        data: {
          data: mockIssuesData.data,
          pagination: { page: 1, limit: 20, total: 50, totalPages: 3 },
        },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<IssuesPage />, { wrapper: createWrapper() });

      expect(screen.getByText(/Showing 3 of 50 issues/i)).toBeInTheDocument();
    });

    it('shows next button when not on last page', () => {
      mockUseIssues.mockReturnValue({
        data: {
          data: mockIssuesData.data,
          pagination: { page: 1, limit: 20, total: 50, totalPages: 3 },
        },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<IssuesPage />, { wrapper: createWrapper() });

      const nextButton = screen.getByText('Next');
      expect(nextButton).toBeInTheDocument();
      expect(nextButton).not.toBeDisabled();
    });

    it('shows previous button', () => {
      mockUseIssues.mockReturnValue({
        data: {
          data: mockIssuesData.data,
          pagination: { page: 1, limit: 20, total: 50, totalPages: 3 },
        },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<IssuesPage />, { wrapper: createWrapper() });

      expect(screen.getByText('Previous')).toBeInTheDocument();
    });

    it('disables previous button on first page', () => {
      mockUseIssues.mockReturnValue({
        data: {
          data: mockIssuesData.data,
          pagination: { page: 1, limit: 20, total: 50, totalPages: 3 },
        },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<IssuesPage />, { wrapper: createWrapper() });

      const prevButton = screen.getByText('Previous');
      expect(prevButton).toBeDisabled();
    });

    it('enables next button when there are more pages', () => {
      mockUseIssues.mockReturnValue({
        data: {
          data: mockIssuesData.data,
          pagination: { page: 1, limit: 20, total: 50, totalPages: 3 },
        },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<IssuesPage />, { wrapper: createWrapper() });

      const nextButton = screen.getByText('Next');
      expect(nextButton).not.toBeDisabled();
    });
  });

  describe('Status Variations', () => {
    it('displays assigned status correctly', () => {
      mockUseIssues.mockReturnValue({
        data: {
          data: [{
            ...mockIssuesData.data[0],
            status: 'assigned',
          }],
          pagination: mockIssuesData.pagination,
        },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<IssuesPage />, { wrapper: createWrapper() });

      expect(screen.getByText('Assigned')).toBeInTheDocument();
    });

    it('displays pending status correctly', () => {
      mockUseIssues.mockReturnValue({
        data: {
          data: [{
            ...mockIssuesData.data[0],
            status: 'pending',
          }],
          pagination: mockIssuesData.pagination,
        },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<IssuesPage />, { wrapper: createWrapper() });

      expect(screen.getByText('Pending')).toBeInTheDocument();
    });

    it('displays closed status correctly', () => {
      mockUseIssues.mockReturnValue({
        data: {
          data: [{
            ...mockIssuesData.data[0],
            status: 'closed',
          }],
          pagination: mockIssuesData.pagination,
        },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<IssuesPage />, { wrapper: createWrapper() });

      expect(screen.getByText('Closed')).toBeInTheDocument();
    });
  });

  describe('Priority Variations', () => {
    it('displays medium priority correctly', () => {
      mockUseIssues.mockReturnValue({
        data: {
          data: [{
            ...mockIssuesData.data[0],
            priority: 'medium',
          }],
          pagination: mockIssuesData.pagination,
        },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<IssuesPage />, { wrapper: createWrapper() });

      expect(screen.getByText('Medium')).toBeInTheDocument();
    });
  });
});
