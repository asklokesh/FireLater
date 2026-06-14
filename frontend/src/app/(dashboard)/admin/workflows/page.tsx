'use client';

import { useState } from 'react';
import {
  Plus,
  Workflow as WorkflowIcon,
  Edit2,
  Trash2,
  ChevronDown,
  ChevronUp,
  Loader2,
  Play,
  Pause,
  Zap,
  Filter,
  History,
  CheckCircle,
  XCircle,
  AlertCircle,
  ArrowRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  useWorkflowRules,
  useCreateWorkflowRule,
  useUpdateWorkflowRule,
  useDeleteWorkflowRule,
  useToggleWorkflowRule,
  useWorkflowLogs,
  useWorkflowFields,
  WorkflowRule,
  WorkflowCondition,
  WorkflowAction,
  WorkflowEntityType,
  WorkflowTriggerType,
  WorkflowConditionOperator,
  WorkflowActionType,
} from '@/hooks/useApi';

const entityTypeLabels: Record<WorkflowEntityType, string> = {
  issue: 'Issues',
  problem: 'Problems',
  change: 'Changes',
  request: 'Requests',
};

const triggerTypeLabels: Record<WorkflowTriggerType, { label: string; color: string }> = {
  on_create: { label: 'On Create', color: 'bg-success-subtle text-success' },
  on_update: { label: 'On Update', color: 'bg-primary-subtle text-primary' },
  on_status_change: { label: 'Status Change', color: 'bg-info-subtle text-info' },
  on_assignment: { label: 'On Assignment', color: 'bg-orange-100 text-orange-800' },
  scheduled: { label: 'Scheduled', color: 'bg-surface-hover text-foreground' },
};

const operatorLabels: Record<WorkflowConditionOperator, string> = {
  equals: 'equals',
  not_equals: 'does not equal',
  contains: 'contains',
  not_contains: 'does not contain',
  starts_with: 'starts with',
  ends_with: 'ends with',
  greater_than: 'is greater than',
  less_than: 'is less than',
  is_empty: 'is empty',
  is_not_empty: 'is not empty',
  in_list: 'is in list',
  not_in_list: 'is not in list',
};

const actionTypeLabels: Record<WorkflowActionType, string> = {
  set_field: 'Set Field',
  assign_to_user: 'Assign to User',
  assign_to_group: 'Assign to Group',
  change_status: 'Change Status',
  change_priority: 'Change Priority',
  add_comment: 'Add Comment',
  send_notification: 'Send Notification',
  send_email: 'Send Email',
  escalate: 'Escalate',
  link_to_problem: 'Link to Problem',
  create_task: 'Create Task',
};

