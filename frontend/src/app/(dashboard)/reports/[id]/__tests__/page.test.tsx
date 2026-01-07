import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ReportExecutionPage from '../page';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useParams: vi.fn(() => ({ id: 'tpl-123' })),
  useRouter: vi.fn(() => ({ push: vi.fn() })),
}));

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

// Mock the API
vi.mock('@/lib/api', () => ({
  reportsApi: {
    getTemplate: vi.fn(),
    listExecutions: vi.fn(),
    execute: vi.fn(),
    preview: vi.fn(),
    getExecution: vi.fn(),
  },
  applicationsApi: {
    list: vi.fn(),
  },
  groupsApi: {
    list: vi.fn(),
  },
}));

import { reportsApi, applicationsApi, groupsApi } from '@/lib/api';
import { useParams } from 'next/navigation';

const mockTemplate = {
  id: 'tpl-123',
  name: 'Monthly Incident Report',
  description: 'Summary of all incidents for the month',
  type: 'issues',
  query_config: {},
  output_format: ['pdf', 'csv', 'xlsx'],
  parameters: [
    {
      name: 'start_date',
      type: 'date' as const,
      label: 'Start Date',
      required: true,
    },
    {
      name: 'end_date',
      type: 'date' as const,
      label: 'End Date',
      required: true,
    },
    {
      name: 'priority',
      type: 'select' as const,
      label: 'Priority',
      required: false,
      options: [
        { value: 'high', label: 'High' },
        { value: 'medium', label: 'Medium' },
        { value: 'low', label: 'Low' },
      ],
    },
  ],
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-15T00:00:00Z',
};

const mockExecutions = [
  {
    id: 'exec-1',
    status: 'completed' as const,
    started_at: '2024-01-15T10:00:00Z',
    completed_at: '2024-01-15T10:05:00Z',
    result_url: 'https://example.com/report.pdf',
    error: null,
    output_format: 'pdf',
    parameters: {},
  },
  {
    id: 'exec-2',
    status: 'failed' as const,
    started_at: '2024-01-14T10:00:00Z',
    completed_at: '2024-01-14T10:01:00Z',
    result_url: null,
    error: 'Timeout error',
    output_format: 'csv',
    parameters: {},
  },
];

const mockApplications = [
  { id: 'app-1', name: 'Customer Portal' },
  { id: 'app-2', name: 'Internal Tools' },
];

const mockGroups = [
  { id: 'grp-1', name: 'IT Support' },
  { id: 'grp-2', name: 'DevOps' },
];

const mockGetTemplate = reportsApi.getTemplate as ReturnType<typeof vi.fn>;
const mockListExecutions = reportsApi.listExecutions as ReturnType<typeof vi.fn>;
const mockExecute = reportsApi.execute as ReturnType<typeof vi.fn>;
const mockPreview = reportsApi.preview as ReturnType<typeof vi.fn>;
const mockGetExecution = reportsApi.getExecution as ReturnType<typeof vi.fn>;
const mockListApps = applicationsApi.list as ReturnType<typeof vi.fn>;
const mockListGroups = groupsApi.list as ReturnType<typeof vi.fn>;
const mockUseParams = useParams as ReturnType<typeof vi.fn>;

