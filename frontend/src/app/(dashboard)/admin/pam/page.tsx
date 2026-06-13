'use client';

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
      setError(err instanceof Error ? err.message : 'Failed to load data');
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
      setError(err instanceof Error ? err.message : 'Failed to approve grant');
    }
  };

  const handleRevoke = async (grantId: string) => {
    const reason = prompt('Enter reason for revocation:');
    if (!reason) return;
    if (!user) return;

    try {
      await api.post(`/v1/pam/grants/${grantId}/revoke`, {
        revokedBy: user.id,
        reason,
      });
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke grant');
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
      setError(err instanceof Error ? err.message : 'Failed to update config');
    }
  };

  const tabs = [
    { id: 'pending' as TabType, label: 'Pending', count: summary.pending },
    { id: 'active' as TabType, label: 'Active', count: summary.active },
    { id: 'all' as TabType, label: 'All Grants', count: summary.total },
    { id: 'configs' as TabType, label: 'Configurations' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center space-x-3">
            <KeyRound className="h-8 w-8 text-gray-900" />
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">Privileged Access Management</h1>
              <p className="mt-1 text-sm text-gray-500">Just-in-time privileged access grants (NY-DFS, SOX ITGC)</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Total Grants" value={summary.total} />
        <StatCard label="Pending" value={summary.pending} highlight="yellow" />
        <StatCard label="Active" value={summary.active} highlight="green" />
        <StatCard label="Revoked" value={summary.revoked} highlight="red" />
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start space-x-3">
          <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-red-800">{error}</p>
            <button onClick={() => setError(null)} className="text-xs text-red-600 mt-1">
              Dismiss
            </button>
          </div>
        </div>
      )}

      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center space-x-2 ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <span>{tab.label}</span>
              {tab.count !== undefined && (
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    activeTab === tab.id ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'
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
          <RefreshCw className="h-8 w-8 text-gray-400 animate-spin" />
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
    yellow: 'bg-yellow-50 border-yellow-200',
    green: 'bg-green-50 border-green-200',
    red: 'bg-red-50 border-red-200',
  };

  return (
    <div className={`border rounded-lg p-4 ${highlight ? colors[highlight] : 'bg-white border-gray-200'}`}>
      <p className="text-sm text-gray-600">{label}</p>
      <p className="text-3xl font-semibold text-gray-900 mt-2">{value}</p>
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
  if (grants.length === 0) {
    return (
      <div className="text-center py-12 bg-white border rounded-lg">
        <Clock className="mx-auto h-12 w-12 text-gray-400" />
        <h3 className="mt-2 text-sm font-medium text-gray-900">No grants found</h3>
        <p className="mt-1 text-sm text-gray-500">No privileged access grants with this status.</p>
      </div>
    );
  }

  return (
    <div className="bg-white shadow overflow-hidden sm:rounded-lg">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Requester</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Privilege Type</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reason</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Duration</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Requested</th>
            {status !== 'pending' && (
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Expires</th>
            )}
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {grants.map((grant) => (
            <tr key={grant.id} className="hover:bg-gray-50">
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="text-sm font-medium text-gray-900">{grant.requester_email || grant.requester_id}</div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                  {grant.privilege_type}
                </span>
              </td>
              <td className="px-6 py-4">
                <p className="text-sm text-gray-900 max-w-xs truncate">{grant.reason}</p>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {grant.requested_duration_hours} hours
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${status === 'pending' ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'}`}>
                  {grant.status.charAt(0).toUpperCase() + grant.status.slice(1)}
                </span>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {new Date(grant.created_at).toLocaleDateString()}
              </td>
              {status !== 'pending' && (
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {grant.expires_at ? new Date(grant.expires_at).toLocaleDateString() : '-'}
                </td>
              )}
              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                {status === 'pending' && (
                  <>
                    <button
                      onClick={() => onApprove(grant.id)}
                      className="text-green-600 hover:text-green-900 inline-flex items-center space-x-1"
                    >
                      <Check className="h-4 w-4" />
                      <span>Approve</span>
                    </button>
                    <button
                      onClick={() => onRevoke(grant.id)}
                      className="text-red-600 hover:text-red-900 inline-flex items-center space-x-1"
                    >
                      <X className="h-4 w-4" />
                      <span>Reject</span>
                    </button>
                  </>
                )}
                {status === 'active' && (
                  <button
                    onClick={() => onRevoke(grant.id)}
                    className="text-red-600 hover:text-red-900 inline-flex items-center space-x-1"
                  >
                    <X className="h-4 w-4" />
                    <span>Revoke</span>
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
  if (configs.length === 0) {
    return (
      <div className="text-center py-12 bg-white border rounded-lg">
        <AlertCircle className="mx-auto h-12 w-12 text-gray-400" />
        <h3 className="mt-2 text-sm font-medium text-gray-900">No configurations</h3>
        <p className="mt-1 text-sm text-gray-500">Configure privilege types to enable PAM.</p>
      </div>
    );
  }

  return (
    <div className="bg-white shadow overflow-hidden sm:rounded-lg">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Privilege Type</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Max Duration</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Requires Approver</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Auto Approve</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Allowed Roles</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {configs.map((config) => (
            <tr key={config.id} className="hover:bg-gray-50">
              <td className="px-6 py-4 whitespace-nowrap">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                  {config.privilege_type}
                </span>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                {config.max_duration_hours} hours
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                {config.requires_approver ? (
                  <Check className="h-5 w-5 text-green-500" />
                ) : (
                  <X className="h-5 w-5 text-gray-300" />
                )}
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                {config.auto_approve ? (
                  <Check className="h-5 w-5 text-green-500" />
                ) : (
                  <X className="h-5 w-5 text-gray-300" />
                )}
              </td>
              <td className="px-6 py-4 text-sm text-gray-500">
                {config.allowed_roles?.length > 0 ? config.allowed_roles.join(', ') : '-'}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                <button
                  onClick={() => onEdit(config)}
                  className="text-blue-600 hover:text-blue-900 inline-flex items-center space-x-1"
                >
                  <Edit2 className="h-4 w-4" />
                  <span>Edit</span>
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
          <div className="absolute inset-0 bg-gray-500 opacity-75" />
        </div>

        <div className="inline-block align-bottom bg-white rounded-lg px-4 pt-5 pb-4 text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-gray-900">
              Edit {config.privilege_type} Configuration
            </h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-500">
              <X className="h-6 w-6" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Max Duration (hours)</label>
              <input
                type="number"
                min="1"
                value={formData.max_duration_hours}
                onChange={(e) =>
                  setFormData({ ...formData, max_duration_hours: parseInt(e.target.value) })
                }
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
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
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="requires_approver" className="ml-2 block text-sm text-gray-900">
                  Requires Approval
                </label>
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="auto_approve"
                  checked={formData.auto_approve}
                  onChange={(e) => setFormData({ ...formData, auto_approve: e.target.checked })}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="auto_approve" className="ml-2 block text-sm text-gray-900">
                  Auto Approve
                </label>
              </div>
            </div>

            <div className="mt-6 flex justify-end space-x-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
