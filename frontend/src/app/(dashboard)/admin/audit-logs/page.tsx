'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  ScrollText,
  Calendar,
  Search,
  Loader2,
  AlertCircle,
  CheckCircle,
  XCircle,
  Shield,
  TrendingUp,
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
  metadata: Record<string, unknown> | null;
  hash: string | null;
  prev_hash: string | null;
  created_at: string;
}

interface VerificationResult {
  valid: boolean;
  totalEntries: number;
  firstEntry?: {
    created_at: string;
    user_email: string | null;
  };
  lastEntry?: {
    created_at: string;
    user_email: string | null;
  };
}

type TabType = 'trail' | 'verification';

export default function AuditLogsPage() {
  const [activeTab, setActiveTab] = useState<TabType>('trail');
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const limit = 50;

  // Filter states
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [actionFilter, setActionFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Verification states
  const [verifying, setVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<VerificationResult | null>(null);
  const [verificationError, setVerificationError] = useState<string | null>(null);

  const loadAuditLogs = useCallback(async () => {
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
      if (searchQuery) params.search = searchQuery;

      const response = await api.get('/v1/audit/logs', { params });
      setEntries(response.data.entries || []);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load audit logs';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [page, fromDate, toDate, actionFilter, searchQuery]);

  useEffect(() => {
    if (activeTab === 'trail') {
      loadAuditLogs();
    }
  }, [activeTab, loadAuditLogs]);

  const handleVerify = async () => {
    try {
      setVerifying(true);
      setVerificationError(null);
      const response = await api.get('/v1/audit/verify');
      setVerificationResult(response.data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to verify chain integrity';
      setVerificationError(message);
    } finally {
      setVerifying(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const truncateHash = (hash: string | null) => {
    if (!hash) return 'N/A';
    return hash.substring(0, 12) + '...';
  };

  const getUniqueActions = () => {
    const uniqueActions = new Set(entries.map((e) => e.action));
    return Array.from(uniqueActions).sort();
  };

  if (isLoading && activeTab === 'trail' && entries.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <ScrollText className="h-8 w-8 text-blue-600" />
            <h1 className="text-2xl font-bold text-gray-900">Audit Logs</h1>
          </div>
          <p className="mt-1 text-sm text-gray-500">Track all system actions and changes</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <div className="flex space-x-8">
          <button
            onClick={() => setActiveTab('trail')}
            className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'trail'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Audit Trail
          </button>
          <button
            onClick={() => setActiveTab('verification')}
            className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'verification'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Chain Verification
          </button>
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'trail' && (
        <div className="space-y-4">
          {/* Error Alert */}
          {error && (
            <div className="flex items-center gap-2 p-4 text-sm text-red-800 bg-red-100 rounded-md">
              <AlertCircle className="h-4 w-4" />
              {error}
              <button
                onClick={() => setError(null)}
                className="ml-auto text-red-600 hover:text-red-800"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Filters */}
          <div className="bg-white rounded-lg shadow p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">From Date</label>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => {
                    setFromDate(e.target.value);
                    setPage(1);
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">To Date</label>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => {
                    setToDate(e.target.value);
                    setPage(1);
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Action</label>
                <select
                  value={actionFilter}
                  onChange={(e) => {
                    setActionFilter(e.target.value);
                    setPage(1);
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All Actions</option>
                  {getUniqueActions().map((action) => (
                    <option key={action} value={action}>
                      {action}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Search User</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search by email..."
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setPage(1);
                    }}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Timestamp
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    User
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Action
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Entity Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Entity
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Hash
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {entries.map((entry) => (
                  <tr key={entry.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatDate(entry.created_at)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {entry.user_email || 'System'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        {entry.action}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {entry.entity_type || '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      <div>
                        {entry.entity_name && (
                          <div className="font-medium text-gray-900">{entry.entity_name}</div>
                        )}
                        <div className="text-xs text-gray-400">{entry.entity_id || '-'}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400 font-mono">
                      {truncateHash(entry.hash)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {entries.length === 0 && (
              <div className="text-center py-12">
                <ScrollText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No audit log entries found</h3>
                <p className="text-gray-500">Try adjusting your filters</p>
              </div>
            )}

            {/* Pagination */}
            <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
              <div className="text-sm text-gray-500">
                {entries.length > 0 && `Page ${page}`}
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
                  disabled={entries.length < limit}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'verification' && (
        <div className="space-y-6">
          {/* Verification Button */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Chain Integrity Verification</h2>
                <p className="text-sm text-gray-500 mt-1">
                  Verify that the audit log chain has not been tampered with
                </p>
              </div>
              <Button
                onClick={handleVerify}
                disabled={verifying}
                className="flex items-center"
              >
                {verifying ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  <>
                    <Shield className="h-4 w-4 mr-2" />
                    Verify Integrity
                  </>
                )}
              </Button>
            </div>

            {verificationError && (
              <div className="mt-4 flex items-center gap-2 p-4 text-sm text-red-800 bg-red-100 rounded-md">
                <AlertCircle className="h-4 w-4" />
                {verificationError}
                <button
                  onClick={() => setVerificationError(null)}
                  className="ml-auto text-red-600 hover:text-red-800"
                >
                  Dismiss
                </button>
              </div>
            )}

            {verificationResult && (
              <div className="mt-6 space-y-4">
                {/* Status Banner */}
                <div
                  className={`p-4 rounded-md flex items-center gap-3 ${
                    verificationResult.valid
                      ? 'bg-green-100 text-green-800'
                      : 'bg-red-100 text-red-800'
                  }`}
                >
                  {verificationResult.valid ? (
                    <>
                      <CheckCircle className="h-5 w-5" />
                      <span className="font-medium">Chain integrity verified successfully</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="h-5 w-5" />
                      <span className="font-medium">Chain integrity check failed</span>
                    </>
                  )}
                </div>

                {/* Statistics */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="flex items-center">
                      <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
                        <TrendingUp className="h-5 w-5 text-blue-600" />
                      </div>
                      <div className="ml-4">
                        <p className="text-sm text-gray-500">Total Entries</p>
                        <p className="text-2xl font-semibold text-gray-900">
                          {verificationResult.totalEntries}
                        </p>
                      </div>
                    </div>
                  </div>

                  {verificationResult.firstEntry && (
                    <div className="bg-gray-50 rounded-lg p-4">
                      <p className="text-xs font-medium text-gray-500 uppercase mb-2">First Entry</p>
                      <p className="text-sm font-medium text-gray-900">
                        {formatDate(verificationResult.firstEntry.created_at)}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {verificationResult.firstEntry.user_email || 'System'}
                      </p>
                    </div>
                  )}

                  {verificationResult.lastEntry && (
                    <div className="bg-gray-50 rounded-lg p-4">
                      <p className="text-xs font-medium text-gray-500 uppercase mb-2">Last Entry</p>
                      <p className="text-sm font-medium text-gray-900">
                        {formatDate(verificationResult.lastEntry.created_at)}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {verificationResult.lastEntry.user_email || 'System'}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
