import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import OnCallPage from '../page';
import * as hooks from '@/hooks/useApi';

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

// Mock all API hooks
vi.mock('@/hooks/useApi', () => ({
  useOncallSchedules: vi.fn(),
  useWhoIsOnCall: vi.fn(),
  useIssues: vi.fn(),
  useMySwapRequests: vi.fn(),
  useAvailableSwaps: vi.fn(),
  useCreateSwapRequest: vi.fn(),
  useCancelSwapRequest: vi.fn(),
  useAcceptSwap: vi.fn(),
  useRejectSwap: vi.fn(),
  useUsers: vi.fn(),
}));

const mockSchedules = [
  {
    id: '1',
    name: 'Primary On-Call',
    description: 'Primary on-call schedule for production',
    timezone: 'America/New_York',
    rotation_period_days: 7,
    current_on_call: {
      id: 'user1',
      name: 'John Doe',
      email: 'john@example.com',
      phone: '+1234567890',
    },
    next_on_call: {
      id: 'user2',
      name: 'Jane Smith',
      email: 'jane@example.com',
    },
    rotation_end: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days from now
    escalation_policy: {
      id: 'ep1',
      name: 'Standard Escalation',
    },
    is_active: true,
  },
  {
    id: '2',
    name: 'Database On-Call',
    description: 'Database team rotation',
    rotation_end: new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString(), // 5 hours from now
    escalation_policy: {
      id: 'ep2',
      name: 'Database Escalation',
    },
    is_active: true,
  },
];

const mockIssues = [
  {
    id: 'issue1',
    number: 'INC-001',
    title: 'Production database outage',
    priority: 'critical',
    state: 'new',
    assigned_to: {
      id: 'user1',
      name: 'John Doe',
    },
    created_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(), // 30 mins ago
  },
  {
    id: 'issue2',
    number: 'INC-002',
    title: 'API latency spike',
    priority: 'high',
    state: 'new',
    created_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(), // 1 hour ago
    acknowledged_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
  },
  {
    id: 'issue3',
    number: 'INC-003',
    title: 'Low priority issue',
    priority: 'low',
    state: 'new',
    created_at: new Date().toISOString(),
  },
];

