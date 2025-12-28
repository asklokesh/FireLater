'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Plus,
  Phone,
  Clock,
  User,
  Calendar,
  AlertTriangle,
  ChevronRight,
  Shield,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useOncallSchedules, useWhoIsOnCall, useIssues } from '@/hooks/useApi';

// Local interfaces for type safety
interface OncallUser {
  id: string;
  name: string;
  email?: string;
  phone?: string;
}

interface OncallSchedule {
  id: string;
  name: string;
  description?: string;
  timezone?: string;
  rotation_period_days?: number;
  current_on_call?: OncallUser;
  next_on_call?: OncallUser;
  rotation_end?: string;
  escalation_policy?: {
    id: string;
    name: string;
  };
  is_active?: boolean;
}

interface Issue {
  id: string;
  number: string;
  title: string;
  priority: string;
  state: string;
  assigned_to?: {
    id: string;
    name: string;
  };
  created_at: string;
  acknowledged_at?: string;
}

interface OncallEntry {
  schedule_id: string;
  schedule_name: string;
  user?: OncallUser;
  start_time?: string;
  end_time?: string;
}

const severityColors: Record<string, { bg: string; text: string }> = {
  low: { bg: 'bg-blue-100', text: 'text-blue-800' },
  medium: { bg: 'bg-yellow-100', text: 'text-yellow-800' },
  high: { bg: 'bg-orange-100', text: 'text-orange-800' },
  critical: { bg: 'bg-red-100', text: 'text-red-800' },
};

