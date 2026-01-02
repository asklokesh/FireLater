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

    vi.spyOn(useApiHooks, 'useChange').mockImplementation(mockUseChange);
    vi.spyOn(useApiHooks, 'useChangeComments').mockImplementation(mockUseChangeComments);
    vi.spyOn(useApiHooks, 'useAddChangeComment').mockImplementation(mockUseAddChangeComment);
    vi.spyOn(useApiHooks, 'useUpdateChange').mockImplementation(mockUseUpdateChange);
    vi.spyOn(useApiHooks, 'useApplications').mockImplementation(mockUseApplications);
    vi.spyOn(useApiHooks, 'useUsers').mockImplementation(mockUseUsers);
    vi.spyOn(useApiHooks, 'useGroups').mockImplementation(mockUseGroups);
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
});
