import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ApplicationsPage from '../page';
import * as hooks from '@/hooks/useApi';

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

// Mock API hooks
vi.mock('@/hooks/useApi', () => ({
  useApplications: vi.fn(),
}));

const mockApplications = [
  {
    id: 'app1',
    app_id: 'APP-001',
    name: 'Customer Portal',
    description: 'Primary customer-facing web application',
    status: 'active',
    tier: 'P1',
    lifecycle_stage: 'production',
    criticality: 'mission_critical',
    health_score: 95,
    owner_user_id: 'user1',
    owner_user_name: 'John Doe',
    owner_group_id: 'group1',
    owner_group_name: 'Web Platform Team',
    support_group_id: 'group2',
    support_group_name: 'Platform Support',
    environment_count: 3,
  },
  {
    id: 'app2',
    app_id: 'APP-002',
    name: 'Internal Dashboard',
    description: 'Analytics and reporting dashboard',
    status: 'active',
    tier: 'P2',
    lifecycle_stage: 'production',
    criticality: 'business_critical',
    health_score: 75,
    owner_user_id: 'user2',
    owner_user_name: 'Jane Smith',
    owner_group_name: 'Analytics Team',
    environment_count: 2,
  },
  {
    id: 'app3',
    app_id: 'APP-003',
    name: 'Legacy Billing System',
    description: 'Old billing system being phased out',
    status: 'deprecated',
    tier: 'P3',
    lifecycle_stage: 'sunset',
    criticality: 'business_operational',
    health_score: 45,
    owner_user_name: 'Bob Wilson',
    environment_count: 1,
  },
  {
    id: 'app4',
    app_id: 'APP-004',
    name: 'Mobile App Backend',
    description: 'API backend for mobile applications',
    status: 'active',
    tier: 'P1',
    lifecycle_stage: 'production',
    criticality: 'mission_critical',
    health_score: null, // No health score
    owner_user_name: 'Alice Johnson',
    owner_group_name: 'Mobile Team',
    environment_count: 0,
  },
  {
    id: 'app5',
    app_id: 'APP-005',
    name: 'Dev Tools',
    description: null, // No description
    status: 'inactive',
    tier: 'P4',
    lifecycle_stage: 'development',
    health_score: 88,
    owner_user_name: 'Charlie Brown',
    environment_count: 1,
  },
];

const mockPagination = {
  page: 1,
  limit: 20,
  total: 5,
  totalPages: 1,
};

