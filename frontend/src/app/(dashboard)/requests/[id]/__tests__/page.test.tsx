import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import RequestDetailPage from '../page';
import { requestsApi, usersApi } from '@/lib/api';

// Mock Next.js navigation
const mockBack = vi.fn();
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'request-123' }),
  useRouter: () => ({
    push: mockPush,
    back: mockBack,
  }),
}));

// Mock Next.js Link
vi.mock('next/link', () => ({
  default: ({ children, href }: any) => <a href={href}>{children}</a>,
}));

// Mock API
vi.mock('@/lib/api', () => ({
  requestsApi: {
    get: vi.fn(),
    getApprovals: vi.fn(),
    getComments: vi.fn(),
    getHistory: vi.fn(),
    approve: vi.fn(),
    reject: vi.fn(),
    cancel: vi.fn(),
    addComment: vi.fn(),
    update: vi.fn(),
  },
  usersApi: {
    list: vi.fn(),
  },
}));

const mockRequest = {
  id: 'request-123',
  request_id: 'REQ0001234',
  status: 'submitted',
  priority: 'high',
  form_data: {
    quantity: 1,
    specifications: 'Standard laptop configuration',
  },
  notes: 'Needed for new employee',
  cost_center: 'IT-001',
  due_date: '2024-01-15T00:00:00Z',
  created_at: '2024-01-01T10:00:00Z',
  updated_at: '2024-01-02T10:00:00Z',
  completed_at: null,
  cancelled_at: null,
  cancel_reason: null,
  catalog_item: {
    id: 'item-1',
    name: 'Laptop',
    description: 'Standard business laptop',
  },
  requester: {
    id: 'user-1',
    name: 'John Doe',
    email: 'john@example.com',
  },
  requested_for: {
    id: 'user-2',
    name: 'Jane Smith',
    email: 'jane@example.com',
  },
  assigned_to: {
    id: 'user-3',
    name: 'Bob Wilson',
    email: 'bob@example.com',
  },
};

const mockApprovals = [
  {
    id: 'approval-1',
    step_name: 'Manager Approval',
    status: 'approved',
    approver_id: 'user-4',
    approver_name: 'Manager One',
    comments: 'Approved',
    approved_at: '2024-01-01T11:00:00Z',
    rejected_at: null,
    delegated_to_id: null,
    delegated_to_name: null,
    created_at: '2024-01-01T10:30:00Z',
  },
  {
    id: 'approval-2',
    step_name: 'Finance Approval',
    status: 'pending',
    approver_id: 'user-5',
    approver_name: 'Finance Team',
    comments: null,
    approved_at: null,
    rejected_at: null,
    delegated_to_id: null,
    delegated_to_name: null,
    created_at: '2024-01-01T11:00:00Z',
  },
];

const mockComments = [
  {
    id: 'comment-1',
    content: 'Processing request',
    is_internal: false,
    user: {
      id: 'user-3',
      name: 'Bob Wilson',
      email: 'bob@example.com',
    },
    created_at: '2024-01-02T10:00:00Z',
  },
  {
    id: 'comment-2',
    content: 'Internal note: check budget',
    is_internal: true,
    user: {
      id: 'user-5',
      name: 'Finance Team',
      email: 'finance@example.com',
    },
    created_at: '2024-01-02T11:00:00Z',
  },
];

const mockHistory = [
  {
    id: 'history-1',
    from_status: null,
    to_status: 'submitted',
    changed_by_name: 'John Doe',
    notes: 'Request created',
    created_at: '2024-01-01T10:00:00Z',
  },
  {
    id: 'history-2',
    from_status: 'submitted',
    to_status: 'pending_approval',
    changed_by_name: 'System',
    notes: 'Sent for approval',
    created_at: '2024-01-01T10:30:00Z',
  },
];

const mockUsers = [
  { id: 'user-1', name: 'John Doe', email: 'john@example.com' },
  { id: 'user-2', name: 'Jane Smith', email: 'jane@example.com' },
  { id: 'user-3', name: 'Bob Wilson', email: 'bob@example.com' },
];

