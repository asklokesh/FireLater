'use client';

import { useT } from '@/i18n/useT';
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

const FILTER_KEYS: Record<string, string> = { pending: 'fPending', approved: 'fApproved', rejected: 'fRejected', all: 'fAll' };

type FilterStatus = 'pending' | 'approved' | 'rejected' | 'all';

const statusColors: Record<string, { bg: string; text: string; icon: LucideIcon }> = {
  pending: { bg: 'bg-warning-subtle', text: 'text-warning', icon: Clock },
  approved: { bg: 'bg-success-subtle', text: 'text-success', icon: CheckCircle },
  rejected: { bg: 'bg-error-subtle', text: 'text-error', icon: XCircle },
  expired: { bg: 'bg-background', text: 'text-foreground', icon: Clock },
};

export default function MakerCheckerPage() {
  const mc = useT('makerChecker');
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
      const message = err instanceof Error ? err.message : mc('loadFailed');
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

      setSuccessMessage(mc('approvedOk'));
      setTimeout(() => setSuccessMessage(null), 3000);
      setApprovingRequestId(null);
      setApprovingComment('');

      await loadRequests();
    } catch (err) {
      const message = err instanceof Error ? err.message : mc('approveFailed');
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

      setSuccessMessage(mc('rejectedOk'));
      setTimeout(() => setSuccessMessage(null), 3000);
      setRejectingRequestId(null);
      setRejectingReason('');

      await loadRequests();
    } catch (err) {
      const message = err instanceof Error ? err.message : mc('rejectFailed');
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
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="flex items-start gap-3 p-4 text-sm text-error bg-error-subtle rounded-xl">
          <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
          <div className="flex-1">{error}</div>
          <button
            onClick={() => setError(null)}
            className="text-error hover:text-error font-medium"
          >
            {mc('dismiss')}
          </button>
        </div>
      )}

      {successMessage && (
        <div className="flex items-start gap-3 p-4 text-sm text-success bg-success-subtle rounded-xl">
          <CheckCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
          <div className="flex-1">{successMessage}</div>
        </div>
      )}

      <div>
        <div className="flex items-center gap-3">
          <CheckSquare className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold text-foreground">{mc('title')}</h1>
            <p className="mt-1 text-sm text-muted">
              {mc('subtitle')}
            </p>
          </div>
        </div>
      </div>

      <div className="flex gap-2 border-b border-border">
        {(['pending', 'approved', 'rejected', 'all'] as const).map((status) => (
          <button
            key={status}
            onClick={() => setFilterStatus(status)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              filterStatus === status
                ? 'border-primary text-primary'
                : 'border-transparent text-secondary hover:text-foreground'
            }`}
          >
            {mc(FILTER_KEYS[status])}
          </button>
        ))}
      </div>

      {filteredRequests.length > 0 ? (
        <div className="space-y-4">
          {filteredRequests.map((request) => {
            const StatusIcon = statusColors[request.status]?.icon || Clock;
            const statusConfig = statusColors[request.status];

            return (
              <div key={request.id} className="bg-surface rounded-xl shadow-sm p-6 space-y-4">
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-info-subtle text-foreground">
                        {request.entity_type}
                      </span>
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-background text-foreground">
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
                      <h3 className="mt-2 text-lg font-semibold text-foreground">
                        {request.entity_title}
                      </h3>
                    )}
                    <p className="mt-1 text-sm text-muted">
                      Entity ID: {request.entity_id}
                    </p>
                  </div>
                </div>

                {/* Submitter and Dates */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 py-3 border-t border-b border-border">
                  <div>
                    <p className="text-xs text-muted uppercase">{mc('submitter')}</p>
                    <p className="text-sm font-medium text-foreground">{request.submitter_email}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted uppercase">{mc('created')}</p>
                    <p className="text-sm font-medium text-foreground">
                      {formatDate(request.created_at)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted uppercase">{mc('expires')}</p>
                    <p className="text-sm font-medium text-foreground">
                      {request.expires_at ? formatDate(request.expires_at) : 'Never'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted uppercase">{mc('approvals')}</p>
                    <p className="text-sm font-medium text-foreground">
                      {request.current_approvals} of {request.required_approvals}
                    </p>
                  </div>
                </div>

                {/* Approvals List */}
                {request.approvals.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-secondary">{mc('approvalDetails')}</p>
                    <div className="space-y-2">
                      {request.approvals.map((approval, idx) => (
                        <div
                          key={idx}
                          className="flex items-start gap-3 p-3 bg-background rounded-xl"
                        >
                          <div className="flex-1">
                            <p className="text-sm font-medium text-foreground">
                              {approval.approver_email}
                            </p>
                            <p className="text-xs text-muted mt-1">
                              {approval.decision === 'approved' ? mc('approved') : mc('rejected')} {mc('onDate')}{' '}
                              {formatDate(approval.decided_at)}
                            </p>
                            {approval.comment && (
                              <p className="text-xs text-secondary mt-1 italic">
                                &quot;{approval.comment}&quot;
                              </p>
                            )}
                          </div>
                          <span
                            className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
                              approval.decision === 'approved'
                                ? 'bg-success-subtle text-success'
                                : 'bg-error-subtle text-error'
                            }`}
                          >
                            {approval.decision === 'approved' ? mc('approved') : mc('rejected')}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                {request.status === 'pending' && (
                  <div className="space-y-3 pt-2 border-t border-border">
                    {/* Approve Section */}
                    {approvingRequestId === request.id ? (
                      <div className="space-y-2 p-3 bg-primary-subtle rounded-xl">
                        <label className="block text-sm font-medium text-secondary">
                          {mc('approvalComment')}
                        </label>
                        <textarea
                          value={approvingComment}
                          onChange={(e) => setApprovingComment(e.target.value)}
                          placeholder={mc('commentPh')}
                          className="w-full px-3 py-2 border border-border-strong rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
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
                            {mc('cancel')}
                          </Button>
                          <Button
                            onClick={() => handleApprove(request.id)}
                            size="sm"
                            disabled={isSubmitting === request.id}
                          >
                            {isSubmitting === request.id && (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            )}
                            {mc('confirmApprove')}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Button
                        onClick={() => setApprovingRequestId(request.id)}
                        className="w-full bg-primary hover:bg-success"
                        disabled={isSubmitting !== null}
                      >
                        {mc('approve')}
                      </Button>
                    )}

                    {/* Reject Section */}
                    {rejectingRequestId === request.id ? (
                      <div className="space-y-2 p-3 bg-error-subtle rounded-xl">
                        <label className="block text-sm font-medium text-secondary">
                          {mc('rejectionReason')}
                        </label>
                        <textarea
                          value={rejectingReason}
                          onChange={(e) => setRejectingReason(e.target.value)}
                          placeholder={mc('rejectPh')}
                          className="w-full px-3 py-2 border border-border-strong rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-error"
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
                            {mc('cancel')}
                          </Button>
                          <Button
                            onClick={() => handleReject(request.id)}
                            size="sm"
                            disabled={isSubmitting === request.id || !rejectingReason}
                            className="bg-primary hover:bg-error"
                          >
                            {isSubmitting === request.id && (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            )}
                            {mc('confirmReject')}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Button
                        variant="outline"
                        onClick={() => setRejectingRequestId(request.id)}
                        className="w-full text-error border-red-300 hover:bg-error-subtle"
                        disabled={isSubmitting !== null}
                      >
                        {mc('reject')}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-12 bg-surface rounded-xl shadow-sm">
          <CheckSquare className="h-12 w-12 text-muted mx-auto mb-4" />
          <h3 className="text-lg font-medium text-foreground mb-2">
            {filterStatus === 'all' ? mc('noApprovals') : filterStatus === 'pending' ? mc('noPendingApprovals') : filterStatus === 'approved' ? mc('noApprovedApprovals') : mc('noRejectedApprovals')}
          </h3>
          <p className="text-muted">
            {filterStatus === 'pending'
              ? mc('noPendingBody')
              : mc('noOtherBody', { status: filterStatus })}
          </p>
        </div>
      )}
    </div>
  );
}
