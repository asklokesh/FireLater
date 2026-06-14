'use client';

import { useState, useEffect } from 'react';
import { Building2, Plus, Eye, Edit2, AlertCircle, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';

interface Vendor {
  id: string;
  name: string;
  description: string | null;
  website: string | null;
  risk_tier: 'critical' | 'high' | 'medium' | 'low';
  criticality: 'mission_critical' | 'important' | 'standard' | 'non_critical' | null;
  primary_contact_name: string | null;
  primary_contact_email: string | null;
  is_active: boolean;
  notes: string | null;
  contract_review_date: string | null;
  assessment_review_date: string | null;
  created_at: string;
}

interface Review {
  id: string;
  vendor_id: string;
  review_type: string;
  due_date: string;
  reviewer_id: string;
  reviewer_email: string;
  created_at: string;
}

interface RiskSummary {
  total: number;
  byRiskTier: Record<string, number>;
  byCriticality: Record<string, number>;
  overdueReviews: number;
}

export default function VendorRiskPage() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [summary, setSummary] = useState<RiskSummary>({
    total: 0,
    byRiskTier: {},
    byCriticality: {},
    overdueReviews: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [riskFilter, setRiskFilter] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedVendor, setExpandedVendor] = useState<string | null>(null);
  const [vendorReviews, setVendorReviews] = useState<Record<string, Review[]>>({});
  const [showAddReview, setShowAddReview] = useState<string | null>(null);
  const user = useAuthStore((state) => state.user);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [vendorsRes, summaryRes] = await Promise.all([
        api.get('/v1/vendor-risk/vendors'),
        api.get('/v1/vendor-risk/vendors/summary'),
      ]);
      setVendors(vendorsRes.data.data || vendorsRes.data);
      setSummary(summaryRes.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load vendors');
    } finally {
      setLoading(false);
    }
  };

  const loadReviews = async (vendorId: string) => {
    try {
      const res = await api.get(`/v1/vendor-risk/vendors/${vendorId}/reviews`);
      setVendorReviews((prev) => ({
        ...prev,
        [vendorId]: res.data.data || res.data,
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load reviews');
    }
  };

  const handleAddVendor = async (formData: Partial<Vendor>) => {
    try {
      await api.post('/v1/vendor-risk/vendors', formData);
      setShowAddModal(false);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add vendor');
    }
  };

  const handleAddReview = async (vendorId: string, reviewData: {
    review_type: string;
    due_date: string;
  }) => {
    if (!user) return;
    try {
      await api.post(`/v1/vendor-risk/vendors/${vendorId}/reviews`, {
        ...reviewData,
        reviewer_id: user.id,
        reviewer_email: user.email,
      });
      setShowAddReview(null);
      await loadReviews(vendorId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add review');
    }
  };

  const handleToggleActive = async (vendor: Vendor) => {
    try {
      // Update the vendor's active status
      await api.put(`/v1/vendor-risk/vendors/${vendor.id}`, {
        is_active: !vendor.is_active,
      });
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update vendor');
    }
  };

  const filteredVendors = vendors.filter((v) => {
    if (riskFilter && v.risk_tier !== riskFilter) return false;
    if (searchTerm && !v.name.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Building2 className="h-8 w-8 text-foreground" />
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Vendor Risk Register</h1>
            <p className="mt-1 text-sm text-muted">Third-party vendor risk management (FFIEC, GLBA, SOC2)</p>
          </div>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center px-4 py-2 border border-transparent rounded-xl shadow-sm-sm text-sm font-medium text-white bg-primary hover:hover:bg-primary-hover"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Vendor
        </button>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Total Vendors" value={summary.total} />
        <StatCard label="Critical/High Risk" value={(summary.byRiskTier['critical'] || 0) + (summary.byRiskTier['high'] || 0)} highlight="red" />
        <StatCard label="Overdue Reviews" value={summary.overdueReviews} highlight="orange" />
        <StatCard label="Mission Critical" value={summary.byCriticality['mission_critical'] || 0} highlight="red" />
      </div>

      {error && (
        <div className="bg-error-subtle border border-error rounded-xl p-4 flex items-start space-x-3">
          <AlertCircle className="h-5 w-5 text-error mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-error">{error}</p>
            <button onClick={() => setError(null)} className="text-xs text-error mt-1">
              Dismiss
            </button>
          </div>
        </div>
      )}

      <div className="bg-surface shadow-sm rounded-xl p-4 flex items-center space-x-4">
        <input
          type="text"
          placeholder="Search vendors by name..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="flex-1 px-3 py-2 border border-border-strong rounded-xl shadow-sm-sm focus:border-primary focus:ring-primary/20 focus:border-primary sm:text-sm"
        />
        <select
          value={riskFilter}
          onChange={(e) => setRiskFilter(e.target.value)}
          className="px-3 py-2 border border-border-strong rounded-xl shadow-sm-sm focus:border-primary focus:ring-primary/20 focus:border-primary sm:text-sm"
        >
          <option value="">All Risk Tiers</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="h-8 w-8 text-muted animate-spin" />
        </div>
      ) : filteredVendors.length === 0 ? (
        <div className="text-center py-12 bg-surface border rounded-xl">
          <Building2 className="mx-auto h-12 w-12 text-muted" />
          <h3 className="mt-2 text-sm font-medium text-foreground">No vendors found</h3>
          <p className="mt-1 text-sm text-muted">Get started by adding your first vendor.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredVendors.map((vendor) => (
            <div key={vendor.id} className="bg-surface border rounded-xl overflow-hidden">
              <div
                className="px-6 py-4 hover:bg-surface-hover cursor-pointer flex items-center justify-between"
                onClick={() => {
                  if (expandedVendor === vendor.id) {
                    setExpandedVendor(null);
                  } else {
                    setExpandedVendor(vendor.id);
                    if (!vendorReviews[vendor.id]) {
                      loadReviews(vendor.id);
                    }
                  }
                }}
              >
                <div className="flex items-center space-x-4 flex-1">
                  <div className="flex-shrink-0">
                    {expandedVendor === vendor.id ? (
                      <ChevronUp className="h-5 w-5 text-muted" />
                    ) : (
                      <ChevronDown className="h-5 w-5 text-muted" />
                    )}
                  </div>
                  <div className="flex-1">
                    <h3 className="text-sm font-medium text-foreground">{vendor.name}</h3>
                    {vendor.description && (
                      <p className="text-sm text-muted mt-1">{vendor.description}</p>
                    )}
                  </div>
                  <div className="flex items-center space-x-3">
                    <RiskTierBadge tier={vendor.risk_tier} />
                    {vendor.criticality && (
                      <CriticalityBadge criticality={vendor.criticality} />
                    )}
                    <div className="text-sm text-muted">
                      {vendor.primary_contact_email && `${vendor.primary_contact_name || 'Contact'}: ${vendor.primary_contact_email}`}
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleActive(vendor);
                      }}
                      className={`px-3 py-1 text-xs font-medium rounded-full ${
                        vendor.is_active
                          ? 'bg-success-subtle text-success'
                          : 'bg-background text-foreground'
                      }`}
                    >
                      {vendor.is_active ? 'Active' : 'Inactive'}
                    </button>
                  </div>
                </div>
              </div>

              {expandedVendor === vendor.id && (
                <div className="border-t border-border px-6 py-4 bg-surface-hover space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    {vendor.website && (
                      <div>
                        <p className="text-xs font-medium text-secondary">Website</p>
                        <p className="text-sm text-primary mt-1">{vendor.website}</p>
                      </div>
                    )}
                    {vendor.contract_review_date && (
                      <div>
                        <p className="text-xs font-medium text-secondary">Last Contract Review</p>
                        <p className="text-sm text-foreground mt-1">
                          {new Date(vendor.contract_review_date).toLocaleDateString()}
                        </p>
                      </div>
                    )}
                    {vendor.assessment_review_date && (
                      <div>
                        <p className="text-xs font-medium text-secondary">Last Assessment Review</p>
                        <p className="text-sm text-foreground mt-1">
                          {new Date(vendor.assessment_review_date).toLocaleDateString()}
                        </p>
                      </div>
                    )}
                  </div>

                  {vendor.notes && (
                    <div>
                      <p className="text-xs font-medium text-secondary">Notes</p>
                      <p className="text-sm text-secondary mt-1">{vendor.notes}</p>
                    </div>
                  )}

                  <div className="border-t border-border pt-4">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-medium text-foreground">Reviews</h4>
                      <button
                        onClick={() => setShowAddReview(vendor.id)}
                        className="text-xs px-2 py-1 border border-primary text-primary rounded hover:bg-surface-hover"
                      >
                        Add Review
                      </button>
                    </div>

                    {showAddReview === vendor.id && (
                      <ReviewForm
                        onSubmit={(data) => handleAddReview(vendor.id, data)}
                        onCancel={() => setShowAddReview(null)}
                      />
                    )}

                    {vendorReviews[vendor.id]?.length > 0 ? (
                      <div className="space-y-2">
                        {vendorReviews[vendor.id].map((review) => (
                          <div key={review.id} className="bg-surface border border-border rounded p-3 text-sm">
                            <div className="flex items-center justify-between">
                              <span className="font-medium text-foreground capitalize">{review.review_type.replace(/_/g, ' ')}</span>
                              <span className="text-muted">{new Date(review.due_date).toLocaleDateString()}</span>
                            </div>
                            <div className="text-xs text-muted mt-1">Reviewer: {review.reviewer_email}</div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted">No reviews scheduled yet.</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showAddModal && (
        <AddVendorModal onSubmit={handleAddVendor} onClose={() => setShowAddModal(false)} />
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: 'red' | 'orange';
}) {
  const colors = {
    red: 'bg-error-subtle border-error',
    orange: 'bg-warning-subtle border-warning',
  };

  return (
    <div className={`border rounded-xl p-4 ${highlight ? colors[highlight] : 'bg-surface border-border'}`}>
      <p className="text-sm text-secondary">{label}</p>
      <p className="text-3xl font-semibold text-foreground mt-2">{value}</p>
    </div>
  );
}

function RiskTierBadge({ tier }: { tier: string }) {
  const colors: Record<string, string> = {
    critical: 'bg-error-subtle text-error',
    high: 'bg-warning-subtle text-warning',
    medium: 'bg-warning-subtle text-warning',
    low: 'bg-success-subtle text-success',
  };

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colors[tier]}`}>
      {tier.charAt(0).toUpperCase() + tier.slice(1)}
    </span>
  );
}

function CriticalityBadge({ criticality }: { criticality: string }) {
  const colors: Record<string, string> = {
    mission_critical: 'bg-error-subtle text-error',
    important: 'bg-warning-subtle text-warning',
    standard: 'bg-info-subtle text-foreground',
    non_critical: 'bg-background text-foreground',
  };

  const label = criticality.replace(/_/g, ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colors[criticality]}`}>
      {label}
    </span>
  );
}

function ReviewForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (data: { review_type: string; due_date: string }) => void;
  onCancel: () => void;
}) {
  const [formData, setFormData] = useState({
    review_type: 'contract',
    due_date: new Date().toISOString().split('T')[0],
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(formData);
      }}
      className="bg-info-subtle border border-border rounded p-4 space-y-3 mb-3"
    >
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-secondary">Review Type</label>
          <select
            value={formData.review_type}
            onChange={(e) => setFormData({ ...formData, review_type: e.target.value })}
            className="mt-1 block w-full rounded-xl border-border-strong text-sm"
          >
            <option value="contract">Contract Review</option>
            <option value="security_assessment">Security Assessment</option>
            <option value="due_diligence">Due Diligence</option>
            <option value="annual_review">Annual Review</option>
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-secondary">Due Date</label>
          <input
            type="date"
            value={formData.due_date}
            onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
            className="mt-1 block w-full rounded-xl border-border-strong text-sm"
          />
        </div>
      </div>
      <div className="flex justify-end space-x-2">
        <button
          type="button"
          onClick={onCancel}
          className="text-xs px-3 py-1 border border-border-strong rounded hover:bg-surface-hover"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="text-xs px-3 py-1 bg-primary text-white rounded hover:hover:bg-primary-hover"
        >
          Add Review
        </button>
      </div>
    </form>
  );
}

function AddVendorModal({
  onSubmit,
  onClose,
}: {
  onSubmit: (data: Partial<Vendor>) => void;
  onClose: () => void;
}) {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    website: '',
    risk_tier: 'medium' as Vendor['risk_tier'],
    criticality: '',
    primary_contact_name: '',
    primary_contact_email: '',
    notes: '',
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await onSubmit({
        ...formData,
        criticality: (formData.criticality || null) as Vendor['criticality'],
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 transition-opacity" onClick={onClose}>
          <div className="absolute inset-0 bg-black opacity-75" />
        </div>

        <div className="inline-block align-bottom bg-surface rounded-xl px-4 pt-5 pb-4 text-left overflow-hidden shadow-sm-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full sm:p-6">
          <h3 className="text-lg font-medium text-foreground mb-4">Add New Vendor</h3>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-secondary">Name</label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="mt-1 block w-full rounded-xl border-border-strong shadow-sm-sm focus:border-primary focus:ring-primary/20 focus:border-primary sm:text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-secondary">Description</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
                className="mt-1 block w-full rounded-xl border-border-strong shadow-sm-sm focus:border-primary focus:ring-primary/20 focus:border-primary sm:text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-secondary">Website</label>
              <input
                type="url"
                value={formData.website}
                onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                className="mt-1 block w-full rounded-xl border-border-strong shadow-sm-sm focus:border-primary focus:ring-primary/20 focus:border-primary sm:text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-secondary">Risk Tier</label>
                <select
                  value={formData.risk_tier}
                  onChange={(e) => setFormData({ ...formData, risk_tier: e.target.value as Vendor['risk_tier'] })}
                  className="mt-1 block w-full rounded-xl border-border-strong shadow-sm-sm focus:border-primary focus:ring-primary/20 focus:border-primary sm:text-sm"
                >
                  <option value="critical">Critical</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-secondary">Criticality</label>
                <select
                  value={formData.criticality}
                  onChange={(e) => setFormData({ ...formData, criticality: e.target.value })}
                  className="mt-1 block w-full rounded-xl border-border-strong shadow-sm-sm focus:border-primary focus:ring-primary/20 focus:border-primary sm:text-sm"
                >
                  <option value="">None</option>
                  <option value="mission_critical">Mission Critical</option>
                  <option value="important">Important</option>
                  <option value="standard">Standard</option>
                  <option value="non_critical">Non Critical</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-secondary">Primary Contact Name</label>
              <input
                type="text"
                value={formData.primary_contact_name}
                onChange={(e) => setFormData({ ...formData, primary_contact_name: e.target.value })}
                className="mt-1 block w-full rounded-xl border-border-strong shadow-sm-sm focus:border-primary focus:ring-primary/20 focus:border-primary sm:text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-secondary">Primary Contact Email</label>
              <input
                type="email"
                value={formData.primary_contact_email}
                onChange={(e) => setFormData({ ...formData, primary_contact_email: e.target.value })}
                className="mt-1 block w-full rounded-xl border-border-strong shadow-sm-sm focus:border-primary focus:ring-primary/20 focus:border-primary sm:text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-secondary">Notes</label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
                className="mt-1 block w-full rounded-xl border-border-strong shadow-sm-sm focus:border-primary focus:ring-primary/20 focus:border-primary sm:text-sm"
              />
            </div>

            <div className="mt-6 flex justify-end space-x-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-border-strong rounded-xl shadow-sm-sm text-sm font-medium text-secondary bg-surface hover:bg-surface-hover"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 border border-transparent rounded-xl shadow-sm-sm text-sm font-medium text-white bg-primary hover:hover:bg-primary-hover disabled:opacity-50"
              >
                {loading ? 'Adding...' : 'Add Vendor'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
