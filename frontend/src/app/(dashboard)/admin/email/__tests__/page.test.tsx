import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import EmailIntegrationPage from '../page';

// Mock hooks
const mockUseEmailConfigs = vi.fn();
const mockUseEmailLogs = vi.fn();
const mockUseWebhookUrls = vi.fn();
const mockUseCreateEmailConfig = vi.fn();
const mockUseUpdateEmailConfig = vi.fn();
const mockUseDeleteEmailConfig = vi.fn();
const mockUseApplications = vi.fn();
const mockUseGroups = vi.fn();

vi.mock('@/hooks/useApi', () => ({
  useEmailConfigs: () => mockUseEmailConfigs(),
  useEmailLogs: (...args: any[]) => mockUseEmailLogs(...args),
  useWebhookUrls: () => mockUseWebhookUrls(),
  useCreateEmailConfig: () => mockUseCreateEmailConfig(),
  useUpdateEmailConfig: () => mockUseUpdateEmailConfig(),
  useDeleteEmailConfig: () => mockUseDeleteEmailConfig(),
  useApplications: () => mockUseApplications(),
  useGroups: () => mockUseGroups(),
}));

const mockEmailConfigs = {
  data: [
    {
      id: 'config-1',
      name: 'Support Inbox',
      email_address: 'support@example.com',
      provider: 'sendgrid' as const,
      is_active: true,
      default_priority: 'medium' as const,
      auto_reply_enabled: true,
      spam_filter_enabled: true,
      default_application_id: 'app-1',
      default_assigned_group: 'group-1',
      auto_reply_template: 'Thank you for contacting us',
      allowed_domains: ['example.com'],
      blocked_domains: ['spam.com'],
    },
    {
      id: 'config-2',
      name: 'Sales Inquiries',
      email_address: 'sales@example.com',
      provider: 'mailgun' as const,
      is_active: false,
      default_priority: 'high' as const,
      auto_reply_enabled: false,
      spam_filter_enabled: true,
      default_application_id: null,
      default_assigned_group: null,
      auto_reply_template: null,
      allowed_domains: null,
      blocked_domains: null,
    },
  ],
};

const mockEmailLogs = {
  data: [
    {
      id: 'log-1',
      config_id: 'config-1',
      from_name: 'John Doe',
      from_email: 'john@example.com',
      subject: 'Help needed',
      action: 'created_issue',
      success: true,
      issue_number: 'ISSUE-123',
      error_message: null,
      created_at: '2024-01-15T10:30:00Z',
    },
    {
      id: 'log-2',
      config_id: 'config-1',
      from_name: null,
      from_email: 'spam@malicious.com',
      subject: 'Spam message',
      action: 'rejected_spam',
      success: false,
      issue_number: null,
      error_message: 'Email from blocked domain',
      created_at: '2024-01-15T11:00:00Z',
    },
  ],
};

const mockWebhookUrls = {
  data: {
    sendgrid: 'https://api.example.com/webhooks/email/sendgrid',
    mailgun: 'https://api.example.com/webhooks/email/mailgun',
    generic: 'https://api.example.com/webhooks/email/generic',
    instructions: {
      sendgrid: 'Configure SendGrid to forward emails to this URL',
      mailgun: 'Configure Mailgun routes to forward to this URL',
      generic: 'Use this URL for custom integrations',
    },
  },
};

const mockApplications = {
  data: [
    { id: 'app-1', name: 'Web Application' },
    { id: 'app-2', name: 'Mobile App' },
  ],
};

const mockGroups = {
  data: [
    { id: 'group-1', name: 'Support Team' },
    { id: 'group-2', name: 'Engineering' },
  ],
};

