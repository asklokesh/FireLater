'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Server,
  Cloud,
  Database,
  HardDrive,
  Network,
  Shield,
  Globe,
  Clock,
  DollarSign,
  Tag,
  Link as LinkIcon,
  Unlink,
  Loader2,
  AlertCircle,
  CheckCircle,
  XCircle,
  Activity,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cloudApi, applicationsApi } from '@/lib/api';

interface ResourceData {
  id: string;
  cloud_account_id: string;
  resource_id: string;
  resource_type: string;
  name: string;
  region: string;
  status: string;
  tags: Record<string, string>;
  metadata: Record<string, unknown>;
  application_id: string | null;
  application_name: string | null;
  environment_id: string | null;
  environment_name: string | null;
  account_name: string;
  provider: string;
  monthly_cost: number | null;
  last_synced_at: string;
  created_at: string;
  updated_at: string;
}

interface ApplicationData {
  id: string;
  name: string;
  short_name: string;
}

interface _MetricData {
  id: string;
  metric_name: string;
  value: number;
  unit: string;
  timestamp: string;
}

const resourceTypeIcons: Record<string, typeof Server> = {
  ec2: Server,
  rds: Database,
  s3: HardDrive,
  lambda: Cloud,
  vpc: Network,
  elb: Globe,
  sg: Shield,
  default: Server,
};

const providerColors: Record<string, { bg: string; text: string }> = {
  aws: { bg: 'bg-orange-100', text: 'text-orange-800' },
  azure: { bg: 'bg-blue-100', text: 'text-blue-800' },
  gcp: { bg: 'bg-red-100', text: 'text-red-800' },
};

const statusColors: Record<string, { bg: string; text: string; icon: typeof CheckCircle }> = {
  running: { bg: 'bg-green-100', text: 'text-green-800', icon: CheckCircle },
  stopped: { bg: 'bg-gray-100', text: 'text-gray-800', icon: XCircle },
  pending: { bg: 'bg-yellow-100', text: 'text-yellow-800', icon: Clock },
  terminated: { bg: 'bg-red-100', text: 'text-red-800', icon: XCircle },
  available: { bg: 'bg-green-100', text: 'text-green-800', icon: CheckCircle },
  active: { bg: 'bg-green-100', text: 'text-green-800', icon: CheckCircle },
};

