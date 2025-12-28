'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Edit,
  Server,
  AlertTriangle,
  CheckCircle,
  Users,
  ExternalLink,
  MoreHorizontal,
  TrendingUp,
  TrendingDown,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useApplication, useApplicationHealth, useIssues, useChanges } from '@/hooks/useApi';

const statusColors: Record<string, { bg: string; text: string; label: string }> = {
  active: { bg: 'bg-green-100', text: 'text-green-800', label: 'Active' },
  inactive: { bg: 'bg-gray-100', text: 'text-gray-800', label: 'Inactive' },
  deprecated: { bg: 'bg-red-100', text: 'text-red-800', label: 'Deprecated' },
  operational: { bg: 'bg-green-100', text: 'text-green-800', label: 'Operational' },
  degraded: { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'Degraded' },
  partial_outage: { bg: 'bg-orange-100', text: 'text-orange-800', label: 'Partial Outage' },
  major_outage: { bg: 'bg-red-100', text: 'text-red-800', label: 'Major Outage' },
  maintenance: { bg: 'bg-blue-100', text: 'text-blue-800', label: 'Maintenance' },
};

const criticalityColors: Record<string, { bg: string; text: string }> = {
  critical: { bg: 'bg-red-100', text: 'text-red-800' },
  high: { bg: 'bg-orange-100', text: 'text-orange-800' },
  medium: { bg: 'bg-yellow-100', text: 'text-yellow-800' },
  low: { bg: 'bg-blue-100', text: 'text-blue-800' },
};

const stateColors: Record<string, { bg: string; text: string }> = {
  new: { bg: 'bg-blue-100', text: 'text-blue-800' },
  in_progress: { bg: 'bg-yellow-100', text: 'text-yellow-800' },
  pending: { bg: 'bg-purple-100', text: 'text-purple-800' },
  resolved: { bg: 'bg-green-100', text: 'text-green-800' },
  scheduled: { bg: 'bg-blue-100', text: 'text-blue-800' },
};

const getHealthScoreColor = (score: number) => {
  if (score >= 90) return 'text-green-600';
  if (score >= 70) return 'text-yellow-600';
  if (score >= 50) return 'text-orange-600';
  return 'text-red-600';
};

