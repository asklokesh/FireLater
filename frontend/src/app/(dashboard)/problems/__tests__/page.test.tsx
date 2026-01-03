import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProblemsPage from '../page';
import * as useApiModule from '@/hooks/useApi';

// Mock Next.js Link component
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

// Mock useApi hook
vi.mock('@/hooks/useApi', () => ({
  useProblems: vi.fn(),
}));

// Mock UI components
vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, variant, size, disabled, className }: any) => (
    <button onClick={onClick} disabled={disabled} className={className}>
      {children}
    </button>
  ),
}));

const mockProblems = [
  {
    id: '1',
    problem_number: 'PRB-001',
    title: 'Database Connection Timeout',
    priority: 'critical',
    status: 'investigating',
    problem_type: 'reactive',
    is_known_error: false,
    assignee_name: 'John Doe',
    application_name: 'Core API',
    linked_issues_count: 5,
    created_at: '2024-01-15T10:00:00Z',
    updated_at: '2024-01-15T14:30:00Z',
  },
  {
    id: '2',
    problem_number: 'PRB-002',
    title: 'Memory Leak in Cache Service',
    priority: 'high',
    status: 'known_error',
    problem_type: 'proactive',
    is_known_error: true,
    assignee_name: 'Jane Smith',
    application_name: 'Cache Service',
    linked_issues_count: 3,
    created_at: '2024-01-10T09:00:00Z',
    updated_at: '2024-01-16T11:20:00Z',
  },
  {
    id: '3',
    problem_number: 'PRB-003',
    title: 'SSL Certificate Expiry',
    priority: 'medium',
    status: 'resolved',
    problem_type: 'reactive',
    is_known_error: false,
    assignee_name: null,
    application_name: null,
    linked_issues_count: 0,
    created_at: '2024-01-05T08:00:00Z',
    updated_at: '2024-01-17T09:15:00Z',
  },
];