export default function WorkflowManagementPage() {
  const [activeTab, setActiveTab] = useState<'rules' | 'logs'>('rules');
  const [entityTypeFilter, setEntityTypeFilter] = useState<WorkflowEntityType | 'all'>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingRule, setEditingRule] = useState<WorkflowRule | null>(null);
  const [expandedRule, setExpandedRule] = useState<string | null>(null);

  // Queries
  const { data: rulesData, isLoading: loadingRules } = useWorkflowRules(
    entityTypeFilter === 'all' ? undefined : { entityType: entityTypeFilter }
  );
  const { data: logsData, isLoading: loadingLogs } = useWorkflowLogs({ limit: 50 });

  // Mutations
  const createRule = useCreateWorkflowRule();
  const updateRule = useUpdateWorkflowRule();
  const deleteRule = useDeleteWorkflowRule();
  const toggleRule = useToggleWorkflowRule();

  const rules = (rulesData as { data?: WorkflowRule[] })?.data || [];
  const logs = (logsData as { data?: Array<{
    id: string;
    rule_id: string;
    rule_name: string;
    entity_type: WorkflowEntityType;
    entity_id: string;
    conditions_matched: boolean;
    execution_time_ms: number;
    error?: string;
    executed_at: string;
  }> })?.data || [];

  const handleDeleteRule = async (id: string) => {
    if (!confirm('Are you sure you want to delete this workflow rule?')) return;
    try {
      await deleteRule.mutateAsync(id);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to delete rule');
    }
  };

  const handleToggleRule = async (id: string) => {
    try {
      await toggleRule.mutateAsync(id);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to toggle rule');
    }
  };

  const activeCount = rules.filter((r) => r.is_active).length;

  if (loadingRules && rules.length === 0) {
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
          <h1 className="text-2xl font-bold text-foreground">Workflow Automation</h1>
          <p className="mt-1 text-sm text-muted">
            Create and manage automation rules for issues, problems, changes, and requests
          </p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create Rule
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-surface rounded-lg shadow p-4">
          <div className="flex items-center">
            <div className="h-10 w-10 rounded-lg bg-primary-subtle flex items-center justify-center">
              <WorkflowIcon className="h-5 w-5 text-primary" />
            </div>
            <div className="ml-4">
              <p className="text-sm text-muted">Total Rules</p>
              <p className="text-2xl font-semibold text-foreground">{rules.length}</p>
            </div>
          </div>
        </div>
        <div className="bg-surface rounded-lg shadow p-4">
          <div className="flex items-center">
            <div className="h-10 w-10 rounded-lg bg-success-subtle flex items-center justify-center">
              <Play className="h-5 w-5 text-success" />
            </div>
            <div className="ml-4">
              <p className="text-sm text-muted">Active Rules</p>
              <p className="text-2xl font-semibold text-foreground">{activeCount}</p>
            </div>
          </div>
        </div>
        <div className="bg-surface rounded-lg shadow p-4">
          <div className="flex items-center">
            <div className="h-10 w-10 rounded-lg bg-info-subtle flex items-center justify-center">
              <Zap className="h-5 w-5 text-info" />
            </div>
            <div className="ml-4">
              <p className="text-sm text-muted">Executions Today</p>
              <p className="text-2xl font-semibold text-foreground">
                {logs.filter((l) => {
                  const today = new Date().toDateString();
                  return new Date(l.executed_at).toDateString() === today;
                }).length}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-surface rounded-lg shadow p-4">
          <div className="flex items-center">
            <div className="h-10 w-10 rounded-lg bg-orange-100 flex items-center justify-center">
              <AlertCircle className="h-5 w-5 text-orange-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm text-muted">Failed Today</p>
              <p className="text-2xl font-semibold text-foreground">
                {logs.filter((l) => {
                  const today = new Date().toDateString();
                  return new Date(l.executed_at).toDateString() === today && l.error;
                }).length}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-border">
        <nav className="flex space-x-8">
          <button
            onClick={() => setActiveTab('rules')}
            className={`py-3 px-1 border-b-2 text-sm font-medium ${
              activeTab === 'rules'
                ? 'border-blue-500 text-primary'
                : 'border-transparent text-muted hover:text-secondary hover:border-border-strong'
            }`}
          >
            Workflow Rules
          </button>
          <button
            onClick={() => setActiveTab('logs')}
            className={`py-3 px-1 border-b-2 text-sm font-medium ${
              activeTab === 'logs'
                ? 'border-blue-500 text-primary'
                : 'border-transparent text-muted hover:text-secondary hover:border-border-strong'
            }`}
          >
            Execution Logs
          </button>
        </nav>
      </div>

      {activeTab === 'rules' && (
        <>
          {/* Filters */}
          <div className="bg-surface rounded-lg shadow p-4">
            <div className="flex items-center gap-4">
              <Filter className="h-4 w-4 text-muted" />
              <label className="text-sm font-medium text-secondary">Entity Type:</label>
              <select
                value={entityTypeFilter}
                onChange={(e) => setEntityTypeFilter(e.target.value as WorkflowEntityType | 'all')}
                className="px-3 py-2 border border-border-strong rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="all">All Types</option>
                <option value="issue">Issues</option>
                <option value="problem">Problems</option>
                <option value="change">Changes</option>
                <option value="request">Requests</option>
              </select>
            </div>
          </div>

          {/* Rules List */}
          <div className="space-y-4">
            {rules.length === 0 ? (
              <div className="bg-surface rounded-lg shadow p-12 text-center">
                <WorkflowIcon className="h-12 w-12 text-muted mx-auto mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-2">No Workflow Rules</h3>
                <p className="text-muted mb-4">
                  Create your first automation rule to streamline your processes
                </p>
                <Button onClick={() => setShowCreateModal(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Rule
                </Button>
              </div>
            ) : (
              rules.map((rule) => (
                <RuleCard
                  key={rule.id}
                  rule={rule}
                  isExpanded={expandedRule === rule.id}
                  onToggleExpand={() => setExpandedRule(expandedRule === rule.id ? null : rule.id)}
                  onEdit={() => setEditingRule(rule)}
                  onDelete={() => handleDeleteRule(rule.id)}
                  onToggleActive={() => handleToggleRule(rule.id)}
                />
              ))
            )}
          </div>
        </>
      )}

      {activeTab === 'logs' && (
        <ExecutionLogsPanel logs={logs} isLoading={loadingLogs} />
      )}

      {/* Create/Edit Rule Modal */}
      {(showCreateModal || editingRule) && (
        <RuleModal
          rule={editingRule}
          onClose={() => {
            setShowCreateModal(false);
            setEditingRule(null);
          }}
          onSave={async (data) => {
            if (editingRule) {
              await updateRule.mutateAsync({ id: editingRule.id, data });
            } else {
              await createRule.mutateAsync(data);
            }
            setShowCreateModal(false);
            setEditingRule(null);
          }}
          isLoading={createRule.isPending || updateRule.isPending}
        />
      )}
    </div>
  );
}

// Rule Card Component
function RuleCard({
  rule,
  isExpanded,
  onToggleExpand,
  onEdit,
  onDelete,
  onToggleActive,
}: {
  rule: WorkflowRule;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onToggleActive: () => void;
}) {
  return (
    <div className="bg-surface rounded-lg shadow">
      <div className="p-4 cursor-pointer hover:bg-surface-hover" onClick={onToggleExpand}>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div
              className={`h-10 w-10 rounded-lg flex items-center justify-center ${
                rule.is_active ? 'bg-success-subtle' : 'bg-surface-hover'
              }`}
            >
              <WorkflowIcon
                className={`h-5 w-5 ${rule.is_active ? 'text-success' : 'text-muted'}`}
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-medium text-foreground">{rule.name}</h3>
                <span
                  className={`px-2 py-0.5 text-xs font-medium rounded ${
                    triggerTypeLabels[rule.trigger_type].color
                  }`}
                >
                  {triggerTypeLabels[rule.trigger_type].label}
                </span>
                {!rule.is_active && (
                  <span className="px-2 py-0.5 text-xs font-medium bg-surface-hover text-secondary rounded">
                    Inactive
                  </span>
                )}
              </div>
              <p className="text-sm text-muted">
                {entityTypeLabels[rule.entity_type]} - {rule.conditions?.length || 0} conditions,{' '}
                {rule.actions?.length || 0} actions
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
              title={rule.is_active ? 'Deactivate' : 'Activate'}
            >
              {rule.is_active ? (
                <Pause className="h-4 w-4 text-orange-500" />
              ) : (
                <Play className="h-4 w-4 text-success" />
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
          {rule.description && <p className="text-sm text-secondary mb-4">{rule.description}</p>}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Conditions */}
            <div>
              <h4 className="text-sm font-medium text-foreground mb-3 flex items-center">
                <Filter className="h-4 w-4 mr-2 text-primary" />
                Conditions (IF)
              </h4>
              {rule.conditions && rule.conditions.length > 0 ? (
                <div className="space-y-2">
                  {rule.conditions.map((condition, idx) => (
                    <div
                      key={idx}
                      className="bg-surface-hover rounded-lg p-3 text-sm flex items-center gap-2"
                    >
                      {idx > 0 && (
                        <span className="text-xs font-medium text-muted">
                          {condition.logical_operator || 'AND'}
                        </span>
                      )}
                      <span className="font-medium text-secondary">{condition.field}</span>
                      <span className="text-muted">{operatorLabels[condition.operator]}</span>
                      <span className="font-medium text-primary">
                        {Array.isArray(condition.value)
                          ? condition.value.join(', ')
                          : String(condition.value)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted">No conditions (always matches)</p>
              )}
            </div>

            {/* Actions */}
            <div>
              <h4 className="text-sm font-medium text-foreground mb-3 flex items-center">
                <Zap className="h-4 w-4 mr-2 text-purple-500" />
                Actions (THEN)
              </h4>
              {rule.actions && rule.actions.length > 0 ? (
                <div className="space-y-2">
                  {rule.actions
                    .sort((a, b) => a.order - b.order)
                    .map((action, idx) => (
                      <div key={idx} className="bg-info-subtle rounded-lg p-3 text-sm">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-purple-200 text-info text-xs font-medium">
                            {idx + 1}
                          </span>
                          <span className="font-medium text-secondary">
                            {actionTypeLabels[action.action_type as WorkflowActionType]}
                          </span>
                        </div>
                        {Object.keys(action.parameters).length > 0 && (
                          <div className="mt-1 ml-7 text-xs text-muted">
                            {Object.entries(action.parameters).map(([key, value]) => (
                              <span key={key} className="mr-2">
                                {key}: {String(value)}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                </div>
              ) : (
                <p className="text-sm text-muted">No actions configured</p>
              )}
            </div>
          </div>

          {rule.stop_on_match && (
            <div className="mt-4 flex items-center text-sm text-orange-600">
              <AlertCircle className="h-4 w-4 mr-2" />
              Stops processing subsequent rules when this rule matches
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Rule Modal Component
function RuleModal({
  rule,
  onClose,
  onSave,
  isLoading,
}: {
  rule: WorkflowRule | null;
  onClose: () => void;
  onSave: (data: {
    name: string;
    description?: string;
    entityType: WorkflowEntityType;
    triggerType: WorkflowTriggerType;
    isActive?: boolean;
    conditions: Omit<WorkflowCondition, 'id'>[];
    actions: Omit<WorkflowAction, 'id'>[];
    executionOrder?: number;
    stopOnMatch?: boolean;
  }) => Promise<void>;
  isLoading: boolean;
}) {
  const [name, setName] = useState(rule?.name || '');
  const [description, setDescription] = useState(rule?.description || '');
  const [entityType, setEntityType] = useState<WorkflowEntityType>(rule?.entity_type || 'issue');
  const [triggerType, setTriggerType] = useState<WorkflowTriggerType>(
    rule?.trigger_type || 'on_create'
  );
  const [conditions, setConditions] = useState<Omit<WorkflowCondition, 'id'>[]>(
    rule?.conditions || []
  );
  const [actions, setActions] = useState<Omit<WorkflowAction, 'id'>[]>(rule?.actions || []);
  const [stopOnMatch, setStopOnMatch] = useState(rule?.stop_on_match || false);

  // Fetch fields for the selected entity type
  const { data: fieldsData } = useWorkflowFields(entityType);
  const fields = (fieldsData as { data?: { field: string; label: string }[] })?.data || [];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (actions.length === 0) {
      alert('Please add at least one action');
      return;
    }
    await onSave({
      name,
      description: description || undefined,
      entityType,
      triggerType,
      conditions,
      actions,
      stopOnMatch,
    });
  };

  const addCondition = () => {
    setConditions([
      ...conditions,
      { field: 'status', operator: 'equals', value: '', logical_operator: 'AND' },
    ]);
  };

  const removeCondition = (index: number) => {
    setConditions(conditions.filter((_, i) => i !== index));
  };

  const updateCondition = (index: number, updates: Partial<WorkflowCondition>) => {
    setConditions(conditions.map((c, i) => (i === index ? { ...c, ...updates } : c)));
  };

  const addAction = () => {
    setActions([...actions, { action_type: 'change_status', parameters: {}, order: actions.length }]);
  };

  const removeAction = (index: number) => {
    setActions(
      actions
        .filter((_, i) => i !== index)
        .map((a, i) => ({ ...a, order: i }))
    );
  };

  const updateAction = (index: number, updates: Partial<WorkflowAction>) => {
    setActions(actions.map((a, i) => (i === index ? { ...a, ...updates } : a)));
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto">
      <div className="bg-surface rounded-lg shadow-xl max-w-3xl w-full mx-4 my-8">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">
            {rule ? 'Edit Workflow Rule' : 'Create Workflow Rule'}
          </h2>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
            {/* Basic Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-secondary mb-1">Rule Name *</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 border border-border-strong rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="e.g., Auto-assign critical issues"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-secondary mb-1">Description</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-2 border border-border-strong rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Brief description..."
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-secondary mb-1">Entity Type *</label>
                <select
                  value={entityType}
                  onChange={(e) => setEntityType(e.target.value as WorkflowEntityType)}
                  className="w-full px-3 py-2 border border-border-strong rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  disabled={!!rule}
                >
                  <option value="issue">Issues</option>
                  <option value="problem">Problems</option>
                  <option value="change">Changes</option>
                  <option value="request">Requests</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-secondary mb-1">Trigger *</label>
                <select
                  value={triggerType}
                  onChange={(e) => setTriggerType(e.target.value as WorkflowTriggerType)}
                  className="w-full px-3 py-2 border border-border-strong rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  disabled={!!rule}
                >
                  <option value="on_create">On Create</option>
                  <option value="on_update">On Update</option>
                  <option value="on_status_change">On Status Change</option>
                  <option value="on_assignment">On Assignment</option>
                </select>
              </div>
            </div>

            {/* Conditions */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-secondary">
                  Conditions (IF)
                </label>
                <Button type="button" size="sm" variant="outline" onClick={addCondition}>
                  <Plus className="h-3 w-3 mr-1" />
                  Add Condition
                </Button>
              </div>
              {conditions.length === 0 ? (
                <p className="text-sm text-muted bg-surface-hover p-3 rounded-lg">
                  No conditions - rule will match all {entityTypeLabels[entityType].toLowerCase()}
                </p>
              ) : (
                <div className="space-y-2">
                  {conditions.map((condition, idx) => (
                    <div key={idx} className="flex items-center gap-2 bg-surface-hover p-3 rounded-lg">
                      {idx > 0 && (
                        <select
                          value={condition.logical_operator || 'AND'}
                          onChange={(e) =>
                            updateCondition(idx, {
                              logical_operator: e.target.value as 'AND' | 'OR',
                            })
                          }
                          className="px-2 py-1 border border-border-strong rounded text-xs"
                        >
                          <option value="AND">AND</option>
                          <option value="OR">OR</option>
                        </select>
                      )}
                      <select
                        value={condition.field}
                        onChange={(e) => updateCondition(idx, { field: e.target.value })}
                        className="px-2 py-1 border border-border-strong rounded text-sm flex-1"
                      >
                        {fields.map((f) => (
                          <option key={f.field} value={f.field}>
                            {f.label}
                          </option>
                        ))}
                      </select>
                      <select
                        value={condition.operator}
                        onChange={(e) =>
                          updateCondition(idx, {
                            operator: e.target.value as WorkflowConditionOperator,
                          })
                        }
                        className="px-2 py-1 border border-border-strong rounded text-sm"
                      >
                        <option value="equals">equals</option>
                        <option value="not_equals">not equals</option>
                        <option value="contains">contains</option>
                        <option value="is_empty">is empty</option>
                        <option value="is_not_empty">is not empty</option>
                      </select>
                      {!['is_empty', 'is_not_empty'].includes(condition.operator) && (
                        <input
                          type="text"
                          value={String(condition.value || '')}
                          onChange={(e) => updateCondition(idx, { value: e.target.value })}
                          className="px-2 py-1 border border-border-strong rounded text-sm flex-1"
                          placeholder="Value"
                        />
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeCondition(idx)}
                      >
                        <Trash2 className="h-4 w-4 text-error" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Actions */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-secondary">Actions (THEN) *</label>
                <Button type="button" size="sm" variant="outline" onClick={addAction}>
                  <Plus className="h-3 w-3 mr-1" />
                  Add Action
                </Button>
              </div>
              {actions.length === 0 ? (
                <p className="text-sm text-muted bg-surface-hover p-3 rounded-lg">
                  No actions configured. Add at least one action.
                </p>
              ) : (
                <div className="space-y-2">
                  {actions.map((action, idx) => (
                    <div key={idx} className="flex items-center gap-2 bg-info-subtle p-3 rounded-lg">
                      <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-purple-200 text-info text-xs font-medium">
                        {idx + 1}
                      </span>
                      <select
                        value={action.action_type}
                        onChange={(e) =>
                          updateAction(idx, {
                            action_type: e.target.value as WorkflowActionType,
                            parameters: {},
                          })
                        }
                        className="px-2 py-1 border border-border-strong rounded text-sm"
                      >
                        <option value="change_status">Change Status</option>
                        <option value="change_priority">Change Priority</option>
                        <option value="assign_to_user">Assign to User</option>
                        <option value="assign_to_group">Assign to Group</option>
                        <option value="add_comment">Add Comment</option>
                        <option value="send_notification">Send Notification</option>
                        <option value="set_field">Set Field</option>
                      </select>
                      <ArrowRight className="h-4 w-4 text-muted" />
                      <input
                        type="text"
                        value={String(action.parameters?.value || action.parameters?.status || '')}
                        onChange={(e) =>
                          updateAction(idx, {
                            parameters: {
                              ...action.parameters,
                              [action.action_type === 'change_status'
                                ? 'status'
                                : action.action_type === 'change_priority'
                                ? 'priority'
                                : action.action_type === 'add_comment'
                                ? 'content'
                                : 'value']: e.target.value,
                            },
                          })
                        }
                        className="px-2 py-1 border border-border-strong rounded text-sm flex-1"
                        placeholder={
                          action.action_type === 'change_status'
                            ? 'Status value'
                            : action.action_type === 'change_priority'
                            ? 'Priority value'
                            : action.action_type === 'add_comment'
                            ? 'Comment text'
                            : 'Value'
                        }
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeAction(idx)}
                      >
                        <Trash2 className="h-4 w-4 text-error" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Options */}
            <div className="flex items-center">
              <input
                type="checkbox"
                id="stopOnMatch"
                checked={stopOnMatch}
                onChange={(e) => setStopOnMatch(e.target.checked)}
                className="h-4 w-4 text-primary border-border-strong rounded focus:ring-primary"
              />
              <label htmlFor="stopOnMatch" className="ml-2 text-sm text-secondary">
                Stop processing subsequent rules when this rule matches
              </label>
            </div>
          </div>

          <div className="px-6 py-4 border-t border-border flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading || !name || actions.length === 0}>
              {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {rule ? 'Update Rule' : 'Create Rule'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Execution Logs Panel
function ExecutionLogsPanel({
  logs,
  isLoading,
}: {
  logs: Array<{
    id: string;
    rule_id: string;
    rule_name: string;
    entity_type: WorkflowEntityType;
    entity_id: string;
    conditions_matched: boolean;
    execution_time_ms: number;
    error?: string;
    executed_at: string;
  }>;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="bg-surface rounded-lg shadow p-12 text-center">
        <History className="h-12 w-12 text-muted mx-auto mb-4" />
        <h3 className="text-lg font-medium text-foreground mb-2">No Execution Logs</h3>
        <p className="text-muted">
          Workflow execution logs will appear here once rules start running
        </p>
      </div>
    );
  }

  return (
    <div className="bg-surface rounded-lg shadow overflow-hidden">
      <table className="min-w-full divide-y divide-border">
        <thead className="bg-surface-hover">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase">
              Executed At
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase">
              Rule
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase">
              Entity
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase">
              Status
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase">
              Duration
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {logs.map((log) => (
            <tr key={log.id} className="hover:bg-surface-hover">
              <td className="px-6 py-4 whitespace-nowrap text-sm text-muted">
                {new Date(log.executed_at).toLocaleString()}
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <span className="text-sm font-medium text-foreground">{log.rule_name}</span>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-muted">
                {entityTypeLabels[log.entity_type]} #{log.entity_id.slice(0, 8)}
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                {log.error ? (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-error-subtle text-error">
                    <XCircle className="h-3 w-3 mr-1" />
                    Failed
                  </span>
                ) : log.conditions_matched ? (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-success-subtle text-success">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Executed
                  </span>
                ) : (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-surface-hover text-foreground">
                    Skipped
                  </span>
                )}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-muted">
                {log.execution_time_ms}ms
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
