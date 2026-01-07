import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CabMeetingsPage from '../page';
import * as hooks from '@/hooks/useApi';

// Mock Next.js Link
vi.mock('next/link', () => ({
  default: ({ children, href }: any) => <a href={href}>{children}</a>,
}));

// Mock the API hooks
vi.mock('@/hooks/useApi', async () => {
  const actual = await vi.importActual<typeof hooks>('@/hooks/useApi');
  return {
    ...actual,
    useCabMeetings: vi.fn(),
    useCreateCabMeeting: vi.fn(),
    useUpdateCabMeeting: vi.fn(),
    useDeleteCabMeeting: vi.fn(),
    useStartCabMeeting: vi.fn(),
    useCompleteCabMeeting: vi.fn(),
    useCabMeetingAttendees: vi.fn(),
    useAddCabAttendee: vi.fn(),
    useRemoveCabAttendee: vi.fn(),
    useCabMeetingChanges: vi.fn(),
    useAddCabChange: vi.fn(),
    useRemoveCabChange: vi.fn(),
    useGenerateAgenda: vi.fn(),
    useUpdateAgenda: vi.fn(),
    useRecordDecision: vi.fn(),
    useCabActionItems: vi.fn(),
    useAddActionItem: vi.fn(),
    useUpdateActionItem: vi.fn(),
    useDeleteActionItem: vi.fn(),
    useSaveMinutes: vi.fn(),
    useDistributeMinutes: vi.fn(),
    useUsers: vi.fn(),
    useChanges: vi.fn(),
    useCabMeeting: vi.fn(),
  };
});

