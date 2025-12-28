'use client';

import { useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  RefreshCw,
  ShoppingCart,
  Server,
  TrendingUp,
  Clock,
  Loader2,
  ArrowUp,
  ArrowDown,
  Radio,
  Pause,
  Play,
} from 'lucide-react';
import { useDashboard, useRecentActivity, useUpcomingChanges, useIssueTrends, useIssuesByPriority } from '@/hooks/useApi';
import { useQueryClient } from '@tanstack/react-query';

// Auto-refresh interval in milliseconds (30 seconds)
const AUTO_REFRESH_INTERVAL = 30000;

const statusColors: Record<string, string> = {
  open: 'bg-blue-100 text-blue-800',
  in_progress: 'bg-yellow-100 text-yellow-800',
  pending: 'bg-purple-100 text-purple-800',
  resolved: 'bg-green-100 text-green-800',
  scheduled: 'bg-blue-100 text-blue-800',
  implementing: 'bg-purple-100 text-purple-800',
};

const riskColors: Record<string, string> = {
  low: 'bg-green-100 text-green-800',
  medium: 'bg-yellow-100 text-yellow-800',
  high: 'bg-red-100 text-red-800',
};

// Simple line chart component
function IssueTrendsChart({ data }: { data: { date: string; created: number; resolved: number }[] }) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-400">
        No trend data available
      </div>
    );
  }

  const maxValue = Math.max(...data.flatMap((d) => [d.created, d.resolved])) || 1;
  const chartHeight = 160;
  const chartWidth = 100;
  const padding = 10;

  const getY = (value: number) => chartHeight - padding - ((value / maxValue) * (chartHeight - 2 * padding));
  const getX = (index: number) => padding + (index / Math.max(data.length - 1, 1)) * (chartWidth - 2 * padding);

  const createdPath = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(d.created)}`).join(' ');
  const resolvedPath = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(d.resolved)}`).join(' ');

  const totalCreated = data.reduce((sum, d) => sum + d.created, 0);
  const totalResolved = data.reduce((sum, d) => sum + d.resolved, 0);
  const trend = totalResolved > totalCreated;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4 text-sm">
          <span className="flex items-center">
            <span className="w-3 h-0.5 bg-red-500 mr-1"></span>
            Created ({totalCreated})
          </span>
          <span className="flex items-center">
            <span className="w-3 h-0.5 bg-green-500 mr-1"></span>
            Resolved ({totalResolved})
          </span>
        </div>
        <div className={`flex items-center text-sm ${trend ? 'text-green-600' : 'text-red-600'}`}>
          {trend ? <ArrowDown className="h-4 w-4 mr-1" /> : <ArrowUp className="h-4 w-4 mr-1" />}
          {trend ? 'Backlog decreasing' : 'Backlog increasing'}
        </div>
      </div>
      <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full h-48">
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
          <line
            key={ratio}
            x1={padding}
            y1={chartHeight - padding - ratio * (chartHeight - 2 * padding)}
            x2={chartWidth - padding}
            y2={chartHeight - padding - ratio * (chartHeight - 2 * padding)}
            stroke="#e5e7eb"
            strokeWidth="0.5"
          />
        ))}
        {/* Lines */}
        <path d={createdPath} fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d={resolvedPath} fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {/* Points */}
        {data.map((d, i) => (
          <g key={i}>
            <circle cx={getX(i)} cy={getY(d.created)} r="2" fill="#ef4444" />
            <circle cx={getX(i)} cy={getY(d.resolved)} r="2" fill="#22c55e" />
          </g>
        ))}
      </svg>
      <div className="flex justify-between text-xs text-gray-500">
        <span>{data[0]?.date ? new Date(data[0].date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}</span>
        <span>{data[data.length - 1]?.date ? new Date(data[data.length - 1].date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}</span>
      </div>
    </div>
  );
}

