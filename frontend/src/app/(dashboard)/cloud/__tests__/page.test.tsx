import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CloudPage from '../page';

// Mock the API hooks
vi.mock('@/hooks/useApi', () => ({
  useCloudAccounts: vi.fn(),
  useCloudResources: vi.fn(),
  useCloudCosts: vi.fn(),
}));

// Import mocked hooks
import { useCloudAccounts, useCloudResources, useCloudCosts } from '@/hooks/useApi';

const mockCloudAccounts = [
  {
    id: 'acc-1',
    name: 'Production AWS',
    provider: 'aws',
    status: 'connected',
    resource_count: 45,
    monthly_cost: 2500.00,
    cost_trend: 15,
    last_synced_at: '2023-12-15T10:30:00Z',
  },
  {
    id: 'acc-2',
    name: 'Development Azure',
    provider: 'azure',
    status: 'active',
    resource_count: 12,
    monthly_cost: 800.00,
    cost_trend: -5,
    last_synced_at: '2023-12-15T09:45:00Z',
  },
  {
    id: 'acc-3',
    name: 'Staging GCP',
    provider: 'gcp',
    status: 'error',
    resource_count: 8,
    monthly_cost: 450.00,
    cost_trend: 0,
    last_synced_at: '2023-12-14T15:20:00Z',
  },
];

const mockCloudResources = [
  {
    id: 'res-1',
    resource_type: 'compute',
    cost: 1200.00,
  },
  {
    id: 'res-2',
    resource_type: 'database',
    cost: 800.00,
  },
  {
    id: 'res-3',
    resource_type: 'storage',
    cost: 300.00,
  },
  {
    id: 'res-4',
    resource_type: 'network',
    cost: 250.00,
  },
  {
    id: 'res-5',
    resource_type: 'compute',
    cost: 500.00,
  },
];

const mockUseCloudAccounts = useCloudAccounts as ReturnType<typeof vi.fn>;
const mockUseCloudResources = useCloudResources as ReturnType<typeof vi.fn>;
const mockUseCloudCosts = useCloudCosts as ReturnType<typeof vi.fn>;

