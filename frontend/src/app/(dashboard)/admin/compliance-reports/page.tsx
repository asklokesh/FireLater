'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  BarChart2,
  Plus,
  Download,
  Loader2,
  XCircle,
  Calendar,
  Clock,
  CheckCircle,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';

type ReportType =
  | 'change_success_rate'
  | 'unauthorized_changes'
  | 'emergency_change_usage'
  | 'sod_violation_attempts'
  | 'access_recertification_status'
  | 'sla_breach_evidence';

interface ReportResult {
  reportType: ReportType;
  generatedAt: string;
  params: { from: string; to: string };
  summary: Record<string, unknown>;
  data: Record<string, unknown>[];
}

interface ReportSchedule {
  id: string;
  report_type: ReportType;
  name: string;
  cadence: 'daily' | 'weekly' | 'monthly' | 'quarterly';
  recipients: string[];
  is_active: boolean;
  last_run_at: string | null;
  created_at: string;
}

interface ReportRun {
  id: string;
  report_type: ReportType;
  status: 'pending' | 'success' | 'failed';
  generated_at: string;
  duration_ms?: number;
}

const reportTypeLabels: Record<ReportType, string> = {
  change_success_rate: 'Change Success Rate (SOX ITGC)',
  unauthorized_changes: 'Unauthorized Changes (SOX)',
  emergency_change_usage: 'Emergency Change Usage (FFIEC)',
  sod_violation_attempts: 'SoD Violation Attempts (SOX)',
  access_recertification_status: 'Access Recertification Status (GLBA)',
  sla_breach_evidence: 'SLA Breach Evidence (DORA/FFIEC)',
};

const cadenceLabels: Record<string, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
};

const statusColors: Record<string, { bg: string; text: string; icon: typeof CheckCircle }> = {
  success: { bg: 'bg-green-100', text: 'text-green-800', icon: CheckCircle },
  pending: { bg: 'bg-yellow-100', text: 'text-yellow-800', icon: Clock },
  failed: { bg: 'bg-red-100', text: 'text-red-800', icon: AlertCircle },
};

