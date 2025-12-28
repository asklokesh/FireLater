'use client';

import { useState } from 'react';
import {
  Plus,
  Clock,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Edit2,
  Trash2,
  ChevronDown,
  ChevronUp,
  Loader2,
  BarChart3,
  Target,
  AlertCircle,
  FileText,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  useSlaPolicies,
  useCreateSlaPolicy,
  useUpdateSlaPolicy,
  useDeleteSlaPolicy,
  useCreateSlaTarget,
  useUpdateSlaTarget,
  useDeleteSlaTarget,
  useSlaStats,
  SlaPolicyWithTargets,
  SlaEntityType,
  SlaMetricType,
  SlaPriority,
} from '@/hooks/useApi';

const entityTypeLabels: Record<SlaEntityType, string> = {
  issue: 'Issues',
  problem: 'Problems',
  change: 'Changes',
};

const metricTypeLabels: Record<SlaMetricType, string> = {
  response_time: 'First Response Time',
  resolution_time: 'Resolution Time',
};

const priorityLabels: Record<SlaPriority, { label: string; color: string }> = {
  critical: { label: 'Critical', color: 'bg-red-100 text-red-800' },
  high: { label: 'High', color: 'bg-orange-100 text-orange-800' },
  medium: { label: 'Medium', color: 'bg-yellow-100 text-yellow-800' },
  low: { label: 'Low', color: 'bg-green-100 text-green-800' },
};

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours < 24) return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  if (remainingHours > 0) return `${days}d ${remainingHours}h`;
  return `${days}d`;
}

