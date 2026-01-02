import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import RequestsPage from '../page';
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

const mockRequestsData = {
  data: [
    {
      id: '1',
      request_number: 'REQ-001',
      catalog_item_name: 'New Laptop',
      catalog_item_id: 'cat-1',
      status: 'submitted',
      priority: 'high',
      requester_name: 'John Doe',
      requester_id: 'user-1',
      assigned_to_name: null,
      created_at: '2026-01-10T10:00:00Z',
      updated_at: '2026-01-10T10:00:00Z',
    },
    {
      id: '2',
      request_number: 'REQ-002',
      catalog_item_name: 'Software License',
      catalog_item_id: 'cat-2',
      status: 'pending_approval',
      priority: 'medium',
      requester_name: 'Jane Smith',
      requester_id: 'user-2',
      assigned_to_name: null,
      created_at: '2026-01-11T10:00:00Z',
      updated_at: '2026-01-11T10:00:00Z',
    },
    {
      id: '3',
      request_number: 'REQ-003',
      catalog_item_name: 'Access Request',
      catalog_item_id: 'cat-3',
      status: 'completed',
      priority: 'low',
      requester_name: 'Bob Johnson',
      requester_id: 'user-3',
      assigned_to_name: 'Admin User',
      created_at: '2026-01-09T10:00:00Z',
      updated_at: '2026-01-12T10:00:00Z',
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

describe('RequestsPage', () => {
  let mockUseServiceRequests: ReturnType<typeof vi.fn>;
  let mockUseStartServiceRequest: ReturnType<typeof vi.fn>;
  let mockUseCompleteServiceRequest: ReturnType<typeof vi.fn>;
  let mockUseCancelServiceRequest: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockUseServiceRequests = vi.fn(() => ({
      data: mockRequestsData,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    }));

    mockUseStartServiceRequest = vi.fn(() => ({
      mutateAsync: vi.fn(),
      isPending: false,
    }));

    mockUseCompleteServiceRequest = vi.fn(() => ({
      mutateAsync: vi.fn(),
      isPending: false,
    }));

    mockUseCancelServiceRequest = vi.fn(() => ({
      mutateAsync: vi.fn(),
      isPending: false,
    }));

    vi.spyOn(useApiHooks, 'useServiceRequests').mockImplementation(mockUseServiceRequests);
    vi.spyOn(useApiHooks, 'useStartServiceRequest').mockImplementation(mockUseStartServiceRequest);
    vi.spyOn(useApiHooks, 'useCompleteServiceRequest').mockImplementation(mockUseCompleteServiceRequest);
    vi.spyOn(useApiHooks, 'useCancelServiceRequest').mockImplementation(mockUseCancelServiceRequest);
  });

  describe('Basic Rendering', () => {
    it('renders page title and description', () => {
      render(<RequestsPage />, { wrapper: createWrapper() });

      expect(screen.getByText('Service Requests')).toBeInTheDocument();
      expect(screen.getByText(/View and manage all service requests/i)).toBeInTheDocument();
    });

    it('renders pending approvals button', () => {
      render(<RequestsPage />, { wrapper: createWrapper() });

      const button = screen.getByText('Pending Approvals').closest('a');
      expect(button).toHaveAttribute('href', '/requests/approvals');
    });

    it('renders service catalog button', () => {
      render(<RequestsPage />, { wrapper: createWrapper() });

      const button = screen.getByText('Service Catalog').closest('a');
      expect(button).toHaveAttribute('href', '/catalog');
    });

    it('renders search input', () => {
      render(<RequestsPage />, { wrapper: createWrapper() });

      expect(screen.getByPlaceholderText(/Search by request number or catalog item/i)).toBeInTheDocument();
    });

    it('renders filter button', () => {
      render(<RequestsPage />, { wrapper: createWrapper() });

      expect(screen.getByText(/Filters/i)).toBeInTheDocument();
    });
  });

  describe('Request List', () => {
    it('displays request numbers', () => {
      render(<RequestsPage />, { wrapper: createWrapper() });

      expect(screen.getByText('REQ-001')).toBeInTheDocument();
      expect(screen.getByText('REQ-002')).toBeInTheDocument();
      expect(screen.getByText('REQ-003')).toBeInTheDocument();
    });

    it('displays catalog item names', () => {
      render(<RequestsPage />, { wrapper: createWrapper() });

      expect(screen.getByText('New Laptop')).toBeInTheDocument();
      expect(screen.getByText('Software License')).toBeInTheDocument();
      expect(screen.getByText('Access Request')).toBeInTheDocument();
    });

    it('displays status badges', () => {
      render(<RequestsPage />, { wrapper: createWrapper() });

      expect(screen.getByText('Submitted')).toBeInTheDocument();
      expect(screen.getByText('Pending Approval')).toBeInTheDocument();
      expect(screen.getByText('Completed')).toBeInTheDocument();
    });

    it('displays priority badges', () => {
      render(<RequestsPage />, { wrapper: createWrapper() });

      expect(screen.getByText('High')).toBeInTheDocument();
      expect(screen.getByText('Medium')).toBeInTheDocument();
      expect(screen.getByText('Low')).toBeInTheDocument();
    });

    it('displays requester names', () => {
      render(<RequestsPage />, { wrapper: createWrapper() });

      expect(screen.getByText(/John Doe/)).toBeInTheDocument();
      expect(screen.getByText(/Jane Smith/)).toBeInTheDocument();
      expect(screen.getByText(/Bob Johnson/)).toBeInTheDocument();
    });
  });

  describe('Filter Panel', () => {
    it('toggles filter panel on button click', () => {
      render(<RequestsPage />, { wrapper: createWrapper() });

      const filterButton = screen.getByText(/Filters/i);
      fireEvent.click(filterButton);

      const statusLabels = screen.getAllByText(/Status/i);
      expect(statusLabels.length).toBeGreaterThan(0);
    });

    it('shows status filter options', () => {
      render(<RequestsPage />, { wrapper: createWrapper() });

      const filterButton = screen.getByText(/Filters/i);
      fireEvent.click(filterButton);

      const statusSelects = screen.getAllByDisplayValue(/All Status/i);
      expect(statusSelects.length).toBeGreaterThan(0);
    });

    it('shows priority filter options', () => {
      render(<RequestsPage />, { wrapper: createWrapper() });

      const filterButton = screen.getByText(/Filters/i);
      fireEvent.click(filterButton);

      const prioritySelects = screen.getAllByDisplayValue(/All Priorities/i);
      expect(prioritySelects.length).toBeGreaterThan(0);
    });
  });

  describe('Search', () => {
    it('allows entering search query', () => {
      render(<RequestsPage />, { wrapper: createWrapper() });

      const searchInput = screen.getByPlaceholderText(/Search by request number or catalog item/i);
      fireEvent.change(searchInput, { target: { value: 'laptop' } });

      expect(searchInput).toHaveValue('laptop');
    });
  });

  describe('Loading State', () => {
    it('shows loading indicator when fetching requests', () => {
      mockUseServiceRequests.mockReturnValue({
        data: null,
        isLoading: true,
        error: null,
        refetch: vi.fn(),
      });

      render(<RequestsPage />, { wrapper: createWrapper() });

      expect(screen.getByText(/Loading requests/i)).toBeInTheDocument();
    });
  });

  describe('Error State', () => {
    it('shows error message when fetch fails', () => {
      mockUseServiceRequests.mockReturnValue({
        data: null,
        isLoading: false,
        error: { message: 'Failed to load requests' },
        refetch: vi.fn(),
      });

      render(<RequestsPage />, { wrapper: createWrapper() });

      expect(screen.getByText(/Error loading service requests/i)).toBeInTheDocument();
    });

    it('shows retry message on error', () => {
      mockUseServiceRequests.mockReturnValue({
        data: null,
        isLoading: false,
        error: { message: 'Network error' },
        refetch: vi.fn(),
      });

      render(<RequestsPage />, { wrapper: createWrapper() });

      expect(screen.getByText(/Please try refreshing/i)).toBeInTheDocument();
    });
  });

  describe('Empty State', () => {
    it('shows empty state when no requests', () => {
      mockUseServiceRequests.mockReturnValue({
        data: { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 } },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<RequestsPage />, { wrapper: createWrapper() });

      expect(screen.getByText(/No requests found/i)).toBeInTheDocument();
    });

    it('shows suggestion in empty state', () => {
      mockUseServiceRequests.mockReturnValue({
        data: { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 } },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<RequestsPage />, { wrapper: createWrapper() });

      expect(screen.getByText(/Try adjusting your search or filters/i)).toBeInTheDocument();
    });
  });

  describe('Pagination', () => {
    it('shows pagination count when there are multiple pages', () => {
      mockUseServiceRequests.mockReturnValue({
        data: {
          data: mockRequestsData.data,
          pagination: { page: 1, limit: 20, total: 50, totalPages: 3 },
        },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<RequestsPage />, { wrapper: createWrapper() });

      expect(screen.getByText(/Showing 3 of 50 requests/i)).toBeInTheDocument();
    });

    it('shows next button when not on last page', () => {
      mockUseServiceRequests.mockReturnValue({
        data: {
          data: mockRequestsData.data,
          pagination: { page: 1, limit: 20, total: 50, totalPages: 3 },
        },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<RequestsPage />, { wrapper: createWrapper() });

      const nextButton = screen.getByText('Next');
      expect(nextButton).toBeInTheDocument();
      expect(nextButton).not.toBeDisabled();
    });

    it('shows previous button', () => {
      mockUseServiceRequests.mockReturnValue({
        data: {
          data: mockRequestsData.data,
          pagination: { page: 1, limit: 20, total: 50, totalPages: 3 },
        },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<RequestsPage />, { wrapper: createWrapper() });

      expect(screen.getByText('Previous')).toBeInTheDocument();
    });

    it('disables previous button on first page', () => {
      mockUseServiceRequests.mockReturnValue({
        data: {
          data: mockRequestsData.data,
          pagination: { page: 1, limit: 20, total: 50, totalPages: 3 },
        },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<RequestsPage />, { wrapper: createWrapper() });

      const prevButton = screen.getByText('Previous');
      expect(prevButton).toBeDisabled();
    });

    it('enables next button when there are more pages', () => {
      mockUseServiceRequests.mockReturnValue({
        data: {
          data: mockRequestsData.data,
          pagination: { page: 1, limit: 20, total: 50, totalPages: 3 },
        },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<RequestsPage />, { wrapper: createWrapper() });

      const nextButton = screen.getByText('Next');
      expect(nextButton).not.toBeDisabled();
    });
  });

  describe('Status Variations', () => {
    it('displays approved status correctly', () => {
      mockUseServiceRequests.mockReturnValue({
        data: {
          data: [{
            ...mockRequestsData.data[0],
            status: 'approved',
          }],
          pagination: mockRequestsData.pagination,
        },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<RequestsPage />, { wrapper: createWrapper() });

      expect(screen.getByText('Approved')).toBeInTheDocument();
    });

    it('displays rejected status correctly', () => {
      mockUseServiceRequests.mockReturnValue({
        data: {
          data: [{
            ...mockRequestsData.data[0],
            status: 'rejected',
          }],
          pagination: mockRequestsData.pagination,
        },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<RequestsPage />, { wrapper: createWrapper() });

      expect(screen.getByText('Rejected')).toBeInTheDocument();
    });

    it('displays assigned status correctly', () => {
      mockUseServiceRequests.mockReturnValue({
        data: {
          data: [{
            ...mockRequestsData.data[0],
            status: 'assigned',
          }],
          pagination: mockRequestsData.pagination,
        },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<RequestsPage />, { wrapper: createWrapper() });

      expect(screen.getByText('Assigned')).toBeInTheDocument();
    });

    it('displays in progress status correctly', () => {
      mockUseServiceRequests.mockReturnValue({
        data: {
          data: [{
            ...mockRequestsData.data[0],
            status: 'in_progress',
          }],
          pagination: mockRequestsData.pagination,
        },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<RequestsPage />, { wrapper: createWrapper() });

      expect(screen.getByText('In Progress')).toBeInTheDocument();
    });

    it('displays pending status correctly', () => {
      mockUseServiceRequests.mockReturnValue({
        data: {
          data: [{
            ...mockRequestsData.data[0],
            status: 'pending',
          }],
          pagination: mockRequestsData.pagination,
        },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<RequestsPage />, { wrapper: createWrapper() });

      const pendingElements = screen.getAllByText(/Pending/);
      expect(pendingElements.length).toBeGreaterThan(0);
    });

    it('displays cancelled status correctly', () => {
      mockUseServiceRequests.mockReturnValue({
        data: {
          data: [{
            ...mockRequestsData.data[0],
            status: 'cancelled',
          }],
          pagination: mockRequestsData.pagination,
        },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<RequestsPage />, { wrapper: createWrapper() });

      expect(screen.getByText('Cancelled')).toBeInTheDocument();
    });
  });

  describe('Priority Variations', () => {
    it('displays critical priority correctly', () => {
      mockUseServiceRequests.mockReturnValue({
        data: {
          data: [{
            ...mockRequestsData.data[0],
            priority: 'critical',
          }],
          pagination: mockRequestsData.pagination,
        },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<RequestsPage />, { wrapper: createWrapper() });

      expect(screen.getByText('Critical')).toBeInTheDocument();
    });
  });
});
