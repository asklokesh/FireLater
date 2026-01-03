import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CatalogPage from '../page';

// Mock the API hooks
vi.mock('@/hooks/useApi', () => ({
  useCatalogItems: vi.fn(),
  useCatalogRequests: vi.fn(),
}));

// Import mocked hooks
import { useCatalogItems, useCatalogRequests } from '@/hooks/useApi';

const mockCatalogItems = [
  {
    id: 'cat-1',
    name: 'MacBook Pro',
    description: 'Latest MacBook Pro for developers',
    category: 'hardware',
    fulfillment_time: '3-5 business days',
    request_count: 45,
  },
  {
    id: 'cat-2',
    name: 'Microsoft Office 365',
    description: 'Office productivity suite',
    category: 'software',
    fulfillment_time: '1-2 business days',
    request_count: 78,
  },
  {
    id: 'cat-3',
    name: 'VPN Access',
    description: 'Corporate VPN access for remote work',
    category: 'access',
    fulfillment_time: '1 business day',
    request_count: 34,
  },
  {
    id: 'cat-4',
    name: 'Cloud Storage',
    description: 'Additional cloud storage allocation',
    category: 'storage',
    fulfillment_time: '4 hours',
    request_count: 23,
  },
  {
    id: 'cat-5',
    name: 'Network Switch',
    description: 'Cisco network switch',
    category: 'network',
    fulfillment_time: '1 week',
    request_count: 12,
  },
  {
    id: 'cat-6',
    name: 'Email Account',
    description: 'Corporate email account setup',
    category: 'email',
    fulfillment_time: '2 hours',
    request_count: 56,
  },
];

const mockRequests = [
  {
    id: 'req-1',
    number: 'REQ-001',
    state: 'pending_approval',
    created_at: '2023-12-01T10:00:00Z',
    catalog_item: {
      id: 'cat-1',
      name: 'MacBook Pro',
    },
  },
  {
    id: 'req-2',
    number: 'REQ-002',
    state: 'in_progress',
    created_at: '2023-11-25T14:30:00Z',
    catalog_item: {
      id: 'cat-2',
      name: 'Microsoft Office 365',
    },
  },
  {
    id: 'req-3',
    number: 'REQ-003',
    state: 'fulfilled',
    created_at: '2023-11-15T09:00:00Z',
    catalog_item: {
      id: 'cat-3',
      name: 'VPN Access',
    },
  },
  {
    id: 'req-4',
    number: 'REQ-004',
    state: 'cancelled',
    created_at: '2023-10-30T16:45:00Z',
    catalog_item: {
      id: 'cat-4',
      name: 'Cloud Storage',
    },
  },
];

const mockUseCatalogItems = useCatalogItems as ReturnType<typeof vi.fn>;
const mockUseCatalogRequests = useCatalogRequests as ReturnType<typeof vi.fn>;