export default function ComplianceReportsPage() {
  const [activeTab, setActiveTab] = useState<'generate' | 'schedules' | 'history'>('generate');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reportResult, setReportResult] = useState<ReportResult | null>(null);
  const [schedules, setSchedules] = useState<ReportSchedule[]>([]);
  const [runs, setRuns] = useState<ReportRun[]>([]);

  // Generate form state
  const [reportType, setReportType] = useState<ReportType>('change_success_rate');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  // Schedule modal state
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduleForm, setScheduleForm] = useState({
    reportType: 'change_success_rate' as ReportType,
    name: '',
    cadence: 'weekly' as const,
    recipients: '',
  });
  const [isSubmittingSchedule, setIsSubmittingSchedule] = useState(false);

  useEffect(() => {
    const today = new Date();
    const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
    setFromDate(thirtyDaysAgo.toISOString().split('T')[0]);
    setToDate(today.toISOString().split('T')[0]);
  }, []);

  const loadSchedules = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await api.get('/v1/compliance-reports/schedules');
      setSchedules(response.data.data || []);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load schedules';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadRuns = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await api.get('/v1/compliance-reports/runs');
      setRuns(response.data.data || []);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load run history';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'schedules') {
      loadSchedules();
    } else if (activeTab === 'history') {
      loadRuns();
    }
  }, [activeTab, loadSchedules, loadRuns]);

  const handleGenerateReport = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsGenerating(true);

    try {
      const response = await api.post('/v1/compliance-reports/generate', {
        reportType,
        from: fromDate,
        to: toDate,
      });
      setReportResult(response.data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate report';
      setError(message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCreateSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingSchedule(true);

    try {
      await api.post('/v1/compliance-reports/schedules', {
        reportType: scheduleForm.reportType,
        name: scheduleForm.name,
        cadence: scheduleForm.cadence,
        recipients: scheduleForm.recipients.split(',').map((e) => e.trim()),
      });
      setShowScheduleModal(false);
      setScheduleForm({
        reportType: 'change_success_rate',
        name: '',
        cadence: 'weekly',
        recipients: '',
      });
      loadSchedules();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create schedule';
      setError(message);
    } finally {
      setIsSubmittingSchedule(false);
    }
  };

  const handleToggleSchedule = async (id: string, isActive: boolean) => {
    try {
      await api.patch(`/v1/compliance-reports/schedules/${id}`, { is_active: !isActive });
      loadSchedules();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update schedule';
      setError(message);
    }
  };

  const handleExportCSV = async () => {
    if (!reportResult) return;
    try {
      const response = await api.get('/v1/compliance-reports/export/' + reportResult.reportType, {
        params: { from: reportResult.params.from, to: reportResult.params.to, format: 'csv' },
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(response.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${reportResult.reportType}-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to export CSV';
      setError(message);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (isLoading && activeTab !== 'generate') {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="flex items-center gap-2 p-4 text-sm text-red-800 bg-red-100 rounded-md">
          <XCircle className="h-4 w-4" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto text-red-600 hover:text-red-800">
            Dismiss
          </button>
        </div>
      )}

      <div>
        <div className="flex items-center gap-2 mb-2">
          <BarChart2 className="h-6 w-6 text-gray-700" />
          <h1 className="text-2xl font-bold text-gray-900">Compliance Reports</h1>
        </div>
        <p className="text-sm text-gray-500">SOX ITGC, PCI-DSS, FFIEC, and DORA compliance reporting</p>
      </div>

      <div className="bg-white rounded-lg shadow">
        <div className="border-b border-gray-200 flex">
          <button
            onClick={() => setActiveTab('generate')}
            className={`flex-1 px-6 py-3 text-sm font-medium border-b-2 ${
              activeTab === 'generate'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            Generate Report
          </button>
          <button
            onClick={() => setActiveTab('schedules')}
            className={`flex-1 px-6 py-3 text-sm font-medium border-b-2 ${
              activeTab === 'schedules'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            Schedules
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`flex-1 px-6 py-3 text-sm font-medium border-b-2 ${
              activeTab === 'history'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            Run History
          </button>
        </div>

        <div className="p-6">
          {activeTab === 'generate' && (
            <div className="space-y-6">
              <form onSubmit={handleGenerateReport} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Report Type</label>
                  <select
                    value={reportType}
                    onChange={(e) => setReportType(e.target.value as ReportType)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {Object.entries(reportTypeLabels).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">From Date</label>
                    <input
                      type="date"
                      value={fromDate}
                      onChange={(e) => setFromDate(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">To Date</label>
                    <input
                      type="date"
                      value={toDate}
                      onChange={(e) => setToDate(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <Button disabled={isGenerating} className="w-full">
                  {isGenerating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Generate Report
                </Button>
              </form>

              {reportResult && (
                <div className="space-y-4 border-t border-gray-200 pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-medium text-gray-900">Report Generated</h3>
                      <p className="text-sm text-gray-500">{formatDate(reportResult.generatedAt)}</p>
                    </div>
                    <Button variant="outline" onClick={handleExportCSV}>
                      <Download className="h-4 w-4 mr-2" />
                      Export CSV
                    </Button>
                  </div>

                  <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                    <h4 className="font-medium text-gray-900">Summary</h4>
                    {Object.entries(reportResult.summary).map(([key, value]) => (
                      <div key={key} className="flex justify-between text-sm">
                        <span className="text-gray-600">{key}:</span>
                        <span className="font-medium text-gray-900">{String(value)}</span>
                      </div>
                    ))}
                  </div>

                  {reportResult.data.length > 0 && (
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200 border border-gray-200 rounded-lg">
                        <thead className="bg-gray-50">
                          <tr>
                            {Object.keys(reportResult.data[0]).map((key) => (
                              <th
                                key={key}
                                className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase tracking-wider"
                              >
                                {key}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {reportResult.data.map((row, idx) => (
                            <tr key={idx} className="hover:bg-gray-50">
                              {Object.values(row).map((cell, cellIdx) => (
                                <td key={cellIdx} className="px-4 py-2 text-sm text-gray-900">
                                  {String(cell)}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {activeTab === 'schedules' && (
            <div className="space-y-4">
              <div className="flex justify-end">
                <Button onClick={() => setShowScheduleModal(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Schedule
                </Button>
              </div>

              {schedules.length === 0 ? (
                <div className="text-center py-12">
                  <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500">No schedules created yet</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Name
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Report Type
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Cadence
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Recipients
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Last Run
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {schedules.map((schedule) => (
                        <tr key={schedule.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 text-sm font-medium text-gray-900">{schedule.name}</td>
                          <td className="px-6 py-4 text-sm text-gray-600">
                            {reportTypeLabels[schedule.report_type]}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-600">
                            {cadenceLabels[schedule.cadence]}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-600">{schedule.recipients.join(', ')}</td>
                          <td className="px-6 py-4 text-sm text-gray-600">
                            {schedule.last_run_at ? formatDate(schedule.last_run_at) : '-'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <button
                              onClick={() => handleToggleSchedule(schedule.id, schedule.is_active)}
                              className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium cursor-pointer ${
                                schedule.is_active
                                  ? 'bg-green-100 text-green-800'
                                  : 'bg-gray-100 text-gray-800'
                              }`}
                            >
                              {schedule.is_active ? 'Active' : 'Inactive'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === 'history' && (
            <div className="space-y-4">
              {runs.length === 0 ? (
                <div className="text-center py-12">
                  <Clock className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500">No report runs yet</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Report Type
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Generated At
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Duration
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {runs.map((run) => {
                        const StatusIcon = statusColors[run.status]?.icon || Clock;
                        const statusConfig = statusColors[run.status];
                        return (
                          <tr key={run.id} className="hover:bg-gray-50">
                            <td className="px-6 py-4 text-sm text-gray-900">
                              {reportTypeLabels[run.report_type]}
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-600">
                              {formatDate(run.generated_at)}
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-600">
                              {run.duration_ms ? `${run.duration_ms}ms` : '-'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span
                                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusConfig.bg} ${statusConfig.text}`}
                              >
                                <StatusIcon className="h-3 w-3 mr-1" />
                                {run.status.charAt(0).toUpperCase() + run.status.slice(1)}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {showScheduleModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg max-w-md w-full mx-4">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Create Schedule</h2>
            </div>
            <form onSubmit={handleCreateSchedule} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input
                  type="text"
                  required
                  value={scheduleForm.name}
                  onChange={(e) => setScheduleForm({ ...scheduleForm, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Report Type</label>
                <select
                  value={scheduleForm.reportType}
                  onChange={(e) =>
                    setScheduleForm({
                      ...scheduleForm,
                      reportType: e.target.value as ReportType,
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {Object.entries(reportTypeLabels).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cadence</label>
                <select
                  value={scheduleForm.cadence}
                  onChange={(e) =>
                    setScheduleForm({
                      ...scheduleForm,
                      cadence: e.target.value as 'daily' | 'weekly' | 'monthly' | 'quarterly',
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {Object.entries(cadenceLabels).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Recipients (comma-separated emails)</label>
                <input
                  type="text"
                  required
                  value={scheduleForm.recipients}
                  onChange={(e) => setScheduleForm({ ...scheduleForm, recipients: e.target.value })}
                  placeholder="user1@example.com, user2@example.com"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex gap-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowScheduleModal(false)}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmittingSchedule} className="flex-1">
                  {isSubmittingSchedule && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Create
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
