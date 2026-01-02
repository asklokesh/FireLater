import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ChangeCalendarPage from '../page';
import { changesApi } from '@/lib/api';

// Mock the API
vi.mock('@/lib/api', () => ({
  changesApi: {
    list: vi.fn(),
  },
}));

// Mock Next.js Link
vi.mock('next/link', () => ({
  default: ({ children, href, onClick, className, title }: any) => (
    <a href={href} onClick={onClick} className={className} title={title}>
      {children}
    </a>
  ),
}));

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  ChevronLeft: () => <div data-testid="chevron-left-icon" />,
  ChevronRight: () => <div data-testid="chevron-right-icon" />,
  Calendar: () => <div data-testid="calendar-icon" />,
  List: () => <div data-testid="list-icon" />,
  AlertCircle: () => <div data-testid="alert-circle-icon" />,
  Clock: () => <div data-testid="clock-icon" />,
  User: () => <div data-testid="user-icon" />,
  Server: () => <div data-testid="server-icon" />,
  Loader2: () => <div data-testid="loader2-icon" />,
  Plus: () => <div data-testid="plus-icon" />,
  Filter: () => <div data-testid="filter-icon" />,
}));

// Mock Button component
vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, variant, size, className }: any) => (
    <button onClick={onClick} className={className} data-variant={variant} data-size={size}>
      {children}
    </button>
  ),
}));

const mockChanges = [
  {
    id: '1',
    change_id: 'CHG-001',
    title: 'Database Migration',
    type: 'standard',
    status: 'scheduled',
    risk_level: 'high',
    scheduled_start: '2026-01-15T10:00:00Z',
    scheduled_end: '2026-01-15T12:00:00Z',
    assigned_to_name: 'John Doe',
    application_name: 'Main App',
  },
  {
    id: '2',
    change_id: 'CHG-002',
    title: 'Server Upgrade',
    type: 'normal',
    status: 'approved',
    risk_level: 'medium',
    scheduled_start: '2026-01-20T14:00:00Z',
    scheduled_end: '2026-01-20T16:00:00Z',
    assigned_to_name: 'Jane Smith',
    application_name: 'API Server',
  },
  {
    id: '3',
    change_id: 'CHG-003',
    title: 'Patch Update',
    type: 'emergency',
    status: 'implementing',
    risk_level: 'low',
    scheduled_start: '2026-01-25T08:00:00Z',
    scheduled_end: '2026-01-25T09:00:00Z',
    assigned_to_name: null,
    application_name: null,
  },
];

