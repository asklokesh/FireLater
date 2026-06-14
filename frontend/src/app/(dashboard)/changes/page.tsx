'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Plus,
  Search,
  Filter,
  ChevronDown,
  GitBranch,
  Calendar,
  MoreHorizontal,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useChanges, Change } from '@/hooks/useApi';

const statusColors: Record<string, { bg: string; text: string; ring: string }> = {
  draft: { bg: 'bg-surface-hover', text: 'text-secondary', ring: 'ring-border-strong' },
  submitted: { bg: 'bg-info-subtle', text: 'text-info', ring: 'ring-info/20' },
  review: { bg: 'bg-warning-subtle', text: 'text-warning', ring: 'ring-warning/20' },
  approved: { bg: 'bg-success-subtle', text: 'text-success', ring: 'ring-success/20' },
  rejected: { bg: 'bg-error-subtle', text: 'text-error', ring: 'ring-error/20' },
  scheduled: { bg: 'bg-info-subtle', text: 'text-info', ring: 'ring-info/20' },
  implementing: { bg: 'bg-warning-subtle', text: 'text-warning', ring: 'ring-warning/20' },
  completed: { bg: 'bg-success-subtle', text: 'text-success', ring: 'ring-success/20' },
  failed: { bg: 'bg-error-subtle', text: 'text-error', ring: 'ring-error/20' },
  rolled_back: { bg: 'bg-warning-subtle', text: 'text-warning', ring: 'ring-warning/20' },
  cancelled: { bg: 'bg-surface-hover', text: 'text-secondary', ring: 'ring-border-strong' },
};

const statusLabels: Record<string, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  review: 'In Review',
  approved: 'Approved',
  rejected: 'Rejected',
  scheduled: 'Scheduled',
  implementing: 'Implementing',
  completed: 'Completed',
  failed: 'Failed',
  rolled_back: 'Rolled Back',
  cancelled: 'Cancelled',
};

const typeColors: Record<string, { bg: string; text: string; ring: string }> = {
  standard: { bg: 'bg-info-subtle', text: 'text-info', ring: 'ring-info/20' },
  normal: { bg: 'bg-surface-hover', text: 'text-secondary', ring: 'ring-border-strong' },
  emergency: { bg: 'bg-error-subtle', text: 'text-error', ring: 'ring-error/20' },
};

const riskColors: Record<string, { bg: string; text: string; ring: string }> = {
  low: { bg: 'bg-success-subtle', text: 'text-success', ring: 'ring-success/20' },
  medium: { bg: 'bg-warning-subtle', text: 'text-warning', ring: 'ring-warning/20' },
  high: { bg: 'bg-warning-subtle', text: 'text-warning', ring: 'ring-warning/20' },
  critical: { bg: 'bg-error-subtle', text: 'text-error', ring: 'ring-error/20' },
};

