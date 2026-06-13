'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  CheckSquare,
  AlertCircle,
  Loader2,
  CheckCircle,
  XCircle,
  Clock,
  MessageSquare,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';

interface MakerCheckerRequest {
  id: string;
  entity_type: string;
  entity_id: string;
  entity_title: string | null;
  action: string;
  payload: Record<string, unknown>;
  submitter_id: string;
  submitter_email: string;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  required_approvals: number;
  current_approvals: number;
  created_at: string;
  expires_at: string | null;
  approvals: Array<{
    approver_id: string;
    approver_email: string;
    decision: 'approved' | 'rejected';
    comment: string | null;
    decided_at: string;
  }>;
}

interface MakerCheckerPolicy {
  entity_type: string;
  min_approvers: number;
  require_different_user: boolean;
}

const statusColors: Record<string, { bg: string; text: string; icon: typeof CheckCircle }> = {
  pending: { bg: 'bg-yellow-100', text: 'text-yellow-800', icon: Clock },
  approved: { bg: 'bg-green-100', text: 'text-green-800', icon: CheckCircle },
  rejected: { bg: 'bg-red-100', text: 'text-red-800', icon: XCircle },
  expired: { bg: 'bg-gray-100', text: 'text-gray-800', icon: AlertCircle },
};

export default function MakerCheckerPage() {
  const user = useAuthStore((state) => state.user);
  const [requests, setRequests] = useState<MakerCheckerRequest[]>([]);
  const [activeTab, setActiveTab] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Modal state
  const [showDecisionModal, setShowDecisionModal] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<MakerCheckerRequest | null>(null);
  const [decisionType, setDecisionType] = useState<'approve' | 'reject'>('approve');
  const [comment, setComment] = useState('');

  const loadRequests = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const params: Record<string, string> = {};
      if (activeTab !== 'all') {
        params.status = activeTab;
      }
      const response = await api.get('/v1/maker-checker/requests', { params });
      setRequests(response.data || []);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load requests';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  const handleDecision = async () => {
    if (!selectedRequest || !user) return;

    try {
      setProcessingId(selectedRequest.id);
      setError(null);

      const endpoint =
        decisionType === 'approve'
          ? `/v1/maker-checker/requests/${selectedRequest.id}/approve`
          : `/v1/maker-checker/requests/${selectedRequest.id}/reject`;

      const body = {
        approverId: user.id,
        approverEmail: user.email,
        [decisionType === 'approve' ? 'comment' : 'reason']: comment,
      };

      await api.post(endpoint, body);

      setShowDecisionModal(false);
      setComment('');
      setSelectedRequest(null);
      await loadRequests();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to process decision';
      setError(message);
    } finally {
      setProcessingId(null);
    }
  };

  const openDecisionModal = (request: MakerCheckerRequest, type: 'approve' | 'reject') => {
    setSelectedRequest(request);
    setDecisionType(type);
    setComment('');
    setShowDecisionModal(true);
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

  const filteredRequests = requests.filter((req) => {
    if (activeTab === 'all') return true;
    return req.status === activeTab;
  });

  const pendingCount = requests.filter((r) => r.status === 'pending').length;
  const approvedCount = requests.filter((r) => r.status === 'approved').length;
  const rejectedCount = requests.filter((r) => r.status === 'rejected').length;

  if (isLoading) {
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
      <div>
        <div className="flex items-center gap-2 mb-1">
          <CheckSquare className="h-6 w-6 text-gray-900" />
          <h1 className="text-2xl font-bold text-gray-900">Maker-Checker Approvals</h1>
        </div>
        <p className="text-sm text-gray-500">
          Dual-approval workflow for high-risk changes (SOX ITGC requirement)
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center">
            <div className="h-10 w-10 rounded-lg bg-yellow-100 flex items-center justify-center">
              <Clock className="h-5 w-5 text-yellow-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm text-gray-500">Pending</p>
              <p className="text-2xl font-semibold text-gray-900">{pendingCount}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center">
            <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center">
              <CheckCircle className="h-5 w-5 text-green-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm text-gray-500">Approved</p>
              <p className="text-2xl font-semibold text-gray-900">{approvedCount}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center">
            <div className="h-10 w-10 rounded-lg bg-red-100 flex items-center justify-center">
              <XCircle className="h-5 w-5 text-red-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm text-gray-500">Rejected</p>
              <p className="text-2xl font-semibold text-gray-900">{rejectedCount}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center">
            <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <CheckSquare className="h-5 w-5 text-blue-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm text-gray-500">Total</p>
              <p className="text-2xl font-semibold text-gray-900">{requests.length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-lg shadow">
        <div className="flex border-b border-gray-200">
          {(['pending', 'approved', 'rejected', 'all'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* Requests List */}
        <div className="divide-y divide-gray-200">
          {filteredRequests.length === 0 ? (
            <div className="text-center py-12 px-6">
              <CheckSquare className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                No {activeTab !== 'all' ? activeTab : ''} approvals
              </h3>
              <p className="text-gray-500">
                {activeTab === 'pending'
                  ? 'All pending approvals have been processed'
                  : 'No requests found for this status'}
              </p>
            </div>
          ) : (
            filteredRequests.map((request) => {
              const StatusIcon =
                statusColors[request.status]?.icon || statusColors.pending.icon;
              const statusConfig = statusColors[request.status] || statusColors.pending;
              const isPending = request.status === 'pending';

              return (
                <div key={request.id} className="p-6 hover:bg-gray-50">
                  <div className="space-y-4">
                    {/* Header row */}
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            {request.entity_type}
                          </span>
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                            {request.action}
                          </span>
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusConfig.bg} ${statusConfig.text}`}
                          >
                            <StatusIcon className="h-3 w-3 mr-1" />
                            {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
                          </span>
                        </div>
                        {request.entity_title && (
                          <p className="text-sm font-medium text-gray-900 mt-1">
                            {request.entity_title}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Details row */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-gray-600">
                      <div>
                        <p className="text-gray-500 text-xs uppercase tracking-wide">Submitter</p>
                        <p className="mt-1 text-gray-900">{request.submitter_email}</p>
                      </div>
                      <div>
                        <p className="text-gray-500 text-xs uppercase tracking-wide">Created</p>
                        <p className="mt-1 text-gray-900">{formatDate(request.created_at)}</p>
                      </div>
                      <div>
                        <p className="text-gray-500 text-xs uppercase tracking-wide">Expires</p>
                        <p className="mt-1 text-gray-900">
                          {request.expires_at ? formatDate(request.expires_at) : 'N/A'}
                        </p>
                      </div>
                    </div>

                    {/* Approval Progress */}
                    <div className="bg-gray-50 rounded p-3">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-medium text-gray-900">
                          {request.current_approvals} of {request.required_approvals} approvals
                        </p>
                        <div className="w-24 bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-blue-500 h-2 rounded-full transition-all"
                            style={{
                              width: `${(request.current_approvals / request.required_approvals) * 100}%`,
                            }}
                          ></div>
                        </div>
                      </div>

                      {/* Approval Details */}
                      {request.approvals.length > 0 && (
                        <div className="mt-3 space-y-2 border-t border-gray-200 pt-3">
                          {request.approvals.map((approval, idx) => (
                            <div
                              key={idx}
                              className="flex items-start gap-2 text-xs text-gray-700"
                            >
                              {approval.decision === 'approved' ? (
                                <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0 mt-0.5" />
                              ) : (
                                <XCircle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />
                              )}
                              <div className="flex-1">
                                <p className="font-medium">
                                  {approval.approver_email}{' '}
                                  <span className="text-gray-500 font-normal">
                                    {approval.decision === 'approved' ? 'approved' : 'rejected'}
                                  </span>
                                </p>
                                {approval.comment && (
                                  <p className="text-gray-600 mt-1 italic">"{approval.comment}"</p>
                                )}
                                <p className="text-gray-500 mt-1">
                                  {formatDate(approval.decided_at)}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Action Buttons - Only show for pending requests */}
                    {isPending && (
                      <div className="flex gap-3 justify-end pt-2">
                        <Button
                          onClick={() => openDecisionModal(request, 'reject')}
                          variant="outline"
                          size="sm"
                          disabled={processingId === request.id}
                        >
                          <XCircle className="h-4 w-4 mr-2" />
                          Reject
                        </Button>
                        <Button
                          onClick={() => openDecisionModal(request, 'approve')}
                          variant="primary"
                          size="sm"
                          isLoading={processingId === request.id}
                        >
                          <CheckCircle className="h-4 w-4 mr-2" />
                          Approve
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Decision Modal */}
      {showDecisionModal && selectedRequest && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center gap-2">
                {decisionType === 'approve' ? (
                  <CheckCircle className="h-5 w-5 text-green-600" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-600" />
                )}
                <h3 className="text-lg font-semibold text-gray-900">
                  {decisionType === 'approve' ? 'Approve Request' : 'Reject Request'}
                </h3>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-gray-50 rounded p-4">
                <p className="text-sm text-gray-600">
                  <span className="font-medium">Request:</span> {selectedRequest.entity_type} -{' '}
                  {selectedRequest.action}
                </p>
                {selectedRequest.entity_title && (
                  <p className="text-sm text-gray-600 mt-2">
                    <span className="font-medium">Title:</span> {selectedRequest.entity_title}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <MessageSquare className="h-4 w-4 inline mr-2" />
                  {decisionType === 'approve' ? 'Comment' : 'Reason'} (Optional)
                </label>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder={
                    decisionType === 'approve'
                      ? 'Add a comment for the submitter...'
                      : 'Explain why you are rejecting this request...'
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  rows={4}
                />
              </div>
            </div>
            <div className="p-6 border-t border-gray-200 flex gap-3 justify-end">
              <Button
                onClick={() => setShowDecisionModal(false)}
                variant="outline"
                size="sm"
                disabled={processingId !== null}
              >
                Cancel
              </Button>
              <Button
                onClick={handleDecision}
                variant={decisionType === 'approve' ? 'primary' : 'destructive'}
                size="sm"
                isLoading={processingId === selectedRequest.id}
              >
                {decisionType === 'approve' ? 'Approve' : 'Reject'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