export default function SLAManagementPage() {
  const [activeTab, setActiveTab] = useState<'policies' | 'stats'>('policies');
  const [entityTypeFilter, setEntityTypeFilter] = useState<SlaEntityType | 'all'>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<SlaPolicyWithTargets | null>(null);
  const [expandedPolicy, setExpandedPolicy] = useState<string | null>(null);
  const [addingTargetToPolicyId, setAddingTargetToPolicyId] = useState<string | null>(null);

  // Queries
  const { data: policiesData, isLoading: loadingPolicies } = useSlaPolicies(
    entityTypeFilter === 'all' ? undefined : { entityType: entityTypeFilter }
  );
  const { data: statsData, isLoading: loadingStats } = useSlaStats({ entityType: 'issue' });

  // Mutations
  const createPolicy = useCreateSlaPolicy();
  const updatePolicy = useUpdateSlaPolicy();
  const deletePolicy = useDeleteSlaPolicy();
  const createTarget = useCreateSlaTarget();
  const _updateTarget = useUpdateSlaTarget();
  const deleteTarget = useDeleteSlaTarget();

  const policies = (policiesData as { data?: SlaPolicyWithTargets[] })?.data || [];
  const stats = (statsData as { data?: { total: number; met: number; breached: number; met_percentage: number } })?.data;

  const handleDeletePolicy = async (id: string) => {
    if (!confirm('Are you sure you want to delete this SLA policy?')) return;
    try {
      await deletePolicy.mutateAsync(id);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to delete policy');
    }
  };

  const handleDeleteTarget = async (id: string) => {
    if (!confirm('Are you sure you want to delete this SLA target?')) return;
    try {
      await deleteTarget.mutateAsync(id);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to delete target');
    }
  };

  const activeCount = policies.filter((p) => p.is_active).length;
  const defaultCount = policies.filter((p) => p.is_default).length;

  if (loadingPolicies && policies.length === 0) {
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
          <h1 className="text-2xl font-bold text-gray-900">SLA Management</h1>
          <p className="mt-1 text-sm text-gray-500">
            Configure Service Level Agreement policies and targets
          </p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create Policy
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center">
            <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <FileText className="h-5 w-5 text-blue-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm text-gray-500">Total Policies</p>
              <p className="text-2xl font-semibold text-gray-900">{policies.length}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center">
            <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center">
              <CheckCircle className="h-5 w-5 text-green-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm text-gray-500">Active Policies</p>
              <p className="text-2xl font-semibold text-gray-900">{activeCount}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center">
            <div className="h-10 w-10 rounded-lg bg-purple-100 flex items-center justify-center">
              <Target className="h-5 w-5 text-purple-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm text-gray-500">Default Policies</p>
              <p className="text-2xl font-semibold text-gray-900">{defaultCount}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center">
            <div className="h-10 w-10 rounded-lg bg-orange-100 flex items-center justify-center">
              <BarChart3 className="h-5 w-5 text-orange-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm text-gray-500">SLA Met Rate</p>
              <p className="text-2xl font-semibold text-gray-900">
                {stats ? `${stats.met_percentage.toFixed(1)}%` : '-'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex space-x-8">
          <button
            onClick={() => setActiveTab('policies')}
            className={`py-3 px-1 border-b-2 text-sm font-medium ${
              activeTab === 'policies'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Policies
          </button>
          <button
            onClick={() => setActiveTab('stats')}
            className={`py-3 px-1 border-b-2 text-sm font-medium ${
              activeTab === 'stats'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Statistics
          </button>
        </nav>
      </div>

      {activeTab === 'policies' && (
        <>
          {/* Filters */}
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center gap-4">
              <label className="text-sm font-medium text-gray-700">Entity Type:</label>
              <select
                value={entityTypeFilter}
                onChange={(e) => setEntityTypeFilter(e.target.value as SlaEntityType | 'all')}
                className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Types</option>
                <option value="issue">Issues</option>
                <option value="problem">Problems</option>
                <option value="change">Changes</option>
              </select>
            </div>
          </div>

          {/* Policies List */}
          <div className="space-y-4">
            {policies.length === 0 ? (
              <div className="bg-white rounded-lg shadow p-12 text-center">
                <Clock className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No SLA Policies</h3>
                <p className="text-gray-500 mb-4">Create your first SLA policy to get started</p>
                <Button onClick={() => setShowCreateModal(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Policy
                </Button>
              </div>
            ) : (
              policies.map((policy) => (
                <PolicyCard
                  key={policy.id}
                  policy={policy}
                  isExpanded={expandedPolicy === policy.id}
                  onToggleExpand={() =>
                    setExpandedPolicy(expandedPolicy === policy.id ? null : policy.id)
                  }
                  onEdit={() => setEditingPolicy(policy)}
                  onDelete={() => handleDeletePolicy(policy.id)}
                  onAddTarget={() => setAddingTargetToPolicyId(policy.id)}
                  onDeleteTarget={handleDeleteTarget}
                  onToggleActive={async () => {
                    await updatePolicy.mutateAsync({
                      id: policy.id,
                      data: { isActive: !policy.is_active },
                    });
                  }}
                />
              ))
            )}
          </div>
        </>
      )}

      {activeTab === 'stats' && (
        <SLAStatisticsPanel stats={stats} isLoading={loadingStats} />
      )}

      {/* Create/Edit Policy Modal */}
      {(showCreateModal || editingPolicy) && (
        <PolicyModal
          policy={editingPolicy}
          onClose={() => {
            setShowCreateModal(false);
            setEditingPolicy(null);
          }}
          onSave={async (data) => {
            if (editingPolicy) {
              await updatePolicy.mutateAsync({ id: editingPolicy.id, data });
            } else {
              await createPolicy.mutateAsync(data);
            }
            setShowCreateModal(false);
            setEditingPolicy(null);
          }}
          isLoading={createPolicy.isPending || updatePolicy.isPending}
        />
      )}

      {/* Add Target Modal */}
      {addingTargetToPolicyId && (
        <TargetModal
          policyId={addingTargetToPolicyId}
          onClose={() => setAddingTargetToPolicyId(null)}
          onSave={async (data) => {
            await createTarget.mutateAsync({
              policyId: addingTargetToPolicyId,
              data,
            });
            setAddingTargetToPolicyId(null);
          }}
          isLoading={createTarget.isPending}
        />
      )}
    </div>
  );
}

// Policy Card Component
function PolicyCard({
  policy,
  isExpanded,
  onToggleExpand,
  onEdit,
  onDelete,
  onAddTarget,
  onDeleteTarget,
  onToggleActive,
}: {
  policy: SlaPolicyWithTargets;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onAddTarget: () => void;
  onDeleteTarget: (id: string) => void;
  onToggleActive: () => void;
}) {
  return (
    <div className="bg-white rounded-lg shadow">
      <div
        className="p-4 cursor-pointer hover:bg-gray-50"
        onClick={onToggleExpand}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${
              policy.is_active ? 'bg-green-100' : 'bg-gray-100'
            }`}>
              <Clock className={`h-5 w-5 ${policy.is_active ? 'text-green-600' : 'text-gray-400'}`} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-medium text-gray-900">{policy.name}</h3>
                {policy.is_default && (
                  <span className="px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-800 rounded">
                    Default
                  </span>
                )}
                {!policy.is_active && (
                  <span className="px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-600 rounded">
                    Inactive
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-500">
                {entityTypeLabels[policy.entity_type]} - {policy.targets?.length || 0} targets
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onToggleActive();
              }}
            >
              {policy.is_active ? (
                <XCircle className="h-4 w-4 text-red-500" />
              ) : (
                <CheckCircle className="h-4 w-4 text-green-500" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
            >
              <Edit2 className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              disabled={policy.is_default}
            >
              <Trash2 className="h-4 w-4 text-red-500" />
            </Button>
            {isExpanded ? (
              <ChevronUp className="h-5 w-5 text-gray-400" />
            ) : (
              <ChevronDown className="h-5 w-5 text-gray-400" />
            )}
          </div>
        </div>
      </div>

      {isExpanded && (
        <div className="border-t border-gray-200 p-4">
          {policy.description && (
            <p className="text-sm text-gray-600 mb-4">{policy.description}</p>
          )}

          <div className="flex items-center justify-between mb-4">
            <h4 className="text-sm font-medium text-gray-900">SLA Targets</h4>
            <Button size="sm" variant="outline" onClick={onAddTarget}>
              <Plus className="h-3 w-3 mr-1" />
              Add Target
            </Button>
          </div>

          {policy.targets && policy.targets.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      Priority
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      Metric
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      Target
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      Warning At
                    </th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {policy.targets.map((target) => (
                    <tr key={target.id}>
                      <td className="px-4 py-2">
                        <span
                          className={`px-2 py-0.5 text-xs font-medium rounded ${
                            priorityLabels[target.priority].color
                          }`}
                        >
                          {priorityLabels[target.priority].label}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-sm text-gray-900">
                        {metricTypeLabels[target.metric_type]}
                      </td>
                      <td className="px-4 py-2 text-sm font-medium text-gray-900">
                        {formatMinutes(target.target_minutes)}
                      </td>
                      <td className="px-4 py-2 text-sm text-gray-500">
                        {target.warning_threshold_percent
                          ? `${target.warning_threshold_percent}%`
                          : '-'}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onDeleteTarget(target.id)}
                        >
                          <Trash2 className="h-3 w-3 text-red-500" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-6 text-gray-500">
              <Target className="h-8 w-8 mx-auto mb-2 text-gray-400" />
              <p className="text-sm">No targets configured</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Policy Modal Component
function PolicyModal({
  policy,
  onClose,
  onSave,
  isLoading,
}: {
  policy: SlaPolicyWithTargets | null;
  onClose: () => void;
  onSave: (data: {
    name: string;
    description?: string;
    entityType: SlaEntityType;
    isDefault?: boolean;
    isActive?: boolean;
  }) => Promise<void>;
  isLoading: boolean;
}) {
  const [name, setName] = useState(policy?.name || '');
  const [description, setDescription] = useState(policy?.description || '');
  const [entityType, setEntityType] = useState<SlaEntityType>(policy?.entity_type || 'issue');
  const [isDefault, setIsDefault] = useState(policy?.is_default || false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSave({
      name,
      description: description || undefined,
      entityType,
      isDefault,
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            {policy ? 'Edit SLA Policy' : 'Create SLA Policy'}
          </h2>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Policy Name *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., Standard Issue SLA"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Describe this SLA policy..."
                rows={3}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Entity Type *
              </label>
              <select
                value={entityType}
                onChange={(e) => setEntityType(e.target.value as SlaEntityType)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={!!policy}
              >
                <option value="issue">Issues</option>
                <option value="problem">Problems</option>
                <option value="change">Changes</option>
              </select>
            </div>

            <div className="flex items-center">
              <input
                type="checkbox"
                id="isDefault"
                checked={isDefault}
                onChange={(e) => setIsDefault(e.target.checked)}
                className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <label htmlFor="isDefault" className="ml-2 text-sm text-gray-700">
                Set as default policy for this entity type
              </label>
            </div>
          </div>

          <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading || !name}>
              {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {policy ? 'Update Policy' : 'Create Policy'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Target Modal Component
function TargetModal({
  policyId: _policyId,
  onClose,
  onSave,
  isLoading,
}: {
  policyId: string;
  onClose: () => void;
  onSave: (data: {
    metricType: SlaMetricType;
    priority: SlaPriority;
    targetMinutes: number;
    warningThresholdPercent?: number;
  }) => Promise<void>;
  isLoading: boolean;
}) {
  const [metricType, setMetricType] = useState<SlaMetricType>('response_time');
  const [priority, setPriority] = useState<SlaPriority>('medium');
  const [targetHours, setTargetHours] = useState(1);
  const [targetMinutes, setTargetMinutes] = useState(0);
  const [warningPercent, setWarningPercent] = useState<number | ''>('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const totalMinutes = targetHours * 60 + targetMinutes;
    if (totalMinutes <= 0) {
      alert('Target time must be greater than 0');
      return;
    }
    await onSave({
      metricType,
      priority,
      targetMinutes: totalMinutes,
      warningThresholdPercent: warningPercent || undefined,
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Add SLA Target</h2>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Metric Type *
              </label>
              <select
                value={metricType}
                onChange={(e) => setMetricType(e.target.value as SlaMetricType)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="response_time">First Response Time</option>
                <option value="resolution_time">Resolution Time</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Priority *
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as SlaPriority)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Target Time *
              </label>
              <div className="flex gap-2">
                <div className="flex-1">
                  <div className="flex items-center">
                    <input
                      type="number"
                      value={targetHours}
                      onChange={(e) => setTargetHours(parseInt(e.target.value) || 0)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      min={0}
                    />
                    <span className="ml-2 text-sm text-gray-500">hours</span>
                  </div>
                </div>
                <div className="flex-1">
                  <div className="flex items-center">
                    <input
                      type="number"
                      value={targetMinutes}
                      onChange={(e) => setTargetMinutes(parseInt(e.target.value) || 0)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      min={0}
                      max={59}
                    />
                    <span className="ml-2 text-sm text-gray-500">minutes</span>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Warning Threshold (%)
              </label>
              <input
                type="number"
                value={warningPercent}
                onChange={(e) =>
                  setWarningPercent(e.target.value ? parseInt(e.target.value) : '')
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., 80"
                min={1}
                max={100}
              />
              <p className="mt-1 text-xs text-gray-500">
                Alert when this percentage of target time has elapsed
              </p>
            </div>
          </div>

          <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Add Target
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Statistics Panel Component
function SLAStatisticsPanel({
  stats,
  isLoading,
}: {
  stats?: { total: number; met: number; breached: number; met_percentage: number };
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="bg-white rounded-lg shadow p-12 text-center">
        <BarChart3 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">No Statistics Available</h3>
        <p className="text-gray-500">
          SLA statistics will appear once there are resolved issues
        </p>
      </div>
    );
  }

  const _breachRate = stats.total > 0 ? ((stats.breached / stats.total) * 100).toFixed(1) : 0;

  return (
    <div className="space-y-6">
      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Total Evaluated</p>
              <p className="text-3xl font-bold text-gray-900">{stats.total}</p>
            </div>
            <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center">
              <FileText className="h-6 w-6 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">SLA Met</p>
              <p className="text-3xl font-bold text-green-600">{stats.met}</p>
            </div>
            <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle className="h-6 w-6 text-green-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">SLA Breached</p>
              <p className="text-3xl font-bold text-red-600">{stats.breached}</p>
            </div>
            <div className="h-12 w-12 rounded-full bg-red-100 flex items-center justify-center">
              <AlertTriangle className="h-6 w-6 text-red-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Compliance Rate</p>
              <p className={`text-3xl font-bold ${
                stats.met_percentage >= 90 ? 'text-green-600' :
                stats.met_percentage >= 70 ? 'text-yellow-600' : 'text-red-600'
              }`}>
                {stats.met_percentage.toFixed(1)}%
              </p>
            </div>
            <div className={`h-12 w-12 rounded-full flex items-center justify-center ${
              stats.met_percentage >= 90 ? 'bg-green-100' :
              stats.met_percentage >= 70 ? 'bg-yellow-100' : 'bg-red-100'
            }`}>
              <BarChart3 className={`h-6 w-6 ${
                stats.met_percentage >= 90 ? 'text-green-600' :
                stats.met_percentage >= 70 ? 'text-yellow-600' : 'text-red-600'
              }`} />
            </div>
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">SLA Compliance Overview</h3>
        <div className="space-y-4">
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-gray-600">Met ({stats.met})</span>
              <span className="text-gray-600">Breached ({stats.breached})</span>
            </div>
            <div className="h-4 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 rounded-full transition-all"
                style={{ width: `${stats.met_percentage}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Tips */}
      <div className="bg-blue-50 rounded-lg p-4 flex items-start space-x-3">
        <AlertCircle className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
        <div>
          <h4 className="text-sm font-medium text-blue-900">Improve Your SLA Compliance</h4>
          <p className="text-sm text-blue-700 mt-1">
            To improve SLA compliance, consider prioritizing high-priority tickets,
            setting up automated notifications for approaching deadlines, and reviewing
            frequently breached categories for process improvements.
          </p>
        </div>
      </div>
    </div>
  );
}
