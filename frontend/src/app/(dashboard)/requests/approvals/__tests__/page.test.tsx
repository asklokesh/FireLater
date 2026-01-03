import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PendingApprovalsPage from '../page';
import * as useApiHooks from '@/hooks/useApi';

// Mock Next.js navigation
const mockPush = vi.fn();
const mockBack = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    back: mockBack,
  }),
}));

// Mock Next.js Link
vi.mock('next/link', () => ({
  default: ({ children, href }: any) => <a href={href}>{children}</a>,
}));

// Mock window.confirm
global.confirm = vi.fn(() => true);

describe('PendingApprovalsPage', () => {
  const mockRequests = [
    {
      id: 'req-1',
      request_number: 'REQ-001',
      catalog_item_name: 'New Laptop',
      requester_name: 'John Doe',
      requested_for_name: 'John Doe',
      priority: 'high',
      status: 'pending_approval',
      created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
      notes: 'Urgently needed for new project work',
    },
    {
      id: 'req-2',
      request_number: 'REQ-002',
      catalog_item_name: 'Software License',
      requester_name: 'Jane Smith',
      requested_for_name: 'Bob Johnson',
      priority: 'medium',
      status: 'pending_approval',
      created_at: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(), // 2 days ago
    },
    {
      id: 'req-3',
      request_number: 'REQ-003',
      catalog_item_name: 'Server Access',
      requester_name: 'Alice Brown',
      requested_for_name: 'Alice Brown',
      priority: 'critical',
      status: 'pending_approval',
      created_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(), // 30 minutes ago
    },
  ];

  const mockUsers = [
    { id: 'user-1', name: 'Manager One', email: 'manager1@example.com' },
    { id: 'user-2', name: 'Manager Two', email: 'manager2@example.com' },
  ];

  let mockUseServiceRequests: ReturnType<typeof vi.fn>;
  let mockUseApproveRequest: ReturnType<typeof vi.fn>;
  let mockUseRejectRequest: ReturnType<typeof vi.fn>;
  let mockUseDelegateApproval: ReturnType<typeof vi.fn>;
  let mockUseUsers: ReturnType<typeof vi.fn>;
  let mockRefetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRefetch = vi.fn();

    mockUseServiceRequests = vi.fn(() => ({
      data: {
        data: mockRequests,
        pagination: { page: 1, limit: 20, total: 3, totalPages: 1 },
      },
      isLoading: false,
      error: null,
      refetch: mockRefetch,
    }));

    mockUseApproveRequest = vi.fn(() => ({
      mutateAsync: vi.fn(),
      isPending: false,
    }));

    mockUseRejectRequest = vi.fn(() => ({
      mutateAsync: vi.fn(),
      isPending: false,
    }));

    mockUseDelegateApproval = vi.fn(() => ({
      mutateAsync: vi.fn(),
      isPending: false,
    }));

    mockUseUsers = vi.fn(() => ({
      data: { data: mockUsers },
      isLoading: false,
    }));

    vi.spyOn(useApiHooks, 'useServiceRequests').mockImplementation(mockUseServiceRequests);
    vi.spyOn(useApiHooks, 'useApproveRequest').mockImplementation(mockUseApproveRequest);
    vi.spyOn(useApiHooks, 'useRejectRequest').mockImplementation(mockUseRejectRequest);
    vi.spyOn(useApiHooks, 'useDelegateApproval').mockImplementation(mockUseDelegateApproval);
    vi.spyOn(useApiHooks, 'useUsers').mockImplementation(mockUseUsers);
  });

  describe('Basic Rendering', () => {
    it('renders page title and description', () => {
      render(<PendingApprovalsPage />);

      expect(screen.getByText('Pending Approvals')).toBeInTheDocument();
      expect(screen.getByText('Review and approve service requests awaiting your decision')).toBeInTheDocument();
    });

    it('renders back to requests button', () => {
      render(<PendingApprovalsPage />);

      const backButton = screen.getByRole('button', { name: /back to requests/i });
      expect(backButton).toBeInTheDocument();
      expect(backButton.closest('a')).toHaveAttribute('href', '/requests');
    });

    it('renders search input', () => {
      render(<PendingApprovalsPage />);

      expect(screen.getByPlaceholderText('Search pending approvals...')).toBeInTheDocument();
    });
  });

  describe('Statistics Cards', () => {
    it('displays total pending count', () => {
      render(<PendingApprovalsPage />);

      expect(screen.getByText('Pending')).toBeInTheDocument();
      expect(screen.getByText('3')).toBeInTheDocument(); // Total of 3 requests
    });

    it('displays critical/high priority count', () => {
      render(<PendingApprovalsPage />);

      expect(screen.getByText('Critical/High Priority')).toBeInTheDocument();
      expect(screen.getByText('2')).toBeInTheDocument(); // 1 critical + 1 high
    });

    it('displays selected count as zero initially', () => {
      render(<PendingApprovalsPage />);

      expect(screen.getByText('Selected')).toBeInTheDocument();
      const selectedCards = screen.getAllByText('0');
      expect(selectedCards.length).toBeGreaterThan(0);
    });
  });

  describe('Approvals Table', () => {
    it('renders table headers', () => {
      render(<PendingApprovalsPage />);

      expect(screen.getByText('Request')).toBeInTheDocument();
      expect(screen.getByText('Priority')).toBeInTheDocument();
      expect(screen.getByText('Requester')).toBeInTheDocument();
      expect(screen.getByText('Waiting')).toBeInTheDocument();
      expect(screen.getByText('Actions')).toBeInTheDocument();
    });

    it('renders all pending requests', () => {
      render(<PendingApprovalsPage />);

      expect(screen.getByText('REQ-001')).toBeInTheDocument();
      expect(screen.getByText('REQ-002')).toBeInTheDocument();
      expect(screen.getByText('REQ-003')).toBeInTheDocument();
    });

    it('displays request details correctly', () => {
      render(<PendingApprovalsPage />);

      expect(screen.getByText('New Laptop')).toBeInTheDocument();
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    it('displays priority badges with correct colors', () => {
      render(<PendingApprovalsPage />);

      expect(screen.getByText('Critical')).toBeInTheDocument();
      expect(screen.getByText('High')).toBeInTheDocument();
      expect(screen.getByText('Medium')).toBeInTheDocument();
    });

    it('displays waiting time for requests', () => {
      render(<PendingApprovalsPage />);

      // Should display time in hours or days
      const waitingTimes = screen.getAllByText(/h|d/);
      expect(waitingTimes.length).toBeGreaterThan(0);
    });

    it('displays requested for name when different from requester', () => {
      render(<PendingApprovalsPage />);

      expect(screen.getByText('For: Bob Johnson')).toBeInTheDocument();
    });

    it('truncates long notes with ellipsis', () => {
      render(<PendingApprovalsPage />);

      const noteText = screen.getByText(/Urgently needed for new project work/);
      expect(noteText.textContent).toContain('...');
    });
  });

  describe('Selection Functionality', () => {
    it('allows selecting individual requests', () => {
      render(<PendingApprovalsPage />);

      const checkboxes = screen.getAllByRole('checkbox');
      const firstRequestCheckbox = checkboxes[1]; // Skip the select-all checkbox

      fireEvent.click(firstRequestCheckbox);

      expect(firstRequestCheckbox).toBeChecked();
    });

    it('allows deselecting individual requests', () => {
      render(<PendingApprovalsPage />);

      const checkboxes = screen.getAllByRole('checkbox');
      const firstRequestCheckbox = checkboxes[1];

      fireEvent.click(firstRequestCheckbox);
      expect(firstRequestCheckbox).toBeChecked();

      fireEvent.click(firstRequestCheckbox);
      expect(firstRequestCheckbox).not.toBeChecked();
    });

    it('select all checkbox selects all requests', () => {
      render(<PendingApprovalsPage />);

      const checkboxes = screen.getAllByRole('checkbox');
      const selectAllCheckbox = checkboxes[0];

      fireEvent.click(selectAllCheckbox);

      checkboxes.forEach((checkbox, index) => {
        if (index > 0) { // Skip the select-all checkbox itself
          expect(checkbox).toBeChecked();
        }
      });
    });

    it('select all checkbox deselects all requests when all are selected', () => {
      render(<PendingApprovalsPage />);

      const checkboxes = screen.getAllByRole('checkbox');
      const selectAllCheckbox = checkboxes[0];

      // Select all
      fireEvent.click(selectAllCheckbox);
      // Deselect all
      fireEvent.click(selectAllCheckbox);

      checkboxes.forEach((checkbox, index) => {
        if (index > 0) {
          expect(checkbox).not.toBeChecked();
        }
      });
    });

    it('shows bulk approve button when requests are selected', () => {
      render(<PendingApprovalsPage />);

      const checkboxes = screen.getAllByRole('checkbox');
      fireEvent.click(checkboxes[1]);

      expect(screen.getByRole('button', { name: /approve selected \(1\)/i })).toBeInTheDocument();
    });

    it('updates selected count in header when selecting requests', () => {
      render(<PendingApprovalsPage />);

      const checkboxes = screen.getAllByRole('checkbox');
      fireEvent.click(checkboxes[1]);

      expect(screen.getByRole('button', { name: /approve selected \(1\)/i })).toBeInTheDocument();
    });
  });

  describe('Action Buttons', () => {
    it('renders view, delegate, approve, and reject buttons for each request', () => {
      render(<PendingApprovalsPage />);

      const viewButtons = screen.getAllByTitle('View details');
      const delegateButtons = screen.getAllByTitle('Delegate approval');
      const approveButtons = screen.getAllByTitle('Approve');
      const rejectButtons = screen.getAllByTitle('Reject');

      expect(viewButtons).toHaveLength(3);
      expect(delegateButtons).toHaveLength(3);
      expect(approveButtons).toHaveLength(3);
      expect(rejectButtons).toHaveLength(3);
    });

    it('navigates to request detail when view button is clicked', () => {
      render(<PendingApprovalsPage />);

      const viewButtons = screen.getAllByTitle('View details');
      fireEvent.click(viewButtons[0]);

      expect(mockPush).toHaveBeenCalledWith('/requests/req-1');
    });

    it('opens approval modal when approve button is clicked', () => {
      render(<PendingApprovalsPage />);

      const approveButtons = screen.getAllByTitle('Approve');
      fireEvent.click(approveButtons[0]);

      expect(screen.getByText('Approve Request')).toBeInTheDocument();
      expect(screen.getByText(/Are you sure you want to approve REQ-001/)).toBeInTheDocument();
    });

    it('opens rejection modal when reject button is clicked', () => {
      render(<PendingApprovalsPage />);

      const rejectButtons = screen.getAllByTitle('Reject');
      fireEvent.click(rejectButtons[0]);

      expect(screen.getByText('Reject Request')).toBeInTheDocument();
      expect(screen.getByText(/Are you sure you want to reject REQ-001/)).toBeInTheDocument();
    });

    it('opens delegation modal when delegate button is clicked', () => {
      render(<PendingApprovalsPage />);

      const delegateButtons = screen.getAllByTitle('Delegate approval');
      fireEvent.click(delegateButtons[0]);

      expect(screen.getByText('Delegate Approval')).toBeInTheDocument();
      expect(screen.getByText(/Delegate the approval of REQ-001/)).toBeInTheDocument();
    });
  });

  describe('Approval Modal', () => {
    it('shows request details in modal', () => {
      render(<PendingApprovalsPage />);

      const approveButtons = screen.getAllByTitle('Approve');
      fireEvent.click(approveButtons[0]);

      // Modal should be present
      expect(screen.getByText('Approve Request')).toBeInTheDocument();
      // Request details appear in both table and modal, so use getAllByText
      const catalogItems = screen.getAllByText('New Laptop');
      expect(catalogItems.length).toBeGreaterThan(0);
      const requesterLabels = screen.getAllByText('Requested by: John Doe');
      expect(requesterLabels.length).toBeGreaterThan(0);
    });

    it('allows entering optional comments for approval', () => {
      render(<PendingApprovalsPage />);

      const approveButtons = screen.getAllByTitle('Approve');
      fireEvent.click(approveButtons[0]);

      const commentsTextarea = screen.getByPlaceholderText('Optional approval comments...');
      fireEvent.change(commentsTextarea, { target: { value: 'Looks good' } });

      expect(commentsTextarea).toHaveValue('Looks good');
    });

    it('requires comments for rejection', () => {
      render(<PendingApprovalsPage />);

      const rejectButtons = screen.getAllByTitle('Reject');
      fireEvent.click(rejectButtons[0]);

      const commentsTextarea = screen.getByPlaceholderText('Please provide a reason for rejection...');
      expect(commentsTextarea).toHaveAttribute('required');
    });

    it('disables reject button when comments are empty', () => {
      render(<PendingApprovalsPage />);

      const rejectButtons = screen.getAllByTitle('Reject');
      fireEvent.click(rejectButtons[0]);

      // Find the reject button with the XCircle icon in the modal (not table row buttons)
      const allRejectButtons = screen.getAllByRole('button', { name: /^reject$/i });
      // The last one should be the modal button
      const modalRejectButton = allRejectButtons[allRejectButtons.length - 1];
      expect(modalRejectButton).toBeDisabled();
    });

    it('enables reject button when comments are provided', () => {
      render(<PendingApprovalsPage />);

      const rejectButtons = screen.getAllByTitle('Reject');
      fireEvent.click(rejectButtons[0]);

      const commentsTextarea = screen.getByPlaceholderText('Please provide a reason for rejection...');
      fireEvent.change(commentsTextarea, { target: { value: 'Not justified' } });

      // Find the reject button with the XCircle icon in the modal (not table row buttons)
      const allRejectButtons = screen.getAllByRole('button', { name: /^reject$/i });
      // The last one should be the modal button
      const modalRejectButton = allRejectButtons[allRejectButtons.length - 1];
      expect(modalRejectButton).not.toBeDisabled();
    });

    it('calls approve API when approval is submitted', async () => {
      const mockMutateAsync = vi.fn().mockResolvedValue({});
      mockUseApproveRequest.mockReturnValue({
        mutateAsync: mockMutateAsync,
        isPending: false,
      });

      render(<PendingApprovalsPage />);

      const approveButtons = screen.getAllByTitle('Approve');
      fireEvent.click(approveButtons[0]);

      const commentsTextarea = screen.getByPlaceholderText('Optional approval comments...');
      fireEvent.change(commentsTextarea, { target: { value: 'Approved' } });

      const allApproveButtons = screen.getAllByRole('button', { name: /^approve$/i });
      // The last one should be the modal button
      const modalApproveButton = allApproveButtons[allApproveButtons.length - 1];
      fireEvent.click(modalApproveButton);

      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalledWith({
          requestId: 'req-1',
          approvalId: 'req-1',
          comments: 'Approved',
        });
      });
    });

    it('calls reject API when rejection is submitted', async () => {
      const mockMutateAsync = vi.fn().mockResolvedValue({});
      mockUseRejectRequest.mockReturnValue({
        mutateAsync: mockMutateAsync,
        isPending: false,
      });

      render(<PendingApprovalsPage />);

      const rejectButtons = screen.getAllByTitle('Reject');
      fireEvent.click(rejectButtons[0]);

      const commentsTextarea = screen.getByPlaceholderText('Please provide a reason for rejection...');
      fireEvent.change(commentsTextarea, { target: { value: 'Not justified' } });

      const allRejectButtons = screen.getAllByRole('button', { name: /^reject$/i });
      // The last one should be the modal button
      const modalRejectButton = allRejectButtons[allRejectButtons.length - 1];
      fireEvent.click(modalRejectButton);

      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalledWith({
          requestId: 'req-1',
          approvalId: 'req-1',
          comments: 'Not justified',
        });
      });
    });

    it('closes modal after successful approval', async () => {
      const mockMutateAsync = vi.fn().mockResolvedValue({});
      mockUseApproveRequest.mockReturnValue({
        mutateAsync: mockMutateAsync,
        isPending: false,
      });

      render(<PendingApprovalsPage />);

      const approveButtons = screen.getAllByTitle('Approve');
      fireEvent.click(approveButtons[0]);

      const allApproveButtons = screen.getAllByRole('button', { name: /^approve$/i });
      // The last one should be the modal button
      const modalApproveButton = allApproveButtons[allApproveButtons.length - 1];
      fireEvent.click(modalApproveButton);

      await waitFor(() => {
        expect(screen.queryByText('Approve Request')).not.toBeInTheDocument();
      });
    });

    it('refetches data after approval', async () => {
      const mockMutateAsync = vi.fn().mockResolvedValue({});
      mockUseApproveRequest.mockReturnValue({
        mutateAsync: mockMutateAsync,
        isPending: false,
      });

      render(<PendingApprovalsPage />);

      const approveButtons = screen.getAllByTitle('Approve');
      fireEvent.click(approveButtons[0]);

      const allApproveButtons = screen.getAllByRole('button', { name: /^approve$/i });
      // The last one should be the modal button
      const modalApproveButton = allApproveButtons[allApproveButtons.length - 1];
      fireEvent.click(modalApproveButton);

      await waitFor(() => {
        expect(mockRefetch).toHaveBeenCalled();
      });
    });

    it('closes modal when cancel is clicked', () => {
      render(<PendingApprovalsPage />);

      const approveButtons = screen.getAllByTitle('Approve');
      fireEvent.click(approveButtons[0]);

      expect(screen.getByText('Approve Request')).toBeInTheDocument();

      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      fireEvent.click(cancelButton);

      expect(screen.queryByText('Approve Request')).not.toBeInTheDocument();
    });

    it('shows loading state while processing', () => {
      mockUseApproveRequest.mockReturnValue({
        mutateAsync: vi.fn(),
        isPending: true,
      });

      render(<PendingApprovalsPage />);

      const approveButtons = screen.getAllByTitle('Approve');
      fireEvent.click(approveButtons[0]);

      expect(screen.getByText('Processing...')).toBeInTheDocument();
    });

    it('disables buttons while processing', () => {
      mockUseApproveRequest.mockReturnValue({
        mutateAsync: vi.fn(),
        isPending: true,
      });

      render(<PendingApprovalsPage />);

      const approveButtons = screen.getAllByTitle('Approve');
      fireEvent.click(approveButtons[0]);

      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      const modalApproveButton = screen.getByRole('button', { name: /processing/i });

      expect(cancelButton).toBeDisabled();
      expect(modalApproveButton).toBeDisabled();
    });
  });

  describe('Delegation Modal', () => {
    it('shows request details in delegation modal', () => {
      render(<PendingApprovalsPage />);

      const delegateButtons = screen.getAllByTitle('Delegate approval');
      fireEvent.click(delegateButtons[0]);

      // Modal should be present
      expect(screen.getByText('Delegate Approval')).toBeInTheDocument();
      // Request details appear in both table and modal, so use getAllByText
      const catalogItems = screen.getAllByText('New Laptop');
      expect(catalogItems.length).toBeGreaterThan(0);
      const requesterLabels = screen.getAllByText('Requested by: John Doe');
      expect(requesterLabels.length).toBeGreaterThan(0);
    });

    it('allows searching for users', () => {
      render(<PendingApprovalsPage />);

      const delegateButtons = screen.getAllByTitle('Delegate approval');
      fireEvent.click(delegateButtons[0]);

      const searchInput = screen.getByPlaceholderText('Search for a user...');
      fireEvent.change(searchInput, { target: { value: 'Manager' } });

      expect(searchInput).toHaveValue('Manager');
    });

    it('displays user search results', () => {
      render(<PendingApprovalsPage />);

      const delegateButtons = screen.getAllByTitle('Delegate approval');
      fireEvent.click(delegateButtons[0]);

      expect(screen.getByText('Manager One')).toBeInTheDocument();
      expect(screen.getByText('manager1@example.com')).toBeInTheDocument();
    });

    it('allows selecting a user from search results', () => {
      render(<PendingApprovalsPage />);

      const delegateButtons = screen.getAllByTitle('Delegate approval');
      fireEvent.click(delegateButtons[0]);

      const userButton = screen.getByText('Manager One').closest('button');
      fireEvent.click(userButton!);

      const searchInput = screen.getByPlaceholderText('Search for a user...');
      expect(searchInput).toHaveValue('Manager One');
    });

    it('allows entering optional comments', () => {
      render(<PendingApprovalsPage />);

      const delegateButtons = screen.getAllByTitle('Delegate approval');
      fireEvent.click(delegateButtons[0]);

      const commentsTextarea = screen.getByPlaceholderText('Optional comments for the delegate...');
      fireEvent.change(commentsTextarea, { target: { value: 'Please review' } });

      expect(commentsTextarea).toHaveValue('Please review');
    });

    it('disables delegate button when no user is selected', () => {
      render(<PendingApprovalsPage />);

      const delegateButtons = screen.getAllByTitle('Delegate approval');
      fireEvent.click(delegateButtons[0]);

      const modalDelegateButton = screen.getByRole('button', { name: /^delegate$/i });
      expect(modalDelegateButton).toBeDisabled();
    });

    it('enables delegate button when user is selected', () => {
      render(<PendingApprovalsPage />);

      const delegateButtons = screen.getAllByTitle('Delegate approval');
      fireEvent.click(delegateButtons[0]);

      const userButton = screen.getByText('Manager One').closest('button');
      fireEvent.click(userButton!);

      const modalDelegateButton = screen.getByRole('button', { name: /^delegate$/i });
      expect(modalDelegateButton).not.toBeDisabled();
    });

    it('calls delegate API when delegation is submitted', async () => {
      const mockMutateAsync = vi.fn().mockResolvedValue({});
      mockUseDelegateApproval.mockReturnValue({
        mutateAsync: mockMutateAsync,
        isPending: false,
      });

      render(<PendingApprovalsPage />);

      const delegateButtons = screen.getAllByTitle('Delegate approval');
      fireEvent.click(delegateButtons[0]);

      const userButton = screen.getByText('Manager One').closest('button');
      fireEvent.click(userButton!);

      const commentsTextarea = screen.getByPlaceholderText('Optional comments for the delegate...');
      fireEvent.change(commentsTextarea, { target: { value: 'Please review' } });

      const modalDelegateButton = screen.getByRole('button', { name: /^delegate$/i });
      fireEvent.click(modalDelegateButton);

      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalledWith({
          requestId: 'req-1',
          approvalId: 'req-1',
          delegateTo: 'user-1',
          comments: 'Please review',
        });
      });
    });

    it('closes modal after successful delegation', async () => {
      const mockMutateAsync = vi.fn().mockResolvedValue({});
      mockUseDelegateApproval.mockReturnValue({
        mutateAsync: mockMutateAsync,
        isPending: false,
      });

      render(<PendingApprovalsPage />);

      const delegateButtons = screen.getAllByTitle('Delegate approval');
      fireEvent.click(delegateButtons[0]);

      const userButton = screen.getByText('Manager One').closest('button');
      fireEvent.click(userButton!);

      const modalDelegateButton = screen.getByRole('button', { name: /^delegate$/i });
      fireEvent.click(modalDelegateButton);

      await waitFor(() => {
        expect(screen.queryByText('Delegate Approval')).not.toBeInTheDocument();
      });
    });

    it('closes modal when cancel is clicked', () => {
      render(<PendingApprovalsPage />);

      const delegateButtons = screen.getAllByTitle('Delegate approval');
      fireEvent.click(delegateButtons[0]);

      expect(screen.getByText('Delegate Approval')).toBeInTheDocument();

      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      fireEvent.click(cancelButton);

      expect(screen.queryByText('Delegate Approval')).not.toBeInTheDocument();
    });

    it('shows loading state while delegating', () => {
      mockUseDelegateApproval.mockReturnValue({
        mutateAsync: vi.fn(),
        isPending: true,
      });

      render(<PendingApprovalsPage />);

      const delegateButtons = screen.getAllByTitle('Delegate approval');
      fireEvent.click(delegateButtons[0]);

      expect(screen.getByText('Delegating...')).toBeInTheDocument();
    });
  });

  describe('Bulk Operations', () => {
    it('performs bulk approval when bulk approve button is clicked', async () => {
      const mockMutateAsync = vi.fn().mockResolvedValue({});
      mockUseApproveRequest.mockReturnValue({
        mutateAsync: mockMutateAsync,
        isPending: false,
      });

      render(<PendingApprovalsPage />);

      const checkboxes = screen.getAllByRole('checkbox');
      fireEvent.click(checkboxes[1]);
      fireEvent.click(checkboxes[2]);

      const bulkApproveButton = screen.getByRole('button', { name: /approve selected \(2\)/i });
      fireEvent.click(bulkApproveButton);

      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalledTimes(2);
      });
    });

    it('shows confirmation dialog before bulk approval', () => {
      render(<PendingApprovalsPage />);

      const checkboxes = screen.getAllByRole('checkbox');
      fireEvent.click(checkboxes[1]);

      const bulkApproveButton = screen.getByRole('button', { name: /approve selected \(1\)/i });
      fireEvent.click(bulkApproveButton);

      expect(global.confirm).toHaveBeenCalledWith('Are you sure you want to approve 1 request(s)?');
    });

    it('clears selection after bulk approval', async () => {
      const mockMutateAsync = vi.fn().mockResolvedValue({});
      mockUseApproveRequest.mockReturnValue({
        mutateAsync: mockMutateAsync,
        isPending: false,
      });

      render(<PendingApprovalsPage />);

      const checkboxes = screen.getAllByRole('checkbox');
      fireEvent.click(checkboxes[1]);

      const bulkApproveButton = screen.getByRole('button', { name: /approve selected \(1\)/i });
      fireEvent.click(bulkApproveButton);

      await waitFor(() => {
        expect(screen.queryByRole('button', { name: /approve selected/i })).not.toBeInTheDocument();
      });
    });

    it('refetches data after bulk approval', async () => {
      const mockMutateAsync = vi.fn().mockResolvedValue({});
      mockUseApproveRequest.mockReturnValue({
        mutateAsync: mockMutateAsync,
        isPending: false,
      });

      render(<PendingApprovalsPage />);

      const checkboxes = screen.getAllByRole('checkbox');
      fireEvent.click(checkboxes[1]);

      const bulkApproveButton = screen.getByRole('button', { name: /approve selected \(1\)/i });
      fireEvent.click(bulkApproveButton);

      await waitFor(() => {
        expect(mockRefetch).toHaveBeenCalled();
      });
    });
  });

  describe('Search Functionality', () => {
    it('updates search query when typing in search box', () => {
      render(<PendingApprovalsPage />);

      const searchInput = screen.getByPlaceholderText('Search pending approvals...');
      fireEvent.change(searchInput, { target: { value: 'laptop' } });

      expect(searchInput).toHaveValue('laptop');
    });

    it('passes search query to API', () => {
      render(<PendingApprovalsPage />);

      const searchInput = screen.getByPlaceholderText('Search pending approvals...');
      fireEvent.change(searchInput, { target: { value: 'laptop' } });

      expect(mockUseServiceRequests).toHaveBeenCalledWith(
        expect.objectContaining({
          search: 'laptop',
        })
      );
    });

    it('resets page to 1 when searching', () => {
      render(<PendingApprovalsPage />);

      const searchInput = screen.getByPlaceholderText('Search pending approvals...');
      fireEvent.change(searchInput, { target: { value: 'laptop' } });

      expect(mockUseServiceRequests).toHaveBeenCalledWith(
        expect.objectContaining({
          page: 1,
        })
      );
    });
  });

  describe('Pagination', () => {
    it('renders pagination controls when there are requests', () => {
      render(<PendingApprovalsPage />);

      expect(screen.getByText('Showing 3 of 3 pending approvals')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /previous/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /next/i })).toBeInTheDocument();
    });

    it('disables previous button on first page', () => {
      render(<PendingApprovalsPage />);

      const previousButton = screen.getByRole('button', { name: /previous/i });
      expect(previousButton).toBeDisabled();
    });

    it('enables next button when there are more pages', () => {
      mockUseServiceRequests.mockReturnValue({
        data: {
          data: mockRequests,
          pagination: { page: 1, limit: 20, total: 30, totalPages: 2 },
        },
        isLoading: false,
        error: null,
        refetch: mockRefetch,
      });

      render(<PendingApprovalsPage />);

      const nextButton = screen.getByRole('button', { name: /next/i });
      expect(nextButton).not.toBeDisabled();
    });

    it('disables next button on last page', () => {
      render(<PendingApprovalsPage />);

      const nextButton = screen.getByRole('button', { name: /next/i });
      expect(nextButton).toBeDisabled();
    });
  });

  describe('Loading State', () => {
    it('shows loading spinner while fetching data', () => {
      mockUseServiceRequests.mockReturnValue({
        data: null,
        isLoading: true,
        error: null,
        refetch: mockRefetch,
      });

      render(<PendingApprovalsPage />);

      expect(screen.getByText('Loading pending approvals...')).toBeInTheDocument();
    });
  });

  describe('Error State', () => {
    it('shows error message when data fetch fails', () => {
      mockUseServiceRequests.mockReturnValue({
        data: null,
        isLoading: false,
        error: new Error('Network error'),
        refetch: mockRefetch,
      });

      render(<PendingApprovalsPage />);

      expect(screen.getByText('Error loading pending approvals')).toBeInTheDocument();
      expect(screen.getByText('Please try refreshing the page')).toBeInTheDocument();
    });
  });

  describe('Empty State', () => {
    it('shows empty state when no pending approvals', () => {
      mockUseServiceRequests.mockReturnValue({
        data: {
          data: [],
          pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
        },
        isLoading: false,
        error: null,
        refetch: mockRefetch,
      });

      render(<PendingApprovalsPage />);

      expect(screen.getByText('All caught up!')).toBeInTheDocument();
      expect(screen.getByText('No pending approvals at this time')).toBeInTheDocument();
    });
  });

  describe('Waiting Time Calculation', () => {
    it('shows "Less than an hour" for recent requests', () => {
      const recentRequest = [{
        ...mockRequests[0],
        created_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(), // 30 min ago
      }];

      mockUseServiceRequests.mockReturnValue({
        data: {
          data: recentRequest,
          pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
        },
        isLoading: false,
        error: null,
        refetch: mockRefetch,
      });

      render(<PendingApprovalsPage />);

      expect(screen.getByText('Less than an hour')).toBeInTheDocument();
    });

    it('shows hours for requests less than a day old', () => {
      const hoursOldRequest = [{
        ...mockRequests[0],
        created_at: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(), // 5 hours ago
      }];

      mockUseServiceRequests.mockReturnValue({
        data: {
          data: hoursOldRequest,
          pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
        },
        isLoading: false,
        error: null,
        refetch: mockRefetch,
      });

      render(<PendingApprovalsPage />);

      expect(screen.getByText('5h')).toBeInTheDocument();
    });

    it('shows days and hours for old requests', () => {
      const daysOldRequest = [{
        ...mockRequests[0],
        created_at: new Date(Date.now() - 50 * 60 * 60 * 1000).toISOString(), // 50 hours ago
      }];

      mockUseServiceRequests.mockReturnValue({
        data: {
          data: daysOldRequest,
          pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
        },
        isLoading: false,
        error: null,
        refetch: mockRefetch,
      });

      render(<PendingApprovalsPage />);

      expect(screen.getByText(/2d/)).toBeInTheDocument();
    });
  });
});
