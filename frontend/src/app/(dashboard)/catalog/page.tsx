'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Search,
  ChevronRight,
  Monitor,
  Shield,
  Database,
  Network,
  Mail,
  HardDrive,
  Users,
  Headphones,
  Clock,
  Star,
  Loader2,
  ShoppingCart,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCatalogItems, useCatalogRequests } from '@/hooks/useApi';

// Local types
interface CatalogItem {
  id: string;
  name: string;
  description?: string;
  category?: string;
  fulfillment_time?: string;
  request_count?: number;
}

interface Request {
  id: string;
  number: string;
  state: string;
  created_at: string;
  catalog_item?: {
    id: string;
    name: string;
  };
}

// Category icons mapping
const categoryIcons: Record<string, typeof Monitor> = {
  hardware: Monitor,
  software: Database,
  access: Shield,
  network: Network,
  email: Mail,
  storage: HardDrive,
};

const statusColors: Record<string, { bg: string; text: string; label: string }> = {
  pending: { bg: 'bg-warning-subtle', text: 'text-warning', label: 'Pending' },
  pending_approval: { bg: 'bg-warning-subtle', text: 'text-warning', label: 'Pending Approval' },
  approved: { bg: 'bg-info-subtle', text: 'text-foreground', label: 'Approved' },
  in_progress: { bg: 'bg-info-subtle', text: 'text-foreground', label: 'In Progress' },
  fulfilled: { bg: 'bg-success-subtle', text: 'text-success', label: 'Fulfilled' },
  completed: { bg: 'bg-success-subtle', text: 'text-success', label: 'Completed' },
  cancelled: { bg: 'bg-error-subtle', text: 'text-error', label: 'Cancelled' },
  rejected: { bg: 'bg-error-subtle', text: 'text-error', label: 'Rejected' },
};

