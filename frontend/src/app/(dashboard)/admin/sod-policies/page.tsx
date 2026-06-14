'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  GitBranch,
  Plus,
  Loader2,
  AlertCircle,
  Trash2,
  ToggleLeft,
  ToggleRight,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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

type SeverityLevel = 'critical' | 'high' | 'medium' | 'low';

export default function SodPoliciesPage() {
  const [policies, setPolicies] = useState<SodPolicy[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    role_a: '',
    role_b: '',
    description: '',
    severity: 'high' as SeverityLevel,
    is_active: true,
  });

  const loadPolicies = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await api.get('/v1/sod/policies');
      setPolicies(response.data?.policies || response.data || []);
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

  const handleCreatePolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setIsSubmitting(true);

    try {
      await api.post('/v1/sod/policies', {
        role_a: formData.role_a,
        role_b: formData.role_b,
        description: formData.description || null,
        is_active: formData.is_active,
        severity: formData.severity,
      });

      setShowCreateModal(false);
      setFormData({
        role_a: '',
        role_b: '',
        description: '',
        severity: 'high',
        is_active: true,
      });
      await loadPolicies();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create policy';
      setSubmitError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleActive = async (id: string, currentActive: boolean) => {
    try {
      await api.put(`/v1/sod/policies/${id}`, {
        is_active: !currentActive,
      });
      await loadPolicies();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update policy';
      setError(message);
    }
  };

  const handleDeletePolicy = async (id: string) => {
    try {
      await api.delete(`/v1/sod/policies/${id}`);
      setDeleteConfirm(null);
      await loadPolicies();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete policy';
      setError(message);
    }
  };

  const getSeverityColor = (severity: SeverityLevel) => {
    switch (severity) {
      case 'critical':
        return 'bg-error-subtle text-error';
      case 'high':
        return 'bg-warning-subtle text-warning';
      case 'medium':
        return 'bg-warning-subtle text-warning';
      case 'low':
        return 'bg-info-subtle text-primary';
      default:
        return 'bg-background text-foreground';
    }
  };

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return dateString;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <GitBranch className="h-8 w-8 text-secondary" />
          <div>
            <h1 className="text-2xl font-bold text-foreground">Segregation of Duties Policies</h1>
            <p className="mt-1 text-sm text-muted">
              Prevent conflicting role combinations to meet SOX ITGC requirements
            </p>
          </div>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Policy
        </Button>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="flex items-center gap-2 p-4 text-sm text-error bg-error-subtle rounded-xl">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {error}
          <button
            onClick={() => setError(null)}
            className="ml-auto text-error hover:text-error"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Loading State */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="bg-surface rounded-xl shadow-sm overflow-hidden">
          <table className="min-w-full divide-y divide-border">
            <thead className="bg-background">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                  Role A
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                  Role B
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                  Description
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                  Severity
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-muted uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-surface divide-y divide-border">
              {policies.map((policy) => (
                <tr key={policy.id} className="hover:bg-surface-hover">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-foreground">
                    {policy.role_a}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-foreground">
                    {policy.role_b}
                  </td>
                  <td className="px-6 py-4 text-sm text-secondary max-w-xs truncate">
                    {policy.description || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getSeverityColor(
                        policy.severity
                      )}`}
                    >
                      {policy.severity.charAt(0).toUpperCase() + policy.severity.slice(1)}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {policy.is_active ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-success-subtle text-success">
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-background text-foreground">
                        Inactive
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium flex items-center justify-end gap-2">
                    <button
                      onClick={() => handleToggleActive(policy.id, policy.is_active)}
                      className="text-muted hover:text-secondary"
                      title={policy.is_active ? 'Disable policy' : 'Enable policy'}
                    >
                      {policy.is_active ? (
                        <ToggleRight className="h-5 w-5 text-success" />
                      ) : (
                        <ToggleLeft className="h-5 w-5" />
                      )}
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(policy.id)}
                      className="text-muted hover:text-error"
                      title="Delete policy"
                    >
                      <Trash2 className="h-5 w-5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {policies.length === 0 && (
            <div className="text-center py-12">
              <GitBranch className="h-12 w-12 text-muted mx-auto mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">No policies found</h3>
              <p className="text-muted mb-4">Create your first SoD policy to get started</p>
              <Button onClick={() => setShowCreateModal(true)} size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Add Policy
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-surface rounded-xl shadow-sm-xl max-w-md w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="text-lg font-semibold text-foreground">Create SoD Policy</h2>
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setSubmitError(null);
                }}
                className="text-muted hover:text-secondary"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreatePolicy} className="flex flex-col flex-1 overflow-hidden">
              <div className="flex-1 overflow-auto p-6 space-y-4">
                {submitError && (
                  <div className="p-3 text-sm text-error bg-error-subtle rounded-xl flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                    <div>{submitError}</div>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-secondary mb-1">
                    Role A
                  </label>
                  <Input
                    type="text"
                    value={formData.role_a}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, role_a: e.target.value }))
                    }
                    placeholder="e.g., Approver"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-secondary mb-1">
                    Role B
                  </label>
                  <Input
                    type="text"
                    value={formData.role_b}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, role_b: e.target.value }))
                    }
                    placeholder="e.g., Preparer"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-secondary mb-1">
                    Description
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, description: e.target.value }))
                    }
                    placeholder="Explain why these roles conflict (optional)"
                    rows={2}
                    className="w-full px-3 py-2 border border-border-strong rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-secondary mb-1">
                    Severity
                  </label>
                  <select
                    value={formData.severity}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        severity: e.target.value as SeverityLevel,
                      }))
                    }
                    className="w-full px-3 py-2 border border-border-strong rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  >
                    <option value="critical">Critical</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="is_active"
                    checked={formData.is_active}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, is_active: e.target.checked }))
                    }
                    className="h-4 w-4 text-primary rounded border-border-strong"
                  />
                  <label
                    htmlFor="is_active"
                    className="text-sm font-medium text-secondary cursor-pointer"
                  >
                    Activate policy immediately
                  </label>
                </div>
              </div>

              <div className="px-6 py-4 border-t border-border flex justify-end space-x-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowCreateModal(false);
                    setSubmitError(null);
                  }}
                >
                  Cancel
                </Button>
                <Button type="submit" isLoading={isSubmitting} disabled={isSubmitting}>
                  Create Policy
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-surface rounded-xl shadow-sm-xl max-w-sm w-full">
            <div className="p-6">
              <div className="flex items-center justify-center w-12 h-12 rounded-full bg-error-subtle mx-auto mb-4">
                <AlertCircle className="h-6 w-6 text-error" />
              </div>
              <h3 className="text-lg font-medium text-foreground text-center mb-2">
                Delete Policy
              </h3>
              <p className="text-sm text-secondary text-center mb-6">
                Are you sure you want to delete this SoD policy? This action cannot be undone.
              </p>
              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDeleteConfirm(null)}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={() => handleDeletePolicy(deleteConfirm)}
                  className="flex-1 bg-primary hover:bg-red-700"
                >
                  Delete
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