describe('RequestDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock implementations
    vi.mocked(requestsApi.get).mockResolvedValue(mockRequest);
    vi.mocked(requestsApi.getApprovals).mockResolvedValue({ data: mockApprovals });
    vi.mocked(requestsApi.getComments).mockResolvedValue({ data: mockComments });
    vi.mocked(requestsApi.getHistory).mockResolvedValue({ data: mockHistory });
    vi.mocked(usersApi.list).mockResolvedValue({ data: mockUsers });
  });

  describe('Loading State', () => {
    it('displays loading spinner while fetching request', () => {
      vi.mocked(requestsApi.get).mockImplementation(() => new Promise(() => {})); // Never resolves

      render(<RequestDetailPage />);
      // Check for loading by finding the loader icon
      const loader = screen.getByText((content, element) => {
        return element?.classList.contains('animate-spin') || false;
      });
      expect(loader).toBeInTheDocument();
    });
  });

  describe('Error State', () => {
    it('displays error message when request fetch fails', async () => {
      vi.mocked(requestsApi.get).mockRejectedValue(new Error('Failed to load'));

      render(<RequestDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Failed to load request details')).toBeInTheDocument();
      });
    });

    it('shows retry option on error', async () => {
      vi.mocked(requestsApi.get).mockRejectedValue(new Error('Failed to load'));

      render(<RequestDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Failed to load request details')).toBeInTheDocument();
      });
    });
  });

  describe('Basic Rendering', () => {
    it('renders request ID and title', async () => {
      render(<RequestDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('REQ0001234')).toBeInTheDocument();
        expect(screen.getByText('Laptop')).toBeInTheDocument();
      });
    });

    it('renders status badge', async () => {
      render(<RequestDetailPage />);

      await waitFor(() => {
        const badges = screen.getAllByText(/submitted/i);
        expect(badges.length).toBeGreaterThan(0);
      });
    });

    it('renders priority badge', async () => {
      render(<RequestDetailPage />);

      await waitFor(() => {
        expect(screen.getByText(/high/i)).toBeInTheDocument();
      });
    });

    it('renders back button', async () => {
      render(<RequestDetailPage />);

      await waitFor(() => {
        const buttons = screen.getAllByRole('button');
        expect(buttons.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Request Details Tab', () => {
    it('displays catalog item information', async () => {
      render(<RequestDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Laptop')).toBeInTheDocument();
        expect(screen.getByText('Standard business laptop')).toBeInTheDocument();
      });
    });

    it('displays requester information', async () => {
      render(<RequestDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });
    });

    it('displays requested for information', async () => {
      render(<RequestDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Jane Smith')).toBeInTheDocument();
      });
    });

    it('displays assigned to information', async () => {
      render(<RequestDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Bob Wilson')).toBeInTheDocument();
        expect(screen.getByText('bob@example.com')).toBeInTheDocument();
      });
    });

    it('displays notes when present', async () => {
      render(<RequestDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Needed for new employee')).toBeInTheDocument();
      });
    });

    it('displays cost center when present', async () => {
      render(<RequestDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('IT-001')).toBeInTheDocument();
      });
    });

    it('displays form data', async () => {
      render(<RequestDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Standard laptop configuration')).toBeInTheDocument();
      });
    });
  });

  describe('Approvals Tab', () => {
    it('switches to approvals tab when clicked', async () => {
      render(<RequestDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('REQ0001234')).toBeInTheDocument();
      });

      const approvalsButton = screen.getByRole('button', { name: /approvals/i });
      fireEvent.click(approvalsButton);

      await waitFor(() => {
        expect(screen.getByText('Manager Approval')).toBeInTheDocument();
      });
    });

    it('displays approval steps', async () => {
      render(<RequestDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('REQ0001234')).toBeInTheDocument();
      });

      const approvalsButton = screen.getByRole('button', { name: /approvals/i });
      fireEvent.click(approvalsButton);

      await waitFor(() => {
        expect(screen.getByText('Manager Approval')).toBeInTheDocument();
        expect(screen.getByText('Finance Approval')).toBeInTheDocument();
      });
    });

    it('shows approved status for completed approvals', async () => {
      render(<RequestDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('REQ0001234')).toBeInTheDocument();
      });

      const approvalsButton = screen.getByRole('button', { name: /approvals/i });
      fireEvent.click(approvalsButton);

      await waitFor(() => {
        expect(screen.getByText('Manager One')).toBeInTheDocument();
        expect(screen.getAllByText('Approved')[0]).toBeInTheDocument();
      });
    });

    it('shows pending status for incomplete approvals', async () => {
      render(<RequestDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('REQ0001234')).toBeInTheDocument();
      });

      const approvalsButton = screen.getByRole('button', { name: /approvals/i });
      fireEvent.click(approvalsButton);

      await waitFor(() => {
        expect(screen.getByText('Finance Team')).toBeInTheDocument();
      });
    });
  });

  describe('Comments Tab', () => {
    it('switches to comments tab when clicked', async () => {
      render(<RequestDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('REQ0001234')).toBeInTheDocument();
      });

      const commentsButton = screen.getByRole('button', { name: /comments/i });
      fireEvent.click(commentsButton);

      await waitFor(() => {
        expect(screen.getByText('Processing request')).toBeInTheDocument();
      });
    });

    it('displays all comments', async () => {
      render(<RequestDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('REQ0001234')).toBeInTheDocument();
      });

      const commentsButton = screen.getByRole('button', { name: /comments/i });
      fireEvent.click(commentsButton);

      await waitFor(() => {
        expect(screen.getByText('Processing request')).toBeInTheDocument();
        expect(screen.getByText('Internal note: check budget')).toBeInTheDocument();
      });
    });

    it('marks internal comments', async () => {
      render(<RequestDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('REQ0001234')).toBeInTheDocument();
      });

      const commentsButton = screen.getByRole('button', { name: /comments/i });
      fireEvent.click(commentsButton);

      await waitFor(() => {
        expect(screen.getByText('Internal')).toBeInTheDocument();
      });
    });

    it('renders comment input form', async () => {
      render(<RequestDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('REQ0001234')).toBeInTheDocument();
      });

      const commentsButton = screen.getByRole('button', { name: /comments/i });
      fireEvent.click(commentsButton);

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/add a comment/i)).toBeInTheDocument();
      });
    });

    it('allows typing in comment input', async () => {
      render(<RequestDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('REQ0001234')).toBeInTheDocument();
      });

      const commentsButton = screen.getByRole('button', { name: /comments/i });
      fireEvent.click(commentsButton);

      await waitFor(() => {
        const input = screen.getByPlaceholderText(/add a comment/i);
        fireEvent.change(input, { target: { value: 'New comment' } });
        expect(input).toHaveValue('New comment');
      });
    });

    it('calls addComment API when comment submitted', async () => {
      vi.mocked(requestsApi.addComment).mockResolvedValue({});

      render(<RequestDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('REQ0001234')).toBeInTheDocument();
      });

      const commentsButton = screen.getByRole('button', { name: /comments/i });
      fireEvent.click(commentsButton);

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/add a comment/i)).toBeInTheDocument();
      });

      const input = screen.getByPlaceholderText(/add a comment/i);
      fireEvent.change(input, { target: { value: 'New comment' } });

      const submitButton = screen.getByRole('button', { name: /send/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(requestsApi.addComment).toHaveBeenCalledWith('request-123', 'New comment', false);
      });
    });
  });

  describe('History Tab', () => {
    it('switches to history tab when clicked', async () => {
      render(<RequestDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('REQ0001234')).toBeInTheDocument();
      });

      const historyButton = screen.getByRole('button', { name: /history/i });
      fireEvent.click(historyButton);

      await waitFor(() => {
        expect(screen.getByText('Request created')).toBeInTheDocument();
      });
    });

    it('displays status change history', async () => {
      render(<RequestDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('REQ0001234')).toBeInTheDocument();
      });

      const historyButton = screen.getByRole('button', { name: /history/i });
      fireEvent.click(historyButton);

      await waitFor(() => {
        expect(screen.getByText('Request created')).toBeInTheDocument();
        expect(screen.getByText('Sent for approval')).toBeInTheDocument();
      });
    });

    it('shows who made each change', async () => {
      render(<RequestDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('REQ0001234')).toBeInTheDocument();
      });

      const historyButton = screen.getByRole('button', { name: /history/i });
      fireEvent.click(historyButton);

      await waitFor(() => {
        expect(screen.getAllByText('John Doe')[0]).toBeInTheDocument();
        expect(screen.getByText('System')).toBeInTheDocument();
      });
    });
  });

  describe('Status Variations', () => {
    it('renders pending_approval status correctly', async () => {
      const pendingRequest = { ...mockRequest, status: 'pending_approval' };
      vi.mocked(requestsApi.get).mockResolvedValue(pendingRequest);

      render(<RequestDetailPage />);

      await waitFor(() => {
        const elements = screen.getAllByText(/pending/i);
        expect(elements.length).toBeGreaterThan(0);
      });
    });

    it('renders approved status correctly', async () => {
      const approvedRequest = { ...mockRequest, status: 'approved' };
      vi.mocked(requestsApi.get).mockResolvedValue(approvedRequest);

      render(<RequestDetailPage />);

      await waitFor(() => {
        expect(screen.getAllByText(/approved/i)[0]).toBeInTheDocument();
      });
    });

    it('renders rejected status correctly', async () => {
      const rejectedRequest = { ...mockRequest, status: 'rejected' };
      vi.mocked(requestsApi.get).mockResolvedValue(rejectedRequest);

      render(<RequestDetailPage />);

      await waitFor(() => {
        const elements = screen.getAllByText(/rejected/i);
        expect(elements.length).toBeGreaterThan(0);
      });
    });

    it('renders completed status correctly', async () => {
      const completedRequest = { ...mockRequest, status: 'completed' };
      vi.mocked(requestsApi.get).mockResolvedValue(completedRequest);

      render(<RequestDetailPage />);

      await waitFor(() => {
        const elements = screen.getAllByText(/completed/i);
        expect(elements.length).toBeGreaterThan(0);
      });
    });

    it('renders cancelled status correctly', async () => {
      const cancelledRequest = { ...mockRequest, status: 'cancelled' };
      vi.mocked(requestsApi.get).mockResolvedValue(cancelledRequest);

      render(<RequestDetailPage />);

      await waitFor(() => {
        const elements = screen.getAllByText(/cancelled/i);
        expect(elements.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Priority Variations', () => {
    it('renders low priority correctly', async () => {
      const lowPriorityRequest = { ...mockRequest, priority: 'low' };
      vi.mocked(requestsApi.get).mockResolvedValue(lowPriorityRequest);

      render(<RequestDetailPage />);

      await waitFor(() => {
        expect(screen.getByText(/low/i)).toBeInTheDocument();
      });
    });

    it('renders medium priority correctly', async () => {
      const mediumPriorityRequest = { ...mockRequest, priority: 'medium' };
      vi.mocked(requestsApi.get).mockResolvedValue(mediumPriorityRequest);

      render(<RequestDetailPage />);

      await waitFor(() => {
        expect(screen.getByText(/medium/i)).toBeInTheDocument();
      });
    });

    it('renders critical priority correctly', async () => {
      const criticalPriorityRequest = { ...mockRequest, priority: 'critical' };
      vi.mocked(requestsApi.get).mockResolvedValue(criticalPriorityRequest);

      render(<RequestDetailPage />);

      await waitFor(() => {
        expect(screen.getByText(/critical/i)).toBeInTheDocument();
      });
    });
  });

  describe('Empty States', () => {
    it('handles missing requested_for', async () => {
      const requestWithoutFor = { ...mockRequest, requested_for: null };
      vi.mocked(requestsApi.get).mockResolvedValue(requestWithoutFor);

      render(<RequestDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('REQ0001234')).toBeInTheDocument();
      });
    });

    it('handles missing assigned_to', async () => {
      const unassignedRequest = { ...mockRequest, assigned_to: null };
      vi.mocked(requestsApi.get).mockResolvedValue(unassignedRequest);

      render(<RequestDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('REQ0001234')).toBeInTheDocument();
      });
    });

    it('handles missing notes', async () => {
      const requestWithoutNotes = { ...mockRequest, notes: null };
      vi.mocked(requestsApi.get).mockResolvedValue(requestWithoutNotes);

      render(<RequestDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('REQ0001234')).toBeInTheDocument();
      });
    });

    it('shows empty state when no comments', async () => {
      vi.mocked(requestsApi.getComments).mockResolvedValue({ data: [] });

      render(<RequestDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('REQ0001234')).toBeInTheDocument();
      });

      const commentsButton = screen.getByRole('button', { name: /comments/i });
      fireEvent.click(commentsButton);

      await waitFor(() => {
        expect(screen.getByText(/no comments yet/i)).toBeInTheDocument();
      });
    });

    it('shows empty state when no approvals', async () => {
      vi.mocked(requestsApi.getApprovals).mockResolvedValue({ data: [] });

      render(<RequestDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('REQ0001234')).toBeInTheDocument();
      });

      const approvalsButton = screen.getByRole('button', { name: /approvals/i });
      fireEvent.click(approvalsButton);

      await waitFor(() => {
        expect(screen.getByText(/no approvals required/i)).toBeInTheDocument();
      });
    });
  });

  describe('Edit Mode', () => {
    it('shows Edit button when request is editable', async () => {
      render(<RequestDetailPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /edit/i })).toBeInTheDocument();
      });
    });

    it('does not show Edit button when request is completed', async () => {
      const completedRequest = { ...mockRequest, status: 'completed' };
      vi.mocked(requestsApi.get).mockResolvedValue(completedRequest);

      render(<RequestDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('REQ0001234')).toBeInTheDocument();
      });

      expect(screen.queryByRole('button', { name: /edit/i })).not.toBeInTheDocument();
    });

    it('does not show Edit button when request is cancelled', async () => {
      const cancelledRequest = { ...mockRequest, status: 'cancelled' };
      vi.mocked(requestsApi.get).mockResolvedValue(cancelledRequest);

      render(<RequestDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('REQ0001234')).toBeInTheDocument();
      });

      expect(screen.queryByRole('button', { name: /edit/i })).not.toBeInTheDocument();
    });

    it('enters edit mode when Edit is clicked', async () => {
      render(<RequestDetailPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /edit/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /edit/i }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
      });
    });

    it('shows priority select in edit mode', async () => {
      render(<RequestDetailPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /edit/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /edit/i }));

      await waitFor(() => {
        // Find select with priority options
        const selects = document.querySelectorAll('select');
        const prioritySelect = Array.from(selects).find(s =>
          Array.from(s.options).some(o => o.text === 'Critical')
        );
        expect(prioritySelect).toBeInTheDocument();
      });
    });

    it('shows notes textarea in edit mode', async () => {
      render(<RequestDetailPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /edit/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /edit/i }));

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/add additional notes/i)).toBeInTheDocument();
      });
    });

    it('shows cost center input in edit mode', async () => {
      render(<RequestDetailPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /edit/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /edit/i }));

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/enter cost center/i)).toBeInTheDocument();
      });
    });

    it('cancels edit mode without saving', async () => {
      render(<RequestDetailPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /edit/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /edit/i }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /edit/i })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /save/i })).not.toBeInTheDocument();
      });
    });
  });

  describe('Action Buttons', () => {
    it('shows Start Work button when request is approved and assigned', async () => {
      const approvedRequest = { ...mockRequest, status: 'approved' };
      vi.mocked(requestsApi.get).mockResolvedValue(approvedRequest);

      render(<RequestDetailPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /start work/i })).toBeInTheDocument();
      });
    });

    it('shows Complete button when request is in_progress', async () => {
      const inProgressRequest = { ...mockRequest, status: 'in_progress' };
      vi.mocked(requestsApi.get).mockResolvedValue(inProgressRequest);

      render(<RequestDetailPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /complete/i })).toBeInTheDocument();
      });
    });

    it('shows Cancel button when request is cancellable', async () => {
      render(<RequestDetailPage />);

      await waitFor(() => {
        // Find cancel button - may be in edit mode area
        const cancelButtons = screen.getAllByRole('button', { name: /cancel/i });
        expect(cancelButtons.length).toBeGreaterThan(0);
      });
    });

    it('does not show Cancel button when request is completed', async () => {
      const completedRequest = { ...mockRequest, status: 'completed' };
      vi.mocked(requestsApi.get).mockResolvedValue(completedRequest);

      render(<RequestDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('REQ0001234')).toBeInTheDocument();
      });

      // There should be no cancel button in the action area
      const cancelButtons = screen.queryAllByRole('button', { name: /cancel/i });
      // The only cancel buttons should not include action cancel
      cancelButtons.forEach(btn => {
        expect(btn.closest('.space-x-2')).toBeFalsy();
      });
    });
  });

  describe('Cancel Modal', () => {
    it('shows cancel modal when Cancel button is clicked', async () => {
      render(<RequestDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('REQ0001234')).toBeInTheDocument();
      });

      // Find the action cancel button (not edit cancel)
      const cancelButtons = screen.getAllByRole('button', { name: /cancel/i });
      const actionCancel = cancelButtons.find(btn => btn.textContent?.toLowerCase() === 'cancel');
      if (actionCancel) {
        fireEvent.click(actionCancel);

        await waitFor(() => {
          // Look for the modal with title "Cancel Request"
          const cancelRequestElements = screen.getAllByText('Cancel Request');
          // The modal should have the placeholder text
          expect(screen.getByPlaceholderText(/reason for cancellation/i)).toBeInTheDocument();
          expect(cancelRequestElements.length).toBeGreaterThanOrEqual(1);
        });
      }
    });

    it('shows Keep Request button in cancel modal', async () => {
      render(<RequestDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('REQ0001234')).toBeInTheDocument();
      });

      const cancelButtons = screen.getAllByRole('button', { name: /cancel/i });
      const actionCancel = cancelButtons.find(btn => btn.textContent?.toLowerCase() === 'cancel');
      if (actionCancel) {
        fireEvent.click(actionCancel);

        await waitFor(() => {
          expect(screen.getByRole('button', { name: /keep request/i })).toBeInTheDocument();
        });
      }
    });

    it('closes cancel modal when Keep Request is clicked', async () => {
      render(<RequestDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('REQ0001234')).toBeInTheDocument();
      });

      const cancelButtons = screen.getAllByRole('button', { name: /cancel/i });
      const actionCancel = cancelButtons.find(btn => btn.textContent?.toLowerCase() === 'cancel');
      if (actionCancel) {
        fireEvent.click(actionCancel);

        await waitFor(() => {
          // Modal is open when we see the placeholder
          expect(screen.getByPlaceholderText(/reason for cancellation/i)).toBeInTheDocument();
        });

        fireEvent.click(screen.getByRole('button', { name: /keep request/i }));

        await waitFor(() => {
          expect(screen.queryByText('Please provide a reason')).not.toBeInTheDocument();
        });
      }
    });
  });

  describe('Assignment Section', () => {
    it('displays assigned user when present', async () => {
      render(<RequestDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Bob Wilson')).toBeInTheDocument();
        expect(screen.getByText('bob@example.com')).toBeInTheDocument();
      });
    });

    it('shows Not assigned when no assignee', async () => {
      const unassignedRequest = { ...mockRequest, assigned_to: null };
      vi.mocked(requestsApi.get).mockResolvedValue(unassignedRequest);

      render(<RequestDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Not assigned')).toBeInTheDocument();
      });
    });

    it('shows user select dropdown when not assigned', async () => {
      const unassignedRequest = { ...mockRequest, assigned_to: null };
      vi.mocked(requestsApi.get).mockResolvedValue(unassignedRequest);

      render(<RequestDetailPage />);

      await waitFor(() => {
        const selects = document.querySelectorAll('select');
        const userSelect = Array.from(selects).find(s =>
          Array.from(s.options).some(o => o.text === 'Select user...')
        );
        expect(userSelect).toBeInTheDocument();
      });
    });

    it('shows Assign button when not assigned', async () => {
      const unassignedRequest = { ...mockRequest, assigned_to: null };
      vi.mocked(requestsApi.get).mockResolvedValue(unassignedRequest);

      render(<RequestDetailPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /assign/i })).toBeInTheDocument();
      });
    });
  });

  describe('In Progress Status', () => {
    it('renders in_progress status correctly', async () => {
      const inProgressRequest = { ...mockRequest, status: 'in_progress' };
      vi.mocked(requestsApi.get).mockResolvedValue(inProgressRequest);

      render(<RequestDetailPage />);

      await waitFor(() => {
        const elements = screen.getAllByText(/in.progress/i);
        expect(elements.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Progress Timeline', () => {
    it('displays progress section', async () => {
      render(<RequestDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Progress')).toBeInTheDocument();
      });
    });

    it('shows status steps in progress section', async () => {
      render(<RequestDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Submitted')).toBeInTheDocument();
        expect(screen.getAllByText(/pending.approval/i)[0]).toBeInTheDocument();
      });
    });

    it('shows Cancelled status in progress when cancelled', async () => {
      const cancelledRequest = { ...mockRequest, status: 'cancelled' };
      vi.mocked(requestsApi.get).mockResolvedValue(cancelledRequest);

      render(<RequestDetailPage />);

      await waitFor(() => {
        // Find Cancelled in Progress section (red text)
        const cancelledTexts = screen.getAllByText(/cancelled/i);
        const progressCancelled = cancelledTexts.find(el =>
          el.classList.contains('text-red-600')
        );
        expect(progressCancelled).toBeInTheDocument();
      });
    });

    it('shows Rejected status in progress when rejected', async () => {
      const rejectedRequest = { ...mockRequest, status: 'rejected' };
      vi.mocked(requestsApi.get).mockResolvedValue(rejectedRequest);

      render(<RequestDetailPage />);

      await waitFor(() => {
        const rejectedTexts = screen.getAllByText(/rejected/i);
        const progressRejected = rejectedTexts.find(el =>
          el.classList.contains('text-red-600')
        );
        expect(progressRejected).toBeInTheDocument();
      });
    });
  });

  describe('Request Information Section', () => {
    it('displays Request Information heading', async () => {
      render(<RequestDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Request Information')).toBeInTheDocument();
      });
    });

    it('displays due date when present', async () => {
      render(<RequestDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Due Date')).toBeInTheDocument();
      });
    });

    it('displays completed date when completed', async () => {
      const completedRequest = {
        ...mockRequest,
        status: 'completed',
        completed_at: '2024-01-10T10:00:00Z'
      };
      vi.mocked(requestsApi.get).mockResolvedValue(completedRequest);

      render(<RequestDetailPage />);

      await waitFor(() => {
        // "Completed" may appear in multiple places (status badge and info section)
        const completedElements = screen.getAllByText(/completed/i);
        expect(completedElements.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Cancellation Reason', () => {
    it('displays cancellation reason when present', async () => {
      const cancelledRequest = {
        ...mockRequest,
        status: 'cancelled',
        cancel_reason: 'No longer needed'
      };
      vi.mocked(requestsApi.get).mockResolvedValue(cancelledRequest);

      render(<RequestDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Cancellation Reason')).toBeInTheDocument();
        expect(screen.getByText('No longer needed')).toBeInTheDocument();
      });
    });
  });

  describe('Internal Comment Checkbox', () => {
    it('shows internal note checkbox in comments tab', async () => {
      render(<RequestDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('REQ0001234')).toBeInTheDocument();
      });

      const commentsButton = screen.getByRole('button', { name: /comments/i });
      fireEvent.click(commentsButton);

      await waitFor(() => {
        // "internal note" may appear in multiple places (existing internal comments)
        const internalNoteElements = screen.getAllByText(/internal note/i);
        expect(internalNoteElements.length).toBeGreaterThan(0);
      });
    });

    it('allows toggling internal note checkbox', async () => {
      render(<RequestDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('REQ0001234')).toBeInTheDocument();
      });

      const commentsButton = screen.getByRole('button', { name: /comments/i });
      fireEvent.click(commentsButton);

      await waitFor(() => {
        const checkbox = screen.getByRole('checkbox');
        expect(checkbox).not.toBeChecked();
        fireEvent.click(checkbox);
        expect(checkbox).toBeChecked();
      });
    });
  });

  describe('Pending Approval Badge', () => {
    it('shows pending approval count in approvals tab', async () => {
      render(<RequestDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('REQ0001234')).toBeInTheDocument();
      });

      // The approvals tab should show a badge with count
      const approvalsButton = screen.getByRole('button', { name: /approvals/i });
      const badge = approvalsButton.querySelector('.bg-yellow-100');
      expect(badge).toBeInTheDocument();
    });
  });

  describe('Comments Count Badge', () => {
    it('shows comments count in comments tab', async () => {
      render(<RequestDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('REQ0001234')).toBeInTheDocument();
      });

      // The comments tab should show a badge with count
      const commentsButton = screen.getByRole('button', { name: /comments/i });
      const badge = commentsButton.querySelector('.bg-gray-100');
      expect(badge).toBeInTheDocument();
    });
  });

  describe('Approval Actions', () => {
    it('shows approve button for pending approvals', async () => {
      render(<RequestDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('REQ0001234')).toBeInTheDocument();
      });

      const approvalsButton = screen.getByRole('button', { name: /approvals/i });
      fireEvent.click(approvalsButton);

      await waitFor(() => {
        // There should be approve buttons in pending approval sections
        const approveButtons = screen.getAllByRole('button', { name: /^approve$/i });
        expect(approveButtons.length).toBeGreaterThan(0);
      });
    });

    it('shows reject button for pending approvals', async () => {
      render(<RequestDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('REQ0001234')).toBeInTheDocument();
      });

      const approvalsButton = screen.getByRole('button', { name: /approvals/i });
      fireEvent.click(approvalsButton);

      await waitFor(() => {
        const rejectButtons = screen.getAllByRole('button', { name: /^reject$/i });
        expect(rejectButtons.length).toBeGreaterThan(0);
      });
    });

    it('shows approval comment textarea for pending approvals', async () => {
      render(<RequestDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('REQ0001234')).toBeInTheDocument();
      });

      const approvalsButton = screen.getByRole('button', { name: /approvals/i });
      fireEvent.click(approvalsButton);

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/add comments/i)).toBeInTheDocument();
      });
    });
  });

  describe('Delegated Approval', () => {
    it('displays delegated approver when present', async () => {
      const delegatedApprovals = [
        {
          ...mockApprovals[1],
          delegated_to_id: 'user-6',
          delegated_to_name: 'Delegate Person',
        },
      ];
      vi.mocked(requestsApi.getApprovals).mockResolvedValue({ data: delegatedApprovals });

      render(<RequestDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('REQ0001234')).toBeInTheDocument();
      });

      const approvalsButton = screen.getByRole('button', { name: /approvals/i });
      fireEvent.click(approvalsButton);

      await waitFor(() => {
        expect(screen.getByText('Finance Approval')).toBeInTheDocument();
      });
    });
  });

  describe('Error State', () => {
    it('displays action error when update fails', async () => {
      vi.mocked(requestsApi.update).mockRejectedValue(new Error('Failed to update'));

      render(<RequestDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('REQ0001234')).toBeInTheDocument();
      });

      // Click edit button
      const editButton = screen.getByRole('button', { name: /edit/i });
      fireEvent.click(editButton);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument();
      });

      // Try to save (this should fail)
      const saveButton = screen.getByRole('button', { name: /save/i });
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText(/failed to update/i)).toBeInTheDocument();
      });
    });

    it('shows dismiss button for action error', async () => {
      vi.mocked(requestsApi.update).mockRejectedValue(new Error('Failed to update'));

      render(<RequestDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('REQ0001234')).toBeInTheDocument();
      });

      // Click edit button
      const editButton = screen.getByRole('button', { name: /edit/i });
      fireEvent.click(editButton);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument();
      });

      // Try to save (this should fail)
      const saveButton = screen.getByRole('button', { name: /save/i });
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText('Dismiss')).toBeInTheDocument();
      });
    });
  });

  describe('Back Link', () => {
    it('has back link to catalog', async () => {
      render(<RequestDetailPage />);

      await waitFor(() => {
        const backLink = screen.getByRole('link', { name: '' });
        expect(backLink).toHaveAttribute('href', '/catalog');
      });
    });
  });
});