describe('ReportExecutionPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseParams.mockReturnValue({ id: 'tpl-123' });
    mockGetTemplate.mockResolvedValue(mockTemplate);
    mockListExecutions.mockResolvedValue({ data: mockExecutions });
    mockListApps.mockResolvedValue({ data: mockApplications });
    mockListGroups.mockResolvedValue({ data: mockGroups });
  });

  describe('Loading State', () => {
    it('shows loading spinner while loading', () => {
      mockGetTemplate.mockImplementation(() => new Promise(() => {}));
      render(<ReportExecutionPage />);
      expect(document.querySelector('.animate-spin')).toBeInTheDocument();
    });
  });

  describe('Error State', () => {
    it('shows error message when template fails to load', async () => {
      mockGetTemplate.mockRejectedValue(new Error('Network error'));
      render(<ReportExecutionPage />);
      await waitFor(() => {
        expect(screen.getByText('Failed to load report template')).toBeInTheDocument();
      });
    });

    it('shows back button in error state', async () => {
      mockGetTemplate.mockRejectedValue(new Error('Network error'));
      render(<ReportExecutionPage />);
      await waitFor(() => {
        expect(screen.getByRole('link', { name: /Back to Reports/i })).toBeInTheDocument();
      });
    });
  });

  describe('Basic Rendering', () => {
    it('renders template name', async () => {
      render(<ReportExecutionPage />);
      await waitFor(() => {
        expect(screen.getByText('Monthly Incident Report')).toBeInTheDocument();
      });
    });

    it('renders template description', async () => {
      render(<ReportExecutionPage />);
      await waitFor(() => {
        expect(screen.getByText('Summary of all incidents for the month')).toBeInTheDocument();
      });
    });

    it('renders back button', async () => {
      render(<ReportExecutionPage />);
      await waitFor(() => {
        const backLink = screen.getAllByRole('link').find(link => link.getAttribute('href') === '/reports');
        expect(backLink).toBeDefined();
      });
    });

    it('renders Preview button', async () => {
      render(<ReportExecutionPage />);
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Preview/i })).toBeInTheDocument();
      });
    });

    it('renders Run Report button', async () => {
      render(<ReportExecutionPage />);
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Run Report/i })).toBeInTheDocument();
      });
    });
  });

  describe('Report Filters Section', () => {
    it('renders filter section heading', async () => {
      render(<ReportExecutionPage />);
      await waitFor(() => {
        expect(screen.getByText('Report Filters')).toBeInTheDocument();
      });
    });

    it('renders date parameters', async () => {
      render(<ReportExecutionPage />);
      await waitFor(() => {
        expect(screen.getByText('Start Date')).toBeInTheDocument();
        expect(screen.getByText('End Date')).toBeInTheDocument();
      });
    });

    it('renders select parameter', async () => {
      render(<ReportExecutionPage />);
      await waitFor(() => {
        expect(screen.getByText('Priority')).toBeInTheDocument();
      });
    });

    it('renders required indicator for required fields', async () => {
      render(<ReportExecutionPage />);
      await waitFor(() => {
        const startDateLabel = screen.getByText('Start Date');
        expect(startDateLabel.parentElement?.innerHTML).toContain('*');
      });
    });

    it('shows no filters message when empty', async () => {
      mockGetTemplate.mockResolvedValue({ ...mockTemplate, parameters: [] });
      render(<ReportExecutionPage />);
      await waitFor(() => {
        expect(screen.getByText('No filters available')).toBeInTheDocument();
      });
    });
  });

  describe('Output Format Section', () => {
    it('renders output format section', async () => {
      render(<ReportExecutionPage />);
      await waitFor(() => {
        expect(screen.getByText('Output Format')).toBeInTheDocument();
      });
    });

    it('renders format buttons', async () => {
      render(<ReportExecutionPage />);
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'PDF' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'CSV' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'XLSX' })).toBeInTheDocument();
      });
    });

    it('selects PDF by default', async () => {
      render(<ReportExecutionPage />);
      await waitFor(() => {
        const pdfButton = screen.getByRole('button', { name: 'PDF' });
        expect(pdfButton).toHaveClass('bg-blue-100');
      });
    });

    it('changes format when clicked', async () => {
      render(<ReportExecutionPage />);
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'CSV' })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'CSV' }));

      await waitFor(() => {
        const csvButton = screen.getByRole('button', { name: 'CSV' });
        expect(csvButton).toHaveClass('bg-blue-100');
      });
    });
  });

  describe('Execution History', () => {
    it('renders execution history section', async () => {
      render(<ReportExecutionPage />);
      await waitFor(() => {
        expect(screen.getByText('Execution History')).toBeInTheDocument();
      });
    });

    it('renders completed executions', async () => {
      render(<ReportExecutionPage />);
      await waitFor(() => {
        expect(screen.getByText('completed')).toBeInTheDocument();
      });
    });

    it('renders failed executions', async () => {
      render(<ReportExecutionPage />);
      await waitFor(() => {
        expect(screen.getByText('failed')).toBeInTheDocument();
      });
    });

    it('shows download button for completed executions', async () => {
      render(<ReportExecutionPage />);
      await waitFor(() => {
        const downloadButtons = document.querySelectorAll('[class*="outline"]');
        expect(downloadButtons.length).toBeGreaterThan(0);
      });
    });

    it('shows empty state when no executions', async () => {
      mockListExecutions.mockResolvedValue({ data: [] });
      render(<ReportExecutionPage />);
      await waitFor(() => {
        expect(screen.getByText('No execution history yet')).toBeInTheDocument();
      });
    });

    it('shows refresh button', async () => {
      render(<ReportExecutionPage />);
      await waitFor(() => {
        const refreshButton = document.querySelector('[class*="RefreshCw"]') ||
          screen.getAllByRole('button').find(btn => btn.querySelector('svg'));
        expect(refreshButton).toBeDefined();
      });
    });
  });

  describe('Report Execution', () => {
    it('executes report when Run Report clicked', async () => {
      mockExecute.mockResolvedValue({ id: 'exec-new', status: 'running' });
      render(<ReportExecutionPage />);
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Run Report/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /Run Report/i }));

      await waitFor(() => {
        expect(mockExecute).toHaveBeenCalledWith('tpl-123', expect.objectContaining({
          outputFormat: 'pdf',
        }));
      });
    });

    it('shows current execution status', async () => {
      mockExecute.mockResolvedValue({ id: 'exec-new', status: 'running' });
      render(<ReportExecutionPage />);
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Run Report/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /Run Report/i }));

      await waitFor(() => {
        expect(screen.getByText('Current Execution')).toBeInTheDocument();
      });
    });
  });

  describe('Preview Functionality', () => {
    it('loads preview when Preview clicked', async () => {
      mockPreview.mockResolvedValue({ rows: [{ id: '1', title: 'Test Issue' }] });
      render(<ReportExecutionPage />);
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Preview/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /Preview/i }));

      await waitFor(() => {
        expect(mockPreview).toHaveBeenCalled();
      });
    });

    it('shows preview data in table', async () => {
      mockPreview.mockResolvedValue({ rows: [{ id: '1', title: 'Test Issue' }] });
      render(<ReportExecutionPage />);
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Preview/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /Preview/i }));

      await waitFor(() => {
        expect(screen.getByText(/Preview/)).toBeInTheDocument();
      });
    });

    it('shows empty message when no preview data', async () => {
      mockPreview.mockResolvedValue({ rows: [] });
      render(<ReportExecutionPage />);
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Preview/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /Preview/i }));

      await waitFor(() => {
        expect(screen.getByText('No data matches the current filters')).toBeInTheDocument();
      });
    });
  });

  describe('Date Formatting', () => {
    it('formats execution dates correctly', async () => {
      render(<ReportExecutionPage />);
      await waitFor(() => {
        // Check that date formatting is applied (contains month abbreviation)
        const dateTexts = screen.getAllByText(/Jan/);
        expect(dateTexts.length).toBeGreaterThan(0);
      });
    });

    it('shows dash for null dates', async () => {
      mockListExecutions.mockResolvedValue({
        data: [{ ...mockExecutions[0], started_at: null }],
      });
      render(<ReportExecutionPage />);
      await waitFor(() => {
        const dashes = screen.getAllByText('-');
        expect(dashes.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Status Badge Colors', () => {
    it('applies green for completed status', async () => {
      render(<ReportExecutionPage />);
      await waitFor(() => {
        const completedBadge = screen.getByText('completed');
        expect(completedBadge).toHaveClass('bg-green-100', 'text-green-800');
      });
    });

    it('applies red for failed status', async () => {
      render(<ReportExecutionPage />);
      await waitFor(() => {
        const failedBadge = screen.getByText('failed');
        expect(failedBadge).toHaveClass('bg-red-100', 'text-red-800');
      });
    });
  });

  describe('Parameter Options', () => {
    it('shows options for select parameters', async () => {
      render(<ReportExecutionPage />);
      await waitFor(() => {
        expect(screen.getByText('High')).toBeInTheDocument();
        expect(screen.getByText('Medium')).toBeInTheDocument();
        expect(screen.getByText('Low')).toBeInTheDocument();
      });
    });

    it('populates application options for application_id parameter', async () => {
      mockGetTemplate.mockResolvedValue({
        ...mockTemplate,
        parameters: [
          {
            name: 'application_id',
            type: 'select' as const,
            label: 'Application',
            required: false,
          },
        ],
      });
      render(<ReportExecutionPage />);
      await waitFor(() => {
        expect(screen.getByText('Customer Portal')).toBeInTheDocument();
        expect(screen.getByText('Internal Tools')).toBeInTheDocument();
      });
    });

    it('populates group options for group_id parameter', async () => {
      mockGetTemplate.mockResolvedValue({
        ...mockTemplate,
        parameters: [
          {
            name: 'group_id',
            type: 'select' as const,
            label: 'Group',
            required: false,
          },
        ],
      });
      render(<ReportExecutionPage />);
      await waitFor(() => {
        expect(screen.getByText('IT Support')).toBeInTheDocument();
        expect(screen.getByText('DevOps')).toBeInTheDocument();
      });
    });
  });

  describe('Text and Number Parameters', () => {
    it('renders text input for text parameters', async () => {
      mockGetTemplate.mockResolvedValue({
        ...mockTemplate,
        parameters: [
          {
            name: 'search',
            type: 'text' as const,
            label: 'Search',
            required: false,
          },
        ],
      });
      render(<ReportExecutionPage />);
      await waitFor(() => {
        const textInputs = document.querySelectorAll('input[type="text"]');
        expect(textInputs.length).toBeGreaterThan(0);
      });
    });

    it('renders number input for number parameters', async () => {
      mockGetTemplate.mockResolvedValue({
        ...mockTemplate,
        parameters: [
          {
            name: 'limit',
            type: 'number' as const,
            label: 'Limit',
            required: false,
          },
        ],
      });
      render(<ReportExecutionPage />);
      await waitFor(() => {
        const numberInputs = document.querySelectorAll('input[type="number"]');
        expect(numberInputs.length).toBeGreaterThan(0);
      });
    });
  });
});
