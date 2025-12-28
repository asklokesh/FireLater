'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCreateProblem, useApplications, useUsers, useGroups } from '@/hooks/useApi';

export default function NewProblemPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const createProblem = useCreateProblem();
  const { data: applicationsData } = useApplications();
  const { data: usersData } = useUsers();
  const { data: groupsData } = useGroups();

  const applications = applicationsData?.data || [];
  const users = usersData?.data || [];
  const groups = groupsData?.data || [];

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    priority: 'medium' as 'critical' | 'high' | 'medium' | 'low',
    urgency: 'medium' as 'immediate' | 'high' | 'medium' | 'low',
    impact: 'moderate' as 'widespread' | 'significant' | 'moderate' | 'minor',
    problemType: 'reactive' as 'reactive' | 'proactive',
    applicationId: '',
    assignedGroup: '',
    assignedTo: '',
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
    } else if (formData.description.length < 10) {
      newErrors.description = 'Description must be at least 10 characters';
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
      await createProblem.mutateAsync({
        title: formData.title,
        description: formData.description,
        priority: formData.priority,
        urgency: formData.urgency,
        impact: formData.impact,
        problemType: formData.problemType,
        applicationId: formData.applicationId || undefined,
        assignedTo: formData.assignedTo || undefined,
        assignedGroup: formData.assignedGroup || undefined,
      });
      router.push('/problems');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create problem. Please try again.';
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
          <h1 className="text-2xl font-bold text-gray-900">Create New Problem</h1>
          <p className="mt-1 text-sm text-gray-500">
            Initiate root cause analysis for recurring or significant issues
          </p>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="flex items-center gap-2 p-4 text-sm text-red-800 bg-red-100 rounded-md">
            <AlertTriangle className="h-4 w-4" />
            {error}
          </div>
        )}

        <div className="bg-white rounded-lg shadow p-6 space-y-6">
          <h2 className="text-lg font-semibold text-gray-900">Problem Details</h2>

          <Input
            id="title"
            type="text"
            label="Title"
            placeholder="Brief summary of the problem"
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
              placeholder="Detailed description of the problem, symptoms, and patterns observed..."
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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="problemType"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Problem Type
              </label>
              <select
                id="problemType"
                value={formData.problemType}
                onChange={handleChange('problemType')}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="reactive">Reactive (from incident)</option>
                <option value="proactive">Proactive (trend analysis)</option>
              </select>
              <p className="mt-1 text-xs text-gray-500">
                Reactive: Created from recurring incidents. Proactive: Identified through trend analysis.
              </p>
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
        </div>

        <div className="bg-white rounded-lg shadow p-6 space-y-6">
          <h2 className="text-lg font-semibold text-gray-900">Priority & Impact</h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label
                htmlFor="priority"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Priority
              </label>
              <select
                id="priority"
                value={formData.priority}
                onChange={handleChange('priority')}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="urgency"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Urgency
              </label>
              <select
                id="urgency"
                value={formData.urgency}
                onChange={handleChange('urgency')}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="immediate">Immediate</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
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
                <option value="widespread">Widespread</option>
                <option value="significant">Significant</option>
                <option value="moderate">Moderate</option>
                <option value="minor">Minor</option>
              </select>
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
                <option value="">Select a group (optional)</option>
                {groups.map((group: { id: string; name: string }) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="assignedTo"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Assigned To
              </label>
              <select
                id="assignedTo"
                value={formData.assignedTo}
                onChange={handleChange('assignedTo')}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select a user (optional)</option>
                {users.map((user: { id: string; name: string }) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Form Actions */}
        <div className="flex justify-end space-x-4">
          <Link href="/problems">
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </Link>
          <Button type="submit" isLoading={createProblem.isPending}>
            Create Problem
          </Button>
        </div>
      </form>
    </div>
  );
}
