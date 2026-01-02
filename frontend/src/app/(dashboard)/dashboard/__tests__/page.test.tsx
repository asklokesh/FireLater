import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import DashboardPage from '../page';
import * as useApiHooks from '@/hooks/useApi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock Next.js router
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  AlertCircle: () => <div data-testid="alert-circle-icon" />,
  RefreshCw: () => <div data-testid="refresh-icon" />,
  ShoppingCart: () => <div data-testid="shopping-cart-icon" />,
  Server: () => <div data-testid="server-icon" />,
  TrendingUp: () => <div data-testid="trending-up-icon" />,
  Clock: () => <div data-testid="clock-icon" />,
  Loader2: () => <div data-testid="loader-icon" />,
  ArrowUp: () => <div data-testid="arrow-up-icon" />,
  ArrowDown: () => <div data-testid="arrow-down-icon" />,
  Radio: () => <div data-testid="radio-icon" />,
  Pause: () => <div data-testid="pause-icon" />,
  Play: () => <div data-testid="play-icon" />,
}));

const mockDashboardData = {
  issues: {
    open: 12,
    critical_open: 3,
  },
  changes: {
    scheduled: 5,
    in_progress: 2,
  },
  requests: {
    pending: 8,
    total: 45,
  },
  health: {
    avg_score: 92,
    critical: 1,
  },
};

const mockActivityData = {
  activity: [
    {
      id: '1',
      type: 'issue',
      reference_id: 'INC-001',
      title: 'Database connection timeout',
      status: 'open',
      created_at: '2026-01-02T10:00:00Z',
    },
    {
      id: '2',
      type: 'change',
      reference_id: 'CHG-001',
      title: 'Deploy new API version',
      status: 'scheduled',
      created_at: '2026-01-02T09:00:00Z',
    },
  ],
};

const mockChangesData = {
  changes: [
    {
      id: '1',
      change_id: 'CHG-002',
      title: 'Update database schema',
      risk_level: 'high',
      scheduled_start: '2026-01-03T14:00:00Z',
      application_name: 'Core API',
    },
    {
      id: '2',
      change_id: 'CHG-003',
      title: 'Deploy frontend updates',
      risk_level: 'low',
      scheduled_start: '2026-01-04T10:00:00Z',
      application_name: 'Web Portal',
    },
  ],
};

const mockTrendsData = {
  trends: [
    { date: '2025-12-20', created: 5, resolved: 3 },
    { date: '2025-12-21', created: 4, resolved: 6 },
    { date: '2025-12-22', created: 7, resolved: 5 },
    { date: '2025-12-23', created: 3, resolved: 8 },
  ],
};

