'use client';

import { useState, useEffect } from 'react';
import { CheckSquare, Loader2, AlertCircle, CheckCircle, Clock, XCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';

interface MakerCheckerApproval {
  approver_id: string;
  approver_email: string;
  decision: 'approved' | 'rejected';
  comment: string | null;
  decided_at: string;
}

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
  approvals: MakerCheckerApproval[];
}

type FilterStatus = 'pending' | 'approved' | 'rejected' | 'all';

const statusColors: Record<string, { bg: string; text: string; icon: LucideIcon }> = {
  pending: { bg: 'bg-yellow-100', text: 'text-yellow-800', icon: Clock },
  approved: { bg: 'bg-green-100', text: 'text-green-800', icon: CheckCircle },
  rejected: { bg: 'bg-red-100', text: 'text-red-800', icon: XCircle },
  expired: { bg: 'bg-gray-100', text: 'text-gray-800', icon: Clock },
};

export default function MakerCheckerPage() {
  const user = useAuthStore((state) => state.user);

  const [requests, setRequests] = useState<MakerCheckerRequest[]>([]);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('pending');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [approvingRequestId, setApprovingRequestId] = useState<string | null>(null);
  const [approvingComment, setApprovingComment] = useState('');
  const [rejectingRequestId, setRejectingRequestId] = useState<string | null>(null);
  const [rejectingReason, setRejectingReason] = useState('');

  useEffect(() => {
    loadRequests();
  }, [filterStatus]);

  const loadRequests = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const params: Record<string, string> = {};
      if (filterStatus !== 'all') {
        params.status = filterStatus;
      }

      const response = await api.get('/v1/maker-checker/requests', { params });
      setRequests(response.data || []);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load requests';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleApprove = async (requestId: string) => {
    if (!user) return;

    try {
      setIsSubmitting(requestId);
      setError(null);

      await api.post(`/v1/maker-checker/requests/${requestId}/approve`, {
        approverId: user.id,
        approverEmail: user.email,
        comment: approvingComment,
      });

      setSuccessMessage('Request approved successfully');
      setTimeout(() => setSuccessMessage(null), 3000);
      setApprovingRequestId(null);
      setApprovingComment('');

      await loadRequests();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to approve request';
      setError(message);
    } finally {
      setIsSubmitting(null);
    }
  };

  const handleReject = async (requestId: string) => {
    if (!user) return;

    try {
      setIsSubmitting(requestId);
      setError(null);

      await api.post(`/v1/maker-checker/requests/${requestId}/reject`, {
        approverId: user.id,
        approverEmail: user.email,
        reason: rejectingReason,
      });

      setSuccessMessage('Request rejected successfully');
      setTimeout(() => setSuccessMessage(null), 3000);
      setRejectingRequestId(null);
      setRejectingReason('');

      await loadRequests();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to reject request';
      setError(message);
    } finally {
      setIsSubmitting(null);
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

  const filteredRequests =
    filterStatus === 'all'
      ? requests
      : requests.filter((req) => req.status === filterStatus);

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
          <CheckSquare className="h-8 w-8 text-blue-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Maker-Checker Approvals</h1>
            <p className="mt-1 text-sm text-gray-500">
              Dual-approval workflow for high-risk changes (SOX ITGC requirement)
            </p>
          </div>
        </div>
      </div>

      <div className="flex gap-2 border-b border-gray-200">
        {(['pending', 'approved', 'rejected', 'all'] as const).map((status) => (
          <button
            key={status}
            onClick={() => setFilterStatus(status)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              filterStatus === status
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </button>
        ))}
      </div>

      {filteredRequests.length > 0 ? (
        <div className="space-y-4">
          {filteredRequests.map((request) => {
            const StatusIcon = statusColors[request.status]?.icon || Clock;
            const statusConfig = statusColors[request.status];

            return (
              <div key={request.id} className="bg-white rounded-lg shadow p-6 space-y-4">
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
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
                      <h3 className="mt-2 text-lg font-semibold text-gray-900">
                        {request.entity_title}
                      </h3>
                    )}
                    <p className="mt-1 text-sm text-gray-500">
                      Entity ID: {request.entity_id}
                    </p>
                  </div>
                </div>

                {/* Submitter and Dates */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 py-3 border-t border-b border-gray-200">
                  <div>
                    <p className="text-xs text-gray-500 uppercase">Submitter</p>
                    <p className="text-sm font-medium text-gray-900">{request.submitter_email}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase">Created</p>
                    <p className="text-sm font-medium text-gray-900">
                      {formatDate(request.created_at)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase">Expires</p>
                    <p className="text-sm font-medium text-gray-900">
                      {request.expires_at ? formatDate(request.expires_at) : 'Never'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase">Approvals</p>
                    <p className="text-sm font-medium text-gray-900">
                      {request.current_approvals} of {request.required_approvals}
                    </p>
                  </div>
                </div>

                {/* Approvals List */}
                {request.approvals.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-gray-700">Approval Details:</p>
                    <div className="space-y-2">
                      {request.approvals.map((approval, idx) => (
                        <div
                          key={idx}
                          className="flex items-start gap-3 p-3 bg-gray-50 rounded-md"
                        >
                          <div className="flex-1">
                            <p className="text-sm font-medium text-gray-900">
                              {approval.approver_email}
                            </p>
                            <p className="text-xs text-gray-500 mt-1">
                              {approval.decision === 'approved' ? 'Approved' : 'Rejected'} on{' '}
                              {formatDate(approval.decided_at)}
                            </p>
                            {approval.comment && (
                              <p className="text-xs text-gray-600 mt-1 italic">
                                &quot;{approval.comment}&quot;
                              </p>
                            )}
                          </div>
                          <span
                            className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
                              approval.decision === 'approved'
                                ? 'bg-green-100 text-green-800'
                                : 'bg-red-100 text-red-800'
                            }`}
                          >
                            {approval.decision === 'approved' ? 'Approved' : 'Rejected'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                {request.status === 'pending' && (
                  <div className="space-y-3 pt-2 border-t border-gray-200">
                    {/* Approve Section */}
                    {approvingRequestId === request.id ? (
                      <div className="space-y-2 p-3 bg-blue-50 rounded-md">
                        <label className="block text-sm font-medium text-gray-700">
                          Approval Comment (optional)
                        </label>
                        <textarea
                          value={approvingComment}
                          onChange={(e) => setApprovingComment(e.target.value)}
                          placeholder="Add a comment..."
                          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          rows={3}
                        />
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            onClick={() => {
                              setApprovingRequestId(null);
                              setApprovingComment('');
                            }}
                            size="sm"
                            disabled={isSubmitting === request.id}
                          >
                            Cancel
                          </Button>
                          <Button
                            onClick={() => handleApprove(request.id)}
                            size="sm"
                            disabled={isSubmitting === request.id}
                          >
                            {isSubmitting === request.id && (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            )}
                            Confirm Approve
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Button
                        onClick={() => setApprovingRequestId(request.id)}
                        className="w-full bg-green-600 hover:bg-green-700"
                        disabled={isSubmitting !== null}
                      >
                        Approve
                      </Button>
                    )}

                    {/* Reject Section */}
                    {rejectingRequestId === request.id ? (
                      <div className="space-y-2 p-3 bg-red-50 rounded-md">
                        <label className="block text-sm font-medium text-gray-700">
                          Rejection Reason
                        </label>
                        <textarea
                          value={rejectingReason}
                          onChange={(e) => setRejectingReason(e.target.value)}
                          placeholder="Explain why you're rejecting this request..."
                          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                          rows={3}
                        />
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            onClick={() => {
                              setRejectingRequestId(null);
                              setRejectingReason('');
                            }}
                            size="sm"
                            disabled={isSubmitting === request.id}
                          >
                            Cancel
                          </Button>
                          <Button
                            onClick={() => handleReject(request.id)}
                            size="sm"
                            disabled={isSubmitting === request.id || !rejectingReason}
                            className="bg-red-600 hover:bg-red-700"
                          >
                            {isSubmitting === request.id && (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            )}
                            Confirm Reject
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Button
                        variant="outline"
                        onClick={() => setRejectingRequestId(request.id)}
                        className="w-full text-red-600 border-red-300 hover:bg-red-50"
                        disabled={isSubmitting !== null}
                      >
                        Reject
                      </Button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-12 bg-white rounded-lg shadow">
          <CheckSquare className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            No {filterStatus !== 'all' ? filterStatus : ''} approvals
          </h3>
          <p className="text-gray-500">
            {filterStatus === 'pending'
              ? 'No pending requests awaiting approval'
              : `No ${filterStatus} requests at this time`}
          </p>
        </div>
      )}
    </div>
  );
}
