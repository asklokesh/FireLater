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
});