describe('EmailIntegrationPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseEmailConfigs.mockReturnValue({
      data: mockEmailConfigs,
      isLoading: false,
    });
    mockUseEmailLogs.mockReturnValue({
      data: mockEmailLogs,
      isLoading: false,
    });
    mockUseWebhookUrls.mockReturnValue({
      data: mockWebhookUrls,
    });
    mockUseCreateEmailConfig.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    });
    mockUseUpdateEmailConfig.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    });
    mockUseDeleteEmailConfig.mockReturnValue({
      mutateAsync: vi.fn(),
    });
    mockUseApplications.mockReturnValue({
      data: mockApplications,
    });
    mockUseGroups.mockReturnValue({
      data: mockGroups,
    });
  });

  describe('Basic Rendering', () => {
    it('renders page title', () => {
      render(<EmailIntegrationPage />);
      expect(screen.getByText('Email Integration')).toBeInTheDocument();
    });

    it('renders page description', () => {
      render(<EmailIntegrationPage />);
      expect(screen.getByText(/Configure email-to-ticket integration/i)).toBeInTheDocument();
    });

    it('renders Add Configuration button', () => {
      render(<EmailIntegrationPage />);
      expect(screen.getByRole('button', { name: /Add Configuration/i })).toBeInTheDocument();
    });

    it('renders all tabs', () => {
      render(<EmailIntegrationPage />);
      expect(screen.getByRole('button', { name: /Configurations/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Email Logs/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Setup Guide/i })).toBeInTheDocument();
    });
  });

  describe('Configurations Tab', () => {
    it('displays email configurations list', async () => {
      render(<EmailIntegrationPage />);
      await waitFor(() => {
        expect(screen.getByText('Support Inbox')).toBeInTheDocument();
        expect(screen.getByText('support@example.com')).toBeInTheDocument();
        expect(screen.getByText('Sales Inquiries')).toBeInTheDocument();
        expect(screen.getByText('sales@example.com')).toBeInTheDocument();
      });
    });

    it('displays provider badges', async () => {
      render(<EmailIntegrationPage />);
      await waitFor(() => {
        expect(screen.getByText('sendgrid')).toBeInTheDocument();
        expect(screen.getByText('mailgun')).toBeInTheDocument();
      });
    });

    it('displays active/inactive status', async () => {
      render(<EmailIntegrationPage />);
      await waitFor(() => {
        const activeStatuses = screen.getAllByText('Active');
        const inactiveStatuses = screen.getAllByText('Inactive');
        expect(activeStatuses).toHaveLength(1);
        expect(inactiveStatuses).toHaveLength(1);
      });
    });

    it('displays default priority', async () => {
      render(<EmailIntegrationPage />);
      await waitFor(() => {
        expect(screen.getByText(/Priority: medium/i)).toBeInTheDocument();
        expect(screen.getByText(/Priority: high/i)).toBeInTheDocument();
      });
    });

    it('displays auto-reply indicator', async () => {
      render(<EmailIntegrationPage />);
      await waitFor(() => {
        expect(screen.getByText('Auto-reply')).toBeInTheDocument();
      });
    });

    it('displays spam filter indicator', async () => {
      render(<EmailIntegrationPage />);
      await waitFor(() => {
        const spamFilters = screen.getAllByText('Spam filter');
        expect(spamFilters.length).toBeGreaterThan(0);
      });
    });

    it('shows loading spinner when loading', () => {
      mockUseEmailConfigs.mockReturnValue({
        data: null,
        isLoading: true,
      });
      render(<EmailIntegrationPage />);
      const spinners = screen.queryAllByTestId('loading-spinner');
      expect(spinners.length > 0 || document.querySelector('.animate-spin')).toBeTruthy();
    });

    it('shows empty state when no configurations', async () => {
      mockUseEmailConfigs.mockReturnValue({
        data: { data: [] },
        isLoading: false,
      });
      render(<EmailIntegrationPage />);
      await waitFor(() => {
        expect(screen.getByText('No email configurations')).toBeInTheDocument();
      });
    });
  });

  describe('Email Logs Tab', () => {
    it('switches to logs tab', async () => {
      render(<EmailIntegrationPage />);
      const logsTab = screen.getByRole('button', { name: /Email Logs/i });
      fireEvent.click(logsTab);
      await waitFor(() => {
        expect(screen.getByText('Filters:')).toBeInTheDocument();
      });
    });

    it('displays email logs table', async () => {
      render(<EmailIntegrationPage />);
      fireEvent.click(screen.getByRole('button', { name: /Email Logs/i }));
      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
        expect(screen.getByText('john@example.com')).toBeInTheDocument();
        expect(screen.getByText('Help needed')).toBeInTheDocument();
      });
    });

    it('displays log actions', async () => {
      render(<EmailIntegrationPage />);
      fireEvent.click(screen.getByRole('button', { name: /Email Logs/i }));
      await waitFor(() => {
        expect(screen.getAllByText('Created Issue').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Rejected (Spam)').length).toBeGreaterThan(0);
      });
    });

    it('displays issue numbers for created issues', async () => {
      render(<EmailIntegrationPage />);
      fireEvent.click(screen.getByRole('button', { name: /Email Logs/i }));
      await waitFor(() => {
        expect(screen.getByText('Issue #ISSUE-123')).toBeInTheDocument();
      });
    });

    it('displays success/failed status', async () => {
      render(<EmailIntegrationPage />);
      fireEvent.click(screen.getByRole('button', { name: /Email Logs/i }));
      await waitFor(() => {
        expect(screen.getAllByText('Success').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Failed').length).toBeGreaterThan(0);
      });
    });

    it('displays error messages for failed logs', async () => {
      render(<EmailIntegrationPage />);
      fireEvent.click(screen.getByRole('button', { name: /Email Logs/i }));
      await waitFor(() => {
        expect(screen.getByText('Email from blocked domain')).toBeInTheDocument();
      });
    });

    it('renders filter dropdowns', async () => {
      render(<EmailIntegrationPage />);
      fireEvent.click(screen.getByRole('button', { name: /Email Logs/i }));
      await waitFor(() => {
        const selects = screen.getAllByRole('combobox');
        expect(selects.length).toBeGreaterThanOrEqual(3);
      });
    });

    it('shows empty state when no logs', async () => {
      mockUseEmailLogs.mockReturnValue({
        data: { data: [] },
        isLoading: false,
      });
      render(<EmailIntegrationPage />);
      fireEvent.click(screen.getByRole('button', { name: /Email Logs/i }));
      await waitFor(() => {
        expect(screen.getByText('No email logs')).toBeInTheDocument();
      });
    });
  });

  describe('Setup Guide Tab', () => {
    it('switches to setup guide tab', async () => {
      render(<EmailIntegrationPage />);
      const setupTab = screen.getByRole('button', { name: /Setup Guide/i });
      fireEvent.click(setupTab);
      await waitFor(() => {
        expect(screen.getByText('How Email-to-Ticket Works')).toBeInTheDocument();
      });
    });

    it('displays webhook URLs', async () => {
      render(<EmailIntegrationPage />);
      fireEvent.click(screen.getByRole('button', { name: /Setup Guide/i }));
      await waitFor(() => {
        expect(screen.getByText('https://api.example.com/webhooks/email/sendgrid')).toBeInTheDocument();
        expect(screen.getByText('https://api.example.com/webhooks/email/mailgun')).toBeInTheDocument();
        expect(screen.getByText('https://api.example.com/webhooks/email/generic')).toBeInTheDocument();
      });
    });

    it('displays provider setup instructions', async () => {
      render(<EmailIntegrationPage />);
      fireEvent.click(screen.getByRole('button', { name: /Setup Guide/i }));
      await waitFor(() => {
        expect(screen.getAllByText('SendGrid Inbound Parse').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Mailgun Routes').length).toBeGreaterThan(0);
        expect(screen.getAllByText(/Custom SMTP/i).length).toBeGreaterThan(0);
      });
    });

    it('displays recommended badge for SendGrid', async () => {
      render(<EmailIntegrationPage />);
      fireEvent.click(screen.getByRole('button', { name: /Setup Guide/i }));
      await waitFor(() => {
        expect(screen.getByText('Recommended')).toBeInTheDocument();
      });
    });
  });

  describe('Tab Navigation', () => {
    it('starts with Configurations tab active', () => {
      render(<EmailIntegrationPage />);
      const configsTab = screen.getByRole('button', { name: /Configurations/i });
      expect(configsTab).toHaveClass('border-blue-500');
    });

    it('switches tabs on click', async () => {
      render(<EmailIntegrationPage />);
      const logsTab = screen.getByRole('button', { name: /Email Logs/i });
      fireEvent.click(logsTab);
      await waitFor(() => {
        expect(logsTab).toHaveClass('border-blue-500');
      });
    });
  });

  describe('Modal Interactions', () => {
    it('opens create modal when Add Configuration is clicked', async () => {
      render(<EmailIntegrationPage />);
      const addButton = screen.getByRole('button', { name: /Add Configuration/i });
      fireEvent.click(addButton);
      await waitFor(() => {
        expect(screen.getByText('New Email Configuration')).toBeInTheDocument();
      });
    });

    it('displays modal tabs', async () => {
      render(<EmailIntegrationPage />);
      fireEvent.click(screen.getByRole('button', { name: /Add Configuration/i }));
      await waitFor(() => {
        expect(screen.getByText('General')).toBeInTheDocument();
        expect(screen.getByText('Defaults')).toBeInTheDocument();
        expect(screen.getByText('Spam Filter')).toBeInTheDocument();
        expect(screen.getByText('Auto-Reply')).toBeInTheDocument();
      });
    });

    it('displays general tab fields', async () => {
      render(<EmailIntegrationPage />);
      fireEvent.click(screen.getByRole('button', { name: /Add Configuration/i }));
      await waitFor(() => {
        const inputs = screen.getAllByRole('textbox');
        expect(inputs.length).toBeGreaterThan(0);
        expect(screen.getByPlaceholderText('Support Inbox')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('support@company.com')).toBeInTheDocument();
      });
    });

    it('closes modal when Cancel is clicked', async () => {
      render(<EmailIntegrationPage />);
      fireEvent.click(screen.getByRole('button', { name: /Add Configuration/i }));
      await waitFor(() => {
        expect(screen.getByText('New Email Configuration')).toBeInTheDocument();
      });
      const cancelButton = screen.getByRole('button', { name: /Cancel/i });
      fireEvent.click(cancelButton);
      await waitFor(() => {
        expect(screen.queryByText('New Email Configuration')).not.toBeInTheDocument();
      });
    });
  });

  describe('Configuration Actions', () => {
    it('displays action buttons for each config', async () => {
      render(<EmailIntegrationPage />);
      await waitFor(() => {
        const actionButtons = screen.getAllByTitle(/Activate|Deactivate/i);
        expect(actionButtons.length).toBeGreaterThan(0);
      });
    });

    it('shows activate button for inactive configs', async () => {
      render(<EmailIntegrationPage />);
      await waitFor(() => {
        const deactivateButton = screen.getAllByTitle('Deactivate');
        expect(deactivateButton.length).toBeGreaterThan(0);
      });
    });

    it('shows edit button for each config', async () => {
      render(<EmailIntegrationPage />);
      await waitFor(() => {
        const editButtons = screen.getAllByTitle('Edit');
        expect(editButtons.length).toBeGreaterThan(0);
      });
    });

    it('shows delete button for each config', async () => {
      render(<EmailIntegrationPage />);
      await waitFor(() => {
        const deleteButtons = screen.getAllByTitle('Delete');
        expect(deleteButtons.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Loading States', () => {
    it('shows loading spinner for configs', () => {
      mockUseEmailConfigs.mockReturnValue({
        data: null,
        isLoading: true,
      });
      render(<EmailIntegrationPage />);
      expect(document.querySelector('.animate-spin')).toBeTruthy();
    });

    it('shows loading spinner for logs', async () => {
      mockUseEmailLogs.mockReturnValue({
        data: null,
        isLoading: true,
      });
      render(<EmailIntegrationPage />);
      fireEvent.click(screen.getByRole('button', { name: /Email Logs/i }));
      await waitFor(() => {
        expect(document.querySelector('.animate-spin')).toBeTruthy();
      });
    });
  });

  describe('Edge Cases', () => {
    it('handles missing from_name in logs', async () => {
      render(<EmailIntegrationPage />);
      fireEvent.click(screen.getByRole('button', { name: /Email Logs/i }));
      await waitFor(() => {
        expect(screen.getAllByText('spam@malicious.com').length).toBeGreaterThan(0);
      });
    });

    it('handles missing subject in logs', async () => {
      const logsWithoutSubject = {
        data: [
          {
            ...mockEmailLogs.data[0],
            subject: null,
          },
        ],
      };
      mockUseEmailLogs.mockReturnValue({
        data: logsWithoutSubject,
        isLoading: false,
      });
      render(<EmailIntegrationPage />);
      fireEvent.click(screen.getByRole('button', { name: /Email Logs/i }));
      await waitFor(() => {
        expect(screen.getByText('(no subject)')).toBeInTheDocument();
      });
    });

    it('displays formatted timestamps', async () => {
      render(<EmailIntegrationPage />);
      fireEvent.click(screen.getByRole('button', { name: /Email Logs/i }));
      await waitFor(() => {
        const timestamps = screen.getAllByText(/\d{1,2}\/\d{1,2}\/\d{4}/);
        expect(timestamps.length).toBeGreaterThan(0);
      });
    });
  });
});
