'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Save,
  Loader2,
  AlertCircle,
  Info,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { applicationsApi, groupsApi, usersApi } from '@/lib/api';

interface UserData {
  id: string;
  name: string;
  email: string;
}

interface GroupData {
  id: string;
  name: string;
}

interface ApplicationData {
  id: string;
  name: string;
  short_name: string;
  description: string | null;
  owner_id: string | null;
  owner_name: string | null;
  support_group_id: string | null;
  support_group_name: string | null;
  environment: string;
  criticality: string;
  url: string | null;
  documentation_url: string | null;
  version: string | null;
  status: string;
}

export default function EditApplicationPage() {
  const params = useParams();
  const router = useRouter();
  const appId = params.id as string;

  const [application, setApplication] = useState<ApplicationData | null>(null);
  const [users, setUsers] = useState<UserData[]>([]);
  const [groups, setGroups] = useState<GroupData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    shortName: '',
    description: '',
    ownerId: '',
    supportGroupId: '',
    environment: 'production',
    criticality: 'medium',
    url: '',
    documentationUrl: '',
    version: '',
    status: 'operational',
  });

  const loadApplication = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await applicationsApi.get(appId);
      setApplication(data);
      setFormData({
        name: data.name || '',
        shortName: data.short_name || '',
        description: data.description || '',
        ownerId: data.owner_id || '',
        supportGroupId: data.support_group_id || '',
        environment: data.environment || 'production',
        criticality: data.criticality || 'medium',
        url: data.url || '',
        documentationUrl: data.documentation_url || '',
        version: data.version || '',
        status: data.status || 'operational',
      });
    } catch (err) {
      console.error('Failed to load application:', err);
      setError('Failed to load application');
    } finally {
      setIsLoading(false);
    }
  }, [appId]);

  const loadReferenceData = useCallback(async () => {
    try {
      const [usersRes, groupsRes] = await Promise.all([
        usersApi.list({ limit: 100 }),
        groupsApi.list({ limit: 100 }),
      ]);
      setUsers(usersRes.data || []);
      setGroups(groupsRes.data || []);
    } catch (err) {
      console.error('Failed to load reference data:', err);
    }
  }, []);

  useEffect(() => {
    loadApplication();
    loadReferenceData();
  }, [loadApplication, loadReferenceData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (!formData.name.trim()) {
      setError('Application name is required');
      return;
    }
    if (!formData.shortName.trim()) {
      setError('Short name is required');
      return;
    }

    try {
      setIsSubmitting(true);
      await applicationsApi.update(appId, {
        name: formData.name,
        description: formData.description || undefined,
        ownerUserId: formData.ownerId || undefined,
        supportGroupId: formData.supportGroupId || undefined,
        criticality: formData.criticality as 'mission_critical' | 'business_critical' | 'business_operational' | 'administrative' | undefined,
        status: formData.status as 'active' | 'inactive' | 'deprecated',
      });
      router.push(`/applications/${appId}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update application';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    try {
      setIsDeleting(true);
      await applicationsApi.delete(appId);
      router.push('/applications');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to delete application';
      setError(message);
      setShowDeleteConfirm(false);
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (!application) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Application not found</h2>
        <p className="text-gray-500 mb-4">The application you are looking for does not exist.</p>
        <Link href="/applications">
          <Button>Back to Applications</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start space-x-4">
          <Link href={`/applications/${appId}`} className="mt-1">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Edit Application</h1>
            <p className="mt-1 text-sm text-gray-500">
              Update {application.name} settings
            </p>
          </div>
        </div>
        <Button
          variant="danger"
          onClick={() => setShowDeleteConfirm(true)}
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Delete
        </Button>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Error Alert */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start">
            <AlertCircle className="h-5 w-5 text-red-500 mr-3 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Basic Information */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-medium text-gray-900">Basic Information</h2>
          </div>
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Application Name"
                value={formData.name}
                onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
                placeholder="Customer Portal"
                required
              />
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Short Name
                  <span className="text-red-500 ml-1">*</span>
                </label>
                <input
                  type="text"
                  value={formData.shortName}
                  onChange={(e) => setFormData((p) => ({ ...p, shortName: e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '') }))}
                  placeholder="CUST-PORTAL"
                  maxLength={20}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
                <p className="mt-1 text-xs text-gray-500">Uppercase letters, numbers, hyphens only</p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))}
                rows={3}
                placeholder="Describe the application's purpose and functionality..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Version</label>
              <input
                type="text"
                value={formData.version}
                onChange={(e) => setFormData((p) => ({ ...p, version: e.target.value }))}
                placeholder="1.0.0"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Classification */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-medium text-gray-900">Classification</h2>
          </div>
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Environment</label>
                <select
                  value={formData.environment}
                  onChange={(e) => setFormData((p) => ({ ...p, environment: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="production">Production</option>
                  <option value="staging">Staging</option>
                  <option value="development">Development</option>
                  <option value="testing">Testing</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Criticality</label>
                <select
                  value={formData.criticality}
                  onChange={(e) => setFormData((p) => ({ ...p, criticality: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="critical">Critical - Business critical, no downtime allowed</option>
                  <option value="high">High - Important for daily operations</option>
                  <option value="medium">Medium - Standard business application</option>
                  <option value="low">Low - Non-essential, limited impact if unavailable</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select
                value={formData.status}
                onChange={(e) => setFormData((p) => ({ ...p, status: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="operational">Operational</option>
                <option value="degraded">Degraded</option>
                <option value="partial_outage">Partial Outage</option>
                <option value="major_outage">Major Outage</option>
                <option value="maintenance">Maintenance</option>
              </select>
            </div>
          </div>
        </div>

        {/* Ownership */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-medium text-gray-900">Ownership</h2>
          </div>
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Application Owner</label>
                <select
                  value={formData.ownerId}
                  onChange={(e) => setFormData((p) => ({ ...p, ownerId: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select owner...</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name} ({user.email})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Support Group</label>
                <select
                  value={formData.supportGroupId}
                  onChange={(e) => setFormData((p) => ({ ...p, supportGroupId: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select support group...</option>
                  {groups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-start p-3 bg-blue-50 rounded-lg">
              <Info className="h-5 w-5 text-blue-500 mr-2 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-blue-700">
                The application owner is responsible for approving changes and managing the application lifecycle.
                The support group handles incidents and support requests.
              </p>
            </div>
          </div>
        </div>

        {/* URLs */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-medium text-gray-900">URLs & Links</h2>
          </div>
          <div className="p-6 space-y-4">
            <Input
              label="Application URL"
              type="url"
              value={formData.url}
              onChange={(e) => setFormData((p) => ({ ...p, url: e.target.value }))}
              placeholder="https://app.example.com"
            />

            <Input
              label="Documentation URL"
              type="url"
              value={formData.documentationUrl}
              onChange={(e) => setFormData((p) => ({ ...p, documentationUrl: e.target.value }))}
              placeholder="https://docs.example.com/app"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end space-x-4">
          <Link href={`/applications/${appId}`}>
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </Link>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save Changes
          </Button>
        </div>
      </form>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <div className="flex items-start">
              <div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <AlertCircle className="h-5 w-5 text-red-600" />
              </div>
              <div className="ml-4">
                <h3 className="text-lg font-medium text-gray-900">Delete Application</h3>
                <p className="mt-2 text-sm text-gray-500">
                  Are you sure you want to delete <strong>{application.name}</strong>?
                  This action cannot be undone and will remove all associated data.
                </p>
              </div>
            </div>
            <div className="mt-6 flex justify-end space-x-3">
              <Button
                variant="outline"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isDeleting}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={handleDelete}
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4 mr-2" />
                )}
                Delete Application
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
