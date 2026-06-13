'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  UserCheck,
  Plus,
  ChevronDown,
  ChevronRight,
  Loader2,
  XCircle,
  Check,
  X,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';

interface Campaign {
  id: string;
  name: string;
  description: string | null;
  scope_type: 'all_users' | 'role' | 'group' | 'resource';
  scope_value: string | null;
  owner_id: string;
  owner_email: string | null;
  due_date: string;
  status: 'draft' | 'active' | 'completed' | 'cancelled';
  total_items: number;
  reviewed_items: number;
  created_at: string;
}

interface RecertItem {
  id: string;
  user_email: string | null;
  user_name: string | null;
  resource_type: string;
  resource_name: string | null;
  decision: 'approved' | 'revoked' | 'delegated' | null;
  status: 'pending' | 'decided' | 'escalated';
}

const statusColors: Record<string, { bg: string; text: string }> = {
  draft: { bg: 'bg-gray-100', text: 'text-gray-800' },
  active: { bg: 'bg-blue-100', text: 'text-blue-800' },
  completed: { bg: 'bg-green-100', text: 'text-green-800' },
  cancelled: { bg: 'bg-red-100', text: 'text-red-800' },
};

const scopeLabels: Record<string, string> = {
  all_users: 'All Users',
  role: 'By Role',
  group: 'By Group',
  resource: 'By Resource',
};

