'use client';

import { useState } from 'react';
import {
  Plus,
  Search,
  Filter,
  HardDrive,
  Monitor,
  Laptop,
  Smartphone,
  Server,
  Database,
  Cloud,
  Network,
  MoreVertical,
  Edit2,
  Trash2,
  Link,
  ChevronDown,
  AlertTriangle,
  Clock,
  DollarSign,
  X,
  Calendar,
} from 'lucide-react';
import {
  useAssets,
  useCreateAsset,
  useUpdateAsset,
  useDeleteAsset,
  useAssetStats,
  useUsers,
  Asset,
  AssetType,
  AssetCategory,
  AssetStatus,
} from '@/hooks/useApi';

const assetTypeOptions: { value: AssetType; label: string }[] = [
  { value: 'hardware', label: 'Hardware' },
  { value: 'software', label: 'Software' },
  { value: 'network', label: 'Network' },
  { value: 'cloud', label: 'Cloud' },
  { value: 'virtual', label: 'Virtual' },
  { value: 'other', label: 'Other' },
];

const assetCategoryOptions: { value: AssetCategory; label: string }[] = [
  { value: 'server', label: 'Server' },
  { value: 'workstation', label: 'Workstation' },
  { value: 'laptop', label: 'Laptop' },
  { value: 'mobile', label: 'Mobile Device' },
  { value: 'printer', label: 'Printer' },
  { value: 'network_device', label: 'Network Device' },
  { value: 'storage', label: 'Storage' },
  { value: 'software_license', label: 'Software License' },
  { value: 'saas_subscription', label: 'SaaS Subscription' },
  { value: 'virtual_machine', label: 'Virtual Machine' },
  { value: 'container', label: 'Container' },
  { value: 'database', label: 'Database' },
  { value: 'application', label: 'Application' },
  { value: 'other', label: 'Other' },
];

const assetStatusOptions: { value: AssetStatus; label: string; color: string }[] = [
  { value: 'active', label: 'Active', color: 'bg-green-100 text-green-800' },
  { value: 'inactive', label: 'Inactive', color: 'bg-gray-100 text-gray-800' },
  { value: 'maintenance', label: 'Maintenance', color: 'bg-yellow-100 text-yellow-800' },
  { value: 'retired', label: 'Retired', color: 'bg-red-100 text-red-800' },
  { value: 'disposed', label: 'Disposed', color: 'bg-red-100 text-red-800' },
  { value: 'ordered', label: 'Ordered', color: 'bg-blue-100 text-blue-800' },
  { value: 'in_storage', label: 'In Storage', color: 'bg-purple-100 text-purple-800' },
];

function AssetIcon({ assetType, category, className }: { assetType: AssetType; category: AssetCategory; className?: string }) {
  const iconClassName = className || 'h-5 w-5 text-gray-600';
  if (category === 'server') return <Server className={iconClassName} />;
  if (category === 'laptop') return <Laptop className={iconClassName} />;
  if (category === 'workstation') return <Monitor className={iconClassName} />;
  if (category === 'mobile') return <Smartphone className={iconClassName} />;
  if (category === 'database') return <Database className={iconClassName} />;
  if (category === 'network_device') return <Network className={iconClassName} />;
  if (assetType === 'cloud') return <Cloud className={iconClassName} />;
  return <HardDrive className={iconClassName} />;
}

function getStatusBadge(status: AssetStatus) {
  const option = assetStatusOptions.find(o => o.value === status);
  return option || { label: status, color: 'bg-gray-100 text-gray-800' };
}

