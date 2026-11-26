'use client';

import { Fragment, useState, useEffect, useCallback } from 'react';
import {
  ScrollText,
  Loader2,
  AlertCircle,
  CheckCircle,
  Copy,
  Calendar,
  User,
  Zap,
  Search,
  Download,
  Bell,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';

interface AuditEntry {
  id: string;
  user_id: string | null;
  user_email: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  entity_name: string | null;
  severity?: string;
  outcome?: string;
  ip_address?: string | null;
  changed_fields?: string[] | null;
  old_values?: Record<string, unknown> | null;
  new_values?: Record<string, unknown> | null;
  record_hash?: string | null;
  created_at: string;
}

interface VerifyResult {
  valid: boolean;
  checkedCount: number;
  firstBrokenSequence?: number;
}

interface AlertRule {
  id: string;
  name: string;
  description: string | null;
  threshold: number;
  window_minutes: number;
  group_by: string;
  severity: string;
  enabled: boolean;
}

interface AuditAlert {
  id: string;
  rule_name: string;
  severity: string;
  group_key: string;
  event_count: number;
  status: 'open' | 'acknowledged';
  created_at: string;
}

interface AuditSettings {
  retention_days: number;
  archive_after_days: number | null;
  log_reads: boolean;
  log_exports: boolean;
  alerts_enabled: boolean;
}

interface StorageStats {
  liveCount: number;
  archivedCount: number;
  legalHoldCount: number;
}

type TabType = 'trail' | 'alerts' | 'retention' | 'reports' | 'verify';

const TABS: Array<{ id: TabType; label: string }> = [
  { id: 'trail', label: 'Audit Trail' },
  { id: 'alerts', label: 'Alerts' },
  { id: 'retention', label: 'Retention' },
  { id: 'reports', label: 'Compliance Reports' },
  { id: 'verify', label: 'Chain Verification' },
];

const REPORT_TEMPLATES = [
  { id: 'audit_trail_soc2', label: 'SOC 2 audit trail' },
  { id: 'audit_trail_iso27001', label: 'ISO 27001 audit trail' },
];

const inputClass =
  'w-full px-3 py-2 border border-border-strong rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20';

function formatDate(dateString: string) {
  try {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateString;
  }
}

function errorMessage(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback;
}

function downloadBlob(data: Blob, filename: string) {
  const url = window.URL.createObjectURL(data);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  window.URL.revokeObjectURL(url);
}

function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="flex items-center gap-2 p-4 text-sm text-error bg-error-subtle rounded-lg">
      <AlertCircle className="h-4 w-4 flex-shrink-0" />
      {message}
    </div>
  );
}