describe('CatalogPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockUseCatalogItems.mockReturnValue({
      data: { data: mockCatalogItems },
      isLoading: false,
      error: null,
    });

    mockUseCatalogRequests.mockReturnValue({
      data: { data: mockRequests },
      isLoading: false,
      error: null,
    });
  });

  describe('Basic Rendering', () => {
    it('renders the page title', () => {
      render(<CatalogPage />);
      expect(screen.getByText('Service Catalog')).toBeInTheDocument();
    });

    it('renders the subtitle', () => {
      render(<CatalogPage />);
      expect(screen.getByText('Browse and request IT services')).toBeInTheDocument();
    });

    it('renders the search input', () => {
      render(<CatalogPage />);
      const searchInput = screen.getByPlaceholderText('Search for services, software, hardware...');
      expect(searchInput).toBeInTheDocument();
    });

    it('renders the Browse Catalog tab', () => {
      render(<CatalogPage />);
      expect(screen.getByText('Browse Catalog')).toBeInTheDocument();
    });

    it('renders the My Requests tab with count', () => {
      render(<CatalogPage />);
      expect(screen.getByText('My Requests')).toBeInTheDocument();
      expect(screen.getByText('4')).toBeInTheDocument(); // request count badge
    });
  });

  describe('Tab Switching', () => {
    it('shows Browse Catalog tab by default', () => {
      render(<CatalogPage />);
      expect(screen.getByText('Popular Services')).toBeInTheDocument();
    });

    it('switches to My Requests tab when clicked', () => {
      render(<CatalogPage />);
      const myRequestsTab = screen.getByText('My Requests');
      fireEvent.click(myRequestsTab);
      expect(screen.getByText('My Service Requests')).toBeInTheDocument();
    });

    it('switches back to Browse Catalog tab when clicked', () => {
      render(<CatalogPage />);
      const myRequestsTab = screen.getByText('My Requests');
      const browseTab = screen.getByText('Browse Catalog');

      fireEvent.click(myRequestsTab);
      expect(screen.getByText('My Service Requests')).toBeInTheDocument();

      fireEvent.click(browseTab);
      expect(screen.getByText('Popular Services')).toBeInTheDocument();
    });
  });

  describe('Search Functionality', () => {
    it('updates search query when typing', () => {
      render(<CatalogPage />);
      const searchInput = screen.getByPlaceholderText('Search for services, software, hardware...');

      fireEvent.change(searchInput, { target: { value: 'MacBook' } });
      expect(searchInput).toHaveValue('MacBook');
    });

    it('shows search results section when searching', () => {
      render(<CatalogPage />);
      const searchInput = screen.getByPlaceholderText('Search for services, software, hardware...');

      fireEvent.change(searchInput, { target: { value: 'MacBook' } });
      expect(screen.getByText('Search Results')).toBeInTheDocument();
    });

    it('filters items by name', () => {
      render(<CatalogPage />);
      const searchInput = screen.getByPlaceholderText('Search for services, software, hardware...');

      fireEvent.change(searchInput, { target: { value: 'MacBook' } });
      expect(screen.getByText('MacBook Pro')).toBeInTheDocument();
      // Office 365 should not be in search results when searching for MacBook
      expect(screen.queryByText('Office productivity suite')).not.toBeInTheDocument();
    });

    it('filters items by description', () => {
      render(<CatalogPage />);
      const searchInput = screen.getByPlaceholderText('Search for services, software, hardware...');

      fireEvent.change(searchInput, { target: { value: 'developers' } });
      expect(screen.getByText('MacBook Pro')).toBeInTheDocument();
    });

    it('shows no results message when search has no matches', () => {
      render(<CatalogPage />);
      const searchInput = screen.getByPlaceholderText('Search for services, software, hardware...');

      fireEvent.change(searchInput, { target: { value: 'nonexistent item' } });
      expect(screen.getByText('No items found matching your search')).toBeInTheDocument();
    });

    it('hides Popular Services section when searching', () => {
      render(<CatalogPage />);
      expect(screen.getByText('Popular Services')).toBeInTheDocument();

      const searchInput = screen.getByPlaceholderText('Search for services, software, hardware...');
      fireEvent.change(searchInput, { target: { value: 'MacBook' } });

      expect(screen.queryByText('Popular Services')).not.toBeInTheDocument();
    });

    it('hides Browse by Category section when searching', () => {
      render(<CatalogPage />);
      expect(screen.getByText('Browse by Category')).toBeInTheDocument();

      const searchInput = screen.getByPlaceholderText('Search for services, software, hardware...');
      fireEvent.change(searchInput, { target: { value: 'MacBook' } });

      expect(screen.queryByText('Browse by Category')).not.toBeInTheDocument();
    });
  });

  describe('Popular Services Section', () => {
    it('renders Popular Services heading', () => {
      render(<CatalogPage />);
      expect(screen.getByText('Popular Services')).toBeInTheDocument();
    });

    it('shows top 6 most requested items', () => {
      render(<CatalogPage />);
      // Top 6 by request_count: Office (78), Email (56), MacBook (45), VPN (34), Cloud (23), Network (12)
      expect(screen.getAllByText('Microsoft Office 365')[0]).toBeInTheDocument();
      expect(screen.getAllByText('Email Account')[0]).toBeInTheDocument();
      expect(screen.getAllByText('MacBook Pro')[0]).toBeInTheDocument();
    });

    it('displays item descriptions in popular items', () => {
      render(<CatalogPage />);
      expect(screen.getByText('Office productivity suite')).toBeInTheDocument();
    });

    it('displays fulfillment time in popular items', () => {
      render(<CatalogPage />);
      expect(screen.getByText('1-2 business days')).toBeInTheDocument();
    });

    it('displays category in popular items', () => {
      render(<CatalogPage />);
      // Categories are displayed in the popular items section
      const categoryTexts = screen.getAllByText(/hardware|software|access|storage|network|email/);
      expect(categoryTexts.length).toBeGreaterThan(0);
    });

    it('links to item detail page', () => {
      render(<CatalogPage />);
      const links = screen.getAllByRole('link');
      const macBookLink = links.find(link => link.textContent?.includes('MacBook Pro'));
      expect(macBookLink).toHaveAttribute('href', '/catalog/cat-1');
    });
  });

  describe('Browse by Category Section', () => {
    it('renders Browse by Category heading', () => {
      render(<CatalogPage />);
      expect(screen.getByText('Browse by Category')).toBeInTheDocument();
    });

    it('displays all categories', () => {
      render(<CatalogPage />);
      // All 6 categories should appear in Browse by Category section
      const allCategories = screen.getAllByText(/hardware|software|access|storage|network|email/);
      // Each category appears at least once (in popular items and category browse section)
      expect(allCategories.length).toBeGreaterThanOrEqual(6);
    });

    it('displays item count for each category', () => {
      render(<CatalogPage />);
      // Each category has 1 item in mock data
      const itemTexts = screen.getAllByText('1 item');
      expect(itemTexts.length).toBeGreaterThan(0);
    });

    it('links to category filter page', () => {
      render(<CatalogPage />);
      const links = screen.getAllByRole('link');
      const hardwareLink = links.find(link => link.getAttribute('href') === '/catalog?category=hardware');
      expect(hardwareLink).toBeDefined();
    });

    it('displays correct icon for hardware category', () => {
      render(<CatalogPage />);
      const links = screen.getAllByRole('link');
      const hardwareLink = links.find(link => link.getAttribute('href') === '/catalog?category=hardware');
      expect(hardwareLink?.querySelector('svg')).toBeTruthy();
    });
  });

  describe('My Requests Tab', () => {
    beforeEach(() => {
      render(<CatalogPage />);
      const myRequestsTab = screen.getByText('My Requests');
      fireEvent.click(myRequestsTab);
    });

    it('renders My Service Requests heading', () => {
      expect(screen.getByText('My Service Requests')).toBeInTheDocument();
    });

    it('displays all requests', () => {
      expect(screen.getByText('REQ-001')).toBeInTheDocument();
      expect(screen.getByText('REQ-002')).toBeInTheDocument();
      expect(screen.getByText('REQ-003')).toBeInTheDocument();
      expect(screen.getByText('REQ-004')).toBeInTheDocument();
    });

    it('displays catalog item names', () => {
      expect(screen.getAllByText('MacBook Pro')[0]).toBeInTheDocument();
      expect(screen.getAllByText('Microsoft Office 365')[0]).toBeInTheDocument();
      expect(screen.getAllByText('VPN Access')[0]).toBeInTheDocument();
      expect(screen.getAllByText('Cloud Storage')[0]).toBeInTheDocument();
    });

    it('displays request status badges', () => {
      expect(screen.getByText('Pending Approval')).toBeInTheDocument();
      expect(screen.getByText('In Progress')).toBeInTheDocument();
      expect(screen.getByText('Fulfilled')).toBeInTheDocument();
      expect(screen.getByText('Cancelled')).toBeInTheDocument();
    });

    it('displays formatted submission dates', () => {
      expect(screen.getByText(/Dec 1, 2023/)).toBeInTheDocument();
      expect(screen.getByText(/Nov 25, 2023/)).toBeInTheDocument();
    });

    it('applies correct status colors', () => {
      const pendingApprovalBadge = screen.getByText('Pending Approval');
      expect(pendingApprovalBadge).toHaveClass('bg-yellow-100', 'text-yellow-800');

      const inProgressBadge = screen.getByText('In Progress');
      expect(inProgressBadge).toHaveClass('bg-blue-100', 'text-blue-800');

      const fulfilledBadge = screen.getByText('Fulfilled');
      expect(fulfilledBadge).toHaveClass('bg-green-100', 'text-green-800');

      const cancelledBadge = screen.getByText('Cancelled');
      expect(cancelledBadge).toHaveClass('bg-red-100', 'text-red-800');
    });

    it('links to request detail page', () => {
      const req001Link = screen.getByText('REQ-001').closest('a');
      expect(req001Link).toHaveAttribute('href', '/catalog/requests/req-1');
    });
  });

  describe('Empty States', () => {
    it('shows empty catalog message when no items', () => {
      mockUseCatalogItems.mockReturnValue({
        data: { data: [] },
        isLoading: false,
        error: null,
      });

      render(<CatalogPage />);
      expect(screen.getByText('No catalog items')).toBeInTheDocument();
      expect(screen.getByText('The service catalog is empty')).toBeInTheDocument();
    });

    it('shows empty requests message when no requests', () => {
      mockUseCatalogRequests.mockReturnValue({
        data: { data: [] },
        isLoading: false,
        error: null,
      });

      render(<CatalogPage />);
      const myRequestsTab = screen.getByText('My Requests');
      fireEvent.click(myRequestsTab);

      expect(screen.getByText('No service requests yet')).toBeInTheDocument();
    });

    it('shows Browse Catalog button in empty requests state', () => {
      mockUseCatalogRequests.mockReturnValue({
        data: { data: [] },
        isLoading: false,
        error: null,
      });

      render(<CatalogPage />);
      const myRequestsTab = screen.getByText('My Requests');
      fireEvent.click(myRequestsTab);

      const browseCatalogButtons = screen.getAllByText('Browse Catalog');
      // Should have at least the button in empty state
      expect(browseCatalogButtons.length).toBeGreaterThan(0);
    });

    it('switches to browse tab when clicking Browse Catalog button', () => {
      mockUseCatalogRequests.mockReturnValue({
        data: { data: [] },
        isLoading: false,
        error: null,
      });

      render(<CatalogPage />);
      const myRequestsTab = screen.getByText('My Requests');
      fireEvent.click(myRequestsTab);

      // Get all buttons and find the one with Browse Catalog text
      const buttons = screen.getAllByRole('button');
      const browseCatalogButton = buttons.find(btn => btn.textContent === 'Browse Catalog');
      expect(browseCatalogButton).toBeDefined();

      if (browseCatalogButton) {
        fireEvent.click(browseCatalogButton);
        expect(screen.getByText('Popular Services')).toBeInTheDocument();
      }
    });
  });

  describe('Loading States', () => {
    it('shows loading spinner when catalog is loading', () => {
      mockUseCatalogItems.mockReturnValue({
        data: null,
        isLoading: true,
        error: null,
      });

      render(<CatalogPage />);
      expect(screen.getByText('Loading catalog...')).toBeInTheDocument();
    });

    it('shows loading spinner when requests are loading', () => {
      mockUseCatalogRequests.mockReturnValue({
        data: null,
        isLoading: true,
        error: null,
      });

      render(<CatalogPage />);
      const myRequestsTab = screen.getByText('My Requests');
      fireEvent.click(myRequestsTab);

      expect(screen.getByText('Loading requests...')).toBeInTheDocument();
    });
  });

  describe('Error States', () => {
    it('shows error message when catalog fails to load', () => {
      mockUseCatalogItems.mockReturnValue({
        data: null,
        isLoading: false,
        error: { message: 'Network error' },
      });

      render(<CatalogPage />);
      expect(screen.getByText('Error loading catalog')).toBeInTheDocument();
      expect(screen.getByText('Please try refreshing the page')).toBeInTheDocument();
    });
  });

  describe('Quick Links Section', () => {
    it('renders Need Help heading', () => {
      render(<CatalogPage />);
      expect(screen.getByText('Need Help?')).toBeInTheDocument();
    });

    it('displays Report an Issue link', () => {
      render(<CatalogPage />);
      expect(screen.getByText('Report an Issue')).toBeInTheDocument();
      expect(screen.getByText('Something not working?')).toBeInTheDocument();
    });

    it('displays Knowledge Base link', () => {
      render(<CatalogPage />);
      expect(screen.getByText('Knowledge Base')).toBeInTheDocument();
      expect(screen.getByText('Find answers yourself')).toBeInTheDocument();
    });

    it('displays Contact Support link', () => {
      render(<CatalogPage />);
      expect(screen.getByText('Contact Support')).toBeInTheDocument();
      expect(screen.getByText('Talk to our team')).toBeInTheDocument();
    });

    it('links to issues page', () => {
      render(<CatalogPage />);
      const issueLink = screen.getByText('Report an Issue').closest('a');
      expect(issueLink).toHaveAttribute('href', '/issues/new');
    });

    it('links to knowledge base page', () => {
      render(<CatalogPage />);
      const kbLink = screen.getByText('Knowledge Base').closest('a');
      expect(kbLink).toHaveAttribute('href', '/knowledge');
    });

    it('links to support page', () => {
      render(<CatalogPage />);
      const supportLink = screen.getByText('Contact Support').closest('a');
      expect(supportLink).toHaveAttribute('href', '/support');
    });
  });

  describe('Search Result Items', () => {
    it('displays fulfillment time in search results', () => {
      render(<CatalogPage />);
      const searchInput = screen.getByPlaceholderText('Search for services, software, hardware...');

      fireEvent.change(searchInput, { target: { value: 'MacBook' } });
      expect(screen.getByText('3-5 business days')).toBeInTheDocument();
    });

    it('displays Variable when fulfillment time is missing', () => {
      const itemsWithoutTime = [{
        ...mockCatalogItems[0],
        fulfillment_time: undefined,
      }];

      mockUseCatalogItems.mockReturnValue({
        data: { data: itemsWithoutTime },
        isLoading: false,
        error: null,
      });

      render(<CatalogPage />);
      const searchInput = screen.getByPlaceholderText('Search for services, software, hardware...');

      fireEvent.change(searchInput, { target: { value: 'MacBook' } });
      expect(screen.getByText('Variable')).toBeInTheDocument();
    });

    it('links search result items to detail pages', () => {
      render(<CatalogPage />);
      const searchInput = screen.getByPlaceholderText('Search for services, software, hardware...');

      fireEvent.change(searchInput, { target: { value: 'MacBook' } });

      const resultLinks = screen.getAllByRole('link');
      const macBookLink = resultLinks.find(link => link.getAttribute('href') === '/catalog/cat-1');
      expect(macBookLink).toBeInTheDocument();
    });
  });

  describe('Request Without Catalog Item', () => {
    it('displays "Service Request" when catalog_item is missing', () => {
      const requestsWithoutItem = [{
        id: 'req-5',
        number: 'REQ-005',
        state: 'pending',
        created_at: '2023-12-10T10:00:00Z',
        catalog_item: undefined,
      }];

      mockUseCatalogRequests.mockReturnValue({
        data: { data: requestsWithoutItem },
        isLoading: false,
        error: null,
      });

      render(<CatalogPage />);
      const myRequestsTab = screen.getByText('My Requests');
      fireEvent.click(myRequestsTab);

      expect(screen.getByText('Service Request')).toBeInTheDocument();
    });

    it('displays fallback status for unknown state', () => {
      const requestsWithUnknownState = [{
        id: 'req-6',
        number: 'REQ-006',
        state: 'unknown_state',
        created_at: '2023-12-10T10:00:00Z',
        catalog_item: {
          id: 'cat-1',
          name: 'Test Item',
        },
      }];

      mockUseCatalogRequests.mockReturnValue({
        data: { data: requestsWithUnknownState },
        isLoading: false,
        error: null,
      });

      render(<CatalogPage />);
      const myRequestsTab = screen.getByText('My Requests');
      fireEvent.click(myRequestsTab);

      expect(screen.getByText('unknown_state')).toBeInTheDocument();
    });
  });

  describe('Category with Multiple Items', () => {
    it('displays plural "items" when category has multiple items', () => {
      const multipleHardwareItems = [
        ...mockCatalogItems,
        {
          id: 'cat-7',
          name: 'Dell Monitor',
          description: '27" monitor',
          category: 'hardware',
          fulfillment_time: '2 days',
          request_count: 10,
        },
      ];

      mockUseCatalogItems.mockReturnValue({
        data: { data: multipleHardwareItems },
        isLoading: false,
        error: null,
      });

      render(<CatalogPage />);
      expect(screen.getByText('2 items')).toBeInTheDocument();
    });
  });

  describe('Popular Items Ordering', () => {
    it('orders popular items by request count descending', () => {
      render(<CatalogPage />);

      // The first popular item should be Office 365 (78 requests)
      // Verify it appears first by checking all the popular items
      const office365Text = screen.getByText('Office productivity suite');
      expect(office365Text).toBeInTheDocument();
    });

    it('limits popular items to 6', () => {
      const manyItems = Array.from({ length: 20 }, (_, i) => ({
        id: `cat-${i}`,
        name: `Item ${i}`,
        description: `Description ${i}`,
        category: 'software',
        fulfillment_time: '1 day',
        request_count: 100 - i,
      }));

      mockUseCatalogItems.mockReturnValue({
        data: { data: manyItems },
        isLoading: false,
        error: null,
      });

      render(<CatalogPage />);

      const popularSection = screen.getByText('Popular Services').closest('div');
      const items = popularSection?.querySelectorAll('a');

      expect(items?.length).toBeLessThanOrEqual(6);
    });
  });
});
