'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Plus,
  Cloud,
  Server,
  Database,
  HardDrive,
  Globe,
  DollarSign,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCloudAccounts, useCloudResources, useCloudCosts } from '@/hooks/useApi';

interface CloudAccount {
  id: string;
  name: string;
  provider: string;
  status: string;
  resource_count?: number;
  monthly_cost?: number;
  cost_trend?: number;
  last_synced_at?: string;
}

interface CloudResource {
  resource_type: string;
  count: number;
  cost: number;
}

const providerColors: Record<string, { bg: string; text: string }> = {
  aws: { bg: 'bg-orange-100', text: 'text-orange-800' },
  azure: { bg: 'bg-blue-100', text: 'text-blue-800' },
  gcp: { bg: 'bg-red-100', text: 'text-red-800' },
};

const providerNames: Record<string, string> = {
  aws: 'AWS',
  azure: 'Azure',
  gcp: 'GCP',
};

const resourceTypeIcons: Record<string, typeof Server> = {
  compute: Server,
  database: Database,
  storage: HardDrive,
  network: Globe,
};

export default function CloudPage() {
  const [activeTab, setActiveTab] = useState<'accounts' | 'resources' | 'costs'>('accounts');

  const { data: accountsData, isLoading: accountsLoading, error: accountsError } = useCloudAccounts();
  const { data: resourcesData, isLoading: resourcesLoading } = useCloudResources();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { data: costsData, isLoading: costsLoading } = useCloudCosts();

  const accounts = accountsData?.data ?? [];
  const resources = resourcesData?.data ?? [];
  // Note: costs data is fetched but currently the cost view uses account-level data
  // The detailed costs data can be used for historical trends when implemented

  // Calculate totals
  const totalCost = accounts.reduce((sum: number, acc: CloudAccount) => sum + (acc.monthly_cost || 0), 0);
  const totalResources = accounts.reduce((sum: number, acc: CloudAccount) => sum + (acc.resource_count || 0), 0);

  // Aggregate resources by type
  const resourceSummary = resources.reduce((acc: Record<string, CloudResource>, resource: { resource_type: string; cost?: number }) => {
    const type = resource.resource_type || 'other';
    if (!acc[type]) {
      acc[type] = { resource_type: type, count: 0, cost: 0 };
    }
    acc[type].count += 1;
    acc[type].cost += resource.cost || 0;
    return acc;
  }, {});

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (accountsError) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
        <Cloud className="h-12 w-12 text-red-500 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-red-800 mb-2">Error loading cloud data</h3>
        <p className="text-red-600">Please try refreshing the page</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cloud Management</h1>
          <p className="mt-1 text-sm text-gray-500">
            Monitor cloud resources and costs
          </p>
        </div>
        <Link href="/cloud/accounts/new">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Add Account
          </Button>
        </Link>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center">
            <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <Cloud className="h-5 w-5 text-blue-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm text-gray-500">Cloud Accounts</p>
              <p className="text-2xl font-semibold text-gray-900">
                {accountsLoading ? '-' : accounts.length}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center">
            <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center">
              <Server className="h-5 w-5 text-green-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm text-gray-500">Total Resources</p>
              <p className="text-2xl font-semibold text-gray-900">
                {accountsLoading ? '-' : totalResources}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center">
            <div className="h-10 w-10 rounded-lg bg-purple-100 flex items-center justify-center">
              <DollarSign className="h-5 w-5 text-purple-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm text-gray-500">Monthly Cost</p>
              <p className="text-2xl font-semibold text-gray-900">
                {accountsLoading ? '-' : formatCurrency(totalCost)}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center">
            <div className="h-10 w-10 rounded-lg bg-yellow-100 flex items-center justify-center">
              <AlertTriangle className="h-5 w-5 text-yellow-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm text-gray-500">Accounts with Issues</p>
              <p className="text-2xl font-semibold text-gray-900">
                {accountsLoading ? '-' : accounts.filter((a: CloudAccount) => a.status === 'error').length}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('accounts')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'accounts'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Cloud Accounts
          </button>
          <button
            onClick={() => setActiveTab('resources')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'resources'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Resources
          </button>
          <button
            onClick={() => setActiveTab('costs')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'costs'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Cost Analysis
          </button>
        </nav>
      </div>

      {/* Accounts Tab */}
      {activeTab === 'accounts' && (
        accountsLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
            <span className="ml-2 text-gray-500">Loading cloud accounts...</span>
          </div>
        ) : accounts.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {accounts.map((account: CloudAccount) => (
              <Link
                key={account.id}
                href={`/cloud/accounts/${account.id}`}
                className="bg-white rounded-lg shadow hover:shadow-md transition-shadow p-6"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="h-10 w-10 rounded-lg bg-gray-100 flex items-center justify-center">
                      <Cloud className="h-5 w-5 text-gray-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">{account.name}</h3>
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          providerColors[account.provider]?.bg || 'bg-gray-100'
                        } ${providerColors[account.provider]?.text || 'text-gray-800'}`}
                      >
                        {providerNames[account.provider] || account.provider}
                      </span>
                    </div>
                  </div>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      account.status === 'connected' || account.status === 'active'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-red-100 text-red-800'
                    }`}
                  >
                    {account.status === 'connected' || account.status === 'active' ? (
                      <>
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Connected
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="h-3 w-3 mr-1" />
                        Error
                      </>
                    )}
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-500">Resources</p>
                    <p className="text-lg font-semibold text-gray-900">{account.resource_count || 0}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Monthly Cost</p>
                    <div className="flex items-center">
                      <p className="text-lg font-semibold text-gray-900">
                        {formatCurrency(account.monthly_cost || 0)}
                      </p>
                      {account.cost_trend !== undefined && account.cost_trend !== 0 && (
                        <span
                          className={`ml-2 flex items-center text-xs ${
                            account.cost_trend > 0 ? 'text-red-600' : 'text-green-600'
                          }`}
                        >
                          {account.cost_trend > 0 ? (
                            <TrendingUp className="h-3 w-3 mr-0.5" />
                          ) : (
                            <TrendingDown className="h-3 w-3 mr-0.5" />
                          )}
                          {Math.abs(account.cost_trend)}%
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {account.last_synced_at && (
                  <p className="mt-4 text-xs text-gray-500">
                    Last synced: {formatDate(account.last_synced_at)}
                  </p>
                )}
              </Link>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <Cloud className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No cloud accounts</h3>
            <p className="text-gray-500 mb-4">Add a cloud account to start monitoring resources</p>
            <Link href="/cloud/accounts/new">
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Account
              </Button>
            </Link>
          </div>
        )
      )}

      {/* Resources Tab */}
      {activeTab === 'resources' && (
        resourcesLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
            <span className="ml-2 text-gray-500">Loading resources...</span>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              {Object.entries(resourceSummary).map(([type, data]) => {
                const resource = data as CloudResource;
                const Icon = resourceTypeIcons[type] || Cloud;
                return (
                  <div key={type} className="bg-white rounded-lg shadow p-4">
                    <div className="flex items-center space-x-3">
                      <Icon className="h-8 w-8 text-blue-500" />
                      <div>
                        <p className="text-sm text-gray-500 capitalize">{type}</p>
                        <p className="text-xl font-semibold text-gray-900">{resource.count}</p>
                        <p className="text-xs text-gray-500">{formatCurrency(resource.cost)}/mo</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {resources.length === 0 && (
              <div className="bg-white rounded-lg shadow p-6 text-center">
                <Server className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No resources discovered</h3>
                <p className="text-gray-500">Resources will appear after cloud accounts are synced</p>
              </div>
            )}
          </div>
        )
      )}

      {/* Costs Tab */}
      {activeTab === 'costs' && (
        costsLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
            <span className="ml-2 text-gray-500">Loading cost data...</span>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Cost Breakdown by Account</h3>
              {accounts.filter((a: CloudAccount) => (a.monthly_cost || 0) > 0).length > 0 ? (
                <div className="space-y-4">
                  {accounts
                    .filter((acc: CloudAccount) => (acc.monthly_cost || 0) > 0)
                    .sort((a: CloudAccount, b: CloudAccount) => (b.monthly_cost || 0) - (a.monthly_cost || 0))
                    .map((account: CloudAccount) => {
                      const percentage = totalCost > 0 ? ((account.monthly_cost || 0) / totalCost) * 100 : 0;
                      return (
                        <div key={account.id}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-medium text-gray-900">{account.name}</span>
                            <span className="text-sm text-gray-500">
                              {formatCurrency(account.monthly_cost || 0)} ({percentage.toFixed(1)}%)
                            </span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                              className="bg-blue-600 h-2 rounded-full"
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                </div>
              ) : (
                <p className="text-gray-500 text-center py-4">No cost data available</p>
              )}
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Cost Trend</h3>
              <p className="text-gray-500 text-center py-8">
                Cost trend chart will be displayed here showing monthly spending over time.
              </p>
            </div>
          </div>
        )
      )}
    </div>
  );
}