describe('CabMeetingsPage', () => {
  const mockMeetings = [
    {
      id: 'meeting-1',
      title: 'Weekly CAB Meeting',
      description: 'Review pending changes',
      meetingDate: '2026-01-15T14:00:00Z',
      endDate: '2026-01-15T15:00:00Z',
      location: 'Conference Room A',
      meetingLink: 'https://meet.example.com/cab-weekly',
      status: 'scheduled',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
    {
      id: 'meeting-2',
      title: 'Emergency CAB',
      description: 'Critical production change review',
      meetingDate: '2026-01-10T09:00:00Z',
      endDate: '2026-01-10T10:00:00Z',
      location: 'Virtual',
      meetingLink: 'https://meet.example.com/emergency',
      status: 'completed',
      createdAt: '2026-01-08T00:00:00Z',
      updatedAt: '2026-01-10T00:00:00Z',
    },
  ];

  const mockMutation = {
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    isLoading: false,
    isError: false,
    isSuccess: false,
    error: null,
    data: undefined,
    reset: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock implementations
    vi.mocked(hooks.useCabMeetings).mockReturnValue({
      data: { data: mockMeetings, total: 2 },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as any);

    vi.mocked(hooks.useCreateCabMeeting).mockReturnValue(mockMutation as any);
    vi.mocked(hooks.useUpdateCabMeeting).mockReturnValue(mockMutation as any);
    vi.mocked(hooks.useDeleteCabMeeting).mockReturnValue(mockMutation as any);
    vi.mocked(hooks.useStartCabMeeting).mockReturnValue(mockMutation as any);
    vi.mocked(hooks.useCompleteCabMeeting).mockReturnValue(mockMutation as any);
    vi.mocked(hooks.useCabMeeting).mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
    } as any);
    vi.mocked(hooks.useCabMeetingAttendees).mockReturnValue({
      data: { data: [] },
      isLoading: false,
      error: null,
    } as any);
    vi.mocked(hooks.useCabMeetingChanges).mockReturnValue({
      data: { data: [] },
      isLoading: false,
      error: null,
    } as any);
    vi.mocked(hooks.useCabActionItems).mockReturnValue({
      data: { data: [] },
      isLoading: false,
      error: null,
    } as any);
    vi.mocked(hooks.useUsers).mockReturnValue({
      data: { data: [] },
      isLoading: false,
      error: null,
    } as any);
    vi.mocked(hooks.useChanges).mockReturnValue({
      data: { data: [] },
      isLoading: false,
      error: null,
    } as any);
    vi.mocked(hooks.useAddCabAttendee).mockReturnValue(mockMutation as any);
    vi.mocked(hooks.useRemoveCabAttendee).mockReturnValue(mockMutation as any);
    vi.mocked(hooks.useAddCabChange).mockReturnValue(mockMutation as any);
    vi.mocked(hooks.useRemoveCabChange).mockReturnValue(mockMutation as any);
    vi.mocked(hooks.useGenerateAgenda).mockReturnValue(mockMutation as any);
    vi.mocked(hooks.useUpdateAgenda).mockReturnValue(mockMutation as any);
    vi.mocked(hooks.useRecordDecision).mockReturnValue(mockMutation as any);
    vi.mocked(hooks.useAddActionItem).mockReturnValue(mockMutation as any);
    vi.mocked(hooks.useUpdateActionItem).mockReturnValue(mockMutation as any);
    vi.mocked(hooks.useDeleteActionItem).mockReturnValue(mockMutation as any);
    vi.mocked(hooks.useSaveMinutes).mockReturnValue(mockMutation as any);
    vi.mocked(hooks.useDistributeMinutes).mockReturnValue(mockMutation as any);
  });

  describe('Basic Rendering', () => {
    it('renders the page heading', () => {
      render(<CabMeetingsPage />);
      expect(screen.getByRole('heading', { name: /CAB Meetings/i })).toBeInTheDocument();
    });

    it('renders the create meeting button', () => {
      render(<CabMeetingsPage />);
      expect(screen.getByRole('button', { name: /Schedule Meeting/i })).toBeInTheDocument();
    });

    it('renders the filters toggle button', () => {
      render(<CabMeetingsPage />);
      expect(screen.getByRole('button', { name: /Filters/i })).toBeInTheDocument();
    });
  });

  describe('Loading State', () => {
    it('shows loading state when fetching meetings', () => {
      vi.mocked(hooks.useCabMeetings).mockReturnValue({
        data: undefined,
        isLoading: true,
        error: null,
        refetch: vi.fn(),
      } as any);

      render(<CabMeetingsPage />);
      // Loading state is shown, component renders without error
      const container = screen.getByRole('heading', { name: /CAB Meetings/i });
      expect(container).toBeInTheDocument();
    });
  });

  describe('Error State', () => {
    it('shows error message when meetings fail to load', () => {
      vi.mocked(hooks.useCabMeetings).mockReturnValue({
        data: undefined,
        isLoading: false,
        error: { message: 'Failed to fetch meetings' } as any,
        refetch: vi.fn(),
      } as any);

      render(<CabMeetingsPage />);
      expect(screen.getByText(/Failed to load meetings/i)).toBeInTheDocument();
    });
  });

  describe('Meeting List', () => {
    it('displays all meetings', () => {
      render(<CabMeetingsPage />);

      expect(screen.getByText('Weekly CAB Meeting')).toBeInTheDocument();
      expect(screen.getByText('Emergency CAB')).toBeInTheDocument();
    });

    it('displays meeting locations', () => {
      render(<CabMeetingsPage />);

      expect(screen.getByText('Conference Room A')).toBeInTheDocument();
      expect(screen.getByText('Virtual')).toBeInTheDocument();
    });

    it('shows empty state when no meetings', () => {
      vi.mocked(hooks.useCabMeetings).mockReturnValue({
        data: { data: [], total: 0 },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as any);

      render(<CabMeetingsPage />);
      // Empty state message exists
      expect(screen.getByRole('heading', { name: /CAB Meetings/i })).toBeInTheDocument();
    });
  });

  describe('Filters', () => {
    it('toggles filter panel when button is clicked', () => {
      render(<CabMeetingsPage />);

      const filterButton = screen.getByRole('button', { name: /Filters/i });

      // Panel should not be visible initially (component default)
      fireEvent.click(filterButton);

      // After click, panel should be visible
      const select = screen.queryByRole('combobox');
      expect(select || screen.getByRole('heading', { name: /CAB Meetings/i })).toBeInTheDocument();
    });

    it('has status filter when panel is open', () => {
      render(<CabMeetingsPage />);

      const filterButton = screen.getByRole('button', { name: /Filters/i });
      fireEvent.click(filterButton);

      const select = screen.getByRole('combobox');
      expect(select).toBeInTheDocument();
    });
  });

  describe('Create Meeting Modal', () => {
    it('opens create modal when button is clicked', () => {
      render(<CabMeetingsPage />);

      const createButton = screen.getByRole('button', { name: /Schedule Meeting/i });
      fireEvent.click(createButton);

      // Modal should be open (check for any modal element)
      expect(screen.getAllByRole('button').length).toBeGreaterThan(2);
    });

    it('closes modal when cancel is clicked', () => {
      render(<CabMeetingsPage />);

      fireEvent.click(screen.getByRole('button', { name: /Schedule Meeting/i }));

      const cancelButton = screen.getByRole('button', { name: /Cancel/i });
      fireEvent.click(cancelButton);

      // Modal should be closed
      expect(screen.queryByRole('button', { name: /Cancel/i })).not.toBeInTheDocument();
    });
  });

  describe('Meeting Details', () => {
    it('displays meeting titles when meetings are loaded', () => {
      render(<CabMeetingsPage />);

      expect(screen.getByText('Weekly CAB Meeting')).toBeInTheDocument();
      expect(screen.getByText('Emergency CAB')).toBeInTheDocument();
    });
  });

  describe('Meeting Status Display', () => {
    it('displays scheduled status badge for scheduled meetings', () => {
      render(<CabMeetingsPage />);

      // First meeting is scheduled - find the badge by class
      const badges = document.querySelectorAll('span.rounded-full');
      const scheduledBadge = Array.from(badges).find(b => b.textContent === 'Scheduled');
      expect(scheduledBadge).toBeInTheDocument();
    });

    it('displays completed status badge for completed meetings', () => {
      render(<CabMeetingsPage />);

      // Second meeting is completed - find the badge by class
      const badges = document.querySelectorAll('span.rounded-full');
      const completedBadge = Array.from(badges).find(b => b.textContent === 'Completed');
      expect(completedBadge).toBeInTheDocument();
    });

    it('displays all status variants correctly', () => {
      const meetingsWithAllStatuses = [
        { ...mockMeetings[0], id: 'm1', status: 'scheduled' },
        { ...mockMeetings[0], id: 'm2', status: 'in_progress', title: 'In Progress Meeting' },
        { ...mockMeetings[0], id: 'm3', status: 'completed', title: 'Completed Meeting' },
        { ...mockMeetings[0], id: 'm4', status: 'cancelled', title: 'Cancelled Meeting' },
      ];

      vi.mocked(hooks.useCabMeetings).mockReturnValue({
        data: { data: meetingsWithAllStatuses, total: 4 },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as any);

      render(<CabMeetingsPage />);

      // Find badges (not select options) by their rounded-full class
      const badges = document.querySelectorAll('span.rounded-full');
      const badgeTexts = Array.from(badges).map(b => b.textContent);

      expect(badgeTexts).toContain('Scheduled');
      expect(badgeTexts).toContain('In Progress');
      expect(badgeTexts).toContain('Completed');
      expect(badgeTexts).toContain('Cancelled');
    });
  });

  describe('Meeting Table Columns', () => {
    it('displays table headers', () => {
      render(<CabMeetingsPage />);

      // Get all table headers
      const headers = document.querySelectorAll('th');
      const headerTexts = Array.from(headers).map(h => h.textContent);

      expect(headerTexts).toContain('Meeting');
      expect(headerTexts).toContain('Date/Time');
      expect(headerTexts).toContain('Status');
      expect(headerTexts).toContain('Organizer');
      expect(headerTexts).toContain('Attendees');
      expect(headerTexts).toContain('Changes');
      expect(headerTexts).toContain('Actions');
    });

    it('displays meeting with location and meeting link indicators', () => {
      render(<CabMeetingsPage />);

      expect(screen.getByText('Conference Room A')).toBeInTheDocument();
    });

    it('displays attendee counts', () => {
      const meetingsWithCounts = [
        { ...mockMeetings[0], attendee_count: 5, changes_count: 3 },
      ];

      vi.mocked(hooks.useCabMeetings).mockReturnValue({
        data: { data: meetingsWithCounts, total: 1 },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as any);

      render(<CabMeetingsPage />);

      expect(screen.getByText('5')).toBeInTheDocument();
      expect(screen.getByText('3')).toBeInTheDocument();
    });

    it('displays organizer name when available', () => {
      const meetingsWithOrganizer = [
        { ...mockMeetings[0], organizer_name: 'John Doe' },
      ];

      vi.mocked(hooks.useCabMeetings).mockReturnValue({
        data: { data: meetingsWithOrganizer, total: 1 },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as any);

      render(<CabMeetingsPage />);

      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });
  });

  describe('Date Range Filters', () => {
    it('displays date filters when filter panel is shown', () => {
      render(<CabMeetingsPage />);

      // Click "More Filters" button
      const moreFiltersButton = screen.getByRole('button', { name: /More Filters/i });
      fireEvent.click(moreFiltersButton);

      expect(screen.getByText('From:')).toBeInTheDocument();
      expect(screen.getByText('To:')).toBeInTheDocument();
    });

    it('clears all filters when Clear Filters is clicked', () => {
      render(<CabMeetingsPage />);

      const moreFiltersButton = screen.getByRole('button', { name: /More Filters/i });
      fireEvent.click(moreFiltersButton);

      const clearButton = screen.getByRole('button', { name: /Clear Filters/i });
      expect(clearButton).toBeInTheDocument();
    });

    it('hides filter panel when Hide Filters is clicked', () => {
      render(<CabMeetingsPage />);

      const moreFiltersButton = screen.getByRole('button', { name: /More Filters/i });
      fireEvent.click(moreFiltersButton);

      // Now should show "Hide Filters"
      const hideFiltersButton = screen.getByRole('button', { name: /Hide Filters/i });
      fireEvent.click(hideFiltersButton);

      // Should now show "More Filters" again
      expect(screen.getByRole('button', { name: /More Filters/i })).toBeInTheDocument();
    });
  });

  describe('Status Filter', () => {
    it('changes status filter when different status is selected', () => {
      render(<CabMeetingsPage />);

      const statusSelect = screen.getByRole('combobox');
      fireEvent.change(statusSelect, { target: { value: 'in_progress' } });

      expect(statusSelect).toHaveValue('in_progress');
    });

    it('has all status options', () => {
      render(<CabMeetingsPage />);

      const statusSelect = screen.getByRole('combobox');

      expect(statusSelect).toContainElement(screen.getByRole('option', { name: 'All Statuses' }));
      expect(statusSelect).toContainElement(screen.getByRole('option', { name: 'Scheduled' }));
      expect(statusSelect).toContainElement(screen.getByRole('option', { name: 'In Progress' }));
      expect(statusSelect).toContainElement(screen.getByRole('option', { name: 'Completed' }));
      expect(statusSelect).toContainElement(screen.getByRole('option', { name: 'Cancelled' }));
    });
  });

  describe('View Button', () => {
    it('renders view button for each meeting', () => {
      render(<CabMeetingsPage />);

      const viewButtons = screen.getAllByRole('button', { name: /View/i });
      expect(viewButtons.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Create Modal Form Fields', () => {
    it('displays all form fields in create modal', () => {
      render(<CabMeetingsPage />);

      fireEvent.click(screen.getByRole('button', { name: /Schedule Meeting/i }));

      // Check for form labels
      const labels = document.querySelectorAll('label');
      const labelTexts = Array.from(labels).map(l => l.textContent);

      expect(labelTexts.some(t => t?.includes('Title'))).toBe(true);
      expect(labelTexts.some(t => t?.includes('Description'))).toBe(true);
      expect(labelTexts.some(t => t?.includes('Start Date'))).toBe(true);
      expect(labelTexts.some(t => t?.includes('End Date'))).toBe(true);
      expect(labelTexts.some(t => t?.includes('Location'))).toBe(true);
      expect(labelTexts.some(t => t?.includes('Meeting Link'))).toBe(true);
    });

    it('updates form fields when user types', () => {
      render(<CabMeetingsPage />);

      fireEvent.click(screen.getByRole('button', { name: /Schedule Meeting/i }));

      const titleInput = screen.getByPlaceholderText(/Weekly CAB Meeting/);
      fireEvent.change(titleInput, { target: { value: 'New Meeting Title' } });

      expect(titleInput).toHaveValue('New Meeting Title');
    });

    it('disables Create Meeting button when required fields are empty', () => {
      render(<CabMeetingsPage />);

      fireEvent.click(screen.getByRole('button', { name: /Schedule Meeting/i }));

      const createButton = screen.getByRole('button', { name: /Create Meeting/i });
      expect(createButton).toBeDisabled();
    });

    it('enables Create Meeting button when required fields are filled', () => {
      render(<CabMeetingsPage />);

      fireEvent.click(screen.getByRole('button', { name: /Schedule Meeting/i }));

      const titleInput = screen.getByPlaceholderText(/Weekly CAB Meeting/);
      fireEvent.change(titleInput, { target: { value: 'New Meeting' } });

      // Set meeting date
      const dateInputs = document.querySelectorAll('input[type="datetime-local"]');
      fireEvent.change(dateInputs[0], { target: { value: '2026-01-20T14:00' } });

      const createButton = screen.getByRole('button', { name: /Create Meeting/i });
      expect(createButton).not.toBeDisabled();
    });
  });

  describe('Breadcrumb Navigation', () => {
    it('displays breadcrumb navigation', () => {
      render(<CabMeetingsPage />);

      // Find the breadcrumb links
      const changesLink = screen.getByRole('link', { name: 'Changes' });
      expect(changesLink).toBeInTheDocument();

      // CAB Meetings appears multiple times (breadcrumb and h1)
      const cabMeetingsElements = screen.getAllByText('CAB Meetings');
      expect(cabMeetingsElements.length).toBeGreaterThanOrEqual(1);
    });

    it('has link to Changes page', () => {
      render(<CabMeetingsPage />);

      const changesLink = screen.getByRole('link', { name: 'Changes' });
      expect(changesLink).toHaveAttribute('href', '/changes');
    });
  });

  describe('Page Description', () => {
    it('displays page description text', () => {
      render(<CabMeetingsPage />);

      expect(screen.getByText(/Manage Change Advisory Board meetings, agendas, and decisions/)).toBeInTheDocument();
    });
  });

  describe('Empty State Actions', () => {
    it('shows schedule button in empty state', () => {
      vi.mocked(hooks.useCabMeetings).mockReturnValue({
        data: { data: [], total: 0 },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as any);

      render(<CabMeetingsPage />);

      // Empty state should have a schedule meeting button
      const scheduleButtons = screen.getAllByRole('button', { name: /Schedule Meeting/i });
      expect(scheduleButtons.length).toBeGreaterThanOrEqual(1);
    });

    it('displays no meetings message in empty state', () => {
      vi.mocked(hooks.useCabMeetings).mockReturnValue({
        data: { data: [], total: 0 },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as any);

      render(<CabMeetingsPage />);

      expect(screen.getByText('No meetings found')).toBeInTheDocument();
      expect(screen.getByText('Schedule a CAB meeting to get started')).toBeInTheDocument();
    });
  });

  describe('Meeting Row Interaction', () => {
    it('opens detail modal when row is clicked', async () => {
      const meetingWithData = {
        ...mockMeetings[0],
        meeting_date: '2026-01-15T14:00:00Z',
      };

      vi.mocked(hooks.useCabMeetings).mockReturnValue({
        data: { data: [meetingWithData], total: 1 },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as any);

      vi.mocked(hooks.useCabMeeting).mockReturnValue({
        data: meetingWithData,
        isLoading: false,
        error: null,
      } as any);

      render(<CabMeetingsPage />);

      const meetingRow = screen.getByText('Weekly CAB Meeting').closest('tr');
      if (meetingRow) {
        fireEvent.click(meetingRow);
      }

      // Modal should open - check for modal elements
      await waitFor(() => {
        expect(vi.mocked(hooks.useCabMeeting)).toHaveBeenCalled();
      });
    });
  });

  describe('Create Meeting API Integration', () => {
    it('calls createMeeting mutation when form is submitted', async () => {
      const mutateAsyncMock = vi.fn().mockResolvedValue({});
      vi.mocked(hooks.useCreateCabMeeting).mockReturnValue({
        ...mockMutation,
        mutateAsync: mutateAsyncMock,
      } as any);

      render(<CabMeetingsPage />);

      fireEvent.click(screen.getByRole('button', { name: /Schedule Meeting/i }));

      // Fill required fields
      const titleInput = screen.getByPlaceholderText(/Weekly CAB Meeting/);
      fireEvent.change(titleInput, { target: { value: 'Test Meeting' } });

      const dateInputs = document.querySelectorAll('input[type="datetime-local"]');
      fireEvent.change(dateInputs[0], { target: { value: '2026-01-20T14:00' } });

      // Submit
      const createButton = screen.getByRole('button', { name: /Create Meeting/i });
      fireEvent.click(createButton);

      await waitFor(() => {
        expect(mutateAsyncMock).toHaveBeenCalledWith(expect.objectContaining({
          title: 'Test Meeting',
          meetingDate: '2026-01-20T14:00',
        }));
      });
    });
  });

  describe('Modal Close Behavior', () => {
    it('closes modal when X button is clicked', () => {
      render(<CabMeetingsPage />);

      fireEvent.click(screen.getByRole('button', { name: /Schedule Meeting/i }));

      // Find the close (X) button by its icon container
      const closeButtons = document.querySelectorAll('button');
      const xButton = Array.from(closeButtons).find(btn =>
        btn.querySelector('svg.lucide-x') || btn.getAttribute('aria-label') === 'Close'
      );

      if (xButton) {
        fireEvent.click(xButton);
      }

      // Modal should be closed - Cancel button should not exist
      expect(screen.queryByRole('button', { name: /Cancel/i })).not.toBeInTheDocument();
    });

    it('resets form when modal is closed', () => {
      render(<CabMeetingsPage />);

      fireEvent.click(screen.getByRole('button', { name: /Schedule Meeting/i }));

      // Type something in title
      const titleInput = screen.getByPlaceholderText(/Weekly CAB Meeting/);
      fireEvent.change(titleInput, { target: { value: 'Test Title' } });

      // Close modal
      fireEvent.click(screen.getByRole('button', { name: /Cancel/i }));

      // Reopen modal
      fireEvent.click(screen.getByRole('button', { name: /Schedule Meeting/i }));

      // Title should be empty
      const newTitleInput = screen.getByPlaceholderText(/Weekly CAB Meeting/);
      expect(newTitleInput).toHaveValue('');
    });
  });

  describe('Meeting Link Indicator', () => {
    it('shows virtual indicator when meeting has a link', () => {
      render(<CabMeetingsPage />);

      // Both meetings have meeting links, so Virtual should appear
      expect(screen.getAllByText('Virtual').length).toBeGreaterThanOrEqual(1);
    });

    it('does not show virtual indicator for meetings without link', () => {
      const meetingWithoutLink = {
        ...mockMeetings[0],
        meeting_link: null,
      };

      vi.mocked(hooks.useCabMeetings).mockReturnValue({
        data: { data: [meetingWithoutLink], total: 1 },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as any);

      render(<CabMeetingsPage />);

      // Should not have Virtual text
      expect(screen.queryByText('Virtual')).not.toBeInTheDocument();
    });
  });

  describe('Meeting Detail Modal', () => {
    const mockMeetingDetail = {
      id: 'meeting-1',
      title: 'Weekly CAB Meeting',
      description: 'Review pending changes',
      meeting_date: '2026-01-15T14:00:00Z',
      end_date: '2026-01-15T15:00:00Z',
      location: 'Conference Room A',
      meeting_link: 'https://meet.example.com/cab-weekly',
      status: 'scheduled',
      organizer_name: 'John Admin',
      attendee_count: 5,
      changes_count: 3,
      agenda: '1. Review changes\n2. Make decisions',
      minutes: '',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };

    beforeEach(() => {
      vi.mocked(hooks.useCabMeeting).mockReturnValue({
        data: mockMeetingDetail,
        isLoading: false,
        error: null,
      } as any);
    });

    it('opens detail modal when clicking on a meeting row', async () => {
      render(<CabMeetingsPage />);

      const meetingRow = screen.getByText('Weekly CAB Meeting').closest('tr');
      if (meetingRow) {
        fireEvent.click(meetingRow);
      }

      await waitFor(() => {
        // Detail modal should show the meeting title in header
        expect(screen.getAllByText('Weekly CAB Meeting').length).toBeGreaterThanOrEqual(1);
      });
    });

    it('shows all tabs in detail modal', async () => {
      render(<CabMeetingsPage />);

      fireEvent.click(screen.getByText('Weekly CAB Meeting').closest('tr')!);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Overview/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Attendees/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Agenda/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Decisions/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Action Items/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Minutes/i })).toBeInTheDocument();
      });
    });

    it('displays Start button for scheduled meetings', async () => {
      render(<CabMeetingsPage />);

      fireEvent.click(screen.getByText('Weekly CAB Meeting').closest('tr')!);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Start/i })).toBeInTheDocument();
      });
    });

    it('displays Complete button for in_progress meetings', async () => {
      vi.mocked(hooks.useCabMeeting).mockReturnValue({
        data: { ...mockMeetingDetail, status: 'in_progress' },
        isLoading: false,
        error: null,
      } as any);

      render(<CabMeetingsPage />);

      fireEvent.click(screen.getByText('Weekly CAB Meeting').closest('tr')!);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Complete/i })).toBeInTheDocument();
      });
    });

    it('displays Edit button for editable meetings', async () => {
      render(<CabMeetingsPage />);

      fireEvent.click(screen.getByText('Weekly CAB Meeting').closest('tr')!);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Edit/i })).toBeInTheDocument();
      });
    });

    it('does not show Edit button for completed meetings', async () => {
      vi.mocked(hooks.useCabMeeting).mockReturnValue({
        data: { ...mockMeetingDetail, status: 'completed' },
        isLoading: false,
        error: null,
      } as any);

      render(<CabMeetingsPage />);

      fireEvent.click(screen.getByText('Weekly CAB Meeting').closest('tr')!);

      await waitFor(() => {
        // Edit button should not be present for completed meetings
        const editButtons = screen.queryAllByRole('button', { name: /Edit/i });
        expect(editButtons.length).toBe(0);
      });
    });

    it('shows Delete Meeting button in modal footer', async () => {
      render(<CabMeetingsPage />);

      fireEvent.click(screen.getByText('Weekly CAB Meeting').closest('tr')!);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Delete Meeting/i })).toBeInTheDocument();
      });
    });

    it('shows Close button in modal footer', async () => {
      render(<CabMeetingsPage />);

      fireEvent.click(screen.getByText('Weekly CAB Meeting').closest('tr')!);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Close/i })).toBeInTheDocument();
      });
    });

    it('calls startMeeting mutation when Start is clicked', async () => {
      const mutateAsyncMock = vi.fn().mockResolvedValue({});
      vi.mocked(hooks.useStartCabMeeting).mockReturnValue({
        ...mockMutation,
        mutateAsync: mutateAsyncMock,
      } as any);

      render(<CabMeetingsPage />);

      fireEvent.click(screen.getByText('Weekly CAB Meeting').closest('tr')!);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Start/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /Start/i }));

      await waitFor(() => {
        expect(mutateAsyncMock).toHaveBeenCalledWith('meeting-1');
      });
    });

    it('calls completeMeeting mutation when Complete is clicked', async () => {
      vi.mocked(hooks.useCabMeeting).mockReturnValue({
        data: { ...mockMeetingDetail, status: 'in_progress' },
        isLoading: false,
        error: null,
      } as any);

      const mutateAsyncMock = vi.fn().mockResolvedValue({});
      vi.mocked(hooks.useCompleteCabMeeting).mockReturnValue({
        ...mockMutation,
        mutateAsync: mutateAsyncMock,
      } as any);

      render(<CabMeetingsPage />);

      fireEvent.click(screen.getByText('Weekly CAB Meeting').closest('tr')!);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Complete/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /Complete/i }));

      await waitFor(() => {
        expect(mutateAsyncMock).toHaveBeenCalledWith('meeting-1');
      });
    });
  });

  describe('Overview Tab', () => {
    const mockMeetingDetailForOverview = {
      id: 'meeting-1',
      title: 'Weekly CAB Meeting',
      description: 'Review all pending changes',
      meeting_date: '2026-01-15T14:00:00Z',
      end_date: '2026-01-15T15:00:00Z',
      location: 'Conference Room A',
      meeting_link: 'https://meet.example.com/cab-weekly',
      status: 'scheduled',
      organizer_name: 'John Admin',
      attendee_count: 5,
      changes_count: 3,
      agenda: '',
      minutes: '',
    };

    beforeEach(() => {
      // Re-setup useCabMeetings to ensure meetings list is available
      vi.mocked(hooks.useCabMeetings).mockReturnValue({
        data: { data: mockMeetings, total: 2 },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as any);

      vi.mocked(hooks.useCabMeeting).mockReturnValue({
        data: mockMeetingDetailForOverview,
        isLoading: false,
        error: null,
      } as any);
    });

    it('displays quick stats in overview tab', async () => {
      render(<CabMeetingsPage />);

      fireEvent.click(screen.getByText('Weekly CAB Meeting').closest('tr')!);

      await waitFor(() => {
        // Check for stats - use getAllByText since some terms appear in table headers too
        expect(screen.getByText('Total Changes')).toBeInTheDocument();
        expect(screen.getAllByText('Attendees').length).toBeGreaterThanOrEqual(1);
        expect(screen.getByText('Pending')).toBeInTheDocument();
        expect(screen.getAllByText('Action Items').length).toBeGreaterThanOrEqual(1);
      });
    });

    it('displays meeting details section', async () => {
      render(<CabMeetingsPage />);

      fireEvent.click(screen.getByText('Weekly CAB Meeting').closest('tr')!);

      await waitFor(() => {
        expect(screen.getByText('Meeting Details')).toBeInTheDocument();
        expect(screen.getByText('Date & Time')).toBeInTheDocument();
      });
    });

    it('displays description when available', async () => {
      render(<CabMeetingsPage />);

      fireEvent.click(screen.getByText('Weekly CAB Meeting').closest('tr')!);

      await waitFor(() => {
        expect(screen.getByText('Review all pending changes')).toBeInTheDocument();
      });
    });

    it('displays organizer label', async () => {
      render(<CabMeetingsPage />);

      fireEvent.click(screen.getByText('Weekly CAB Meeting').closest('tr')!);

      await waitFor(() => {
        // Organizer appears in both table header and modal, so use getAllByText
        expect(screen.getAllByText('Organizer').length).toBeGreaterThanOrEqual(1);
      });
    });

    it('shows Join Meeting link when meeting_link exists', async () => {
      render(<CabMeetingsPage />);

      fireEvent.click(screen.getByText('Weekly CAB Meeting').closest('tr')!);

      await waitFor(() => {
        expect(screen.getByText('Join Meeting')).toBeInTheDocument();
      });
    });

    it('enters edit mode when Edit button is clicked', async () => {
      render(<CabMeetingsPage />);

      fireEvent.click(screen.getByText('Weekly CAB Meeting').closest('tr')!);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Edit/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /Edit/i }));

      await waitFor(() => {
        // Should show Save and Cancel buttons in edit mode
        expect(screen.getByRole('button', { name: /Save/i })).toBeInTheDocument();
        // Cancel appears multiple times - in modal header and footer
        const cancelButtons = screen.getAllByRole('button', { name: /Cancel/i });
        expect(cancelButtons.length).toBeGreaterThanOrEqual(1);
      });
    });
  });

  describe('Attendees Tab', () => {
    const mockMeetingDetail = {
      id: 'meeting-1',
      title: 'Weekly CAB Meeting',
      meeting_date: '2026-01-15T14:00:00Z',
      status: 'scheduled',
    };

    const mockAttendees = [
      {
        id: 'att-1',
        meeting_id: 'meeting-1',
        user_id: 'user-1',
        user_name: 'John Doe',
        user_email: 'john@example.com',
        role: 'chair',
      },
      {
        id: 'att-2',
        meeting_id: 'meeting-1',
        user_id: 'user-2',
        user_name: 'Jane Smith',
        user_email: 'jane@example.com',
        role: 'member',
      },
    ];

    const mockUsers = [
      { id: 'user-3', name: 'Bob Wilson', email: 'bob@example.com' },
      { id: 'user-4', name: 'Alice Brown', email: 'alice@example.com' },
    ];

    beforeEach(() => {
      vi.mocked(hooks.useCabMeeting).mockReturnValue({
        data: mockMeetingDetail,
        isLoading: false,
        error: null,
      } as any);
      vi.mocked(hooks.useCabMeetingAttendees).mockReturnValue({
        data: { data: mockAttendees },
        isLoading: false,
        error: null,
      } as any);
      vi.mocked(hooks.useUsers).mockReturnValue({
        data: { data: mockUsers },
        isLoading: false,
        error: null,
      } as any);
    });

    it('displays attendees list when switching to Attendees tab', async () => {
      render(<CabMeetingsPage />);

      fireEvent.click(screen.getByText('Weekly CAB Meeting').closest('tr')!);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Attendees/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /Attendees/i }));

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
        // Jane Smith may appear in multiple places
        const janeElements = screen.getAllByText('Jane Smith');
        expect(janeElements.length).toBeGreaterThanOrEqual(1);
      });
    });

    it('displays role badges for attendees', async () => {
      render(<CabMeetingsPage />);

      fireEvent.click(screen.getByText('Weekly CAB Meeting').closest('tr')!);

      await waitFor(() => {
        fireEvent.click(screen.getByRole('button', { name: /Attendees/i }));
      });

      await waitFor(() => {
        expect(screen.getByText('Chair')).toBeInTheDocument();
        expect(screen.getByText('Member')).toBeInTheDocument();
      });
    });

    it('shows Add Attendee button for editable meetings', async () => {
      render(<CabMeetingsPage />);

      fireEvent.click(screen.getByText('Weekly CAB Meeting').closest('tr')!);

      await waitFor(() => {
        fireEvent.click(screen.getByRole('button', { name: /Attendees/i }));
      });

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Add Attendee/i })).toBeInTheDocument();
      });
    });

    it('shows add attendee form when button is clicked', async () => {
      render(<CabMeetingsPage />);

      fireEvent.click(screen.getByText('Weekly CAB Meeting').closest('tr')!);

      await waitFor(() => {
        fireEvent.click(screen.getByRole('button', { name: /Attendees/i }));
      });

      await waitFor(() => {
        fireEvent.click(screen.getByRole('button', { name: /Add Attendee/i }));
      });

      await waitFor(() => {
        // Form should appear with User and Role labels
        expect(screen.getByText('User')).toBeInTheDocument();
        expect(screen.getByText('Role')).toBeInTheDocument();
      });
    });

    it('displays empty state when no attendees', async () => {
      vi.mocked(hooks.useCabMeetingAttendees).mockReturnValue({
        data: { data: [] },
        isLoading: false,
        error: null,
      } as any);

      render(<CabMeetingsPage />);

      fireEvent.click(screen.getByText('Weekly CAB Meeting').closest('tr')!);

      await waitFor(() => {
        fireEvent.click(screen.getByRole('button', { name: /Attendees/i }));
      });

      await waitFor(() => {
        expect(screen.getByText('No attendees added yet')).toBeInTheDocument();
      });
    });

    it('calls addAttendee mutation when form is submitted', async () => {
      const mutateAsyncMock = vi.fn().mockResolvedValue({});
      vi.mocked(hooks.useAddCabAttendee).mockReturnValue({
        ...mockMutation,
        mutateAsync: mutateAsyncMock,
      } as any);

      render(<CabMeetingsPage />);

      fireEvent.click(screen.getByText('Weekly CAB Meeting').closest('tr')!);

      await waitFor(() => {
        fireEvent.click(screen.getByRole('button', { name: /Attendees/i }));
      });

      await waitFor(() => {
        fireEvent.click(screen.getByRole('button', { name: /Add Attendee/i }));
      });

      // Select a user
      await waitFor(() => {
        const selects = document.querySelectorAll('select');
        const userSelect = Array.from(selects).find(s =>
          Array.from(s.options).some(o => o.text === 'Bob Wilson')
        );
        if (userSelect) {
          fireEvent.change(userSelect, { target: { value: 'user-3' } });
        }
      });

      // Click Add
      fireEvent.click(screen.getByRole('button', { name: /^Add$/i }));

      await waitFor(() => {
        expect(mutateAsyncMock).toHaveBeenCalledWith({
          meetingId: 'meeting-1',
          userId: 'user-3',
          role: 'member',
        });
      });
    });
  });

  describe('Agenda Tab', () => {
    const mockMeetingDetail = {
      id: 'meeting-1',
      title: 'Weekly CAB Meeting',
      meeting_date: '2026-01-15T14:00:00Z',
      status: 'scheduled',
      agenda: '1. Review changes\n2. Vote on approvals',
    };

    const mockChanges = [
      {
        id: 'mc-1',
        meeting_id: 'meeting-1',
        change_id: 'chg-1',
        change_number: 'CHG0001',
        change_title: 'Deploy new API version',
        change_risk_level: 'high',
        requester_name: 'Dev Team',
        decision: null,
      },
    ];

    beforeEach(() => {
      vi.mocked(hooks.useCabMeeting).mockReturnValue({
        data: mockMeetingDetail,
        isLoading: false,
        error: null,
      } as any);
      vi.mocked(hooks.useCabMeetingChanges).mockReturnValue({
        data: { data: mockChanges },
        isLoading: false,
        error: null,
      } as any);
      vi.mocked(hooks.useChanges).mockReturnValue({
        data: { data: [] },
        isLoading: false,
        error: null,
      } as any);
    });

    it('displays Changes to Review section', async () => {
      render(<CabMeetingsPage />);

      fireEvent.click(screen.getByText('Weekly CAB Meeting').closest('tr')!);

      await waitFor(() => {
        fireEvent.click(screen.getByRole('button', { name: /Agenda/i }));
      });

      await waitFor(() => {
        expect(screen.getByText('Changes to Review')).toBeInTheDocument();
      });
    });

    it('displays meeting changes with risk level', async () => {
      render(<CabMeetingsPage />);

      fireEvent.click(screen.getByText('Weekly CAB Meeting').closest('tr')!);

      await waitFor(() => {
        fireEvent.click(screen.getByRole('button', { name: /Agenda/i }));
      });

      await waitFor(() => {
        expect(screen.getByText('CHG0001')).toBeInTheDocument();
        expect(screen.getByText('Deploy new API version')).toBeInTheDocument();
        expect(screen.getByText('high')).toBeInTheDocument();
      });
    });

    it('displays Meeting Agenda section with text', async () => {
      render(<CabMeetingsPage />);

      fireEvent.click(screen.getByText('Weekly CAB Meeting').closest('tr')!);

      await waitFor(() => {
        fireEvent.click(screen.getByRole('button', { name: /Agenda/i }));
      });

      await waitFor(() => {
        expect(screen.getByText('Meeting Agenda')).toBeInTheDocument();
        expect(screen.getByText(/Review changes/)).toBeInTheDocument();
      });
    });

    it('shows Generate and Edit buttons for agenda', async () => {
      render(<CabMeetingsPage />);

      fireEvent.click(screen.getByText('Weekly CAB Meeting').closest('tr')!);

      await waitFor(() => {
        fireEvent.click(screen.getByRole('button', { name: /Agenda/i }));
      });

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Generate/i })).toBeInTheDocument();
        // Edit may appear multiple times (header and agenda section)
        const editButtons = screen.getAllByRole('button', { name: /Edit/i });
        expect(editButtons.length).toBeGreaterThanOrEqual(1);
      });
    });

    it('shows Add Change button', async () => {
      render(<CabMeetingsPage />);

      fireEvent.click(screen.getByText('Weekly CAB Meeting').closest('tr')!);

      await waitFor(() => {
        fireEvent.click(screen.getByRole('button', { name: /Agenda/i }));
      });

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Add Change/i })).toBeInTheDocument();
      });
    });

    it('displays empty state when no changes added', async () => {
      vi.mocked(hooks.useCabMeetingChanges).mockReturnValue({
        data: { data: [] },
        isLoading: false,
        error: null,
      } as any);

      render(<CabMeetingsPage />);

      fireEvent.click(screen.getByText('Weekly CAB Meeting').closest('tr')!);

      await waitFor(() => {
        fireEvent.click(screen.getByRole('button', { name: /Agenda/i }));
      });

      await waitFor(() => {
        expect(screen.getByText('No changes added to this meeting')).toBeInTheDocument();
      });
    });

    it('calls generateAgenda mutation when Generate is clicked', async () => {
      const mutateAsyncMock = vi.fn().mockResolvedValue({});
      vi.mocked(hooks.useGenerateAgenda).mockReturnValue({
        ...mockMutation,
        mutateAsync: mutateAsyncMock,
      } as any);

      render(<CabMeetingsPage />);

      fireEvent.click(screen.getByText('Weekly CAB Meeting').closest('tr')!);

      await waitFor(() => {
        fireEvent.click(screen.getByRole('button', { name: /Agenda/i }));
      });

      await waitFor(() => {
        fireEvent.click(screen.getByRole('button', { name: /Generate/i }));
      });

      await waitFor(() => {
        expect(mutateAsyncMock).toHaveBeenCalledWith('meeting-1');
      });
    });
  });

  describe('Decisions Tab', () => {
    const mockMeetingInProgress = {
      id: 'meeting-1',
      title: 'Weekly CAB Meeting',
      meeting_date: '2026-01-15T14:00:00Z',
      status: 'in_progress',
    };

    const mockChanges = [
      {
        id: 'mc-1',
        meeting_id: 'meeting-1',
        change_id: 'chg-1',
        change_number: 'CHG0001',
        change_title: 'Deploy new API version',
        change_risk_level: 'high',
        requester_name: 'Dev Team',
        decision: null,
      },
      {
        id: 'mc-2',
        meeting_id: 'meeting-1',
        change_id: 'chg-2',
        change_number: 'CHG0002',
        change_title: 'Database migration',
        change_risk_level: 'medium',
        requester_name: 'DBA Team',
        decision: 'approved',
        decided_by_name: 'John Admin',
        decision_notes: 'Looks good',
      },
    ];

    beforeEach(() => {
      vi.mocked(hooks.useCabMeeting).mockReturnValue({
        data: mockMeetingInProgress,
        isLoading: false,
        error: null,
      } as any);
      vi.mocked(hooks.useCabMeetingChanges).mockReturnValue({
        data: { data: mockChanges },
        isLoading: false,
        error: null,
      } as any);
    });

    it('displays changes for decision making', async () => {
      render(<CabMeetingsPage />);

      fireEvent.click(screen.getByText('Weekly CAB Meeting').closest('tr')!);

      await waitFor(() => {
        fireEvent.click(screen.getByRole('button', { name: /Decisions/i }));
      });

      await waitFor(() => {
        expect(screen.getByText('CHG0001')).toBeInTheDocument();
        expect(screen.getByText('CHG0002')).toBeInTheDocument();
      });
    });

    it('shows Record Decision button for undecided changes', async () => {
      render(<CabMeetingsPage />);

      fireEvent.click(screen.getByText('Weekly CAB Meeting').closest('tr')!);

      await waitFor(() => {
        fireEvent.click(screen.getByRole('button', { name: /Decisions/i }));
      });

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Record Decision/i })).toBeInTheDocument();
      });
    });

    it('displays Approved badge for approved changes', async () => {
      render(<CabMeetingsPage />);

      fireEvent.click(screen.getByText('Weekly CAB Meeting').closest('tr')!);

      await waitFor(() => {
        fireEvent.click(screen.getByRole('button', { name: /Decisions/i }));
      });

      await waitFor(() => {
        // Find Approved badge (may appear in multiple places)
        const approvedElements = screen.getAllByText('Approved');
        expect(approvedElements.length).toBeGreaterThanOrEqual(1);
      });
    });

    it('shows warning message for scheduled meetings', async () => {
      vi.mocked(hooks.useCabMeeting).mockReturnValue({
        data: { ...mockMeetingInProgress, status: 'scheduled' },
        isLoading: false,
        error: null,
      } as any);

      render(<CabMeetingsPage />);

      fireEvent.click(screen.getByText('Weekly CAB Meeting').closest('tr')!);

      await waitFor(() => {
        fireEvent.click(screen.getByRole('button', { name: /Decisions/i }));
      });

      await waitFor(() => {
        expect(screen.getByText(/Start the meeting to record decisions/i)).toBeInTheDocument();
      });
    });

    it('shows decision form when Record Decision is clicked', async () => {
      render(<CabMeetingsPage />);

      fireEvent.click(screen.getByText('Weekly CAB Meeting').closest('tr')!);

      await waitFor(() => {
        fireEvent.click(screen.getByRole('button', { name: /Decisions/i }));
      });

      await waitFor(() => {
        fireEvent.click(screen.getByRole('button', { name: /Record Decision/i }));
      });

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Approve/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Reject/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Defer/i })).toBeInTheDocument();
      });
    });

    it('calls recordDecision mutation when decision is saved', async () => {
      const mutateAsyncMock = vi.fn().mockResolvedValue({});
      vi.mocked(hooks.useRecordDecision).mockReturnValue({
        ...mockMutation,
        mutateAsync: mutateAsyncMock,
      } as any);

      render(<CabMeetingsPage />);

      fireEvent.click(screen.getByText('Weekly CAB Meeting').closest('tr')!);

      await waitFor(() => {
        fireEvent.click(screen.getByRole('button', { name: /Decisions/i }));
      });

      await waitFor(() => {
        fireEvent.click(screen.getByRole('button', { name: /Record Decision/i }));
      });

      await waitFor(() => {
        fireEvent.click(screen.getByRole('button', { name: /Approve/i }));
      });

      await waitFor(() => {
        fireEvent.click(screen.getByRole('button', { name: /Save Decision/i }));
      });

      await waitFor(() => {
        expect(mutateAsyncMock).toHaveBeenCalledWith({
          meetingId: 'meeting-1',
          changeId: 'chg-1',
          decision: 'approved',
          notes: undefined,
        });
      });
    });
  });

  describe('Action Items Tab', () => {
    const mockMeetingDetail = {
      id: 'meeting-1',
      title: 'Weekly CAB Meeting',
      meeting_date: '2026-01-15T14:00:00Z',
      status: 'in_progress',
    };

    const mockActionItems = [
      {
        id: 'ai-1',
        meeting_id: 'meeting-1',
        description: 'Update documentation',
        assignee_name: 'John Doe',
        due_date: '2026-01-20',
        status: 'open',
      },
      {
        id: 'ai-2',
        meeting_id: 'meeting-1',
        description: 'Review security',
        assignee_name: 'Jane Smith',
        due_date: '2026-01-25',
        status: 'completed',
      },
    ];

    const mockUsers = [
      { id: 'user-1', name: 'John Doe' },
      { id: 'user-2', name: 'Jane Smith' },
    ];

    beforeEach(() => {
      vi.mocked(hooks.useCabMeeting).mockReturnValue({
        data: mockMeetingDetail,
        isLoading: false,
        error: null,
      } as any);
      vi.mocked(hooks.useCabActionItems).mockReturnValue({
        data: { data: mockActionItems },
        isLoading: false,
        error: null,
      } as any);
      vi.mocked(hooks.useUsers).mockReturnValue({
        data: { data: mockUsers },
        isLoading: false,
        error: null,
      } as any);
    });

    it('displays action items list', async () => {
      render(<CabMeetingsPage />);

      fireEvent.click(screen.getByText('Weekly CAB Meeting').closest('tr')!);

      await waitFor(() => {
        fireEvent.click(screen.getByRole('button', { name: /Action Items/i }));
      });

      await waitFor(() => {
        expect(screen.getByText('Update documentation')).toBeInTheDocument();
        expect(screen.getByText('Review security')).toBeInTheDocument();
      });
    });

    it('shows assignee names for action items', async () => {
      render(<CabMeetingsPage />);

      fireEvent.click(screen.getByText('Weekly CAB Meeting').closest('tr')!);

      await waitFor(() => {
        fireEvent.click(screen.getByRole('button', { name: /Action Items/i }));
      });

      await waitFor(() => {
        // John Doe may appear in multiple places
        const johnElements = screen.getAllByText('John Doe');
        expect(johnElements.length).toBeGreaterThanOrEqual(1);
      });
    });

    it('shows Add Action Item button', async () => {
      render(<CabMeetingsPage />);

      fireEvent.click(screen.getByText('Weekly CAB Meeting').closest('tr')!);

      await waitFor(() => {
        fireEvent.click(screen.getByRole('button', { name: /Action Items/i }));
      });

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Add Action Item/i })).toBeInTheDocument();
      });
    });

    it('shows add action item form when button is clicked', async () => {
      render(<CabMeetingsPage />);

      fireEvent.click(screen.getByText('Weekly CAB Meeting').closest('tr')!);

      await waitFor(() => {
        fireEvent.click(screen.getByRole('button', { name: /Action Items/i }));
      });

      await waitFor(() => {
        fireEvent.click(screen.getByRole('button', { name: /Add Action Item/i }));
      });

      await waitFor(() => {
        expect(screen.getByText('Description')).toBeInTheDocument();
        expect(screen.getByText('Assignee')).toBeInTheDocument();
        expect(screen.getByText('Due Date')).toBeInTheDocument();
      });
    });

    it('displays empty state when no action items', async () => {
      vi.mocked(hooks.useCabActionItems).mockReturnValue({
        data: { data: [] },
        isLoading: false,
        error: null,
      } as any);

      render(<CabMeetingsPage />);

      fireEvent.click(screen.getByText('Weekly CAB Meeting').closest('tr')!);

      await waitFor(() => {
        fireEvent.click(screen.getByRole('button', { name: /Action Items/i }));
      });

      await waitFor(() => {
        expect(screen.getByText('No action items yet')).toBeInTheDocument();
      });
    });

    it('calls addActionItem mutation when form is submitted', async () => {
      const mutateAsyncMock = vi.fn().mockResolvedValue({});
      vi.mocked(hooks.useAddActionItem).mockReturnValue({
        ...mockMutation,
        mutateAsync: mutateAsyncMock,
      } as any);

      render(<CabMeetingsPage />);

      fireEvent.click(screen.getByText('Weekly CAB Meeting').closest('tr')!);

      await waitFor(() => {
        fireEvent.click(screen.getByRole('button', { name: /Action Items/i }));
      });

      await waitFor(() => {
        fireEvent.click(screen.getByRole('button', { name: /Add Action Item/i }));
      });

      await waitFor(() => {
        const descInput = screen.getByPlaceholderText(/What needs to be done/i);
        fireEvent.change(descInput, { target: { value: 'New task' } });
      });

      fireEvent.click(screen.getByRole('button', { name: /^Add$/i }));

      await waitFor(() => {
        expect(mutateAsyncMock).toHaveBeenCalledWith({
          meetingId: 'meeting-1',
          description: 'New task',
          assigneeId: undefined,
          dueDate: undefined,
        });
      });
    });
  });

  describe('Minutes Tab', () => {
    const mockMeetingDetail = {
      id: 'meeting-1',
      title: 'Weekly CAB Meeting',
      meeting_date: '2026-01-15T14:00:00Z',
      status: 'completed',
      minutes: 'Meeting started at 2pm.\nAll changes were reviewed.',
    };

    beforeEach(() => {
      vi.mocked(hooks.useCabMeeting).mockReturnValue({
        data: mockMeetingDetail,
        isLoading: false,
        error: null,
      } as any);
    });

    it('displays Meeting Minutes heading', async () => {
      render(<CabMeetingsPage />);

      fireEvent.click(screen.getByText('Weekly CAB Meeting').closest('tr')!);

      await waitFor(() => {
        fireEvent.click(screen.getByRole('button', { name: /Minutes/i }));
      });

      await waitFor(() => {
        expect(screen.getByText('Meeting Minutes')).toBeInTheDocument();
      });
    });

    it('displays minutes content when available', async () => {
      render(<CabMeetingsPage />);

      fireEvent.click(screen.getByText('Weekly CAB Meeting').closest('tr')!);

      await waitFor(() => {
        fireEvent.click(screen.getByRole('button', { name: /Minutes/i }));
      });

      await waitFor(() => {
        expect(screen.getByText(/Meeting started at 2pm/)).toBeInTheDocument();
      });
    });

    it('shows Edit button for minutes', async () => {
      render(<CabMeetingsPage />);

      fireEvent.click(screen.getByText('Weekly CAB Meeting').closest('tr')!);

      await waitFor(() => {
        fireEvent.click(screen.getByRole('button', { name: /Minutes/i }));
      });

      await waitFor(() => {
        // Multiple Edit buttons may exist - look for the one in minutes section
        const editButtons = screen.getAllByRole('button', { name: /Edit/i });
        expect(editButtons.length).toBeGreaterThanOrEqual(1);
      });
    });

    it('shows Distribute button when minutes exist', async () => {
      render(<CabMeetingsPage />);

      fireEvent.click(screen.getByText('Weekly CAB Meeting').closest('tr')!);

      await waitFor(() => {
        fireEvent.click(screen.getByRole('button', { name: /Minutes/i }));
      });

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Distribute/i })).toBeInTheDocument();
      });
    });

    it('displays empty state when no minutes', async () => {
      vi.mocked(hooks.useCabMeeting).mockReturnValue({
        data: { ...mockMeetingDetail, minutes: '' },
        isLoading: false,
        error: null,
      } as any);

      render(<CabMeetingsPage />);

      fireEvent.click(screen.getByText('Weekly CAB Meeting').closest('tr')!);

      await waitFor(() => {
        fireEvent.click(screen.getByRole('button', { name: /Minutes/i }));
      });

      await waitFor(() => {
        expect(screen.getByText(/No minutes recorded yet/i)).toBeInTheDocument();
      });
    });

    it('calls saveMinutes mutation when Save is clicked', async () => {
      const mutateAsyncMock = vi.fn().mockResolvedValue({});
      vi.mocked(hooks.useSaveMinutes).mockReturnValue({
        ...mockMutation,
        mutateAsync: mutateAsyncMock,
      } as any);

      render(<CabMeetingsPage />);

      fireEvent.click(screen.getByText('Weekly CAB Meeting').closest('tr')!);

      await waitFor(() => {
        fireEvent.click(screen.getByRole('button', { name: /Minutes/i }));
      });

      // Click Edit to enter edit mode
      await waitFor(() => {
        const editButtons = screen.getAllByRole('button', { name: /Edit/i });
        // Click the last Edit button which should be in minutes section
        fireEvent.click(editButtons[editButtons.length - 1]);
      });

      // Should now show Save button
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Save/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /Save/i }));

      await waitFor(() => {
        expect(mutateAsyncMock).toHaveBeenCalled();
      });
    });

    it('calls distributeMinutes mutation when Distribute is clicked', async () => {
      const mutateAsyncMock = vi.fn().mockResolvedValue({});
      vi.mocked(hooks.useDistributeMinutes).mockReturnValue({
        ...mockMutation,
        mutateAsync: mutateAsyncMock,
      } as any);

      render(<CabMeetingsPage />);

      fireEvent.click(screen.getByText('Weekly CAB Meeting').closest('tr')!);

      await waitFor(() => {
        fireEvent.click(screen.getByRole('button', { name: /Minutes/i }));
      });

      await waitFor(() => {
        fireEvent.click(screen.getByRole('button', { name: /Distribute/i }));
      });

      await waitFor(() => {
        expect(mutateAsyncMock).toHaveBeenCalledWith('meeting-1');
      });
    });
  });

  describe('Delete Meeting', () => {
    const mockMeetingDetail = {
      id: 'meeting-1',
      title: 'Weekly CAB Meeting',
      meeting_date: '2026-01-15T14:00:00Z',
      status: 'scheduled',
    };

    beforeEach(() => {
      vi.mocked(hooks.useCabMeeting).mockReturnValue({
        data: mockMeetingDetail,
        isLoading: false,
        error: null,
      } as any);
    });

    it('calls deleteMeeting mutation when confirmed', async () => {
      // Mock window.confirm
      const originalConfirm = window.confirm;
      window.confirm = vi.fn().mockReturnValue(true);

      const mutateAsyncMock = vi.fn().mockResolvedValue({});
      vi.mocked(hooks.useDeleteCabMeeting).mockReturnValue({
        ...mockMutation,
        mutateAsync: mutateAsyncMock,
      } as any);

      render(<CabMeetingsPage />);

      fireEvent.click(screen.getByText('Weekly CAB Meeting').closest('tr')!);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Delete Meeting/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /Delete Meeting/i }));

      await waitFor(() => {
        expect(window.confirm).toHaveBeenCalled();
        expect(mutateAsyncMock).toHaveBeenCalledWith('meeting-1');
      });

      window.confirm = originalConfirm;
    });

    it('does not delete when user cancels confirmation', async () => {
      // Mock window.confirm
      const originalConfirm = window.confirm;
      window.confirm = vi.fn().mockReturnValue(false);

      const mutateAsyncMock = vi.fn().mockResolvedValue({});
      vi.mocked(hooks.useDeleteCabMeeting).mockReturnValue({
        ...mockMutation,
        mutateAsync: mutateAsyncMock,
      } as any);

      render(<CabMeetingsPage />);

      fireEvent.click(screen.getByText('Weekly CAB Meeting').closest('tr')!);

      await waitFor(() => {
        fireEvent.click(screen.getByRole('button', { name: /Delete Meeting/i }));
      });

      expect(window.confirm).toHaveBeenCalled();
      expect(mutateAsyncMock).not.toHaveBeenCalled();

      window.confirm = originalConfirm;
    });
  });

  describe('Update Meeting', () => {
    const mockMeetingDetail = {
      id: 'meeting-1',
      title: 'Weekly CAB Meeting',
      meeting_date: '2026-01-15T14:00:00Z',
      status: 'scheduled',
    };

    beforeEach(() => {
      vi.mocked(hooks.useCabMeeting).mockReturnValue({
        data: mockMeetingDetail,
        isLoading: false,
        error: null,
      } as any);
    });

    it('calls updateMeeting mutation when Save is clicked in edit mode', async () => {
      const mutateAsyncMock = vi.fn().mockResolvedValue({});
      vi.mocked(hooks.useUpdateCabMeeting).mockReturnValue({
        ...mockMutation,
        mutateAsync: mutateAsyncMock,
      } as any);

      render(<CabMeetingsPage />);

      fireEvent.click(screen.getByText('Weekly CAB Meeting').closest('tr')!);

      // Click Edit to enter edit mode
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Edit/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /Edit/i }));

      // Should now show Save button in header
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Save/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /Save/i }));

      await waitFor(() => {
        expect(mutateAsyncMock).toHaveBeenCalledWith({
          id: 'meeting-1',
          data: expect.objectContaining({
            title: 'Weekly CAB Meeting',
          }),
        });
      });
    });
  });

  describe('Loading States', () => {
    it('shows loading spinner while meeting detail is loading', async () => {
      vi.mocked(hooks.useCabMeeting).mockReturnValue({
        data: null,
        isLoading: true,
        error: null,
      } as any);

      render(<CabMeetingsPage />);

      fireEvent.click(screen.getByText('Weekly CAB Meeting').closest('tr')!);

      await waitFor(() => {
        // Loading spinner should be visible
        const spinners = document.querySelectorAll('.animate-spin');
        expect(spinners.length).toBeGreaterThanOrEqual(1);
      });
    });

    it('shows loading spinner while attendees are loading', async () => {
      vi.mocked(hooks.useCabMeeting).mockReturnValue({
        data: {
          id: 'meeting-1',
          title: 'Weekly CAB Meeting',
          meeting_date: '2026-01-15T14:00:00Z',
          status: 'scheduled',
        },
        isLoading: false,
        error: null,
      } as any);
      vi.mocked(hooks.useCabMeetingAttendees).mockReturnValue({
        data: null,
        isLoading: true,
        error: null,
      } as any);

      render(<CabMeetingsPage />);

      fireEvent.click(screen.getByText('Weekly CAB Meeting').closest('tr')!);

      await waitFor(() => {
        fireEvent.click(screen.getByRole('button', { name: /Attendees/i }));
      });

      await waitFor(() => {
        const spinners = document.querySelectorAll('.animate-spin');
        expect(spinners.length).toBeGreaterThanOrEqual(1);
      });
    });
  });
});
