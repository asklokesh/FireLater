import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mock next/navigation
const mockPush = vi.fn();
const mockBack = vi.fn();
const mockParams = { id: 'app-123' };
vi.mock('next/navigation', () => ({
  useParams: () => mockParams,
  useRouter: () => ({
    push: mockPush,
    back: mockBack,
  }),
}));

// Mock the API hooks
vi.mock('@/hooks/useApi', () => ({
  useApplication: vi.fn(),
  useApplicationHealth: vi.fn(),
  useIssues: vi.fn(),
  useChanges: vi.fn(),
}));

import ApplicationDetailPage from '../page';
import { useApplication, useApplicationHealth, useIssues, useChanges } from '@/hooks/useApi';

describe('ApplicationDetailPage', () => {
  const mockApp = {
    id: 'app-123',
    name: 'Customer Portal',
    description: 'Main customer-facing web application',
    status: 'operational',
    criticality: 'high',
    health_score: 92,
    owner_user_name: 'John Doe',
    owner_user_email: 'john@example.com',
    support_group_name: 'Web Team',
    lifecycle_stage: 'production',
    updated_at: '2026-01-07T10:30:00Z',
    metadata: {
      url: 'https://portal.example.com',
    },
  };

  const mockHealthData = {
    score: 92,
    trend: 5,
    history: [
      { date: '2026-01-06', score: 90 },
      { date: '2026-01-05', score: 85 },
      { date: '2026-01-04', score: 88 },
    ],
  };

  const mockIssues = {
    data: [
      {
        id: 'issue-1',
        number: 'INC-001',
        short_description: 'Login page slow',
        state: 'in_progress',
        application: { id: 'app-123' },
      },
      {
        id: 'issue-2',
        number: 'INC-002',
        short_description: 'Other app issue',
        state: 'new',
        application: { id: 'other-app' },
      },
    ],
  };

  const mockChanges = {
    data: [
      {
        id: 'change-1',
        number: 'CHG-001',
        short_description: 'Deploy new version',
        state: 'scheduled',
        planned_start: '2026-01-10T14:00:00Z',
        application: { id: 'app-123' },
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockPush.mockClear();
    mockBack.mockClear();
    vi.mocked(useApplication).mockReturnValue({
      data: mockApp,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useApplication>);
    vi.mocked(useApplicationHealth).mockReturnValue({
      data: mockHealthData,
    } as unknown as ReturnType<typeof useApplicationHealth>);
    vi.mocked(useIssues).mockReturnValue({
      data: mockIssues,
    } as unknown as ReturnType<typeof useIssues>);
    vi.mocked(useChanges).mockReturnValue({
      data: mockChanges,
    } as unknown as ReturnType<typeof useChanges>);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('loading state', () => {
    it('should show loading spinner while fetching', async () => {
      vi.mocked(useApplication).mockReturnValue({
        data: undefined,
        isLoading: true,
        error: null,
      } as ReturnType<typeof useApplication>);

      render(<ApplicationDetailPage />);

      const spinner = document.querySelector('.animate-spin');
      expect(spinner).toBeInTheDocument();
    });
  });

  describe('error state', () => {
    it('should show error message when application not found', async () => {
      vi.mocked(useApplication).mockReturnValue({
        data: undefined,
        isLoading: false,
        error: new Error('Not found'),
      } as unknown as ReturnType<typeof useApplication>);

      render(<ApplicationDetailPage />);

      expect(screen.getByText('Application not found')).toBeInTheDocument();
      expect(screen.getByText(/doesn't exist or you don't have access/i)).toBeInTheDocument();
    });

    it('should have back to applications button on error', async () => {
      vi.mocked(useApplication).mockReturnValue({
        data: undefined,
        isLoading: false,
        error: new Error('Not found'),
      } as unknown as ReturnType<typeof useApplication>);

      render(<ApplicationDetailPage />);

      const backButton = screen.getByRole('button', { name: /back to applications/i });
      expect(backButton).toBeInTheDocument();

      await userEvent.click(backButton);
      expect(mockPush).toHaveBeenCalledWith('/applications');
    });
  });

  describe('header rendering', () => {
    it('should render application name', async () => {
      render(<ApplicationDetailPage />);

      expect(screen.getByText('Customer Portal')).toBeInTheDocument();
    });

    it('should render criticality badge', async () => {
      render(<ApplicationDetailPage />);

      expect(screen.getByText('High')).toBeInTheDocument();
    });

    it('should render status badge', async () => {
      render(<ApplicationDetailPage />);

      expect(screen.getByText('Operational')).toBeInTheDocument();
    });

    it('should have edit link', async () => {
      render(<ApplicationDetailPage />);

      const editLink = screen.getByRole('link', { name: /edit/i });
      expect(editLink).toHaveAttribute('href', '/applications/app-123/edit');
    });
  });

  describe('health score banner', () => {
    it('should render health score', async () => {
      render(<ApplicationDetailPage />);

      expect(screen.getByText('Health Score')).toBeInTheDocument();
      expect(screen.getByText('92%')).toBeInTheDocument();
    });

    it('should show positive trend indicator', async () => {
      render(<ApplicationDetailPage />);

      expect(screen.getByText('5%')).toBeInTheDocument();
    });

    it('should show negative trend indicator', async () => {
      vi.mocked(useApplicationHealth).mockReturnValue({
        data: { ...mockHealthData, trend: -3 },
      } as ReturnType<typeof useApplicationHealth>);

      render(<ApplicationDetailPage />);

      expect(screen.getByText('3%')).toBeInTheDocument();
    });

    it('should render open issues count', async () => {
      render(<ApplicationDetailPage />);

      expect(screen.getByText('Open Issues')).toBeInTheDocument();
      // Both Open Issues and Pending Changes show "1", so check they're present
      const countElements = screen.getAllByText('1');
      expect(countElements.length).toBeGreaterThanOrEqual(1);
    });

    it('should render pending changes count', async () => {
      render(<ApplicationDetailPage />);

      expect(screen.getByText('Pending Changes')).toBeInTheDocument();
    });

    it('should have report issue link', async () => {
      render(<ApplicationDetailPage />);

      const reportIssueLink = screen.getByRole('link', { name: /report issue/i });
      expect(reportIssueLink).toHaveAttribute('href', '/issues/new?application=app-123');
    });

    it('should have request change link', async () => {
      render(<ApplicationDetailPage />);

      const requestChangeLink = screen.getByRole('link', { name: /request change/i });
      expect(requestChangeLink).toHaveAttribute('href', '/changes/new?application=app-123');
    });
  });

  describe('tabs', () => {
    it('should render all tabs', async () => {
      render(<ApplicationDetailPage />);

      expect(screen.getByRole('button', { name: /overview/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /issues/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /changes/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /health/i })).toBeInTheDocument();
    });

    it('should show overview tab by default', async () => {
      render(<ApplicationDetailPage />);

      expect(screen.getByText('Description')).toBeInTheDocument();
      expect(screen.getByText('Main customer-facing web application')).toBeInTheDocument();
    });

    it('should switch to issues tab', async () => {
      const user = userEvent.setup();
      render(<ApplicationDetailPage />);

      await user.click(screen.getByRole('button', { name: /issues/i }));

      expect(screen.getByText('Related Issues')).toBeInTheDocument();
      expect(screen.getByText('INC-001')).toBeInTheDocument();
      expect(screen.getByText('Login page slow')).toBeInTheDocument();
    });

    it('should filter issues related to this application', async () => {
      const user = userEvent.setup();
      render(<ApplicationDetailPage />);

      await user.click(screen.getByRole('button', { name: /issues/i }));

      // Should show issue for app-123 but not other-app
      expect(screen.getByText('INC-001')).toBeInTheDocument();
      expect(screen.queryByText('INC-002')).not.toBeInTheDocument();
    });

    it('should switch to changes tab', async () => {
      const user = userEvent.setup();
      render(<ApplicationDetailPage />);

      await user.click(screen.getByRole('button', { name: /changes/i }));

      expect(screen.getByText('Related Changes')).toBeInTheDocument();
      expect(screen.getByText('CHG-001')).toBeInTheDocument();
      expect(screen.getByText('Deploy new version')).toBeInTheDocument();
    });

    it('should switch to health tab', async () => {
      const user = userEvent.setup();
      render(<ApplicationDetailPage />);

      await user.click(screen.getByRole('button', { name: /health/i }));

      expect(screen.getByText('Health History')).toBeInTheDocument();
      expect(screen.getByText('2026-01-06')).toBeInTheDocument();
      expect(screen.getByText('90%')).toBeInTheDocument();
    });

    it('should show empty state when no issues', async () => {
      const user = userEvent.setup();
      vi.mocked(useIssues).mockReturnValue({
        data: { data: [] },
      } as unknown as ReturnType<typeof useIssues>);

      render(<ApplicationDetailPage />);

      await user.click(screen.getByRole('button', { name: /issues/i }));

      expect(screen.getByText('No related issues')).toBeInTheDocument();
    });

    it('should show empty state when no changes', async () => {
      const user = userEvent.setup();
      vi.mocked(useChanges).mockReturnValue({
        data: { data: [] },
      } as unknown as ReturnType<typeof useChanges>);

      render(<ApplicationDetailPage />);

      await user.click(screen.getByRole('button', { name: /changes/i }));

      expect(screen.getByText('No related changes')).toBeInTheDocument();
    });

    it('should show empty health history message', async () => {
      const user = userEvent.setup();
      vi.mocked(useApplicationHealth).mockReturnValue({
        data: { score: 90, trend: 0, history: [] },
      } as ReturnType<typeof useApplicationHealth>);

      render(<ApplicationDetailPage />);

      await user.click(screen.getByRole('button', { name: /health/i }));

      expect(screen.getByText('No health history available')).toBeInTheDocument();
    });
  });

  describe('overview tab details', () => {
    it('should render owner information', async () => {
      render(<ApplicationDetailPage />);

      expect(screen.getByText('Owner')).toBeInTheDocument();
      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.getByText('john@example.com')).toBeInTheDocument();
    });

    it('should render support group', async () => {
      render(<ApplicationDetailPage />);

      expect(screen.getByText('Support Group')).toBeInTheDocument();
      expect(screen.getByText('Web Team')).toBeInTheDocument();
    });

    it('should render lifecycle stage', async () => {
      render(<ApplicationDetailPage />);

      expect(screen.getByText('Lifecycle Stage')).toBeInTheDocument();
      expect(screen.getByText('production')).toBeInTheDocument();
    });

    it('should render last updated date', async () => {
      render(<ApplicationDetailPage />);

      expect(screen.getByText('Last Updated')).toBeInTheDocument();
    });

    it('should render application URL when present', async () => {
      render(<ApplicationDetailPage />);

      expect(screen.getByText('Quick Links')).toBeInTheDocument();
      const urlLink = screen.getByRole('link', { name: /application url/i });
      expect(urlLink).toHaveAttribute('href', 'https://portal.example.com');
      expect(urlLink).toHaveAttribute('target', '_blank');
    });

    it('should not render quick links when no URL', async () => {
      vi.mocked(useApplication).mockReturnValue({
        data: { ...mockApp, metadata: {} },
        isLoading: false,
        error: null,
      } as ReturnType<typeof useApplication>);

      render(<ApplicationDetailPage />);

      expect(screen.queryByText('Quick Links')).not.toBeInTheDocument();
    });
  });

  describe('navigation', () => {
    it('should call router.back when clicking back button', async () => {
      const user = userEvent.setup();
      render(<ApplicationDetailPage />);

      const backButton = document.querySelector('button[class*="hover:bg-gray-100"]');
      expect(backButton).toBeInTheDocument();

      await user.click(backButton!);
      expect(mockBack).toHaveBeenCalled();
    });

    it('should have new issue link in issues tab', async () => {
      const user = userEvent.setup();
      render(<ApplicationDetailPage />);

      await user.click(screen.getByRole('button', { name: /issues/i }));

      const newIssueLink = screen.getByRole('link', { name: /new issue/i });
      expect(newIssueLink).toHaveAttribute('href', '/issues/new?application=app-123');
    });

    it('should have new change link in changes tab', async () => {
      const user = userEvent.setup();
      render(<ApplicationDetailPage />);

      await user.click(screen.getByRole('button', { name: /changes/i }));

      const newChangeLink = screen.getByRole('link', { name: /new change/i });
      expect(newChangeLink).toHaveAttribute('href', '/changes/new?application=app-123');
    });

    it('should have issue detail links', async () => {
      const user = userEvent.setup();
      render(<ApplicationDetailPage />);

      await user.click(screen.getByRole('button', { name: /issues/i }));

      const issueLink = screen.getByRole('link', { name: /inc-001/i });
      expect(issueLink).toHaveAttribute('href', '/issues/issue-1');
    });

    it('should have change detail links', async () => {
      const user = userEvent.setup();
      render(<ApplicationDetailPage />);

      await user.click(screen.getByRole('button', { name: /changes/i }));

      const changeLink = screen.getByRole('link', { name: /chg-001/i });
      expect(changeLink).toHaveAttribute('href', '/changes/change-1');
    });
  });

  describe('status variations', () => {
    it('should show deprecated status correctly', async () => {
      vi.mocked(useApplication).mockReturnValue({
        data: { ...mockApp, status: 'deprecated' },
        isLoading: false,
        error: null,
      } as unknown as ReturnType<typeof useApplication>);

      render(<ApplicationDetailPage />);

      expect(screen.getByText('Deprecated')).toBeInTheDocument();
    });

    it('should show degraded status correctly', async () => {
      vi.mocked(useApplication).mockReturnValue({
        data: { ...mockApp, status: 'degraded' },
        isLoading: false,
        error: null,
      } as unknown as ReturnType<typeof useApplication>);

      render(<ApplicationDetailPage />);

      expect(screen.getByText('Degraded')).toBeInTheDocument();
    });

    it('should handle different criticality levels', async () => {
      vi.mocked(useApplication).mockReturnValue({
        data: { ...mockApp, criticality: 'critical' },
        isLoading: false,
        error: null,
      } as unknown as ReturnType<typeof useApplication>);

      render(<ApplicationDetailPage />);

      expect(screen.getByText('Critical')).toBeInTheDocument();
    });
  });
});