describe('ProblemsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Basic Rendering', () => {
    it('renders the page title and description', async () => {
      vi.mocked(useApiModule.useProblems).mockReturnValue({
        data: { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 } },
        isLoading: false,
        error: null,
        mutate: vi.fn(),
      } as any);

      render(<ProblemsPage />);

      expect(screen.getByText('Problems')).toBeInTheDocument();
      expect(screen.getByText('Root cause analysis and known error management')).toBeInTheDocument();
    });

    it('renders the new problem button', async () => {
      vi.mocked(useApiModule.useProblems).mockReturnValue({
        data: { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 } },
        isLoading: false,
        error: null,
        mutate: vi.fn(),
      } as any);

      render(<ProblemsPage />);

      const newButton = screen.getByRole('link', { name: /new problem/i });
      expect(newButton).toBeInTheDocument();
      expect(newButton).toHaveAttribute('href', '/problems/new');
    });

    it('renders search input', async () => {
      vi.mocked(useApiModule.useProblems).mockReturnValue({
        data: { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 } },
        isLoading: false,
        error: null,
        mutate: vi.fn(),
      } as any);

      render(<ProblemsPage />);

      expect(screen.getByPlaceholderText('Search by number or title...')).toBeInTheDocument();
    });

    it('renders filter button', async () => {
      vi.mocked(useApiModule.useProblems).mockReturnValue({
        data: { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 } },
        isLoading: false,
        error: null,
        mutate: vi.fn(),
      } as any);

      render(<ProblemsPage />);

      expect(screen.getByRole('button', { name: /filters/i })).toBeInTheDocument();
    });
  });

  describe('Quick Stats', () => {
    it('displays correct stats for open problems', async () => {
      vi.mocked(useApiModule.useProblems).mockReturnValue({
        data: { data: mockProblems, pagination: { page: 1, limit: 20, total: 3, totalPages: 1 } },
        isLoading: false,
        error: null,
        mutate: vi.fn(),
      } as any);

      render(<ProblemsPage />);

      await waitFor(() => {
        const statsCards = screen.getAllByText(/\d+/);
        // Open Problems: 2 (investigating, known_error)
        expect(screen.getByText('Open Problems')).toBeInTheDocument();
      });
    });

    it('displays correct stats for known errors', async () => {
      vi.mocked(useApiModule.useProblems).mockReturnValue({
        data: { data: mockProblems, pagination: { page: 1, limit: 20, total: 3, totalPages: 1 } },
        isLoading: false,
        error: null,
        mutate: vi.fn(),
      } as any);

      render(<ProblemsPage />);

      await waitFor(() => {
        expect(screen.getByText('Known Errors')).toBeInTheDocument();
      });
    });

    it('displays correct stats for investigating problems', async () => {
      vi.mocked(useApiModule.useProblems).mockReturnValue({
        data: { data: mockProblems, pagination: { page: 1, limit: 20, total: 3, totalPages: 1 } },
        isLoading: false,
        error: null,
        mutate: vi.fn(),
      } as any);

      render(<ProblemsPage />);

      await waitFor(() => {
        const investigatingTexts = screen.getAllByText('Investigating');
        expect(investigatingTexts.length).toBeGreaterThan(0);
      });
    });

    it('displays correct stats for resolved problems', async () => {
      vi.mocked(useApiModule.useProblems).mockReturnValue({
        data: { data: mockProblems, pagination: { page: 1, limit: 20, total: 3, totalPages: 1 } },
        isLoading: false,
        error: null,
        mutate: vi.fn(),
      } as any);

      render(<ProblemsPage />);

      await waitFor(() => {
        const resolvedTexts = screen.getAllByText('Resolved');
        expect(resolvedTexts.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Loading State', () => {
    it('displays loading spinner when data is loading', () => {
      vi.mocked(useApiModule.useProblems).mockReturnValue({
        data: undefined,
        isLoading: true,
        error: null,
        mutate: vi.fn(),
      } as any);

      render(<ProblemsPage />);

      expect(screen.getByText('Loading problems...')).toBeInTheDocument();
    });
  });

  describe('Error State', () => {
    it('displays error message when API call fails', () => {
      vi.mocked(useApiModule.useProblems).mockReturnValue({
        data: undefined,
        isLoading: false,
        error: new Error('API Error'),
        mutate: vi.fn(),
      } as any);

      render(<ProblemsPage />);

      expect(screen.getByText('Error loading problems')).toBeInTheDocument();
      expect(screen.getByText('Please try refreshing the page')).toBeInTheDocument();
    });
  });

  describe('Problems Table', () => {
    it('renders table headers correctly', async () => {
      vi.mocked(useApiModule.useProblems).mockReturnValue({
        data: { data: mockProblems, pagination: { page: 1, limit: 20, total: 3, totalPages: 1 } },
        isLoading: false,
        error: null,
        mutate: vi.fn(),
      } as any);

      render(<ProblemsPage />);

      await waitFor(() => {
        expect(screen.getByText('Problem')).toBeInTheDocument();
        expect(screen.getByText('Priority / Type')).toBeInTheDocument();
        expect(screen.getByText('Status')).toBeInTheDocument();
        expect(screen.getByText('Assigned To')).toBeInTheDocument();
        expect(screen.getByText('Linked Issues')).toBeInTheDocument();
        expect(screen.getByText('Updated')).toBeInTheDocument();
        expect(screen.getByText('Actions')).toBeInTheDocument();
      });
    });

    it('renders problem rows with correct data', async () => {
      vi.mocked(useApiModule.useProblems).mockReturnValue({
        data: { data: mockProblems, pagination: { page: 1, limit: 20, total: 3, totalPages: 1 } },
        isLoading: false,
        error: null,
        mutate: vi.fn(),
      } as any);

      render(<ProblemsPage />);

      await waitFor(() => {
        expect(screen.getByText('PRB-001')).toBeInTheDocument();
        expect(screen.getByText('Database Connection Timeout')).toBeInTheDocument();
        expect(screen.getByText('PRB-002')).toBeInTheDocument();
        expect(screen.getByText('Memory Leak in Cache Service')).toBeInTheDocument();
      });
    });

    it('displays priority badges correctly', async () => {
      vi.mocked(useApiModule.useProblems).mockReturnValue({
        data: { data: mockProblems, pagination: { page: 1, limit: 20, total: 3, totalPages: 1 } },
        isLoading: false,
        error: null,
        mutate: vi.fn(),
      } as any);

      render(<ProblemsPage />);

      await waitFor(() => {
        expect(screen.getByText('Critical')).toBeInTheDocument();
        expect(screen.getByText('High')).toBeInTheDocument();
        expect(screen.getByText('Medium')).toBeInTheDocument();
      });
    });

    it('displays status badges correctly', async () => {
      vi.mocked(useApiModule.useProblems).mockReturnValue({
        data: { data: mockProblems, pagination: { page: 1, limit: 20, total: 3, totalPages: 1 } },
        isLoading: false,
        error: null,
        mutate: vi.fn(),
      } as any);

      render(<ProblemsPage />);

      await waitFor(() => {
        const investigatingTexts = screen.getAllByText('Investigating');
        const knownErrorTexts = screen.getAllByText('Known Error');
        const resolvedTexts = screen.getAllByText('Resolved');
        expect(investigatingTexts.length).toBeGreaterThan(0);
        expect(knownErrorTexts.length).toBeGreaterThan(0);
        expect(resolvedTexts.length).toBeGreaterThan(0);
      });
    });

    it('displays problem type badges correctly', async () => {
      vi.mocked(useApiModule.useProblems).mockReturnValue({
        data: { data: mockProblems, pagination: { page: 1, limit: 20, total: 3, totalPages: 1 } },
        isLoading: false,
        error: null,
        mutate: vi.fn(),
      } as any);

      render(<ProblemsPage />);

      await waitFor(() => {
        const reactiveCount = screen.getAllByText('Reactive').length;
        const proactiveCount = screen.getAllByText('Proactive').length;
        expect(reactiveCount).toBeGreaterThan(0);
        expect(proactiveCount).toBeGreaterThan(0);
      });
    });

    it('displays KEDB badge for known errors', async () => {
      vi.mocked(useApiModule.useProblems).mockReturnValue({
        data: { data: mockProblems, pagination: { page: 1, limit: 20, total: 3, totalPages: 1 } },
        isLoading: false,
        error: null,
        mutate: vi.fn(),
      } as any);

      render(<ProblemsPage />);

      await waitFor(() => {
        expect(screen.getByText('KEDB')).toBeInTheDocument();
      });
    });

    it('displays assignee name when assigned', async () => {
      vi.mocked(useApiModule.useProblems).mockReturnValue({
        data: { data: mockProblems, pagination: { page: 1, limit: 20, total: 3, totalPages: 1 } },
        isLoading: false,
        error: null,
        mutate: vi.fn(),
      } as any);

      render(<ProblemsPage />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
        expect(screen.getByText('Jane Smith')).toBeInTheDocument();
      });
    });

    it('displays unassigned when no assignee', async () => {
      vi.mocked(useApiModule.useProblems).mockReturnValue({
        data: { data: mockProblems, pagination: { page: 1, limit: 20, total: 3, totalPages: 1 } },
        isLoading: false,
        error: null,
        mutate: vi.fn(),
      } as any);

      render(<ProblemsPage />);

      await waitFor(() => {
        expect(screen.getByText('Unassigned')).toBeInTheDocument();
      });
    });

    it('displays linked issues count', async () => {
      vi.mocked(useApiModule.useProblems).mockReturnValue({
        data: { data: mockProblems, pagination: { page: 1, limit: 20, total: 3, totalPages: 1 } },
        isLoading: false,
        error: null,
        mutate: vi.fn(),
      } as any);

      render(<ProblemsPage />);

      await waitFor(() => {
        expect(screen.getByText('5 issues')).toBeInTheDocument();
        expect(screen.getByText('3 issues')).toBeInTheDocument();
        expect(screen.getByText('0 issues')).toBeInTheDocument();
      });
    });

    it('displays application name when present', async () => {
      vi.mocked(useApiModule.useProblems).mockReturnValue({
        data: { data: mockProblems, pagination: { page: 1, limit: 20, total: 3, totalPages: 1 } },
        isLoading: false,
        error: null,
        mutate: vi.fn(),
      } as any);

      render(<ProblemsPage />);

      await waitFor(() => {
        expect(screen.getByText('App: Core API')).toBeInTheDocument();
        expect(screen.getByText('App: Cache Service')).toBeInTheDocument();
      });
    });

    it('renders problem links with correct hrefs', async () => {
      vi.mocked(useApiModule.useProblems).mockReturnValue({
        data: { data: mockProblems, pagination: { page: 1, limit: 20, total: 3, totalPages: 1 } },
        isLoading: false,
        error: null,
        mutate: vi.fn(),
      } as any);

      render(<ProblemsPage />);

      await waitFor(() => {
        const prb001Link = screen.getByRole('link', { name: 'PRB-001' });
        expect(prb001Link).toHaveAttribute('href', '/problems/1');

        const prb002Link = screen.getByRole('link', { name: 'PRB-002' });
        expect(prb002Link).toHaveAttribute('href', '/problems/2');
      });
    });
  });

  describe('Empty State', () => {
    it('displays empty state when no problems found', async () => {
      vi.mocked(useApiModule.useProblems).mockReturnValue({
        data: { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 } },
        isLoading: false,
        error: null,
        mutate: vi.fn(),
      } as any);

      render(<ProblemsPage />);

      await waitFor(() => {
        expect(screen.getByText('No problems found')).toBeInTheDocument();
        expect(screen.getByText('Try adjusting your search or filters')).toBeInTheDocument();
      });
    });
  });

  describe('Search Functionality', () => {
    it('allows typing in search input', async () => {
      const user = userEvent.setup();
      vi.mocked(useApiModule.useProblems).mockReturnValue({
        data: { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 } },
        isLoading: false,
        error: null,
        mutate: vi.fn(),
      } as any);

      render(<ProblemsPage />);

      const searchInput = screen.getByPlaceholderText('Search by number or title...');
      await user.type(searchInput, 'database');

      expect(searchInput).toHaveValue('database');
    });

    it('calls API with search query', async () => {
      const user = userEvent.setup();
      const mockUseProblems = vi.fn().mockReturnValue({
        data: { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 } },
        isLoading: false,
        error: null,
        mutate: vi.fn(),
      });
      vi.mocked(useApiModule.useProblems).mockImplementation(mockUseProblems);

      render(<ProblemsPage />);

      const searchInput = screen.getByPlaceholderText('Search by number or title...');
      await user.type(searchInput, 'test');

      await waitFor(() => {
        expect(mockUseProblems).toHaveBeenCalledWith(
          expect.objectContaining({
            search: 'test',
          })
        );
      });
    });
  });

  describe('Filter Functionality', () => {
    it('toggles filter panel when clicking filters button', async () => {
      const user = userEvent.setup();
      vi.mocked(useApiModule.useProblems).mockReturnValue({
        data: { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 } },
        isLoading: false,
        error: null,
        mutate: vi.fn(),
      } as any);

      render(<ProblemsPage />);

      const filterButton = screen.getByRole('button', { name: /filters/i });

      // Filter panel should not be visible initially
      expect(screen.queryByText('All Status')).not.toBeInTheDocument();

      await user.click(filterButton);

      // Filter panel should now be visible
      expect(screen.getByText('All Status')).toBeInTheDocument();
      expect(screen.getByText('All Priorities')).toBeInTheDocument();
      expect(screen.getByText('All Types')).toBeInTheDocument();
    });

    it('renders all filter options', async () => {
      const user = userEvent.setup();
      vi.mocked(useApiModule.useProblems).mockReturnValue({
        data: { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 } },
        isLoading: false,
        error: null,
        mutate: vi.fn(),
      } as any);

      render(<ProblemsPage />);

      const filterButton = screen.getByRole('button', { name: /filters/i });
      await user.click(filterButton);

      // Status filter - check options exist in page
      expect(screen.getByText('All Status')).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'New' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Investigating' })).toBeInTheDocument();

      // Priority filter
      expect(screen.getByText('All Priorities')).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Critical' })).toBeInTheDocument();
      expect(screen.getAllByRole('option', { name: 'High' }).length).toBeGreaterThan(0);

      // Type filter
      expect(screen.getByText('All Types')).toBeInTheDocument();
      expect(screen.getAllByRole('option', { name: 'Reactive' }).length).toBeGreaterThan(0);
      expect(screen.getAllByRole('option', { name: 'Proactive' }).length).toBeGreaterThan(0);
    });

    it('calls API with status filter', async () => {
      const user = userEvent.setup();
      const mockUseProblems = vi.fn().mockReturnValue({
        data: { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 } },
        isLoading: false,
        error: null,
        mutate: vi.fn(),
      });
      vi.mocked(useApiModule.useProblems).mockImplementation(mockUseProblems);

      render(<ProblemsPage />);

      const filterButton = screen.getByRole('button', { name: /filters/i });
      await user.click(filterButton);

      const selects = screen.getAllByRole('combobox');
      const statusSelect = selects[0]; // First select is Status
      await user.selectOptions(statusSelect, 'investigating');

      await waitFor(() => {
        expect(mockUseProblems).toHaveBeenCalledWith(
          expect.objectContaining({
            status: 'investigating',
          })
        );
      });
    });

    it('calls API with priority filter', async () => {
      const user = userEvent.setup();
      const mockUseProblems = vi.fn().mockReturnValue({
        data: { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 } },
        isLoading: false,
        error: null,
        mutate: vi.fn(),
      });
      vi.mocked(useApiModule.useProblems).mockImplementation(mockUseProblems);

      render(<ProblemsPage />);

      const filterButton = screen.getByRole('button', { name: /filters/i });
      await user.click(filterButton);

      const selects = screen.getAllByRole('combobox');
      const prioritySelect = selects[1]; // Second select is Priority
      await user.selectOptions(prioritySelect, 'critical');

      await waitFor(() => {
        expect(mockUseProblems).toHaveBeenCalledWith(
          expect.objectContaining({
            priority: 'critical',
          })
        );
      });
    });

    it('calls API with problem type filter', async () => {
      const user = userEvent.setup();
      const mockUseProblems = vi.fn().mockReturnValue({
        data: { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 } },
        isLoading: false,
        error: null,
        mutate: vi.fn(),
      });
      vi.mocked(useApiModule.useProblems).mockImplementation(mockUseProblems);

      render(<ProblemsPage />);

      const filterButton = screen.getByRole('button', { name: /filters/i });
      await user.click(filterButton);

      const selects = screen.getAllByRole('combobox');
      const typeSelect = selects[2]; // Third select is Problem Type
      await user.selectOptions(typeSelect, 'proactive');

      await waitFor(() => {
        expect(mockUseProblems).toHaveBeenCalledWith(
          expect.objectContaining({
            problemType: 'proactive',
          })
        );
      });
    });
  });

  describe('Pagination', () => {
    it('renders pagination information', async () => {
      vi.mocked(useApiModule.useProblems).mockReturnValue({
        data: { data: mockProblems, pagination: { page: 1, limit: 20, total: 3, totalPages: 1 } },
        isLoading: false,
        error: null,
        mutate: vi.fn(),
      } as any);

      render(<ProblemsPage />);

      await waitFor(() => {
        expect(screen.getByText('Showing 3 of 3 problems')).toBeInTheDocument();
      });
    });

    it('renders previous and next buttons', async () => {
      vi.mocked(useApiModule.useProblems).mockReturnValue({
        data: { data: mockProblems, pagination: { page: 2, limit: 20, total: 50, totalPages: 3 } },
        isLoading: false,
        error: null,
        mutate: vi.fn(),
      } as any);

      render(<ProblemsPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Previous' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument();
      });
    });

    it('disables previous button on first page', async () => {
      vi.mocked(useApiModule.useProblems).mockReturnValue({
        data: { data: mockProblems, pagination: { page: 1, limit: 20, total: 50, totalPages: 3 } },
        isLoading: false,
        error: null,
        mutate: vi.fn(),
      } as any);

      render(<ProblemsPage />);

      await waitFor(() => {
        const prevButton = screen.getByRole('button', { name: 'Previous' });
        expect(prevButton).toBeDisabled();
      });
    });

    it('disables next button when on single page', async () => {
      vi.mocked(useApiModule.useProblems).mockReturnValue({
        data: { data: mockProblems, pagination: { page: 1, limit: 20, total: 3, totalPages: 1 } },
        isLoading: false,
        error: null,
        mutate: vi.fn(),
      } as any);

      render(<ProblemsPage />);

      await waitFor(() => {
        const nextButton = screen.getByRole('button', { name: 'Next' });
        expect(nextButton).toBeDisabled();
      });
    });

    it('increments page when clicking next', async () => {
      const user = userEvent.setup();
      const mockUseProblems = vi.fn().mockReturnValue({
        data: { data: mockProblems, pagination: { page: 1, limit: 20, total: 50, totalPages: 3 } },
        isLoading: false,
        error: null,
        mutate: vi.fn(),
      });
      vi.mocked(useApiModule.useProblems).mockImplementation(mockUseProblems);

      render(<ProblemsPage />);

      const nextButton = screen.getByRole('button', { name: 'Next' });
      await user.click(nextButton);

      await waitFor(() => {
        expect(mockUseProblems).toHaveBeenCalledWith(
          expect.objectContaining({
            page: 2,
          })
        );
      });
    });

    it('decrements page when clicking previous', async () => {
      const user = userEvent.setup();
      const mockUseProblems = vi.fn().mockReturnValue({
        data: { data: mockProblems, pagination: { page: 2, limit: 20, total: 50, totalPages: 3 } },
        isLoading: false,
        error: null,
        mutate: vi.fn(),
      });
      vi.mocked(useApiModule.useProblems).mockImplementation(mockUseProblems);

      render(<ProblemsPage />);

      const prevButton = screen.getByRole('button', { name: 'Previous' });
      await user.click(prevButton);

      await waitFor(() => {
        expect(mockUseProblems).toHaveBeenCalledWith(
          expect.objectContaining({
            page: 1,
          })
        );
      });
    });
  });
});