describe('CloudPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockUseCloudAccounts.mockReturnValue({
      data: { data: mockCloudAccounts },
      isLoading: false,
      error: null,
    });

    mockUseCloudResources.mockReturnValue({
      data: { data: mockCloudResources },
      isLoading: false,
      error: null,
    });

    mockUseCloudCosts.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      error: null,
    });
  });

  describe('Basic Rendering', () => {
    it('renders the page title', () => {
      render(<CloudPage />);
      expect(screen.getByText('Cloud Management')).toBeInTheDocument();
    });

    it('renders the subtitle', () => {
      render(<CloudPage />);
      expect(screen.getByText('Monitor cloud resources and costs')).toBeInTheDocument();
    });

    it('renders the Add Account button', () => {
      render(<CloudPage />);
      const addButton = screen.getByRole('link', { name: /Add Account/i });
      expect(addButton).toBeInTheDocument();
      expect(addButton).toHaveAttribute('href', '/cloud/accounts/new');
    });

    it('renders all three tabs', () => {
      render(<CloudPage />);
      const tabs = screen.getAllByRole('button');
      const tabTexts = tabs.map(tab => tab.textContent);
      expect(tabTexts).toContain('Cloud Accounts');
      expect(tabTexts).toContain('Resources');
      expect(tabTexts).toContain('Cost Analysis');
    });

    it('shows Cloud Accounts tab by default', () => {
      render(<CloudPage />);
      const tabs = screen.getAllByRole('button');
      const accountsTab = tabs.find(tab => tab.textContent === 'Cloud Accounts');
      expect(accountsTab).toHaveClass('border-blue-500', 'text-blue-600');
    });
  });

  describe('Overview Stats', () => {
    it('displays Cloud Accounts count', () => {
      render(<CloudPage />);
      const accountsCount = screen.getAllByText('Cloud Accounts');
      expect(accountsCount.length).toBeGreaterThan(0);
      expect(screen.getByText('3')).toBeInTheDocument(); // 3 accounts
    });

    it('displays Total Resources count', () => {
      render(<CloudPage />);
      expect(screen.getByText('Total Resources')).toBeInTheDocument();
      expect(screen.getByText('65')).toBeInTheDocument(); // 45 + 12 + 8
    });

    it('displays Monthly Cost total', () => {
      render(<CloudPage />);
      const monthlyCostLabels = screen.getAllByText('Monthly Cost');
      expect(monthlyCostLabels.length).toBeGreaterThan(0);
      expect(screen.getByText('$3,750.00')).toBeInTheDocument(); // 2500 + 800 + 450
    });

    it('displays Accounts with Issues count', () => {
      render(<CloudPage />);
      expect(screen.getByText('Accounts with Issues')).toBeInTheDocument();
      expect(screen.getByText('1')).toBeInTheDocument(); // 1 error status
    });

    it('shows dash when loading', () => {
      mockUseCloudAccounts.mockReturnValue({
        data: null,
        isLoading: true,
        error: null,
      });

      render(<CloudPage />);
      const dashElements = screen.getAllByText('-');
      expect(dashElements.length).toBeGreaterThan(0);
    });
  });

  describe('Tab Switching', () => {
    it('switches to Resources tab when clicked', () => {
      render(<CloudPage />);
      const tabs = screen.getAllByRole('button');
      const resourcesTab = tabs.find(tab => tab.textContent === 'Resources');
      if (resourcesTab) {
        fireEvent.click(resourcesTab);
        expect(resourcesTab).toHaveClass('border-blue-500', 'text-blue-600');
      }
    });

    it('switches to Cost Analysis tab when clicked', () => {
      render(<CloudPage />);
      const costsTab = screen.getByText('Cost Analysis');
      fireEvent.click(costsTab);

      expect(costsTab).toHaveClass('border-blue-500', 'text-blue-600');
    });

    it('switches back to Cloud Accounts tab when clicked', () => {
      render(<CloudPage />);
      const tabs = screen.getAllByRole('button');
      const resourcesTab = tabs.find(tab => tab.textContent === 'Resources');
      const accountsTab = tabs.find(tab => tab.textContent === 'Cloud Accounts');

      if (resourcesTab && accountsTab) {
        fireEvent.click(resourcesTab);
        expect(resourcesTab).toHaveClass('border-blue-500', 'text-blue-600');

        fireEvent.click(accountsTab);
        expect(accountsTab).toHaveClass('border-blue-500', 'text-blue-600');
      }
    });
  });

  describe('Cloud Accounts Tab', () => {
    it('displays all cloud accounts', () => {
      render(<CloudPage />);
      expect(screen.getByText('Production AWS')).toBeInTheDocument();
      expect(screen.getByText('Development Azure')).toBeInTheDocument();
      expect(screen.getByText('Staging GCP')).toBeInTheDocument();
    });

    it('displays provider badges', () => {
      render(<CloudPage />);
      expect(screen.getByText('AWS')).toBeInTheDocument();
      expect(screen.getByText('Azure')).toBeInTheDocument();
      expect(screen.getByText('GCP')).toBeInTheDocument();
    });

    it('displays connected status for active accounts', () => {
      render(<CloudPage />);
      const connectedBadges = screen.getAllByText('Connected');
      expect(connectedBadges.length).toBe(2); // connected and active
    });

    it('displays error status for errored accounts', () => {
      render(<CloudPage />);
      expect(screen.getByText('Error')).toBeInTheDocument();
    });

    it('displays resource counts', () => {
      render(<CloudPage />);
      expect(screen.getByText('45')).toBeInTheDocument();
      expect(screen.getByText('12')).toBeInTheDocument();
      expect(screen.getByText('8')).toBeInTheDocument();
    });

    it('displays monthly costs', () => {
      render(<CloudPage />);
      expect(screen.getByText('$2,500.00')).toBeInTheDocument();
      expect(screen.getByText('$800.00')).toBeInTheDocument();
      expect(screen.getByText('$450.00')).toBeInTheDocument();
    });

    it('displays cost trends with up arrow for positive trend', () => {
      render(<CloudPage />);
      expect(screen.getByText('15%')).toBeInTheDocument();
    });

    it('displays cost trends with down arrow for negative trend', () => {
      render(<CloudPage />);
      expect(screen.getByText('5%')).toBeInTheDocument();
    });

    it('displays last synced timestamps', () => {
      render(<CloudPage />);
      const lastSyncedTexts = screen.getAllByText(/Last synced:/);
      expect(lastSyncedTexts.length).toBeGreaterThan(0);
    });

    it('links to account detail pages', () => {
      render(<CloudPage />);
      const links = screen.getAllByRole('link');
      const awsLink = links.find(link => link.getAttribute('href') === '/cloud/accounts/acc-1');
      expect(awsLink).toBeDefined();
    });

    it('applies correct provider colors for AWS', () => {
      render(<CloudPage />);
      const awsBadge = screen.getByText('AWS');
      expect(awsBadge).toHaveClass('bg-orange-100', 'text-orange-800');
    });

    it('applies correct provider colors for Azure', () => {
      render(<CloudPage />);
      const azureBadge = screen.getByText('Azure');
      expect(azureBadge).toHaveClass('bg-blue-100', 'text-blue-800');
    });

    it('applies correct provider colors for GCP', () => {
      render(<CloudPage />);
      const gcpBadge = screen.getByText('GCP');
      expect(gcpBadge).toHaveClass('bg-red-100', 'text-red-800');
    });
  });

  describe('Resources Tab', () => {
    beforeEach(() => {
      render(<CloudPage />);
      const tabs = screen.getAllByRole('button');
      const resourcesTab = tabs.find(tab => tab.textContent === 'Resources');
      if (resourcesTab) {
        fireEvent.click(resourcesTab);
      }
    });

    it('displays resource summary cards', () => {
      expect(screen.getByText('compute')).toBeInTheDocument();
      expect(screen.getByText('database')).toBeInTheDocument();
      expect(screen.getByText('storage')).toBeInTheDocument();
      expect(screen.getByText('network')).toBeInTheDocument();
    });

    it('aggregates resource counts correctly', () => {
      // compute appears twice in mock data, so count should be 2
      const computeCard = screen.getByText('compute').closest('div');
      expect(computeCard?.textContent).toContain('2');
    });

    it('displays resource costs', () => {
      expect(screen.getByText('$1,700.00/mo')).toBeInTheDocument(); // compute: 1200 + 500
      expect(screen.getByText('$800.00/mo')).toBeInTheDocument(); // database
      expect(screen.getByText('$300.00/mo')).toBeInTheDocument(); // storage
      expect(screen.getByText('$250.00/mo')).toBeInTheDocument(); // network
    });
  });

  describe('Cost Analysis Tab', () => {
    beforeEach(() => {
      render(<CloudPage />);
      const costsTab = screen.getByText('Cost Analysis');
      fireEvent.click(costsTab);
    });

    it('displays Cost Breakdown heading', () => {
      expect(screen.getByText('Cost Breakdown by Account')).toBeInTheDocument();
    });

    it('displays accounts sorted by cost descending', () => {
      const accountNames = screen.getAllByText(/Production AWS|Development Azure|Staging GCP/);
      // Production AWS ($2500) should appear first in cost breakdown
      expect(accountNames[0].textContent).toContain('Production AWS');
    });

    it('displays cost percentages', () => {
      // Production AWS: 2500 / 3750 = 66.7%
      expect(screen.getByText(/66\.7%/)).toBeInTheDocument();
      // Development Azure: 800 / 3750 = 21.3%
      expect(screen.getByText(/21\.3%/)).toBeInTheDocument();
      // Staging GCP: 450 / 3750 = 12.0%
      expect(screen.getByText(/12\.0%/)).toBeInTheDocument();
    });

    it('displays Cost Trend section', () => {
      expect(screen.getByText('Cost Trend')).toBeInTheDocument();
      expect(screen.getByText(/Cost trend chart will be displayed here/)).toBeInTheDocument();
    });

    it('displays progress bars for cost breakdown', () => {
      const progressBars = document.querySelectorAll('.bg-blue-600.h-2.rounded-full');
      expect(progressBars.length).toBe(3); // One for each account with cost
    });
  });

  describe('Empty States', () => {
    it('shows empty state when no accounts', () => {
      mockUseCloudAccounts.mockReturnValue({
        data: { data: [] },
        isLoading: false,
        error: null,
      });

      render(<CloudPage />);
      expect(screen.getByText('No cloud accounts')).toBeInTheDocument();
      expect(screen.getByText('Add a cloud account to start monitoring resources')).toBeInTheDocument();
    });

    it('shows Add Account button in empty state', () => {
      mockUseCloudAccounts.mockReturnValue({
        data: { data: [] },
        isLoading: false,
        error: null,
      });

      render(<CloudPage />);
      const addButtons = screen.getAllByText('Add Account');
      expect(addButtons.length).toBeGreaterThan(0);
    });

    it('shows empty resources message when no resources', () => {
      mockUseCloudResources.mockReturnValue({
        data: { data: [] },
        isLoading: false,
        error: null,
      });

      render(<CloudPage />);
      const tabs = screen.getAllByRole('button');
      const resourcesTab = tabs.find(tab => tab.textContent === 'Resources');
      if (resourcesTab) {
        fireEvent.click(resourcesTab);
      }

      expect(screen.getByText('No resources discovered')).toBeInTheDocument();
      expect(screen.getByText('Resources will appear after cloud accounts are synced')).toBeInTheDocument();
    });

    it('shows no cost data message when accounts have no costs', () => {
      mockUseCloudAccounts.mockReturnValue({
        data: { data: [{ id: 'acc-1', name: 'Test', provider: 'aws', status: 'connected', monthly_cost: 0 }] },
        isLoading: false,
        error: null,
      });

      render(<CloudPage />);
      const costsTab = screen.getByText('Cost Analysis');
      fireEvent.click(costsTab);

      expect(screen.getByText('No cost data available')).toBeInTheDocument();
    });
  });

  describe('Loading States', () => {
    it('shows loading spinner for accounts', () => {
      mockUseCloudAccounts.mockReturnValue({
        data: null,
        isLoading: true,
        error: null,
      });

      render(<CloudPage />);
      expect(screen.getByText('Loading cloud accounts...')).toBeInTheDocument();
    });

    it('shows loading spinner for resources', () => {
      mockUseCloudResources.mockReturnValue({
        data: null,
        isLoading: true,
        error: null,
      });

      render(<CloudPage />);
      const tabs = screen.getAllByRole('button');
      const resourcesTab = tabs.find(tab => tab.textContent === 'Resources');
      if (resourcesTab) {
        fireEvent.click(resourcesTab);
      }

      expect(screen.getByText('Loading resources...')).toBeInTheDocument();
    });

    it('shows loading spinner for costs', () => {
      mockUseCloudCosts.mockReturnValue({
        data: null,
        isLoading: true,
        error: null,
      });

      render(<CloudPage />);
      const costsTab = screen.getByText('Cost Analysis');
      fireEvent.click(costsTab);

      expect(screen.getByText('Loading cost data...')).toBeInTheDocument();
    });
  });

  describe('Error States', () => {
    it('shows error message when accounts fail to load', () => {
      mockUseCloudAccounts.mockReturnValue({
        data: null,
        isLoading: false,
        error: { message: 'Network error' },
      });

      render(<CloudPage />);
      expect(screen.getByText('Error loading cloud data')).toBeInTheDocument();
      expect(screen.getByText('Please try refreshing the page')).toBeInTheDocument();
    });
  });

  describe('Status Badge Logic', () => {
    it('displays Connected for connected status', () => {
      render(<CloudPage />);
      const connectedBadges = screen.getAllByText('Connected');
      expect(connectedBadges.length).toBeGreaterThan(0);
    });

    it('displays Connected for active status', () => {
      render(<CloudPage />);
      const connectedBadges = screen.getAllByText('Connected');
      expect(connectedBadges.length).toBe(2); // One for connected, one for active
    });

    it('displays Error for error status', () => {
      render(<CloudPage />);
      expect(screen.getByText('Error')).toBeInTheDocument();
    });

    it('applies green badge color for connected accounts', () => {
      render(<CloudPage />);
      const connectedBadges = screen.getAllByText('Connected');
      connectedBadges.forEach(badge => {
        expect(badge).toHaveClass('bg-green-100', 'text-green-800');
      });
    });

    it('applies red badge color for error accounts', () => {
      render(<CloudPage />);
      const errorBadge = screen.getByText('Error');
      expect(errorBadge).toHaveClass('bg-red-100', 'text-red-800');
    });
  });

  describe('Currency Formatting', () => {
    it('formats costs as USD currency', () => {
      render(<CloudPage />);
      expect(screen.getByText('$2,500.00')).toBeInTheDocument();
      expect(screen.getByText('$800.00')).toBeInTheDocument();
      expect(screen.getByText('$450.00')).toBeInTheDocument();
    });

    it('formats zero cost correctly', () => {
      mockUseCloudAccounts.mockReturnValue({
        data: { data: [{ id: 'acc-1', name: 'Free Tier', provider: 'aws', status: 'connected', resource_count: 5, monthly_cost: 0 }] },
        isLoading: false,
        error: null,
      });

      render(<CloudPage />);
      const zeroCosts = screen.getAllByText('$0.00');
      expect(zeroCosts.length).toBeGreaterThan(0);
    });
  });

  describe('Date Formatting', () => {
    it('formats last synced dates correctly', () => {
      render(<CloudPage />);
      // Check that "Last synced:" text appears
      const lastSyncedTexts = screen.getAllByText(/Last synced:/);
      expect(lastSyncedTexts.length).toBeGreaterThan(0);
    });
  });

  describe('Cost Trend Indicators', () => {
    it('does not show trend indicator when trend is 0', () => {
      render(<CloudPage />);
      // Staging GCP has 0 trend, so no percentage should appear next to its cost
      const gcpCard = screen.getByText('Staging GCP').closest('a');
      expect(gcpCard?.textContent).not.toContain('0%');
    });

    it('shows positive trend in red', () => {
      render(<CloudPage />);
      const positiveTrend = screen.getByText('15%');
      expect(positiveTrend).toHaveClass('text-red-600');
    });

    it('shows negative trend in green', () => {
      render(<CloudPage />);
      const negativeTrend = screen.getByText('5%');
      expect(negativeTrend).toHaveClass('text-green-600');
    });
  });

  describe('Provider Fallbacks', () => {
    it('displays unknown provider name as-is', () => {
      mockUseCloudAccounts.mockReturnValue({
        data: {
          data: [{
            id: 'acc-4',
            name: 'Custom Cloud',
            provider: 'custom',
            status: 'connected',
            resource_count: 10,
            monthly_cost: 500
          }]
        },
        isLoading: false,
        error: null,
      });

      render(<CloudPage />);
      expect(screen.getByText('custom')).toBeInTheDocument();
    });

    it('applies default colors for unknown provider', () => {
      mockUseCloudAccounts.mockReturnValue({
        data: {
          data: [{
            id: 'acc-4',
            name: 'Custom Cloud',
            provider: 'custom',
            status: 'connected',
            resource_count: 10,
            monthly_cost: 500
          }]
        },
        isLoading: false,
        error: null,
      });

      render(<CloudPage />);
      const customBadge = screen.getByText('custom');
      expect(customBadge).toHaveClass('bg-gray-100', 'text-gray-800');
    });
  });

  describe('Resource Type Icons', () => {
    it('displays icons for each resource type', () => {
      render(<CloudPage />);
      const tabs = screen.getAllByRole('button');
      const resourcesTab = tabs.find(tab => tab.textContent === 'Resources');
      if (resourcesTab) {
        fireEvent.click(resourcesTab);
      }

      const resourceCards = document.querySelectorAll('.bg-white.rounded-lg.shadow.p-4');
      expect(resourceCards.length).toBeGreaterThan(0);
    });
  });

  describe('Account Without Optional Fields', () => {
    it('displays 0 when resource_count is undefined', () => {
      mockUseCloudAccounts.mockReturnValue({
        data: {
          data: [{
            id: 'acc-5',
            name: 'New Account',
            provider: 'aws',
            status: 'connected',
          }]
        },
        isLoading: false,
        error: null,
      });

      render(<CloudPage />);
      const zeros = screen.getAllByText('0');
      expect(zeros.length).toBeGreaterThan(0);
    });

    it('formats $0.00 when monthly_cost is undefined', () => {
      mockUseCloudAccounts.mockReturnValue({
        data: {
          data: [{
            id: 'acc-5',
            name: 'New Account',
            provider: 'aws',
            status: 'connected',
            resource_count: 5
          }]
        },
        isLoading: false,
        error: null,
      });

      render(<CloudPage />);
      const zeroCosts = screen.getAllByText('$0.00');
      expect(zeroCosts.length).toBeGreaterThan(0);
    });

    it('does not display last synced when last_synced_at is undefined', () => {
      mockUseCloudAccounts.mockReturnValue({
        data: {
          data: [{
            id: 'acc-5',
            name: 'New Account',
            provider: 'aws',
            status: 'connected',
            resource_count: 5,
            monthly_cost: 100
          }]
        },
        isLoading: false,
        error: null,
      });

      render(<CloudPage />);
      expect(screen.queryByText(/Last synced:/)).not.toBeInTheDocument();
    });
  });
});
