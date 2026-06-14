'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Plus,
  Search,
  FileText,
  BarChart2,
  PieChart,
  TrendingUp,
  Calendar,
  Clock,
  Download,
  Play,
  MoreHorizontal,
  Trash2,
  Edit,
  Settings,
  RefreshCw,
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader2,
  Pause,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  useReportTemplates,
  useReportExecutions,
  useReportSchedules,
  useExecuteReport,
  useDeleteReportTemplate,
  useDeleteReportSchedule,
  useUpdateReportSchedule,
} from '@/hooks/useApi';

type TabType = 'templates' | 'history' | 'scheduled';

interface ReportTemplate {
  id: string;
  name: string;
  description?: string;
  report_type: string;
  output_format?: string;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

interface ReportExecution {
  id: string;
  template_id: string;
  template_name?: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  output_format: string;
  output_url?: string;
  file_size?: number;
  started_at?: string;
  completed_at?: string;
  error_message?: string;
  created_at: string;
}

interface ReportSchedule {
  id: string;
  template_id: string;
  template_name?: string;
  name: string;
  schedule_type: 'daily' | 'weekly' | 'monthly' | 'custom';
  cron_expression?: string;
  delivery_method: 'email' | 'webhook' | 'slack';
  recipients: string[];
  is_active: boolean;
  next_run_at?: string;
  last_run_at?: string;
  created_at: string;
}

const typeIcons: Record<string, typeof FileText> = {
  issues: AlertCircle,
  changes: TrendingUp,
  applications: PieChart,
  sla: Clock,
  requests: FileText,
  custom: BarChart2,
};

const typeColors: Record<string, string> = {
  issues: 'bg-error-subtle text-error',
  changes: 'bg-warning-subtle text-yellow-600',
  applications: 'bg-info-subtle text-primary',
  sla: 'bg-info-subtle text-purple-600',
  requests: 'bg-success-subtle text-success',
  custom: 'bg-background text-secondary',
};

export default function ReportsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<TabType>('templates');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);

  const { data: templatesData, isLoading: templatesLoading } = useReportTemplates();
  const { data: executionsData, isLoading: executionsLoading } = useReportExecutions();
  const { data: schedulesData, isLoading: schedulesLoading } = useReportSchedules();

  const executeReport = useExecuteReport();
  const deleteTemplate = useDeleteReportTemplate();
  const deleteSchedule = useDeleteReportSchedule();
  const updateSchedule = useUpdateReportSchedule();

  const templates: ReportTemplate[] = templatesData?.data || [];
  const executions: ReportExecution[] = executionsData?.data || [];
  const schedules: ReportSchedule[] = schedulesData?.data || [];

  const filteredTemplates = templates.filter(
    (t) =>
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '-';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleRunReport = async (templateId: string) => {
    try {
      await executeReport.mutateAsync({ templateId });
    } catch (error) {
      console.error('Failed to run report:', error);
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    try {
      await deleteTemplate.mutateAsync(id);
      setShowDeleteConfirm(null);
    } catch (error) {
      console.error('Failed to delete template:', error);
    }
  };

  const handleToggleSchedule = async (schedule: ReportSchedule) => {
    try {
      await updateSchedule.mutateAsync({
        id: schedule.id,
        data: { isActive: !schedule.is_active },
      });
    } catch (error) {
      console.error('Failed to toggle schedule:', error);
    }
  };

  const handleDeleteSchedule = async (id: string) => {
    try {
      await deleteSchedule.mutateAsync(id);
      setShowDeleteConfirm(null);
    } catch (error) {
      console.error('Failed to delete schedule:', error);
    }
  };

  const statusIcons: Record<string, typeof CheckCircle> = {
    completed: CheckCircle,
    failed: XCircle,
    running: RefreshCw,
    pending: Clock,
  };

  const statusColors: Record<string, string> = {
    completed: 'text-green-500',
    failed: 'text-red-500',
    running: 'text-primary animate-spin',
    pending: 'text-muted',
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Reports</h1>
          <p className="mt-1 text-sm text-muted">Generate and schedule reports</p>
        </div>
        <Link href="/reports/builder">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Create Report
          </Button>
        </Link>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
        <input
          type="text"
          placeholder="Search reports..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2 border border-border-strong rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        />
      </div>

      {/* Tabs */}
      <div className="border-b border-border">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('templates')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'templates'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted hover:text-secondary hover:border-border-strong'
            }`}
          >
            Report Templates
            {templates.length > 0 && (
              <span className="ml-2 bg-background text-secondary px-2 py-0.5 rounded-full text-xs">
                {templates.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'history'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted hover:text-secondary hover:border-border-strong'
            }`}
          >
            Report History
          </button>
          <button
            onClick={() => setActiveTab('scheduled')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'scheduled'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted hover:text-secondary hover:border-border-strong'
            }`}
          >
            Scheduled Reports
            {schedules.filter((s) => s.is_active).length > 0 && (
              <span className="ml-2 bg-success-subtle text-success px-2 py-0.5 rounded-full text-xs">
                {schedules.filter((s) => s.is_active).length} active
              </span>
            )}
          </button>
        </nav>
      </div>

      {/* Templates Tab */}
      {activeTab === 'templates' && (
        <div>
          {templatesLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted" />
            </div>
          ) : filteredTemplates.length === 0 ? (
            <div className="text-center py-12 bg-surface rounded-lg shadow">
              <FileText className="mx-auto h-12 w-12 text-muted" />
              <h3 className="mt-2 text-sm font-medium text-foreground">No report templates</h3>
              <p className="mt-1 text-sm text-muted">
                Get started by creating a new report template.
              </p>
              <div className="mt-6">
                <Link href="/reports/builder">
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Report
                  </Button>
                </Link>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredTemplates.map((template) => {
                const Icon = typeIcons[template.report_type] || FileText;
                const colorClass = typeColors[template.report_type] || typeColors.custom;
                return (
                  <div key={template.id} className="bg-surface rounded-lg shadow p-6 relative group">
                    <div className="flex items-start justify-between">
                      <div className={`h-10 w-10 rounded-lg ${colorClass} flex items-center justify-center`}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="relative">
                        <button className="text-muted hover:text-secondary p-1">
                          <MoreHorizontal className="h-5 w-5" />
                        </button>
                        <div className="absolute right-0 mt-1 w-48 bg-surface rounded-lg shadow-lg border border-border hidden group-hover:block z-10">
                          <Link
                            href={`/reports/${template.id}`}
                            className="block px-4 py-2 text-sm text-secondary hover:bg-background"
                          >
                            <Edit className="h-4 w-4 inline mr-2" />
                            Edit
                          </Link>
                          <button
                            onClick={() => setShowDeleteConfirm(template.id)}
                            className="w-full text-left px-4 py-2 text-sm text-error hover:bg-red-50"
                          >
                            <Trash2 className="h-4 w-4 inline mr-2" />
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                    <h3 className="mt-4 font-medium text-foreground">{template.name}</h3>
                    <p className="mt-1 text-sm text-muted line-clamp-2">
                      {template.description || 'No description'}
                    </p>
                    <div className="mt-4 flex items-center text-xs text-muted">
                      <Clock className="h-3 w-3 mr-1" />
                      Updated {formatDate(template.updated_at)}
                    </div>
                    <div className="mt-4 flex space-x-2">
                      <Button
                        size="sm"
                        className="flex-1"
                        onClick={() => handleRunReport(template.id)}
                        disabled={executeReport.isPending}
                      >
                        {executeReport.isPending ? (
                          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                        ) : (
                          <Play className="h-4 w-4 mr-1" />
                        )}
                        Run Now
                      </Button>
                      <Link href={`/reports/${template.id}/schedule`}>
                        <Button size="sm" variant="outline">
                          <Calendar className="h-4 w-4" />
                        </Button>
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* History Tab */}
      {activeTab === 'history' && (
        <div className="bg-surface rounded-lg shadow overflow-hidden">
          {executionsLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted" />
            </div>
          ) : executions.length === 0 ? (
            <div className="text-center py-12">
              <Clock className="mx-auto h-12 w-12 text-muted" />
              <h3 className="mt-2 text-sm font-medium text-foreground">No report history</h3>
              <p className="mt-1 text-sm text-muted">Run a report to see execution history.</p>
            </div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-background">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                    Report
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                    Generated
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                    Format
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                    Size
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-muted uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-surface divide-y divide-gray-200">
                {executions.map((execution) => {
                  const StatusIcon = statusIcons[execution.status] || Clock;
                  return (
                    <tr key={execution.id} className="hover:bg-background">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <FileText className="h-5 w-5 text-muted mr-3" />
                          <span className="text-sm font-medium text-foreground">
                            {execution.template_name || 'Unknown Report'}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`flex items-center text-sm ${statusColors[execution.status]}`}>
                          <StatusIcon className="h-4 w-4 mr-1" />
                          {execution.status.charAt(0).toUpperCase() + execution.status.slice(1)}
                        </span>
                        {execution.error_message && (
                          <p className="text-xs text-red-500 mt-1 truncate max-w-xs">
                            {execution.error_message}
                          </p>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-muted">
                        {execution.completed_at
                          ? formatDate(execution.completed_at)
                          : formatDate(execution.created_at)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-background text-foreground uppercase">
                          {execution.output_format}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-muted">
                        {formatFileSize(execution.file_size)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        {execution.status === 'completed' && execution.output_url && (
                          <a
                            href={execution.output_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center px-3 py-1.5 border border-border-strong rounded-lg text-sm font-medium text-secondary bg-surface hover:bg-background"
                          >
                            <Download className="h-4 w-4 mr-1" />
                            Download
                          </a>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Scheduled Tab */}
      {activeTab === 'scheduled' && (
        <div className="bg-surface rounded-lg shadow overflow-hidden">
          {schedulesLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted" />
            </div>
          ) : schedules.length === 0 ? (
            <div className="text-center py-12">
              <Calendar className="mx-auto h-12 w-12 text-muted" />
              <h3 className="mt-2 text-sm font-medium text-foreground">No scheduled reports</h3>
              <p className="mt-1 text-sm text-muted">
                Schedule a report from the templates tab.
              </p>
            </div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-background">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                    Report
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                    Schedule
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                    Delivery
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                    Next Run
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-muted uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-surface divide-y divide-gray-200">
                {schedules.map((schedule) => (
                  <tr key={schedule.id} className="hover:bg-background">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm font-medium text-foreground">{schedule.name}</span>
                      {schedule.template_name && (
                        <p className="text-xs text-muted">{schedule.template_name}</p>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-muted">
                      {schedule.schedule_type.charAt(0).toUpperCase() + schedule.schedule_type.slice(1)}
                      {schedule.cron_expression && (
                        <p className="text-xs text-muted">{schedule.cron_expression}</p>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-muted">
                        <span className="capitalize">{schedule.delivery_method}</span>
                        {schedule.recipients.length > 0 && (
                          <p className="text-xs text-muted">
                            {schedule.recipients.slice(0, 2).join(', ')}
                            {schedule.recipients.length > 2 && ` +${schedule.recipients.length - 2}`}
                          </p>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-muted">
                      {schedule.next_run_at ? formatDate(schedule.next_run_at) : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          schedule.is_active
                            ? 'bg-success-subtle text-success'
                            : 'bg-background text-foreground'
                        }`}
                      >
                        {schedule.is_active ? 'Active' : 'Paused'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end space-x-2">
                        <button
                          onClick={() => handleToggleSchedule(schedule)}
                          className={`p-1.5 rounded ${
                            schedule.is_active
                              ? 'text-yellow-600 hover:bg-yellow-50'
                              : 'text-success hover:bg-green-50'
                          }`}
                          title={schedule.is_active ? 'Pause' : 'Activate'}
                        >
                          {schedule.is_active ? (
                            <Pause className="h-4 w-4" />
                          ) : (
                            <Play className="h-4 w-4" />
                          )}
                        </button>
                        <Link
                          href={`/reports/${schedule.template_id}/schedule/${schedule.id}`}
                          className="p-1.5 text-muted hover:text-secondary hover:bg-background rounded"
                        >
                          <Settings className="h-4 w-4" />
                        </Link>
                        <button
                          onClick={() => setShowDeleteConfirm(schedule.id)}
                          className="p-1.5 text-red-400 hover:text-error hover:bg-red-50 rounded"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center">
            <div className="fixed inset-0 transition-opacity" onClick={() => setShowDeleteConfirm(null)}>
              <div className="absolute inset-0 bg-background0 opacity-75" />
            </div>
            <div className="inline-block bg-surface rounded-lg px-4 pt-5 pb-4 text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:p-6 sm:max-w-lg sm:w-full">
              <div className="sm:flex sm:items-start">
                <div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-error-subtle sm:mx-0 sm:h-10 sm:w-10">
                  <Trash2 className="h-6 w-6 text-error" />
                </div>
                <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left">
                  <h3 className="text-lg leading-6 font-medium text-foreground">Delete Confirmation</h3>
                  <div className="mt-2">
                    <p className="text-sm text-muted">
                      Are you sure you want to delete this item? This action cannot be undone.
                    </p>
                  </div>
                </div>
              </div>
              <div className="mt-5 sm:mt-4 sm:flex sm:flex-row-reverse">
                <button
                  type="button"
                  onClick={() => {
                    if (activeTab === 'templates') {
                      handleDeleteTemplate(showDeleteConfirm);
                    } else if (activeTab === 'scheduled') {
                      handleDeleteSchedule(showDeleteConfirm);
                    }
                  }}
                  className="w-full inline-flex justify-center rounded-lg border border-transparent shadow-sm px-4 py-2 bg-primary text-base font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 sm:ml-3 sm:w-auto sm:text-sm"
                >
                  Delete
                </button>
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(null)}
                  className="mt-3 w-full inline-flex justify-center rounded-lg border border-border-strong shadow-sm px-4 py-2 bg-surface text-base font-medium text-secondary hover:bg-background focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary/20 focus:border-primary sm:mt-0 sm:w-auto sm:text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
