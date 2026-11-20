'use client';

import { useT } from '@/i18n/useT';
import { useState, useEffect } from 'react';
import { KeyRound, Plus, Check, X, Clock, AlertCircle, RefreshCw, Edit2, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';

interface PrivilegedGrant {
  id: string;
  requester_id: string;
  requester_email: string | null;
  privilege_type: string;
  reason: string;
  requested_duration_hours: number;
  status: 'pending' | 'active' | 'expired' | 'revoked' | 'rejected';
  granted_at: string | null;
  expires_at: string | null;
  approver_id: string | null;
  approver_email: string | null;
  created_at: string;
  updated_at: string;
}

interface PrivilegeConfig {
  id: string;
  privilege_type: string;
  max_duration_hours: number;
  requires_approver: boolean;
  auto_approve: boolean;
  allowed_roles: string[];
}

interface SummaryStats {
  total: number;
  pending: number;
  active: number;
  revoked: number;
}

type TabType = 'pending' | 'active' | 'all' | 'configs';

export default function PAMPage() {
  const tpm = useT('pam');
  const [activeTab, setActiveTab] = useState<TabType>('pending');
  const [grants, setGrants] = useState<PrivilegedGrant[]>([]);
  const [configs, setConfigs] = useState<PrivilegeConfig[]>([]);
  const [summary, setSummary] = useState<SummaryStats>({ total: 0, pending: 0, active: 0, revoked: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingConfig, setEditingConfig] = useState<PrivilegeConfig | null>(null);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const user = useAuthStore((state) => state.user);

  useEffect(() => {
    loadData();
  }, [activeTab]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      if (activeTab === 'configs') {
        const [configsRes, summaryRes] = await Promise.all([
          api.get('/v1/pam/configs'),
          api.get('/v1/pam/summary'),
        ]);
        setConfigs(configsRes.data.data || configsRes.data);
        setSummary(summaryRes.data);
      } else {
        const [grantsRes, summaryRes] = await Promise.all([
          activeTab === 'all'
            ? api.get('/v1/pam/grants')
            : api.get('/v1/pam/grants', { params: { status: activeTab } }),
          api.get('/v1/pam/summary'),
        ]);
        setGrants(grantsRes.data.data || grantsRes.data);
        setSummary(summaryRes.data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : tpm('loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (grantId: string) => {
    if (!user) return;
    try {
      await api.post(`/v1/pam/grants/${grantId}/approve`, {
        approverId: user.id,
        approverEmail: user.email,
      });
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : tpm('approveFailed'));
    }
  };

  const handleRevoke = async (grantId: string) => {
    const reason = prompt(tpm('revokePrompt'));
    if (!reason) return;
    if (!user) return;

    try {
      await api.post(`/v1/pam/grants/${grantId}/revoke`, {
        revokedBy: user.id,
        reason,
      });
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : tpm('revokeFailed'));
    }
  };

  const handleUpdateConfig = async (config: PrivilegeConfig) => {
    try {
      await api.put(`/v1/pam/configs/${config.privilege_type}`, {
        max_duration_hours: config.max_duration_hours,
        requires_approver: config.requires_approver,
        auto_approve: config.auto_approve,
      });
      setEditingConfig(null);
      setShowConfigModal(false);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : tpm('configFailed'));
    }
  };

  const tabs = [
    { id: 'pending' as TabType, label: tpm('statPending'), count: summary.pending },
    { id: 'active' as TabType, label: tpm('statActive'), count: summary.active },
    { id: 'all' as TabType, label: tpm('tabAll'), count: summary.total },
    { id: 'configs' as TabType, label: tpm('tabConfigs') },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center space-x-3">
            <KeyRound className="h-8 w-8 text-foreground" />
            <div>
              <h1 className="text-2xl font-semibold text-foreground">{tpm('title')}</h1>
              <p className="mt-1 text-sm text-muted">{tpm('subtitle')}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <StatCard label={tpm('statTotal')} value={summary.total} />
        <StatCard label={tpm('statPending')} value={summary.pending} highlight="yellow" />
        <StatCard label={tpm('statActive')} value={summary.active} highlight="green" />
        <StatCard label={tpm('statRevoked')} value={summary.revoked} highlight="red" />
      </div>

      {error && (
        <div className="bg-error-subtle border border-red-200 rounded-xl p-4 flex items-start space-x-3">
          <AlertCircle className="h-5 w-5 text-error mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-error">{error}</p>
            <button onClick={() => setError(null)} className="text-xs text-error mt-1">
              {tpm('dismiss')}
            </button>
          </div>
        </div>
      )}

      <div className="border-b border-border">
        <nav className="-mb-px flex space-x-8">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center space-x-2 ${
                activeTab === tab.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted hover:text-secondary hover:border-border-strong'
              }`}
            >
              <span>{tab.label}</span>
              {tab.count !== undefined && (
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    activeTab === tab.id ? 'bg-info-subtle text-foreground' : 'bg-background text-foreground'
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="h-8 w-8 text-muted animate-spin" />
        </div>
      ) : activeTab === 'configs' ? (
        <ConfigsTab configs={configs} onEdit={(config) => {
          setEditingConfig(config);
          setShowConfigModal(true);
        }} />
      ) : (
        <GrantsTable
          grants={grants}
          onApprove={handleApprove}
          onRevoke={handleRevoke}
          status={activeTab}
        />
      )}

      {showConfigModal && editingConfig && (
        <ConfigModal
          config={editingConfig}
          onSave={handleUpdateConfig}
          onClose={() => {
            setShowConfigModal(false);
            setEditingConfig(null);
          }}
        />
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: 'yellow' | 'green' | 'red';
}) {
  const colors = {
    yellow: 'bg-warning-subtle border-yellow-200',
    green: 'bg-success-subtle border-green-200',
    red: 'bg-error-subtle border-red-200',
  };

  return (
    <div className={`border rounded-xl p-4 ${highlight ? colors[highlight] : 'bg-surface border-border'}`}>
      <p className="text-sm text-secondary">{label}</p>
      <p className="text-3xl font-semibold text-foreground mt-2">{value}</p>
    </div>
  );
}

function GrantsTable({
  grants,
  onApprove,
  onRevoke,
  status,
}: {
  grants: PrivilegedGrant[];
  onApprove: (id: string) => void;
  onRevoke: (id: string) => void;
  status: string;
}) {
  const tpm = useT('pam');
  if (grants.length === 0) {
    return (
      <div className="text-center py-12 bg-surface border rounded-xl">
        <Clock className="mx-auto h-12 w-12 text-muted" />
        <h3 className="mt-2 text-sm font-medium text-foreground">{tpm('noGrants')}</h3>
        <p className="mt-1 text-sm text-muted">{tpm('noGrantsBody')}</p>
      </div>
    );
  }

  return (
    <div className="bg-surface shadow-sm overflow-hidden sm:rounded-xl">
      <table className="min-w-full divide-y divide-border">
        <thead className="bg-background">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">{tpm('colRequester')}</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">{tpm('colPrivilege')}</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">{tpm('colReason')}</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">{tpm('colDuration')}</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">{tpm('colStatus')}</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">{tpm('colRequested')}</th>
            {status !== 'pending' && (
              <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">{tpm('colExpires')}</th>
            )}
            <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">{tpm('colActions')}</th>
          </tr>
        </thead>
        <tbody className="bg-surface divide-y divide-border">
          {grants.map((grant) => (
            <tr key={grant.id} className="hover:bg-background">
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="text-sm font-medium text-foreground">{grant.requester_email || grant.requester_id}</div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-info-subtle text-foreground">
                  {grant.privilege_type}
                </span>
              </td>
              <td className="px-6 py-4">
                <p className="text-sm text-foreground max-w-xs truncate">{grant.reason}</p>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-muted">
                {grant.requested_duration_hours} hours
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${status === 'pending' ? 'bg-warning-subtle text-warning' : 'bg-success-subtle text-success'}`}>
                  {grant.status.charAt(0).toUpperCase() + grant.status.slice(1)}
                </span>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-muted">
                {new Date(grant.created_at).toLocaleDateString()}
              </td>
              {status !== 'pending' && (
                <td className="px-6 py-4 whitespace-nowrap text-sm text-muted">
                  {grant.expires_at ? new Date(grant.expires_at).toLocaleDateString() : '-'}
                </td>
              )}
              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                {status === 'pending' && (
                  <>
                    <button
                      onClick={() => onApprove(grant.id)}
                      className="text-success hover:text-success inline-flex items-center space-x-1"
                    >
                      <Check className="h-4 w-4" />
                      <span>{tpm('approve')}</span>
                    </button>
                    <button
                      onClick={() => onRevoke(grant.id)}
                      className="text-error hover:text-error inline-flex items-center space-x-1"
                    >
                      <X className="h-4 w-4" />
                      <span>{tpm('reject')}</span>
                    </button>
                  </>
                )}
                {status === 'active' && (
                  <button
                    onClick={() => onRevoke(grant.id)}
                    className="text-error hover:text-error inline-flex items-center space-x-1"
                  >
                    <X className="h-4 w-4" />
                    <span>{tpm('revoke')}</span>
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ConfigsTab({ configs, onEdit }: { configs: PrivilegeConfig[]; onEdit: (config: PrivilegeConfig) => void }) {
  const tpm = useT('pam');
  if (configs.length === 0) {
    return (
      <div className="text-center py-12 bg-surface border rounded-xl">
        <AlertCircle className="mx-auto h-12 w-12 text-muted" />
        <h3 className="mt-2 text-sm font-medium text-foreground">{tpm('noConfigs')}</h3>
        <p className="mt-1 text-sm text-muted">{tpm('noConfigsBody')}</p>
      </div>
    );
  }

  return (
    <div className="bg-surface shadow-sm overflow-hidden sm:rounded-xl">
      <table className="min-w-full divide-y divide-border">
        <thead className="bg-background">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">{tpm('colPrivilege')}</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">{tpm('colMaxDuration')}</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">{tpm('colRequiresApprover')}</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">{tpm('colAutoApprove')}</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">{tpm('colAllowedRoles')}</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">{tpm('colActions')}</th>
          </tr>
        </thead>
        <tbody className="bg-surface divide-y divide-border">
          {configs.map((config) => (
            <tr key={config.id} className="hover:bg-background">
              <td className="px-6 py-4 whitespace-nowrap">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-info-subtle text-info">
                  {config.privilege_type}
                </span>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground">
                {config.max_duration_hours} hours
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                {config.requires_approver ? (
                  <Check className="h-5 w-5 text-success" />
                ) : (
                  <X className="h-5 w-5 text-muted" />
                )}
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                {config.auto_approve ? (
                  <Check className="h-5 w-5 text-success" />
                ) : (
                  <X className="h-5 w-5 text-muted" />
                )}
              </td>
              <td className="px-6 py-4 text-sm text-muted">
                {config.allowed_roles?.length > 0 ? config.allowed_roles.join(', ') : '-'}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                <button
                  onClick={() => onEdit(config)}
                  className="text-primary hover:text-primary inline-flex items-center space-x-1"
                >
                  <Edit2 className="h-4 w-4" />
                  <span>{tpm('edit')}</span>
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ConfigModal({
  config,
  onSave,
  onClose,
}: {
  config: PrivilegeConfig;
  onSave: (config: PrivilegeConfig) => void;
  onClose: () => void;
}) {
  const tpm = useT('pam');
  const [formData, setFormData] = useState({
    max_duration_hours: config.max_duration_hours,
    requires_approver: config.requires_approver,
    auto_approve: config.auto_approve,
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await onSave({
        ...config,
        ...formData,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 transition-opacity" onClick={onClose}>
          <div className="absolute inset-0 bg-background0 opacity-75" />
        </div>

        <div className="inline-block align-bottom bg-surface rounded-xl px-4 pt-5 pb-4 text-left overflow-hidden shadow-sm-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-foreground">
              Edit {config.privilege_type} Configuration
            </h3>
            <button onClick={onClose} className="text-muted hover:text-muted">
              <X className="h-6 w-6" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-secondary">{tpm('maxDurationHours')}</label>
              <input
                type="number"
                min="1"
                value={formData.max_duration_hours}
                onChange={(e) =>
                  setFormData({ ...formData, max_duration_hours: parseInt(e.target.value) })
                }
                className="mt-1 block w-full rounded-xl border-border-strong shadow-sm-sm focus:border-primary focus:ring-primary/20 focus:border-primary sm:text-sm"
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="requires_approver"
                  checked={formData.requires_approver}
                  onChange={(e) =>
                    setFormData({ ...formData, requires_approver: e.target.checked })
                  }
                  className="h-4 w-4 text-primary focus:ring-primary/20 focus:border-primary border-border-strong rounded"
                />
                <label htmlFor="requires_approver" className="ml-2 block text-sm text-foreground">
                  {tpm('requiresApproval')}
                </label>
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="auto_approve"
                  checked={formData.auto_approve}
                  onChange={(e) => setFormData({ ...formData, auto_approve: e.target.checked })}
                  className="h-4 w-4 text-primary focus:ring-primary/20 focus:border-primary border-border-strong rounded"
                />
                <label htmlFor="auto_approve" className="ml-2 block text-sm text-foreground">
                  {tpm('autoApprove')}
                </label>
              </div>
            </div>

            <div className="mt-6 flex justify-end space-x-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-border-strong rounded-xl shadow-sm-sm text-sm font-medium text-secondary bg-surface hover:bg-background"
              >
                {tpm('cancel')}
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 border border-transparent rounded-xl shadow-sm-sm text-sm font-medium text-white bg-primary hover:hover:bg-primary-hover disabled:opacity-50"
              >
                {loading ? tpm('saving') : tpm('saveChanges')}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