export default function AccessRecertificationPage() {
  const user = useAuthStore((state) => state.user);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedCampaign, setExpandedCampaign] = useState<string | null>(null);
  const [campaignItems, setCampaignItems] = useState<Record<string, RecertItem[]>>({});
  const [loadingItems, setLoadingItems] = useState<Record<string, boolean>>({});

  // Create campaign modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '',
    description: '',
    scopeType: 'all_users' as const,
    scopeValue: '',
    ownerEmail: user?.email || '',
    dueDate: '',
  });
  const [isCreating, setIsCreating] = useState(false);

  const loadCampaigns = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await api.get('/v1/recertification/campaigns');
      setCampaigns(response.data.data || []);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load campaigns';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadCampaignItems = async (campaignId: string) => {
    if (campaignItems[campaignId]) return;

    try {
      setLoadingItems((prev) => ({ ...prev, [campaignId]: true }));
      const response = await api.get(`/v1/recertification/campaigns/${campaignId}/items`);
      setCampaignItems((prev) => ({
        ...prev,
        [campaignId]: response.data.data || [],
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load items';
      setError(message);
    } finally {
      setLoadingItems((prev) => ({ ...prev, [campaignId]: false }));
    }
  };

  useEffect(() => {
    loadCampaigns();
  }, [loadCampaigns]);

  const handleExpandCampaign = (campaignId: string) => {
    if (expandedCampaign === campaignId) {
      setExpandedCampaign(null);
    } else {
      setExpandedCampaign(campaignId);
      loadCampaignItems(campaignId);
    }
  };

  const handleCreateCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreating(true);

    try {
      await api.post('/v1/recertification/campaigns', {
        name: createForm.name,
        description: createForm.description || undefined,
        scopeType: createForm.scopeType,
        scopeValue: createForm.scopeValue || undefined,
        ownerId: user?.id,
        ownerEmail: createForm.ownerEmail,
        dueDate: createForm.dueDate,
      });
      setShowCreateModal(false);
      setCreateForm({
        name: '',
        description: '',
        scopeType: 'all_users',
        scopeValue: '',
        ownerEmail: user?.email || '',
        dueDate: '',
      });
      loadCampaigns();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create campaign';
      setError(message);
    } finally {
      setIsCreating(false);
    }
  };

  const handleLaunchCampaign = async (campaignId: string) => {
    try {
      await api.post(`/v1/recertification/campaigns/${campaignId}/launch`);
      loadCampaigns();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to launch campaign';
      setError(message);
    }
  };

  const handleCompleteCampaign = async (campaignId: string) => {
    try {
      await api.post(`/v1/recertification/campaigns/${campaignId}/complete`);
      loadCampaigns();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to complete campaign';
      setError(message);
    }
  };

  const handleDecideItem = async (itemId: string, decision: 'approved' | 'revoked') => {
    try {
      await api.post(`/v1/recertification/items/${itemId}/decide`, {
        reviewerId: user?.id,
        reviewerEmail: user?.email,
        decision,
        comment: '',
      });
      if (expandedCampaign) {
        await loadCampaignItems(expandedCampaign);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to decide item';
      setError(message);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
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
      {error && (
        <div className="flex items-center gap-2 p-4 text-sm text-red-800 bg-red-100 rounded-md">
          <XCircle className="h-4 w-4" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto text-red-600 hover:text-red-800">
            Dismiss
          </button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <UserCheck className="h-6 w-6 text-gray-700" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Access Recertification</h1>
            <p className="text-sm text-gray-500">Periodic user access reviews for SOX ITGC and GLBA compliance</p>
          </div>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Campaign
        </Button>
      </div>

      {campaigns.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <UserCheck className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No campaigns yet</h3>
          <p className="text-gray-500">Create your first access recertification campaign</p>
        </div>
      ) : (
        <div className="space-y-4">
          {campaigns.map((campaign) => {
            const isExpanded = expandedCampaign === campaign.id;
            const items = campaignItems[campaign.id] || [];
            const progressPercent =
              campaign.total_items > 0 ? Math.round((campaign.reviewed_items / campaign.total_items) * 100) : 0;

            return (
              <div key={campaign.id} className="bg-white rounded-lg shadow overflow-hidden">
                <button
                  onClick={() => handleExpandCampaign(campaign.id)}
                  className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50"
                >
                  <div className="flex items-center gap-4 flex-1">
                    {isExpanded ? <ChevronDown className="h-5 w-5 text-gray-400" /> : <ChevronRight className="h-5 w-5 text-gray-400" />}
                    <div className="text-left flex-1">
                      <h3 className="font-medium text-gray-900">{campaign.name}</h3>
                      <p className="text-sm text-gray-500">{campaign.description}</p>
                    </div>
                    <div className="hidden sm:flex items-center gap-6">
                      <div className="text-right">
                        <p className="text-sm font-medium text-gray-900">{scopeLabels[campaign.scope_type]}</p>
                        {campaign.scope_value && <p className="text-xs text-gray-500">{campaign.scope_value}</p>}
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium text-gray-900">
                          {campaign.reviewed_items}/{campaign.total_items}
                        </p>
                        <p className="text-xs text-gray-500">{progressPercent}% reviewed</p>
                      </div>
                      <div>
                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${statusColors[campaign.status].bg} ${statusColors[campaign.status].text}`}>
                          {campaign.status.charAt(0).toUpperCase() + campaign.status.slice(1)}
                        </span>
                      </div>
                    </div>
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-gray-200 p-6 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wider">Due Date</p>
                        <p className="text-sm font-medium text-gray-900">{formatDate(campaign.due_date)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wider">Owner</p>
                        <p className="text-sm font-medium text-gray-900">{campaign.owner_email}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wider">Progress</p>
                        <div className="mt-1 w-full bg-gray-200 rounded-full h-2">
                          <div className="bg-blue-500 h-2 rounded-full" style={{ width: `${progressPercent}%` }} />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        {campaign.status === 'draft' && (
                          <Button size="sm" onClick={() => handleLaunchCampaign(campaign.id)}>
                            Launch
                          </Button>
                        )}
                        {campaign.status === 'active' && (
                          <Button size="sm" variant="outline" onClick={() => handleCompleteCampaign(campaign.id)}>
                            Complete
                          </Button>
                        )}
                      </div>
                    </div>

                    {loadingItems[campaign.id] ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
                      </div>
                    ) : items.length === 0 ? (
                      <div className="text-center py-8">
                        <p className="text-gray-500">No items to review</p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                User
                              </th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Resource
                              </th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Status
                              </th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Decision
                              </th>
                              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Actions
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200">
                            {items.map((item) => (
                              <tr key={item.id} className="hover:bg-gray-50">
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <div>
                                    <p className="text-sm font-medium text-gray-900">{item.user_name}</p>
                                    <p className="text-xs text-gray-500">{item.user_email}</p>
                                  </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <div>
                                    <p className="text-sm text-gray-900">{item.resource_name}</p>
                                    <p className="text-xs text-gray-500">{item.resource_type}</p>
                                  </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <span
                                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                      item.status === 'pending'
                                        ? 'bg-yellow-100 text-yellow-800'
                                        : item.status === 'escalated'
                                          ? 'bg-red-100 text-red-800'
                                          : 'bg-green-100 text-green-800'
                                    }`}
                                  >
                                    {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                                  </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                  {item.decision ? (
                                    <span
                                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                        item.decision === 'approved'
                                          ? 'bg-green-100 text-green-800'
                                          : item.decision === 'revoked'
                                            ? 'bg-red-100 text-red-800'
                                            : 'bg-blue-100 text-blue-800'
                                      }`}
                                    >
                                      {item.decision.charAt(0).toUpperCase() + item.decision.slice(1)}
                                    </span>
                                  ) : (
                                    <span className="text-gray-400">Pending</span>
                                  )}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-right space-x-2">
                                  {item.status === 'pending' && (
                                    <>
                                      <button
                                        onClick={() => handleDecideItem(item.id, 'approved')}
                                        className="inline-flex items-center px-3 py-1 rounded-md text-xs font-medium bg-green-100 text-green-800 hover:bg-green-200"
                                      >
                                        <Check className="h-3 w-3 mr-1" />
                                        Approve
                                      </button>
                                      <button
                                        onClick={() => handleDecideItem(item.id, 'revoked')}
                                        className="inline-flex items-center px-3 py-1 rounded-md text-xs font-medium bg-red-100 text-red-800 hover:bg-red-200"
                                      >
                                        <X className="h-3 w-3 mr-1" />
                                        Revoke
                                      </button>
                                    </>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg max-w-md w-full mx-4">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Create Campaign</h2>
            </div>
            <form onSubmit={handleCreateCampaign} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Campaign Name</label>
                <input
                  type="text"
                  required
                  value={createForm.name}
                  onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={createForm.description}
                  onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Scope Type</label>
                <select
                  value={createForm.scopeType}
                  onChange={(e) => setCreateForm({ ...createForm, scopeType: e.target.value as any })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {Object.entries(scopeLabels).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              {createForm.scopeType !== 'all_users' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Scope Value</label>
                  <input
                    type="text"
                    value={createForm.scopeValue}
                    onChange={(e) => setCreateForm({ ...createForm, scopeValue: e.target.value })}
                    placeholder={`Enter ${createForm.scopeType}`}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Owner Email</label>
                <input
                  type="email"
                  required
                  value={createForm.ownerEmail}
                  onChange={(e) => setCreateForm({ ...createForm, ownerEmail: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
                <input
                  type="date"
                  required
                  value={createForm.dueDate}
                  onChange={(e) => setCreateForm({ ...createForm, dueDate: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex gap-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isCreating} className="flex-1">
                  {isCreating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Create
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
