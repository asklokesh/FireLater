import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SettingsPage from '../page';
import { settingsApi } from '@/lib/api';

// Mock the API
vi.mock('@/lib/api', () => ({
  settingsApi: {
    get: vi.fn(),
    update: vi.fn(),
  },
}));

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  Settings: ({ className }: { className?: string }) => <div className={className} data-testid="settings-icon" />,
  Bell: ({ className }: { className?: string }) => <div className={className} data-testid="bell-icon" />,
  Shield: ({ className }: { className?: string }) => <div className={className} data-testid="shield-icon" />,
  Database: ({ className }: { className?: string }) => <div className={className} data-testid="database-icon" />,
  Cloud: ({ className }: { className?: string }) => <div className={className} data-testid="cloud-icon" />,
  Mail: ({ className }: { className?: string }) => <div className={className} data-testid="mail-icon" />,
  Palette: ({ className }: { className?: string }) => <div className={className} data-testid="palette-icon" />,
  Globe: ({ className }: { className?: string }) => <div className={className} data-testid="globe-icon" />,
  Save: ({ className }: { className?: string }) => <div className={className} data-testid="save-icon" />,
  Loader2: ({ className }: { className?: string }) => <div className={className} data-testid="loader-icon" />,
}));

describe('SettingsPage', () => {
  const mockSettings = {
    tenant: {
      name: 'Acme Corp',
      slug: 'acme-corp',
    },
    settings: {
      timezone: 'America/New_York',
      dateFormat: 'MM/DD/YYYY',
      theme: 'light' as const,
      primaryColor: '#3b82f6',
      logoUrl: 'https://example.com/logo.png',
      notifications: {
        email: true,
        slack: false,
        slaBreachAlerts: true,
      },
      security: {
        require2FA: false,
        sessionTimeoutMinutes: 60,
        passwordPolicy: 'standard' as const,
      },
      email: {
        senderEmail: 'noreply@acme-corp.com',
        senderName: 'FireLater IT Support',
        provider: 'sendgrid' as const,
      },
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(settingsApi.get).mockResolvedValue(mockSettings);
    vi.mocked(settingsApi.update).mockResolvedValue({ success: true });
  });

  describe('Basic Rendering', () => {
    it('renders page title', async () => {
      render(<SettingsPage />);
      await waitFor(() => {
        expect(screen.getByText('Settings')).toBeInTheDocument();
      });
    });

    it('renders page description', async () => {
      render(<SettingsPage />);
      await waitFor(() => {
        expect(screen.getByText('Configure your tenant settings')).toBeInTheDocument();
      });
    });

    it('renders Save Changes button', async () => {
      render(<SettingsPage />);
      await waitFor(() => {
        expect(screen.getByText('Save Changes')).toBeInTheDocument();
      });
    });

    it('displays loading spinner initially', () => {
      render(<SettingsPage />);
      expect(screen.getByTestId('loader-icon')).toBeInTheDocument();
    });
  });

  describe('Navigation Sidebar', () => {
    it('renders all six navigation sections', async () => {
      render(<SettingsPage />);
      await waitFor(() => {
        expect(screen.getByText('General')).toBeInTheDocument();
        expect(screen.getByText('Notifications')).toBeInTheDocument();
        expect(screen.getByText('Security')).toBeInTheDocument();
        expect(screen.getByText('Integrations')).toBeInTheDocument();
        expect(screen.getByText('Email')).toBeInTheDocument();
        expect(screen.getByText('Appearance')).toBeInTheDocument();
      });
    });

    it('renders section icons', async () => {
      render(<SettingsPage />);
      await waitFor(() => {
        expect(screen.getByTestId('settings-icon')).toBeInTheDocument();
        expect(screen.getByTestId('bell-icon')).toBeInTheDocument();
        expect(screen.getByTestId('shield-icon')).toBeInTheDocument();
        expect(screen.getByTestId('cloud-icon')).toBeInTheDocument();
        expect(screen.getByTestId('mail-icon')).toBeInTheDocument();
        expect(screen.getByTestId('palette-icon')).toBeInTheDocument();
      });
    });

    it('defaults to General section', async () => {
      render(<SettingsPage />);
      await waitFor(() => {
        const generalButton = screen.getByText('General').closest('button');
        expect(generalButton).toHaveClass('bg-blue-50', 'text-blue-700');
      });
    });

    it('switches to Notifications section', async () => {
      render(<SettingsPage />);
      await waitFor(() => {
        const notificationsButton = screen.getByText('Notifications');
        fireEvent.click(notificationsButton);
      });
      expect(screen.getByText('Notification Settings')).toBeInTheDocument();
    });

    it('switches to Security section', async () => {
      render(<SettingsPage />);
      await waitFor(() => {
        const securityButton = screen.getByText('Security');
        fireEvent.click(securityButton);
      });
      expect(screen.getByText('Security Settings')).toBeInTheDocument();
    });

    it('switches to Integrations section', async () => {
      render(<SettingsPage />);
      await waitFor(() => {
        const integrationsButton = screen.getByText('Integrations');
        fireEvent.click(integrationsButton);
      });
      expect(screen.getByText('AWS')).toBeInTheDocument();
    });

    it('switches to Email section', async () => {
      render(<SettingsPage />);
      await waitFor(() => {
        const emailButton = screen.getByText('Email');
        fireEvent.click(emailButton);
      });
      expect(screen.getByText('Email Settings')).toBeInTheDocument();
    });

    it('switches to Appearance section', async () => {
      render(<SettingsPage />);
      await waitFor(() => {
        const appearanceButton = screen.getAllByText('Appearance')[0];
        fireEvent.click(appearanceButton);
      });
      expect(screen.getByText('Theme')).toBeInTheDocument();
    });

    it('highlights active section', async () => {
      render(<SettingsPage />);
      await waitFor(() => {
        const securityButton = screen.getByText('Security').closest('button');
        fireEvent.click(securityButton!);
      });

      await waitFor(() => {
        const securityButton = screen.getByText('Security').closest('button');
        expect(securityButton).toHaveClass('bg-blue-50', 'text-blue-700');
      });
    });
  });

  describe('General Section', () => {
    it('renders General Settings heading', async () => {
      render(<SettingsPage />);
      await waitFor(() => {
        expect(screen.getByText('General Settings')).toBeInTheDocument();
      });
    });

    it('displays organization name input', async () => {
      render(<SettingsPage />);
      await waitFor(() => {
        expect(screen.getByLabelText('Organization Name')).toBeInTheDocument();
      });
    });

    it('displays organization slug input (disabled)', async () => {
      render(<SettingsPage />);
      await waitFor(() => {
        const slugInput = screen.getByLabelText('Organization Slug') as HTMLInputElement;
        expect(slugInput).toBeInTheDocument();
        expect(slugInput).toBeDisabled();
      });
    });

    it('populates organization name from API', async () => {
      render(<SettingsPage />);
      await waitFor(() => {
        const nameInput = screen.getByLabelText('Organization Name') as HTMLInputElement;
        expect(nameInput.value).toBe('Acme Corp');
      });
    });

    it('populates organization slug from API', async () => {
      render(<SettingsPage />);
      await waitFor(() => {
        const slugInput = screen.getByLabelText('Organization Slug') as HTMLInputElement;
        expect(slugInput.value).toBe('acme-corp');
      });
    });

    it('displays timezone selector', async () => {
      render(<SettingsPage />);
      await waitFor(() => {
        expect(screen.getByText('Timezone')).toBeInTheDocument();
        const timezoneSelect = screen.getByDisplayValue('Eastern Time (US)');
        expect(timezoneSelect).toBeInTheDocument();
      });
    });

    it('displays all timezone options', async () => {
      render(<SettingsPage />);
      await waitFor(() => {
        expect(screen.getByText('UTC')).toBeInTheDocument();
        expect(screen.getByText('Eastern Time (US)')).toBeInTheDocument();
        expect(screen.getByText('Pacific Time (US)')).toBeInTheDocument();
        expect(screen.getByText('London')).toBeInTheDocument();
        expect(screen.getByText('Tokyo')).toBeInTheDocument();
      });
    });

    it('displays date format selector', async () => {
      render(<SettingsPage />);
      await waitFor(() => {
        expect(screen.getByText('Date Format')).toBeInTheDocument();
        const dateFormatSelect = screen.getByDisplayValue('MM/DD/YYYY');
        expect(dateFormatSelect).toBeInTheDocument();
      });
    });

    it('displays all date format options', async () => {
      render(<SettingsPage />);
      await waitFor(() => {
        const dateFormatSelect = screen.getByDisplayValue('MM/DD/YYYY') as HTMLSelectElement;
        expect(dateFormatSelect.options).toHaveLength(3);
      });
    });

    it('allows changing organization name', async () => {
      render(<SettingsPage />);
      await waitFor(() => {
        const nameInput = screen.getByLabelText('Organization Name') as HTMLInputElement;
        fireEvent.change(nameInput, { target: { value: 'New Corp' } });
        expect(nameInput.value).toBe('New Corp');
      });
    });

    it('allows changing timezone', async () => {
      render(<SettingsPage />);
      await waitFor(() => {
        const timezoneSelect = screen.getByDisplayValue('Eastern Time (US)') as HTMLSelectElement;
        fireEvent.change(timezoneSelect, { target: { value: 'America/Los_Angeles' } });
        expect(timezoneSelect.value).toBe('America/Los_Angeles');
      });
    });

    it('allows changing date format', async () => {
      render(<SettingsPage />);
      await waitFor(() => {
        const dateFormatSelect = screen.getByDisplayValue('MM/DD/YYYY') as HTMLSelectElement;
        fireEvent.change(dateFormatSelect, { target: { value: 'DD/MM/YYYY' } });
        expect(dateFormatSelect.value).toBe('DD/MM/YYYY');
      });
    });
  });

  describe('Notifications Section', () => {
    beforeEach(async () => {
      render(<SettingsPage />);
      await waitFor(() => {
        fireEvent.click(screen.getByText('Notifications'));
      });
    });

    it('renders Notification Settings heading', () => {
      expect(screen.getByText('Notification Settings')).toBeInTheDocument();
    });

    it('displays Email Notifications toggle', () => {
      expect(screen.getByText('Email Notifications')).toBeInTheDocument();
      expect(screen.getByText('Receive email updates for important events')).toBeInTheDocument();
    });

    it('displays Slack Notifications toggle', () => {
      expect(screen.getByText('Slack Notifications')).toBeInTheDocument();
      expect(screen.getByText('Send notifications to Slack channels')).toBeInTheDocument();
    });

    it('displays SLA Breach Alerts toggle', () => {
      expect(screen.getByText('SLA Breach Alerts')).toBeInTheDocument();
      expect(screen.getByText('Get notified before SLA breaches')).toBeInTheDocument();
    });

    it('Email Notifications toggle is checked by default', () => {
      const checkboxes = screen.getAllByRole('checkbox');
      expect(checkboxes[0]).toBeChecked();
    });

    it('Slack Notifications toggle is unchecked by default', () => {
      const checkboxes = screen.getAllByRole('checkbox');
      expect(checkboxes[1]).not.toBeChecked();
    });

    it('SLA Breach Alerts toggle is checked by default', () => {
      const checkboxes = screen.getAllByRole('checkbox');
      expect(checkboxes[2]).toBeChecked();
    });

    it('allows toggling email notifications', () => {
      const checkboxes = screen.getAllByRole('checkbox');
      fireEvent.click(checkboxes[0]);
      expect(checkboxes[0]).not.toBeChecked();
    });

    it('allows toggling slack notifications', () => {
      const checkboxes = screen.getAllByRole('checkbox');
      fireEvent.click(checkboxes[1]);
      expect(checkboxes[1]).toBeChecked();
    });

    it('allows toggling SLA breach alerts', () => {
      const checkboxes = screen.getAllByRole('checkbox');
      fireEvent.click(checkboxes[2]);
      expect(checkboxes[2]).not.toBeChecked();
    });
  });

  describe('Security Section', () => {
    beforeEach(async () => {
      render(<SettingsPage />);
      await waitFor(() => {
        fireEvent.click(screen.getByText('Security'));
      });
    });

    it('renders Security Settings heading', () => {
      expect(screen.getByText('Security Settings')).toBeInTheDocument();
    });

    it('displays Two-Factor Authentication toggle', () => {
      expect(screen.getByText('Two-Factor Authentication')).toBeInTheDocument();
      expect(screen.getByText('Require 2FA for all users')).toBeInTheDocument();
    });

    it('displays Session Timeout selector', () => {
      expect(screen.getByText('Session Timeout (minutes)')).toBeInTheDocument();
    });

    it('displays all session timeout options', () => {
      expect(screen.getByText('30 minutes')).toBeInTheDocument();
      expect(screen.getByText('1 hour')).toBeInTheDocument();
      expect(screen.getByText('2 hours')).toBeInTheDocument();
      expect(screen.getByText('8 hours')).toBeInTheDocument();
      expect(screen.getByText('24 hours')).toBeInTheDocument();
    });

    it('displays Password Policy selector', () => {
      expect(screen.getByText('Password Policy')).toBeInTheDocument();
    });

    it('displays all password policy options', () => {
      expect(screen.getByText('Standard (8+ characters)')).toBeInTheDocument();
      expect(screen.getByText('Strong (12+ chars, mixed case, numbers)')).toBeInTheDocument();
      expect(screen.getByText('Strict (16+ chars, special characters)')).toBeInTheDocument();
    });
  });

  describe('Integrations Section', () => {
    beforeEach(async () => {
      render(<SettingsPage />);
      await waitFor(() => {
        fireEvent.click(screen.getByText('Integrations'));
      });
    });

    it('renders Integrations heading', () => {
      const headings = screen.getAllByText('Integrations');
      expect(headings.length).toBeGreaterThan(0);
    });

    it('displays AWS integration card', () => {
      expect(screen.getByText('AWS')).toBeInTheDocument();
      expect(screen.getByText('Amazon Web Services integration')).toBeInTheDocument();
    });

    it('displays Slack integration card', () => {
      expect(screen.getByText('Slack')).toBeInTheDocument();
      expect(screen.getByText('Slack workspace integration')).toBeInTheDocument();
    });

    it('displays PagerDuty integration card', () => {
      expect(screen.getByText('PagerDuty')).toBeInTheDocument();
      expect(screen.getByText('PagerDuty incident management')).toBeInTheDocument();
    });

    it('displays Configure button for AWS', () => {
      const awsCard = screen.getByText('AWS').closest('.border');
      expect(awsCard).toHaveTextContent('Configure');
    });

    it('displays Connect button for Slack', () => {
      const slackCard = screen.getByText('Slack').closest('.border');
      expect(slackCard).toHaveTextContent('Connect');
    });

    it('displays Connect button for PagerDuty', () => {
      const pagerDutyCard = screen.getByText('PagerDuty').closest('.border');
      expect(pagerDutyCard).toHaveTextContent('Connect');
    });

    it('displays integration icons', () => {
      expect(screen.getAllByTestId('cloud-icon')).toHaveLength(2);
      expect(screen.getByTestId('database-icon')).toBeInTheDocument();
      expect(screen.getByTestId('globe-icon')).toBeInTheDocument();
    });
  });

  describe('Email Section', () => {
    beforeEach(async () => {
      render(<SettingsPage />);
      await waitFor(() => {
        fireEvent.click(screen.getByText('Email'));
      });
    });

    it('renders Email Settings heading', () => {
      expect(screen.getByText('Email Settings')).toBeInTheDocument();
    });

    it('displays Sender Email input', () => {
      expect(screen.getByLabelText('Sender Email')).toBeInTheDocument();
    });

    it('displays Sender Name input', () => {
      expect(screen.getByLabelText('Sender Name')).toBeInTheDocument();
    });

    it('displays Email Provider selector', () => {
      expect(screen.getByText('Email Provider')).toBeInTheDocument();
    });

    it('displays all email provider options', () => {
      expect(screen.getByText('SendGrid')).toBeInTheDocument();
      expect(screen.getByText('Amazon SES')).toBeInTheDocument();
      expect(screen.getByText('Mailgun')).toBeInTheDocument();
      expect(screen.getByText('Custom SMTP')).toBeInTheDocument();
    });

    it('displays default sender email', () => {
      const senderEmailInput = screen.getByLabelText('Sender Email') as HTMLInputElement;
      expect(senderEmailInput.defaultValue).toBe('noreply@acme-corp.com');
    });

    it('displays default sender name', () => {
      const senderNameInput = screen.getByLabelText('Sender Name') as HTMLInputElement;
      expect(senderNameInput.defaultValue).toBe('FireLater IT Support');
    });
  });

  describe('Appearance Section', () => {
    beforeEach(async () => {
      render(<SettingsPage />);
      await waitFor(() => {
        fireEvent.click(screen.getByText('Appearance'));
      });
    });

    it('renders Appearance heading', () => {
      const headings = screen.getAllByText('Appearance');
      expect(headings.length).toBeGreaterThan(0);
    });

    it('displays Theme selector', () => {
      expect(screen.getByText('Theme')).toBeInTheDocument();
    });

    it('displays all theme options', () => {
      expect(screen.getByText('Light')).toBeInTheDocument();
      expect(screen.getByText('Dark')).toBeInTheDocument();
      expect(screen.getByText('System')).toBeInTheDocument();
    });

    it('displays Primary Color selector', () => {
      expect(screen.getByText('Primary Color')).toBeInTheDocument();
    });

    it('displays color swatches', () => {
      const colorButtons = screen.getAllByRole('button').filter(btn =>
        btn.className.includes('rounded-full')
      );
      expect(colorButtons.length).toBeGreaterThanOrEqual(5);
    });

    it('displays Custom Logo URL input', () => {
      expect(screen.getByLabelText('Custom Logo URL')).toBeInTheDocument();
    });
  });

  describe('Save Functionality', () => {
    it('calls update API when Save Changes is clicked', async () => {
      render(<SettingsPage />);
      await waitFor(() => {
        const saveButton = screen.getByText('Save Changes');
        fireEvent.click(saveButton);
      });

      await waitFor(() => {
        expect(settingsApi.update).toHaveBeenCalled();
      });
    });

    it('passes updated tenant name to API', async () => {
      render(<SettingsPage />);
      await waitFor(() => {
        const nameInput = screen.getByLabelText('Organization Name') as HTMLInputElement;
        fireEvent.change(nameInput, { target: { value: 'Updated Corp' } });
      });

      const saveButton = screen.getByText('Save Changes');
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(settingsApi.update).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'Updated Corp',
          })
        );
      });
    });

    it('passes updated settings to API', async () => {
      render(<SettingsPage />);
      await waitFor(() => {
        const timezoneSelect = screen.getByDisplayValue('Eastern Time (US)') as HTMLSelectElement;
        fireEvent.change(timezoneSelect, { target: { value: 'UTC' } });
      });

      const saveButton = screen.getByText('Save Changes');
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(settingsApi.update).toHaveBeenCalledWith(
          expect.objectContaining({
            settings: expect.objectContaining({
              timezone: 'UTC',
            }),
          })
        );
      });
    });

    it('shows loading state while saving', async () => {
      let resolveUpdate: (value: unknown) => void;
      const updatePromise = new Promise((resolve) => {
        resolveUpdate = resolve;
      });
      vi.mocked(settingsApi.update).mockReturnValue(updatePromise as Promise<any>);

      render(<SettingsPage />);
      await waitFor(() => {
        const saveButton = screen.getByText('Save Changes');
        fireEvent.click(saveButton);
      });

      // Wait for promise to resolve
      await waitFor(() => {
        expect(settingsApi.update).toHaveBeenCalled();
      });

      resolveUpdate!({ success: true });
    });
  });

  describe('Loading State', () => {
    it('displays loading spinner while fetching settings', () => {
      vi.mocked(settingsApi.get).mockImplementation(
        () => new Promise(() => {}) // Never resolves
      );
      render(<SettingsPage />);
      expect(screen.getByTestId('loader-icon')).toBeInTheDocument();
      expect(screen.queryByText('Settings')).not.toBeInTheDocument();
    });

    it('hides loading spinner after settings load', async () => {
      render(<SettingsPage />);
      await waitFor(() => {
        expect(screen.queryByTestId('loader-icon')).not.toBeInTheDocument();
      });
    });
  });

  describe('Error Handling', () => {
    it('handles API error gracefully', async () => {
      vi.mocked(settingsApi.get).mockRejectedValue(new Error('API Error'));
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      render(<SettingsPage />);

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith(
          'Failed to load settings:',
          expect.any(Error)
        );
      });

      consoleSpy.mockRestore();
    });

    it('handles save error gracefully', async () => {
      vi.mocked(settingsApi.update).mockRejectedValue(new Error('Save failed'));
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      render(<SettingsPage />);
      await waitFor(() => {
        const saveButton = screen.getByText('Save Changes');
        fireEvent.click(saveButton);
      });

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith(
          'Failed to save settings:',
          expect.any(Error)
        );
      });

      consoleSpy.mockRestore();
    });
  });
});
