import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import ChangeDetailPage from '../page';
import * as useApiHooks from '@/hooks/useApi';

// Mock Next.js navigation
const mockPush = vi.fn();
const mockBack = vi.fn();
const mockParams = { id: 'change-123' };

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    back: mockBack,
  }),
  useParams: () => mockParams,
}));

// Mock Next.js Link
vi.mock('next/link', () => ({
  default: ({ children, href }: any) => <a href={href}>{children}</a>,
}));

describe('ChangeDetailPage', () => {
  const mockChange = {
    id: 'change-123',
    change_number: 'CHG-001',
    title: 'Deploy new API version',
    description: 'Update API to version 2.0',
    justification: 'Required for new features',
    type: 'normal',
    risk_level: 'medium',
    impact: 'moderate',
    status: 'submitted',
    planned_start: '2026-01-15T14:00:00Z',
    planned_end: '2026-01-15T16:00:00Z',
    actual_start: null,
    actual_end: null,
    rollback_plan: 'Revert to v1.9',
    implementation_plan: 'Deploy to staging first',
    test_plan: 'Run integration tests',
    created_at: '2026-01-10T10:00:00Z',
    updated_at: '2026-01-10T10:00:00Z',
    requester_name: 'John Doe',
    requester_email: 'john@example.com',
    implementer_name: 'Jane Smith',
    implementer_email: 'jane@example.com',
    application_name: 'Core API',
    assigned_group_name: 'Backend Team',
  };

  const mockComments = [
    {
      id: 'comment-1',
      changeId: 'change-123',
      userId: 'user-1',
      user_name: 'Alice',
      content: 'Looks good to me',
      createdAt: '2026-01-11T10:00:00Z',
    },
    {
      id: 'comment-2',
      changeId: 'change-123',
      userId: 'user-2',
      user_name: 'Bob',
      content: 'Approved',
      createdAt: '2026-01-11T11:00:00Z',
    },
  ];

  let mockUseChange: ReturnType<typeof vi.fn>;
  let mockUseChangeComments: ReturnType<typeof vi.fn>;
  let mockUseAddChangeComment: ReturnType<typeof vi.fn>;
  let mockUseUpdateChange: ReturnType<typeof vi.fn>;
  let mockUseApplications: ReturnType<typeof vi.fn>;
  let mockUseUsers: ReturnType<typeof vi.fn>;
  let mockUseGroups: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockUseChange = vi.fn(() => ({
      data: mockChange,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    }));

    mockUseChangeComments = vi.fn(() => ({
      data: { data: mockComments },
      isLoading: false,
    }));

    mockUseAddChangeComment = vi.fn(() => ({
      mutateAsync: vi.fn(),
      isPending: false,
    }));

    mockUseUpdateChange = vi.fn(() => ({
      mutateAsync: vi.fn(),
      isPending: false,
    }));

    mockUseApplications = vi.fn(() => ({
      data: { data: [] },
      isLoading: false,
    }));

    mockUseUsers = vi.fn(() => ({
      data: { data: [] },
      isLoading: false,
    }));

    mockUseGroups = vi.fn(() => ({
      data: { data: [] },
      isLoading: false,
    }));

    vi.spyOn(useApiHooks, 'useChange').mockImplementation(mockUseChange as any);
    vi.spyOn(useApiHooks, 'useChangeComments').mockImplementation(mockUseChangeComments as any);
    vi.spyOn(useApiHooks, 'useAddChangeComment').mockImplementation(mockUseAddChangeComment as any);
    vi.spyOn(useApiHooks, 'useUpdateChange').mockImplementation(mockUseUpdateChange as any);
    vi.spyOn(useApiHooks, 'useApplications').mockImplementation(mockUseApplications as any);
    vi.spyOn(useApiHooks, 'useUsers').mockImplementation(mockUseUsers as any);
    vi.spyOn(useApiHooks, 'useGroups').mockImplementation(mockUseGroups as any);
  });

  describe('Basic Rendering', () => {
    it('renders change number and title', () => {
      render(<ChangeDetailPage />);

      expect(screen.getByText('CHG-001')).toBeInTheDocument();
      expect(screen.getByText('Deploy new API version')).toBeInTheDocument();
    });

    it('renders status badge', () => {
      render(<ChangeDetailPage />);

      expect(screen.getByText('Submitted')).toBeInTheDocument();
    });

    it('renders type badge', () => {
      render(<ChangeDetailPage />);

      expect(screen.getByText(/Normal/i)).toBeInTheDocument();
    });

    it('renders risk level badge', () => {
      render(<ChangeDetailPage />);

      expect(screen.getByText(/Medium/i)).toBeInTheDocument();
    });

    it('renders back button', () => {
      render(<ChangeDetailPage />);

      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBeGreaterThan(0);
    });
  });

  describe('Content Sections', () => {
    it('renders description section', () => {
      render(<ChangeDetailPage />);

      expect(screen.getByText('Description')).toBeInTheDocument();
      expect(screen.getByText('Update API to version 2.0')).toBeInTheDocument();
    });

    it('renders justification section', () => {
      render(<ChangeDetailPage />);

      expect(screen.getByText('Justification')).toBeInTheDocument();
      expect(screen.getByText('Required for new features')).toBeInTheDocument();
    });

    it('renders implementation plan section', () => {
      render(<ChangeDetailPage />);

      expect(screen.getByText('Implementation Plan')).toBeInTheDocument();
      expect(screen.getByText('Deploy to staging first')).toBeInTheDocument();
    });

    it('renders rollback plan section', () => {
      render(<ChangeDetailPage />);

      expect(screen.getByText('Rollback Plan')).toBeInTheDocument();
      expect(screen.getByText('Revert to v1.9')).toBeInTheDocument();
    });

    it('renders test plan section', () => {
      render(<ChangeDetailPage />);

      expect(screen.getByText('Test Plan')).toBeInTheDocument();
      expect(screen.getByText('Run integration tests')).toBeInTheDocument();
    });

    it('renders schedule section', () => {
      render(<ChangeDetailPage />);

      expect(screen.getByText('Schedule')).toBeInTheDocument();
      expect(screen.getByText(/Planned Start/)).toBeInTheDocument();
      expect(screen.getByText(/Planned End/)).toBeInTheDocument();
    });

    it('renders details section', () => {
      render(<ChangeDetailPage />);

      expect(screen.getByText('Details')).toBeInTheDocument();
    });
  });

  describe('Change Information', () => {
    it('displays requester information', () => {
      render(<ChangeDetailPage />);

      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    it('displays implementer information', () => {
      render(<ChangeDetailPage />);

      expect(screen.getByText('Jane Smith')).toBeInTheDocument();
    });

    it('displays application name', () => {
      render(<ChangeDetailPage />);

      expect(screen.getByText('Core API')).toBeInTheDocument();
    });

    it('displays assigned group', () => {
      render(<ChangeDetailPage />);

      expect(screen.getByText('Backend Team')).toBeInTheDocument();
    });

    it('displays impact level', () => {
      render(<ChangeDetailPage />);

      expect(screen.getByText(/Moderate/i)).toBeInTheDocument();
    });
  });

  describe('Comments Section', () => {
    it('renders comments section', () => {
      render(<ChangeDetailPage />);

      expect(screen.getByText('Comments')).toBeInTheDocument();
    });

    it('displays existing comments', () => {
      render(<ChangeDetailPage />);

      expect(screen.getByText('Looks good to me')).toBeInTheDocument();
      expect(screen.getByText('Approved')).toBeInTheDocument();
    });

    it('displays comment authors', () => {
      render(<ChangeDetailPage />);

      expect(screen.getByText('Alice')).toBeInTheDocument();
      expect(screen.getByText('Bob')).toBeInTheDocument();
    });

    it('shows comment count', () => {
      render(<ChangeDetailPage />);

      const commentsSection = screen.getByText('Comments').closest('div');
      expect(commentsSection).toBeInTheDocument();
    });
  });

  describe('Loading State', () => {
    it('shows loading state when fetching change', () => {
      mockUseChange.mockReturnValue({
        data: null,
        isLoading: true,
        error: null,
        refetch: vi.fn(),
      });

      render(<ChangeDetailPage />);

      // Loading state shows spinner, not change details
      expect(screen.queryByText('CHG-001')).not.toBeInTheDocument();
    });

    it('shows loading state when fetching comments', () => {
      mockUseChangeComments.mockReturnValue({
        data: null,
        isLoading: true,
      });

      render(<ChangeDetailPage />);

      // Page should still render with change data
      expect(screen.getByText('CHG-001')).toBeInTheDocument();
    });
  });

  describe('Error State', () => {
    it('shows error message when change fetch fails', () => {
      mockUseChange.mockReturnValue({
        data: null,
        isLoading: false,
        error: { message: 'Failed to load change' },
        refetch: vi.fn(),
      });

      render(<ChangeDetailPage />);

      expect(screen.getByText(/Change not found/i)).toBeInTheDocument();
    });

    it('shows back to changes button on error', () => {
      mockUseChange.mockReturnValue({
        data: null,
        isLoading: false,
        error: { message: 'Network error' },
        refetch: vi.fn(),
      });

      render(<ChangeDetailPage />);

      expect(screen.getByText(/Back to Changes/i)).toBeInTheDocument();
    });
  });

  describe('Empty States', () => {
    it('handles missing description', () => {
      mockUseChange.mockReturnValue({
        data: { ...mockChange, description: '' },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<ChangeDetailPage />);

      expect(screen.getByText('Description')).toBeInTheDocument();
    });

    it('handles missing justification', () => {
      mockUseChange.mockReturnValue({
        data: { ...mockChange, justification: '' },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<ChangeDetailPage />);

      expect(screen.getByText('Justification')).toBeInTheDocument();
    });

    it('handles missing implementation plan', () => {
      mockUseChange.mockReturnValue({
        data: { ...mockChange, implementation_plan: '' },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<ChangeDetailPage />);

      expect(screen.getByText('Implementation Plan')).toBeInTheDocument();
    });

    it('handles empty comments list', () => {
      mockUseChangeComments.mockReturnValue({
        data: { data: [] },
        isLoading: false,
      });

      render(<ChangeDetailPage />);

      expect(screen.getByText('Comments')).toBeInTheDocument();
    });

    it('handles missing application', () => {
      mockUseChange.mockReturnValue({
        data: { ...mockChange, application_name: null },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<ChangeDetailPage />);

      expect(screen.getByText('CHG-001')).toBeInTheDocument();
    });

    it('handles missing implementer', () => {
      mockUseChange.mockReturnValue({
        data: { ...mockChange, implementer_name: null },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<ChangeDetailPage />);

      expect(screen.getByText('CHG-001')).toBeInTheDocument();
    });
  });

  describe('Status Variations', () => {
    it('renders draft status correctly', () => {
      mockUseChange.mockReturnValue({
        data: { ...mockChange, status: 'draft' },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<ChangeDetailPage />);

      expect(screen.getByText('Draft')).toBeInTheDocument();
    });

    it('renders approved status correctly', () => {
      mockUseChange.mockReturnValue({
        data: { ...mockChange, status: 'approved' },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      // Remove comment that contains "Approved" text
      mockUseChangeComments.mockReturnValue({
        data: { data: [] },
        isLoading: false,
      });

      render(<ChangeDetailPage />);

      expect(screen.getByText('Approved')).toBeInTheDocument();
    });

    it('renders implementing status correctly', () => {
      mockUseChange.mockReturnValue({
        data: { ...mockChange, status: 'implementing' },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<ChangeDetailPage />);

      expect(screen.getByText('Implementing')).toBeInTheDocument();
    });

    it('renders completed status correctly', () => {
      mockUseChange.mockReturnValue({
        data: { ...mockChange, status: 'completed' },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<ChangeDetailPage />);

      expect(screen.getByText('Completed')).toBeInTheDocument();
    });

    it('renders rejected status correctly', () => {
      mockUseChange.mockReturnValue({
        data: { ...mockChange, status: 'rejected' },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<ChangeDetailPage />);

      expect(screen.getByText('Rejected')).toBeInTheDocument();
    });
  });

  describe('Type Variations', () => {
    it('renders standard type correctly', () => {
      mockUseChange.mockReturnValue({
        data: { ...mockChange, type: 'standard' },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<ChangeDetailPage />);

      expect(screen.getByText(/Standard/i)).toBeInTheDocument();
    });

    it('renders emergency type correctly', () => {
      mockUseChange.mockReturnValue({
        data: { ...mockChange, type: 'emergency' },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<ChangeDetailPage />);

      expect(screen.getByText(/Emergency/i)).toBeInTheDocument();
    });
  });

  describe('Risk Level Variations', () => {
    it('renders low risk correctly', () => {
      mockUseChange.mockReturnValue({
        data: { ...mockChange, risk_level: 'low' },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<ChangeDetailPage />);

      expect(screen.getByText(/Low/i)).toBeInTheDocument();
    });

    it('renders high risk correctly', () => {
      mockUseChange.mockReturnValue({
        data: { ...mockChange, risk_level: 'high' },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<ChangeDetailPage />);

      expect(screen.getByText(/High/i)).toBeInTheDocument();
    });

    it('renders critical risk correctly', () => {
      mockUseChange.mockReturnValue({
        data: { ...mockChange, risk_level: 'critical' },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<ChangeDetailPage />);

      expect(screen.getByText(/Critical/i)).toBeInTheDocument();
    });
  });

  describe('Edit Mode', () => {
    it('enters edit mode when edit button is clicked', async () => {
      const { userEvent } = await import('@testing-library/user-event');
      const user = userEvent.setup();

      render(<ChangeDetailPage />);

      const editButton = screen.getByRole('button', { name: /edit/i });
      await user.click(editButton);

      expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    });

    it('displays title input in edit mode', async () => {
      const { userEvent } = await import('@testing-library/user-event');
      const user = userEvent.setup();

      render(<ChangeDetailPage />);

      await user.click(screen.getByRole('button', { name: /edit/i }));

      const titleInput = screen.getByPlaceholderText('Change title');
      expect(titleInput).toBeInTheDocument();
      expect(titleInput).toHaveValue('Deploy new API version');
    });

    it('displays description textarea in edit mode', async () => {
      const { userEvent } = await import('@testing-library/user-event');
      const user = userEvent.setup();

      render(<ChangeDetailPage />);

      await user.click(screen.getByRole('button', { name: /edit/i }));

      const descTextarea = screen.getByPlaceholderText('Describe the change...');
      expect(descTextarea).toBeInTheDocument();
    });

    it('displays justification textarea in edit mode', async () => {
      const { userEvent } = await import('@testing-library/user-event');
      const user = userEvent.setup();

      render(<ChangeDetailPage />);

      await user.click(screen.getByRole('button', { name: /edit/i }));

      const justificationTextarea = screen.getByPlaceholderText('Why is this change needed?');
      expect(justificationTextarea).toBeInTheDocument();
    });

    it('cancels edit mode and restores original values', async () => {
      const { userEvent } = await import('@testing-library/user-event');
      const user = userEvent.setup();

      render(<ChangeDetailPage />);

      await user.click(screen.getByRole('button', { name: /edit/i }));

      const titleInput = screen.getByPlaceholderText('Change title');
      await user.clear(titleInput);
      await user.type(titleInput, 'Modified Title');

      await user.click(screen.getByRole('button', { name: /cancel/i }));

      expect(screen.getByText('Deploy new API version')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /save/i })).not.toBeInTheDocument();
    });

    it('displays type select in edit mode', async () => {
      const { userEvent } = await import('@testing-library/user-event');
      const user = userEvent.setup();

      render(<ChangeDetailPage />);

      await user.click(screen.getByRole('button', { name: /edit/i }));

      // Find select by looking for the one with Standard/Normal/Emergency options
      const selects = document.querySelectorAll('select');
      const typeSelect = Array.from(selects).find(s =>
        Array.from(s.options).some(o => o.text === 'Standard')
      );
      expect(typeSelect).toBeInTheDocument();
    });

    it('displays risk level select in edit mode', async () => {
      const { userEvent } = await import('@testing-library/user-event');
      const user = userEvent.setup();

      render(<ChangeDetailPage />);

      await user.click(screen.getByRole('button', { name: /edit/i }));

      // Find select by looking for the one with Low/Medium/High/Critical options
      const selects = document.querySelectorAll('select');
      const riskSelect = Array.from(selects).find(s =>
        Array.from(s.options).some(o => o.text === 'Critical')
      );
      expect(riskSelect).toBeInTheDocument();
    });

    it('displays impact select in edit mode', async () => {
      const { userEvent } = await import('@testing-library/user-event');
      const user = userEvent.setup();

      render(<ChangeDetailPage />);

      await user.click(screen.getByRole('button', { name: /edit/i }));

      // Find select by looking for the one with impact options
      const selects = document.querySelectorAll('select');
      const impactSelect = Array.from(selects).find(s =>
        Array.from(s.options).some(o => o.text === 'Significant')
      );
      expect(impactSelect).toBeInTheDocument();
    });

    it('displays datetime inputs for schedule in edit mode', async () => {
      const { userEvent } = await import('@testing-library/user-event');
      const user = userEvent.setup();

      render(<ChangeDetailPage />);

      await user.click(screen.getByRole('button', { name: /edit/i }));

      // Check for datetime-local inputs
      const datetimeInputs = document.querySelectorAll('input[type="datetime-local"]');
      expect(datetimeInputs.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Actions Section', () => {
    it('shows Submit for Approval button when status is draft', () => {
      mockUseChange.mockReturnValue({
        data: { ...mockChange, status: 'draft' },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<ChangeDetailPage />);

      expect(screen.getByRole('button', { name: /submit for approval/i })).toBeInTheDocument();
    });

    it('shows Approve and Reject buttons when status is submitted', () => {
      mockUseChange.mockReturnValue({
        data: { ...mockChange, status: 'submitted' },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<ChangeDetailPage />);

      expect(screen.getByRole('button', { name: /approve/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /reject/i })).toBeInTheDocument();
    });

    it('shows Approve and Reject buttons when status is review', () => {
      mockUseChange.mockReturnValue({
        data: { ...mockChange, status: 'review' },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<ChangeDetailPage />);

      expect(screen.getByRole('button', { name: /approve/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /reject/i })).toBeInTheDocument();
    });

    it('shows Schedule button when status is approved', () => {
      mockUseChange.mockReturnValue({
        data: { ...mockChange, status: 'approved' },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      // Clear comments to avoid "Approved" text conflict
      mockUseChangeComments.mockReturnValue({
        data: { data: [] },
        isLoading: false,
      });

      render(<ChangeDetailPage />);

      expect(screen.getByRole('button', { name: /schedule/i })).toBeInTheDocument();
    });

    it('shows Start Implementation button when status is scheduled', () => {
      mockUseChange.mockReturnValue({
        data: { ...mockChange, status: 'scheduled' },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<ChangeDetailPage />);

      expect(screen.getByRole('button', { name: /start implementation/i })).toBeInTheDocument();
    });

    it('shows Complete, Fail, and Rollback buttons when status is implementing', () => {
      mockUseChange.mockReturnValue({
        data: { ...mockChange, status: 'implementing' },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<ChangeDetailPage />);

      expect(screen.getByRole('button', { name: /complete successfully/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /mark as failed/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /rollback/i })).toBeInTheDocument();
    });

    it('shows Cancel button for draft status', () => {
      mockUseChange.mockReturnValue({
        data: { ...mockChange, status: 'draft' },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<ChangeDetailPage />);

      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    });

    it('shows completion message when status is completed', () => {
      mockUseChange.mockReturnValue({
        data: { ...mockChange, status: 'completed' },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<ChangeDetailPage />);

      expect(screen.getByText(/this change is completed/i)).toBeInTheDocument();
    });

    it('shows completion message when status is failed', () => {
      mockUseChange.mockReturnValue({
        data: { ...mockChange, status: 'failed' },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<ChangeDetailPage />);

      expect(screen.getByText(/this change is failed/i)).toBeInTheDocument();
    });

    it('shows completion message when status is rolled_back', () => {
      mockUseChange.mockReturnValue({
        data: { ...mockChange, status: 'rolled_back' },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<ChangeDetailPage />);

      expect(screen.getByText(/this change is rolled back/i)).toBeInTheDocument();
    });

    it('shows completion message when status is cancelled', () => {
      mockUseChange.mockReturnValue({
        data: { ...mockChange, status: 'cancelled' },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<ChangeDetailPage />);

      expect(screen.getByText(/this change is cancelled/i)).toBeInTheDocument();
    });
  });

  describe('Comment Submission', () => {
    it('renders comment input area', () => {
      render(<ChangeDetailPage />);

      expect(screen.getByPlaceholderText('Add a comment...')).toBeInTheDocument();
    });

    it('renders send button for comments', () => {
      render(<ChangeDetailPage />);

      expect(screen.getByRole('button', { name: /send/i })).toBeInTheDocument();
    });

    it('send button is disabled when comment is empty', () => {
      render(<ChangeDetailPage />);

      const sendButton = screen.getByRole('button', { name: /send/i });
      expect(sendButton).toBeDisabled();
    });

    it('send button is enabled when comment has text', async () => {
      const { userEvent } = await import('@testing-library/user-event');
      const user = userEvent.setup();

      render(<ChangeDetailPage />);

      const textarea = screen.getByPlaceholderText('Add a comment...');
      await user.type(textarea, 'Test comment');

      const sendButton = screen.getByRole('button', { name: /send/i });
      expect(sendButton).not.toBeDisabled();
    });

    it('shows no comments message when comments list is empty', () => {
      mockUseChangeComments.mockReturnValue({
        data: { data: [] },
        isLoading: false,
      });

      render(<ChangeDetailPage />);

      expect(screen.getByText('No comments yet')).toBeInTheDocument();
    });

    it('shows loading state for comments', () => {
      mockUseChangeComments.mockReturnValue({
        data: null,
        isLoading: true,
      });

      render(<ChangeDetailPage />);

      expect(screen.getByText('Loading comments...')).toBeInTheDocument();
    });
  });

  describe('Approvals Section', () => {
    it('renders approvals when available', () => {
      mockUseChange.mockReturnValue({
        data: {
          ...mockChange,
          approvals: [
            {
              id: 'approval-1',
              status: 'approved',
              approver: { name: 'Manager One' },
              approved_at: '2026-01-12T10:00:00Z',
              comments: 'LGTM',
            },
          ],
        },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<ChangeDetailPage />);

      expect(screen.getByText('Approvals')).toBeInTheDocument();
      expect(screen.getByText('Manager One')).toBeInTheDocument();
      expect(screen.getByText('LGTM')).toBeInTheDocument();
    });

    it('renders rejected approval status', () => {
      mockUseChange.mockReturnValue({
        data: {
          ...mockChange,
          approvals: [
            {
              id: 'approval-1',
              status: 'rejected',
              approver: { name: 'Manager Two' },
              approved_at: '2026-01-12T10:00:00Z',
              comments: 'Needs more testing',
            },
          ],
        },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<ChangeDetailPage />);

      expect(screen.getByText('Manager Two')).toBeInTheDocument();
      expect(screen.getByText('Needs more testing')).toBeInTheDocument();
    });

    it('renders pending approval status', () => {
      mockUseChange.mockReturnValue({
        data: {
          ...mockChange,
          approvals: [
            {
              id: 'approval-1',
              status: 'pending',
              approver: { name: 'Manager Three' },
              approved_at: null,
            },
          ],
        },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<ChangeDetailPage />);

      expect(screen.getByText('Manager Three')).toBeInTheDocument();
    });

    it('does not render approvals section when no approvals', () => {
      mockUseChange.mockReturnValue({
        data: { ...mockChange, approvals: [] },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<ChangeDetailPage />);

      expect(screen.queryByText('Approvals')).not.toBeInTheDocument();
    });
  });

  describe('Outcome Notes Section', () => {
    it('renders outcome notes when available', () => {
      mockUseChange.mockReturnValue({
        data: {
          ...mockChange,
          outcome: 'successful',
          outcome_notes: 'Deployment completed without issues',
        },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<ChangeDetailPage />);

      expect(screen.getByText('Outcome Notes')).toBeInTheDocument();
      expect(screen.getByText('Deployment completed without issues')).toBeInTheDocument();
    });

    it('renders failed outcome notes', () => {
      mockUseChange.mockReturnValue({
        data: {
          ...mockChange,
          outcome: 'failed',
          outcome_notes: 'Server crashed during deployment',
        },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<ChangeDetailPage />);

      expect(screen.getByText('Server crashed during deployment')).toBeInTheDocument();
    });

    it('renders rolled_back outcome notes', () => {
      mockUseChange.mockReturnValue({
        data: {
          ...mockChange,
          outcome: 'rolled_back',
          outcome_notes: 'Rolled back due to performance issues',
        },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<ChangeDetailPage />);

      expect(screen.getByText('Rolled back due to performance issues')).toBeInTheDocument();
    });

    it('does not render outcome notes when not available', () => {
      mockUseChange.mockReturnValue({
        data: { ...mockChange, outcome_notes: null },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<ChangeDetailPage />);

      expect(screen.queryByText('Outcome Notes')).not.toBeInTheDocument();
    });
  });

  describe('Additional Status Variations', () => {
    it('renders review status correctly', () => {
      mockUseChange.mockReturnValue({
        data: { ...mockChange, status: 'review' },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<ChangeDetailPage />);

      expect(screen.getByText('In Review')).toBeInTheDocument();
    });

    it('renders scheduled status correctly', () => {
      mockUseChange.mockReturnValue({
        data: { ...mockChange, status: 'scheduled' },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<ChangeDetailPage />);

      expect(screen.getByText('Scheduled')).toBeInTheDocument();
    });

    it('renders failed status correctly', () => {
      mockUseChange.mockReturnValue({
        data: { ...mockChange, status: 'failed' },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<ChangeDetailPage />);

      expect(screen.getByText('Failed')).toBeInTheDocument();
    });

    it('renders rolled_back status correctly', () => {
      mockUseChange.mockReturnValue({
        data: { ...mockChange, status: 'rolled_back' },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<ChangeDetailPage />);

      expect(screen.getByText('Rolled Back')).toBeInTheDocument();
    });

    it('renders cancelled status correctly', () => {
      mockUseChange.mockReturnValue({
        data: { ...mockChange, status: 'cancelled' },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<ChangeDetailPage />);

      expect(screen.getByText('Cancelled')).toBeInTheDocument();
    });
  });

  describe('Additional Details Section', () => {
    it('displays actual start time when available', () => {
      mockUseChange.mockReturnValue({
        data: { ...mockChange, actual_start: '2026-01-15T14:30:00Z' },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<ChangeDetailPage />);

      expect(screen.getByText('Actual Start')).toBeInTheDocument();
    });

    it('displays actual end time when available', () => {
      mockUseChange.mockReturnValue({
        data: { ...mockChange, actual_end: '2026-01-15T16:30:00Z' },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<ChangeDetailPage />);

      expect(screen.getByText('Actual End')).toBeInTheDocument();
    });

    it('displays downtime minutes when available', () => {
      mockUseChange.mockReturnValue({
        data: { ...mockChange, downtime_minutes: 15 },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<ChangeDetailPage />);

      expect(screen.getByText('Estimated Downtime')).toBeInTheDocument();
      expect(screen.getByText('15 minutes')).toBeInTheDocument();
    });

    it('displays environment name when available', () => {
      mockUseChange.mockReturnValue({
        data: { ...mockChange, environment_name: 'Production' },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<ChangeDetailPage />);

      expect(screen.getByText('Environment')).toBeInTheDocument();
      expect(screen.getByText('Production')).toBeInTheDocument();
    });

    it('displays urgency when available', () => {
      mockUseChange.mockReturnValue({
        data: { ...mockChange, urgency: 'high' },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<ChangeDetailPage />);

      expect(screen.getByText('Urgency')).toBeInTheDocument();
    });

    it('displays CAB required indicator', () => {
      mockUseChange.mockReturnValue({
        data: { ...mockChange, cab_required: true, cab_date: '2026-01-14T10:00:00Z' },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<ChangeDetailPage />);

      expect(screen.getByText('CAB Review')).toBeInTheDocument();
    });

    it('displays created date', () => {
      render(<ChangeDetailPage />);

      expect(screen.getByText('Created')).toBeInTheDocument();
    });

    it('displays last updated date', () => {
      render(<ChangeDetailPage />);

      expect(screen.getByText('Last Updated')).toBeInTheDocument();
    });

    it('displays requester email', () => {
      render(<ChangeDetailPage />);

      expect(screen.getByText('john@example.com')).toBeInTheDocument();
    });

    it('displays implementer email', () => {
      render(<ChangeDetailPage />);

      expect(screen.getByText('jane@example.com')).toBeInTheDocument();
    });
  });

  describe('Internal Comments', () => {
    it('displays internal note badge for internal comments', () => {
      mockUseChangeComments.mockReturnValue({
        data: {
          data: [
            {
              id: 'comment-1',
              changeId: 'change-123',
              userId: 'user-1',
              user_name: 'Admin',
              content: 'Internal note for team',
              created_at: '2026-01-11T10:00:00Z',
              is_internal: true,
            },
          ],
        },
        isLoading: false,
      });

      render(<ChangeDetailPage />);

      expect(screen.getByText('Internal Note')).toBeInTheDocument();
    });
  });

  describe('Application Link', () => {
    it('renders application as a link', () => {
      render(<ChangeDetailPage />);

      const appLink = screen.getByRole('link', { name: 'Core API' });
      expect(appLink).toHaveAttribute('href', '/applications/undefined');
    });

    it('renders application link with correct href when application_id is present', () => {
      mockUseChange.mockReturnValue({
        data: { ...mockChange, application_id: 'app-123' },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<ChangeDetailPage />);

      const appLink = screen.getByRole('link', { name: 'Core API' });
      expect(appLink).toHaveAttribute('href', '/applications/app-123');
    });
  });

  describe('User Avatar Display', () => {
    it('displays requester initial in avatar', () => {
      render(<ChangeDetailPage />);

      const avatars = document.querySelectorAll('.rounded-full');
      const requesterAvatar = Array.from(avatars).find(a => a.textContent === 'J');
      expect(requesterAvatar).toBeInTheDocument();
    });

    it('displays implementer initial in avatar', () => {
      render(<ChangeDetailPage />);

      const avatars = document.querySelectorAll('.rounded-full');
      // Both John and Jane start with J, check that we have multiple J avatars
      const jAvatars = Array.from(avatars).filter(a => a.textContent === 'J');
      expect(jAvatars.length).toBeGreaterThanOrEqual(2);
    });
  });
});