export default function OnCallPage() {
  const [activeTab, setActiveTab] = useState<'schedules' | 'incidents' | 'shifts'>('schedules');

  const { data: schedulesData, isLoading: schedulesLoading, error: schedulesError } = useOncallSchedules({ is_active: true });
  const { data: whoIsOnCallData, isLoading: whoIsOnCallLoading } = useWhoIsOnCall();
  const { data: issuesData, isLoading: issuesLoading } = useIssues({ status: 'new' });

  const schedules = schedulesData?.data ?? [];
  const whoIsOnCall = whoIsOnCallData?.data ?? [];
  // Filter for high priority open issues as "active incidents"
  const activeIncidents = (issuesData?.data ?? []).filter(
    (issue: Issue) => issue.priority === 'critical' || issue.priority === 'high'
  );

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatTimeRemaining = (dateString?: string) => {
    if (!dateString) return 'No rotation scheduled';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) return `${diffDays}d ${diffHours % 24}h remaining`;
    if (diffHours > 0) return `${diffHours}h remaining`;
    return 'Ending soon';
  };

  if (schedulesError) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
        <Phone className="h-12 w-12 text-red-500 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-red-800 mb-2">Error loading on-call data</h3>
        <p className="text-red-600">Please try refreshing the page</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">On-Call Management</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage on-call schedules and incidents
          </p>
        </div>
        <Link href="/oncall/schedules/new">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            New Schedule
          </Button>
        </Link>
      </div>

      {/* Active Incidents Alert */}
      {!issuesLoading && activeIncidents.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center">
            <AlertTriangle className="h-5 w-5 text-red-500 mr-2" />
            <span className="font-medium text-red-800">
              {activeIncidents.length} Active Incident{activeIncidents.length > 1 ? 's' : ''}
            </span>
          </div>
          <div className="mt-2 space-y-2">
            {activeIncidents.slice(0, 5).map((incident: Issue) => (
              <Link
                key={incident.id}
                href={`/issues/${incident.id}`}
                className="flex items-center justify-between p-2 bg-white rounded-md hover:bg-red-50"
              >
                <div className="flex items-center space-x-3">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                      severityColors[incident.priority]?.bg || 'bg-gray-100'
                    } ${severityColors[incident.priority]?.text || 'text-gray-800'}`}
                  >
                    {incident.priority?.toUpperCase()}
                  </span>
                  <span className="text-sm text-gray-900">{incident.title}</span>
                </div>
                <div className="flex items-center space-x-2">
                  {!incident.acknowledged_at && (
                    <span className="text-xs text-red-600 font-medium">UNACKNOWLEDGED</span>
                  )}
                  <ChevronRight className="h-4 w-4 text-gray-400" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('schedules')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'schedules'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Schedules
          </button>
          <button
            onClick={() => setActiveTab('incidents')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'incidents'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Incidents
            {activeIncidents.length > 0 && (
              <span className="ml-2 bg-red-100 text-red-600 py-0.5 px-2 rounded-full text-xs">
                {activeIncidents.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('shifts')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'shifts'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Who is On-Call
          </button>
        </nav>
      </div>

      {/* Schedules Tab */}
      {activeTab === 'schedules' && (
        schedulesLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
            <span className="ml-2 text-gray-500">Loading schedules...</span>
          </div>
        ) : schedules.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {schedules.map((schedule: OncallSchedule) => (
              <Link
                key={schedule.id}
                href={`/oncall/schedules/${schedule.id}`}
                className="bg-white rounded-lg shadow hover:shadow-md transition-shadow p-6"
              >
                <div className="flex items-start justify-between">
                  <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center">
                    <Phone className="h-5 w-5 text-green-600" />
                  </div>
                  <span className="text-xs text-gray-500">
                    {formatTimeRemaining(schedule.rotation_end)}
                  </span>
                </div>

                <h3 className="mt-4 font-semibold text-gray-900">{schedule.name}</h3>
                <p className="mt-1 text-sm text-gray-500">{schedule.description || 'No description'}</p>

                <div className="mt-4 space-y-3">
                  {schedule.current_on_call ? (
                    <div className="flex items-center">
                      <div className="h-8 w-8 rounded-full bg-green-500 flex items-center justify-center text-white text-sm font-medium">
                        {schedule.current_on_call.name?.charAt(0) || '?'}
                      </div>
                      <div className="ml-3">
                        <p className="text-sm font-medium text-gray-900">
                          {schedule.current_on_call.name}
                        </p>
                        <p className="text-xs text-gray-500">Currently on-call</p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center text-sm text-gray-500">
                      <User className="h-4 w-4 mr-2" />
                      No one currently on-call
                    </div>
                  )}

                  <div className="flex items-center text-sm text-gray-500">
                    <Shield className="h-4 w-4 mr-2" />
                    {schedule.escalation_policy?.name || 'No escalation policy'}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <Phone className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No schedules found</h3>
            <p className="text-gray-500">Create your first on-call schedule</p>
            <Link href="/oncall/schedules/new">
              <Button className="mt-4">
                <Plus className="h-4 w-4 mr-2" />
                New Schedule
              </Button>
            </Link>
          </div>
        )
      )}

      {/* Incidents Tab */}
      {activeTab === 'incidents' && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          {issuesLoading ? (
            <div className="flex items-center justify-center h-48">
              <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
              <span className="ml-2 text-gray-500">Loading incidents...</span>
            </div>
          ) : activeIncidents.length > 0 ? (
            <ul className="divide-y divide-gray-200">
              {activeIncidents.map((incident: Issue) => (
                <li key={incident.id}>
                  <Link
                    href={`/issues/${incident.id}`}
                    className="block hover:bg-gray-50 px-6 py-4"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center space-x-2">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              severityColors[incident.priority]?.bg || 'bg-gray-100'
                            } ${severityColors[incident.priority]?.text || 'text-gray-800'}`}
                          >
                            {incident.priority?.toUpperCase()}
                          </span>
                          <span className="text-sm font-medium text-blue-600">
                            {incident.number}
                          </span>
                          <span className="text-sm font-medium text-gray-900">
                            {incident.title}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center space-x-4 text-sm text-gray-500">
                          <span className="flex items-center">
                            <User className="h-4 w-4 mr-1" />
                            {incident.assigned_to?.name || 'Unassigned'}
                          </span>
                          <span className="flex items-center">
                            <Clock className="h-4 w-4 mr-1" />
                            Opened {formatDate(incident.created_at)}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        {incident.acknowledged_at ? (
                          <span className="text-xs text-green-600 font-medium">ACKNOWLEDGED</span>
                        ) : (
                          <span className="text-xs text-red-600 font-medium">UNACKNOWLEDGED</span>
                        )}
                        <ChevronRight className="h-4 w-4 text-gray-400" />
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-center py-12">
              <Phone className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No active incidents</h3>
              <p className="text-gray-500">All systems operational</p>
            </div>
          )}
        </div>
      )}

      {/* Who is On-Call Tab */}
      {activeTab === 'shifts' && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Currently On-Call</h2>
          </div>
          {whoIsOnCallLoading ? (
            <div className="flex items-center justify-center h-48">
              <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
              <span className="ml-2 text-gray-500">Loading on-call information...</span>
            </div>
          ) : whoIsOnCall.length > 0 ? (
            <ul className="divide-y divide-gray-200">
              {whoIsOnCall.map((entry: OncallEntry) => (
                <li key={entry.schedule_id} className="px-6 py-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900">{entry.schedule_name}</p>
                      {entry.user ? (
                        <div className="mt-1 flex items-center text-sm text-gray-500">
                          <User className="h-4 w-4 mr-1" />
                          {entry.user.name}
                          {entry.user.phone && (
                            <span className="ml-2">({entry.user.phone})</span>
                          )}
                        </div>
                      ) : (
                        <p className="mt-1 text-sm text-gray-500 italic">No one currently on-call</p>
                      )}
                      {entry.end_time && (
                        <div className="mt-1 flex items-center text-sm text-gray-500">
                          <Calendar className="h-4 w-4 mr-1" />
                          Until {formatDate(entry.end_time)}
                        </div>
                      )}
                    </div>
                    <Link href={`/oncall/schedules/${entry.schedule_id}`}>
                      <Button variant="outline" size="sm">
                        View Schedule
                      </Button>
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-center py-12">
              <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No on-call entries</h3>
              <p className="text-gray-500">Set up schedules to see who is on-call</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
