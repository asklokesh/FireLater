'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Plus,
  Search,
  Filter,
  ChevronDown,
  AlertTriangle,
  Clock,
  MoreHorizontal,
  Loader2,
  CheckCircle,
  Lightbulb,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useProblems, Problem } from '@/hooks/useApi';

const statusColors: Record<string, { bg: string; text: string }> = {
  new: { bg: 'bg-info-subtle', text: 'text-foreground' },
  assigned: { bg: 'bg-info-subtle', text: 'text-info' },
  investigating: { bg: 'bg-warning-subtle', text: 'text-warning' },
  root_cause_identified: { bg: 'bg-warning-subtle', text: 'text-warning' },
  known_error: { bg: 'bg-info-subtle', text: 'text-info' },
  resolved: { bg: 'bg-success-subtle', text: 'text-success' },
  closed: { bg: 'bg-background', text: 'text-foreground' },
};

const priorityColors: Record<string, { bg: string; text: string; label: string }> = {
  critical: { bg: 'bg-error-subtle', text: 'text-error', label: 'Critical' },
  high: { bg: 'bg-warning-subtle', text: 'text-warning', label: 'High' },
  medium: { bg: 'bg-warning-subtle', text: 'text-warning', label: 'Medium' },
  low: { bg: 'bg-info-subtle', text: 'text-foreground', label: 'Low' },
};

const statusLabels: Record<string, string> = {
  new: 'New',
  assigned: 'Assigned',
  investigating: 'Investigating',
  root_cause_identified: 'Root Cause Identified',
  known_error: 'Known Error',
  resolved: 'Resolved',
  closed: 'Closed',
};

const typeColors: Record<string, { bg: string; text: string }> = {
  reactive: { bg: 'bg-error-subtle', text: 'text-error' },
  proactive: { bg: 'bg-success-subtle', text: 'text-success' },
};