function formatCurrency(amount: number | undefined | null) {
  if (amount == null) return '-';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

function formatDate(dateStr: string | undefined | null) {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString();
}

export default function AssetsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<AssetType | ''>('');
  const [categoryFilter, setCategoryFilter] = useState<AssetCategory | ''>('');
  const [statusFilter, setStatusFilter] = useState<AssetStatus | ''>('');
  const [showFilters, setShowFilters] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);

  const { data: assetsData, isLoading } = useAssets({
    search: searchQuery || undefined,
    assetType: typeFilter || undefined,
    category: categoryFilter || undefined,
    status: statusFilter || undefined,
  });

  const { data: statsData } = useAssetStats();
  const { data: usersData } = useUsers();

  const createAssetMutation = useCreateAsset();
  const updateAssetMutation = useUpdateAsset();
  const deleteAssetMutation = useDeleteAsset();

  const assets = assetsData?.data || [];
  const stats = statsData?.data;
  const users = usersData?.data || [];

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this asset?')) {
      await deleteAssetMutation.mutateAsync(id);
      setActiveMenu(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Asset Management</h1>
          <p className="text-sm text-gray-500 mt-1">Manage hardware, software, and infrastructure assets</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="h-5 w-5 mr-2" />
          Add Asset
        </button>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center">
              <div className="p-3 bg-blue-100 rounded-lg">
                <HardDrive className="h-6 w-6 text-blue-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm text-gray-500">Total Assets</p>
                <p className="text-2xl font-semibold">{stats.total || 0}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center">
              <div className="p-3 bg-green-100 rounded-lg">
                <Server className="h-6 w-6 text-green-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm text-gray-500">Active</p>
                <p className="text-2xl font-semibold">{stats.by_status?.active || 0}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center">
              <div className="p-3 bg-yellow-100 rounded-lg">
                <AlertTriangle className="h-6 w-6 text-yellow-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm text-gray-500">Warranty Expiring</p>
                <p className="text-2xl font-semibold">{stats.warranty_expiring_soon || 0}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center">
              <div className="p-3 bg-purple-100 rounded-lg">
                <Clock className="h-6 w-6 text-purple-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm text-gray-500">License Expiring</p>
                <p className="text-2xl font-semibold">{stats.license_expiring_soon || 0}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Search and Filters */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search assets by name, tag, serial number..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`inline-flex items-center px-4 py-2 border rounded-lg transition-colors ${
              showFilters ? 'bg-blue-50 border-blue-500 text-blue-700' : 'border-gray-300 hover:bg-gray-50'
            }`}
          >
            <Filter className="h-5 w-5 mr-2" />
            Filters
            <ChevronDown className={`h-4 w-4 ml-2 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {showFilters && (
          <div className="mt-4 pt-4 border-t grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as AssetType | '')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Types</option>
                {assetTypeOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value as AssetCategory | '')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Categories</option>
                {assetCategoryOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as AssetStatus | '')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Statuses</option>
                {assetStatusOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Assets Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-500">Loading assets...</div>
        ) : assets.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <HardDrive className="h-12 w-12 mx-auto mb-4 text-gray-300" />
            <p className="text-lg font-medium">No assets found</p>
            <p className="text-sm mt-1">Create your first asset to start tracking your inventory.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Asset</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type / Category</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Assigned To</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Location</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {assets.map((asset: Asset) => {
                  const statusBadge = getStatusBadge(asset.status);
                  return (
                    <tr
                      key={asset.id}
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => setSelectedAsset(asset)}
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="p-2 bg-gray-100 rounded-lg">
                            <AssetIcon assetType={asset.asset_type} category={asset.category} />
                          </div>
                          <div className="ml-3">
                            <p className="text-sm font-medium text-gray-900">{asset.name}</p>
                            <p className="text-xs text-gray-500">{asset.asset_tag}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <p className="text-sm text-gray-900 capitalize">{asset.asset_type}</p>
                        <p className="text-xs text-gray-500 capitalize">{asset.category.replace(/_/g, ' ')}</p>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${statusBadge.color}`}>
                          {statusBadge.label}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <p className="text-sm text-gray-900">{asset.assigned_to_name || '-'}</p>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <p className="text-sm text-gray-900">{asset.location || '-'}</p>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="relative">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveMenu(activeMenu === asset.id ? null : asset.id);
                            }}
                            className="p-1 hover:bg-gray-100 rounded"
                          >
                            <MoreVertical className="h-5 w-5 text-gray-400" />
                          </button>
                          {activeMenu === asset.id && (
                            <div className="absolute right-0 mt-1 w-48 bg-white rounded-lg shadow-lg border z-10">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingAsset(asset);
                                  setActiveMenu(null);
                                }}
                                className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center"
                              >
                                <Edit2 className="h-4 w-4 mr-2" />
                                Edit
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedAsset(asset);
                                  setActiveMenu(null);
                                }}
                                className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center"
                              >
                                <Link className="h-4 w-4 mr-2" />
                                View Details
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDelete(asset.id);
                                }}
                                className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center"
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete
                              </button>
                            </div>
                          )}
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

      {/* Create/Edit Modal */}
      {(showCreateModal || editingAsset) && (
        <AssetModal
          asset={editingAsset}
          users={users}
          onClose={() => {
            setShowCreateModal(false);
            setEditingAsset(null);
          }}
          onSave={async (data) => {
            if (editingAsset) {
              await updateAssetMutation.mutateAsync({ id: editingAsset.id, data });
            } else {
              await createAssetMutation.mutateAsync(data as Parameters<typeof createAssetMutation.mutateAsync>[0]);
            }
            setShowCreateModal(false);
            setEditingAsset(null);
          }}
          isLoading={createAssetMutation.isPending || updateAssetMutation.isPending}
        />
      )}

      {/* Asset Detail Drawer */}
      {selectedAsset && (
        <AssetDetailDrawer
          asset={selectedAsset}
          onClose={() => setSelectedAsset(null)}
          onEdit={() => {
            setEditingAsset(selectedAsset);
            setSelectedAsset(null);
          }}
        />
      )}
    </div>
  );
}