export default function AuditLogsPage() {
  const [activeTab, setActiveTab] = useState<TabType>('trail');
  const [error, setError] = useState<string | null>(null);

  // ---- Audit trail (search / filter / export) ----
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);
  const limit = 50;
  const [query, setQuery] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');
  const [outcomeFilter, setOutcomeFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('live');

  const buildParams = useCallback(() => {
    const params: Record<string, string | number> = {};
    if (query.trim()) params.q = query.trim();
    if (fromDate) params.startDate = new Date(fromDate).toISOString();
    if (toDate) params.endDate = new Date(`${toDate}T23:59:59`).toISOString();
    if (actionFilter) params.action = actionFilter;
    if (severityFilter) params.severity = severityFilter;
    if (outcomeFilter) params.outcome = outcomeFilter;
    if (sourceFilter !== 'live') params.source = sourceFilter;
    return params;
  }, [query, fromDate, toDate, actionFilter, severityFilter, outcomeFilter, sourceFilter]);

  const loadLogs = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await api.get('/v1/audit/search', {
        params: { ...buildParams(), limit, offset: (page - 1) * limit },
      });
      setLogs(response.data?.logs || []);
      setTotal(response.data?.total || 0);
    } catch (err) {
      setError(errorMessage(err, 'Failed to load audit logs'));
    } finally {
      setIsLoading(false);
    }
  }, [buildParams, page]);

  useEffect(() => {
    if (activeTab === 'trail') loadLogs();
  }, [activeTab, loadLogs]);

  const handleExport = async (format: 'csv' | 'json') => {
    try {
      setError(null);
      const response = await api.get('/v1/audit/export', {
        params: { ...buildParams(), format },
        responseType: 'blob',
      });
      downloadBlob(response.data, `audit-trail-${new Date().toISOString().split('T')[0]}.${format}`);
    } catch (err) {
      setError(errorMessage(err, 'Failed to export audit trail'));
    }
  };

  // ---- Alerts ----
  const [alerts, setAlerts] = useState<AuditAlert[]>([]);
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [isAlertsLoading, setIsAlertsLoading] = useState(false);

  const loadAlerts = useCallback(async () => {
    try {
      setIsAlertsLoading(true);
      setError(null);
      const [alertsRes, rulesRes] = await Promise.all([
        api.get('/v1/audit/alerts', { params: { limit: 50 } }),
        api.get('/v1/audit/alert-rules'),
      ]);
      setAlerts(alertsRes.data?.alerts || []);
      setRules(rulesRes.data?.rules || []);
    } catch (err) {
      setError(errorMessage(err, 'Failed to load alerts'));
    } finally {
      setIsAlertsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'alerts') loadAlerts();
  }, [activeTab, loadAlerts]);

  const acknowledgeAlert = async (id: string) => {
    try {
      await api.post(`/v1/audit/alerts/${id}/acknowledge`);
      loadAlerts();
    } catch (err) {
      setError(errorMessage(err, 'Failed to acknowledge alert'));
    }
  };

  const toggleRule = async (rule: AlertRule) => {
    try {
      await api.patch(`/v1/audit/alert-rules/${rule.id}`, { enabled: !rule.enabled });
      loadAlerts();
    } catch (err) {
      setError(errorMessage(err, 'Failed to update alert rule'));
    }
  };

  // ---- Retention ----
  const [settings, setSettings] = useState<AuditSettings | null>(null);
  const [storage, setStorage] = useState<StorageStats | null>(null);
  const [retentionDays, setRetentionDays] = useState('');
  const [archiveDays, setArchiveDays] = useState('');
  const [retentionMessage, setRetentionMessage] = useState<string | null>(null);
  const [isRetentionBusy, setIsRetentionBusy] = useState(false);

  const loadRetention = useCallback(async () => {
    try {
      setError(null);
      const response = await api.get('/v1/audit/retention/stats');
      const s: AuditSettings = response.data?.settings;
      setSettings(s);
      setStorage(response.data?.storage || null);
      setRetentionDays(String(s?.retention_days ?? ''));
      setArchiveDays(s?.archive_after_days ? String(s.archive_after_days) : '');
    } catch (err) {
      setError(errorMessage(err, 'Failed to load retention settings'));
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'retention') loadRetention();
  }, [activeTab, loadRetention]);

  const saveRetention = async () => {
    try {
      setIsRetentionBusy(true);
      setError(null);
      setRetentionMessage(null);
      await api.patch('/v1/audit/settings', {
        retention_days: Number(retentionDays),
        archive_after_days: archiveDays ? Number(archiveDays) : null,
      });
      setRetentionMessage('Retention policy saved');
      loadRetention();
    } catch (err) {
      setError(errorMessage(err, 'Failed to save retention policy'));
    } finally {
      setIsRetentionBusy(false);
    }
  };

  const runRetention = async () => {
    try {
      setIsRetentionBusy(true);
      setError(null);
      const response = await api.post('/v1/audit/retention/run');
      const r = response.data?.result;
      setRetentionMessage(
        `Archived ${r?.archived ?? 0}, purged ${(r?.purgedLive ?? 0) + (r?.purgedArchive ?? 0)} records`
      );
      loadRetention();
    } catch (err) {
      setError(errorMessage(err, 'Failed to run retention'));
    } finally {
      setIsRetentionBusy(false);
    }
  };

  // ---- Compliance reports ----
  const [reportTemplate, setReportTemplate] = useState(REPORT_TEMPLATES[0].id);
  const [reportFrom, setReportFrom] = useState('');
  const [reportTo, setReportTo] = useState('');
  const [reportSummary, setReportSummary] = useState<Record<string, unknown> | null>(null);
  const [isReportBusy, setIsReportBusy] = useState(false);

  const reportParams = (format: 'json' | 'csv') => ({
    from: new Date(reportFrom).toISOString(),
    to: new Date(`${reportTo}T23:59:59`).toISOString(),
    format,
  });

  const generateReport = async () => {
    if (!reportFrom || !reportTo) {
      setError('Choose a start and end date for the report');
      return;
    }
    try {
      setIsReportBusy(true);
      setError(null);
      const response = await api.get(`/v1/audit/reports/${reportTemplate}`, {
        params: reportParams('json'),
      });
      setReportSummary(response.data?.summary || null);
    } catch (err) {
      setError(errorMessage(err, 'Failed to generate report'));
    } finally {
      setIsReportBusy(false);
    }
  };

  const downloadReport = async () => {
    if (!reportFrom || !reportTo) return;
    try {
      const response = await api.get(`/v1/audit/reports/${reportTemplate}`, {
        params: reportParams('csv'),
        responseType: 'blob',
      });
      downloadBlob(response.data, `${reportTemplate}-${new Date().toISOString().split('T')[0]}.csv`);
    } catch (err) {
      setError(errorMessage(err, 'Failed to download report'));
    }
  };

  // ---- Chain verification ----
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  const handleVerifyIntegrity = async () => {
    try {
      setIsVerifying(true);
      setError(null);
      const response = await api.get('/v1/audit/verify');
      setVerifyResult(response.data);
    } catch (err) {
      setError(errorMessage(err, 'Failed to verify integrity'));
    } finally {
      setIsVerifying(false);
    }
  };

  const getActionColor = (action: string) => {
    const a = action.toLowerCase();
    if (a.includes('create')) return 'bg-success-subtle text-success';
    if (a.includes('delete') || a.includes('revoked') || a.includes('failed')) return 'bg-error-subtle text-error';
    if (a.includes('update')) return 'bg-info-subtle text-foreground';
    if (a.includes('view')) return 'bg-background text-foreground';
    return 'bg-info-subtle text-info';
  };

  const resetPage = () => setPage(1);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <ScrollText className="h-8 w-8 text-secondary" />
        <div>
          <h1 className="text-2xl font-bold text-foreground">Audit Logs</h1>
          <p className="mt-1 text-sm text-secondary">
            Search system activity, review alerts, manage retention and export compliance evidence
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-border">
        <div className="flex gap-8 overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setError(null);
                setActiveTab(tab.id);
              }}
              className={`px-1 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-secondary hover:text-foreground'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <ErrorBanner message={error} />

      {/* ------------------------------------------------ Audit trail */}
      {activeTab === 'trail' && (
        <div className="space-y-4">
          <div className="bg-surface rounded-xl shadow-sm p-4 space-y-4">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="h-4 w-4 absolute left-3 top-3 text-muted" />
                <input
                  type="text"
                  aria-label="Search audit logs"
                  placeholder="Search user, entity, action or path"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    resetPage();
                  }}
                  className={`${inputClass} pl-9`}
                />
              </div>
              <Button variant="outline" onClick={() => handleExport('csv')}>
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
              <Button variant="outline" onClick={() => handleExport('json')}>
                Export JSON
              </Button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
              <div>
                <label className="block text-sm font-medium text-secondary mb-1">
                  <Calendar className="h-4 w-4 inline mr-1" />
                  From
                </label>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => {
                    setFromDate(e.target.value);
                    resetPage();
                  }}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-secondary mb-1">
                  <Calendar className="h-4 w-4 inline mr-1" />
                  To
                </label>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => {
                    setToDate(e.target.value);
                    resetPage();
                  }}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-secondary mb-1">
                  <Zap className="h-4 w-4 inline mr-1" />
                  Action
                </label>
                <select
                  value={actionFilter}
                  onChange={(e) => {
                    setActionFilter(e.target.value);
                    resetPage();
                  }}
                  className={inputClass}
                >
                  <option value="">All</option>
                  {[
                    'create', 'update', 'delete', 'view', 'export', 'login', 'login_failed', 'logout',
                    'assign', 'approve', 'reject', 'escalate', 'permission_granted', 'permission_revoked',
                    'config_change', 'retention_run', 'legal_hold',
                  ].map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-secondary mb-1">
                  <User className="h-4 w-4 inline mr-1" />
                  Outcome
                </label>
                <select
                  value={outcomeFilter}
                  onChange={(e) => {
                    setOutcomeFilter(e.target.value);
                    resetPage();
                  }}
                  className={inputClass}
                >
                  <option value="">All</option>
                  <option value="success">success</option>
                  <option value="failure">failure</option>
                  <option value="denied">denied</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-secondary mb-1">Severity</label>
                <select
                  value={severityFilter}
                  onChange={(e) => {
                    setSeverityFilter(e.target.value);
                    resetPage();
                  }}
                  className={inputClass}
                >
                  <option value="">All</option>
                  {['info', 'low', 'medium', 'high', 'critical'].map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-secondary mb-1">Source</label>
                <select
                  value={sourceFilter}
                  onChange={(e) => {
                    setSourceFilter(e.target.value);
                    resetPage();
                  }}
                  className={inputClass}
                >
                  <option value="live">Live</option>
                  <option value="archive">Archive</option>
                  <option value="all">Live + archive</option>
                </select>
              </div>
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <div className="bg-surface rounded-xl shadow-sm overflow-hidden">
              <table className="min-w-full divide-y divide-border">
                <thead className="bg-background">
                  <tr>
                    {['Timestamp', 'User', 'Action', 'Entity', 'Outcome', 'IP', 'Hash'].map((h) => (
                      <th
                        key={h}
                        className="px-6 py-3 text-left text-xs font-medium text-secondary uppercase tracking-wider"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-surface divide-y divide-border">
                  {logs.map((entry) => (
                    <Fragment key={entry.id}>
                      <tr
                        className="hover:bg-surface-hover cursor-pointer"
                        onClick={() => setExpanded(expanded === entry.id ? null : entry.id)}
                      >
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-secondary">
                          {formatDate(entry.created_at)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          {entry.user_email ? (
                            <span className="text-foreground font-medium">{entry.user_email}</span>
                          ) : (
                            <span className="text-muted">System</span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getActionColor(
                              entry.action
                            )}`}
                          >
                            {entry.action}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-secondary">
                          {entry.entity_type || '-'}
                          {entry.entity_name ? ` · ${entry.entity_name}` : ''}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-secondary">
                          {entry.outcome || '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-secondary">
                          {entry.ip_address || '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <code className="text-xs text-secondary font-mono">
                              {entry.record_hash ? `${entry.record_hash.substring(0, 12)}...` : '-'}
                            </code>
                            {entry.record_hash && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigator.clipboard.writeText(entry.record_hash || '');
                                }}
                                className="text-muted hover:text-secondary"
                                title="Copy hash"
                              >
                                <Copy className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {expanded === entry.id && (
                        <tr key={`${entry.id}-details`} className="bg-background">
                          <td colSpan={7} className="px-6 py-4 text-sm">
                            {entry.changed_fields && entry.changed_fields.length > 0 ? (
                              <table className="text-xs">
                                <thead>
                                  <tr className="text-secondary">
                                    <th className="pr-6 text-left">Field</th>
                                    <th className="pr-6 text-left">Old value</th>
                                    <th className="text-left">New value</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {entry.changed_fields.map((field) => (
                                    <tr key={field}>
                                      <td className="pr-6 font-mono">{field}</td>
                                      <td className="pr-6 font-mono">
                                        {JSON.stringify(entry.old_values?.[field] ?? null)}
                                      </td>
                                      <td className="font-mono">
                                        {JSON.stringify(entry.new_values?.[field] ?? null)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            ) : (
                              <span className="text-secondary">No field-level changes recorded</span>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>

              {logs.length === 0 && (
                <div className="text-center py-12">
                  <ScrollText className="h-12 w-12 text-muted mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-foreground mb-2">No audit log entries found</h3>
                  <p className="text-secondary">Try adjusting your filters</p>
                </div>
              )}

              <div className="px-6 py-4 border-t border-border flex items-center justify-between">
                <div className="text-sm text-secondary">
                  Showing {logs.length} of {total} entries
                </div>
                <div className="flex space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page * limit >= total}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------ Alerts */}
      {activeTab === 'alerts' && (
        <div className="space-y-6">
          {isAlertsLoading && <Loader2 className="h-6 w-6 animate-spin text-primary" />}
          <div className="bg-surface rounded-xl shadow-sm p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
              <Bell className="h-5 w-5" /> Suspicious activity alerts
            </h2>
            {alerts.length === 0 ? (
              <p className="text-sm text-secondary">No alerts have been raised.</p>
            ) : (
              <ul className="divide-y divide-border">
                {alerts.map((alert) => (
                  <li key={alert.id} className="py-3 flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {alert.rule_name}{' '}
                        <span className="text-xs text-secondary">({alert.severity})</span>
                      </p>
                      <p className="text-xs text-secondary">
                        {alert.event_count} events
                        {alert.group_key ? ` for ${alert.group_key}` : ''} · {formatDate(alert.created_at)}
                      </p>
                    </div>
                    {alert.status === 'open' ? (
                      <Button variant="outline" size="sm" onClick={() => acknowledgeAlert(alert.id)}>
                        Acknowledge
                      </Button>
                    ) : (
                      <span className="text-xs text-secondary">Acknowledged</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="bg-surface rounded-xl shadow-sm p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4">Alert rules</h2>
            <ul className="divide-y divide-border">
              {rules.map((rule) => (
                <li key={rule.id} className="py-3 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-foreground">{rule.name}</p>
                    <p className="text-xs text-secondary">
                      {rule.threshold} events in {rule.window_minutes} min per {rule.group_by} ·{' '}
                      {rule.severity}
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => toggleRule(rule)}>
                    {rule.enabled ? 'Disable' : 'Enable'}
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* ------------------------------------------------ Retention */}
      {activeTab === 'retention' && (
        <div className="bg-surface rounded-xl shadow-sm p-6 space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Retention and archival</h2>
            <p className="mt-1 text-sm text-secondary">
              Records older than the archive window move to cold storage; records past the retention
              period are purged unless they are under legal hold.
            </p>
          </div>
          {storage && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-background rounded-xl p-4">
                <p className="text-sm text-secondary">Live records</p>
                <p className="text-2xl font-bold text-foreground">{storage.liveCount}</p>
              </div>
              <div className="bg-background rounded-xl p-4">
                <p className="text-sm text-secondary">Archived records</p>
                <p className="text-2xl font-bold text-foreground">{storage.archivedCount}</p>
              </div>
              <div className="bg-background rounded-xl p-4">
                <p className="text-sm text-secondary">Under legal hold</p>
                <p className="text-2xl font-bold text-foreground">{storage.legalHoldCount}</p>
              </div>
            </div>
          )}
          {settings && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-xl">
              <div>
                <label className="block text-sm font-medium text-secondary mb-1">
                  Retention (days, 30-3650)
                </label>
                <input
                  type="number"
                  min={30}
                  max={3650}
                  value={retentionDays}
                  onChange={(e) => setRetentionDays(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-secondary mb-1">
                  Archive after (days, optional)
                </label>
                <input
                  type="number"
                  min={1}
                  value={archiveDays}
                  onChange={(e) => setArchiveDays(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
          )}
          <div className="flex items-center gap-3">
            <Button onClick={saveRetention} disabled={isRetentionBusy}>
              Save policy
            </Button>
            <Button variant="outline" onClick={runRetention} disabled={isRetentionBusy}>
              Run retention now
            </Button>
            {retentionMessage && <span className="text-sm text-success">{retentionMessage}</span>}
          </div>
        </div>
      )}

      {/* ------------------------------------------------ Reports */}
      {activeTab === 'reports' && (
        <div className="bg-surface rounded-xl shadow-sm p-6 space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Compliance audit trail reports</h2>
            <p className="mt-1 text-sm text-secondary">
              Every event is mapped to the SOC 2 or ISO 27001 control it provides evidence for.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-3xl">
            <div>
              <label className="block text-sm font-medium text-secondary mb-1">Template</label>
              <select
                value={reportTemplate}
                onChange={(e) => setReportTemplate(e.target.value)}
                className={inputClass}
              >
                {REPORT_TEMPLATES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-secondary mb-1">From</label>
              <input
                type="date"
                value={reportFrom}
                onChange={(e) => setReportFrom(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-secondary mb-1">To</label>
              <input
                type="date"
                value={reportTo}
                onChange={(e) => setReportTo(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>
          <div className="flex gap-3">
            <Button onClick={generateReport} disabled={isReportBusy}>
              Generate
            </Button>
            <Button variant="outline" onClick={downloadReport} disabled={!reportFrom || !reportTo}>
              <Download className="h-4 w-4 mr-2" />
              Download CSV
            </Button>
          </div>
          {reportSummary && (
            <pre className="bg-background rounded-xl p-4 text-xs overflow-auto max-h-96">
              {JSON.stringify(reportSummary, null, 2)}
            </pre>
          )}
        </div>
      )}

      {/* ------------------------------------------------ Verify */}
      {activeTab === 'verify' && (
        <div className="bg-surface rounded-xl shadow-sm p-6 space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Verify Log Chain Integrity</h2>
              <p className="mt-1 text-sm text-secondary">
                Verify that no audit record has been modified (SHA-256 hash chain)
              </p>
            </div>
            <Button onClick={handleVerifyIntegrity} isLoading={isVerifying} disabled={isVerifying}>
              Verify Integrity
            </Button>
          </div>
          {verifyResult && (
            <div
              className={`p-4 rounded-lg flex items-start gap-3 ${
                verifyResult.valid ? 'bg-success-subtle text-success' : 'bg-error-subtle text-error'
              }`}
            >
              {verifyResult.valid ? (
                <CheckCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
              )}
              <div>
                <p className="font-medium">
                  {verifyResult.valid ? 'Chain Integrity Verified' : 'Chain Integrity Failed'}
                </p>
                <p className="text-sm mt-1">
                  {verifyResult.valid
                    ? `${verifyResult.checkedCount} records verified.`
                    : `Tampering detected at sequence ${verifyResult.firstBrokenSequence}.`}
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