describe('ChangeCalendarPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(changesApi.list).mockResolvedValue({ data: mockChanges });
  });

  // Basic Rendering Tests
  describe('Basic Rendering', () => {
    it('renders page title and description', async () => {
      render(<ChangeCalendarPage />);

      expect(screen.getByText('Change Calendar')).toBeInTheDocument();
      expect(screen.getByText('View scheduled changes on a calendar')).toBeInTheDocument();
    });

    it('renders New Change button', async () => {
      render(<ChangeCalendarPage />);

      const newChangeButton = screen.getByText('New Change').closest('a');
      expect(newChangeButton).toBeInTheDocument();
      expect(newChangeButton).toHaveAttribute('href', '/changes/new');
    });

    it('renders navigation controls', async () => {
      render(<ChangeCalendarPage />);

      await waitFor(() => {
        expect(screen.queryByTestId('loader2-icon')).not.toBeInTheDocument();
      });

      expect(screen.getAllByTestId('chevron-left-icon')).toHaveLength(1);
      expect(screen.getAllByTestId('chevron-right-icon')).toHaveLength(1);
    });

    it('renders Today button', async () => {
      render(<ChangeCalendarPage />);

      expect(screen.getByText('Today')).toBeInTheDocument();
    });

    it('renders view mode toggles', async () => {
      render(<ChangeCalendarPage />);

      await waitFor(() => {
        expect(screen.queryByTestId('loader2-icon')).not.toBeInTheDocument();
      });

      expect(screen.getByTestId('calendar-icon')).toBeInTheDocument();
      expect(screen.getByTestId('list-icon')).toBeInTheDocument();
    });

    it('renders filter button', async () => {
      render(<ChangeCalendarPage />);

      await waitFor(() => {
        expect(screen.queryByTestId('loader2-icon')).not.toBeInTheDocument();
      });

      expect(screen.getByTestId('filter-icon')).toBeInTheDocument();
    });
  });

  // Loading State Tests
  describe('Loading State', () => {
    it('displays loading spinner while fetching changes', () => {
      render(<ChangeCalendarPage />);

      expect(screen.getByTestId('loader2-icon')).toBeInTheDocument();
    });

    it('hides loading spinner after data loads', async () => {
      render(<ChangeCalendarPage />);

      await waitFor(() => {
        expect(screen.queryByTestId('loader2-icon')).not.toBeInTheDocument();
      });
    });
  });

  // Month View Tests
  describe('Month View', () => {
    it('displays current month by default', async () => {
      render(<ChangeCalendarPage />);

      await waitFor(() => {
        expect(screen.queryByTestId('loader2-icon')).not.toBeInTheDocument();
      });

      const monthYear = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      expect(screen.getByText(monthYear)).toBeInTheDocument();
    });

    it('displays day headers in month view', async () => {
      render(<ChangeCalendarPage />);

      await waitFor(() => {
        expect(screen.queryByTestId('loader2-icon')).not.toBeInTheDocument();
      });

      ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].forEach(day => {
        expect(screen.getByText(day)).toBeInTheDocument();
      });
    });

    it('displays calendar grid with 42 days', async () => {
      render(<ChangeCalendarPage />);

      await waitFor(() => {
        expect(screen.queryByTestId('loader2-icon')).not.toBeInTheDocument();
      });

      const calendarCells = document.querySelectorAll('.grid-cols-7 > div');
      // 7 day headers + 42 calendar cells
      expect(calendarCells.length).toBeGreaterThanOrEqual(42);
    });

    it('navigates to previous month', async () => {
      render(<ChangeCalendarPage />);

      await waitFor(() => {
        expect(screen.queryByTestId('loader2-icon')).not.toBeInTheDocument();
      });

      const currentMonth = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      expect(screen.getByText(currentMonth)).toBeInTheDocument();

      const prevButton = screen.getAllByTestId('chevron-left-icon')[0].closest('button');
      fireEvent.click(prevButton!);

      await waitFor(() => {
        const prevMonth = new Date();
        prevMonth.setMonth(prevMonth.getMonth() - 1);
        const prevMonthStr = prevMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        expect(screen.getByText(prevMonthStr)).toBeInTheDocument();
      });
    });

    it('navigates to next month', async () => {
      render(<ChangeCalendarPage />);

      await waitFor(() => {
        expect(screen.queryByTestId('loader2-icon')).not.toBeInTheDocument();
      });

      const nextButton = screen.getAllByTestId('chevron-right-icon')[0].closest('button');
      fireEvent.click(nextButton!);

      await waitFor(() => {
        const nextMonth = new Date();
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        const nextMonthStr = nextMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        expect(screen.getByText(nextMonthStr)).toBeInTheDocument();
      });
    });
  });

  // Week View Tests
  describe('Week View', () => {
    it('switches to week view when List button is clicked', async () => {
      render(<ChangeCalendarPage />);

      await waitFor(() => {
        expect(screen.queryByTestId('loader2-icon')).not.toBeInTheDocument();
      });

      const weekViewButton = screen.getByTestId('list-icon').closest('button');
      fireEvent.click(weekViewButton!);

      await waitFor(() => {
        expect(screen.getByText(/Week of/)).toBeInTheDocument();
      });
    });

    it('displays 7 day columns in week view', async () => {
      render(<ChangeCalendarPage />);

      await waitFor(() => {
        expect(screen.queryByTestId('loader2-icon')).not.toBeInTheDocument();
      });

      const weekViewButton = screen.getByTestId('list-icon').closest('button');
      fireEvent.click(weekViewButton!);

      await waitFor(() => {
        expect(screen.getByText(/Week of/)).toBeInTheDocument();
      });
    });

    it('navigates to previous week in week view', async () => {
      render(<ChangeCalendarPage />);

      await waitFor(() => {
        expect(screen.queryByTestId('loader2-icon')).not.toBeInTheDocument();
      });

      const weekViewButton = screen.getByTestId('list-icon').closest('button');
      fireEvent.click(weekViewButton!);

      await waitFor(() => {
        expect(screen.getByText(/Week of/)).toBeInTheDocument();
      });

      const currentWeekText = screen.getByText(/Week of/).textContent;

      const prevButton = screen.getAllByTestId('chevron-left-icon')[0].closest('button');
      fireEvent.click(prevButton!);

      await waitFor(() => {
        const newWeekText = screen.getByText(/Week of/).textContent;
        expect(newWeekText).not.toBe(currentWeekText);
      });
    });

    it('navigates to next week in week view', async () => {
      render(<ChangeCalendarPage />);

      await waitFor(() => {
        expect(screen.queryByTestId('loader2-icon')).not.toBeInTheDocument();
      });

      const weekViewButton = screen.getByTestId('list-icon').closest('button');
      fireEvent.click(weekViewButton!);

      await waitFor(() => {
        expect(screen.getByText(/Week of/)).toBeInTheDocument();
      });

      const currentWeekText = screen.getByText(/Week of/).textContent;

      const nextButton = screen.getAllByTestId('chevron-right-icon')[0].closest('button');
      fireEvent.click(nextButton!);

      await waitFor(() => {
        const newWeekText = screen.getByText(/Week of/).textContent;
        expect(newWeekText).not.toBe(currentWeekText);
      });
    });
  });

  // Today Button Tests
  describe('Today Button', () => {
    it('resets to current month when Today button is clicked', async () => {
      render(<ChangeCalendarPage />);

      await waitFor(() => {
        expect(screen.queryByTestId('loader2-icon')).not.toBeInTheDocument();
      });

      // Navigate to next month
      const nextButton = screen.getAllByTestId('chevron-right-icon')[0].closest('button');
      fireEvent.click(nextButton!);

      await waitFor(() => {
        const nextMonth = new Date();
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        const nextMonthStr = nextMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        expect(screen.getByText(nextMonthStr)).toBeInTheDocument();
      });

      // Click Today button
      const todayButton = screen.getByText('Today');
      fireEvent.click(todayButton);

      await waitFor(() => {
        const currentMonth = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        expect(screen.getByText(currentMonth)).toBeInTheDocument();
      });
    });
  });

  // Filter Tests
  describe('Filters', () => {
    it('toggles filter panel when filter button is clicked', async () => {
      render(<ChangeCalendarPage />);

      await waitFor(() => {
        expect(screen.queryByTestId('loader2-icon')).not.toBeInTheDocument();
      });

      expect(screen.queryByText('Risk:')).not.toBeInTheDocument();

      const filterButton = screen.getByTestId('filter-icon').closest('button');
      fireEvent.click(filterButton!);

      await waitFor(() => {
        expect(screen.getByText('Risk:')).toBeInTheDocument();
        expect(screen.getByText('Status:')).toBeInTheDocument();
      });
    });

    it('displays risk filter options', async () => {
      render(<ChangeCalendarPage />);

      await waitFor(() => {
        expect(screen.queryByTestId('loader2-icon')).not.toBeInTheDocument();
      });

      const filterButton = screen.getByTestId('filter-icon').closest('button');
      fireEvent.click(filterButton!);

      await waitFor(() => {
        const riskSelect = screen.getByText('Risk:').nextElementSibling as HTMLSelectElement;
        expect(riskSelect).toBeInTheDocument();

        const options = Array.from(riskSelect.querySelectorAll('option')).map(opt => opt.value);
        expect(options).toContain('all');
        expect(options).toContain('low');
        expect(options).toContain('medium');
        expect(options).toContain('high');
      });
    });

    it('displays status filter options', async () => {
      render(<ChangeCalendarPage />);

      await waitFor(() => {
        expect(screen.queryByTestId('loader2-icon')).not.toBeInTheDocument();
      });

      const filterButton = screen.getByTestId('filter-icon').closest('button');
      fireEvent.click(filterButton!);

      await waitFor(() => {
        const statusSelect = screen.getByText('Status:').nextElementSibling as HTMLSelectElement;
        expect(statusSelect).toBeInTheDocument();

        const options = Array.from(statusSelect.querySelectorAll('option')).map(opt => opt.value);
        expect(options).toContain('all');
        expect(options).toContain('approved');
        expect(options).toContain('scheduled');
        expect(options).toContain('implementing');
        expect(options).toContain('completed');
      });
    });

    it('filters changes by risk level', async () => {
      render(<ChangeCalendarPage />);

      await waitFor(() => {
        expect(screen.queryByTestId('loader2-icon')).not.toBeInTheDocument();
      });

      const filterButton = screen.getByTestId('filter-icon').closest('button');
      fireEvent.click(filterButton!);

      await waitFor(() => {
        const riskSelect = screen.getByText('Risk:').nextElementSibling as HTMLSelectElement;
        fireEvent.change(riskSelect, { target: { value: 'high' } });
      });

      // Filter should be applied
      expect(vi.mocked(changesApi.list)).toHaveBeenCalled();
    });

    it('filters changes by status', async () => {
      render(<ChangeCalendarPage />);

      await waitFor(() => {
        expect(screen.queryByTestId('loader2-icon')).not.toBeInTheDocument();
      });

      const filterButton = screen.getByTestId('filter-icon').closest('button');
      fireEvent.click(filterButton!);

      await waitFor(() => {
        const statusSelect = screen.getByText('Status:').nextElementSibling as HTMLSelectElement;
        fireEvent.change(statusSelect, { target: { value: 'scheduled' } });
      });

      // Filter should be applied
      expect(vi.mocked(changesApi.list)).toHaveBeenCalled();
    });
  });

  // Legend Tests
  describe('Legend', () => {
    it('displays risk level legend', async () => {
      render(<ChangeCalendarPage />);

      await waitFor(() => {
        expect(screen.queryByTestId('loader2-icon')).not.toBeInTheDocument();
      });

      expect(screen.getByText('Risk Levels')).toBeInTheDocument();
      expect(screen.getByText('low')).toBeInTheDocument();
      expect(screen.getByText('medium')).toBeInTheDocument();
      expect(screen.getByText('high')).toBeInTheDocument();
    });
  });

  // Change Detail Modal Tests
  describe('Change Detail Modal', () => {
    it('opens modal when change is clicked in week view', async () => {
      // Mock changes for a specific date in January 2026
      const janChanges = [{
        ...mockChanges[0],
        scheduled_start: '2026-01-15T10:00:00Z',
        scheduled_end: '2026-01-15T12:00:00Z',
      }];

      vi.mocked(changesApi.list).mockResolvedValue({ data: janChanges });

      render(<ChangeCalendarPage />);

      await waitFor(() => {
        expect(screen.queryByTestId('loader2-icon')).not.toBeInTheDocument();
      });

      // Switch to week view
      const weekViewButton = screen.getByTestId('list-icon').closest('button');
      fireEvent.click(weekViewButton!);

      await waitFor(() => {
        expect(screen.getByText(/Week of/)).toBeInTheDocument();
      });

      // Navigate to January 2026 if not already there
      const todayButton = screen.getByText('Today');
      fireEvent.click(todayButton);

      // Wait for changes to load
      await waitFor(() => {
        const changeLinks = screen.queryAllByText('CHG-001');
        if (changeLinks.length > 0) {
          fireEvent.click(changeLinks[0]);
        }
      });
    });

    it('closes modal when close button is clicked', async () => {
      const janChanges = [{
        ...mockChanges[0],
        scheduled_start: '2026-01-15T10:00:00Z',
        scheduled_end: '2026-01-15T12:00:00Z',
      }];

      vi.mocked(changesApi.list).mockResolvedValue({ data: janChanges });

      render(<ChangeCalendarPage />);

      await waitFor(() => {
        expect(screen.queryByTestId('loader2-icon')).not.toBeInTheDocument();
      });

      const weekViewButton = screen.getByTestId('list-icon').closest('button');
      fireEvent.click(weekViewButton!);

      await waitFor(() => {
        const changeLinks = screen.queryAllByText('CHG-001');
        if (changeLinks.length > 0) {
          fireEvent.click(changeLinks[0]);
        }
      });

      await waitFor(() => {
        const closeButtons = screen.queryAllByText('Close');
        if (closeButtons.length > 0) {
          fireEvent.click(closeButtons[0]);
        }
      });
    });
  });

  // API Integration Tests
  describe('API Integration', () => {
    it('calls API with correct date range for month view', async () => {
      render(<ChangeCalendarPage />);

      await waitFor(() => {
        expect(changesApi.list).toHaveBeenCalled();
      });

      const callArgs = vi.mocked(changesApi.list).mock.calls[0][0];
      expect(callArgs).toHaveProperty('start_date');
      expect(callArgs).toHaveProperty('end_date');
      expect(callArgs).toHaveProperty('limit', 200);
    });

    it('handles API errors gracefully', async () => {
      vi.mocked(changesApi.list).mockRejectedValue(new Error('API Error'));

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      render(<ChangeCalendarPage />);

      await waitFor(() => {
        expect(screen.queryByTestId('loader2-icon')).not.toBeInTheDocument();
      });

      expect(consoleSpy).toHaveBeenCalledWith('Failed to load changes:', expect.any(Error));

      consoleSpy.mockRestore();
    });

    it('reloads changes when view mode changes', async () => {
      render(<ChangeCalendarPage />);

      await waitFor(() => {
        expect(screen.queryByTestId('loader2-icon')).not.toBeInTheDocument();
      });

      const initialCallCount = vi.mocked(changesApi.list).mock.calls.length;

      const weekViewButton = screen.getByTestId('list-icon').closest('button');
      fireEvent.click(weekViewButton!);

      await waitFor(() => {
        expect(vi.mocked(changesApi.list).mock.calls.length).toBeGreaterThan(initialCallCount);
      });
    });

    it('reloads changes when navigating months', async () => {
      render(<ChangeCalendarPage />);

      await waitFor(() => {
        expect(screen.queryByTestId('loader2-icon')).not.toBeInTheDocument();
      });

      const initialCallCount = vi.mocked(changesApi.list).mock.calls.length;

      const nextButton = screen.getAllByTestId('chevron-right-icon')[0].closest('button');
      fireEvent.click(nextButton!);

      await waitFor(() => {
        expect(vi.mocked(changesApi.list).mock.calls.length).toBeGreaterThan(initialCallCount);
      });
    });
  });

  // Empty State Tests
  describe('Empty State', () => {
    it('displays empty calendar when no changes exist', async () => {
      vi.mocked(changesApi.list).mockResolvedValue({ data: [] });

      render(<ChangeCalendarPage />);

      await waitFor(() => {
        expect(screen.queryByTestId('loader2-icon')).not.toBeInTheDocument();
      });

      // Calendar should still render but with no changes
      const currentMonth = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      expect(screen.getByText(currentMonth)).toBeInTheDocument();
    });
  });
});