export default function ResourceDetailPage() {
  const params = useParams();
  const resourceId = params.id as string;

  const [resource, setResource] = useState<ResourceData | null>(null);
  const [applications, setApplications] = useState<ApplicationData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Mapping state
  const [showMapModal, setShowMapModal] = useState(false);
  const [selectedAppId, setSelectedAppId] = useState('');
  const [isMapping, setIsMapping] = useState(false);

  const loadResource = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await cloudApi.getResource(resourceId);
      setResource(data);
    } catch (err) {
      console.error('Failed to load resource:', err);
      setError('Failed to load resource details');
    } finally {
      setIsLoading(false);
    }
  }, [resourceId]);

  const loadApplications = useCallback(async () => {
    try {
      const response = await applicationsApi.list({ limit: 100 });
      setApplications(response.data || []);
    } catch (err) {
      console.error('Failed to load applications:', err);
    }
  }, []);

  useEffect(() => {
    loadResource();
    loadApplications();
  }, [loadResource, loadApplications]);

  const handleMapToApplication = async () => {
    if (!selectedAppId) return;

    try {
      setIsMapping(true);
      await cloudApi.mapResourceToApplication(resourceId, selectedAppId);
      setShowMapModal(false);
      setSelectedAppId('');
      loadResource();
    } catch (err) {
      console.error('Failed to map resource:', err);
    } finally {
      setIsMapping(false);
    }
  };

  const handleUnmap = async () => {
    if (!confirm('Are you sure you want to unmap this resource from the application?')) return;

    try {
      setIsMapping(true);
      await cloudApi.unmapResource(resourceId);
      loadResource();
    } catch (err) {
      console.error('Failed to unmap resource:', err);
    } finally {
      setIsMapping(false);
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

  const formatCost = (cost: number | null) => {
    if (cost === null) return 'N/A';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(cost);
  };

  const getResourceIcon = (resourceType: string) => {
    const type = resourceType.toLowerCase().split(':').pop() || 'default';
    return resourceTypeIcons[type] || resourceTypeIcons.default;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (error || !resource) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
        <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-red-800 mb-2">{error || 'Resource not found'}</h3>
        <Link href="/cloud">
          <Button variant="outline">Back to Cloud Resources</Button>
        </Link>
      </div>
    );
  }

  const ResourceIcon = getResourceIcon(resource.resource_type);
  const providerCfg = providerColors[resource.provider] || providerColors.aws;
  const statusCfg = statusColors[resource.status.toLowerCase()] || statusColors.pending;
  const StatusIcon = statusCfg.icon;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start space-x-4">
          <Link href="/cloud" className="mt-1">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center space-x-3">
              <div className={`h-10 w-10 rounded-lg ${providerCfg.bg} flex items-center justify-center`}>
                <ResourceIcon className={`h-5 w-5 ${providerCfg.text}`} />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{resource.name}</h1>
                <p className="text-sm text-gray-500">{resource.resource_id}</p>
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center space-x-3">
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${providerCfg.bg} ${providerCfg.text}`}>
            {resource.provider.toUpperCase()}
          </span>
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusCfg.bg} ${statusCfg.text}`}>
            <StatusIcon className="h-3 w-3 mr-1" />
            {resource.status}
          </span>
        </div>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Main Info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Resource Details */}
          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-medium text-gray-900">Resource Details</h2>
            </div>
            <div className="p-6">
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                <div>
                  <dt className="text-sm text-gray-500">Resource Type</dt>
                  <dd className="mt-1 text-sm font-medium text-gray-900">{resource.resource_type}</dd>
                </div>
                <div>
                  <dt className="text-sm text-gray-500">Region</dt>
                  <dd className="mt-1 text-sm font-medium text-gray-900 flex items-center">
                    <Globe className="h-4 w-4 text-gray-400 mr-1" />
                    {resource.region}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-gray-500">Cloud Account</dt>
                  <dd className="mt-1 text-sm font-medium text-gray-900">{resource.account_name}</dd>
                </div>
                <div>
                  <dt className="text-sm text-gray-500">Monthly Cost</dt>
                  <dd className="mt-1 text-sm font-medium text-gray-900 flex items-center">
                    <DollarSign className="h-4 w-4 text-green-500 mr-1" />
                    {formatCost(resource.monthly_cost)}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-gray-500">Last Synced</dt>
                  <dd className="mt-1 text-sm font-medium text-gray-900 flex items-center">
                    <Clock className="h-4 w-4 text-gray-400 mr-1" />
                    {formatDate(resource.last_synced_at)}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-gray-500">Created</dt>
                  <dd className="mt-1 text-sm font-medium text-gray-900">{formatDate(resource.created_at)}</dd>
                </div>
              </dl>
            </div>
          </div>

          {/* Tags */}
          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-medium text-gray-900 flex items-center">
                <Tag className="h-5 w-5 mr-2 text-gray-400" />
                Tags
              </h2>
            </div>
            <div className="p-6">
              {Object.keys(resource.tags).length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {Object.entries(resource.tags).map(([key, value]) => (
                    <span
                      key={key}
                      className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-gray-100 text-gray-700"
                    >
                      <span className="font-medium">{key}:</span>
                      <span className="ml-1">{value}</span>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500">No tags defined</p>
              )}
            </div>
          </div>

          {/* Metadata */}
          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-medium text-gray-900">Metadata</h2>
            </div>
            <div className="p-6">
              {Object.keys(resource.metadata).length > 0 ? (
                <div className="bg-gray-50 rounded-lg p-4 overflow-x-auto">
                  <pre className="text-sm text-gray-700">
                    {JSON.stringify(resource.metadata, null, 2)}
                  </pre>
                </div>
              ) : (
                <p className="text-sm text-gray-500">No metadata available</p>
              )}
            </div>
          </div>
        </div>

        {/* Right Column - Sidebar */}
        <div className="space-y-6">
          {/* Application Mapping */}
          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-medium text-gray-900">Application Mapping</h2>
            </div>
            <div className="p-6">
              {resource.application_id ? (
                <div className="space-y-4">
                  <div className="flex items-center">
                    <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
                      <Server className="h-5 w-5 text-blue-600" />
                    </div>
                    <div className="ml-3">
                      <Link
                        href={`/applications/${resource.application_id}`}
                        className="text-sm font-medium text-blue-600 hover:text-blue-800"
                      >
                        {resource.application_name}
                      </Link>
                      {resource.environment_name && (
                        <p className="text-xs text-gray-500">{resource.environment_name}</p>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    onClick={handleUnmap}
                    disabled={isMapping}
                    className="w-full text-red-600 border-red-300 hover:bg-red-50"
                  >
                    <Unlink className="h-4 w-4 mr-2" />
                    Unmap from Application
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-sm text-gray-500">
                    This resource is not mapped to any application.
                  </p>
                  <Button
                    onClick={() => setShowMapModal(true)}
                    className="w-full"
                  >
                    <LinkIcon className="h-4 w-4 mr-2" />
                    Map to Application
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Quick Stats */}
          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-medium text-gray-900">Quick Stats</h2>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Provider</span>
                <span className={`px-2 py-1 rounded text-xs font-medium ${providerCfg.bg} ${providerCfg.text}`}>
                  {resource.provider.toUpperCase()}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Status</span>
                <span className={`px-2 py-1 rounded text-xs font-medium ${statusCfg.bg} ${statusCfg.text}`}>
                  {resource.status}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Region</span>
                <span className="text-sm font-medium text-gray-900">{resource.region}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Monthly Cost</span>
                <span className="text-sm font-medium text-green-600">{formatCost(resource.monthly_cost)}</span>
              </div>
            </div>
          </div>

          {/* Resource Actions */}
          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-medium text-gray-900">Actions</h2>
            </div>
            <div className="p-6 space-y-3">
              <Button variant="outline" className="w-full justify-start">
                <Activity className="h-4 w-4 mr-2" />
                View Metrics
              </Button>
              <Button variant="outline" className="w-full justify-start">
                <DollarSign className="h-4 w-4 mr-2" />
                Cost History
              </Button>
              <a
                href={`https://console.aws.amazon.com/${resource.resource_type.split(':')[0]}/${resource.region}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button variant="outline" className="w-full justify-start">
                  <Globe className="h-4 w-4 mr-2" />
                  Open in Cloud Console
                </Button>
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Map to Application Modal */}
      {showMapModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Map to Application</h2>
            <p className="text-sm text-gray-600 mb-4">
              Select an application to map this resource to. This helps track cloud resources
              associated with your applications.
            </p>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Application</label>
              <select
                value={selectedAppId}
                onChange={(e) => setSelectedAppId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select an application...</option>
                {applications.map((app) => (
                  <option key={app.id} value={app.id}>
                    {app.name} ({app.short_name})
                  </option>
                ))}
              </select>
            </div>
            <div className="flex justify-end space-x-3">
              <Button variant="outline" onClick={() => setShowMapModal(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleMapToApplication}
                disabled={!selectedAppId || isMapping}
              >
                {isMapping ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <LinkIcon className="h-4 w-4 mr-2" />
                )}
                Map Resource
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