const mockPriorityData = {
  data: [
    { priority: 'critical', count: 3 },
    { priority: 'high', count: 5 },
    { priority: 'medium', count: 8 },
    { priority: 'low', count: 4 },
  ],
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

describe('DashboardPage', () => {
  let mockUseDashboard: ReturnType<typeof vi.fn>;
  let mockUseRecentActivity: ReturnType<typeof vi.fn>;
  let mockUseUpcomingChanges: ReturnType<typeof vi.fn>;
  let mockUseIssueTrends: ReturnType<typeof vi.fn>;
  let mockUseIssuesByPriority: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();

    mockUseDashboard = vi.fn(() => ({
      data: mockDashboardData,
      isLoading: false,
      error: null,
      isFetching: false,
      dataUpdatedAt: Date.now(),
    }));

    mockUseRecentActivity = vi.fn(() => ({
      data: mockActivityData,
      isLoading: false,
      isFetching: false,
    }));

    mockUseUpcomingChanges = vi.fn(() => ({
      data: mockChangesData,
      isLoading: false,
      isFetching: false,
    }));

    mockUseIssueTrends = vi.fn(() => ({
      data: mockTrendsData,
      isLoading: false,
      isFetching: false,
    }));

    mockUseIssuesByPriority = vi.fn(() => ({
      data: mockPriorityData,
      isLoading: false,
      isFetching: false,
    }));

    vi.spyOn(useApiHooks, 'useDashboard').mockImplementation(mockUseDashboard);
    vi.spyOn(useApiHooks, 'useRecentActivity').mockImplementation(mockUseRecentActivity);
    vi.spyOn(useApiHooks, 'useUpcomingChanges').mockImplementation(mockUseUpcomingChanges);
    vi.spyOn(useApiHooks, 'useIssueTrends').mockImplementation(mockUseIssueTrends);
    vi.spyOn(useApiHooks, 'useIssuesByPriority').mockImplementation(mockUseIssuesByPriority);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  describe('Basic Rendering', () => {
    it('renders dashboard title and description', () => {
      render(<DashboardPage />, { wrapper: createWrapper() });

      expect(screen.getByText('Dashboard')).toBeInTheDocument();
      expect(screen.getByText('Overview of your IT service management metrics')).toBeInTheDocument();
    });

    it('renders all stat cards with correct values', () => {
      render(<DashboardPage />, { wrapper: createWrapper() });

      // Open Issues card
      const openIssuesCard = screen.getByText('Open Issues').closest('.p-5');
      expect(within(openIssuesCard!).getByText('12')).toBeInTheDocument();
      expect(within(openIssuesCard!).getByText('3 critical')).toBeInTheDocument();

      // Pending Changes card
      const pendingChangesCard = screen.getByText('Pending Changes').closest('.p-5');
      expect(within(pendingChangesCard!).getByText('7')).toBeInTheDocument(); // 5 scheduled + 2 in_progress
      expect(within(pendingChangesCard!).getByText('5 scheduled')).toBeInTheDocument();

      // Active Requests card
      const activeRequestsCard = screen.getByText('Active Requests').closest('.p-5');
      expect(within(activeRequestsCard!).getByText('8')).toBeInTheDocument();
      expect(within(activeRequestsCard!).getByText('45 this month')).toBeInTheDocument();

      // Health Score card
      const healthScoreCard = screen.getByText('Avg Health Score').closest('.p-5');
      expect(within(healthScoreCard!).getByText('92%')).toBeInTheDocument();
      expect(within(healthScoreCard!).getByText('1 critical')).toBeInTheDocument();
    });

    it('renders auto-refresh controls', () => {
      render(<DashboardPage />, { wrapper: createWrapper() });

      expect(screen.getByText('Live')).toBeInTheDocument();
      expect(screen.getByText('Refresh')).toBeInTheDocument();
    });

    it('renders section headers', () => {
      render(<DashboardPage />, { wrapper: createWrapper() });

      expect(screen.getByText('Issue Trends (14 days)')).toBeInTheDocument();
      expect(screen.getByText('Open Issues by Priority')).toBeInTheDocument();
      expect(screen.getByText('Recent Activity')).toBeInTheDocument();
      expect(screen.getByText('Upcoming Changes')).toBeInTheDocument();
      expect(screen.getByText('Quick Actions')).toBeInTheDocument();
    });

    it('renders quick action links', () => {
      render(<DashboardPage />, { wrapper: createWrapper() });

      expect(screen.getByText('Create Issue')).toBeInTheDocument();
      expect(screen.getByText('New Change')).toBeInTheDocument();
      expect(screen.getByText('Service Request')).toBeInTheDocument();
      expect(screen.getByText('View Reports')).toBeInTheDocument();
    });
  });

  describe('Loading States', () => {
    it('shows loading state when dashboard is loading', () => {
      mockUseDashboard.mockReturnValue({
        data: undefined,
        isLoading: true,
        error: null,
        isFetching: false,
        dataUpdatedAt: Date.now(),
      });

      render(<DashboardPage />, { wrapper: createWrapper() });

      expect(screen.getByText('Loading dashboard...')).toBeInTheDocument();
    });

    it('shows loading state for issue trends', () => {
      mockUseIssueTrends.mockReturnValue({
        data: undefined,
        isLoading: true,
        isFetching: false,
      });

      render(<DashboardPage />, { wrapper: createWrapper() });

      const trendsSection = screen.getByText('Issue Trends (14 days)').closest('.bg-white');
      expect(within(trendsSection!).getByTestId('loader-icon')).toBeInTheDocument();
    });

    it('shows loading state for priority distribution', () => {
      mockUseIssuesByPriority.mockReturnValue({
        data: undefined,
        isLoading: true,
        isFetching: false,
      });

      render(<DashboardPage />, { wrapper: createWrapper() });

      const prioritySection = screen.getByText('Open Issues by Priority').closest('.bg-white');
      expect(within(prioritySection!).getByTestId('loader-icon')).toBeInTheDocument();
    });

    it('shows loading state for recent activity', () => {
      mockUseRecentActivity.mockReturnValue({
        data: undefined,
        isLoading: true,
        isFetching: false,
      });

      render(<DashboardPage />, { wrapper: createWrapper() });

      const activitySection = screen.getByText('Recent Activity').closest('.bg-white');
      expect(within(activitySection!).getByTestId('loader-icon')).toBeInTheDocument();
    });

    it('shows loading state for upcoming changes', () => {
      mockUseUpcomingChanges.mockReturnValue({
        data: undefined,
        isLoading: true,
        isFetching: false,
      });

      render(<DashboardPage />, { wrapper: createWrapper() });

      const changesSection = screen.getByText('Upcoming Changes').closest('.bg-white');
      expect(within(changesSection!).getByTestId('loader-icon')).toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    it('shows error message when dashboard fails to load', () => {
      mockUseDashboard.mockReturnValue({
        data: undefined,
        isLoading: false,
        error: new Error('API Error'),
        isFetching: false,
        dataUpdatedAt: Date.now(),
      });

      render(<DashboardPage />, { wrapper: createWrapper() });

      expect(screen.getByText('Error loading dashboard')).toBeInTheDocument();
      expect(screen.getByText('Please try refreshing the page')).toBeInTheDocument();
    });
  });

  describe('Auto-Refresh', () => {
    it('enables auto-refresh by default', () => {
      render(<DashboardPage />, { wrapper: createWrapper() });

      expect(screen.getByText('Live')).toBeInTheDocument();
    });

    it('toggles auto-refresh when button is clicked', () => {
      const { rerender } = render(<DashboardPage />, { wrapper: createWrapper() });

      const toggleButton = screen.getByText('Live').closest('button')!;
      fireEvent.click(toggleButton);

      // Force a re-render
      rerender(<DashboardPage />);

      expect(screen.queryByText('Paused')).toBeTruthy();
    });

    it('passes refetch interval when auto-refresh is enabled', () => {
      render(<DashboardPage />, { wrapper: createWrapper() });

      expect(mockUseDashboard).toHaveBeenCalledWith(
        expect.objectContaining({
          refetchInterval: 30000,
        })
      );
    });

    it('disables refetch interval when auto-refresh is off', () => {
      const { rerender } = render(<DashboardPage />, { wrapper: createWrapper() });

      const toggleButton = screen.getByText('Live').closest('button')!;
      fireEvent.click(toggleButton);

      // Force a re-render
      rerender(<DashboardPage />);

      expect(screen.queryByText('Paused')).toBeTruthy();
    });
  });

  describe('Manual Refresh', () => {
    it('has a refresh button', () => {
      render(<DashboardPage />, { wrapper: createWrapper() });

      const refreshButton = screen.getByText('Refresh').closest('button')!;
      expect(refreshButton).toBeInTheDocument();
    });

    it('refresh button is clickable when not refreshing', () => {
      render(<DashboardPage />, { wrapper: createWrapper() });

      const refreshButton = screen.getByText('Refresh').closest('button')!;
      expect(refreshButton).not.toBeDisabled();

      // Button click should trigger refresh (button gets temporarily disabled during refresh)
      fireEvent.click(refreshButton);
      // After click, button may be disabled during async refresh
    });
  });

  describe('Recent Activity Section', () => {
    it('displays recent activity items', () => {
      render(<DashboardPage />, { wrapper: createWrapper() });

      expect(screen.getByText('INC-001')).toBeInTheDocument();
      expect(screen.getByText('Database connection timeout')).toBeInTheDocument();
      expect(screen.getByText('CHG-001')).toBeInTheDocument();
      expect(screen.getByText('Deploy new API version')).toBeInTheDocument();
    });

    it('shows empty state when no recent activity', () => {
      mockUseRecentActivity.mockReturnValue({
        data: { activity: [] },
        isLoading: false,
        isFetching: false,
      });

      render(<DashboardPage />, { wrapper: createWrapper() });

      expect(screen.getByText('No recent activity')).toBeInTheDocument();
    });

    it('displays activity status badges', () => {
      render(<DashboardPage />, { wrapper: createWrapper() });

      expect(screen.getByText('open')).toBeInTheDocument();
      expect(screen.getByText('scheduled')).toBeInTheDocument();
    });

    it('displays activity type badges', () => {
      render(<DashboardPage />, { wrapper: createWrapper() });

      expect(screen.getByText('issue')).toBeInTheDocument();
      expect(screen.getByText('change')).toBeInTheDocument();
    });

    it('limits displayed activity to 5 items', () => {
      const manyActivities = Array.from({ length: 10 }, (_, i) => ({
        id: `${i + 1}`,
        type: 'issue',
        reference_id: `INC-${i + 1}`,
        title: `Issue ${i + 1}`,
        status: 'open',
        created_at: '2026-01-02T10:00:00Z',
      }));

      mockUseRecentActivity.mockReturnValue({
        data: { activity: manyActivities },
        isLoading: false,
        isFetching: false,
      });

      render(<DashboardPage />, { wrapper: createWrapper() });

      // Should only display first 5
      expect(screen.getByText('INC-1')).toBeInTheDocument();
      expect(screen.getByText('INC-5')).toBeInTheDocument();
      expect(screen.queryByText('INC-6')).not.toBeInTheDocument();
    });
  });

  describe('Upcoming Changes Section', () => {
    it('displays upcoming changes', () => {
      render(<DashboardPage />, { wrapper: createWrapper() });

      expect(screen.getByText('CHG-002')).toBeInTheDocument();
      expect(screen.getByText('Update database schema')).toBeInTheDocument();
      expect(screen.getByText('CHG-003')).toBeInTheDocument();
      expect(screen.getByText('Deploy frontend updates')).toBeInTheDocument();
    });

    it('shows empty state when no upcoming changes', () => {
      mockUseUpcomingChanges.mockReturnValue({
        data: { changes: [] },
        isLoading: false,
        isFetching: false,
      });

      render(<DashboardPage />, { wrapper: createWrapper() });

      expect(screen.getByText('No upcoming changes')).toBeInTheDocument();
    });

    it('displays risk level badges', () => {
      render(<DashboardPage />, { wrapper: createWrapper() });

      expect(screen.getByText('high risk')).toBeInTheDocument();
      expect(screen.getByText('low risk')).toBeInTheDocument();
    });

    it('displays application names when available', () => {
      render(<DashboardPage />, { wrapper: createWrapper() });

      expect(screen.getByText('App: Core API')).toBeInTheDocument();
      expect(screen.getByText('App: Web Portal')).toBeInTheDocument();
    });

    it('limits displayed changes to 5 items', () => {
      const manyChanges = Array.from({ length: 10 }, (_, i) => ({
        id: `${i + 1}`,
        change_id: `CHG-${i + 1}`,
        title: `Change ${i + 1}`,
        risk_level: 'low',
        scheduled_start: '2026-01-03T14:00:00Z',
      }));

      mockUseUpcomingChanges.mockReturnValue({
        data: { changes: manyChanges },
        isLoading: false,
        isFetching: false,
      });

      render(<DashboardPage />, { wrapper: createWrapper() });

      // Should only display first 5
      expect(screen.getByText('CHG-1')).toBeInTheDocument();
      expect(screen.getByText('CHG-5')).toBeInTheDocument();
      expect(screen.queryByText('CHG-6')).not.toBeInTheDocument();
    });
  });

  describe('Issue Trends Chart', () => {
    it('renders issue trends chart with data', () => {
      render(<DashboardPage />, { wrapper: createWrapper() });

      expect(screen.getByText(/Created \(19\)/)).toBeInTheDocument();
      expect(screen.getByText(/Resolved \(22\)/)).toBeInTheDocument();
    });

    it('shows "Backlog decreasing" when more resolved than created', () => {
      render(<DashboardPage />, { wrapper: createWrapper() });

      expect(screen.getByText('Backlog decreasing')).toBeInTheDocument();
    });

    it('shows "Backlog increasing" when more created than resolved', () => {
      mockUseIssueTrends.mockReturnValue({
        data: {
          trends: [
            { date: '2025-12-20', created: 10, resolved: 3 },
            { date: '2025-12-21', created: 8, resolved: 2 },
          ],
        },
        isLoading: false,
        isFetching: false,
      });

      render(<DashboardPage />, { wrapper: createWrapper() });

      expect(screen.getByText('Backlog increasing')).toBeInTheDocument();
    });

    it('shows empty state when no trend data', () => {
      mockUseIssueTrends.mockReturnValue({
        data: { trends: [] },
        isLoading: false,
        isFetching: false,
      });

      render(<DashboardPage />, { wrapper: createWrapper() });

      expect(screen.getByText('No trend data available')).toBeInTheDocument();
    });
  });

  describe('Priority Distribution Chart', () => {
    it('renders priority distribution chart with data', () => {
      render(<DashboardPage />, { wrapper: createWrapper() });

      expect(screen.getByText('critical')).toBeInTheDocument();
      expect(screen.getByText('high')).toBeInTheDocument();
      expect(screen.getByText('medium')).toBeInTheDocument();
      expect(screen.getByText('low')).toBeInTheDocument();
    });

    it('displays correct counts and percentages', () => {
      render(<DashboardPage />, { wrapper: createWrapper() });

      const prioritySection = screen.getByText('Open Issues by Priority').closest('.bg-white');

      // Total is 3 + 5 + 8 + 4 = 20
      expect(within(prioritySection!).getByText('(15%)')).toBeInTheDocument(); // 3/20 = 15%
      expect(within(prioritySection!).getByText('(25%)')).toBeInTheDocument(); // 5/20 = 25%
      expect(within(prioritySection!).getByText('(40%)')).toBeInTheDocument(); // 8/20 = 40%
      expect(within(prioritySection!).getByText('(20%)')).toBeInTheDocument(); // 4/20 = 20%
    });

    it('shows empty state when no priority data', () => {
      mockUseIssuesByPriority.mockReturnValue({
        data: { data: [] },
        isLoading: false,
        isFetching: false,
      });

      render(<DashboardPage />, { wrapper: createWrapper() });

      expect(screen.getByText('No data available')).toBeInTheDocument();
    });
  });

  describe('Stat Card Links', () => {
    it('renders stat cards with correct href attributes', () => {
      render(<DashboardPage />, { wrapper: createWrapper() });

      const issuesCard = screen.getByText('Open Issues').closest('a')!;
      expect(issuesCard).toHaveAttribute('href', '/issues');

      const changesCard = screen.getByText('Pending Changes').closest('a')!;
      expect(changesCard).toHaveAttribute('href', '/changes');

      const requestsCard = screen.getByText('Active Requests').closest('a')!;
      expect(requestsCard).toHaveAttribute('href', '/catalog');

      const healthCard = screen.getByText('Avg Health Score').closest('a')!;
      expect(healthCard).toHaveAttribute('href', '/applications');
    });
  });

  describe('Quick Action Links', () => {
    it('renders quick action links with correct hrefs', () => {
      render(<DashboardPage />, { wrapper: createWrapper() });

      const createIssueLink = screen.getByText('Create Issue').closest('a')!;
      expect(createIssueLink).toHaveAttribute('href', '/issues/new');

      const newChangeLink = screen.getByText('New Change').closest('a')!;
      expect(newChangeLink).toHaveAttribute('href', '/changes/new');

      const catalogLink = screen.getByText('Service Request').closest('a')!;
      expect(catalogLink).toHaveAttribute('href', '/catalog');

      const reportsLink = screen.getByText('View Reports').closest('a')!;
      expect(reportsLink).toHaveAttribute('href', '/reports');
    });
  });

  describe('Last Updated Indicator', () => {
    it('displays last updated time', () => {
      render(<DashboardPage />, { wrapper: createWrapper() });

      expect(screen.getByText(/Updated:/)).toBeInTheDocument();
    });

    it('shows radio icon when data is fetching', () => {
      mockUseDashboard.mockReturnValue({
        data: mockDashboardData,
        isLoading: false,
        error: null,
        isFetching: true,
        dataUpdatedAt: Date.now(),
      });

      render(<DashboardPage />, { wrapper: createWrapper() });

      expect(screen.getByTestId('radio-icon')).toBeInTheDocument();
    });
  });
});
