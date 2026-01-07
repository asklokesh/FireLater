import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ReportBuilderPage from '../page';

// Mock next/navigation
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: mockPush })),
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
    preview: vi.fn(),
    createTemplate: vi.fn(),
  },
}));

import { reportsApi } from '@/lib/api';

const mockPreview = reportsApi.preview as ReturnType<typeof vi.fn>;
const mockCreateTemplate = reportsApi.createTemplate as ReturnType<typeof vi.fn>;

describe('ReportBuilderPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Basic Rendering', () => {
    it('renders page title', () => {
      render(<ReportBuilderPage />);
      expect(screen.getByText('Report Builder')).toBeInTheDocument();
    });

    it('renders page subtitle', () => {
      render(<ReportBuilderPage />);
      expect(screen.getByText('Create custom reports with drag-and-drop simplicity')).toBeInTheDocument();
    });

    it('renders back button', () => {
      render(<ReportBuilderPage />);
      const backLink = screen.getAllByRole('link').find(link => link.getAttribute('href') === '/reports');
      expect(backLink).toBeDefined();
    });

    it('renders Preview button', () => {
      render(<ReportBuilderPage />);
      expect(screen.getByRole('button', { name: /Preview/i })).toBeInTheDocument();
    });

    it('renders Save Report button', () => {
      render(<ReportBuilderPage />);
      expect(screen.getByRole('button', { name: /Save Report/i })).toBeInTheDocument();
    });
  });

  describe('Report Details Section', () => {
    it('renders Report Details heading', () => {
      render(<ReportBuilderPage />);
      expect(screen.getByText('Report Details')).toBeInTheDocument();
    });

    it('renders report name input', () => {
      render(<ReportBuilderPage />);
      expect(screen.getByPlaceholderText('My Custom Report')).toBeInTheDocument();
    });

    it('renders description textarea', () => {
      render(<ReportBuilderPage />);
      expect(screen.getByPlaceholderText('Describe what this report shows...')).toBeInTheDocument();
    });
  });

  describe('Data Source Section', () => {
    it('renders Data Source heading', () => {
      render(<ReportBuilderPage />);
      expect(screen.getByText('Data Source')).toBeInTheDocument();
    });

    it('renders all data source options', () => {
      render(<ReportBuilderPage />);
      expect(screen.getByText('Issues')).toBeInTheDocument();
      expect(screen.getByText('Changes')).toBeInTheDocument();
      expect(screen.getByText('Applications')).toBeInTheDocument();
      expect(screen.getByText('Service Requests')).toBeInTheDocument();
    });

    it('renders data source descriptions', () => {
      render(<ReportBuilderPage />);
      expect(screen.getByText('Incident and problem tickets')).toBeInTheDocument();
      expect(screen.getByText('Change requests and implementations')).toBeInTheDocument();
      expect(screen.getByText('Application inventory and health')).toBeInTheDocument();
      expect(screen.getByText('Service catalog requests')).toBeInTheDocument();
    });

    it('selects data source when clicked', () => {
      render(<ReportBuilderPage />);
      const issuesSource = screen.getByText('Issues').closest('button');
      fireEvent.click(issuesSource!);

      expect(issuesSource).toHaveClass('border-blue-500');
    });
  });

  describe('Output Format Section', () => {
    it('renders Output Format heading', () => {
      render(<ReportBuilderPage />);
      expect(screen.getByText('Output Format')).toBeInTheDocument();
    });

    it('renders format options', () => {
      render(<ReportBuilderPage />);
      expect(screen.getByRole('button', { name: 'pdf' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'csv' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'xlsx' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'json' })).toBeInTheDocument();
    });

    it('selects pdf and csv by default', () => {
      render(<ReportBuilderPage />);
      const pdfButton = screen.getByRole('button', { name: 'pdf' });
      const csvButton = screen.getByRole('button', { name: 'csv' });

      expect(pdfButton).toHaveClass('bg-blue-100');
      expect(csvButton).toHaveClass('bg-blue-100');
    });

    it('toggles format selection when clicked', () => {
      render(<ReportBuilderPage />);
      const jsonButton = screen.getByRole('button', { name: 'json' });

      fireEvent.click(jsonButton);
      expect(jsonButton).toHaveClass('bg-blue-100');

      fireEvent.click(jsonButton);
      expect(jsonButton).not.toHaveClass('bg-blue-100');
    });
  });

  describe('Columns Section', () => {
    it('renders Columns section header', () => {
      render(<ReportBuilderPage />);
      expect(screen.getByText(/Columns/)).toBeInTheDocument();
    });

    it('shows Available Fields when data source selected', () => {
      render(<ReportBuilderPage />);
      const issuesSource = screen.getByText('Issues').closest('button');
      fireEvent.click(issuesSource!);

      expect(screen.getByText('Available Fields')).toBeInTheDocument();
    });

    it('shows Selected Columns when data source selected', () => {
      render(<ReportBuilderPage />);
      const issuesSource = screen.getByText('Issues').closest('button');
      fireEvent.click(issuesSource!);

      expect(screen.getByText('Selected Columns')).toBeInTheDocument();
    });

    it('shows issue fields when Issues source selected', () => {
      render(<ReportBuilderPage />);
      const issuesSource = screen.getByText('Issues').closest('button');
      fireEvent.click(issuesSource!);

      expect(screen.getByText('Title')).toBeInTheDocument();
      expect(screen.getByText('Priority')).toBeInTheDocument();
      expect(screen.getByText('Status')).toBeInTheDocument();
    });

    it('adds column when clicked', () => {
      render(<ReportBuilderPage />);
      const issuesSource = screen.getByText('Issues').closest('button');
      fireEvent.click(issuesSource!);

      const titleButton = screen.getByRole('button', { name: /Title/ });
      fireEvent.click(titleButton);

      // Column should move to selected
      const selectedColumns = screen.getByText('Selected Columns').parentElement;
      expect(selectedColumns?.innerHTML).toContain('Title');
    });

    it('removes column when trash icon clicked', () => {
      render(<ReportBuilderPage />);
      const issuesSource = screen.getByText('Issues').closest('button');
      fireEvent.click(issuesSource!);

      // Add a column first
      const titleButton = screen.getByRole('button', { name: /Title/ });
      fireEvent.click(titleButton);

      // Find and click the remove button
      const removeButtons = document.querySelectorAll('.text-red-500');
      if (removeButtons.length > 0) {
        fireEvent.click(removeButtons[0]);
      }

      // Title should be back in available
      expect(screen.getByRole('button', { name: /Title/ })).toBeInTheDocument();
    });

    it('shows aggregation dropdown for aggregatable fields', () => {
      render(<ReportBuilderPage />);
      const issuesSource = screen.getByText('Issues').closest('button');
      fireEvent.click(issuesSource!);

      // Add an aggregatable field
      const priorityButton = screen.getByRole('button', { name: /Priority/ });
      fireEvent.click(priorityButton);

      // Should show aggregation options
      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });
  });

  describe('Filters Section', () => {
    it('renders Filters section header', () => {
      render(<ReportBuilderPage />);
      expect(screen.getByText(/Filters/)).toBeInTheDocument();
    });

    it('toggles filters section when clicked', () => {
      render(<ReportBuilderPage />);
      const issuesSource = screen.getByText('Issues').closest('button');
      fireEvent.click(issuesSource!);

      const filtersHeader = screen.getByText(/Filters/).closest('button');
      fireEvent.click(filtersHeader!);

      expect(screen.getByRole('button', { name: /Add Filter/i })).toBeInTheDocument();
    });

    it('adds filter when Add Filter clicked', () => {
      render(<ReportBuilderPage />);
      const issuesSource = screen.getByText('Issues').closest('button');
      fireEvent.click(issuesSource!);

      const filtersHeader = screen.getByText(/Filters/).closest('button');
      fireEvent.click(filtersHeader!);

      const addFilterButton = screen.getByRole('button', { name: /Add Filter/i });
      fireEvent.click(addFilterButton);

      // Should have filter inputs
      const filterSelects = document.querySelectorAll('select');
      expect(filterSelects.length).toBeGreaterThan(0);
    });
  });

  describe('Sort Section', () => {
    it('renders Sort Order section header', () => {
      render(<ReportBuilderPage />);
      expect(screen.getByText(/Sort Order/)).toBeInTheDocument();
    });

    it('shows sort options when expanded', () => {
      render(<ReportBuilderPage />);
      const issuesSource = screen.getByText('Issues').closest('button');
      fireEvent.click(issuesSource!);

      const sortHeader = screen.getByText(/Sort Order/).closest('button');
      fireEvent.click(sortHeader!);

      expect(screen.getByText('No sorting')).toBeInTheDocument();
    });
  });

  describe('Preview Section', () => {
    it('renders Preview heading', () => {
      render(<ReportBuilderPage />);
      // The preview section has "Preview" as heading
      const previewHeadings = screen.getAllByText('Preview');
      expect(previewHeadings.length).toBeGreaterThan(0);
    });

    it('shows empty state initially', () => {
      render(<ReportBuilderPage />);
      expect(screen.getByText('Configure your report and click Preview to see results')).toBeInTheDocument();
    });

    it('preview button is disabled without data source and columns', () => {
      render(<ReportBuilderPage />);
      const previewButton = screen.getByRole('button', { name: /Preview/i });
      expect(previewButton).toBeDisabled();
    });

    it('loads preview data when Preview clicked', async () => {
      mockPreview.mockResolvedValue({
        rows: [{ id: '1', title: 'Test Issue', priority: 'high' }],
      });

      render(<ReportBuilderPage />);

      // Select data source
      const issuesSource = screen.getByText('Issues').closest('button');
      fireEvent.click(issuesSource!);

      // Add columns
      const titleButton = screen.getByRole('button', { name: /Title/ });
      fireEvent.click(titleButton);

      // Click preview
      const previewButton = screen.getByRole('button', { name: /Preview/i });
      fireEvent.click(previewButton);

      await waitFor(() => {
        expect(mockPreview).toHaveBeenCalled();
      });
    });

    it('shows no data message when preview returns empty', async () => {
      mockPreview.mockResolvedValue({ rows: [] });

      render(<ReportBuilderPage />);

      // Select data source
      const issuesSource = screen.getByText('Issues').closest('button');
      fireEvent.click(issuesSource!);

      // Add columns
      const titleButton = screen.getByRole('button', { name: /Title/ });
      fireEvent.click(titleButton);

      // Click preview
      const previewButton = screen.getByRole('button', { name: /Preview/i });
      fireEvent.click(previewButton);

      await waitFor(() => {
        expect(screen.getByText('No data matches your criteria')).toBeInTheDocument();
      });
    });
  });

  describe('Save Report', () => {
    it('shows error when name is empty', async () => {
      render(<ReportBuilderPage />);
      const saveButton = screen.getByRole('button', { name: /Save Report/i });
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText('Report name is required')).toBeInTheDocument();
      });
    });

    it('shows error when no data source selected', async () => {
      render(<ReportBuilderPage />);
      const nameInput = screen.getByPlaceholderText('My Custom Report');
      fireEvent.change(nameInput, { target: { value: 'Test Report' } });

      const saveButton = screen.getByRole('button', { name: /Save Report/i });
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText('Please select a data source')).toBeInTheDocument();
      });
    });

    it('shows error when no columns selected', async () => {
      render(<ReportBuilderPage />);

      // Enter name
      const nameInput = screen.getByPlaceholderText('My Custom Report');
      fireEvent.change(nameInput, { target: { value: 'Test Report' } });

      // Select data source
      const issuesSource = screen.getByText('Issues').closest('button');
      fireEvent.click(issuesSource!);

      // Try to save without columns
      const saveButton = screen.getByRole('button', { name: /Save Report/i });
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText('Please select at least one column')).toBeInTheDocument();
      });
    });

    it('saves report and navigates on success', async () => {
      mockCreateTemplate.mockResolvedValue({ id: 'new-template-123' });

      render(<ReportBuilderPage />);

      // Enter name
      const nameInput = screen.getByPlaceholderText('My Custom Report');
      fireEvent.change(nameInput, { target: { value: 'Test Report' } });

      // Select data source
      const issuesSource = screen.getByText('Issues').closest('button');
      fireEvent.click(issuesSource!);

      // Add columns
      const titleButton = screen.getByRole('button', { name: /Title/ });
      fireEvent.click(titleButton);

      // Save
      const saveButton = screen.getByRole('button', { name: /Save Report/i });
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(mockCreateTemplate).toHaveBeenCalled();
      });

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/reports/new-template-123');
      });
    });

    it('shows error on save failure', async () => {
      mockCreateTemplate.mockRejectedValue(new Error('Save failed'));

      render(<ReportBuilderPage />);

      // Enter name
      const nameInput = screen.getByPlaceholderText('My Custom Report');
      fireEvent.change(nameInput, { target: { value: 'Test Report' } });

      // Select data source
      const issuesSource = screen.getByText('Issues').closest('button');
      fireEvent.click(issuesSource!);

      // Add columns
      const titleButton = screen.getByRole('button', { name: /Title/ });
      fireEvent.click(titleButton);

      // Save
      const saveButton = screen.getByRole('button', { name: /Save Report/i });
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText('Failed to save report template')).toBeInTheDocument();
      });
    });
  });

  describe('Data Source Switching', () => {
    it('clears columns when data source changes', () => {
      render(<ReportBuilderPage />);

      // Select Issues source and add columns
      const issuesSource = screen.getByText('Issues').closest('button');
      fireEvent.click(issuesSource!);

      const titleButton = screen.getByRole('button', { name: /Title/ });
      fireEvent.click(titleButton);

      // Switch to Changes source
      const changesSource = screen.getByText('Changes').closest('button');
      fireEvent.click(changesSource!);

      // Columns should be cleared (0 selected)
      expect(screen.getByText('(0 selected)')).toBeInTheDocument();
    });

    it('clears filters when data source changes', () => {
      render(<ReportBuilderPage />);

      // Select Issues source and add filter
      const issuesSource = screen.getByText('Issues').closest('button');
      fireEvent.click(issuesSource!);

      const filtersHeader = screen.getByText(/Filters/).closest('button');
      fireEvent.click(filtersHeader!);

      const addFilterButton = screen.getByRole('button', { name: /Add Filter/i });
      fireEvent.click(addFilterButton);

      // Switch to Changes source
      const changesSource = screen.getByText('Changes').closest('button');
      fireEvent.click(changesSource!);

      // Filters should be cleared (0 active)
      expect(screen.getByText('(0 active)')).toBeInTheDocument();
    });
  });

  describe('Changes Data Source Fields', () => {
    it('shows changes-specific fields when Changes selected', () => {
      render(<ReportBuilderPage />);
      const changesSource = screen.getByText('Changes').closest('button');
      fireEvent.click(changesSource!);

      expect(screen.getByText('Risk Level')).toBeInTheDocument();
      expect(screen.getByText('Scheduled Start')).toBeInTheDocument();
      expect(screen.getByText('Success')).toBeInTheDocument();
    });
  });

  describe('Applications Data Source Fields', () => {
    it('shows applications-specific fields when Applications selected', () => {
      render(<ReportBuilderPage />);
      const appsSource = screen.getByText('Applications').closest('button');
      fireEvent.click(appsSource!);

      expect(screen.getByText('Criticality')).toBeInTheDocument();
      expect(screen.getByText('Health Score')).toBeInTheDocument();
      expect(screen.getByText('Owner')).toBeInTheDocument();
    });
  });

  describe('Service Requests Data Source Fields', () => {
    it('shows requests-specific fields when Service Requests selected', () => {
      render(<ReportBuilderPage />);
      const requestsSource = screen.getByText('Service Requests').closest('button');
      fireEvent.click(requestsSource!);

      expect(screen.getByText('Catalog Item')).toBeInTheDocument();
      expect(screen.getByText('Fulfillment Time (hrs)')).toBeInTheDocument();
    });
  });
});
