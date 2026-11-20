'use client';

import { useT } from '@/i18n/useT';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Plus,
  Search,
  Filter,
  ChevronDown,
  AlertCircle,
  Clock,
  MoreHorizontal,
  Loader2,
  Edit,
  Trash2,
  CheckCircle,
  XCircle,
  Eye,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuItem, DropdownMenuDivider } from '@/components/ui/dropdown-menu';
import { useIssues, Issue, useChangeIssueStatus, useDeleteIssue } from '@/hooks/useApi';

const statusColors: Record<string, { bg: string; text: string; ring: string }> = {
  new: { bg: 'bg-info-subtle', text: 'text-info', ring: 'ring-info/20' },
  assigned: { bg: 'bg-info-subtle', text: 'text-info', ring: 'ring-info/20' },
  in_progress: { bg: 'bg-warning-subtle', text: 'text-warning', ring: 'ring-warning/20' },
  pending: { bg: 'bg-warning-subtle', text: 'text-warning', ring: 'ring-warning/20' },
  resolved: { bg: 'bg-success-subtle', text: 'text-success', ring: 'ring-success/20' },
  closed: { bg: 'bg-surface-hover', text: 'text-secondary', ring: 'ring-border-strong' },
};

const priorityColors: Record<string, { bg: string; text: string; ring: string; label: string }> = {
  critical: { bg: 'bg-error-subtle', text: 'text-error', ring: 'ring-error/20', label: 'Critical' },
  high: { bg: 'bg-error-subtle', text: 'text-error', ring: 'ring-error/20', label: 'High' },
  medium: { bg: 'bg-warning-subtle', text: 'text-warning', ring: 'ring-warning/20', label: 'Medium' },
  low: { bg: 'bg-info-subtle', text: 'text-info', ring: 'ring-info/20', label: 'Low' },
};

const statusLabels: Record<string, string> = {
  new: 'New',
  assigned: 'Assigned',
  in_progress: 'In Progress',
  pending: 'Pending',
  resolved: 'Resolved',
  closed: 'Closed',
};