export default function ChangesPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [riskFilter, setRiskFilter] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(1);

  const { data, isLoading, error } = useChanges({
    page,
    limit: 20,
    status: statusFilter !== 'all' ? statusFilter : undefined,
    type: typeFilter !== 'all' ? typeFilter : undefined,
    riskLevel: riskFilter !== 'all' ? riskFilter : undefined,
  });

  const changes = data?.data ?? [];
  const pagination = data?.pagination ?? { page: 1, limit: 20, total: 0, totalPages: 1 };

  // Client-side filtering for search only
  const filteredChanges = changes.filter((change: Change) => {
    const matchesSearch = searchQuery === '' ||
      change.change_number?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      change.title?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDateRange = (start: string | null | undefined, end: string | null | undefined) => {
    if (!start || !end) return 'Not scheduled';
    const startDate = new Date(start);
    const endDate = new Date(end);
    const sameDay = startDate.toDateString() === endDate.toDateString();

    if (sameDay) {
      return `${startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${startDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} - ${endDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
    }

    return `${formatDate(start)} - ${formatDate(end)}`;
  };

  if (error) {
    return (
      <div className="bg-error-subtle border border-error rounded-lg p-6 text-center">
        <GitBranch className="h-12 w-12 text-error mx-auto mb-4" />
        <h3 className="text-lg font-medium text-error mb-2">Error loading changes</h3>
        <p className="text-error">Please try refreshing the page</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Changes</h1>
          <p className="mt-1 text-sm text-secondary">
            Manage and track change requests
          </p>
        </div>
        <Link href="/changes/new">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            New Change
          </Button>
        </Link>
      </div>

      {/* Search and Filters */}
      <div className="bg-surface border border-border rounded-xl shadow-sm p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
            <input
              type="text"
              placeholder="Search by number or title..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <Button
            variant="outline"
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center"
          >
            <Filter className="h-4 w-4 mr-2" />
            Filters
            <ChevronDown className={`h-4 w-4 ml-2 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
          </Button>
        </div>

        {showFilters && (
          <div className="mt-4 pt-4 border-t border-border grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="all">All Statuses</option>
                <option value="draft">Draft</option>
                <option value="submitted">Submitted</option>
                <option value="review">In Review</option>
                <option value="approved">Approved</option>
                <option value="scheduled">Scheduled</option>
                <option value="implementing">Implementing</option>
                <option value="completed">Completed</option>
                <option value="failed">Failed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Type</label>
              <select
                value={typeFilter}
                onChange={(e) => {
                  setTypeFilter(e.target.value);
                  setPage(1);
                }}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="all">All Types</option>
                <option value="standard">Standard</option>
                <option value="normal">Normal</option>
                <option value="emergency">Emergency</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Risk Level</label>
              <select
                value={riskFilter}
                onChange={(e) => {
                  setRiskFilter(e.target.value);
                  setPage(1);
                }}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="all">All Risk Levels</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Changes Table */}
      <div className="bg-surface border border-border rounded-xl shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-2 text-secondary">Loading changes...</span>
          </div>
        ) : (
          <>
            <table className="min-w-full divide-y divide-border">
              <thead className="bg-background">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted border-b border-border">
                    Change
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted border-b border-border">
                    Type / Risk
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted border-b border-border">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted border-b border-border">
                    Scheduled
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted border-b border-border">
                    Implementer
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted border-b border-border">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredChanges.map((change: Change) => {
                  const changeType = change.type || 'normal';
                  const riskLevel = change.risk_level || 'medium';
                  const status = change.status || 'draft';
                  const typeStyle = typeColors[changeType] || typeColors.normal;
                  const riskStyle = riskColors[riskLevel] || riskColors.medium;
                  const statusStyle = statusColors[status] || statusColors.draft;

                  return (
                    <tr key={change.id} className="hover:bg-surface-hover transition-colors duration-150 border-b border-border last:border-0">
                      <td className="px-4 py-3">
                        <div className="flex items-start">
                          <GitBranch className={`h-5 w-5 mr-3 mt-0.5 ${
                            change.type === 'emergency' ? 'text-error' : 'text-muted'
                          }`} />
                          <div>
                            <div className="flex items-center space-x-2">
                              <Link
                                href={`/changes/${change.id}`}
                                className="text-sm font-medium text-primary hover:text-primary-hover"
                              >
                                {change.change_number}
                              </Link>
                            </div>
                            <p className="text-sm text-foreground mt-1">{change.title}</p>
                            {change.application_name && (
                              <p className="text-xs text-secondary mt-1">
                                App: {change.application_name}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="space-y-1">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ring-1 ring-inset ${typeStyle.bg} ${typeStyle.text} ${typeStyle.ring}`}
                          >
                            {changeType.charAt(0).toUpperCase() + changeType.slice(1)}
                          </span>
                          <br />
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ring-1 ring-inset ${riskStyle.bg} ${riskStyle.text} ${riskStyle.ring}`}
                          >
                            {riskLevel.charAt(0).toUpperCase() + riskLevel.slice(1)} Risk
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ring-1 ring-inset ${statusStyle.bg} ${statusStyle.text} ${statusStyle.ring}`}
                        >
                          {statusLabels[status] || status}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {change.planned_start && change.planned_end ? (
                          <div className="flex items-center text-sm text-foreground">
                            <Calendar className="h-4 w-4 mr-2 text-muted" />
                            <span>{formatDateRange(change.planned_start, change.planned_end)}</span>
                          </div>
                        ) : (
                          <span className="text-sm text-secondary italic">Not scheduled</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {change.implementer_name ? (
                          <div className="flex items-center">
                            <div className="h-8 w-8 rounded-full bg-primary-subtle flex items-center justify-center text-sm font-medium text-primary">
                              {change.implementer_name.charAt(0)}
                            </div>
                            <span className="ml-2 text-sm text-foreground">
                              {change.implementer_name}
                            </span>
                          </div>
                        ) : change.requester_name ? (
                          <div className="flex items-center">
                            <div className="h-8 w-8 rounded-full bg-primary-subtle flex items-center justify-center text-sm font-medium text-primary">
                              {change.requester_name.charAt(0)}
                            </div>
                            <div className="ml-2">
                              <span className="text-sm text-foreground">{change.requester_name}</span>
                              <p className="text-xs text-secondary">Requester</p>
                            </div>
                          </div>
                        ) : (
                          <span className="text-sm text-secondary italic">Unassigned</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right">
                        <button className="text-muted hover:text-foreground">
                          <MoreHorizontal className="h-5 w-5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {filteredChanges.length === 0 && (
              <div className="text-center py-12">
                <GitBranch className="h-12 w-12 text-muted mx-auto mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-2">No changes found</h3>
                <p className="text-secondary">Try adjusting your search or filters</p>
              </div>
            )}

            {/* Pagination */}
            <div className="px-4 py-3 border-t border-border flex items-center justify-between">
              <div className="text-sm text-secondary">
                Showing {filteredChanges.length} of {pagination.total} changes
              </div>
              <div className="flex space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= pagination.totalPages}
                  onClick={() => setPage(p => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
