'use client';

import { useT } from '@/i18n/useT';
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
  issue: 'eIssue',
  problem: 'eProblem',
  change: 'eChange',
};

const metricTypeLabels: Record<SlaMetricType, string> = {
  response_time: 'mFirstResponse',
  resolution_time: 'mResolution',
};

const priorityLabels: Record<SlaPriority, { label: string; color: string }> = {
  critical: { label: 'priorityCritical', color: 'bg-error-subtle text-error' },
  high: { label: 'priorityHigh', color: 'bg-orange-100 text-orange-800' },
  medium: { label: 'priorityMedium', color: 'bg-warning-subtle text-warning' },
  low: { label: 'priorityLow', color: 'bg-success-subtle text-success' },
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
  const sla = useT('adminSla');
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
    if (!confirm(sla('confirmDeletePolicy'))) return;
    try {
      await deletePolicy.mutateAsync(id);
    } catch (error) {
      alert(error instanceof Error ? error.message : sla('deletePolicyFailed'));
    }
  };

  const handleDeleteTarget = async (id: string) => {
    if (!confirm(sla('confirmDeleteTarget'))) return;
    try {
      await deleteTarget.mutateAsync(id);
    } catch (error) {
      alert(error instanceof Error ? error.message : sla('deleteTargetFailed'));
    }
  };

  const activeCount = policies.filter((p) => p.is_active).length;
  const defaultCount = policies.filter((p) => p.is_default).length;

  if (loadingPolicies && policies.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{sla('title')}</h1>
          <p className="mt-1 text-sm text-muted">
            {sla('subtitle')}
          </p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          <Plus className="h-4 w-4 mr-2" />
          {sla('createPolicy')}
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-surface rounded-lg shadow p-4">
          <div className="flex items-center">
            <div className="h-10 w-10 rounded-lg bg-primary-subtle flex items-center justify-center">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <div className="ml-4">
              <p className="text-sm text-muted">{sla('totalPolicies')}</p>
              <p className="text-2xl font-semibold text-foreground">{policies.length}</p>
            </div>
          </div>
        </div>
        <div className="bg-surface rounded-lg shadow p-4">
          <div className="flex items-center">
            <div className="h-10 w-10 rounded-lg bg-success-subtle flex items-center justify-center">
              <CheckCircle className="h-5 w-5 text-success" />
            </div>
            <div className="ml-4">
              <p className="text-sm text-muted">{sla('activePolicies')}</p>
              <p className="text-2xl font-semibold text-foreground">{activeCount}</p>
            </div>
          </div>
        </div>
        <div className="bg-surface rounded-lg shadow p-4">
          <div className="flex items-center">
            <div className="h-10 w-10 rounded-lg bg-info-subtle flex items-center justify-center">
              <Target className="h-5 w-5 text-info" />
            </div>
            <div className="ml-4">
              <p className="text-sm text-muted">{sla('defaultPolicies')}</p>
              <p className="text-2xl font-semibold text-foreground">{defaultCount}</p>
            </div>
          </div>
        </div>
        <div className="bg-surface rounded-lg shadow p-4">
          <div className="flex items-center">
            <div className="h-10 w-10 rounded-lg bg-orange-100 flex items-center justify-center">
              <BarChart3 className="h-5 w-5 text-orange-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm text-muted">{sla('metRate')}</p>
              <p className="text-2xl font-semibold text-foreground">
                {stats ? `${stats.met_percentage.toFixed(1)}%` : '-'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-border">
        <nav className="flex space-x-8">
          <button
            onClick={() => setActiveTab('policies')}
            className={`py-3 px-1 border-b-2 text-sm font-medium ${
              activeTab === 'policies'
                ? 'border-blue-500 text-primary'
                : 'border-transparent text-muted hover:text-secondary hover:border-border-strong'
            }`}
          >
            {sla('tabPolicies')}
          </button>
          <button
            onClick={() => setActiveTab('stats')}
            className={`py-3 px-1 border-b-2 text-sm font-medium ${
              activeTab === 'stats'
                ? 'border-blue-500 text-primary'
                : 'border-transparent text-muted hover:text-secondary hover:border-border-strong'
            }`}
          >
            {sla('tabStatistics')}
          </button>
        </nav>
      </div>

      {activeTab === 'policies' && (
        <>
          {/* Filters */}
          <div className="bg-surface rounded-lg shadow p-4">
            <div className="flex items-center gap-4">
              <label className="text-sm font-medium text-secondary">{sla('entityType')}</label>
              <select
                value={entityTypeFilter}
                onChange={(e) => setEntityTypeFilter(e.target.value as SlaEntityType | 'all')}
                className="px-3 py-2 border border-border-strong rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="all">{sla('allTypes')}</option>
                <option value="issue">{sla('eIssue')}</option>
                <option value="problem">{sla('eProblem')}</option>
                <option value="change">{sla('eChange')}</option>
              </select>
            </div>
          </div>

          {/* Policies List */}
          <div className="space-y-4">
            {policies.length === 0 ? (
              <div className="bg-surface rounded-lg shadow p-12 text-center">
                <Clock className="h-12 w-12 text-muted mx-auto mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-2">{sla('noPolicies')}</h3>
                <p className="text-muted mb-4">{sla('noPoliciesHint')}</p>
                <Button onClick={() => setShowCreateModal(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  {sla('createPolicy')}
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
  const sla = useT('adminSla');
  return (
    <div className="bg-surface rounded-lg shadow">
      <div
        className="p-4 cursor-pointer hover:bg-surface-hover"
        onClick={onToggleExpand}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${
              policy.is_active ? 'bg-success-subtle' : 'bg-surface-hover'
            }`}>
              <Clock className={`h-5 w-5 ${policy.is_active ? 'text-success' : 'text-muted'}`} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-medium text-foreground">{policy.name}</h3>
                {policy.is_default && (
                  <span className="px-2 py-0.5 text-xs font-medium bg-primary-subtle text-primary rounded">
                    {sla('default')}
                  </span>
                )}
                {!policy.is_active && (
                  <span className="px-2 py-0.5 text-xs font-medium bg-surface-hover text-secondary rounded">
                    {sla('inactive')}
                  </span>
                )}
              </div>
              <p className="text-sm text-muted">
                {sla(entityTypeLabels[policy.entity_type])} - {sla('targetsCount', { count: policy.targets?.length || 0 })}
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
                <XCircle className="h-4 w-4 text-error" />
              ) : (
                <CheckCircle className="h-4 w-4 text-success" />
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
              <Trash2 className="h-4 w-4 text-error" />
            </Button>
            {isExpanded ? (
              <ChevronUp className="h-5 w-5 text-muted" />
            ) : (
              <ChevronDown className="h-5 w-5 text-muted" />
            )}
          </div>
        </div>
      </div>

      {isExpanded && (
        <div className="border-t border-border p-4">
          {policy.description && (
            <p className="text-sm text-secondary mb-4">{policy.description}</p>
          )}

          <div className="flex items-center justify-between mb-4">
            <h4 className="text-sm font-medium text-foreground">{sla('slaTargets')}</h4>
            <Button size="sm" variant="outline" onClick={onAddTarget}>
              <Plus className="h-3 w-3 mr-1" />
              {sla('addTarget')}
            </Button>
          </div>

          {policy.targets && policy.targets.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-border">
                <thead className="bg-surface-hover">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted uppercase">
                      {sla('colPriority')}
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted uppercase">
                      {sla('colMetric')}
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted uppercase">
                      {sla('colTarget')}
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted uppercase">
                      {sla('colWarningAt')}
                    </th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-muted uppercase">
                      {sla('colActions')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {policy.targets.map((target) => (
                    <tr key={target.id}>
                      <td className="px-4 py-2">
                        <span
                          className={`px-2 py-0.5 text-xs font-medium rounded ${
                            priorityLabels[target.priority].color
                          }`}
                        >
                          {sla(priorityLabels[target.priority].label)}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-sm text-foreground">
                        {sla(metricTypeLabels[target.metric_type])}
                      </td>
                      <td className="px-4 py-2 text-sm font-medium text-foreground">
                        {formatMinutes(target.target_minutes)}
                      </td>
                      <td className="px-4 py-2 text-sm text-muted">
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
                          <Trash2 className="h-3 w-3 text-error" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-6 text-muted">
              <Target className="h-8 w-8 mx-auto mb-2 text-muted" />
              <p className="text-sm">{sla('noTargets')}</p>
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
  const sla = useT('adminSla');
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
      <div className="bg-surface rounded-lg shadow-xl max-w-md w-full mx-4">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">
            {policy ? sla('editPolicy') : sla('createPolicyTitle')}
          </h2>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-secondary mb-1">
                {sla('policyName')}
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 border border-border-strong rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder={sla('policyNamePh')}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-secondary mb-1">
                {sla('description')}
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-2 border border-border-strong rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder={sla('descPh')}
                rows={3}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-secondary mb-1">
                {sla('entityTypeStar')}
              </label>
              <select
                value={entityType}
                onChange={(e) => setEntityType(e.target.value as SlaEntityType)}
                className="w-full px-3 py-2 border border-border-strong rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                disabled={!!policy}
              >
                <option value="issue">{sla('eIssue')}</option>
                <option value="problem">{sla('eProblem')}</option>
                <option value="change">{sla('eChange')}</option>
              </select>
            </div>

            <div className="flex items-center">
              <input
                type="checkbox"
                id="isDefault"
                checked={isDefault}
                onChange={(e) => setIsDefault(e.target.checked)}
                className="h-4 w-4 text-primary border-border-strong rounded focus:ring-primary"
              />
              <label htmlFor="isDefault" className="ml-2 text-sm text-secondary">
                {sla('setDefault')}
              </label>
            </div>
          </div>

          <div className="px-6 py-4 border-t border-border flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={onClose}>
              {sla('cancel')}
            </Button>
            <Button type="submit" disabled={isLoading || !name}>
              {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {policy ? sla('updatePolicy') : sla('createPolicy')}
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
  const sla = useT('adminSla');
  const [metricType, setMetricType] = useState<SlaMetricType>('response_time');
  const [priority, setPriority] = useState<SlaPriority>('medium');
  const [targetHours, setTargetHours] = useState(1);
  const [targetMinutes, setTargetMinutes] = useState(0);
  const [warningPercent, setWarningPercent] = useState<number | ''>('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const totalMinutes = targetHours * 60 + targetMinutes;
    if (totalMinutes <= 0) {
      alert(sla('targetPositive'));
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
      <div className="bg-surface rounded-lg shadow-xl max-w-md w-full mx-4">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">{sla('addTargetTitle')}</h2>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-secondary mb-1">
                {sla('metricStar')}
              </label>
              <select
                value={metricType}
                onChange={(e) => setMetricType(e.target.value as SlaMetricType)}
                className="w-full px-3 py-2 border border-border-strong rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="response_time">{sla('mFirstResponse')}</option>
                <option value="resolution_time">{sla('mResolution')}</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-secondary mb-1">
                {sla('priorityStar')}
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as SlaPriority)}
                className="w-full px-3 py-2 border border-border-strong rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="critical">{sla('priorityCritical')}</option>
                <option value="high">{sla('priorityHigh')}</option>
                <option value="medium">{sla('priorityMedium')}</option>
                <option value="low">{sla('priorityLow')}</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-secondary mb-1">
                {sla('targetTimeStar')}
              </label>
              <div className="flex gap-2">
                <div className="flex-1">
                  <div className="flex items-center">
                    <input
                      type="number"
                      value={targetHours}
                      onChange={(e) => setTargetHours(parseInt(e.target.value) || 0)}
                      className="w-full px-3 py-2 border border-border-strong rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      min={0}
                    />
                    <span className="ml-2 text-sm text-muted">{sla('hours')}</span>
                  </div>
                </div>
                <div className="flex-1">
                  <div className="flex items-center">
                    <input
                      type="number"
                      value={targetMinutes}
                      onChange={(e) => setTargetMinutes(parseInt(e.target.value) || 0)}
                      className="w-full px-3 py-2 border border-border-strong rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      min={0}
                      max={59}
                    />
                    <span className="ml-2 text-sm text-muted">{sla('minutes')}</span>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-secondary mb-1">
                Warning Threshold (%)
              </label>
              <input
                type="number"
                value={warningPercent}
                onChange={(e) =>
                  setWarningPercent(e.target.value ? parseInt(e.target.value) : '')
                }
                className="w-full px-3 py-2 border border-border-strong rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder={sla('warningPh')}
                min={1}
                max={100}
              />
              <p className="mt-1 text-xs text-muted">
                {sla('warningHelp')}
              </p>
            </div>
          </div>

          <div className="px-6 py-4 border-t border-border flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={onClose}>
              {sla('cancel')}
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {sla('addTarget')}
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
  const sla = useT('adminSla');
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="bg-surface rounded-lg shadow p-12 text-center">
        <BarChart3 className="h-12 w-12 text-muted mx-auto mb-4" />
        <h3 className="text-lg font-medium text-foreground mb-2">{sla('noStats')}</h3>
        <p className="text-muted">
          {sla('noStatsHint')}
        </p>
      </div>
    );
  }

  const _breachRate = stats.total > 0 ? ((stats.breached / stats.total) * 100).toFixed(1) : 0;

  return (
    <div className="space-y-6">
      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-surface rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted">{sla('totalEvaluated')}</p>
              <p className="text-3xl font-bold text-foreground">{stats.total}</p>
            </div>
            <div className="h-12 w-12 rounded-full bg-primary-subtle flex items-center justify-center">
              <FileText className="h-6 w-6 text-primary" />
            </div>
          </div>
        </div>

        <div className="bg-surface rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted">{sla('slaMet')}</p>
              <p className="text-3xl font-bold text-success">{stats.met}</p>
            </div>
            <div className="h-12 w-12 rounded-full bg-success-subtle flex items-center justify-center">
              <CheckCircle className="h-6 w-6 text-success" />
            </div>
          </div>
        </div>

        <div className="bg-surface rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted">{sla('slaBreached')}</p>
              <p className="text-3xl font-bold text-error">{stats.breached}</p>
            </div>
            <div className="h-12 w-12 rounded-full bg-error-subtle flex items-center justify-center">
              <AlertTriangle className="h-6 w-6 text-error" />
            </div>
          </div>
        </div>

        <div className="bg-surface rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted">{sla('complianceRate')}</p>
              <p className={`text-3xl font-bold ${
                stats.met_percentage >= 90 ? 'text-success' :
                stats.met_percentage >= 70 ? 'text-warning' : 'text-error'
              }`}>
                {stats.met_percentage.toFixed(1)}%
              </p>
            </div>
            <div className={`h-12 w-12 rounded-full flex items-center justify-center ${
              stats.met_percentage >= 90 ? 'bg-success-subtle' :
              stats.met_percentage >= 70 ? 'bg-warning-subtle' : 'bg-error-subtle'
            }`}>
              <BarChart3 className={`h-6 w-6 ${
                stats.met_percentage >= 90 ? 'text-success' :
                stats.met_percentage >= 70 ? 'text-warning' : 'text-error'
              }`} />
            </div>
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="bg-surface rounded-lg shadow p-6">
        <h3 className="text-lg font-medium text-foreground mb-4">{sla('overview')}</h3>
        <div className="space-y-4">
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-secondary">Met ({stats.met})</span>
              <span className="text-secondary">Breached ({stats.breached})</span>
            </div>
            <div className="h-4 bg-surface-hover rounded-full overflow-hidden">
              <div
                className="h-full bg-success rounded-full transition-all"
                style={{ width: `${stats.met_percentage}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Tips */}
      <div className="bg-primary-subtle rounded-lg p-4 flex items-start space-x-3">
        <AlertCircle className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
        <div>
          <h4 className="text-sm font-medium text-primary">{sla('tipTitle')}</h4>
          <p className="text-sm text-primary mt-1">
            {sla('tipBody')}
          </p>
        </div>
      </div>
    </div>
  );
}