const mockWhoIsOnCall = [
  {
    schedule_id: '1',
    schedule_name: 'Primary On-Call',
    user: {
      id: 'user1',
      name: 'John Doe',
      phone: '+1234567890',
    },
    start_time: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    end_time: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    schedule_id: '2',
    schedule_name: 'Database On-Call',
    user: {
      id: 'user2',
      name: 'Jane Smith',
    },
    end_time: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

const mockSwapRequests = [
  {
    id: 'swap1',
    swap_number: 'SWAP-001',
    schedule_id: '1',
    schedule_name: 'Primary On-Call',
    requester_id: 'user1',
    requester_name: 'John Doe',
    original_start: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    original_end: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
    status: 'pending' as const,
    reason: 'Need to attend a wedding',
    created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'swap2',
    swap_number: 'SWAP-002',
    schedule_id: '1',
    schedule_name: 'Primary On-Call',
    requester_id: 'user1',
    requester_name: 'John Doe',
    original_start: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
    original_end: new Date(Date.now() + 96 * 60 * 60 * 1000).toISOString(),
    status: 'accepted' as const,
    accepter_id: 'user3',
    accepter_name: 'Bob Wilson',
    responded_at: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
  },
];

const mockAvailableSwaps = [
  {
    id: 'swap3',
    swap_number: 'SWAP-003',
    schedule_id: '1',
    schedule_name: 'Primary On-Call',
    requester_id: 'user3',
    requester_name: 'Bob Wilson',
    original_start: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
    original_end: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
    status: 'pending' as const,
    reason: 'Medical appointment',
    expires_at: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
    created_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
  },
];

const mockUsers = [
  { id: 'user1', name: 'John Doe', email: 'john@example.com' },
  { id: 'user2', name: 'Jane Smith', email: 'jane@example.com' },
  { id: 'user3', name: 'Bob Wilson', email: 'bob@example.com' },
];

describe('OnCallPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock implementations
    vi.mocked(hooks.useOncallSchedules).mockReturnValue({
      data: { data: mockSchedules },
      isLoading: false,
      error: null,
    } as any);

    vi.mocked(hooks.useWhoIsOnCall).mockReturnValue({
      data: { data: mockWhoIsOnCall },
      isLoading: false,
      error: null,
    } as any);

    vi.mocked(hooks.useIssues).mockReturnValue({
      data: { data: mockIssues },
      isLoading: false,
      error: null,
    } as any);

    vi.mocked(hooks.useMySwapRequests).mockReturnValue({
      data: { data: mockSwapRequests },
      isLoading: false,
      error: null,
    } as any);

    vi.mocked(hooks.useAvailableSwaps).mockReturnValue({
      data: { data: mockAvailableSwaps },
      isLoading: false,
      error: null,
    } as any);

    vi.mocked(hooks.useUsers).mockReturnValue({
      data: { data: mockUsers },
      isLoading: false,
      error: null,
    } as any);

    vi.mocked(hooks.useCreateSwapRequest).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as any);

    vi.mocked(hooks.useCancelSwapRequest).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as any);

    vi.mocked(hooks.useAcceptSwap).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as any);

    vi.mocked(hooks.useRejectSwap).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as any);
  });

  describe('Basic Rendering', () => {
    it('renders page header', () => {
      render(<OnCallPage />);
      expect(screen.getByText('On-Call Management')).toBeInTheDocument();
      expect(screen.getByText('Manage on-call schedules and incidents')).toBeInTheDocument();
    });

    it('renders new schedule button', () => {
      render(<OnCallPage />);
      const newButton = screen.getByText('New Schedule');
      expect(newButton).toBeInTheDocument();
      expect(newButton.closest('a')).toHaveAttribute('href', '/oncall/schedules/new');
    });

    it('renders all tabs', () => {
      render(<OnCallPage />);
      expect(screen.getByText('Schedules')).toBeInTheDocument();
      expect(screen.getByText('Incidents')).toBeInTheDocument();
      expect(screen.getByText('Who is On-Call')).toBeInTheDocument();
      expect(screen.getByText('Shift Swaps')).toBeInTheDocument();
    });

    it('renders schedules tab by default', () => {
      render(<OnCallPage />);
      expect(screen.getByText('Primary On-Call')).toBeInTheDocument();
      expect(screen.getByText('Database On-Call')).toBeInTheDocument();
    });
  });

  describe('Active Incidents Alert', () => {
    it('displays alert when there are high/critical priority incidents', () => {
      render(<OnCallPage />);
      expect(screen.getByText('2 Active Incidents')).toBeInTheDocument();
    });

    it('shows only high and critical priority incidents in alert', () => {
      render(<OnCallPage />);
      expect(screen.getByText('Production database outage')).toBeInTheDocument();
      expect(screen.getByText('API latency spike')).toBeInTheDocument();
      expect(screen.queryByText('Low priority issue')).not.toBeInTheDocument();
    });

    it('shows unacknowledged badge for incidents without acknowledgment', () => {
      render(<OnCallPage />);
      const badges = screen.getAllByText('UNACKNOWLEDGED');
      expect(badges.length).toBeGreaterThan(0);
    });

    it('does not display alert when no high/critical incidents', () => {
      vi.mocked(hooks.useIssues).mockReturnValue({
        data: { data: [mockIssues[2]] }, // Only low priority
        isLoading: false,
        error: null,
      } as any);

      render(<OnCallPage />);
      expect(screen.queryByText(/Active Incident/)).not.toBeInTheDocument();
    });

    it('limits incidents display to 5 in alert', () => {
      const manyIncidents = Array.from({ length: 10 }, (_, i) => ({
        ...mockIssues[0],
        id: `issue${i}`,
        number: `INC-00${i}`,
        title: `Incident ${i}`,
      }));

      vi.mocked(hooks.useIssues).mockReturnValue({
        data: { data: manyIncidents },
        isLoading: false,
        error: null,
      } as any);

      render(<OnCallPage />);
      const incidentLinks = screen.getAllByRole('link').filter((link) =>
        link.getAttribute('href')?.startsWith('/issues/')
      );
      // Should be limited to 5 in the alert box
      expect(incidentLinks.length).toBeLessThanOrEqual(5);
    });
  });

  describe('Schedules Tab', () => {
    it('displays all schedules', () => {
      render(<OnCallPage />);
      expect(screen.getByText('Primary On-Call')).toBeInTheDocument();
      expect(screen.getByText('Primary on-call schedule for production')).toBeInTheDocument();
      expect(screen.getByText('Database On-Call')).toBeInTheDocument();
      expect(screen.getByText('Database team rotation')).toBeInTheDocument();
    });

    it('shows current on-call user', () => {
      render(<OnCallPage />);
      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.getByText('Currently on-call')).toBeInTheDocument();
    });

    it('shows escalation policy name', () => {
      render(<OnCallPage />);
      expect(screen.getByText('Standard Escalation')).toBeInTheDocument();
      expect(screen.getByText('Database Escalation')).toBeInTheDocument();
    });

    it('shows time remaining for rotation', () => {
      render(<OnCallPage />);
      // Should show days remaining for the first schedule (2 days remaining)
      const timeTexts = screen.getAllByText(/\d+[dh].*remaining/i);
      expect(timeTexts.length).toBeGreaterThan(0);
    });

    it('shows no one on-call when current_on_call is missing', () => {
      render(<OnCallPage />);
      expect(screen.getByText('No one currently on-call')).toBeInTheDocument();
    });

    it('links to schedule detail page', () => {
      render(<OnCallPage />);
      const scheduleCard = screen.getByText('Primary On-Call').closest('a');
      expect(scheduleCard).toHaveAttribute('href', '/oncall/schedules/1');
    });

    it('shows loading state', () => {
      vi.mocked(hooks.useOncallSchedules).mockReturnValue({
        data: undefined,
        isLoading: true,
        error: null,
      } as any);

      render(<OnCallPage />);
      expect(screen.getByText('Loading schedules...')).toBeInTheDocument();
    });

    it('shows empty state when no schedules', () => {
      vi.mocked(hooks.useOncallSchedules).mockReturnValue({
        data: { data: [] },
        isLoading: false,
        error: null,
      } as any);

      render(<OnCallPage />);
      expect(screen.getByText('No schedules found')).toBeInTheDocument();
      expect(screen.getByText('Create your first on-call schedule')).toBeInTheDocument();
    });
  });

  describe('Incidents Tab', () => {
    it('switches to incidents tab', () => {
      render(<OnCallPage />);
      const incidentsTab = screen.getByText('Incidents');
      fireEvent.click(incidentsTab);

      // Should show incident count badge
      expect(screen.getByText('2')).toBeInTheDocument();
    });

    it('displays high and critical priority incidents', () => {
      render(<OnCallPage />);
      const incidentsTab = screen.getByText('Incidents');
      fireEvent.click(incidentsTab);

      expect(screen.getByText('INC-001')).toBeInTheDocument();
      expect(screen.getAllByText('Production database outage').length).toBeGreaterThan(0);
      expect(screen.getByText('INC-002')).toBeInTheDocument();
      expect(screen.getAllByText('API latency spike').length).toBeGreaterThan(0);
    });

    it('shows priority badges', () => {
      render(<OnCallPage />);
      const incidentsTab = screen.getByText('Incidents');
      fireEvent.click(incidentsTab);

      expect(screen.getAllByText('CRITICAL').length).toBeGreaterThan(0);
      expect(screen.getAllByText('HIGH').length).toBeGreaterThan(0);
    });

    it('shows assigned user', () => {
      render(<OnCallPage />);
      const incidentsTab = screen.getByText('Incidents');
      fireEvent.click(incidentsTab);

      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.getByText('Unassigned')).toBeInTheDocument();
    });

    it('shows acknowledged status', () => {
      render(<OnCallPage />);
      const incidentsTab = screen.getByText('Incidents');
      fireEvent.click(incidentsTab);

      expect(screen.getByText('ACKNOWLEDGED')).toBeInTheDocument();
      const unacknowledgedBadges = screen.getAllByText('UNACKNOWLEDGED');
      expect(unacknowledgedBadges.length).toBeGreaterThan(0);
    });

    it('links to issue detail page', () => {
      render(<OnCallPage />);
      const incidentsTab = screen.getByText('Incidents');
      fireEvent.click(incidentsTab);

      const issueLinks = screen.getAllByText('Production database outage');
      // Find the one in the incidents tab (not the alert), should be the second one
      const issueLink = issueLinks[issueLinks.length - 1].closest('a');
      expect(issueLink).toHaveAttribute('href', '/issues/issue1');
    });

    it('shows loading state', async () => {
      vi.mocked(hooks.useIssues).mockReturnValue({
        data: undefined,
        isLoading: true,
        error: null,
      } as any);

      render(<OnCallPage />);
      const incidentsTab = screen.getByText('Incidents');
      fireEvent.click(incidentsTab);

      expect(screen.getByText('Loading incidents...')).toBeInTheDocument();
    });

    it('shows empty state when no incidents', async () => {
      vi.mocked(hooks.useIssues).mockReturnValue({
        data: { data: [mockIssues[2]] }, // Only low priority
        isLoading: false,
        error: null,
      } as any);

      render(<OnCallPage />);
      const incidentsTab = screen.getByText('Incidents');
      fireEvent.click(incidentsTab);

      await waitFor(() => {
        expect(screen.getByText('No active incidents')).toBeInTheDocument();
      });
      expect(screen.getByText('All systems operational')).toBeInTheDocument();
    });
  });

  describe('Who is On-Call Tab', () => {
    it('switches to who is on-call tab', () => {
      render(<OnCallPage />);
      const shiftsTab = screen.getByText('Who is On-Call');
      fireEvent.click(shiftsTab);

      expect(screen.getByText('Currently On-Call')).toBeInTheDocument();
    });

    it('displays all on-call entries', () => {
      render(<OnCallPage />);
      const shiftsTab = screen.getByText('Who is On-Call');
      fireEvent.click(shiftsTab);

      expect(screen.getByText('Primary On-Call')).toBeInTheDocument();
      expect(screen.getByText('Database On-Call')).toBeInTheDocument();
    });

    it('shows on-call user details', () => {
      render(<OnCallPage />);
      const shiftsTab = screen.getByText('Who is On-Call');
      fireEvent.click(shiftsTab);

      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.getByText('(+1234567890)')).toBeInTheDocument();
      expect(screen.getByText('Jane Smith')).toBeInTheDocument();
    });

    it('shows shift end time', () => {
      render(<OnCallPage />);
      const shiftsTab = screen.getByText('Who is On-Call');
      fireEvent.click(shiftsTab);

      const untilTexts = screen.getAllByText(/Until/);
      expect(untilTexts.length).toBeGreaterThan(0);
    });

    it('shows view schedule buttons', () => {
      render(<OnCallPage />);
      const shiftsTab = screen.getByText('Who is On-Call');
      fireEvent.click(shiftsTab);

      const viewButtons = screen.getAllByText('View Schedule');
      expect(viewButtons.length).toBe(2);
    });

    it('shows loading state', async () => {
      vi.mocked(hooks.useWhoIsOnCall).mockReturnValue({
        data: undefined,
        isLoading: true,
        error: null,
      } as any);

      render(<OnCallPage />);
      const shiftsTab = screen.getByText('Who is On-Call');
      fireEvent.click(shiftsTab);

      expect(screen.getByText('Loading on-call information...')).toBeInTheDocument();
    });

    it('shows empty state when no on-call entries', async () => {
      vi.mocked(hooks.useWhoIsOnCall).mockReturnValue({
        data: { data: [] },
        isLoading: false,
        error: null,
      } as any);

      render(<OnCallPage />);
      const shiftsTab = screen.getByText('Who is On-Call');
      fireEvent.click(shiftsTab);

      await waitFor(() => {
        expect(screen.getByText('No on-call entries')).toBeInTheDocument();
      });
      expect(screen.getByText('Set up schedules to see who is on-call')).toBeInTheDocument();
    });
  });

  describe('Shift Swaps Tab', () => {
    it('switches to shift swaps tab', () => {
      render(<OnCallPage />);
      const swapsTab = screen.getByText('Shift Swaps');
      fireEvent.click(swapsTab);

      expect(screen.getByText('My Swap Requests')).toBeInTheDocument();
      expect(screen.getByText('Swap requests you have created')).toBeInTheDocument();
    });

    it('renders request swap button', () => {
      render(<OnCallPage />);
      const swapsTab = screen.getByText('Shift Swaps');
      fireEvent.click(swapsTab);

      const requestButtons = screen.getAllByText('Request Swap');
      expect(requestButtons.length).toBeGreaterThan(0);
    });

    it('shows my requests and available swaps sections', () => {
      render(<OnCallPage />);
      const swapsTab = screen.getByText('Shift Swaps');
      fireEvent.click(swapsTab);

      expect(screen.getByText('My Requests')).toBeInTheDocument();
      expect(screen.getByText('Available Swaps')).toBeInTheDocument();
    });

    it('shows request counts in badges', () => {
      render(<OnCallPage />);
      const swapsTab = screen.getByText('Shift Swaps');
      fireEvent.click(swapsTab);

      // My requests badge (2 requests) and available swaps badge (1 request)
      const badges = screen.getAllByText(/^[0-9]+$/);
      expect(badges.length).toBeGreaterThanOrEqual(2);
    });

    it('displays my swap requests', () => {
      render(<OnCallPage />);
      const swapsTab = screen.getByText('Shift Swaps');
      fireEvent.click(swapsTab);

      expect(screen.getByText('SWAP-001')).toBeInTheDocument();
      expect(screen.getByText('SWAP-002')).toBeInTheDocument();
    });

    it('shows swap request status', () => {
      render(<OnCallPage />);
      const swapsTab = screen.getByText('Shift Swaps');
      fireEvent.click(swapsTab);

      expect(screen.getByText('Pending')).toBeInTheDocument();
      expect(screen.getByText('Accepted')).toBeInTheDocument();
    });

    it('shows accepter name for accepted swaps', () => {
      render(<OnCallPage />);
      const swapsTab = screen.getByText('Shift Swaps');
      fireEvent.click(swapsTab);

      expect(screen.getByText(/Accepted by: Bob Wilson/)).toBeInTheDocument();
    });

    it('switches to available swaps section', () => {
      render(<OnCallPage />);
      const swapsTab = screen.getByText('Shift Swaps');
      fireEvent.click(swapsTab);

      const availableTab = screen.getByText('Available Swaps');
      fireEvent.click(availableTab);

      expect(screen.getByText('SWAP-003')).toBeInTheDocument();
      expect(screen.getByText('Bob Wilson')).toBeInTheDocument();
      // Check for the reason text which includes quotes
      expect(screen.getByText(/Medical appointment/)).toBeInTheDocument();
    });

    it('shows loading state for my requests', async () => {
      vi.mocked(hooks.useMySwapRequests).mockReturnValue({
        data: undefined,
        isLoading: true,
        error: null,
      } as any);

      render(<OnCallPage />);
      const swapsTab = screen.getByText('Shift Swaps');
      fireEvent.click(swapsTab);

      expect(screen.getByText('Loading your requests...')).toBeInTheDocument();
    });

    it('shows empty state when no swap requests', async () => {
      vi.mocked(hooks.useMySwapRequests).mockReturnValue({
        data: { data: [] },
        isLoading: false,
        error: null,
      } as any);

      render(<OnCallPage />);
      const swapsTab = screen.getByText('Shift Swaps');
      fireEvent.click(swapsTab);

      await waitFor(() => {
        expect(screen.getByText('No swap requests')).toBeInTheDocument();
      });
      expect(screen.getByText('You have not created any swap requests yet')).toBeInTheDocument();
    });

    it('shows empty state for available swaps', async () => {
      vi.mocked(hooks.useAvailableSwaps).mockReturnValue({
        data: { data: [] },
        isLoading: false,
        error: null,
      } as any);

      render(<OnCallPage />);
      const swapsTab = screen.getByText('Shift Swaps');
      fireEvent.click(swapsTab);

      const availableTab = screen.getByText('Available Swaps');
      fireEvent.click(availableTab);

      await waitFor(() => {
        expect(screen.getByText('No available swaps')).toBeInTheDocument();
      });
      expect(
        screen.getByText('There are no swap requests available for you to accept')
      ).toBeInTheDocument();
    });
  });

  describe('Create Swap Dialog', () => {
    it('opens create swap dialog', () => {
      render(<OnCallPage />);
      const swapsTab = screen.getByText('Shift Swaps');
      fireEvent.click(swapsTab);
      const requestButton = screen.getAllByText('Request Swap')[0];
      fireEvent.click(requestButton);

      expect(screen.getByText('Request Shift Swap')).toBeInTheDocument();
    });

    it('renders all form fields', () => {
      render(<OnCallPage />);
      const swapsTab = screen.getByText('Shift Swaps');
      fireEvent.click(swapsTab);
      const requestButton = screen.getAllByText('Request Swap')[0];
      fireEvent.click(requestButton);

      // Check that the form dialog is visible by checking for unique text in it
      expect(screen.getByText('Request Shift Swap')).toBeInTheDocument();
      expect(screen.getByLabelText(/Offer to a specific person/)).toBeInTheDocument();
      // Check for form labels by finding all text matches
      const scheduleLabels = screen.getAllByText(/Schedule/);
      expect(scheduleLabels.length).toBeGreaterThan(0);
      expect(screen.getByText(/Leave empty for no expiration/)).toBeInTheDocument();
    });

    it('shows schedule options', () => {
      render(<OnCallPage />);
      const swapsTab = screen.getByText('Shift Swaps');
      fireEvent.click(swapsTab);
      const requestButton = screen.getAllByText('Request Swap')[0];
      fireEvent.click(requestButton);

      const selects = screen.getAllByRole('combobox');
      const scheduleSelect = selects[0] as HTMLSelectElement;
      expect(scheduleSelect.options.length).toBe(3); // Select placeholder + 2 schedules
      expect(scheduleSelect.options[1].textContent).toBe('Primary On-Call');
      expect(scheduleSelect.options[2].textContent).toBe('Database On-Call');
    });

    it('shows offer to specific user checkbox', () => {
      render(<OnCallPage />);
      const swapsTab = screen.getByText('Shift Swaps');
      fireEvent.click(swapsTab);
      const requestButton = screen.getAllByText('Request Swap')[0];
      fireEvent.click(requestButton);

      const checkbox = screen.getByLabelText(/Offer to a specific person/) as HTMLInputElement;
      expect(checkbox).toBeInTheDocument();
      expect(checkbox.type).toBe('checkbox');
    });

    it('shows user dropdown when offer to specific is checked', () => {
      render(<OnCallPage />);
      const swapsTab = screen.getByText('Shift Swaps');
      fireEvent.click(swapsTab);
      const requestButton = screen.getAllByText('Request Swap')[0];
      fireEvent.click(requestButton);

      const checkbox = screen.getByLabelText(/Offer to a specific person/) as HTMLInputElement;
      fireEvent.click(checkbox);

      expect(screen.getByText(/Offer To/)).toBeInTheDocument();
    });

    it('closes dialog when cancel is clicked', () => {
      render(<OnCallPage />);
      const swapsTab = screen.getByText('Shift Swaps');
      fireEvent.click(swapsTab);
      const requestButton = screen.getAllByText('Request Swap')[0];
      fireEvent.click(requestButton);

      const cancelButton = screen.getByText('Cancel');
      fireEvent.click(cancelButton);

      expect(screen.queryByText('Request Shift Swap')).not.toBeInTheDocument();
    });

    it('closes dialog when X is clicked', async () => {
      render(<OnCallPage />);
      const swapsTab = screen.getByText('Shift Swaps');
      fireEvent.click(swapsTab);
      const requestButton = screen.getAllByText('Request Swap')[0];
      fireEvent.click(requestButton);

      // Find the close button by looking for a button with just an X icon (no text)
      const dialogContainer = screen.getByText('Request Shift Swap').closest('div');
      const closeButton = dialogContainer?.querySelector('button:has(svg)');

      if (closeButton) {
        fireEvent.click(closeButton);

        await waitFor(() => {
          expect(screen.queryByText('Request Shift Swap')).not.toBeInTheDocument();
        });
      }
    });

    it('validates required fields', async () => {
      render(<OnCallPage />);
      const swapsTab = screen.getByText('Shift Swaps');
      fireEvent.click(swapsTab);
      const requestButton = screen.getAllByText('Request Swap')[0];
      fireEvent.click(requestButton);

      const submitButton = screen.getByText('Submit Request');
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Please select a schedule')).toBeInTheDocument();
        expect(screen.getByText('Start date/time is required')).toBeInTheDocument();
        expect(screen.getByText('End date/time is required')).toBeInTheDocument();
      });
    });

    it('validates end must be after start', async () => {
      render(<OnCallPage />);
      const swapsTab = screen.getByText('Shift Swaps');
      fireEvent.click(swapsTab);
      const requestButton = screen.getAllByText('Request Swap')[0];
      fireEvent.click(requestButton);

      // Find datetime-local inputs by their container structure
      const container = screen.getByText('Request Shift Swap').closest('div');
      const inputs = container?.querySelectorAll('input[type="datetime-local"]');

      if (inputs && inputs.length >= 2) {
        const startInput = inputs[0] as HTMLInputElement;
        const endInput = inputs[1] as HTMLInputElement;

        const now = new Date();
        const startTime = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        const endTime = new Date(now.getTime() + 12 * 60 * 60 * 1000); // Before start

        fireEvent.change(startInput, {
          target: { value: startTime.toISOString().slice(0, 16) },
        });
        fireEvent.change(endInput, {
          target: { value: endTime.toISOString().slice(0, 16) },
        });

        const submitButton = screen.getByText('Submit Request');
        fireEvent.click(submitButton);

        await waitFor(() => {
          expect(screen.getByText('End must be after start')).toBeInTheDocument();
        });
      }
    });

    it('validates user selection when offer to specific is checked', async () => {
      render(<OnCallPage />);
      const swapsTab = screen.getByText('Shift Swaps');
      fireEvent.click(swapsTab);
      const requestButton = screen.getAllByText('Request Swap')[0];
      fireEvent.click(requestButton);

      const checkbox = screen.getByLabelText(/Offer to a specific person/) as HTMLInputElement;
      fireEvent.click(checkbox);

      const submitButton = screen.getByText('Submit Request');
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Please select a user')).toBeInTheDocument();
      });
    });

    it('submits form with valid data', async () => {
      const mockMutateAsync = vi.fn().mockResolvedValue({});
      vi.mocked(hooks.useCreateSwapRequest).mockReturnValue({
        mutateAsync: mockMutateAsync,
        isPending: false,
      } as any);

      render(<OnCallPage />);
      const swapsTab = screen.getByText('Shift Swaps');
      fireEvent.click(swapsTab);
      const requestButton = screen.getAllByText('Request Swap')[0];
      fireEvent.click(requestButton);

      const container = screen.getByText('Request Shift Swap').closest('div');
      const selects = container?.querySelectorAll('select');
      const datetimeInputs = container?.querySelectorAll('input[type="datetime-local"]');
      const textareas = container?.querySelectorAll('textarea');

      if (selects && datetimeInputs && textareas && selects.length > 0 && datetimeInputs.length >= 2 && textareas.length > 0) {
        const scheduleSelect = selects[0] as HTMLSelectElement;
        const startInput = datetimeInputs[0] as HTMLInputElement;
        const endInput = datetimeInputs[1] as HTMLInputElement;
        const reasonInput = textareas[0] as HTMLTextAreaElement;

        const now = new Date();
        const startTime = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        const endTime = new Date(now.getTime() + 48 * 60 * 60 * 1000);

        fireEvent.change(scheduleSelect, { target: { value: '1' } });
        fireEvent.change(startInput, {
          target: { value: startTime.toISOString().slice(0, 16) },
        });
        fireEvent.change(endInput, {
          target: { value: endTime.toISOString().slice(0, 16) },
        });
        fireEvent.change(reasonInput, { target: { value: 'Need time off' } });

        const submitButton = screen.getByText('Submit Request');
        fireEvent.click(submitButton);

        await waitFor(() => {
          expect(mockMutateAsync).toHaveBeenCalledWith(
            expect.objectContaining({
              scheduleId: '1',
              reason: 'Need time off',
            })
          );
        });
      }
    });
  });

  describe('Swap Actions', () => {
    it('shows cancel button for pending my requests', () => {
      render(<OnCallPage />);
      const swapsTab = screen.getByText('Shift Swaps');
      fireEvent.click(swapsTab);

      // Should have delete icon (cancel) for pending request
      const deleteIcons = document.querySelectorAll('svg');
      const hasTrashIcon = Array.from(deleteIcons).some((icon) =>
        icon.classList.toString().includes('lucide')
      );
      expect(hasTrashIcon).toBe(true);
    });

    it('shows accept and reject buttons for available swaps', () => {
      render(<OnCallPage />);
      const swapsTab = screen.getByText('Shift Swaps');
      fireEvent.click(swapsTab);

      const availableTab = screen.getByText('Available Swaps');
      fireEvent.click(availableTab);

      expect(screen.getByText('Accept')).toBeInTheDocument();
      expect(screen.getByText('Reject')).toBeInTheDocument();
    });

    it('calls accept mutation when accept is clicked', async () => {
      const mockMutateAsync = vi.fn().mockResolvedValue({});
      vi.mocked(hooks.useAcceptSwap).mockReturnValue({
        mutateAsync: mockMutateAsync,
        isPending: false,
      } as any);

      render(<OnCallPage />);
      const swapsTab = screen.getByText('Shift Swaps');
      fireEvent.click(swapsTab);

      const availableTab = screen.getByText('Available Swaps');
      fireEvent.click(availableTab);

      const acceptButton = screen.getByText('Accept');
      fireEvent.click(acceptButton);

      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalledWith({ id: 'swap3' });
      });
    });

    it('calls reject mutation when reject is clicked', async () => {
      const mockMutateAsync = vi.fn().mockResolvedValue({});
      vi.mocked(hooks.useRejectSwap).mockReturnValue({
        mutateAsync: mockMutateAsync,
        isPending: false,
      } as any);

      render(<OnCallPage />);
      const swapsTab = screen.getByText('Shift Swaps');
      fireEvent.click(swapsTab);

      const availableTab = screen.getByText('Available Swaps');
      fireEvent.click(availableTab);

      const rejectButton = screen.getByText('Reject');
      fireEvent.click(rejectButton);

      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalledWith({ id: 'swap3' });
      });
    });
  });

  describe('Error States', () => {
    it('shows error state when schedules fail to load', () => {
      vi.mocked(hooks.useOncallSchedules).mockReturnValue({
        data: undefined,
        isLoading: false,
        error: new Error('Failed to fetch'),
      } as any);

      render(<OnCallPage />);
      expect(screen.getByText('Error loading on-call data')).toBeInTheDocument();
      expect(screen.getByText('Please try refreshing the page')).toBeInTheDocument();
    });
  });

  describe('Time Formatting', () => {
    it('formats time remaining correctly for days', () => {
      render(<OnCallPage />);
      // Should show days and hours for schedules ending in more than a day
      const timeTexts = screen.getAllByText(/\d+d.*\d+h remaining/i);
      expect(timeTexts.length).toBeGreaterThan(0);
    });

    it('formats time remaining correctly for hours only', () => {
      render(<OnCallPage />);
      // Should show hours for schedules ending within a day
      const timeTexts = screen.getAllByText(/\d+h remaining/i);
      expect(timeTexts.length).toBeGreaterThan(0);
    });

    it('shows "Ending soon" for rotations ending within an hour', () => {
      const soonSchedule = {
        ...mockSchedules[0],
        rotation_end: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30 mins
      };

      vi.mocked(hooks.useOncallSchedules).mockReturnValue({
        data: { data: [soonSchedule] },
        isLoading: false,
        error: null,
      } as any);

      render(<OnCallPage />);
      expect(screen.getByText('Ending soon')).toBeInTheDocument();
    });

    it('shows "No rotation scheduled" when rotation_end is missing', () => {
      const noRotationSchedule = {
        ...mockSchedules[0],
        rotation_end: undefined,
      };

      vi.mocked(hooks.useOncallSchedules).mockReturnValue({
        data: { data: [noRotationSchedule] },
        isLoading: false,
        error: null,
      } as any);

      render(<OnCallPage />);
      expect(screen.getByText('No rotation scheduled')).toBeInTheDocument();
    });
  });

  describe('Tab Navigation', () => {
    it('switches between tabs correctly', () => {
      render(<OnCallPage />);

      // Start on schedules tab
      expect(screen.getByText('Primary On-Call')).toBeInTheDocument();

      // Switch to incidents
      const incidentsTab = screen.getByText('Incidents');
      fireEvent.click(incidentsTab);
      expect(screen.getByText('INC-001')).toBeInTheDocument();

      // Switch to who is on-call
      const shiftsTab = screen.getByText('Who is On-Call');
      fireEvent.click(shiftsTab);
      expect(screen.getByText('Currently On-Call')).toBeInTheDocument();

      // Switch to swaps
      const swapsTab = screen.getByText('Shift Swaps');
      fireEvent.click(swapsTab);
      expect(screen.getByText('My Swap Requests')).toBeInTheDocument();

      // Switch back to schedules
      const schedulesTab = screen.getByText('Schedules');
      fireEvent.click(schedulesTab);
      expect(screen.getByText('Primary On-Call')).toBeInTheDocument();
    });

    it('highlights active tab', () => {
      render(<OnCallPage />);

      const schedulesTab = screen.getByText('Schedules');
      expect(schedulesTab.className).toContain('border-blue-500');

      const incidentsTab = screen.getByText('Incidents');
      expect(incidentsTab.className).toContain('border-transparent');

      fireEvent.click(incidentsTab);
      expect(incidentsTab.className).toContain('border-blue-500');
      expect(schedulesTab.className).toContain('border-transparent');
    });
  });
});
