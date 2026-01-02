import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import ChangesPage from '../page';
import * as useApiHooks from '@/hooks/useApi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock Next.js Link
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  Plus: () => <div data-testid="plus-icon" />,
  Search: () => <div data-testid="search-icon" />,
  Filter: () => <div data-testid="filter-icon" />,
  ChevronDown: () => <div data-testid="chevron-down-icon" />,
  GitBranch: () => <div data-testid="git-branch-icon" />,
  Calendar: () => <div data-testid="calendar-icon" />,
  MoreHorizontal: () => <div data-testid="more-horizontal-icon" />,
  Loader2: () => <div data-testid="loader-icon" />,
}));

// Mock Button component
vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, variant, size, disabled, className }: any) => (
    <button onClick={onClick} disabled={disabled} className={className} data-variant={variant} data-size={size}>
      {children}
    </button>
  ),
}));

const mockChangesData = {
  data: [
    {
      id: '1',
      change_number: 'CHG-001',
      title: 'Deploy new API version',
      type: 'standard',
      risk_level: 'medium',
      status: 'scheduled',
      planned_start: '2026-01-03T14:00:00Z',
      planned_end: '2026-01-03T16:00:00Z',
      implementer_name: 'John Doe',
      application_name: 'Core API',
    },
    {
      id: '2',
      change_number: 'CHG-002',
      title: 'Emergency security patch',
      type: 'emergency',
      risk_level: 'critical',
      status: 'implementing',
      planned_start: '2026-01-02T20:00:00Z',
      planned_end: '2026-01-02T22:00:00Z',
      requester_name: 'Jane Smith',
      application_name: 'Auth Service',
    },
    {
      id: '3',
      change_number: 'CHG-003',
      title: 'Database migration',
      type: 'normal',
      risk_level: 'high',
      status: 'draft',
      planned_start: null,
      planned_end: null,
      implementer_name: null,
      requester_name: 'Bob Johnson',
      application_name: null,
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

describe('ChangesPage', () => {
  let mockUseChanges: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockUseChanges = vi.fn(() => ({
      data: mockChangesData,
      isLoading: false,
      error: null,
    }));

    vi.spyOn(useApiHooks, 'useChanges').mockImplementation(mockUseChanges);
  });

  describe('Basic Rendering', () => {
    it('renders page title and description', () => {
      render(<ChangesPage />, { wrapper: createWrapper() });

      expect(screen.getByText('Changes')).toBeInTheDocument();
      expect(screen.getByText('Manage and track change requests')).toBeInTheDocument();
    });

    it('renders new change button', () => {
      render(<ChangesPage />, { wrapper: createWrapper() });

      const newChangeButton = screen.getByText('New Change').closest('a');
      expect(newChangeButton).toHaveAttribute('href', '/changes/new');
    });

    it('renders search input', () => {
      render(<ChangesPage />, { wrapper: createWrapper() });

      const searchInput = screen.getByPlaceholderText('Search by number or title...');
      expect(searchInput).toBeInTheDocument();
    });

    it('renders filters button', () => {
      render(<ChangesPage />, { wrapper: createWrapper() });

      expect(screen.getByText('Filters')).toBeInTheDocument();
    });

    it('renders table headers', () => {
      render(<ChangesPage />, { wrapper: createWrapper() });

      const table = screen.getByRole('table');
      expect(within(table).getByText('Change')).toBeInTheDocument();
      expect(within(table).getByText('Type / Risk')).toBeInTheDocument();
      expect(within(table).getByText('Status')).toBeInTheDocument();
      expect(within(table).getAllByText('Scheduled')[0]).toBeInTheDocument(); // Header
      expect(within(table).getByText('Implementer')).toBeInTheDocument();
      expect(within(table).getByText('Actions')).toBeInTheDocument();
    });
  });

  describe('Loading State', () => {
    it('shows loading state when data is loading', () => {
      mockUseChanges.mockReturnValue({
        data: undefined,
        isLoading: true,
        error: null,
      });

      render(<ChangesPage />, { wrapper: createWrapper() });

      expect(screen.getByText('Loading changes...')).toBeInTheDocument();
      expect(screen.getByTestId('loader-icon')).toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    it('shows error message when loading fails', () => {
      mockUseChanges.mockReturnValue({
        data: undefined,
        isLoading: false,
        error: new Error('API Error'),
      });

      render(<ChangesPage />, { wrapper: createWrapper() });

      expect(screen.getByText('Error loading changes')).toBeInTheDocument();
      expect(screen.getByText('Please try refreshing the page')).toBeInTheDocument();
    });
  });

  describe('Changes List', () => {
    it('displays all changes from API', () => {
      render(<ChangesPage />, { wrapper: createWrapper() });

      expect(screen.getByText('CHG-001')).toBeInTheDocument();
      expect(screen.getByText('Deploy new API version')).toBeInTheDocument();

      expect(screen.getByText('CHG-002')).toBeInTheDocument();
      expect(screen.getByText('Emergency security patch')).toBeInTheDocument();

      expect(screen.getByText('CHG-003')).toBeInTheDocument();
      expect(screen.getByText('Database migration')).toBeInTheDocument();
    });

    it('displays change types correctly', () => {
      render(<ChangesPage />, { wrapper: createWrapper() });

      expect(screen.getByText('Standard')).toBeInTheDocument();
      expect(screen.getByText('Emergency')).toBeInTheDocument();
      expect(screen.getByText('Normal')).toBeInTheDocument();
    });

    it('displays risk levels correctly', () => {
      render(<ChangesPage />, { wrapper: createWrapper() });

      expect(screen.getByText('Medium Risk')).toBeInTheDocument();
      expect(screen.getByText('Critical Risk')).toBeInTheDocument();
      expect(screen.getByText('High Risk')).toBeInTheDocument();
    });

    it('displays status badges correctly', () => {
      render(<ChangesPage />, { wrapper: createWrapper() });

      const table = screen.getByRole('table');
      expect(within(table).getAllByText('Scheduled').length).toBeGreaterThan(0);
      expect(within(table).getByText('Implementing')).toBeInTheDocument();
      expect(within(table).getByText('Draft')).toBeInTheDocument();
    });

    it('displays application names when available', () => {
      render(<ChangesPage />, { wrapper: createWrapper() });

      expect(screen.getByText('App: Core API')).toBeInTheDocument();
      expect(screen.getByText('App: Auth Service')).toBeInTheDocument();
    });

    it('displays implementer names when available', () => {
      render(<ChangesPage />, { wrapper: createWrapper() });

      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    it('displays requester when implementer not assigned', () => {
      render(<ChangesPage />, { wrapper: createWrapper() });

      expect(screen.getByText('Jane Smith')).toBeInTheDocument();
      expect(screen.getAllByText('Requester').length).toBeGreaterThan(0);
    });

    it('displays requester when no implementer assigned', () => {
      render(<ChangesPage />, { wrapper: createWrapper() });

      // CHG-003 has requester but no implementer
      expect(screen.getByText('Bob Johnson')).toBeInTheDocument();
    });

    it('displays scheduled dates when available', () => {
      render(<ChangesPage />, { wrapper: createWrapper() });

      // Should show formatted dates for scheduled changes
      const scheduledCells = screen.getAllByTestId('calendar-icon');
      expect(scheduledCells.length).toBeGreaterThan(0);
    });

    it('displays not scheduled when dates missing', () => {
      render(<ChangesPage />, { wrapper: createWrapper() });

      expect(screen.getByText('Not scheduled')).toBeInTheDocument();
    });

    it('renders change links with correct href', () => {
      render(<ChangesPage />, { wrapper: createWrapper() });

      const changeLink = screen.getByText('CHG-001').closest('a');
      expect(changeLink).toHaveAttribute('href', '/changes/1');
    });
  });

  describe('Search Functionality', () => {
    it('filters changes by change number', () => {
      render(<ChangesPage />, { wrapper: createWrapper() });

      const searchInput = screen.getByPlaceholderText('Search by number or title...');
      fireEvent.change(searchInput, { target: { value: 'CHG-001' } });

      expect(screen.getByText('CHG-001')).toBeInTheDocument();
      expect(screen.queryByText('CHG-002')).not.toBeInTheDocument();
      expect(screen.queryByText('CHG-003')).not.toBeInTheDocument();
    });

    it('filters changes by title', () => {
      render(<ChangesPage />, { wrapper: createWrapper() });

      const searchInput = screen.getByPlaceholderText('Search by number or title...');
      fireEvent.change(searchInput, { target: { value: 'security' } });

      expect(screen.getByText('CHG-002')).toBeInTheDocument();
      expect(screen.queryByText('CHG-001')).not.toBeInTheDocument();
      expect(screen.queryByText('CHG-003')).not.toBeInTheDocument();
    });

    it('search is case-insensitive', () => {
      render(<ChangesPage />, { wrapper: createWrapper() });

      const searchInput = screen.getByPlaceholderText('Search by number or title...');
      fireEvent.change(searchInput, { target: { value: 'EMERGENCY' } });

      expect(screen.getByText('CHG-002')).toBeInTheDocument();
    });

    it('shows all changes when search is cleared', () => {
      render(<ChangesPage />, { wrapper: createWrapper() });

      const searchInput = screen.getByPlaceholderText('Search by number or title...');
      fireEvent.change(searchInput, { target: { value: 'security' } });
      fireEvent.change(searchInput, { target: { value: '' } });

      expect(screen.getByText('CHG-001')).toBeInTheDocument();
      expect(screen.getByText('CHG-002')).toBeInTheDocument();
      expect(screen.getByText('CHG-003')).toBeInTheDocument();
    });
  });

  describe('Filter Panel', () => {
    it('hides filters by default', () => {
      render(<ChangesPage />, { wrapper: createWrapper() });

      expect(screen.queryByText('All Statuses')).not.toBeInTheDocument();
    });

    it('shows filters when filters button is clicked', () => {
      render(<ChangesPage />, { wrapper: createWrapper() });

      const filtersButton = screen.getByText('Filters').closest('button');
      fireEvent.click(filtersButton!);

      expect(screen.getByText('All Statuses')).toBeInTheDocument();
      expect(screen.getByText('All Types')).toBeInTheDocument();
      expect(screen.getByText('All Risk Levels')).toBeInTheDocument();
    });

    it('toggles filters visibility on button click', () => {
      render(<ChangesPage />, { wrapper: createWrapper() });

      const filtersButton = screen.getByText('Filters').closest('button');

      fireEvent.click(filtersButton!);
      expect(screen.getByText('All Statuses')).toBeInTheDocument();

      fireEvent.click(filtersButton!);
      expect(screen.queryByText('All Statuses')).not.toBeInTheDocument();
    });

    it('renders status filter options', () => {
      render(<ChangesPage />, { wrapper: createWrapper() });

      fireEvent.click(screen.getByText('Filters').closest('button')!);

      const statusLabel = screen.getByText('Status', { selector: 'label' });
      const statusSelect = statusLabel.nextElementSibling as HTMLElement;
      expect(within(statusSelect).getByText('All Statuses')).toBeInTheDocument();
      expect(within(statusSelect).getByText('Draft')).toBeInTheDocument();
      expect(within(statusSelect).getByText('Scheduled')).toBeInTheDocument();
      expect(within(statusSelect).getByText('Completed')).toBeInTheDocument();
    });

    it('renders type filter options', () => {
      render(<ChangesPage />, { wrapper: createWrapper() });

      fireEvent.click(screen.getByText('Filters').closest('button')!);

      const typeLabel = screen.getByText('Type', { selector: 'label' });
      const typeSelect = typeLabel.nextElementSibling as HTMLElement;
      expect(within(typeSelect).getByText('All Types')).toBeInTheDocument();
      expect(within(typeSelect).getByText('Standard')).toBeInTheDocument();
      expect(within(typeSelect).getByText('Normal')).toBeInTheDocument();
      expect(within(typeSelect).getByText('Emergency')).toBeInTheDocument();
    });

    it('renders risk filter options', () => {
      render(<ChangesPage />, { wrapper: createWrapper() });

      fireEvent.click(screen.getByText('Filters').closest('button')!);

      const riskLabel = screen.getByText('Risk Level', { selector: 'label' });
      const riskSelect = riskLabel.nextElementSibling as HTMLElement;
      expect(within(riskSelect).getByText('All Risk Levels')).toBeInTheDocument();
      expect(within(riskSelect).getByText('Low')).toBeInTheDocument();
      expect(within(riskSelect).getByText('Medium')).toBeInTheDocument();
      expect(within(riskSelect).getByText('High')).toBeInTheDocument();
      expect(within(riskSelect).getByText('Critical')).toBeInTheDocument();
    });
  });

  describe('Empty State', () => {
    it('shows empty state when no changes exist', () => {
      mockUseChanges.mockReturnValue({
        data: { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 } },
        isLoading: false,
        error: null,
      });

      render(<ChangesPage />, { wrapper: createWrapper() });

      expect(screen.getByText('No changes found')).toBeInTheDocument();
      expect(screen.getByText('Try adjusting your search or filters')).toBeInTheDocument();
    });

    it('shows empty state when search has no results', () => {
      render(<ChangesPage />, { wrapper: createWrapper() });

      const searchInput = screen.getByPlaceholderText('Search by number or title...');
      fireEvent.change(searchInput, { target: { value: 'nonexistent' } });

      expect(screen.getByText('No changes found')).toBeInTheDocument();
    });
  });

  describe('Pagination', () => {
    it('displays pagination info', () => {
      render(<ChangesPage />, { wrapper: createWrapper() });

      expect(screen.getByText('Showing 3 of 3 changes')).toBeInTheDocument();
    });

    it('renders previous and next buttons', () => {
      render(<ChangesPage />, { wrapper: createWrapper() });

      expect(screen.getByText('Previous')).toBeInTheDocument();
      expect(screen.getByText('Next')).toBeInTheDocument();
    });

    it('disables previous button on first page', () => {
      render(<ChangesPage />, { wrapper: createWrapper() });

      const previousButton = screen.getByText('Previous').closest('button');
      expect(previousButton).toBeDisabled();
    });

    it('disables next button on last page', () => {
      render(<ChangesPage />, { wrapper: createWrapper() });

      const nextButton = screen.getByText('Next').closest('button');
      expect(nextButton).toBeDisabled();
    });

    it('enables next button when more pages exist', () => {
      mockUseChanges.mockReturnValue({
        data: { ...mockChangesData, pagination: { page: 1, limit: 20, total: 50, totalPages: 3 } },
        isLoading: false,
        error: null,
      });

      render(<ChangesPage />, { wrapper: createWrapper() });

      const nextButton = screen.getByText('Next').closest('button');
      expect(nextButton).not.toBeDisabled();
    });
  });
});