export default function ProblemsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(1);

  const { data, isLoading, error } = useProblems({
    page,
    limit: 20,
    status: statusFilter !== 'all' ? statusFilter : undefined,
    priority: priorityFilter !== 'all' ? priorityFilter : undefined,
    problemType: typeFilter !== 'all' ? typeFilter : undefined,
    search: searchQuery || undefined,
  });

  const problems = data?.data ?? [];
  const pagination = data?.pagination ?? { page: 1, limit: 20, total: 0, totalPages: 1 };

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
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
        <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-error mb-2">Error loading problems</h3>
        <p className="text-error">Please try refreshing the page</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Problems</h1>
          <p className="mt-1 text-sm text-muted">
            Root cause analysis and known error management
          </p>
        </div>
        <Link href="/problems/new">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            New Problem
          </Button>
        </Link>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-surface rounded-xl shadow-sm p-4">
          <div className="flex items-center">
            <AlertTriangle className="h-8 w-8 text-yellow-500 mr-3" />
            <div>
              <p className="text-sm text-muted">Open Problems</p>
              <p className="text-2xl font-bold text-foreground">{problems.filter((p: Problem) => !['resolved', 'closed'].includes(p.status)).length}</p>
            </div>
          </div>
        </div>
        <div className="bg-surface rounded-xl shadow-sm p-4">
          <div className="flex items-center">
            <Lightbulb className="h-8 w-8 text-purple-500 mr-3" />
            <div>
              <p className="text-sm text-muted">Known Errors</p>
              <p className="text-2xl font-bold text-foreground">{problems.filter((p: Problem) => p.is_known_error).length}</p>
            </div>
          </div>
        </div>
        <div className="bg-surface rounded-xl shadow-sm p-4">
          <div className="flex items-center">
            <Search className="h-8 w-8 text-primary mr-3" />
            <div>
              <p className="text-sm text-muted">Investigating</p>
              <p className="text-2xl font-bold text-foreground">{problems.filter((p: Problem) => p.status === 'investigating').length}</p>
            </div>
          </div>
        </div>
        <div className="bg-surface rounded-xl shadow-sm p-4">
          <div className="flex items-center">
            <CheckCircle className="h-8 w-8 text-green-500 mr-3" />
            <div>
              <p className="text-sm text-muted">Resolved</p>
              <p className="text-2xl font-bold text-foreground">{problems.filter((p: Problem) => p.status === 'resolved').length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="bg-surface rounded-xl shadow-sm p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
            <input
              type="text"
              placeholder="Search by number or title..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              className="w-full pl-10 pr-4 py-2 border border-border-strong rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
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
              <label className="block text-sm font-medium text-secondary mb-1">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
                className="w-full px-3 py-2 border border-border-strong rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              >
                <option value="all">All Status</option>
                <option value="new">New</option>
                <option value="assigned">Assigned</option>
                <option value="investigating">Investigating</option>
                <option value="root_cause_identified">Root Cause Identified</option>
                <option value="known_error">Known Error</option>
                <option value="resolved">Resolved</option>
                <option value="closed">Closed</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-secondary mb-1">Priority</label>
              <select
                value={priorityFilter}
                onChange={(e) => {
                  setPriorityFilter(e.target.value);
                  setPage(1);
                }}
                className="w-full px-3 py-2 border border-border-strong rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              >
                <option value="all">All Priorities</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-secondary mb-1">Problem Type</label>
              <select
                value={typeFilter}
                onChange={(e) => {
                  setTypeFilter(e.target.value);
                  setPage(1);
                }}
                className="w-full px-3 py-2 border border-border-strong rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              >
                <option value="all">All Types</option>
                <option value="reactive">Reactive</option>
                <option value="proactive">Proactive</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Problems Table */}
      <div className="bg-surface rounded-xl shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-2 text-muted">Loading problems...</span>
          </div>
        ) : (
          <>
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-background">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                    Problem
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                    Priority / Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                    Assigned To
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                    Linked Issues
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                    Updated
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-muted uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-surface divide-y divide-gray-200">
                {problems.map((problem: Problem) => {
                  const priority = problem.priority || 'medium';
                  const status = problem.status || 'new';
                  const problemType = problem.problem_type || 'reactive';
                  const priorityStyle = priorityColors[priority] || priorityColors.medium;
                  const statusStyle = statusColors[status] || statusColors.new;
                  const typeStyle = typeColors[problemType] || typeColors.reactive;

                  return (
                    <tr key={problem.id} className="hover:bg-background">
                      <td className="px-6 py-4">
                        <div className="flex items-start">
                          <AlertTriangle className={`h-5 w-5 mr-3 mt-0.5 ${
                            priority === 'critical' || priority === 'high' ? 'text-red-500' : 'text-yellow-500'
                          }`} />
                          <div>
                            <div className="flex items-center gap-2">
                              <Link
                                href={`/problems/${problem.id}`}
                                className="text-sm font-medium text-primary hover:text-foreground"
                              >
                                {problem.problem_number}
                              </Link>
                              {problem.is_known_error && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-info-subtle text-info">
                                  <Lightbulb className="h-3 w-3 mr-1" />
                                  KEDB
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-foreground mt-1">{problem.title}</p>
                            {problem.application_name && (
                              <p className="text-xs text-muted mt-1">
                                App: {problem.application_name}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="space-y-1">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${priorityStyle.bg} ${priorityStyle.text}`}
                          >
                            {priorityStyle.label}
                          </span>
                          <br />
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${typeStyle.bg} ${typeStyle.text}`}
                          >
                            {problemType.charAt(0).toUpperCase() + problemType.slice(1)}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusStyle.bg} ${statusStyle.text}`}
                        >
                          {statusLabels[status] || status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {problem.assignee_name ? (
                          <div className="flex items-center">
                            <div className="h-8 w-8 rounded-full bg-gray-200 flex items-center justify-center text-sm font-medium text-secondary">
                              {problem.assignee_name.charAt(0)}
                            </div>
                            <span className="ml-2 text-sm text-foreground">
                              {problem.assignee_name}
                            </span>
                          </div>
                        ) : (
                          <span className="text-sm text-muted italic">Unassigned</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm text-foreground">
                          {problem.linked_issues_count || 0} issues
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center text-sm text-muted">
                          <Clock className="h-4 w-4 mr-1" />
                          {formatDate(problem.updated_at)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <button className="text-muted hover:text-secondary">
                          <MoreHorizontal className="h-5 w-5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {problems.length === 0 && (
              <div className="text-center py-12">
                <AlertTriangle className="h-12 w-12 text-muted mx-auto mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-2">No problems found</h3>
                <p className="text-muted">Try adjusting your search or filters</p>
              </div>
            )}

            {/* Pagination */}
            <div className="px-6 py-4 border-t border-border flex items-center justify-between">
              <div className="text-sm text-muted">
                Showing {problems.length} of {pagination.total} problems
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
