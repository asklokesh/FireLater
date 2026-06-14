'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  ScrollText,
  Loader2,
  AlertCircle,
  CheckCircle,
  Copy,
  Calendar,
  User,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';

interface AuditEntry {
  id: string;
  user_id: string | null;
  user_email: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  entity_name: string | null;
  metadata: Record<string, unknown> | null;
  hash: string | null;
  prev_hash: string | null;
  created_at: string;
}

interface VerifyResult {
  valid: boolean;
  totalEntries: number;
  firstEntry: { created_at: string } | null;
  lastEntry: { created_at: string } | null;
}

type TabType = 'trail' | 'verify';

export default function AuditLogsPage() {
  const [activeTab, setActiveTab] = useState<TabType>('trail');
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 50;

  // Filter state
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [userSearch, setUserSearch] = useState('');

  // Verify state
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  const loadLogs = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const params: Record<string, string | number> = {
        page,
        limit,
      };
      if (fromDate) params.from = fromDate;
      if (toDate) params.to = toDate;
      if (actionFilter) params.action = actionFilter;
      if (userSearch) params.user = userSearch;

      const response = await api.get('/v1/audit/logs', { params });
      setLogs(response.data?.data || response.data || []);
      setTotal(response.data?.pagination?.total || response.data?.total || 0);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load audit logs';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [page, fromDate, toDate, actionFilter, userSearch]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const handleVerifyIntegrity = async () => {
    try {
      setIsVerifying(true);
      setVerifyError(null);
      const response = await api.get('/v1/audit/verify');
      setVerifyResult(response.data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to verify integrity';
      setVerifyError(message);
    } finally {
      setIsVerifying(false);
    }
  };

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateString;
    }
  };

  const truncateHash = (hash: string | null) => {
    if (!hash) return '-';
    return hash.substring(0, 12) + '...';
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const getActionColor = (action: string) => {
    const actionLower = action.toLowerCase();
    if (actionLower.includes('create')) return 'bg-success-subtle text-success';
    if (actionLower.includes('delete') || actionLower.includes('remove')) return 'bg-error-subtle text-error';
    if (actionLower.includes('update') || actionLower.includes('modify')) return 'bg-info-subtle text-foreground';
    if (actionLower.includes('view') || actionLower.includes('read')) return 'bg-background text-foreground';
    return 'bg-info-subtle text-info';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <ScrollText className="h-8 w-8 text-secondary" />
        <div>
          <h1 className="text-2xl font-bold text-foreground">Audit Logs</h1>
          <p className="mt-1 text-sm text-secondary">
            Track system activities and verify log integrity
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-border">
        <div className="flex gap-8">
          <button
            onClick={() => setActiveTab('trail')}
            className={`px-1 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'trail'
                ? 'border-primary text-primary'
                : 'border-transparent text-secondary hover:text-foreground'
            }`}
          >
            Audit Trail
          </button>
          <button
            onClick={() => setActiveTab('verify')}
            className={`px-1 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'verify'
                ? 'border-primary text-primary'
                : 'border-transparent text-secondary hover:text-foreground'
            }`}
          >
            Chain Verification
          </button>
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'trail' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="bg-surface rounded-xl shadow-sm p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-secondary mb-1">
                  <Calendar className="h-4 w-4 inline mr-1" />
                  From Date
                </label>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => {
                    setFromDate(e.target.value);
                    setPage(1);
                  }}
                  className="w-full px-3 py-2 border border-border-strong rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-secondary mb-1">
                  <Calendar className="h-4 w-4 inline mr-1" />
                  To Date
                </label>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => {
                    setToDate(e.target.value);
                    setPage(1);
                  }}
                  className="w-full px-3 py-2 border border-border-strong rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-secondary mb-1">
                  <Zap className="h-4 w-4 inline mr-1" />
                  Action
                </label>
                <input
                  type="text"
                  placeholder="e.g., create, update, delete"
                  value={actionFilter}
                  onChange={(e) => {
                    setActionFilter(e.target.value);
                    setPage(1);
                  }}
                  className="w-full px-3 py-2 border border-border-strong rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-secondary mb-1">
                  <User className="h-4 w-4 inline mr-1" />
                  User Email
                </label>
                <input
                  type="text"
                  placeholder="Search by email"
                  value={userSearch}
                  onChange={(e) => {
                    setUserSearch(e.target.value);
                    setPage(1);
                  }}
                  className="w-full px-3 py-2 border border-border-strong rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
            </div>
          </div>

          {/* Error Alert */}
          {error && (
            <div className="flex items-center gap-2 p-4 text-sm text-error bg-error-subtle rounded-lg">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Loading State */}
          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <>
              {/* Table */}
              <div className="bg-surface rounded-xl shadow-sm overflow-hidden">
                <table className="min-w-full divide-y divide-border">
                  <thead className="bg-background">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-secondary uppercase tracking-wider">
                        Timestamp
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-secondary uppercase tracking-wider">
                        User
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-secondary uppercase tracking-wider">
                        Action
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-secondary uppercase tracking-wider">
                        Entity Type
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-secondary uppercase tracking-wider">
                        Entity Name
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-secondary uppercase tracking-wider">
                        Hash
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-surface divide-y divide-border">
                    {logs.map((entry) => (
                      <tr key={entry.id} className="hover:bg-surface-hover">
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
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-secondary">
                          {entry.entity_name || (entry.entity_id ? `ID: ${entry.entity_id.substring(0, 8)}...` : '-')}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <code className="text-xs text-secondary font-mono">
                              {truncateHash(entry.hash)}
                            </code>
                            {entry.hash && (
                              <button
                                onClick={() => copyToClipboard(entry.hash || '')}
                                className="text-muted hover:text-secondary"
                                title="Copy hash"
                              >
                                <Copy className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
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

                {/* Pagination */}
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
            </>
          )}
        </div>
      )}

      {activeTab === 'verify' && (
        <div className="space-y-4">
          <div className="bg-surface rounded-xl shadow-sm p-6">
            <div className="flex items-start justify-between mb-6">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Verify Log Chain Integrity</h2>
                <p className="mt-1 text-sm text-secondary">
                  Verify that all audit logs form an unbroken cryptographic chain
                </p>
              </div>
              <Button
                onClick={handleVerifyIntegrity}
                isLoading={isVerifying}
                disabled={isVerifying}
              >
                {isVerifying ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  'Verify Integrity'
                )}
              </Button>
            </div>

            {verifyError && (
              <div className="mb-4 p-4 text-sm text-error bg-error-subtle rounded-lg flex items-start gap-3">
                <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                <div>{verifyError}</div>
              </div>
            )}

            {verifyResult && (
              <div className="space-y-4">
                {/* Status Banner */}
                <div
                  className={`p-4 rounded-lg flex items-start gap-3 ${
                    verifyResult.valid
                      ? 'bg-success-subtle text-success'
                      : 'bg-error-subtle text-error'
                  }`}
                >
                  {verifyResult.valid ? (
                    <CheckCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                  )}
                  <div>
                    <p className="font-medium">
                      {verifyResult.valid
                        ? 'Chain Integrity Verified'
                        : 'Chain Integrity Failed'}
                    </p>
                    <p className="text-sm mt-1">
                      {verifyResult.valid
                        ? 'All audit logs form an unbroken cryptographic chain.'
                        : 'The audit log chain has been compromised or tampered with.'}
                    </p>
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-background rounded-xl p-4">
                    <p className="text-sm text-secondary mb-1">Total Entries</p>
                    <p className="text-2xl font-bold text-foreground">{verifyResult.totalEntries}</p>
                  </div>
                  <div className="bg-background rounded-xl p-4">
                    <p className="text-sm text-secondary mb-1">First Entry</p>
                    <p className="text-sm font-mono text-foreground">
                      {verifyResult.firstEntry
                        ? formatDate(verifyResult.firstEntry.created_at)
                        : 'N/A'}
                    </p>
                  </div>
                  <div className="bg-background rounded-xl p-4">
                    <p className="text-sm text-secondary mb-1">Last Entry</p>
                    <p className="text-sm font-mono text-foreground">
                      {verifyResult.lastEntry
                        ? formatDate(verifyResult.lastEntry.created_at)
                        : 'N/A'}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