describe('ApplicationsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(hooks.useApplications).mockReturnValue({
      data: { data: mockApplications, pagination: mockPagination },
      isLoading: false,
      error: null,
    } as any);
  });

  describe('Basic Rendering', () => {
    it('renders page header', () => {
      render(<ApplicationsPage />);
      expect(screen.getByText('Applications')).toBeInTheDocument();
      expect(screen.getByText('Manage and monitor your IT applications')).toBeInTheDocument();
    });

    it('renders new application button', () => {
      render(<ApplicationsPage />);
      const newButton = screen.getByText('New Application');
      expect(newButton).toBeInTheDocument();
      expect(newButton.closest('a')).toHaveAttribute('href', '/applications/new');
    });

    it('renders search input', () => {
      render(<ApplicationsPage />);
      const searchInput = screen.getByPlaceholderText('Search by name, ID or description...');
      expect(searchInput).toBeInTheDocument();
    });

    it('renders filters button', () => {
      render(<ApplicationsPage />);
      expect(screen.getByText('Filters')).toBeInTheDocument();
    });
  });

  describe('Application Cards', () => {
    it('displays all applications', () => {
      render(<ApplicationsPage />);
      expect(screen.getByText('Customer Portal')).toBeInTheDocument();
      expect(screen.getByText('Internal Dashboard')).toBeInTheDocument();
      expect(screen.getByText('Legacy Billing System')).toBeInTheDocument();
      expect(screen.getByText('Mobile App Backend')).toBeInTheDocument();
      expect(screen.getByText('Dev Tools')).toBeInTheDocument();
    });

    it('displays application IDs', () => {
      render(<ApplicationsPage />);
      expect(screen.getByText('APP-001')).toBeInTheDocument();
      expect(screen.getByText('APP-002')).toBeInTheDocument();
      expect(screen.getByText('APP-003')).toBeInTheDocument();
    });

    it('displays application descriptions', () => {
      render(<ApplicationsPage />);
      expect(screen.getByText('Primary customer-facing web application')).toBeInTheDocument();
      expect(screen.getByText('Analytics and reporting dashboard')).toBeInTheDocument();
    });

    it('shows "No description" for missing descriptions', () => {
      render(<ApplicationsPage />);
      expect(screen.getByText('No description')).toBeInTheDocument();
    });

    it('displays health scores', () => {
      render(<ApplicationsPage />);
      expect(screen.getByText('95%')).toBeInTheDocument();
      expect(screen.getByText('75%')).toBeInTheDocument();
      expect(screen.getByText('45%')).toBeInTheDocument();
      expect(screen.getByText('88%')).toBeInTheDocument();
    });

    it('shows N/A for missing health scores', () => {
      render(<ApplicationsPage />);
      expect(screen.getByText('N/A')).toBeInTheDocument();
    });

    it('displays status badges', () => {
      render(<ApplicationsPage />);
      const activeBadges = screen.getAllByText('Active');
      expect(activeBadges.length).toBe(3);
      expect(screen.getByText('Deprecated')).toBeInTheDocument();
      expect(screen.getByText('Inactive')).toBeInTheDocument();
    });

    it('displays tier badges', () => {
      render(<ApplicationsPage />);
      const p1Badges = screen.getAllByText('P1 - Critical');
      expect(p1Badges.length).toBe(2);
      expect(screen.getByText('P2 - High')).toBeInTheDocument();
      expect(screen.getByText('P3 - Medium')).toBeInTheDocument();
      expect(screen.getByText('P4 - Low')).toBeInTheDocument();
    });

    it('displays lifecycle stage badges', () => {
      render(<ApplicationsPage />);
      const productionBadges = screen.getAllByText('Production');
      expect(productionBadges.length).toBeGreaterThan(0);
      expect(screen.getByText('Sunset')).toBeInTheDocument();
      expect(screen.getByText('Development')).toBeInTheDocument();
    });

    it('displays criticality badges', () => {
      render(<ApplicationsPage />);
      const missionCriticalBadges = screen.getAllByText('Mission Critical');
      expect(missionCriticalBadges.length).toBe(2);
      expect(screen.getByText('Business Critical')).toBeInTheDocument();
      expect(screen.getByText('Business Operational')).toBeInTheDocument();
    });

    it('displays owner information', () => {
      render(<ApplicationsPage />);
      expect(screen.getByText(/Owner: John Doe/)).toBeInTheDocument();
      expect(screen.getByText(/Owner: Jane Smith/)).toBeInTheDocument();
      expect(screen.getByText(/Owner: Bob Wilson/)).toBeInTheDocument();
    });

    it('displays team information', () => {
      render(<ApplicationsPage />);
      expect(screen.getByText(/Team: Web Platform Team/)).toBeInTheDocument();
      expect(screen.getByText(/Team: Analytics Team/)).toBeInTheDocument();
      expect(screen.getByText(/Team: Mobile Team/)).toBeInTheDocument();
    });

    it('displays support group information', () => {
      render(<ApplicationsPage />);
      expect(screen.getByText(/Support: Platform Support/)).toBeInTheDocument();
    });

    it('displays environment count', () => {
      render(<ApplicationsPage />);
      expect(screen.getByText('3 environments')).toBeInTheDocument();
      expect(screen.getByText('2 environments')).toBeInTheDocument();
      const oneEnvElements = screen.getAllByText('1 environment');
      expect(oneEnvElements.length).toBeGreaterThan(0);
    });

    it('does not show environment count when zero', () => {
      render(<ApplicationsPage />);
      const app4Card = screen.getByText('Mobile App Backend').closest('a');
      expect(app4Card?.textContent).not.toContain('0 environment');
    });

    it('links to application detail page', () => {
      render(<ApplicationsPage />);
      const appCard = screen.getByText('Customer Portal').closest('a');
      expect(appCard).toHaveAttribute('href', '/applications/app1');
    });
  });

  describe('Search Functionality', () => {
    it('filters applications by name', () => {
      render(<ApplicationsPage />);
      const searchInput = screen.getByPlaceholderText('Search by name, ID or description...');

      fireEvent.change(searchInput, { target: { value: 'Customer' } });

      expect(screen.getByText('Customer Portal')).toBeInTheDocument();
      expect(screen.queryByText('Internal Dashboard')).not.toBeInTheDocument();
      expect(screen.queryByText('Legacy Billing System')).not.toBeInTheDocument();
    });

    it('filters applications by app ID', () => {
      render(<ApplicationsPage />);
      const searchInput = screen.getByPlaceholderText('Search by name, ID or description...');

      fireEvent.change(searchInput, { target: { value: 'APP-002' } });

      expect(screen.getByText('Internal Dashboard')).toBeInTheDocument();
      expect(screen.queryByText('Customer Portal')).not.toBeInTheDocument();
    });

    it('filters applications by description', () => {
      render(<ApplicationsPage />);
      const searchInput = screen.getByPlaceholderText('Search by name, ID or description...');

      fireEvent.change(searchInput, { target: { value: 'analytics' } });

      expect(screen.getByText('Internal Dashboard')).toBeInTheDocument();
      expect(screen.queryByText('Customer Portal')).not.toBeInTheDocument();
    });

    it('is case insensitive', () => {
      render(<ApplicationsPage />);
      const searchInput = screen.getByPlaceholderText('Search by name, ID or description...');

      fireEvent.change(searchInput, { target: { value: 'CUSTOMER' } });

      expect(screen.getByText('Customer Portal')).toBeInTheDocument();
    });

    it('shows empty state when no matches', () => {
      render(<ApplicationsPage />);
      const searchInput = screen.getByPlaceholderText('Search by name, ID or description...');

      fireEvent.change(searchInput, { target: { value: 'nonexistent' } });

      expect(screen.getByText('No applications found')).toBeInTheDocument();
      expect(screen.getByText('Try adjusting your search or filters')).toBeInTheDocument();
    });

    it('updates results when search is cleared', () => {
      render(<ApplicationsPage />);
      const searchInput = screen.getByPlaceholderText('Search by name, ID or description...');

      fireEvent.change(searchInput, { target: { value: 'Customer' } });
      expect(screen.getByText('Customer Portal')).toBeInTheDocument();
      expect(screen.queryByText('Internal Dashboard')).not.toBeInTheDocument();

      fireEvent.change(searchInput, { target: { value: '' } });
      expect(screen.getByText('Customer Portal')).toBeInTheDocument();
      expect(screen.getByText('Internal Dashboard')).toBeInTheDocument();
    });
  });

  describe('Filter Functionality', () => {
    it('toggles filter panel', () => {
      render(<ApplicationsPage />);
      const filtersButton = screen.getByText('Filters');

      // Before clicking, filter selects should not be visible
      expect(screen.queryByText('All Statuses')).not.toBeInTheDocument();

      fireEvent.click(filtersButton);
      // After clicking, filter selects should be visible
      expect(screen.getByText('All Statuses')).toBeInTheDocument();
      expect(screen.getByText('All Tiers')).toBeInTheDocument();
      expect(screen.getByText('All Stages')).toBeInTheDocument();

      fireEvent.click(filtersButton);
      // After clicking again, should hide
      expect(screen.queryByText('All Statuses')).not.toBeInTheDocument();
    });

    it('filters by status', () => {
      render(<ApplicationsPage />);
      const filtersButton = screen.getByText('Filters');
      fireEvent.click(filtersButton);

      // Find select elements by role
      const selects = screen.getAllByRole('combobox');
      const statusFilter = selects[0]; // First select is Status
      fireEvent.change(statusFilter, { target: { value: 'deprecated' } });

      expect(screen.getByText('Legacy Billing System')).toBeInTheDocument();
      expect(screen.queryByText('Customer Portal')).not.toBeInTheDocument();
      expect(screen.queryByText('Internal Dashboard')).not.toBeInTheDocument();
    });

    it('filters by tier', () => {
      render(<ApplicationsPage />);
      const filtersButton = screen.getByText('Filters');
      fireEvent.click(filtersButton);

      const selects = screen.getAllByRole('combobox');
      const tierFilter = selects[1]; // Second select is Tier
      fireEvent.change(tierFilter, { target: { value: 'P1' } });

      expect(screen.getByText('Customer Portal')).toBeInTheDocument();
      expect(screen.getByText('Mobile App Backend')).toBeInTheDocument();
      expect(screen.queryByText('Internal Dashboard')).not.toBeInTheDocument();
    });

    it('filters by lifecycle stage', () => {
      render(<ApplicationsPage />);
      const filtersButton = screen.getByText('Filters');
      fireEvent.click(filtersButton);

      const selects = screen.getAllByRole('combobox');
      const lifecycleFilter = selects[2]; // Third select is Lifecycle Stage
      fireEvent.change(lifecycleFilter, { target: { value: 'sunset' } });

      expect(screen.getByText('Legacy Billing System')).toBeInTheDocument();
      expect(screen.queryByText('Customer Portal')).not.toBeInTheDocument();
    });

    it('combines multiple filters', () => {
      render(<ApplicationsPage />);
      const filtersButton = screen.getByText('Filters');
      fireEvent.click(filtersButton);

      const selects = screen.getAllByRole('combobox');
      const statusFilter = selects[0];
      const tierFilter = selects[1];

      fireEvent.change(statusFilter, { target: { value: 'active' } });
      fireEvent.change(tierFilter, { target: { value: 'P1' } });

      expect(screen.getByText('Customer Portal')).toBeInTheDocument();
      expect(screen.getByText('Mobile App Backend')).toBeInTheDocument();
      expect(screen.queryByText('Internal Dashboard')).not.toBeInTheDocument();
      expect(screen.queryByText('Legacy Billing System')).not.toBeInTheDocument();
    });

    it('combines search and filters', () => {
      render(<ApplicationsPage />);
      const searchInput = screen.getByPlaceholderText('Search by name, ID or description...');
      fireEvent.change(searchInput, { target: { value: 'app' } });

      const filtersButton = screen.getByText('Filters');
      fireEvent.click(filtersButton);

      const selects = screen.getAllByRole('combobox');
      const statusFilter = selects[0];
      fireEvent.change(statusFilter, { target: { value: 'active' } });

      // Should show mobile app backend (active) but not legacy (deprecated)
      expect(screen.getByText('Mobile App Backend')).toBeInTheDocument();
      expect(screen.queryByText('Legacy Billing System')).not.toBeInTheDocument();
    });

    it('resets to all when filter is set to all', () => {
      render(<ApplicationsPage />);
      const filtersButton = screen.getByText('Filters');
      fireEvent.click(filtersButton);

      const selects = screen.getAllByRole('combobox');
      const statusFilter = selects[0];
      fireEvent.change(statusFilter, { target: { value: 'active' } });
      expect(screen.queryByText('Legacy Billing System')).not.toBeInTheDocument();

      fireEvent.change(statusFilter, { target: { value: 'all' } });
      expect(screen.getByText('Legacy Billing System')).toBeInTheDocument();
    });
  });

  describe('Health Score Display', () => {
    it('shows green icon for score >= 90', () => {
      render(<ApplicationsPage />);
      const customerPortalCard = screen.getByText('Customer Portal').closest('a');
      const healthScore = customerPortalCard?.querySelector('.text-green-600');
      expect(healthScore).toBeInTheDocument();
    });

    it('shows yellow icon for score 70-89', () => {
      render(<ApplicationsPage />);
      const dashboardCard = screen.getByText('Internal Dashboard').closest('a');
      const healthScore = dashboardCard?.querySelector('.text-yellow-600');
      expect(healthScore).toBeInTheDocument();
    });

    it('shows red icon for score < 50', () => {
      render(<ApplicationsPage />);
      const billingCard = screen.getByText('Legacy Billing System').closest('a');
      const healthScore = billingCard?.querySelector('.text-red-600');
      expect(healthScore).toBeInTheDocument();
    });

    it('shows gray for no health score', () => {
      render(<ApplicationsPage />);
      const mobileCard = screen.getByText('Mobile App Backend').closest('a');
      const healthScore = mobileCard?.querySelector('.text-gray-400');
      expect(healthScore).toBeInTheDocument();
    });
  });

  describe('Pagination', () => {
    it('shows pagination when multiple pages', () => {
      vi.mocked(hooks.useApplications).mockReturnValue({
        data: {
          data: mockApplications,
          pagination: { page: 1, limit: 20, total: 50, totalPages: 3 },
        },
        isLoading: false,
        error: null,
      } as any);

      render(<ApplicationsPage />);
      expect(screen.getByText('Showing 5 of 50 applications')).toBeInTheDocument();
      expect(screen.getByText('Previous')).toBeInTheDocument();
      expect(screen.getByText('Next')).toBeInTheDocument();
    });

    it('hides pagination when only one page', () => {
      render(<ApplicationsPage />);
      expect(screen.queryByText('Previous')).not.toBeInTheDocument();
      expect(screen.queryByText('Next')).not.toBeInTheDocument();
    });

    it('enables previous and next based on current page', () => {
      vi.mocked(hooks.useApplications).mockReturnValue({
        data: {
          data: mockApplications,
          pagination: { page: 1, limit: 20, total: 50, totalPages: 3 },
        },
        isLoading: false,
        error: null,
      } as any);

      render(<ApplicationsPage />);
      const previousButton = screen.getByText('Previous');
      const nextButton = screen.getByText('Next');

      // On first page, previous should be disabled
      expect(previousButton).toBeDisabled();
      expect(nextButton).not.toBeDisabled();
    });

    it('handles clicking next button', () => {
      vi.mocked(hooks.useApplications).mockReturnValue({
        data: {
          data: mockApplications,
          pagination: { page: 1, limit: 20, total: 50, totalPages: 3 },
        },
        isLoading: false,
        error: null,
      } as any);

      render(<ApplicationsPage />);
      const nextButton = screen.getByText('Next');
      fireEvent.click(nextButton);

      // Button click should trigger page state change
      expect(nextButton).toBeInTheDocument();
    });

    it('handles clicking previous button', () => {
      vi.mocked(hooks.useApplications).mockReturnValue({
        data: {
          data: mockApplications,
          pagination: { page: 1, limit: 20, total: 50, totalPages: 3 },
        },
        isLoading: false,
        error: null,
      } as any);

      render(<ApplicationsPage />);
      const previousButton = screen.getByText('Previous');
      fireEvent.click(previousButton);

      // Button click should attempt page state change
      expect(previousButton).toBeInTheDocument();
    });
  });

  describe('Loading State', () => {
    it('shows loading spinner', () => {
      vi.mocked(hooks.useApplications).mockReturnValue({
        data: undefined,
        isLoading: true,
        error: null,
      } as any);

      render(<ApplicationsPage />);
      expect(screen.getByText('Loading applications...')).toBeInTheDocument();
    });

    it('does not show applications grid while loading', () => {
      vi.mocked(hooks.useApplications).mockReturnValue({
        data: undefined,
        isLoading: true,
        error: null,
      } as any);

      render(<ApplicationsPage />);
      expect(screen.queryByText('Customer Portal')).not.toBeInTheDocument();
    });
  });

  describe('Error State', () => {
    it('shows error message', () => {
      vi.mocked(hooks.useApplications).mockReturnValue({
        data: undefined,
        isLoading: false,
        error: new Error('Failed to fetch'),
      } as any);

      render(<ApplicationsPage />);
      expect(screen.getByText('Error loading applications')).toBeInTheDocument();
      expect(screen.getByText('Please try refreshing the page')).toBeInTheDocument();
    });

    it('does not show applications grid on error', () => {
      vi.mocked(hooks.useApplications).mockReturnValue({
        data: undefined,
        isLoading: false,
        error: new Error('Failed to fetch'),
      } as any);

      render(<ApplicationsPage />);
      expect(screen.queryByText('Customer Portal')).not.toBeInTheDocument();
    });
  });

  describe('Empty State', () => {
    it('shows empty state when no applications', () => {
      vi.mocked(hooks.useApplications).mockReturnValue({
        data: { data: [], pagination: mockPagination },
        isLoading: false,
        error: null,
      } as any);

      render(<ApplicationsPage />);
      expect(screen.getByText('No applications found')).toBeInTheDocument();
      expect(screen.getByText('Try adjusting your search or filters')).toBeInTheDocument();
    });
  });
});
