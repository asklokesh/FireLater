'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Lock,
  Plus,
  AlertCircle,
  Loader2,
  Save,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';

interface DataSecuritySettings {
  id: string;
  data_residency_region: string;
  encryption_key_id: string | null;
  pii_masking_enabled: boolean;
  pci_tokenization_enabled: boolean;
  created_at: string;
  updated_at: string;
}

interface FieldClassification {
  id: string;
  table_name: string;
  field_name: string;
  classification: 'PII' | 'PCI' | 'NPI' | 'SENSITIVE';
  masking_strategy: 'full' | 'partial' | 'tokenize' | 'hash';
  unmask_permission: string;
  created_at: string;
}

const classificationColors: Record<string, { bg: string; text: string }> = {
  PII: { bg: 'bg-red-100', text: 'text-red-800' },
  PCI: { bg: 'bg-orange-100', text: 'text-orange-800' },
  NPI: { bg: 'bg-yellow-100', text: 'text-yellow-800' },
  SENSITIVE: { bg: 'bg-purple-100', text: 'text-purple-800' },
};

export default function DataSecurityPage() {
  const [settings, setSettings] = useState<DataSecuritySettings | null>(null);
  const [classifications, setClassifications] = useState<FieldClassification[]>([]);
  const [isLoadingSettings, setIsLoadingSettings] = useState(true);
  const [isLoadingClassifications, setIsLoadingClassifications] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  // Form state for new classification
  const [newClassification, setNewClassification] = useState({
    table_name: '',
    field_name: '',
    classification: 'PII' as const,
    masking_strategy: 'full' as const,
    unmask_permission: 'admin:write',
  });

  const loadSettings = useCallback(async () => {
    try {
      setIsLoadingSettings(true);
      setError(null);
      const response = await api.get('/v1/data-security/settings');
      setSettings(response.data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load settings';
      setError(message);
    } finally {
      setIsLoadingSettings(false);
    }
  }, []);

  const loadClassifications = useCallback(async () => {
    try {
      setIsLoadingClassifications(true);
      const response = await api.get('/v1/data-security/classifications');
      setClassifications(response.data.classifications || []);
    } catch (err) {
      console.error('Failed to load classifications:', err);
    } finally {
      setIsLoadingClassifications(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
    loadClassifications();
  }, [loadSettings, loadClassifications]);

  const handleSaveSettings = async () => {
    if (!settings) return;
    try {
      setIsSavingSettings(true);
      setError(null);
      await api.put('/v1/data-security/settings', {
        data_residency_region: settings.data_residency_region,
        encryption_key_id: settings.encryption_key_id,
        pii_masking_enabled: settings.pii_masking_enabled,
        pci_tokenization_enabled: settings.pci_tokenization_enabled,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save settings';
      setError(message);
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleAddClassification = async () => {
    try {
      setError(null);
      await api.post('/v1/data-security/classifications', newClassification);
      setNewClassification({
        table_name: '',
        field_name: '',
        classification: 'PII',
        masking_strategy: 'full',
        unmask_permission: 'admin:write',
      });
      setShowAddModal(false);
      await loadClassifications();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to add classification';
      setError(message);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (isLoadingSettings) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Error Alert */}
      {error && (
        <div className="flex items-center gap-2 p-4 text-sm text-red-800 bg-red-100 rounded-md">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            className="ml-auto text-red-600 hover:text-red-800 font-medium"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Lock className="h-6 w-6 text-gray-900" />
            <h1 className="text-2xl font-bold text-gray-900">Data Security</h1>
          </div>
          <p className="text-sm text-gray-500">
            Manage PII masking, PCI tokenization, and data residency controls
          </p>
        </div>
        <Button onClick={handleSaveSettings} isLoading={isSavingSettings}>
          <Save className="h-4 w-4 mr-2" />
          Save Settings
        </Button>
      </div>

      {/* Section 1: Security Settings */}
      {settings && (
        <div className="bg-white rounded-lg shadow p-6 space-y-6">
          <h2 className="text-lg font-semibold text-gray-900">Security Settings</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              id="residencyRegion"
              type="text"
              label="Data Residency Region"
              placeholder="e.g., us-east-1"
              value={settings.data_residency_region}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  data_residency_region: e.target.value,
                })
              }
            />
            <Input
              id="encryptionKeyId"
              type="text"
              label="Encryption Key ID (Optional)"
              placeholder="Leave empty if not configured"
              value={settings.encryption_key_id || ''}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  encryption_key_id: e.target.value || null,
                })
              }
            />
          </div>

          <div className="space-y-3">
            {/* PII Masking Toggle */}
            <div className="flex items-center justify-between py-3 border-b border-gray-200">
              <div>
                <p className="font-medium text-gray-900">PII Masking Enabled</p>
                <p className="text-sm text-gray-500">
                  Automatically mask personally identifiable information
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={settings.pii_masking_enabled}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      pii_masking_enabled: e.target.checked,
                    })
                  }
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>

            {/* PCI Tokenization Toggle */}
            <div className="flex items-center justify-between py-3 border-b border-gray-200">
              <div>
                <p className="font-medium text-gray-900">PCI Tokenization Enabled</p>
                <p className="text-sm text-gray-500">
                  Replace payment card data with secure tokens
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={settings.pci_tokenization_enabled}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      pci_tokenization_enabled: e.target.checked,
                    })
                  }
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>
          </div>
        </div>
      )}

      {/* Section 2: Field Classifications */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Field Classifications</h2>
          <Button
            onClick={() => setShowAddModal(true)}
            variant="primary"
            size="sm"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Classification
          </Button>
        </div>

        {isLoadingClassifications ? (
          <div className="flex items-center justify-center p-12">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          </div>
        ) : classifications.length === 0 ? (
          <div className="text-center py-12 px-6">
            <Lock className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No classifications yet</h3>
            <p className="text-gray-500 mb-4">Add your first field classification to get started</p>
            <Button
              onClick={() => setShowAddModal(true)}
              variant="outline"
              size="sm"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Classification
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Table Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Field Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Classification
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Masking Strategy
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Unmask Permission
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Created At
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {classifications.map((classification) => {
                  const colorConfig =
                    classificationColors[classification.classification] ||
                    classificationColors.SENSITIVE;
                  return (
                    <tr key={classification.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {classification.table_name}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-700">
                          {classification.field_name}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colorConfig.bg} ${colorConfig.text}`}
                        >
                          {classification.classification}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-700 capitalize">
                          {classification.masking_strategy}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-700 font-mono text-xs bg-gray-50 px-2 py-1 rounded">
                          {classification.unmask_permission}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-500">
                          {formatDate(classification.created_at)}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Classification Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Add Field Classification</h3>
            </div>
            <div className="p-6 space-y-4">
              <Input
                id="tableName"
                type="text"
                label="Table Name"
                placeholder="e.g., users"
                value={newClassification.table_name}
                onChange={(e) =>
                  setNewClassification({
                    ...newClassification,
                    table_name: e.target.value,
                  })
                }
              />
              <Input
                id="fieldName"
                type="text"
                label="Field Name"
                placeholder="e.g., ssn"
                value={newClassification.field_name}
                onChange={(e) =>
                  setNewClassification({
                    ...newClassification,
                    field_name: e.target.value,
                  })
                }
              />
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Classification
                </label>
                <select
                  value={newClassification.classification}
                  onChange={(e) =>
                    setNewClassification({
                      ...newClassification,
                      classification: e.target.value as 'PII' | 'PCI' | 'NPI' | 'SENSITIVE',
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="PII">PII</option>
                  <option value="PCI">PCI</option>
                  <option value="NPI">NPI</option>
                  <option value="SENSITIVE">SENSITIVE</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Masking Strategy
                </label>
                <select
                  value={newClassification.masking_strategy}
                  onChange={(e) =>
                    setNewClassification({
                      ...newClassification,
                      masking_strategy: e.target.value as 'full' | 'partial' | 'tokenize' | 'hash',
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="full">Full</option>
                  <option value="partial">Partial</option>
                  <option value="tokenize">Tokenize</option>
                  <option value="hash">Hash</option>
                </select>
              </div>
              <Input
                id="unmaskPermission"
                type="text"
                label="Unmask Permission"
                placeholder="e.g., admin:write"
                value={newClassification.unmask_permission}
                onChange={(e) =>
                  setNewClassification({
                    ...newClassification,
                    unmask_permission: e.target.value,
                  })
                }
              />
            </div>
            <div className="p-6 border-t border-gray-200 flex gap-3 justify-end">
              <Button
                onClick={() => setShowAddModal(false)}
                variant="outline"
                size="sm"
              >
                Cancel
              </Button>
              <Button
                onClick={handleAddClassification}
                variant="primary"
                size="sm"
              >
                Add
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
