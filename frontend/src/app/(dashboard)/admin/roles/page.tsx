'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  Shield,
  Lock,
  Users,
  MoreHorizontal,
  Edit,
  Check,
  X,
  Loader2,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { rolesApi } from '@/lib/api';

interface RoleData {
  id: string;
  name: string;
  display_name: string;
  description: string | null;
  is_system: boolean;
  user_count: string;
  created_at: string;
}

interface PermissionData {
  id: string;
  resource: string;
  action: string;
  description: string | null;
}

interface RoleWithPermissions extends RoleData {
  permissions: PermissionData[];
}

const resourceLabels: Record<string, string> = {
  users: 'Users',
  groups: 'Groups',
  applications: 'Applications',
  issues: 'Issues',
  changes: 'Changes',
  catalog: 'Service Catalog',
  requests: 'Service Requests',
  oncall: 'On-Call',
  reports: 'Reports',
  audit: 'Audit Logs',
  settings: 'Settings',
  approvals: 'Approvals',
};

const actionLabels: Record<string, string> = {
  create: 'Create',
  read: 'View',
  update: 'Update',
  delete: 'Delete',
  assign: 'Assign',
  resolve: 'Resolve',
  approve: 'Approve',
};

export default function RolesPage() {
  const [roles, setRoles] = useState<RoleData[]>([]);
  const [_permissions, setPermissions] = useState<PermissionData[]>([]);
  const [groupedPermissions, setGroupedPermissions] = useState<Record<string, PermissionData[]>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [selectedRole, setSelectedRole] = useState<RoleWithPermissions | null>(null);
  const [isLoadingRole, setIsLoadingRole] = useState(false);
  const [showDropdown, setShowDropdown] = useState<string | null>(null);

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [expandedResources, setExpandedResources] = useState<Record<string, boolean>>({});

  // Form states
  const [formData, setFormData] = useState({
    name: '',
    displayName: '',
    description: '',
    permissionIds: [] as string[],
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const loadRoles = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await rolesApi.list();
      setRoles(response.data || []);
    } catch (err) {
      console.error('Failed to load roles:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadPermissions = useCallback(async () => {
    try {
      const response = await rolesApi.getPermissions();
      setPermissions(response.data || []);
      setGroupedPermissions(response.grouped || {});
    } catch (err) {
      console.error('Failed to load permissions:', err);
    }
  }, []);

  const loadRoleDetails = async (roleId: string) => {
    try {
      setIsLoadingRole(true);
      const response = await rolesApi.get(roleId);
      setSelectedRole(response);
    } catch (err) {
      console.error('Failed to load role details:', err);
    } finally {
      setIsLoadingRole(false);
    }
  };

  useEffect(() => {
    loadRoles();
    loadPermissions();
  }, [loadRoles, loadPermissions]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setIsSubmitting(true);

    try {
      await rolesApi.create({
        name: formData.name,
        displayName: formData.displayName,
        description: formData.description || undefined,
        permissionIds: formData.permissionIds,
      });
      setShowCreateModal(false);
      setFormData({ name: '', displayName: '', description: '', permissionIds: [] });
      loadRoles();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create role';
      setFormError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRole) return;
    setFormError(null);
    setIsSubmitting(true);

    try {
      await rolesApi.update(selectedRole.id, {
        displayName: formData.displayName,
        description: formData.description || undefined,
        permissionIds: selectedRole.is_system ? undefined : formData.permissionIds,
      });
      setShowEditModal(false);
      loadRoles();
      loadRoleDetails(selectedRole.id);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update role';
      setFormError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const openEditModal = (role: RoleWithPermissions) => {
    setFormData({
      name: role.name,
      displayName: role.display_name,
      description: role.description || '',
      permissionIds: role.permissions.map((p) => p.id),
    });
    setShowEditModal(true);
    setShowDropdown(null);
  };

  const togglePermission = (permissionId: string) => {
    setFormData((prev) => ({
      ...prev,
      permissionIds: prev.permissionIds.includes(permissionId)
        ? prev.permissionIds.filter((id) => id !== permissionId)
        : [...prev.permissionIds, permissionId],
    }));
  };

  const toggleResource = (resource: string) => {
    const resourcePerms = groupedPermissions[resource] || [];
    const allSelected = resourcePerms.every((p) => formData.permissionIds.includes(p.id));

    if (allSelected) {
      setFormData((prev) => ({
        ...prev,
        permissionIds: prev.permissionIds.filter((id) => !resourcePerms.some((p) => p.id === id)),
      }));
    } else {
      setFormData((prev) => ({
        ...prev,
        permissionIds: [...new Set([...prev.permissionIds, ...resourcePerms.map((p) => p.id)])],
      }));
    }
  };

  const systemRoleCount = roles.filter((r) => r.is_system).length;
  const customRoleCount = roles.filter((r) => !r.is_system).length;

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
          <h1 className="text-2xl font-bold text-gray-900">Roles & Permissions</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage user roles and their associated permissions
          </p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Role
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center">
            <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <Shield className="h-5 w-5 text-blue-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm text-gray-500">Total Roles</p>
              <p className="text-2xl font-semibold text-gray-900">{roles.length}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center">
            <div className="h-10 w-10 rounded-lg bg-purple-100 flex items-center justify-center">
              <Lock className="h-5 w-5 text-purple-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm text-gray-500">System Roles</p>
              <p className="text-2xl font-semibold text-gray-900">{systemRoleCount}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center">
            <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center">
              <Shield className="h-5 w-5 text-green-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm text-gray-500">Custom Roles</p>
              <p className="text-2xl font-semibold text-gray-900">{customRoleCount}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Roles List */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-lg shadow">
            <div className="px-4 py-3 border-b border-gray-200">
              <h2 className="text-lg font-medium text-gray-900">Roles</h2>
            </div>
            <div className="divide-y divide-gray-200">
              {roles.map((role) => (
                <div
                  key={role.id}
                  className={`p-4 cursor-pointer hover:bg-gray-50 ${
                    selectedRole?.id === role.id ? 'bg-blue-50' : ''
                  }`}
                  onClick={() => loadRoleDetails(role.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${
                        role.is_system ? 'bg-purple-100' : 'bg-blue-100'
                      }`}>
                        {role.is_system ? (
                          <Lock className="h-4 w-4 text-purple-600" />
                        ) : (
                          <Shield className="h-4 w-4 text-blue-600" />
                        )}
                      </div>
                      <div className="ml-3">
                        <p className="text-sm font-medium text-gray-900">{role.display_name}</p>
                        <p className="text-xs text-gray-500">{role.name}</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="text-xs text-gray-500">
                        <Users className="h-3 w-3 inline mr-1" />
                        {role.user_count}
                      </span>
                      {role.is_system && (
                        <span className="px-2 py-0.5 text-xs font-medium bg-purple-100 text-purple-800 rounded-full">
                          System
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Role Details */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-lg shadow">
            {isLoadingRole ? (
              <div className="flex items-center justify-center h-64">
                <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
              </div>
            ) : selectedRole ? (
              <>
                <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">{selectedRole.display_name}</h2>
                    <p className="text-sm text-gray-500">{selectedRole.description || 'No description'}</p>
                  </div>
                  <div className="relative">
                    <button
                      onClick={() => setShowDropdown(showDropdown === selectedRole.id ? null : selectedRole.id)}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      <MoreHorizontal className="h-5 w-5" />
                    </button>
                    {showDropdown === selectedRole.id && (
                      <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg border border-gray-200 z-10">
                        <div className="py-1">
                          <button
                            onClick={() => openEditModal(selectedRole)}
                            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center"
                          >
                            <Edit className="h-4 w-4 mr-2" />
                            Edit Role
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="p-6">
                  <h3 className="text-sm font-medium text-gray-900 mb-4">Permissions ({selectedRole.permissions.length})</h3>

                  <div className="space-y-2">
                    {Object.keys(groupedPermissions).map((resource) => {
                      const resourcePerms = groupedPermissions[resource];
                      const rolePerms = selectedRole.permissions.filter((p) => p.resource === resource);
                      const hasAny = rolePerms.length > 0;
                      const isExpanded = expandedResources[resource];

                      return (
                        <div key={resource} className="border border-gray-200 rounded-lg overflow-hidden">
                          <button
                            onClick={() => setExpandedResources((prev) => ({
                              ...prev,
                              [resource]: !prev[resource],
                            }))}
                            className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100"
                          >
                            <div className="flex items-center">
                              {isExpanded ? (
                                <ChevronDown className="h-4 w-4 text-gray-500 mr-2" />
                              ) : (
                                <ChevronRight className="h-4 w-4 text-gray-500 mr-2" />
                              )}
                              <span className="font-medium text-gray-900">
                                {resourceLabels[resource] || resource}
                              </span>
                            </div>
                            <div className="flex items-center">
                              {hasAny ? (
                                <span className="px-2 py-0.5 text-xs font-medium bg-green-100 text-green-800 rounded-full">
                                  {rolePerms.length}/{resourcePerms.length}
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-600 rounded-full">
                                  None
                                </span>
                              )}
                            </div>
                          </button>

                          {isExpanded && (
                            <div className="px-4 py-3 bg-white">
                              <div className="flex flex-wrap gap-2">
                                {resourcePerms.map((perm) => {
                                  const hasPermission = rolePerms.some((p) => p.id === perm.id);
                                  return (
                                    <span
                                      key={perm.id}
                                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                        hasPermission
                                          ? 'bg-green-100 text-green-800'
                                          : 'bg-gray-100 text-gray-500'
                                      }`}
                                    >
                                      {hasPermission && <Check className="h-3 w-3 mr-1" />}
                                      {actionLabels[perm.action] || perm.action}
                                    </span>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-64 text-gray-500">
                <Shield className="h-12 w-12 mb-4" />
                <p>Select a role to view its permissions</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Create Role Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Create Role</h2>
              <button onClick={() => setShowCreateModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="flex flex-col flex-1 overflow-hidden">
              <div className="flex-1 overflow-auto p-6 space-y-4">
                {formError && (
                  <div className="p-3 text-sm text-red-800 bg-red-100 rounded-md">
                    {formError}
                  </div>
                )}

                <Input
                  label="Name (lowercase, underscores only)"
                  value={formData.name}
                  onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value.toLowerCase().replace(/[^a-z_]/g, '') }))}
                  placeholder="custom_role"
                  required
                />

                <Input
                  label="Display Name"
                  value={formData.displayName}
                  onChange={(e) => setFormData((p) => ({ ...p, displayName: e.target.value }))}
                  placeholder="Custom Role"
                  required
                />

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))}
                    placeholder="Optional description..."
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Permissions</label>
                  <div className="space-y-2 max-h-64 overflow-auto border border-gray-200 rounded-lg p-3">
                    {Object.keys(groupedPermissions).map((resource) => {
                      const resourcePerms = groupedPermissions[resource];
                      const selectedCount = resourcePerms.filter((p) => formData.permissionIds.includes(p.id)).length;
                      const allSelected = selectedCount === resourcePerms.length;

                      return (
                        <div key={resource} className="border border-gray-200 rounded-lg overflow-hidden">
                          <button
                            type="button"
                            onClick={() => toggleResource(resource)}
                            className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 hover:bg-gray-100"
                          >
                            <div className="flex items-center">
                              <input
                                type="checkbox"
                                checked={allSelected}
                                onChange={() => toggleResource(resource)}
                                className="h-4 w-4 text-blue-600 rounded mr-2"
                              />
                              <span className="font-medium text-sm text-gray-900">
                                {resourceLabels[resource] || resource}
                              </span>
                            </div>
                            <span className="text-xs text-gray-500">{selectedCount}/{resourcePerms.length}</span>
                          </button>
                          <div className="px-3 py-2 bg-white flex flex-wrap gap-2">
                            {resourcePerms.map((perm) => (
                              <label
                                key={perm.id}
                                className={`inline-flex items-center px-2.5 py-1 rounded text-xs cursor-pointer ${
                                  formData.permissionIds.includes(perm.id)
                                    ? 'bg-blue-100 text-blue-800'
                                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={formData.permissionIds.includes(perm.id)}
                                  onChange={() => togglePermission(perm.id)}
                                  className="sr-only"
                                />
                                {formData.permissionIds.includes(perm.id) && <Check className="h-3 w-3 mr-1" />}
                                {actionLabels[perm.action] || perm.action}
                              </label>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="px-6 py-4 border-t border-gray-200 flex justify-end space-x-3">
                <Button type="button" variant="outline" onClick={() => setShowCreateModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" isLoading={isSubmitting}>
                  Create Role
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Role Modal */}
      {showEditModal && selectedRole && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Edit Role: {selectedRole.display_name}</h2>
              <button onClick={() => setShowEditModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleUpdate} className="flex flex-col flex-1 overflow-hidden">
              <div className="flex-1 overflow-auto p-6 space-y-4">
                {formError && (
                  <div className="p-3 text-sm text-red-800 bg-red-100 rounded-md">
                    {formError}
                  </div>
                )}

                {selectedRole.is_system && (
                  <div className="p-3 text-sm text-amber-800 bg-amber-100 rounded-md flex items-center">
                    <Lock className="h-4 w-4 mr-2" />
                    System role permissions cannot be modified
                  </div>
                )}

                <Input
                  label="Display Name"
                  value={formData.displayName}
                  onChange={(e) => setFormData((p) => ({ ...p, displayName: e.target.value }))}
                  required
                />

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))}
                    placeholder="Optional description..."
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {!selectedRole.is_system && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Permissions</label>
                    <div className="space-y-2 max-h-64 overflow-auto border border-gray-200 rounded-lg p-3">
                      {Object.keys(groupedPermissions).map((resource) => {
                        const resourcePerms = groupedPermissions[resource];
                        const selectedCount = resourcePerms.filter((p) => formData.permissionIds.includes(p.id)).length;
                        const allSelected = selectedCount === resourcePerms.length;

                        return (
                          <div key={resource} className="border border-gray-200 rounded-lg overflow-hidden">
                            <button
                              type="button"
                              onClick={() => toggleResource(resource)}
                              className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 hover:bg-gray-100"
                            >
                              <div className="flex items-center">
                                <input
                                  type="checkbox"
                                  checked={allSelected}
                                  onChange={() => toggleResource(resource)}
                                  className="h-4 w-4 text-blue-600 rounded mr-2"
                                />
                                <span className="font-medium text-sm text-gray-900">
                                  {resourceLabels[resource] || resource}
                                </span>
                              </div>
                              <span className="text-xs text-gray-500">{selectedCount}/{resourcePerms.length}</span>
                            </button>
                            <div className="px-3 py-2 bg-white flex flex-wrap gap-2">
                              {resourcePerms.map((perm) => (
                                <label
                                  key={perm.id}
                                  className={`inline-flex items-center px-2.5 py-1 rounded text-xs cursor-pointer ${
                                    formData.permissionIds.includes(perm.id)
                                      ? 'bg-blue-100 text-blue-800'
                                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={formData.permissionIds.includes(perm.id)}
                                    onChange={() => togglePermission(perm.id)}
                                    className="sr-only"
                                  />
                                  {formData.permissionIds.includes(perm.id) && <Check className="h-3 w-3 mr-1" />}
                                  {actionLabels[perm.action] || perm.action}
                                </label>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              <div className="px-6 py-4 border-t border-gray-200 flex justify-end space-x-3">
                <Button type="button" variant="outline" onClick={() => setShowEditModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" isLoading={isSubmitting}>
                  Save Changes
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Click outside to close dropdown */}
      {showDropdown && (
        <div
          className="fixed inset-0 z-0"
          onClick={() => setShowDropdown(null)}
        />
      )}
    </div>
  );
}