export default function CatalogPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'browse' | 'requests'>('browse');

  const { data: catalogData, isLoading: catalogLoading, error: catalogError } = useCatalogItems();
  const { data: requestsData, isLoading: requestsLoading } = useCatalogRequests();

  const catalogItems = catalogData?.data ?? [];
  const myRequests = requestsData?.data ?? [];

  // Group items by category
  const categories = catalogItems.reduce((acc: Record<string, CatalogItem[]>, item: CatalogItem) => {
    const category = item.category || 'other';
    if (!acc[category]) acc[category] = [];
    acc[category].push(item);
    return acc;
  }, {});

  // Filter items by search
  const filteredItems = searchQuery
    ? catalogItems.filter((item: CatalogItem) =>
        item.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.description?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : [];

  // Get popular items (most requested)
  const popularItems = [...catalogItems]
    .sort((a, b) => (b.request_count || 0) - (a.request_count || 0))
    .slice(0, 6);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  if (catalogError) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
        <ShoppingCart className="h-12 w-12 text-red-500 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-error mb-2">Error loading catalog</h3>
        <p className="text-error">Please try refreshing the page</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Service Catalog</h1>
        <p className="mt-1 text-sm text-muted">
          Browse and request IT services
        </p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted" />
        <input
          type="text"
          placeholder="Search for services, software, hardware..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-12 pr-4 py-3 border border-border-strong rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary shadow-sm"
        />
      </div>

      {/* Search Results */}
      {searchQuery && (
        <div className="bg-surface rounded-lg shadow p-4">
          <h3 className="font-medium text-foreground mb-3">Search Results</h3>
          {filteredItems.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredItems.map((item: CatalogItem) => (
                <Link
                  key={item.id}
                  href={`/catalog/${item.id}`}
                  className="p-4 border rounded-lg hover:border-primary hover:bg-surface-hover transition-colors"
                >
                  <h4 className="font-medium text-foreground">{item.name}</h4>
                  <p className="text-sm text-muted mt-1 line-clamp-2">{item.description}</p>
                  <div className="mt-2 flex items-center text-xs text-muted">
                    <Clock className="h-3 w-3 mr-1" />
                    {item.fulfillment_time || 'Variable'}
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-muted text-center py-4">No items found matching your search</p>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-border">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('browse')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'browse'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted hover:text-secondary hover:border-border-strong'
            }`}
          >
            Browse Catalog
          </button>
          <button
            onClick={() => setActiveTab('requests')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'requests'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted hover:text-secondary hover:border-border-strong'
            }`}
          >
            My Requests
            <span className="ml-2 bg-background text-secondary py-0.5 px-2 rounded-full text-xs">
              {myRequests.length}
            </span>
          </button>
        </nav>
      </div>

      {activeTab === 'browse' ? (
        catalogLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-2 text-muted">Loading catalog...</span>
          </div>
        ) : (
          <>
            {/* Popular Items */}
            {popularItems.length > 0 && !searchQuery && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-foreground">Popular Services</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {popularItems.map((item: CatalogItem) => (
                    <Link
                      key={item.id}
                      href={`/catalog/${item.id}`}
                      className="bg-surface rounded-lg shadow hover:shadow-md transition-shadow p-4"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className="font-medium text-foreground">{item.name}</h3>
                          <p className="text-sm text-muted mt-1 line-clamp-2">{item.description}</p>
                        </div>
                        <ChevronRight className="h-5 w-5 text-muted flex-shrink-0" />
                      </div>
                      <div className="mt-4 flex items-center justify-between text-sm">
                        <span className="text-muted">{item.category}</span>
                        <div className="flex items-center text-muted">
                          <Clock className="h-4 w-4 mr-1" />
                          {item.fulfillment_time || 'Variable'}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Categories */}
            {!searchQuery && (
              <div>
                <h2 className="text-lg font-semibold text-foreground mb-4">Browse by Category</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {Object.entries(categories).map(([category, items]) => {
                    const Icon = categoryIcons[category.toLowerCase()] || Database;
                    return (
                      <Link
                        key={category}
                        href={`/catalog?category=${category}`}
                        className="bg-surface rounded-lg shadow hover:shadow-md transition-shadow p-6 flex items-start space-x-4"
                      >
                        <div className="h-12 w-12 rounded-lg bg-info-subtle flex items-center justify-center flex-shrink-0">
                          <Icon className="h-6 w-6 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-medium text-foreground capitalize">{category}</h3>
                          <p className="text-sm text-muted mt-1">
                            {(items as CatalogItem[]).length} item{(items as CatalogItem[]).length !== 1 ? 's' : ''}
                          </p>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Empty state */}
            {catalogItems.length === 0 && !searchQuery && (
              <div className="bg-surface rounded-lg shadow p-12 text-center">
                <ShoppingCart className="h-12 w-12 text-muted mx-auto mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-2">No catalog items</h3>
                <p className="text-muted">The service catalog is empty</p>
              </div>
            )}

            {/* Quick Links */}
            <div className="bg-background rounded-lg p-6">
              <h2 className="text-lg font-semibold text-foreground mb-4">Need Help?</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Link
                  href="/issues/new"
                  className="flex items-center space-x-3 p-4 bg-surface rounded-lg shadow-sm hover:shadow-md transition-shadow"
                >
                  <Headphones className="h-8 w-8 text-primary" />
                  <div>
                    <h3 className="font-medium text-foreground">Report an Issue</h3>
                    <p className="text-sm text-muted">Something not working?</p>
                  </div>
                </Link>
                <Link
                  href="/knowledge"
                  className="flex items-center space-x-3 p-4 bg-surface rounded-lg shadow-sm hover:shadow-md transition-shadow"
                >
                  <Star className="h-8 w-8 text-yellow-500" />
                  <div>
                    <h3 className="font-medium text-foreground">Knowledge Base</h3>
                    <p className="text-sm text-muted">Find answers yourself</p>
                  </div>
                </Link>
                <Link
                  href="/support"
                  className="flex items-center space-x-3 p-4 bg-surface rounded-lg shadow-sm hover:shadow-md transition-shadow"
                >
                  <Users className="h-8 w-8 text-green-500" />
                  <div>
                    <h3 className="font-medium text-foreground">Contact Support</h3>
                    <p className="text-sm text-muted">Talk to our team</p>
                  </div>
                </Link>
              </div>
            </div>
          </>
        )
      ) : (
        /* My Requests Tab */
        <div className="bg-surface rounded-lg shadow">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="text-lg font-semibold text-foreground">My Service Requests</h2>
          </div>
          {requestsLoading ? (
            <div className="flex items-center justify-center h-48">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <span className="ml-2 text-muted">Loading requests...</span>
            </div>
          ) : myRequests.length > 0 ? (
            <ul className="divide-y divide-gray-200">
              {myRequests.map((request: Request) => (
                <li key={request.id}>
                  <Link
                    href={`/catalog/requests/${request.id}`}
                    className="block hover:bg-background px-6 py-4"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-primary">{request.number}</p>
                        <p className="text-sm text-foreground mt-1">{request.catalog_item?.name || 'Service Request'}</p>
                        <p className="text-xs text-muted mt-1">
                          Submitted: {formatDate(request.created_at)}
                        </p>
                      </div>
                      <div className="flex items-center space-x-3">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            statusColors[request.state]?.bg || 'bg-background'
                          } ${statusColors[request.state]?.text || 'text-foreground'}`}
                        >
                          {statusColors[request.state]?.label || request.state}
                        </span>
                        <ChevronRight className="h-5 w-5 text-muted" />
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-center py-12">
              <ShoppingCart className="h-12 w-12 text-muted mx-auto mb-4" />
              <p className="text-muted">No service requests yet</p>
              <Button className="mt-4" onClick={() => setActiveTab('browse')}>
                Browse Catalog
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
