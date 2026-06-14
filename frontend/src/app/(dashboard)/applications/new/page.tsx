'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Save,
  Loader2,
  AlertCircle,
  Info,
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

export default function NewApplicationPage() {
  const router = useRouter();

  const [users, setUsers] = useState<UserData[]>([]);
  const [groups, setGroups] = useState<GroupData[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    loadReferenceData();
  }, [loadReferenceData]);

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
      const response = await applicationsApi.create({
        name: formData.name,
        tier: 'P3' as const,
        description: formData.description || undefined,
        ownerUserId: formData.ownerId || undefined,
        supportGroupId: formData.supportGroupId || undefined,
        lifecycleStage: formData.environment as 'development' | 'staging' | 'production' | 'sunset' | undefined,
        criticality: formData.criticality as 'mission_critical' | 'business_critical' | 'business_operational' | 'administrative' | undefined,
        status: formData.status as 'active' | 'inactive' | 'deprecated',
      });
      router.push(`/applications/${response.id}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create application';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-start space-x-4">
        <Link href="/applications" className="mt-1">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-foreground">New Application</h1>
          <p className="mt-1 text-sm text-muted">
            Register a new application in the system
          </p>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Error Alert */}
        {error && (
          <div className="bg-error-subtle border border-border rounded-lg p-4 flex items-start">
            <AlertCircle className="h-5 w-5 text-error mr-3 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-error">{error}</p>
          </div>
        )}

        {/* Basic Information */}
        <div className="bg-surface rounded-xl shadow-sm">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="text-lg font-medium text-foreground">Basic Information</h2>
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
                <label className="block text-sm font-medium text-secondary mb-1">
                  Short Name
                  <span className="text-error ml-1">*</span>
                </label>
                <input
                  type="text"
                  value={formData.shortName}
                  onChange={(e) => setFormData((p) => ({ ...p, shortName: e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '') }))}
                  placeholder="CUST-PORTAL"
                  maxLength={20}
                  className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  required
                />
                <p className="mt-1 text-xs text-muted">Uppercase letters, numbers, hyphens only</p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-secondary mb-1">Description</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))}
                rows={3}
                placeholder="Describe the application's purpose and functionality..."
                className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-secondary mb-1">Version</label>
              <input
                type="text"
                value={formData.version}
                onChange={(e) => setFormData((p) => ({ ...p, version: e.target.value }))}
                placeholder="1.0.0"
                className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>
        </div>

        {/* Classification */}
        <div className="bg-surface rounded-xl shadow-sm">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="text-lg font-medium text-foreground">Classification</h2>
          </div>
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-secondary mb-1">Environment</label>
                <select
                  value={formData.environment}
                  onChange={(e) => setFormData((p) => ({ ...p, environment: e.target.value }))}
                  className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="production">Production</option>
                  <option value="staging">Staging</option>
                  <option value="development">Development</option>
                  <option value="testing">Testing</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-secondary mb-1">Criticality</label>
                <select
                  value={formData.criticality}
                  onChange={(e) => setFormData((p) => ({ ...p, criticality: e.target.value }))}
                  className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="critical">Critical - Business critical, no downtime allowed</option>
                  <option value="high">High - Important for daily operations</option>
                  <option value="medium">Medium - Standard business application</option>
                  <option value="low">Low - Non-essential, limited impact if unavailable</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-secondary mb-1">Status</label>
              <select
                value={formData.status}
                onChange={(e) => setFormData((p) => ({ ...p, status: e.target.value }))}
                className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
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
        <div className="bg-surface rounded-xl shadow-sm">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="text-lg font-medium text-foreground">Ownership</h2>
          </div>
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-secondary mb-1">Application Owner</label>
                <select
                  value={formData.ownerId}
                  onChange={(e) => setFormData((p) => ({ ...p, ownerId: e.target.value }))}
                  className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
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
                <label className="block text-sm font-medium text-secondary mb-1">Support Group</label>
                <select
                  value={formData.supportGroupId}
                  onChange={(e) => setFormData((p) => ({ ...p, supportGroupId: e.target.value }))}
                  className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
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

            <div className="flex items-start p-3 bg-primary-subtle rounded-lg">
              <Info className="h-5 w-5 text-primary mr-2 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-primary">
                The application owner is responsible for approving changes and managing the application lifecycle.
                The support group handles incidents and support requests.
              </p>
            </div>
          </div>
        </div>

        {/* URLs */}
        <div className="bg-surface rounded-xl shadow-sm">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="text-lg font-medium text-foreground">URLs & Links</h2>
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
          <Link href="/applications">
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
            Create Application
          </Button>
        </div>
      </form>
    </div>
  );
}
