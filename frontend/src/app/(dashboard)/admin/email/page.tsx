'use client';

import { useState } from 'react';
import {
  Mail,
  Plus,
  Settings2,
  Trash2,
  Power,
  PowerOff,
  Copy,
  Check,
  AlertCircle,
  Clock,
  Filter,
  X,
  Info,
  RefreshCw,
} from 'lucide-react';
import {
  useEmailConfigs,
  useCreateEmailConfig,
  useUpdateEmailConfig,
  useDeleteEmailConfig,
  useEmailLogs,
  useWebhookUrls,
  EmailConfig,
  EmailLog,
  EmailProvider,
} from '@/hooks/useApi';
import { useApplications, useGroups } from '@/hooks/useApi';

type TabType = 'configs' | 'logs' | 'setup';

export default function EmailIntegrationPage() {
  const [activeTab, setActiveTab] = useState<TabType>('configs');
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [editingConfig, setEditingConfig] = useState<EmailConfig | null>(null);
  const [logFilters, setLogFilters] = useState({ configId: '', action: '', success: '' });

  const { data: configsData, isLoading: loadingConfigs } = useEmailConfigs();
  const { data: logsData, isLoading: loadingLogs } = useEmailLogs({
    configId: logFilters.configId || undefined,
    action: logFilters.action || undefined,
    success: logFilters.success ? logFilters.success === 'true' : undefined,
  });
  const { data: webhookData } = useWebhookUrls();

  const configs = configsData?.data || [];
  const logs = logsData?.data || [];
  const webhookUrls = webhookData?.data;

  const handleEdit = (config: EmailConfig) => {
    setEditingConfig(config);
    setShowConfigModal(true);
  };

  const handleCreate = () => {
    setEditingConfig(null);
    setShowConfigModal(true);
  };

  const tabs = [
    { id: 'configs' as TabType, label: 'Configurations', icon: Settings2 },
    { id: 'logs' as TabType, label: 'Email Logs', icon: Clock },
    { id: 'setup' as TabType, label: 'Setup Guide', icon: Info },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Email Integration</h1>
          <p className="mt-1 text-sm text-muted">
            Configure email-to-ticket integration for automatic issue creation
          </p>
        </div>
        <button
          onClick={handleCreate}
          className="inline-flex items-center px-4 py-2 border border-transparent rounded-xl shadow-sm text-sm font-medium text-white bg-primary hover:bg-primary-hover"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Configuration
        </button>
      </div>

      {/* Tabs */}
      <div className="border-b border-border">
        <nav className="-mb-px flex space-x-8">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                flex items-center py-4 px-1 border-b-2 font-medium text-sm
                ${
                  activeTab === tab.id
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted hover:text-secondary hover:border-border-strong'
                }
              `}
            >
              <tab.icon className="h-5 w-5 mr-2" />
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Content */}
      {activeTab === 'configs' && (
        <ConfigurationsTab
          configs={configs}
          loading={loadingConfigs}
          onEdit={handleEdit}
        />
      )}

      {activeTab === 'logs' && (
        <LogsTab
          logs={logs}
          loading={loadingLogs}
          configs={configs}
          filters={logFilters}
          onFilterChange={setLogFilters}
        />
      )}

      {activeTab === 'setup' && <SetupGuideTab webhookUrls={webhookUrls} />}

      {/* Config Modal */}
      {showConfigModal && (
        <ConfigModal
          config={editingConfig}
          onClose={() => {
            setShowConfigModal(false);
            setEditingConfig(null);
          }}
        />
      )}
    </div>
  );
}

// Configurations Tab
function ConfigurationsTab({
  configs,
  loading,
  onEdit,
}: {
  configs: EmailConfig[];
  loading: boolean;
  onEdit: (config: EmailConfig) => void;
}) {
  const updateConfig = useUpdateEmailConfig();
  const deleteConfig = useDeleteEmailConfig();

  const handleToggleActive = async (config: EmailConfig) => {
    await updateConfig.mutateAsync({
      id: config.id,
      data: { isActive: !config.is_active },
    });
  };

  const handleDelete = async (config: EmailConfig) => {
    if (confirm(`Are you sure you want to delete "${config.name}"? This action cannot be undone.`)) {
      await deleteConfig.mutateAsync(config.id);
    }
  };

  const providerColors: Record<EmailProvider, string> = {
    sendgrid: 'bg-primary-subtle text-primary',
    mailgun: 'bg-warning-subtle text-warning',
    postmark: 'bg-warning-subtle text-warning',
    smtp: 'bg-background text-secondary',
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="h-8 w-8 text-muted animate-spin" />
      </div>
    );
  }

  if (configs.length === 0) {
    return (
      <div className="text-center py-12">
        <Mail className="mx-auto h-12 w-12 text-muted" />
        <h3 className="mt-2 text-sm font-medium text-foreground">No email configurations</h3>
        <p className="mt-1 text-sm text-muted">
          Get started by creating a new email configuration.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-surface shadow overflow-hidden sm:rounded-xl">
      <ul className="divide-y divide-gray-200">
        {configs.map((config) => (
          <li key={config.id}>
            <div className="px-4 py-4 sm:px-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div
                    className={`p-2 rounded-lg ${
                      config.is_active ? 'bg-success-subtle' : 'bg-background'
                    }`}
                  >
                    <Mail
                      className={`h-5 w-5 ${
                        config.is_active ? 'text-success' : 'text-muted'
                      }`}
                    />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{config.name}</p>
                    <p className="text-sm text-muted">{config.email_address}</p>
                  </div>
                </div>
                <div className="flex items-center space-x-4">
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      providerColors[config.provider]
                    }`}
                  >
                    {config.provider}
                  </span>
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      config.is_active
                        ? 'bg-success-subtle text-success'
                        : 'bg-background text-secondary'
                    }`}
                  >
                    {config.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between">
                <div className="flex items-center space-x-6 text-sm text-muted">
                  <span>Priority: {config.default_priority}</span>
                  {config.auto_reply_enabled && (
                    <span className="flex items-center">
                      <Check className="h-4 w-4 text-success mr-1" />
                      Auto-reply
                    </span>
                  )}
                  {config.spam_filter_enabled && (
                    <span className="flex items-center">
                      <Check className="h-4 w-4 text-success mr-1" />
                      Spam filter
                    </span>
                  )}
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => handleToggleActive(config)}
                    className={`p-2 rounded-xl ${
                      config.is_active
                        ? 'text-success hover:bg-green-50'
                        : 'text-muted hover:bg-surface-hover'
                    }`}
                    title={config.is_active ? 'Deactivate' : 'Activate'}
                  >
                    {config.is_active ? (
                      <Power className="h-5 w-5" />
                    ) : (
                      <PowerOff className="h-5 w-5" />
                    )}
                  </button>
                  <button
                    onClick={() => onEdit(config)}
                    className="p-2 text-muted hover:text-secondary hover:bg-surface-hover rounded-xl"
                    title="Edit"
                  >
                    <Settings2 className="h-5 w-5" />
                  </button>
                  <button
                    onClick={() => handleDelete(config)}
                    className="p-2 text-error hover:text-error hover:bg-error-subtle rounded-xl"
                    title="Delete"
                  >
                    <Trash2 className="h-5 w-5" />
                  </button>
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Logs Tab
function LogsTab({
  logs,
  loading,
  configs,
  filters,
  onFilterChange,
}: {
  logs: EmailLog[];
  loading: boolean;
  configs: EmailConfig[];
  filters: { configId: string; action: string; success: string };
  onFilterChange: (filters: { configId: string; action: string; success: string }) => void;
}) {
  const actionColors: Record<string, string> = {
    created_issue: 'bg-success-subtle text-success',
    added_comment: 'bg-primary-subtle text-primary',
    rejected_spam: 'bg-warning-subtle text-warning',
    rejected_config_disabled: 'bg-background text-secondary',
    rejected_no_config: 'bg-warning-subtle text-warning',
    error: 'bg-error-subtle text-error',
  };

  const actionLabels: Record<string, string> = {
    created_issue: 'Created Issue',
    added_comment: 'Added Comment',
    rejected_spam: 'Rejected (Spam)',
    rejected_config_disabled: 'Rejected (Disabled)',
    rejected_no_config: 'Rejected (No Config)',
    error: 'Error',
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-surface shadow rounded-lg p-4">
        <div className="flex items-center space-x-4">
          <div className="flex items-center">
            <Filter className="h-5 w-5 text-muted mr-2" />
            <span className="text-sm font-medium text-secondary">Filters:</span>
          </div>
          <select
            value={filters.configId}
            onChange={(e) => onFilterChange({ ...filters, configId: e.target.value })}
            className="block rounded-xl border-border-strong shadow-sm focus:border-primary focus:ring-primary/20 focus:border-primary sm:text-sm"
          >
            <option value="">All Configurations</option>
            {configs.map((config) => (
              <option key={config.id} value={config.id}>
                {config.name}
              </option>
            ))}
          </select>
          <select
            value={filters.action}
            onChange={(e) => onFilterChange({ ...filters, action: e.target.value })}
            className="block rounded-xl border-border-strong shadow-sm focus:border-primary focus:ring-primary/20 focus:border-primary sm:text-sm"
          >
            <option value="">All Actions</option>
            <option value="created_issue">Created Issue</option>
            <option value="added_comment">Added Comment</option>
            <option value="rejected_spam">Rejected (Spam)</option>
            <option value="error">Error</option>
          </select>
          <select
            value={filters.success}
            onChange={(e) => onFilterChange({ ...filters, success: e.target.value })}
            className="block rounded-xl border-border-strong shadow-sm focus:border-primary focus:ring-primary/20 focus:border-primary sm:text-sm"
          >
            <option value="">All Results</option>
            <option value="true">Successful</option>
            <option value="false">Failed</option>
          </select>
          {(filters.configId || filters.action || filters.success) && (
            <button
              onClick={() => onFilterChange({ configId: '', action: '', success: '' })}
              className="text-sm text-muted hover:text-secondary"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Logs Table */}
      <div className="bg-surface shadow overflow-hidden sm:rounded-lg">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="h-8 w-8 text-muted animate-spin" />
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-12">
            <Clock className="mx-auto h-12 w-12 text-muted" />
            <h3 className="mt-2 text-sm font-medium text-foreground">No email logs</h3>
            <p className="mt-1 text-sm text-muted">
              Email processing logs will appear here.
            </p>
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-surface-hover">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                  From
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                  Subject
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                  Action
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                  Result
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                  Time
                </th>
              </tr>
            </thead>
            <tbody className="bg-surface divide-y divide-gray-200">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-surface-hover">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-foreground">
                      {log.from_name || log.from_email}
                    </div>
                    <div className="text-sm text-muted">{log.from_email}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-foreground truncate max-w-xs">
                      {log.subject || '(no subject)'}
                    </div>
                    {log.issue_number && (
                      <div className="text-sm text-primary">
                        Issue #{log.issue_number}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        actionColors[log.action] || 'bg-background text-secondary'
                      }`}
                    >
                      {actionLabels[log.action] || log.action}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {log.success ? (
                      <span className="inline-flex items-center text-success">
                        <Check className="h-4 w-4 mr-1" />
                        Success
                      </span>
                    ) : (
                      <span className="inline-flex items-center text-error">
                        <AlertCircle className="h-4 w-4 mr-1" />
                        Failed
                      </span>
                    )}
                    {log.error_message && (
                      <div className="text-xs text-error mt-1 truncate max-w-xs">
                        {log.error_message}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-muted">
                    {new Date(log.created_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// Setup Guide Tab
function SetupGuideTab({ webhookUrls }: { webhookUrls?: { sendgrid: string; mailgun: string; generic: string; instructions: { sendgrid: string; mailgun: string; generic: string } } }) {
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  const copyToClipboard = (url: string, provider: string) => {
    navigator.clipboard.writeText(url);
    setCopiedUrl(provider);
    setTimeout(() => setCopiedUrl(null), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Overview */}
      <div className="bg-surface shadow rounded-lg p-6">
        <h3 className="text-lg font-medium text-foreground mb-4">How Email-to-Ticket Works</h3>
        <div className="prose prose-sm text-secondary">
          <ol className="space-y-2">
            <li>Create an email configuration for each support email address you want to use</li>
            <li>Configure your email provider to forward incoming emails to our webhook URL</li>
            <li>When an email arrives, we automatically create a ticket or add a comment to an existing one</li>
            <li>Replies to tickets are matched using the issue number in the subject line</li>
          </ol>
        </div>
      </div>

      {/* Webhook URLs */}
      {webhookUrls && (
        <div className="bg-surface shadow rounded-lg p-6">
          <h3 className="text-lg font-medium text-foreground mb-4">Webhook URLs</h3>
          <p className="text-sm text-secondary mb-4">
            Use these URLs to configure your email provider to forward incoming emails.
          </p>
          <div className="space-y-4">
            {/* SendGrid */}
            <div className="border rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-medium text-foreground">SendGrid Inbound Parse</h4>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary-subtle text-primary">
                  Recommended
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <code className="flex-1 bg-surface-hover px-3 py-2 rounded text-sm text-secondary break-all">
                  {webhookUrls.sendgrid}
                </code>
                <button
                  onClick={() => copyToClipboard(webhookUrls.sendgrid, 'sendgrid')}
                  className="p-2 text-muted hover:text-secondary hover:bg-background rounded"
                >
                  {copiedUrl === 'sendgrid' ? (
                    <Check className="h-5 w-5 text-success" />
                  ) : (
                    <Copy className="h-5 w-5" />
                  )}
                </button>
              </div>
              <p className="mt-2 text-sm text-muted">{webhookUrls.instructions.sendgrid}</p>
            </div>

            {/* Mailgun */}
            <div className="border rounded-lg p-4">
              <h4 className="font-medium text-foreground mb-2">Mailgun Routes</h4>
              <div className="flex items-center space-x-2">
                <code className="flex-1 bg-surface-hover px-3 py-2 rounded text-sm text-secondary break-all">
                  {webhookUrls.mailgun}
                </code>
                <button
                  onClick={() => copyToClipboard(webhookUrls.mailgun, 'mailgun')}
                  className="p-2 text-muted hover:text-secondary hover:bg-background rounded"
                >
                  {copiedUrl === 'mailgun' ? (
                    <Check className="h-5 w-5 text-success" />
                  ) : (
                    <Copy className="h-5 w-5" />
                  )}
                </button>
              </div>
              <p className="mt-2 text-sm text-muted">{webhookUrls.instructions.mailgun}</p>
            </div>

            {/* Generic */}
            <div className="border rounded-lg p-4">
              <h4 className="font-medium text-foreground mb-2">Generic / Custom Integration</h4>
              <div className="flex items-center space-x-2">
                <code className="flex-1 bg-surface-hover px-3 py-2 rounded text-sm text-secondary break-all">
                  {webhookUrls.generic}
                </code>
                <button
                  onClick={() => copyToClipboard(webhookUrls.generic, 'generic')}
                  className="p-2 text-muted hover:text-secondary hover:bg-background rounded"
                >
                  {copiedUrl === 'generic' ? (
                    <Check className="h-5 w-5 text-success" />
                  ) : (
                    <Copy className="h-5 w-5" />
                  )}
                </button>
              </div>
              <p className="mt-2 text-sm text-muted">{webhookUrls.instructions.generic}</p>
            </div>
          </div>
        </div>
      )}

      {/* Provider Setup Instructions */}
      <div className="bg-surface shadow rounded-lg p-6">
        <h3 className="text-lg font-medium text-foreground mb-4">Provider Setup Instructions</h3>
        <div className="space-y-6">
          <div>
            <h4 className="font-medium text-foreground mb-2">SendGrid Inbound Parse</h4>
            <ol className="list-decimal list-inside text-sm text-secondary space-y-1">
              <li>Go to SendGrid Settings {'>'} Inbound Parse</li>
              <li>Add your domain and configure MX records</li>
              <li>Set the destination URL to our SendGrid webhook URL</li>
              <li>Enable &quot;POST the raw, full MIME message&quot; for attachments</li>
              <li>Check &quot;Send Raw&quot; if you need full email headers</li>
            </ol>
          </div>

          <div>
            <h4 className="font-medium text-foreground mb-2">Mailgun Routes</h4>
            <ol className="list-decimal list-inside text-sm text-secondary space-y-1">
              <li>Go to Mailgun {'>'} Receiving {'>'} Create Route</li>
              <li>Set expression type to &quot;Match Recipient&quot; with your support email</li>
              <li>Add a &quot;Forward&quot; action with our Mailgun webhook URL</li>
              <li>Set priority and save the route</li>
            </ol>
          </div>

          <div>
            <h4 className="font-medium text-foreground mb-2">Custom SMTP / Forwarding</h4>
            <ol className="list-decimal list-inside text-sm text-secondary space-y-1">
              <li>Configure your mail server to forward emails to a processing script</li>
              <li>Use the generic webhook URL with JSON payload</li>
              <li>
                Required fields: <code className="bg-background px-1 rounded">from</code>,{' '}
                <code className="bg-background px-1 rounded">to</code>,{' '}
                <code className="bg-background px-1 rounded">subject</code>
              </li>
              <li>
                Optional: <code className="bg-background px-1 rounded">textBody</code>,{' '}
                <code className="bg-background px-1 rounded">htmlBody</code>,{' '}
                <code className="bg-background px-1 rounded">messageId</code>,{' '}
                <code className="bg-background px-1 rounded">inReplyTo</code>
              </li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}

// Config Modal
function ConfigModal({
  config,
  onClose,
}: {
  config: EmailConfig | null;
  onClose: () => void;
}) {
  const createConfig = useCreateEmailConfig();
  const updateConfig = useUpdateEmailConfig();
  const { data: appsData } = useApplications();
  const { data: groupsData } = useGroups();

  const applications = appsData?.data || [];
  const groups = groupsData?.data || [];

  const [formData, setFormData] = useState({
    name: config?.name || '',
    emailAddress: config?.email_address || '',
    provider: config?.provider || 'sendgrid' as EmailProvider,
    defaultPriority: config?.default_priority || 'medium' as 'low' | 'medium' | 'high' | 'critical',
    defaultApplicationId: config?.default_application_id || '',
    defaultAssignedGroup: config?.default_assigned_group || '',
    autoReplyEnabled: config?.auto_reply_enabled || false,
    autoReplyTemplate: config?.auto_reply_template || '',
    spamFilterEnabled: config?.spam_filter_enabled ?? true,
    allowedDomains: config?.allowed_domains?.join('\n') || '',
    blockedDomains: config?.blocked_domains?.join('\n') || '',
  });

  const [activeSettingsTab, setActiveSettingsTab] = useState<'general' | 'defaults' | 'spam' | 'autoreply'>('general');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const data = {
      name: formData.name,
      emailAddress: formData.emailAddress,
      provider: formData.provider,
      defaultPriority: formData.defaultPriority,
      defaultApplicationId: formData.defaultApplicationId || undefined,
      defaultAssignedGroup: formData.defaultAssignedGroup || undefined,
      autoReplyEnabled: formData.autoReplyEnabled,
      autoReplyTemplate: formData.autoReplyTemplate || undefined,
      spamFilterEnabled: formData.spamFilterEnabled,
      allowedDomains: formData.allowedDomains.split('\n').filter(Boolean),
      blockedDomains: formData.blockedDomains.split('\n').filter(Boolean),
    };

    if (config) {
      await updateConfig.mutateAsync({ id: config.id, data });
    } else {
      await createConfig.mutateAsync(data);
    }

    onClose();
  };

  const settingsTabs = [
    { id: 'general' as const, label: 'General' },
    { id: 'defaults' as const, label: 'Defaults' },
    { id: 'spam' as const, label: 'Spam Filter' },
    { id: 'autoreply' as const, label: 'Auto-Reply' },
  ];

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 transition-opacity" onClick={onClose}>
          <div className="absolute inset-0 bg-surface-hover0 opacity-75" />
        </div>

        <div className="inline-block align-bottom bg-surface rounded-lg px-4 pt-5 pb-4 text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-foreground">
              {config ? 'Edit Email Configuration' : 'New Email Configuration'}
            </h3>
            <button onClick={onClose} className="text-muted hover:text-muted">
              <X className="h-6 w-6" />
            </button>
          </div>

          {/* Settings Tabs */}
          <div className="border-b border-border mb-4">
            <nav className="-mb-px flex space-x-4">
              {settingsTabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveSettingsTab(tab.id)}
                  className={`
                    py-2 px-1 border-b-2 font-medium text-sm
                    ${
                      activeSettingsTab === tab.id
                        ? 'border-primary text-primary'
                        : 'border-transparent text-muted hover:text-secondary hover:border-border-strong'
                    }
                  `}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* General Tab */}
            {activeSettingsTab === 'general' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-secondary">Name</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="mt-1 block w-full rounded-xl border-border-strong shadow-sm focus:border-primary focus:ring-primary/20 focus:border-primary sm:text-sm"
                    placeholder="Support Inbox"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-secondary">Email Address</label>
                  <input
                    type="email"
                    required
                    disabled={!!config}
                    value={formData.emailAddress}
                    onChange={(e) => setFormData({ ...formData, emailAddress: e.target.value })}
                    className="mt-1 block w-full rounded-xl border-border-strong shadow-sm focus:border-primary focus:ring-primary/20 focus:border-primary sm:text-sm disabled:bg-background"
                    placeholder="support@company.com"
                  />
                  {config && (
                    <p className="mt-1 text-xs text-muted">Email address cannot be changed</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-secondary">Provider</label>
                  <select
                    value={formData.provider}
                    onChange={(e) =>
                      setFormData({ ...formData, provider: e.target.value as EmailProvider })
                    }
                    className="mt-1 block w-full rounded-xl border-border-strong shadow-sm focus:border-primary focus:ring-primary/20 focus:border-primary sm:text-sm"
                  >
                    <option value="sendgrid">SendGrid</option>
                    <option value="mailgun">Mailgun</option>
                    <option value="postmark">Postmark</option>
                    <option value="smtp">Custom SMTP</option>
                  </select>
                </div>
              </>
            )}

            {/* Defaults Tab */}
            {activeSettingsTab === 'defaults' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-secondary">
                    Default Priority
                  </label>
                  <select
                    value={formData.defaultPriority}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        defaultPriority: e.target.value as 'low' | 'medium' | 'high' | 'critical',
                      })
                    }
                    className="mt-1 block w-full rounded-xl border-border-strong shadow-sm focus:border-primary focus:ring-primary/20 focus:border-primary sm:text-sm"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-secondary">
                    Default Application
                  </label>
                  <select
                    value={formData.defaultApplicationId}
                    onChange={(e) =>
                      setFormData({ ...formData, defaultApplicationId: e.target.value })
                    }
                    className="mt-1 block w-full rounded-xl border-border-strong shadow-sm focus:border-primary focus:ring-primary/20 focus:border-primary sm:text-sm"
                  >
                    <option value="">None</option>
                    {applications.map((app: { id: string; name: string }) => (
                      <option key={app.id} value={app.id}>
                        {app.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-secondary">
                    Default Assigned Group
                  </label>
                  <select
                    value={formData.defaultAssignedGroup}
                    onChange={(e) =>
                      setFormData({ ...formData, defaultAssignedGroup: e.target.value })
                    }
                    className="mt-1 block w-full rounded-xl border-border-strong shadow-sm focus:border-primary focus:ring-primary/20 focus:border-primary sm:text-sm"
                  >
                    <option value="">None</option>
                    {groups.map((group: { id: string; name: string }) => (
                      <option key={group.id} value={group.id}>
                        {group.name}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {/* Spam Filter Tab */}
            {activeSettingsTab === 'spam' && (
              <>
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.spamFilterEnabled}
                    onChange={(e) =>
                      setFormData({ ...formData, spamFilterEnabled: e.target.checked })
                    }
                    className="h-4 w-4 text-primary focus:ring-primary/20 focus:border-primary border-border-strong rounded"
                  />
                  <label className="ml-2 block text-sm text-foreground">Enable spam filtering</label>
                </div>

                {formData.spamFilterEnabled && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-secondary">
                        Allowed Domains (one per line)
                      </label>
                      <textarea
                        value={formData.allowedDomains}
                        onChange={(e) =>
                          setFormData({ ...formData, allowedDomains: e.target.value })
                        }
                        rows={3}
                        className="mt-1 block w-full rounded-xl border-border-strong shadow-sm focus:border-primary focus:ring-primary/20 focus:border-primary sm:text-sm"
                        placeholder="company.com&#10;partner.com"
                      />
                      <p className="mt-1 text-xs text-muted">
                        If specified, only emails from these domains will be accepted
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-secondary">
                        Blocked Domains (one per line)
                      </label>
                      <textarea
                        value={formData.blockedDomains}
                        onChange={(e) =>
                          setFormData({ ...formData, blockedDomains: e.target.value })
                        }
                        rows={3}
                        className="mt-1 block w-full rounded-xl border-border-strong shadow-sm focus:border-primary focus:ring-primary/20 focus:border-primary sm:text-sm"
                        placeholder="spam.com&#10;blocked.org"
                      />
                      <p className="mt-1 text-xs text-muted">
                        Emails from these domains will be rejected
                      </p>
                    </div>
                  </>
                )}
              </>
            )}

            {/* Auto-Reply Tab */}
            {activeSettingsTab === 'autoreply' && (
              <>
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.autoReplyEnabled}
                    onChange={(e) =>
                      setFormData({ ...formData, autoReplyEnabled: e.target.checked })
                    }
                    className="h-4 w-4 text-primary focus:ring-primary/20 focus:border-primary border-border-strong rounded"
                  />
                  <label className="ml-2 block text-sm text-foreground">
                    Send auto-reply when ticket is created
                  </label>
                </div>

                {formData.autoReplyEnabled && (
                  <div>
                    <label className="block text-sm font-medium text-secondary">
                      Auto-Reply Template
                    </label>
                    <textarea
                      value={formData.autoReplyTemplate}
                      onChange={(e) =>
                        setFormData({ ...formData, autoReplyTemplate: e.target.value })
                      }
                      rows={6}
                      className="mt-1 block w-full rounded-xl border-border-strong shadow-sm focus:border-primary focus:ring-primary/20 focus:border-primary sm:text-sm"
                      placeholder="Thank you for contacting support. We have received your request and will respond shortly.&#10;&#10;Your ticket number is: {{issue_number}}"
                    />
                    <p className="mt-1 text-xs text-muted">
                      Available variables: {'{{issue_number}}'}, {'{{subject}}'}, {'{{from_email}}'}
                    </p>
                  </div>
                )}
              </>
            )}

            {/* Actions */}
            <div className="mt-6 flex justify-end space-x-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-border-strong rounded-xl shadow-sm text-sm font-medium text-secondary bg-surface hover:bg-surface-hover"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={createConfig.isPending || updateConfig.isPending}
                className="px-4 py-2 border border-transparent rounded-xl shadow-sm text-sm font-medium text-white bg-primary hover:bg-primary-hover disabled:opacity-50"
              >
                {createConfig.isPending || updateConfig.isPending
                  ? 'Saving...'
                  : config
                  ? 'Save Changes'
                  : 'Create Configuration'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