// Asset Modal Component
interface AssetModalProps {
  asset: Asset | null;
  users: { id: string; name: string }[];
  onClose: () => void;
  onSave: (data: Record<string, unknown>) => Promise<void>;
  isLoading: boolean;
}

function AssetModal({ asset, users, onClose, onSave, isLoading }: AssetModalProps) {
  const [formData, setFormData] = useState({
    name: asset?.name || '',
    description: asset?.description || '',
    assetType: asset?.asset_type || 'hardware' as AssetType,
    category: asset?.category || 'other' as AssetCategory,
    status: asset?.status || 'active' as AssetStatus,
    location: asset?.location || '',
    department: asset?.department || '',
    ownerId: asset?.owner_id || '',
    assignedToId: asset?.assigned_to_id || '',
    manufacturer: asset?.manufacturer || '',
    model: asset?.model || '',
    serialNumber: asset?.serial_number || '',
    version: asset?.version || '',
    licenseType: asset?.license_type || '',
    licenseCount: asset?.license_count || '',
    licenseExpiry: asset?.license_expiry?.split('T')[0] || '',
    purchaseDate: asset?.purchase_date?.split('T')[0] || '',
    purchaseCost: asset?.purchase_cost || '',
    warrantyExpiry: asset?.warranty_expiry?.split('T')[0] || '',
    vendor: asset?.vendor || '',
    poNumber: asset?.po_number || '',
    ipAddress: asset?.ip_address || '',
    macAddress: asset?.mac_address || '',
    hostname: asset?.hostname || '',
  });

  const [activeTab, setActiveTab] = useState<'general' | 'hardware' | 'software' | 'network' | 'financial'>('general');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const data: Record<string, unknown> = {
      name: formData.name,
      assetType: formData.assetType,
      category: formData.category,
    };

    if (formData.description) data.description = formData.description;
    if (formData.status) data.status = formData.status;
    if (formData.location) data.location = formData.location;
    if (formData.department) data.department = formData.department;
    if (formData.ownerId) data.ownerId = formData.ownerId;
    if (formData.assignedToId) data.assignedToId = formData.assignedToId;
    if (formData.manufacturer) data.manufacturer = formData.manufacturer;
    if (formData.model) data.model = formData.model;
    if (formData.serialNumber) data.serialNumber = formData.serialNumber;
    if (formData.version) data.version = formData.version;
    if (formData.licenseType) data.licenseType = formData.licenseType;
    if (formData.licenseCount) data.licenseCount = parseInt(formData.licenseCount as string);
    if (formData.licenseExpiry) data.licenseExpiry = formData.licenseExpiry;
    if (formData.purchaseDate) data.purchaseDate = formData.purchaseDate;
    if (formData.purchaseCost) data.purchaseCost = parseFloat(formData.purchaseCost as string);
    if (formData.warrantyExpiry) data.warrantyExpiry = formData.warrantyExpiry;
    if (formData.vendor) data.vendor = formData.vendor;
    if (formData.poNumber) data.poNumber = formData.poNumber;
    if (formData.ipAddress) data.ipAddress = formData.ipAddress;
    if (formData.macAddress) data.macAddress = formData.macAddress;
    if (formData.hostname) data.hostname = formData.hostname;

    await onSave(data);
  };

  const tabs = [
    { id: 'general', label: 'General' },
    { id: 'hardware', label: 'Hardware' },
    { id: 'software', label: 'Software' },
    { id: 'network', label: 'Network' },
    { id: 'financial', label: 'Financial' },
  ] as const;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4">
        <div className="fixed inset-0 bg-black bg-opacity-50" onClick={onClose} />
        <div className="relative bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b">
            <h2 className="text-lg font-semibold">
              {asset ? 'Edit Asset' : 'Create New Asset'}
            </h2>
            <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="border-b">
            <nav className="flex px-4">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-4 py-3 text-sm font-medium border-b-2 -mb-px ${
                    activeTab === tab.id
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="p-4 max-h-[60vh] overflow-y-auto">
              {activeTab === 'general' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                    <input
                      type="text"
                      required
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                    <textarea
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Type *</label>
                      <select
                        required
                        value={formData.assetType}
                        onChange={(e) => setFormData({ ...formData, assetType: e.target.value as AssetType })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      >
                        {assetTypeOptions.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Category *</label>
                      <select
                        required
                        value={formData.category}
                        onChange={(e) => setFormData({ ...formData, category: e.target.value as AssetCategory })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      >
                        {assetCategoryOptions.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                      <select
                        value={formData.status}
                        onChange={(e) => setFormData({ ...formData, status: e.target.value as AssetStatus })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      >
                        {assetStatusOptions.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
                      <input
                        type="text"
                        value={formData.department}
                        onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Owner</label>
                      <select
                        value={formData.ownerId}
                        onChange={(e) => setFormData({ ...formData, ownerId: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">No owner</option>
                        {users.map((user) => (
                          <option key={user.id} value={user.id}>{user.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Assigned To</label>
                      <select
                        value={formData.assignedToId}
                        onChange={(e) => setFormData({ ...formData, assignedToId: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Unassigned</option>
                        {users.map((user) => (
                          <option key={user.id} value={user.id}>{user.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
                    <input
                      type="text"
                      value={formData.location}
                      onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                      placeholder="e.g., Building A, Room 101"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              )}

              {activeTab === 'hardware' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Manufacturer</label>
                      <input
                        type="text"
                        value={formData.manufacturer}
                        onChange={(e) => setFormData({ ...formData, manufacturer: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Model</label>
                      <input
                        type="text"
                        value={formData.model}
                        onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Serial Number</label>
                    <input
                      type="text"
                      value={formData.serialNumber}
                      onChange={(e) => setFormData({ ...formData, serialNumber: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Warranty Expiry</label>
                    <input
                      type="date"
                      value={formData.warrantyExpiry}
                      onChange={(e) => setFormData({ ...formData, warrantyExpiry: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              )}

              {activeTab === 'software' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Version</label>
                      <input
                        type="text"
                        value={formData.version}
                        onChange={(e) => setFormData({ ...formData, version: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">License Type</label>
                      <input
                        type="text"
                        value={formData.licenseType}
                        onChange={(e) => setFormData({ ...formData, licenseType: e.target.value })}
                        placeholder="e.g., Perpetual, Subscription"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">License Count</label>
                      <input
                        type="number"
                        value={formData.licenseCount}
                        onChange={(e) => setFormData({ ...formData, licenseCount: e.target.value })}
                        min="0"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">License Expiry</label>
                      <input
                        type="date"
                        value={formData.licenseExpiry}
                        onChange={(e) => setFormData({ ...formData, licenseExpiry: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'network' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">IP Address</label>
                    <input
                      type="text"
                      value={formData.ipAddress}
                      onChange={(e) => setFormData({ ...formData, ipAddress: e.target.value })}
                      placeholder="e.g., 192.168.1.100"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">MAC Address</label>
                    <input
                      type="text"
                      value={formData.macAddress}
                      onChange={(e) => setFormData({ ...formData, macAddress: e.target.value })}
                      placeholder="e.g., 00:1A:2B:3C:4D:5E"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Hostname</label>
                    <input
                      type="text"
                      value={formData.hostname}
                      onChange={(e) => setFormData({ ...formData, hostname: e.target.value })}
                      placeholder="e.g., server-web-01"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              )}

              {activeTab === 'financial' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Vendor</label>
                      <input
                        type="text"
                        value={formData.vendor}
                        onChange={(e) => setFormData({ ...formData, vendor: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">PO Number</label>
                      <input
                        type="text"
                        value={formData.poNumber}
                        onChange={(e) => setFormData({ ...formData, poNumber: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Purchase Date</label>
                      <input
                        type="date"
                        value={formData.purchaseDate}
                        onChange={(e) => setFormData({ ...formData, purchaseDate: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Purchase Cost</label>
                      <div className="relative">
                        <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input
                          type="number"
                          step="0.01"
                          value={formData.purchaseCost}
                          onChange={(e) => setFormData({ ...formData, purchaseCost: e.target.value })}
                          className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 p-4 border-t bg-gray-50">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {isLoading ? 'Saving...' : asset ? 'Save Changes' : 'Create Asset'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

// Asset Detail Drawer Component
interface AssetDetailDrawerProps {
  asset: Asset;
  onClose: () => void;
  onEdit: () => void;
}

function AssetDetailDrawer({ asset, onClose, onEdit }: AssetDetailDrawerProps) {
  const statusBadge = getStatusBadge(asset.status);

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      <div className="absolute inset-0 bg-black bg-opacity-50" onClick={onClose} />
      <div className="absolute inset-y-0 right-0 max-w-lg w-full bg-white shadow-xl">
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gray-100 rounded-lg">
                <AssetIcon assetType={asset.asset_type} category={asset.category} className="h-6 w-6 text-gray-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">{asset.name}</h2>
                <p className="text-sm text-gray-500">{asset.asset_tag}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={onEdit}
                className="p-2 hover:bg-gray-100 rounded-lg"
                title="Edit"
              >
                <Edit2 className="h-5 w-5 text-gray-500" />
              </button>
              <button
                onClick={onClose}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            {/* Status & Type */}
            <div className="flex items-center gap-3">
              <span className={`inline-flex px-3 py-1 text-sm font-medium rounded-full ${statusBadge.color}`}>
                {statusBadge.label}
              </span>
              <span className="text-sm text-gray-500 capitalize">
                {asset.asset_type} / {asset.category.replace(/_/g, ' ')}
              </span>
            </div>

            {/* Description */}
            {asset.description && (
              <div>
                <h3 className="text-sm font-medium text-gray-500 mb-1">Description</h3>
                <p className="text-gray-900">{asset.description}</p>
              </div>
            )}

            {/* Ownership & Location */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h3 className="text-sm font-medium text-gray-500 mb-1">Owner</h3>
                <p className="text-gray-900">{asset.owner_name || '-'}</p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-500 mb-1">Assigned To</h3>
                <p className="text-gray-900">{asset.assigned_to_name || '-'}</p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-500 mb-1">Location</h3>
                <p className="text-gray-900">{asset.location || '-'}</p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-500 mb-1">Department</h3>
                <p className="text-gray-900">{asset.department || '-'}</p>
              </div>
            </div>

            {/* Hardware Details */}
            {(asset.manufacturer || asset.model || asset.serial_number) && (
              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Hardware Details</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-500">Manufacturer</p>
                    <p className="text-gray-900">{asset.manufacturer || '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Model</p>
                    <p className="text-gray-900">{asset.model || '-'}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-sm text-gray-500">Serial Number</p>
                    <p className="text-gray-900 font-mono">{asset.serial_number || '-'}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Network Details */}
            {(asset.ip_address || asset.mac_address || asset.hostname) && (
              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Network Details</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-500">IP Address</p>
                    <p className="text-gray-900 font-mono">{asset.ip_address || '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Hostname</p>
                    <p className="text-gray-900 font-mono">{asset.hostname || '-'}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-sm text-gray-500">MAC Address</p>
                    <p className="text-gray-900 font-mono">{asset.mac_address || '-'}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Software Details */}
            {(asset.version || asset.license_type) && (
              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Software Details</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-500">Version</p>
                    <p className="text-gray-900">{asset.version || '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">License Type</p>
                    <p className="text-gray-900">{asset.license_type || '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">License Count</p>
                    <p className="text-gray-900">{asset.license_count || '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">License Expiry</p>
                    <div className="flex items-center gap-1">
                      <Calendar className="h-4 w-4 text-gray-400" />
                      <p className="text-gray-900">{formatDate(asset.license_expiry)}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Financial Details */}
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Financial Details</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500">Vendor</p>
                  <p className="text-gray-900">{asset.vendor || '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">PO Number</p>
                  <p className="text-gray-900">{asset.po_number || '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Purchase Date</p>
                  <p className="text-gray-900">{formatDate(asset.purchase_date)}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Purchase Cost</p>
                  <p className="text-gray-900 font-medium">{formatCurrency(asset.purchase_cost)}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Warranty Expiry</p>
                  <div className="flex items-center gap-1">
                    <Calendar className="h-4 w-4 text-gray-400" />
                    <p className="text-gray-900">{formatDate(asset.warranty_expiry)}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Timestamps */}
            <div className="pt-4 border-t text-sm text-gray-500">
              <p>Created: {new Date(asset.created_at).toLocaleString()}</p>
              <p>Updated: {new Date(asset.updated_at).toLocaleString()}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
