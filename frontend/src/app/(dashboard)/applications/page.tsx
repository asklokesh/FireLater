'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Plus,
  Search,
  Filter,
  ChevronDown,
  Server,
  Activity,
  AlertTriangle,
  CheckCircle,
  MoreHorizontal,
  Loader2,
  Building2,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useApplications, Application } from '@/hooks/useApi';

const statusColors: Record<string, { bg: string; text: string; label: string }> = {
  active: { bg: 'bg-green-100', text: 'text-green-800', label: 'Active' },
  inactive: { bg: 'bg-gray-100', text: 'text-gray-800', label: 'Inactive' },
  deprecated: { bg: 'bg-red-100', text: 'text-red-800', label: 'Deprecated' },
};

const tierColors: Record<string, { bg: string; text: string; label: string }> = {
  P1: { bg: 'bg-red-100', text: 'text-red-800', label: 'P1 - Critical' },
  P2: { bg: 'bg-orange-100', text: 'text-orange-800', label: 'P2 - High' },
  P3: { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'P3 - Medium' },
  P4: { bg: 'bg-blue-100', text: 'text-blue-800', label: 'P4 - Low' },
};

const criticalityLabels: Record<string, string> = {
  mission_critical: 'Mission Critical',
  business_critical: 'Business Critical',
  business_operational: 'Business Operational',
  administrative: 'Administrative',
};

const lifecycleLabels: Record<string, string> = {
  development: 'Development',
  staging: 'Staging',
  production: 'Production',
  sunset: 'Sunset',
};

const getHealthScoreColor = (score: number | undefined) => {
  if (!score) return 'text-gray-400';
  if (score >= 90) return 'text-green-600';
  if (score >= 70) return 'text-yellow-600';
  if (score >= 50) return 'text-orange-600';
  return 'text-red-600';
};

const getHealthScoreIcon = (score: number | undefined) => {
  if (!score) return <Activity className="h-5 w-5 text-gray-400" />;
  if (score >= 90) return <CheckCircle className="h-5 w-5 text-green-500" />;
  if (score >= 70) return <Activity className="h-5 w-5 text-yellow-500" />;
  return <AlertTriangle className="h-5 w-5 text-red-500" />;
};

export default function ApplicationsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [tierFilter, setTierFilter] = useState<string>('all');
  const [lifecycleFilter, setLifecycleFilter] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(1);

  const { data, isLoading, error } = useApplications({ page, limit: 20 });

  const applications = data?.data ?? [];
  const pagination = data?.pagination ?? { page: 1, limit: 20, total: 0, totalPages: 1 };

  // Client-side filtering for search only (status/tier should use API params in production)
  const filteredApplications = applications.filter((app: Application) => {
    const matchesSearch = searchQuery === '' ||
      app.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      app.app_id?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      app.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || app.status === statusFilter;
    const matchesTier = tierFilter === 'all' || app.tier === tierFilter;
    const matchesLifecycle = lifecycleFilter === 'all' || app.lifecycle_stage === lifecycleFilter;
    return matchesSearch && matchesStatus && matchesTier && matchesLifecycle;
  });

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
        <Server className="h-12 w-12 text-red-500 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-red-800 mb-2">Error loading applications</h3>
        <p className="text-red-600">Please try refreshing the page</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Applications</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage and monitor your IT applications
          </p>
        </div>
        <Link href="/applications/new">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            New Application
          </Button>
        </Link>
      </div>

      {/* Search and Filters */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name, ID or description..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
          <div className="mt-4 pt-4 border-t border-gray-200 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Statuses</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="deprecated">Deprecated</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tier</label>
              <select
                value={tierFilter}
                onChange={(e) => setTierFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Tiers</option>
                <option value="P1">P1 - Critical</option>
                <option value="P2">P2 - High</option>
                <option value="P3">P3 - Medium</option>
                <option value="P4">P4 - Low</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Lifecycle Stage</label>
              <select
                value={lifecycleFilter}
                onChange={(e) => setLifecycleFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Stages</option>
                <option value="development">Development</option>
                <option value="staging">Staging</option>
                <option value="production">Production</option>
                <option value="sunset">Sunset</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Applications Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          <span className="ml-2 text-gray-500">Loading applications...</span>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredApplications.map((app: Application) => {
              const tierStyle = tierColors[app.tier] || tierColors.P3;
              const statusStyle = statusColors[app.status] || statusColors.active;

              return (
                <Link
                  key={app.id}
                  href={`/applications/${app.id}`}
                  className="bg-white rounded-lg shadow hover:shadow-md transition-shadow"
                >
                  <div className="p-6">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
                          <Server className="h-5 w-5 text-blue-600" />
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-gray-900">{app.name}</h3>
                          <p className="text-sm text-gray-500">{app.app_id}</p>
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                        }}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        <MoreHorizontal className="h-5 w-5" />
                      </button>
                    </div>

                    <p className="mt-3 text-sm text-gray-600 line-clamp-2">{app.description || 'No description'}</p>

                    <div className="mt-4 flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        {getHealthScoreIcon(app.health_score)}
                        <span className={`text-lg font-semibold ${getHealthScoreColor(app.health_score)}`}>
                          {app.health_score != null ? `${app.health_score}%` : 'N/A'}
                        </span>
                      </div>
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusStyle.bg} ${statusStyle.text}`}
                      >
                        {statusStyle.label}
                      </span>
                    </div>

                    <div className="mt-4 flex items-center space-x-2">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${tierStyle.bg} ${tierStyle.text}`}>
                        {tierStyle.label}
                      </span>
                      {app.lifecycle_stage && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                          {lifecycleLabels[app.lifecycle_stage] || app.lifecycle_stage}
                        </span>
                      )}
                      {app.criticality && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800">
                          {criticalityLabels[app.criticality] || app.criticality}
                        </span>
                      )}
                    </div>

                    <div className="mt-4 pt-4 border-t border-gray-100 space-y-2 text-sm">
                      {app.owner_user_name && (
                        <div className="flex items-center text-gray-600">
                          <Users className="h-4 w-4 mr-2 text-gray-400" />
                          Owner: {app.owner_user_name}
                        </div>
                      )}
                      {app.owner_group_name && (
                        <div className="flex items-center text-gray-600">
                          <Building2 className="h-4 w-4 mr-2 text-gray-400" />
                          Team: {app.owner_group_name}
                        </div>
                      )}
                      {app.support_group_name && (
                        <div className="flex items-center text-gray-600">
                          <Users className="h-4 w-4 mr-2 text-gray-400" />
                          Support: {app.support_group_name}
                        </div>
                      )}
                      {app.environment_count != null && app.environment_count > 0 && (
                        <div className="flex items-center text-gray-600">
                          <Server className="h-4 w-4 mr-2 text-gray-400" />
                          {app.environment_count} environment{app.environment_count !== 1 ? 's' : ''}
                        </div>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>

          {filteredApplications.length === 0 && (
            <div className="bg-white rounded-lg shadow p-12 text-center">
              <Server className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No applications found</h3>
              <p className="text-gray-500">Try adjusting your search or filters</p>
            </div>
          )}

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-500">
                Showing {filteredApplications.length} of {pagination.total} applications
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
          )}
        </>
      )}
    </div>
  );
}
