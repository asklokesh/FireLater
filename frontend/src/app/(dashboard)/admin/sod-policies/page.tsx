'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  GitBranch,
  Plus,
  Trash2,
  Toggle2,
  Loader2,
  AlertCircle,
  X,
  Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';

interface SodPolicy {
  id: string;
  role_a: string;
  role_b: string;
  description: string | null;
  is_active: boolean;
  severity: 'critical' | 'high' | 'medium' | 'low';
  created_at: string;
  updated_at: string;
}

interface CreatePolicyData {
  role_a: string;
  role_b: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  is_active: boolean;
}

const severityColors: Record<string, { bg: string; text: string }> = {
  critical: { bg: 'bg-red-100', text: 'text-red-800' },
  high: { bg: 'bg-orange-100', text: 'text-orange-800' },
  medium: { bg: 'bg-yellow-100', text: 'text-yellow-800' },
  low: { bg: 'bg-blue-100', text: 'text-blue-800' },
};

export default function SodPoliciesPage() {
  const [policies, setPolicies] = useState<SodPolicy[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState<CreatePolicyData>({
    role_a: '',
    role_b: '',
    description: '',
    severity: 'high',
    is_active: true,
  });

  const loadPolicies = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await api.get('/v1/sod/policies');
      setPolicies(response.data.policies || []);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load SoD policies';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPolicies();
  }, [loadPolicies]);

  const handleOpenModal = () => {
    setFormData({
      role_a: '',
      role_b: '',
      description: '',
      severity: 'high',
      is_active: true,
    });
    setModalError(null);
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setModalError(null);
  };

  const handleCreatePolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSubmitting(true);
      setModalError(null);

      if (!formData.role_a.trim() || !formData.role_b.trim()) {
        setModalError('Both roles are required');
        setIsSubmitting(false);
        return;
      }

      await api.post('/v1/sod/policies', {
        role_a: formData.role_a,
        role_b: formData.role_b,
        description: formData.description || null,
        severity: formData.severity,
        is_active: formData.is_active,
      });

      setShowModal(false);
      await loadPolicies();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create policy';
      setModalError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeletePolicy = async (id: string) => {
    try {
      setDeleting(id);
      await api.delete(`/v1/sod/policies/${id}`);
      setDeleteConfirm(null);
      await loadPolicies();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete policy';
      setError(message);
    } finally {
      setDeleting(null);
    }
  };

  const handleTogglePolicy = async (id: string, currentStatus: boolean) => {
    try {
      setToggling(id);
      await api.put(`/v1/sod/policies/${id}`, {
        is_active: !currentStatus,
      });
      await loadPolicies();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to toggle policy';
      setError(message);
    } finally {
      setToggling(null);
    }
  };

  const getSeverityLabel = (severity: string) => {
    return severity.charAt(0).toUpperCase() + severity.slice(1);
  };

  if (isLoading) {
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
          <div className="flex items-center gap-2">
            <GitBranch className="h-8 w-8 text-blue-600" />
            <h1 className="text-2xl font-bold text-gray-900">Segregation of Duties Policies</h1>
          </div>
          <p className="mt-1 text-sm text-gray-500">
            Prevent conflicting role combinations to meet SOX ITGC requirements
          </p>
        </div>
        <Button onClick={handleOpenModal} className="flex items-center">
          <Plus className="h-4 w-4 mr-2" />
          Add Policy
        </Button>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="flex items-center gap-2 p-4 text-sm text-red-800 bg-red-100 rounded-md">
          <AlertCircle className="h-4 w-4" />
          {error}
          <button
            onClick={() => setError(null)}
            className="ml-auto text-red-600 hover:text-red-800"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Policies Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Role A
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Role B
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Description
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Severity
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {policies.map((policy) => (
              <tr key={policy.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-gray-900">{policy.role_a}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-gray-900">{policy.role_b}</div>
                </td>
                <td className="px-6 py-4">
                  <div className="text-sm text-gray-500 max-w-xs">
                    {policy.description || '-'}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      severityColors[policy.severity].bg
                    } ${severityColors[policy.severity].text}`}
                  >
                    {getSeverityLabel(policy.severity)}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {policy.is_active ? (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      Active
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                      Inactive
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => handleTogglePolicy(policy.id, policy.is_active)}
                      disabled={toggling === policy.id}
                      className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
                      title={policy.is_active ? 'Deactivate' : 'Activate'}
                    >
                      {toggling === policy.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Toggle2 className="h-4 w-4" />
                      )}
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(policy.id)}
                      disabled={deleting === policy.id || deleteConfirm === policy.id}
                      className="text-gray-400 hover:text-red-600 disabled:opacity-50"
                      title="Delete"
                    >
                      {deleting === policy.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </button>
                  </div>

                  {/* Delete Confirmation */}
                  {deleteConfirm === policy.id && (
                    <div className="absolute right-0 top-full mt-2 bg-white rounded-lg shadow-lg border border-gray-200 p-3 z-50 w-64">
                      <p className="text-sm text-gray-700 mb-3">
                        Are you sure you want to delete this policy?
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleDeletePolicy(policy.id)}
                          className="flex-1 px-3 py-1.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md transition-colors"
                        >
                          Delete
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(null)}
                          className="flex-1 px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {policies.length === 0 && (
          <div className="text-center py-12">
            <GitBranch className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No SoD policies defined</h3>
            <p className="text-gray-500 mb-4">Create your first policy to prevent conflicting role assignments</p>
            <Button onClick={handleOpenModal} variant="outline" className="flex items-center mx-auto">
              <Plus className="h-4 w-4 mr-2" />
              Add Policy
            </Button>
          </div>
        )}
      </div>

      {/* Create Policy Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg max-w-md w-full mx-4">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Create SoD Policy</h2>
              <button
                onClick={handleCloseModal}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreatePolicy} className="p-6 space-y-4">
              {modalError && (
                <div className="flex items-center gap-2 p-3 text-sm text-red-800 bg-red-100 rounded-md">
                  <AlertCircle className="h-4 w-4" />
                  {modalError}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Role A
                </label>
                <input
                  type="text"
                  value={formData.role_a}
                  onChange={(e) => setFormData({ ...formData, role_a: e.target.value })}
                  placeholder="e.g., System Admin"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Role B
                </label>
                <input
                  type="text"
                  value={formData.role_b}
                  onChange={(e) => setFormData({ ...formData, role_b: e.target.value })}
                  placeholder="e.g., Approver"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Why should these roles not be combined?"
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Severity
                </label>
                <select
                  value={formData.severity}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      severity: e.target.value as 'critical' | 'high' | 'medium' | 'low',
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="critical">Critical</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>

              <div className="flex items-center gap-2 py-2">
                <input
                  type="checkbox"
                  id="is_active"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="is_active" className="text-sm font-medium text-gray-700">
                  Active
                </label>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors disabled:opacity-50 flex items-center justify-center"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Check className="h-4 w-4 mr-2" />
                      Create Policy
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