export default function ApplicationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'overview' | 'issues' | 'changes' | 'health'>('overview');

  const appId = params.id as string;
  const { data: app, isLoading, error } = useApplication(appId);
  const { data: healthData } = useApplicationHealth(appId);
  // Fetch related issues and changes for this application
  const { data: issuesData } = useIssues({ limit: 10 });
  const { data: changesData } = useChanges({ limit: 10 });

  // Filter issues and changes related to this application
  const relatedIssues = issuesData?.data?.filter((issue: { application?: { id: string } }) =>
    issue.application?.id === appId
  ) || [];
  const relatedChanges = changesData?.data?.filter((change: { application?: { id: string } }) =>
    change.application?.id === appId
  ) || [];

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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (error || !app) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Application not found</h2>
        <p className="text-gray-500 mb-4">The application you&apos;re looking for doesn&apos;t exist or you don&apos;t have access to it.</p>
        <Button onClick={() => router.push('/applications')}>Back to Applications</Button>
      </div>
    );
  }

  // Use app data with fallbacks for optional fields
  const healthScore = app.health_score ?? healthData?.score ?? 0;
  const healthTrend = healthData?.trend ?? 0;
  const status: string = app.status || 'active';
  const openIssueCount = relatedIssues.filter((i: { state: string }) => i.state !== 'resolved' && i.state !== 'closed').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => router.back()}
            className="p-2 hover:bg-gray-100 rounded-md"
          >
            <ArrowLeft className="h-5 w-5 text-gray-500" />
          </button>
          <div className="h-12 w-12 rounded-lg bg-blue-100 flex items-center justify-center">
            <Server className="h-6 w-6 text-blue-600" />
          </div>
          <div>
            <div className="flex items-center space-x-3">
              <h1 className="text-2xl font-bold text-gray-900">{app.name}</h1>
              {app.criticality && (
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    criticalityColors[app.criticality]?.bg || 'bg-gray-100'
                  } ${criticalityColors[app.criticality]?.text || 'text-gray-800'}`}
                >
                  {app.criticality.charAt(0).toUpperCase() + app.criticality.slice(1)}
                </span>
              )}
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  statusColors[status]?.bg || 'bg-gray-100'
                } ${statusColors[status]?.text || 'text-gray-800'}`}
              >
                {status === 'active' && <CheckCircle className="h-3 w-3 mr-1" />}
                {status === 'deprecated' && <AlertTriangle className="h-3 w-3 mr-1" />}
                {statusColors[status]?.label || status}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <Link href={`/applications/${params.id}/edit`}>
            <Button variant="outline">
              <Edit className="h-4 w-4 mr-2" />
              Edit
            </Button>
          </Link>
          <Button variant="outline">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Health Score Banner */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-6">
            <div>
              <p className="text-sm text-gray-500">Health Score</p>
              <div className="flex items-center">
                <span className={`text-4xl font-bold ${getHealthScoreColor(healthScore)}`}>
                  {healthScore}%
                </span>
                {healthTrend !== 0 && (
                  <span
                    className={`ml-2 flex items-center text-sm ${
                      healthTrend > 0 ? 'text-green-600' : 'text-red-600'
                    }`}
                  >
                    {healthTrend > 0 ? (
                      <TrendingUp className="h-4 w-4 mr-1" />
                    ) : (
                      <TrendingDown className="h-4 w-4 mr-1" />
                    )}
                    {Math.abs(healthTrend)}%
                  </span>
                )}
              </div>
            </div>
            <div className="h-12 border-l border-gray-200" />
            <div>
              <p className="text-sm text-gray-500">Open Issues</p>
              <p className="text-2xl font-semibold text-gray-900">
                {openIssueCount}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Pending Changes</p>
              <p className="text-2xl font-semibold text-gray-900">{relatedChanges.length}</p>
            </div>
          </div>
          <div className="flex space-x-2">
            <Link href={`/issues/new?application=${params.id}`}>
              <Button size="sm">Report Issue</Button>
            </Link>
            <Link href={`/changes/new?application=${params.id}`}>
              <Button size="sm" variant="outline">Request Change</Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {['overview', 'issues', 'changes', 'health'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as typeof activeTab)}
              className={`py-4 px-1 border-b-2 font-medium text-sm capitalize ${
                activeTab === tab
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Description</h2>
              <p className="text-gray-700">{app.description}</p>
            </div>

            {app.metadata && (app.metadata as Record<string, string>).url && (
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Links</h2>
                <div className="space-y-3">
                  <a
                    href={(app.metadata as Record<string, string>).url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center text-blue-600 hover:text-blue-800"
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Application URL
                  </a>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Details</h2>
              <dl className="space-y-4">
                {app.owner_user_name && (
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Owner</dt>
                    <dd className="mt-1 flex items-center">
                      <div className="h-8 w-8 rounded-full bg-gray-200 flex items-center justify-center text-sm font-medium text-gray-600">
                        {app.owner_user_name.charAt(0)}
                      </div>
                      <div className="ml-2">
                        <p className="text-sm font-medium text-gray-900">{app.owner_user_name}</p>
                        {app.owner_user_email && <p className="text-xs text-gray-500">{app.owner_user_email}</p>}
                      </div>
                    </dd>
                  </div>
                )}
                {app.support_group_name && (
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Support Group</dt>
                    <dd className="mt-1 flex items-center text-sm text-gray-900">
                      <Users className="h-4 w-4 mr-2 text-gray-400" />
                      {app.support_group_name}
                    </dd>
                  </div>
                )}
                {app.lifecycle_stage && (
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Lifecycle Stage</dt>
                    <dd className="mt-1 text-sm text-gray-900 capitalize">{app.lifecycle_stage.replace('_', ' ')}</dd>
                  </div>
                )}
                <div>
                  <dt className="text-sm font-medium text-gray-500">Last Updated</dt>
                  <dd className="mt-1 text-sm text-gray-900">{formatDate(app.updated_at)}</dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'issues' && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Related Issues</h2>
            <Link href={`/issues/new?application=${params.id}`}>
              <Button size="sm">New Issue</Button>
            </Link>
          </div>
          {relatedIssues.length > 0 ? (
            <ul className="divide-y divide-gray-200">
              {relatedIssues.map((issue: { id: string; number: string; short_description: string; state: string }) => (
                <li key={issue.id}>
                  <Link
                    href={`/issues/${issue.id}`}
                    className="block hover:bg-gray-50 px-6 py-4"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-blue-600">{issue.number}</p>
                        <p className="text-sm text-gray-900 mt-1">{issue.short_description}</p>
                      </div>
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          stateColors[issue.state]?.bg || 'bg-gray-100'
                        } ${stateColors[issue.state]?.text || 'text-gray-800'}`}
                      >
                        {issue.state.replace('_', ' ')}
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-center py-12">
              <p className="text-gray-500">No related issues</p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'changes' && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Related Changes</h2>
            <Link href={`/changes/new?application=${params.id}`}>
              <Button size="sm">New Change</Button>
            </Link>
          </div>
          {relatedChanges.length > 0 ? (
            <ul className="divide-y divide-gray-200">
              {relatedChanges.map((change: { id: string; number: string; short_description: string; state: string; planned_start: string }) => (
                <li key={change.id}>
                  <Link
                    href={`/changes/${change.id}`}
                    className="block hover:bg-gray-50 px-6 py-4"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-blue-600">{change.number}</p>
                        <p className="text-sm text-gray-900 mt-1">{change.short_description}</p>
                        {change.planned_start && (
                          <p className="text-xs text-gray-500 mt-1">
                            Scheduled: {formatDate(change.planned_start)}
                          </p>
                        )}
                      </div>
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          stateColors[change.state]?.bg || 'bg-gray-100'
                        } ${stateColors[change.state]?.text || 'text-gray-800'}`}
                      >
                        {change.state.replace('_', ' ')}
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-center py-12">
              <p className="text-gray-500">No related changes</p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'health' && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Health History</h2>
          <div className="space-y-4">
            {healthData?.history && healthData.history.length > 0 ? (
              healthData.history.map((entry: { date: string; score: number }) => (
                <div key={entry.date} className="flex items-center">
                  <span className="w-24 text-sm text-gray-500">{entry.date}</span>
                  <div className="flex-1 mx-4">
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full ${
                          entry.score >= 90
                            ? 'bg-green-500'
                            : entry.score >= 70
                            ? 'bg-yellow-500'
                            : 'bg-red-500'
                        }`}
                        style={{ width: `${entry.score}%` }}
                      />
                    </div>
                  </div>
                  <span className={`w-12 text-sm font-medium ${getHealthScoreColor(entry.score)}`}>
                    {entry.score}%
                  </span>
                </div>
              ))
            ) : (
              <p className="text-sm text-gray-500">No health history available</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
