'use client';

import { useState } from 'react';
import {
  Key,
  Webhook,
  Plug,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  Copy,
  Check,
  AlertCircle,
  CheckCircle,
  Clock,
  Send,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';
import {
  useApiKeys,
  useCreateApiKey,
  useUpdateApiKey,
  useDeleteApiKey,
  useWebhooks,
  useCreateWebhook,
  useUpdateWebhook,
  useDeleteWebhook,
  useTestWebhook,
  useWebhookEvents,
  useWebhookDeliveries,
  useIntegrations,
  useCreateIntegration,
  useUpdateIntegration,
  useDeleteIntegration,
  useTestIntegration,
  useIntegrationTypes,
  ApiKey,
  Webhook as WebhookType,
  WebhookDelivery,
  Integration,
} from '@/hooks/useApi';

// Tab components
function ApiKeysTab() {
  const { data: apiKeysData, isLoading } = useApiKeys({ includeInactive: true });
  const createApiKey = useCreateApiKey();
  const updateApiKey = useUpdateApiKey();
  const deleteApiKey = useDeleteApiKey();
  const [showModal, setShowModal] = useState(false);
  const [newKeyResult, setNewKeyResult] = useState<{ key: string; prefix: string } | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    rateLimit: 1000,
    expiresAt: '',
  });

  const apiKeys = apiKeysData?.data || [];

  const handleCreate = async () => {
    try {
      const result = await createApiKey.mutateAsync({
        name: formData.name,
        description: formData.description || undefined,
        rateLimit: formData.rateLimit,
        expiresAt: formData.expiresAt || undefined,
      });
      setNewKeyResult({ key: result.key, prefix: result.data.key_prefix });
      setFormData({ name: '', description: '', rateLimit: 1000, expiresAt: '' });
    } catch {
      // Error handling
    }
  };

  const handleCopyKey = async () => {
    if (newKeyResult) {
      await navigator.clipboard.writeText(newKeyResult.key);
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    }
  };

  const handleToggleActive = async (key: ApiKey) => {
    await updateApiKey.mutateAsync({
      id: key.id,
      data: { isActive: !key.is_active },
    });
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this API key? This action cannot be undone.')) {
      await deleteApiKey.mutateAsync(id);
    }
  };

  if (isLoading) {
    return <div className="animate-pulse">Loading API keys...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-medium text-gray-900">API Keys</h3>
          <p className="text-sm text-gray-500">
            Manage API keys for programmatic access to your data
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Plus className="h-4 w-4 mr-2" />
          Create API Key
        </button>
      </div>

      {/* New key result modal */}
      {newKeyResult && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-lg w-full mx-4">
            <div className="flex items-center text-green-600 mb-4">
              <CheckCircle className="h-6 w-6 mr-2" />
              <h3 className="text-lg font-medium">API Key Created</h3>
            </div>
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
              <p className="text-sm text-yellow-800 mb-2">
                <strong>Important:</strong> Copy your API key now. You won&apos;t be able to see it again.
              </p>
              <div className="flex items-center gap-2 bg-white p-2 rounded border font-mono text-sm break-all">
                <span className="flex-1">{newKeyResult.key}</span>
                <button
                  onClick={handleCopyKey}
                  className="p-1 hover:bg-gray-100 rounded"
                >
                  {copiedKey ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <button
              onClick={() => {
                setNewKeyResult(null);
                setShowModal(false);
              }}
              className="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* Create modal */}
      {showModal && !newKeyResult && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Create API Key</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2"
                  placeholder="e.g., Production API"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2"
                  rows={2}
                  placeholder="Optional description"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Rate Limit (requests/hour)</label>
                <input
                  type="number"
                  value={formData.rateLimit}
                  onChange={(e) => setFormData({ ...formData, rateLimit: parseInt(e.target.value) || 1000 })}
                  className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Expires At (optional)</label>
                <input
                  type="datetime-local"
                  value={formData.expiresAt}
                  onChange={(e) => setFormData({ ...formData, expiresAt: e.target.value })}
                  className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2"
                />
              </div>
            </div>
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={!formData.name || createApiKey.isPending}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {createApiKey.isPending ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* API Keys list */}
      <div className="bg-white rounded-lg border">
        {apiKeys.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <Key className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No API keys created yet</p>
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Key Prefix</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Usage</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Used</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {apiKeys.map((key: ApiKey) => (
                <tr key={key.id}>
                  <td className="px-6 py-4">
                    <div>
                      <div className="font-medium text-gray-900">{key.name}</div>
                      {key.description && (
                        <div className="text-sm text-gray-500">{key.description}</div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <code className="text-sm bg-gray-100 px-2 py-1 rounded">{key.key_prefix}...</code>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        key.is_active
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {key.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {key.usage_count.toLocaleString()} / {key.rate_limit.toLocaleString()}/hr
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {key.last_used_at
                      ? new Date(key.last_used_at).toLocaleDateString()
                      : 'Never'}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleToggleActive(key)}
                        className="p-1 text-gray-400 hover:text-gray-600"
                        title={key.is_active ? 'Deactivate' : 'Activate'}
                      >
                        {key.is_active ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                      <button
                        onClick={() => handleDelete(key.id)}
                        className="p-1 text-red-400 hover:text-red-600"
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function WebhooksTab() {
  const { data: webhooksData, isLoading } = useWebhooks({ includeInactive: true });
  const { data: eventsData } = useWebhookEvents();
  const createWebhook = useCreateWebhook();
  const updateWebhook = useUpdateWebhook();
  const deleteWebhook = useDeleteWebhook();
  const testWebhook = useTestWebhook();
  const [showModal, setShowModal] = useState(false);
  const [_selectedWebhook, _setSelectedWebhook] = useState<WebhookType | null>(null);
  const [showDeliveries, setShowDeliveries] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    url: '',
    secret: '',
    events: [] as string[],
    retryCount: 3,
    timeout: 30,
  });

  const webhooks = webhooksData?.data || [];
  const availableEvents = eventsData?.data || [];

  const handleCreate = async () => {
    try {
      await createWebhook.mutateAsync({
        name: formData.name,
        description: formData.description || undefined,
        url: formData.url,
        secret: formData.secret || undefined,
        events: formData.events,
        retryCount: formData.retryCount,
        timeout: formData.timeout,
      });
      setShowModal(false);
      setFormData({ name: '', description: '', url: '', secret: '', events: [], retryCount: 3, timeout: 30 });
    } catch {
      // Error handling
    }
  };

  const handleToggleActive = async (webhook: WebhookType) => {
    await updateWebhook.mutateAsync({
      id: webhook.id,
      data: { isActive: !webhook.is_active },
    });
  };

  const handleTest = async (id: string) => {
    try {
      await testWebhook.mutateAsync(id);
      alert('Test webhook sent successfully!');
    } catch {
      alert('Failed to send test webhook');
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this webhook?')) {
      await deleteWebhook.mutateAsync(id);
    }
  };

  const toggleEvent = (event: string) => {
    setFormData((prev) => ({
      ...prev,
      events: prev.events.includes(event)
        ? prev.events.filter((e) => e !== event)
        : [...prev.events, event],
    }));
  };

  if (isLoading) {
    return <div className="animate-pulse">Loading webhooks...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-medium text-gray-900">Webhooks</h3>
          <p className="text-sm text-gray-500">
            Send real-time notifications to external systems when events occur
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Plus className="h-4 w-4 mr-2" />
          Create Webhook
        </button>
      </div>

      {/* Create modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Create Webhook</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2"
                  placeholder="e.g., Slack Notifications"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">URL</label>
                <input
                  type="url"
                  value={formData.url}
                  onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                  className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2"
                  placeholder="https://example.com/webhook"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Secret (optional)</label>
                <input
                  type="text"
                  value={formData.secret}
                  onChange={(e) => setFormData({ ...formData, secret: e.target.value })}
                  className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2"
                  placeholder="Used for HMAC signature verification"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Events</label>
                <div className="border rounded-lg p-3 max-h-48 overflow-y-auto">
                  <div className="grid grid-cols-2 gap-2">
                    {availableEvents.map((event: string) => (
                      <label key={event} className="flex items-center text-sm">
                        <input
                          type="checkbox"
                          checked={formData.events.includes(event)}
                          onChange={() => toggleEvent(event)}
                          className="rounded border-gray-300 text-blue-600"
                        />
                        <span className="ml-2">{event}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Retry Count</label>
                  <input
                    type="number"
                    value={formData.retryCount}
                    onChange={(e) => setFormData({ ...formData, retryCount: parseInt(e.target.value) || 3 })}
                    className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2"
                    min={0}
                    max={10}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Timeout (seconds)</label>
                  <input
                    type="number"
                    value={formData.timeout}
                    onChange={(e) => setFormData({ ...formData, timeout: parseInt(e.target.value) || 30 })}
                    className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2"
                    min={1}
                    max={120}
                  />
                </div>
              </div>
            </div>
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={!formData.name || !formData.url || formData.events.length === 0 || createWebhook.isPending}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {createWebhook.isPending ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Deliveries modal */}
      {showDeliveries && (
        <WebhookDeliveriesModal
          webhookId={showDeliveries}
          onClose={() => setShowDeliveries(null)}
        />
      )}

      {/* Webhooks list */}
      <div className="space-y-4">
        {webhooks.length === 0 ? (
          <div className="bg-white rounded-lg border p-8 text-center text-gray-500">
            <Webhook className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No webhooks configured yet</p>
          </div>
        ) : (
          webhooks.map((webhook: WebhookType) => (
            <div key={webhook.id} className="bg-white rounded-lg border p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <h4 className="font-medium text-gray-900">{webhook.name}</h4>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        webhook.is_active
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {webhook.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 mt-1 break-all">{webhook.url}</p>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {webhook.events.map((event) => (
                      <span
                        key={event}
                        className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-800"
                      >
                        {event}
                      </span>
                    ))}
                  </div>
                  <div className="flex items-center gap-4 mt-3 text-sm text-gray-500">
                    <span className="flex items-center gap-1">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      {webhook.success_count} delivered
                    </span>
                    <span className="flex items-center gap-1">
                      <AlertCircle className="h-4 w-4 text-red-500" />
                      {webhook.failure_count} failed
                    </span>
                    {webhook.last_triggered_at && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-4 w-4" />
                        Last: {new Date(webhook.last_triggered_at).toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleTest(webhook.id)}
                    className="p-2 text-gray-400 hover:text-blue-600"
                    title="Send test"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setShowDeliveries(webhook.id)}
                    className="p-2 text-gray-400 hover:text-gray-600"
                    title="View deliveries"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleToggleActive(webhook)}
                    className="p-2 text-gray-400 hover:text-gray-600"
                    title={webhook.is_active ? 'Deactivate' : 'Activate'}
                  >
                    {webhook.is_active ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                  <button
                    onClick={() => handleDelete(webhook.id)}
                    className="p-2 text-red-400 hover:text-red-600"
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function WebhookDeliveriesModal({ webhookId, onClose }: { webhookId: string; onClose: () => void }) {
  const { data: deliveriesData, isLoading } = useWebhookDeliveries(webhookId);
  const deliveries = deliveriesData?.data || [];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-gray-900">Webhook Deliveries</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            &times;
          </button>
        </div>
        {isLoading ? (
          <div className="animate-pulse">Loading deliveries...</div>
        ) : deliveries.length === 0 ? (
          <p className="text-gray-500 text-center py-8">No deliveries yet</p>
        ) : (
          <div className="space-y-3">
            {deliveries.map((delivery: WebhookDelivery) => (
              <div key={delivery.id} className="border rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {delivery.status === 'success' ? (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    ) : delivery.status === 'failed' ? (
                      <AlertCircle className="h-4 w-4 text-red-500" />
                    ) : (
                      <Clock className="h-4 w-4 text-yellow-500" />
                    )}
                    <span className="font-medium">{delivery.event}</span>
                    <span
                      className={`px-2 py-0.5 rounded text-xs ${
                        delivery.status === 'success'
                          ? 'bg-green-100 text-green-800'
                          : delivery.status === 'failed'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-yellow-100 text-yellow-800'
                      }`}
                    >
                      {delivery.status}
                    </span>
                  </div>
                  <span className="text-sm text-gray-500">
                    {new Date(delivery.created_at).toLocaleString()}
                  </span>
                </div>
                {delivery.response_status && (
                  <p className="text-sm text-gray-500 mt-1">
                    Response: {delivery.response_status}
                  </p>
                )}
                {delivery.error_message && (
                  <p className="text-sm text-red-600 mt-1">{delivery.error_message}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function IntegrationsTab() {
  const { data: integrationsData, isLoading } = useIntegrations({ includeInactive: true });
  const { data: typesData } = useIntegrationTypes();
  const createIntegration = useCreateIntegration();
  const updateIntegration = useUpdateIntegration();
  const deleteIntegration = useDeleteIntegration();
  const testIntegration = useTestIntegration();
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    type: '',
    description: '',
    syncEnabled: false,
    syncInterval: 60,
    syncDirection: 'both' as 'inbound' | 'outbound' | 'both',
  });

  const integrations = integrationsData?.data || [];
  const integrationTypes = typesData?.data || [];

  const handleCreate = async () => {
    try {
      await createIntegration.mutateAsync({
        name: formData.name,
        type: formData.type,
        description: formData.description || undefined,
        syncEnabled: formData.syncEnabled,
        syncInterval: formData.syncInterval,
        syncDirection: formData.syncDirection,
      });
      setShowModal(false);
      setFormData({ name: '', type: '', description: '', syncEnabled: false, syncInterval: 60, syncDirection: 'both' });
    } catch {
      // Error handling
    }
  };

  const handleToggleActive = async (integration: Integration) => {
    await updateIntegration.mutateAsync({
      id: integration.id,
      data: { isActive: !integration.is_active },
    });
  };

  const handleTest = async (id: string) => {
    try {
      const result = await testIntegration.mutateAsync(id);
      alert(result.data?.success ? 'Connection successful!' : 'Connection failed');
    } catch {
      alert('Failed to test connection');
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this integration?')) {
      await deleteIntegration.mutateAsync(id);
    }
  };

  if (isLoading) {
    return <div className="animate-pulse">Loading integrations...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-medium text-gray-900">Third-Party Integrations</h3>
          <p className="text-sm text-gray-500">
            Connect with external tools like Slack, Jira, ServiceNow, and more
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Integration
        </button>
      </div>

      {/* Create modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Add Integration</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Integration Type</label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                  className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2"
                >
                  <option value="">Select a type...</option>
                  {integrationTypes.map((type: { id: string; name: string }) => (
                    <option key={type.id} value={type.id}>
                      {type.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2"
                  placeholder="e.g., Production Slack"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2"
                  rows={2}
                />
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="syncEnabled"
                  checked={formData.syncEnabled}
                  onChange={(e) => setFormData({ ...formData, syncEnabled: e.target.checked })}
                  className="rounded border-gray-300"
                />
                <label htmlFor="syncEnabled" className="text-sm font-medium text-gray-700">
                  Enable automatic sync
                </label>
              </div>
              {formData.syncEnabled && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Sync Interval (min)</label>
                    <input
                      type="number"
                      value={formData.syncInterval}
                      onChange={(e) => setFormData({ ...formData, syncInterval: parseInt(e.target.value) || 60 })}
                      className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2"
                      min={1}
                      max={1440}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Direction</label>
                    <select
                      value={formData.syncDirection}
                      onChange={(e) =>
                        setFormData({ ...formData, syncDirection: e.target.value as 'inbound' | 'outbound' | 'both' })
                      }
                      className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2"
                    >
                      <option value="both">Both</option>
                      <option value="inbound">Inbound only</option>
                      <option value="outbound">Outbound only</option>
                    </select>
                  </div>
                </div>
              )}
            </div>
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={!formData.name || !formData.type || createIntegration.isPending}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {createIntegration.isPending ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Integration types grid */}
      {integrations.length === 0 ? (
        <div className="bg-white rounded-lg border p-8 text-center text-gray-500">
          <Plug className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p className="mb-4">No integrations configured yet</p>
          <p className="text-sm">Connect with external tools to enhance your workflow</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {integrations.map((integration: Integration) => {
            const typeInfo = integrationTypes.find((t: { id: string }) => t.id === integration.type);
            return (
              <div key={integration.id} className="bg-white rounded-lg border p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                      <Plug className="h-5 w-5 text-gray-600" />
                    </div>
                    <div>
                      <h4 className="font-medium text-gray-900">{integration.name}</h4>
                      <p className="text-sm text-gray-500">{typeInfo?.name || integration.type}</p>
                    </div>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-medium ${
                      integration.connection_status === 'connected'
                        ? 'bg-green-100 text-green-800'
                        : integration.connection_status === 'failed'
                        ? 'bg-red-100 text-red-800'
                        : 'bg-yellow-100 text-yellow-800'
                    }`}
                  >
                    {integration.connection_status}
                  </span>
                </div>
                {integration.description && (
                  <p className="text-sm text-gray-500 mt-2">{integration.description}</p>
                )}
                <div className="flex items-center gap-4 mt-4 text-sm text-gray-500">
                  {integration.sync_enabled && (
                    <span className="flex items-center gap-1">
                      <RefreshCw className="h-3 w-3" />
                      Every {integration.sync_interval}min
                    </span>
                  )}
                  {integration.last_sync_at && (
                    <span>Last sync: {new Date(integration.last_sync_at).toLocaleString()}</span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-4 pt-4 border-t">
                  <button
                    onClick={() => handleTest(integration.id)}
                    className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    Test Connection
                  </button>
                  <button
                    onClick={() => handleToggleActive(integration)}
                    className="p-1.5 text-gray-400 hover:text-gray-600"
                    title={integration.is_active ? 'Deactivate' : 'Activate'}
                  >
                    {integration.is_active ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                  <button
                    onClick={() => handleDelete(integration.id)}
                    className="p-1.5 text-red-400 hover:text-red-600"
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function IntegrationsPage() {
  const [activeTab, setActiveTab] = useState<'api-keys' | 'webhooks' | 'integrations'>('api-keys');

  const tabs = [
    { id: 'api-keys' as const, name: 'API Keys', icon: Key },
    { id: 'webhooks' as const, name: 'Webhooks', icon: Webhook },
    { id: 'integrations' as const, name: 'Integrations', icon: Plug },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Integrations</h1>
        <p className="text-gray-600">
          Manage API access, webhooks, and third-party integrations
        </p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.name}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab content */}
      <div>
        {activeTab === 'api-keys' && <ApiKeysTab />}
        {activeTab === 'webhooks' && <WebhooksTab />}
        {activeTab === 'integrations' && <IntegrationsTab />}
      </div>
    </div>
  );
}