export default function IssuesPage() {
  const tp = useT('pages');
  const ti = useT('issues');
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [assignedFilter, setAssignedFilter] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(1);

  const { data, isLoading, error, refetch } = useIssues({
    page,
    limit: 20,
    status: statusFilter !== 'all' ? statusFilter : undefined,
    priority: priorityFilter !== 'all' ? priorityFilter : undefined,
    search: searchQuery || undefined,
    assignedTo: assignedFilter === 'me' ? 'me' : assignedFilter === 'unassigned' ? 'unassigned' : undefined,
  });

  const issues = data?.data ?? [];
  const pagination = data?.pagination ?? { page: 1, limit: 20, total: 0, totalPages: 1 };

  const changeStatusMutation = useChangeIssueStatus();
  const deleteIssueMutation = useDeleteIssue();

  const handleStatusChange = async (issueId: string, newStatus: string) => {
    try {
      await changeStatusMutation.mutateAsync({ id: issueId, status: newStatus });
      refetch();
    } catch (error) {
      console.error('Failed to update issue status:', error);
    }
  };

  const handleDelete = async (issueId: string, issueNumber: string) => {
    if (window.confirm(`Are you sure you want to delete issue ${issueNumber}?`)) {
      try {
        await deleteIssueMutation.mutateAsync(issueId);
        refetch();
      } catch (error) {
        console.error('Failed to delete issue:', error);
      }
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (error) {
    return (
      <div className="bg-error-subtle border border-error rounded-lg p-6 text-center">
        <AlertCircle className="h-12 w-12 text-error mx-auto mb-4" />
        <h3 className="text-lg font-medium text-error mb-2">Error loading issues</h3>
        <p className="text-error">Please try refreshing the page</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{tp('issues')}</h1>
          <p className="mt-1 text-sm text-secondary">
            Manage and track IT incidents and problems
          </p>
        </div>
        <Link href="/issues/new">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            {tp('newIssue')}
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
              placeholder={ti('searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              className="w-full pl-10 pr-4 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <Button
            variant="outline"
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center"
          >
            <Filter className="h-4 w-4 mr-2" />
            {tp('filters')}
            <ChevronDown className={`h-4 w-4 ml-2 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
          </Button>
        </div>

        {showFilters && (
          <div className="mt-4 pt-4 border-t border-border grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">{ti('status')}</label>
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="all">{ti('allStatus')}</option>
                <option value="new">{ti('statusNew')}</option>
                <option value="assigned">{ti('statusAssigned')}</option>
                <option value="in_progress">{ti('statusInProgress')}</option>
                <option value="pending">{ti('statusPending')}</option>
                <option value="resolved">{ti('statusResolved')}</option>
                <option value="closed">{ti('statusClosed')}</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">{ti('priority')}</label>
              <select
                value={priorityFilter}
                onChange={(e) => {
                  setPriorityFilter(e.target.value);
                  setPage(1);
                }}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="all">{ti('allPriorities')}</option>
                <option value="critical">{ti('priorityCritical')}</option>
                <option value="high">{ti('priorityHigh')}</option>
                <option value="medium">{ti('priorityMedium')}</option>
                <option value="low">{ti('priorityLow')}</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">{ti('assignedTo')}</label>
              <select
                value={assignedFilter}
                onChange={(e) => {
                  setAssignedFilter(e.target.value);
                  setPage(1);
                }}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="all">{ti('allUsers')}</option>
                <option value="me">{ti('assignedToMe')}</option>
                <option value="unassigned">{ti('unassigned')}</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Issues Table */}
      <div className="bg-surface border border-border rounded-xl shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-2 text-secondary">{ti('loading')}</span>
          </div>
        ) : (
          <>
            <table className="min-w-full divide-y divide-border">
              <thead className="bg-background">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted bg-background border-b border-border">
                    {ti('colIssue')}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted bg-background border-b border-border">
                    {ti('priority')}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted bg-background border-b border-border">
                    {ti('status')}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted bg-background border-b border-border">
                    {ti('assignedTo')}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted bg-background border-b border-border">
                    {ti('colUpdated')}
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted bg-background border-b border-border">
                    {ti('colActions')}
                  </th>
                </tr>
              </thead>
              <tbody className="bg-surface divide-y divide-border">
                {issues.map((issue: Issue) => {
                  const priority = issue.priority || 'medium';
                  const status = issue.status || 'new';
                  const priorityStyle = priorityColors[priority] || priorityColors.medium;
                  const statusStyle = statusColors[status] || statusColors.new;

                  return (
                    <tr key={issue.id} className="border-b border-border last:border-0 hover:bg-surface-hover transition-colors duration-150">
                      <td className="px-4 py-3">
                        <div className="flex items-start">
                          <AlertCircle className={`h-5 w-5 mr-3 mt-0.5 ${
                            priority === 'critical' || priority === 'high' ? 'text-error' : 'text-muted'
                          }`} />
                          <div>
                            <Link
                              href={`/issues/${issue.id}`}
                              className="text-sm font-medium text-primary hover:text-primary-hover"
                            >
                              {issue.issue_number}
                            </Link>
                            <p className="text-sm text-foreground mt-1">{issue.title}</p>
                            {issue.application_name && (
                              <p className="text-xs text-muted mt-1">
                                App: {issue.application_name}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ring-1 ring-inset ${priorityStyle.bg} ${priorityStyle.text} ${priorityStyle.ring}`}
                        >
                          {priorityStyle.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ring-1 ring-inset ${statusStyle.bg} ${statusStyle.text} ${statusStyle.ring}`}
                        >
                          {statusLabels[status] || status}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {issue.assignee_name ? (
                          <div className="flex items-center">
                            <div className="h-8 w-8 rounded-full bg-primary-subtle flex items-center justify-center text-sm font-medium text-primary">
                              {issue.assignee_name.charAt(0)}
                            </div>
                            <span className="ml-2 text-sm text-foreground">
                              {issue.assignee_name}
                            </span>
                          </div>
                        ) : (
                          <span className="text-sm text-secondary italic">{ti('unassigned')}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center text-sm text-secondary">
                          <Clock className="h-4 w-4 mr-1" />
                          {formatDate(issue.updated_at)}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right">
                        <DropdownMenu
                          trigger={
                            <button className="text-muted hover:text-foreground p-1 rounded hover:bg-surface-hover">
                              <MoreHorizontal className="h-5 w-5" />
                            </button>
                          }
                        >
                          <DropdownMenuItem onClick={() => router.push(`/issues/${issue.id}`)}>
                            <Eye className="h-4 w-4 mr-2" />
                            {ti('viewDetails')}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => router.push(`/issues/${issue.id}/edit`)}>
                            <Edit className="h-4 w-4 mr-2" />
                            {ti('edit')}
                          </DropdownMenuItem>
                          <DropdownMenuDivider />
                          {issue.status !== 'in_progress' && (
                            <DropdownMenuItem onClick={() => handleStatusChange(issue.id, 'in_progress')}>
                              <CheckCircle className="h-4 w-4 mr-2" />
                              {ti('markInProgress')}
                            </DropdownMenuItem>
                          )}
                          {issue.status !== 'resolved' && (
                            <DropdownMenuItem onClick={() => handleStatusChange(issue.id, 'resolved')}>
                              <CheckCircle className="h-4 w-4 mr-2" />
                              {ti('markResolved')}
                            </DropdownMenuItem>
                          )}
                          {issue.status !== 'closed' && (
                            <DropdownMenuItem onClick={() => handleStatusChange(issue.id, 'closed')}>
                              <XCircle className="h-4 w-4 mr-2" />
                              {ti('closeIssue')}
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuDivider />
                          <DropdownMenuItem
                            variant="danger"
                            onClick={() => handleDelete(issue.id, issue.issue_number)}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            {ti('delete')}
                          </DropdownMenuItem>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {issues.length === 0 && (
              <div className="text-center py-12">
                <AlertCircle className="h-12 w-12 text-muted mx-auto mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-2">{ti('noIssues')}</h3>
                <p className="text-secondary">{ti('adjustFilters')}</p>
              </div>
            )}

            {/* Pagination */}
            <div className="px-4 py-3 border-t border-border flex items-center justify-between">
              <div className="text-sm text-secondary">
                Showing {issues.length} of {pagination.total} issues
              </div>
              <div className="flex space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                >
                  {ti('previous')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= pagination.totalPages}
                  onClick={() => setPage(p => p + 1)}
                >
                  {ti('next')}
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