// Priority distribution bar chart
function PriorityDistributionChart({ data }: { data: { priority: string; count: number }[] }) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-gray-400">
        No data available
      </div>
    );
  }

  const maxCount = Math.max(...data.map((d) => d.count)) || 1;
  const total = data.reduce((sum, d) => sum + d.count, 0);

  const priorityColors: Record<string, string> = {
    critical: 'bg-red-500',
    high: 'bg-orange-500',
    medium: 'bg-yellow-500',
    low: 'bg-green-500',
  };

  return (
    <div className="space-y-3">
      {data.map((item) => (
        <div key={item.priority} className="flex items-center">
          <div className="w-16 text-xs font-medium text-gray-600 capitalize">{item.priority}</div>
          <div className="flex-1 mx-2">
            <div className="h-6 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full ${priorityColors[item.priority] || 'bg-gray-400'} rounded-full transition-all duration-500`}
                style={{ width: `${(item.count / maxCount) * 100}%` }}
              />
            </div>
          </div>
          <div className="w-16 text-right text-sm font-medium text-gray-900">
            {item.count}
            <span className="text-xs text-gray-500 ml-1">({total > 0 ? Math.round((item.count / total) * 100) : 0}%)</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdatedKey, setLastUpdatedKey] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const queryClient = useQueryClient();

  const refetchOptions = {
    refetchInterval: autoRefresh ? AUTO_REFRESH_INTERVAL : false as const,
  };

  const { data: dashboardData, isLoading: dashboardLoading, error: dashboardError, isFetching: dashboardFetching, dataUpdatedAt } = useDashboard(refetchOptions);
  const { data: activityData, isLoading: activityLoading, isFetching: activityFetching } = useRecentActivity(10, refetchOptions);
  const { data: changesData, isLoading: changesLoading, isFetching: changesFetching } = useUpcomingChanges(7, refetchOptions);
  const { data: trendsData, isLoading: trendsLoading, isFetching: trendsFetching } = useIssueTrends(14, refetchOptions);
  const { data: priorityData, isLoading: priorityLoading, isFetching: priorityFetching } = useIssuesByPriority(refetchOptions);

  const isAnyFetching = dashboardFetching || activityFetching || changesFetching || trendsFetching || priorityFetching;

  // Derive last updated time from query's dataUpdatedAt timestamp
  const lastUpdated = useMemo(() => {
    // Use dataUpdatedAt from react-query if available, otherwise use current time
    return dataUpdatedAt ? new Date(dataUpdatedAt) : new Date();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataUpdatedAt, lastUpdatedKey]);

  // Manual refresh handler
  const handleManualRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    setLastUpdatedKey(k => k + 1);
    setIsRefreshing(false);
  }, [queryClient]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatLastUpdated = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  if (dashboardLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        <span className="ml-2 text-gray-500">Loading dashboard...</span>
      </div>
    );
  }

  if (dashboardError) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
        <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-red-800 mb-2">Error loading dashboard</h3>
        <p className="text-red-600">Please try refreshing the page</p>
      </div>
    );
  }

  const stats = [
    {
      name: 'Open Issues',
      value: dashboardData?.issues?.open ?? 0,
      subValue: dashboardData?.issues?.critical_open ? `${dashboardData.issues.critical_open} critical` : null,
      icon: AlertCircle,
      color: 'bg-red-500',
      href: '/issues',
    },
    {
      name: 'Pending Changes',
      value: (dashboardData?.changes?.scheduled ?? 0) + (dashboardData?.changes?.in_progress ?? 0),
      subValue: dashboardData?.changes?.scheduled ? `${dashboardData.changes.scheduled} scheduled` : null,
      icon: RefreshCw,
      color: 'bg-yellow-500',
      href: '/changes',
    },
    {
      name: 'Active Requests',
      value: dashboardData?.requests?.pending ?? 0,
      subValue: dashboardData?.requests?.total ? `${dashboardData.requests.total} this month` : null,
      icon: ShoppingCart,
      color: 'bg-blue-500',
      href: '/catalog',
    },
    {
      name: 'Avg Health Score',
      value: dashboardData?.health?.avg_score ? `${dashboardData.health.avg_score}%` : 'N/A',
      subValue: dashboardData?.health?.critical ? `${dashboardData.health.critical} critical` : null,
      icon: Server,
      color: 'bg-green-500',
      href: '/applications',
    },
  ];

  const recentActivity = activityData?.activity ?? [];
  const upcomingChanges = changesData?.changes ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="mt-1 text-sm text-gray-500">
            Overview of your IT service management metrics
          </p>
        </div>
        <div className="flex items-center space-x-4">
          {/* Last Updated Indicator */}
          <div className="flex items-center text-sm text-gray-500">
            {isAnyFetching && (
              <Radio className="h-4 w-4 mr-2 text-blue-500 animate-pulse" />
            )}
            <span>Updated: {formatLastUpdated(lastUpdated)}</span>
          </div>

          {/* Auto-Refresh Toggle */}
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`flex items-center px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              autoRefresh
                ? 'bg-green-100 text-green-700 hover:bg-green-200'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
            title={autoRefresh ? 'Auto-refresh enabled (30s)' : 'Auto-refresh disabled'}
          >
            {autoRefresh ? (
              <>
                <Pause className="h-4 w-4 mr-1.5" />
                Live
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-1.5" />
                Paused
              </>
            )}
          </button>

          {/* Manual Refresh Button */}
          <button
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            className="flex items-center px-3 py-1.5 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <RefreshCw className={`h-4 w-4 mr-1.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Link key={stat.name} href={stat.href} className="bg-white overflow-hidden shadow rounded-lg hover:shadow-md transition-shadow">
            <div className="p-5">
              <div className="flex items-center">
                <div className={`flex-shrink-0 ${stat.color} rounded-md p-3`}>
                  <stat.icon className="h-6 w-6 text-white" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">{stat.name}</dt>
                    <dd className="flex items-baseline">
                      <div className="text-2xl font-semibold text-gray-900">{stat.value}</div>
                      {stat.subValue && (
                        <div className="ml-2 text-sm text-gray-500">
                          {stat.subValue}
                        </div>
                      )}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Issue Trends and Priority Distribution */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Issue Trends Chart */}
        <div className="bg-white shadow rounded-lg">
          <div className="px-4 py-5 sm:px-6 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium text-gray-900">Issue Trends (14 days)</h3>
              <Link href="/reports" className="text-sm text-blue-600 hover:text-blue-500">
                View reports
              </Link>
            </div>
          </div>
          <div className="p-4 sm:p-6">
            {trendsLoading ? (
              <div className="flex items-center justify-center h-48">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
              </div>
            ) : (
              <IssueTrendsChart data={trendsData?.trends || []} />
            )}
          </div>
        </div>

        {/* Priority Distribution */}
        <div className="bg-white shadow rounded-lg">
          <div className="px-4 py-5 sm:px-6 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium text-gray-900">Open Issues by Priority</h3>
              <Link href="/issues" className="text-sm text-blue-600 hover:text-blue-500">
                View all
              </Link>
            </div>
          </div>
          <div className="p-4 sm:p-6">
            {priorityLoading ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
              </div>
            ) : (
              <PriorityDistributionChart data={priorityData?.data || []} />
            )}
          </div>
        </div>
      </div>

      {/* Recent Activity and Upcoming Changes */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Recent Activity */}
        <div className="bg-white shadow rounded-lg">
          <div className="px-4 py-5 sm:px-6 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium text-gray-900">Recent Activity</h3>
              <Link href="/issues" className="text-sm text-blue-600 hover:text-blue-500">
                View all
              </Link>
            </div>
          </div>
          {activityLoading ? (
            <div className="p-8 text-center">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400 mx-auto" />
            </div>
          ) : recentActivity.length > 0 ? (
            <ul className="divide-y divide-gray-200">
              {recentActivity.slice(0, 5).map((item: { id: string; type: string; reference_id: string; title: string; status: string; created_at: string }) => (
                <li key={item.id} className="px-4 py-4 sm:px-6 hover:bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-3">
                        <span className="text-sm font-medium text-gray-900">{item.reference_id}</span>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          item.type === 'issue' ? 'bg-red-100 text-red-800' :
                          item.type === 'change' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-blue-100 text-blue-800'
                        }`}>
                          {item.type}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-gray-600 truncate">{item.title}</p>
                    </div>
                    <div className="ml-4 flex flex-col items-end space-y-1">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        statusColors[item.status] || 'bg-gray-100 text-gray-800'
                      }`}>
                        {item.status.replace('_', ' ')}
                      </span>
                      <span className="text-xs text-gray-500">{formatDate(item.created_at)}</span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="p-8 text-center text-gray-500">
              No recent activity
            </div>
          )}
        </div>

        {/* Upcoming Changes */}
        <div className="bg-white shadow rounded-lg">
          <div className="px-4 py-5 sm:px-6 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium text-gray-900">Upcoming Changes</h3>
              <Link href="/changes" className="text-sm text-blue-600 hover:text-blue-500">
                View all
              </Link>
            </div>
          </div>
          {changesLoading ? (
            <div className="p-8 text-center">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400 mx-auto" />
            </div>
          ) : upcomingChanges.length > 0 ? (
            <ul className="divide-y divide-gray-200">
              {upcomingChanges.slice(0, 5).map((change: { id: string; change_id: string; title: string; risk_level: string; scheduled_start: string; application_name?: string }) => (
                <li key={change.id} className="px-4 py-4 sm:px-6 hover:bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-3">
                        <span className="text-sm font-medium text-gray-900">{change.change_id}</span>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          riskColors[change.risk_level] || 'bg-gray-100 text-gray-800'
                        }`}>
                          {change.risk_level} risk
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-gray-600 truncate">{change.title}</p>
                      {change.application_name && (
                        <p className="text-xs text-gray-500">App: {change.application_name}</p>
                      )}
                    </div>
                    <div className="ml-4 flex flex-col items-end space-y-1">
                      <span className="text-xs text-gray-500 flex items-center">
                        <Clock className="h-3 w-3 mr-1" />
                        {formatDate(change.scheduled_start)}
                      </span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="p-8 text-center text-gray-500">
              No upcoming changes
            </div>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Quick Actions</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Link
            href="/issues/new"
            className="flex flex-col items-center p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <AlertCircle className="h-8 w-8 text-red-500 mb-2" />
            <span className="text-sm font-medium text-gray-900">Create Issue</span>
          </Link>
          <Link
            href="/changes/new"
            className="flex flex-col items-center p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <RefreshCw className="h-8 w-8 text-yellow-500 mb-2" />
            <span className="text-sm font-medium text-gray-900">New Change</span>
          </Link>
          <Link
            href="/catalog"
            className="flex flex-col items-center p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <ShoppingCart className="h-8 w-8 text-blue-500 mb-2" />
            <span className="text-sm font-medium text-gray-900">Service Request</span>
          </Link>
          <Link
            href="/reports"
            className="flex flex-col items-center p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <TrendingUp className="h-8 w-8 text-green-500 mb-2" />
            <span className="text-sm font-medium text-gray-900">View Reports</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
