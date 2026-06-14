'use client';

import { useState, useEffect } from 'react';
import { Lock, Plus, Trash2, Loader2, AlertCircle, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
  // State for settings
  const [settings, setSettings] = useState<DataSecuritySettings | null>(null);
  const [formData, setFormData] = useState({
    data_residency_region: '',
    encryption_key_id: '',
    pii_masking_enabled: false,
    pci_tokenization_enabled: false,
  });

  // State for classifications
  const [classifications, setClassifications] = useState<FieldClassification[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newClassification, setNewClassification] = useState({
    table_name: '',
    field_name: '',
    classification: 'PII' as FieldClassification['classification'],
    masking_strategy: 'full' as FieldClassification['masking_strategy'],
    unmask_permission: 'admin:write',
  });

  // State for loading/errors
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isAddingClassification, setIsAddingClassification] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Load settings and classifications
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const [settingsRes, classificationsRes] = await Promise.all([
        api.get('/v1/data-security/settings'),
        api.get('/v1/data-security/classifications'),
      ]);

      setSettings(settingsRes.data);
      setFormData({
        data_residency_region: settingsRes.data.data_residency_region || '',
        encryption_key_id: settingsRes.data.encryption_key_id || '',
        pii_masking_enabled: settingsRes.data.pii_masking_enabled || false,
        pci_tokenization_enabled: settingsRes.data.pci_tokenization_enabled || false,
      });

      setClassifications(classificationsRes.data.classifications || []);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load data security settings';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveSettings = async () => {
    try {
      setIsSaving(true);
      setError(null);

      const response = await api.put('/v1/data-security/settings', formData);
      setSettings(response.data);
      setSuccessMessage('Settings saved successfully');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save settings';
      setError(message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddClassification = async () => {
    try {
      setIsAddingClassification(true);
      setError(null);

      await api.post('/v1/data-security/classifications', newClassification);

      setSuccessMessage('Classification added successfully');
      setTimeout(() => setSuccessMessage(null), 3000);

      // Reset form
      setNewClassification({
        table_name: '',
        field_name: '',
        classification: 'PII',
        masking_strategy: 'full',
        unmask_permission: 'admin:write',
      });
      setShowAddModal(false);

      // Reload classifications
      await loadData();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to add classification';
      setError(message);
    } finally {
      setIsAddingClassification(false);
    }
  };

  const handleDeleteClassification = async (id: string) => {
    if (!confirm('Are you sure you want to delete this classification?')) return;

    try {
      setError(null);
      await api.delete(`/v1/data-security/classifications/${id}`);

      setSuccessMessage('Classification deleted successfully');
      setTimeout(() => setSuccessMessage(null), 3000);

      await loadData();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete classification';
      setError(message);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
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
        <div className="flex items-start gap-3 p-4 text-sm text-red-800 bg-red-100 rounded-md">
          <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
          <div className="flex-1">{error}</div>
          <button
            onClick={() => setError(null)}
            className="text-red-600 hover:text-red-800 font-medium"
          >
            Dismiss
          </button>
        </div>
      )}

      {successMessage && (
        <div className="flex items-start gap-3 p-4 text-sm text-green-800 bg-green-100 rounded-md">
          <CheckCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
          <div className="flex-1">{successMessage}</div>
        </div>
      )}

      <div>
        <div className="flex items-center gap-3">
          <Lock className="h-8 w-8 text-blue-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Data Security</h1>
            <p className="mt-1 text-sm text-gray-500">
              Manage PII masking, PCI tokenization, and data residency controls
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Security Settings</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Data Residency Region
            </label>
            <input
              type="text"
              placeholder="e.g., us-east-1"
              value={formData.data_residency_region}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  data_residency_region: e.target.value,
                }))
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Encryption Key ID <span className="text-gray-500">(optional)</span>
            </label>
            <input
              type="text"
              placeholder="e.g., key-12345"
              value={formData.encryption_key_id}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  encryption_key_id: e.target.value,
                }))
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          <div className="flex items-center justify-between p-3 border border-gray-200 rounded-md">
            <label className="text-sm font-medium text-gray-700">PII Masking Enabled</label>
            <button
              onClick={() =>
                setFormData((prev) => ({
                  ...prev,
                  pii_masking_enabled: !prev.pii_masking_enabled,
                }))
              }
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                formData.pii_masking_enabled ? 'bg-blue-600' : 'bg-gray-300'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  formData.pii_masking_enabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between p-3 border border-gray-200 rounded-md">
            <label className="text-sm font-medium text-gray-700">PCI Tokenization Enabled</label>
            <button
              onClick={() =>
                setFormData((prev) => ({
                  ...prev,
                  pci_tokenization_enabled: !prev.pci_tokenization_enabled,
                }))
              }
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                formData.pci_tokenization_enabled ? 'bg-blue-600' : 'bg-gray-300'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  formData.pci_tokenization_enabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <Button onClick={handleSaveSettings} disabled={isSaving}>
            {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {isSaving ? 'Saving...' : 'Save Settings'}
          </Button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Field Classifications</h2>
          <Button onClick={() => setShowAddModal(true)} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Add Classification
          </Button>
        </div>

        <div className="overflow-x-auto">
          {classifications.length > 0 ? (
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
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {classifications.map((classification) => {
                  const colors =
                    classificationColors[classification.classification] ||
                    classificationColors.SENSITIVE;
                  return (
                    <tr key={classification.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {classification.table_name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {classification.field_name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colors.bg} ${colors.text}`}
                        >
                          {classification.classification}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium bg-gray-100 text-gray-800">
                          {classification.masking_strategy}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {classification.unmask_permission}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatDate(classification.created_at)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <button
                          onClick={() => handleDeleteClassification(classification.id)}
                          className="text-red-600 hover:text-red-900"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="text-center py-12">
              <Lock className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No classifications yet</h3>
              <p className="text-gray-500 mb-4">
                Add field classifications to control data masking and protection
              </p>
              <Button onClick={() => setShowAddModal(true)} variant="outline" size="sm">
                Add First Classification
              </Button>
            </div>
          )}
        </div>
      </div>

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-lg shadow-lg max-w-md w-full mx-4 p-6 space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">Add Field Classification</h3>

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Table Name
                </label>
                <input
                  type="text"
                  placeholder="e.g., users"
                  value={newClassification.table_name}
                  onChange={(e) =>
                    setNewClassification((prev) => ({
                      ...prev,
                      table_name: e.target.value,
                    }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Field Name
                </label>
                <input
                  type="text"
                  placeholder="e.g., email"
                  value={newClassification.field_name}
                  onChange={(e) =>
                    setNewClassification((prev) => ({
                      ...prev,
                      field_name: e.target.value,
                    }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Classification
                </label>
                <select
                  value={newClassification.classification}
                  onChange={(e) =>
                    setNewClassification((prev) => ({
                      ...prev,
                      classification: e.target.value as FieldClassification['classification'],
                    }))
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
                    setNewClassification((prev) => ({
                      ...prev,
                      masking_strategy: e.target.value as FieldClassification['masking_strategy'],
                    }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="full">Full Masking</option>
                  <option value="partial">Partial Masking</option>
                  <option value="tokenize">Tokenization</option>
                  <option value="hash">Hashing</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Unmask Permission
                </label>
                <input
                  type="text"
                  placeholder="e.g., admin:write"
                  value={newClassification.unmask_permission}
                  onChange={(e) =>
                    setNewClassification((prev) => ({
                      ...prev,
                      unmask_permission: e.target.value,
                    }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => setShowAddModal(false)}
                disabled={isAddingClassification}
              >
                Cancel
              </Button>
              <Button onClick={handleAddClassification} disabled={isAddingClassification}>
                {isAddingClassification && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {isAddingClassification ? 'Adding...' : 'Add Classification'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
