'use client';

import { useState, FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCreateChange, useApplications, useUsers, useGroups } from '@/hooks/useApi';

export default function NewChangePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const applicationId = searchParams.get('application');

  const [error, setError] = useState<string | null>(null);

  const createChange = useCreateChange();
  const { data: applicationsData } = useApplications();
  const { data: usersData } = useUsers();
  const { data: groupsData } = useGroups();

  const applications = applicationsData?.data || [];
  const users = usersData?.data || [];
  const groups = groupsData?.data || [];

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    justification: '',
    type: 'normal' as 'standard' | 'normal' | 'emergency',
    riskLevel: 'medium' as 'low' | 'medium' | 'high' | 'critical',
    impact: 'moderate' as 'none' | 'minor' | 'moderate' | 'significant' | 'major',
    applicationId: applicationId || '',
    assignedGroup: '',
    plannedStart: '',
    plannedEnd: '',
    rollbackPlan: '',
    testPlan: '',
    implementationPlan: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.title.trim()) {
      newErrors.title = 'Title is required';
    } else if (formData.title.length < 5) {
      newErrors.title = 'Title must be at least 5 characters';
    }

    if (!formData.description.trim()) {
      newErrors.description = 'Description is required';
    }

    if (!formData.plannedStart) {
      newErrors.plannedStart = 'Planned start date is required';
    }

    if (!formData.plannedEnd) {
      newErrors.plannedEnd = 'Planned end date is required';
    }

    if (formData.plannedStart && formData.plannedEnd) {
      const start = new Date(formData.plannedStart);
      const end = new Date(formData.plannedEnd);
      if (end <= start) {
        newErrors.plannedEnd = 'End date must be after start date';
      }
    }

    if (!formData.rollbackPlan.trim()) {
      newErrors.rollbackPlan = 'Rollback plan is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!validateForm()) {
      return;
    }

    try {
      // Convert datetime-local to ISO string format
      const plannedStartISO = formData.plannedStart ? new Date(formData.plannedStart).toISOString() : undefined;
      const plannedEndISO = formData.plannedEnd ? new Date(formData.plannedEnd).toISOString() : undefined;

      await createChange.mutateAsync({
        title: formData.title,
        description: formData.description,
        justification: formData.justification || undefined,
        type: formData.type,
        riskLevel: formData.riskLevel,
        impact: formData.impact,
        applicationId: formData.applicationId || undefined,
        plannedStart: plannedStartISO,
        plannedEnd: plannedEndISO,
        rollbackPlan: formData.rollbackPlan || undefined,
        testPlan: formData.testPlan || undefined,
        implementationPlan: formData.implementationPlan || undefined,
      });
      router.push('/changes');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create change request. Please try again.';
      setError(message);
    }
  };

  const handleChange = (field: string) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    setFormData((prev) => ({ ...prev, [field]: e.target.value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: '' }));
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center space-x-4">
        <button
          onClick={() => router.back()}
          className="p-2 hover:bg-gray-100 rounded-md"
        >
          <ArrowLeft className="h-5 w-5 text-gray-500" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Create Change Request</h1>
          <p className="mt-1 text-sm text-gray-500">
            Submit a new change request for approval
          </p>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="flex items-center gap-2 p-4 text-sm text-red-800 bg-red-100 rounded-md">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}

        <div className="bg-white rounded-lg shadow p-6 space-y-6">
          <h2 className="text-lg font-semibold text-gray-900">Change Details</h2>

          <Input
            id="title"
            type="text"
            label="Title"
            placeholder="Brief summary of the change"
            value={formData.title}
            onChange={handleChange('title')}
            error={errors.title}
            required
          />

          <div>
            <label
              htmlFor="description"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Description <span className="text-red-500">*</span>
            </label>
            <textarea
              id="description"
              rows={5}
              placeholder="Detailed description of the change, including scope, steps, and expected outcome"
              value={formData.description}
              onChange={handleChange('description')}
              className={`w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.description ? 'border-red-500' : 'border-gray-300'
              }`}
              required
            />
            {errors.description && (
              <p className="mt-1 text-sm text-red-500">{errors.description}</p>
            )}
          </div>

          <div>
            <label
              htmlFor="justification"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Business Justification
            </label>
            <textarea
              id="justification"
              rows={3}
              placeholder="Why is this change needed?"
              value={formData.justification}
              onChange={handleChange('justification')}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label
              htmlFor="applicationId"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Application
            </label>
            <select
              id="applicationId"
              value={formData.applicationId}
              onChange={handleChange('applicationId')}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select an application (optional)</option>
              {applications.map((app: { id: string; name: string }) => (
                <option key={app.id} value={app.id}>
                  {app.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6 space-y-6">
          <h2 className="text-lg font-semibold text-gray-900">Classification</h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label
                htmlFor="type"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Change Type
              </label>
              <select
                id="type"
                value={formData.type}
                onChange={handleChange('type')}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="standard">Standard (Pre-approved)</option>
                <option value="normal">Normal (Requires CAB approval)</option>
                <option value="emergency">Emergency (Expedited approval)</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="riskLevel"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Risk Level
              </label>
              <select
                id="riskLevel"
                value={formData.riskLevel}
                onChange={handleChange('riskLevel')}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="impact"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Impact
              </label>
              <select
                id="impact"
                value={formData.impact}
                onChange={handleChange('impact')}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="none">None</option>
                <option value="minor">Minor</option>
                <option value="moderate">Moderate</option>
                <option value="significant">Significant</option>
                <option value="major">Major</option>
              </select>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6 space-y-6">
          <h2 className="text-lg font-semibold text-gray-900">Schedule</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="plannedStart"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Planned Start <span className="text-red-500">*</span>
              </label>
              <input
                type="datetime-local"
                id="plannedStart"
                value={formData.plannedStart}
                onChange={handleChange('plannedStart')}
                className={`w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.plannedStart ? 'border-red-500' : 'border-gray-300'
                }`}
                required
              />
              {errors.plannedStart && (
                <p className="mt-1 text-sm text-red-500">{errors.plannedStart}</p>
              )}
            </div>

            <div>
              <label
                htmlFor="plannedEnd"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Planned End <span className="text-red-500">*</span>
              </label>
              <input
                type="datetime-local"
                id="plannedEnd"
                value={formData.plannedEnd}
                onChange={handleChange('plannedEnd')}
                className={`w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.plannedEnd ? 'border-red-500' : 'border-gray-300'
                }`}
                required
              />
              {errors.plannedEnd && (
                <p className="mt-1 text-sm text-red-500">{errors.plannedEnd}</p>
              )}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6 space-y-6">
          <h2 className="text-lg font-semibold text-gray-900">Assignment</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="assignedGroup"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Assignment Group
              </label>
              <select
                id="assignedGroup"
                value={formData.assignedGroup}
                onChange={handleChange('assignedGroup')}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select a group</option>
                {groups.map((group: { id: string; name: string }) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="hidden">
              {/* Placeholder for users dropdown if needed */}
              {users.length > 0 && null}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6 space-y-6">
          <h2 className="text-lg font-semibold text-gray-900">Implementation Plans</h2>

          <div>
            <label
              htmlFor="implementationPlan"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Implementation Plan
            </label>
            <textarea
              id="implementationPlan"
              rows={4}
              placeholder="Step-by-step instructions for implementing the change"
              value={formData.implementationPlan}
              onChange={handleChange('implementationPlan')}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label
              htmlFor="rollbackPlan"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Rollback Plan <span className="text-red-500">*</span>
            </label>
            <textarea
              id="rollbackPlan"
              rows={4}
              placeholder="Steps to rollback the change if issues occur"
              value={formData.rollbackPlan}
              onChange={handleChange('rollbackPlan')}
              className={`w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.rollbackPlan ? 'border-red-500' : 'border-gray-300'
              }`}
              required
            />
            {errors.rollbackPlan && (
              <p className="mt-1 text-sm text-red-500">{errors.rollbackPlan}</p>
            )}
          </div>

          <div>
            <label
              htmlFor="testPlan"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Test Plan
            </label>
            <textarea
              id="testPlan"
              rows={4}
              placeholder="Steps to verify the change was successful"
              value={formData.testPlan}
              onChange={handleChange('testPlan')}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Form Actions */}
        <div className="flex justify-end space-x-4">
          <Link href="/changes">
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </Link>
          <Button type="submit" isLoading={createChange.isPending}>
            Submit for Approval
          </Button>
        </div>
      </form>
    </div>
  );
}
