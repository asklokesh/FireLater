'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Clock,
  User,
  MessageSquare,
  CheckCircle,
  XCircle,
  AlertCircle,
  Send,
  Loader2,
  Play,
  Ban,
  History,
  ShoppingCart,
  Edit,
  Save,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { requestsApi, usersApi } from '@/lib/api';

interface RequestData {
  id: string;
  request_id: string;
  status: string;
  priority: string;
  form_data: Record<string, unknown>;
  notes: string | null;
  cost_center: string | null;
  due_date: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  catalog_item: {
    id: string;
    name: string;
    description: string;
  };
  requester: {
    id: string;
    name: string;
    email: string;
  };
  requested_for: {
    id: string;
    name: string;
    email: string;
  } | null;
  assigned_to: {
    id: string;
    name: string;
    email: string;
  } | null;
}

interface ApprovalData {
  id: string;
  step_name: string;
  status: string;
  approver_id: string | null;
  approver_name: string | null;
  comments: string | null;
  approved_at: string | null;
  rejected_at: string | null;
  delegated_to_id: string | null;
  delegated_to_name: string | null;
  created_at: string;
}

interface CommentData {
  id: string;
  content: string;
  is_internal: boolean;
  user: {
    id: string;
    name: string;
    email: string;
  };
  created_at: string;
}

interface HistoryData {
  id: string;
  from_status: string | null;
  to_status: string;
  changed_by_name: string;
  notes: string | null;
  created_at: string;
}

interface UserData {
  id: string;
  name: string;
  email: string;
}

const statusConfig: Record<string, { bg: string; text: string; icon: typeof CheckCircle }> = {
  submitted: { bg: 'bg-blue-100', text: 'text-blue-800', icon: Clock },
  pending_approval: { bg: 'bg-yellow-100', text: 'text-yellow-800', icon: Clock },
  approved: { bg: 'bg-green-100', text: 'text-green-800', icon: CheckCircle },
  rejected: { bg: 'bg-red-100', text: 'text-red-800', icon: XCircle },
  in_progress: { bg: 'bg-purple-100', text: 'text-purple-800', icon: Play },
  completed: { bg: 'bg-green-100', text: 'text-green-800', icon: CheckCircle },
  cancelled: { bg: 'bg-gray-100', text: 'text-gray-800', icon: Ban },
};

const priorityConfig: Record<string, { bg: string; text: string }> = {
  low: { bg: 'bg-gray-100', text: 'text-gray-800' },
  medium: { bg: 'bg-blue-100', text: 'text-blue-800' },
  high: { bg: 'bg-orange-100', text: 'text-orange-800' },
  critical: { bg: 'bg-red-100', text: 'text-red-800' },
};

export default function RequestDetailPage() {
  const params = useParams();
  const _router = useRouter();
  const requestId = params.id as string;

  const [request, setRequest] = useState<RequestData | null>(null);
  const [approvals, setApprovals] = useState<ApprovalData[]>([]);
  const [comments, setComments] = useState<CommentData[]>([]);
  const [history, setHistory] = useState<HistoryData[]>([]);
  const [users, setUsers] = useState<UserData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'details' | 'approvals' | 'comments' | 'history'>('details');

  // Action states
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [newComment, setNewComment] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [approvalComment, setApprovalComment] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [selectedAssignee, setSelectedAssignee] = useState('');

  // Inline editing states
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    priority: 'medium' as 'low' | 'medium' | 'high' | 'critical',
    notes: '',
    costCenter: '',
  });

  const loadRequest = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await requestsApi.get(requestId);
      setRequest(data);
    } catch (err) {
      console.error('Failed to load request:', err);
      setError('Failed to load request details');
    } finally {
      setIsLoading(false);
    }
  }, [requestId]);

  const loadApprovals = useCallback(async () => {
    try {
      const response = await requestsApi.getApprovals(requestId);
      setApprovals(response.data || []);
    } catch (err) {
      console.error('Failed to load approvals:', err);
    }
  }, [requestId]);

  const loadComments = useCallback(async () => {
    try {
      const response = await requestsApi.getComments(requestId);
      setComments(response.data || []);
    } catch (err) {
      console.error('Failed to load comments:', err);
    }
  }, [requestId]);

  const loadHistory = useCallback(async () => {
    try {
      const response = await requestsApi.getHistory(requestId);
      setHistory(response.data || []);
    } catch (err) {
      console.error('Failed to load history:', err);
    }
  }, [requestId]);

  const loadUsers = useCallback(async () => {
    try {
      const response = await usersApi.list({ limit: 100 });
      setUsers(response.data || []);
    } catch (err) {
      console.error('Failed to load users:', err);
    }
  }, []);

  useEffect(() => {
    loadRequest();
    loadApprovals();
    loadComments();
    loadHistory();
    loadUsers();
  }, [loadRequest, loadApprovals, loadComments, loadHistory, loadUsers]);

  useEffect(() => {
    if (request) {
      setEditForm({
        priority: (request.priority as 'low' | 'medium' | 'high' | 'critical') || 'medium',
        notes: request.notes || '',
        costCenter: request.cost_center || '',
      });
    }
  }, [request]);

  const handleSaveEdit = async () => {
    try {
      setIsSubmitting(true);
      setActionError(null);
      await requestsApi.update(requestId, {
        priority: editForm.priority,
        notes: editForm.notes || undefined,
        costCenter: editForm.costCenter || undefined,
      });
      setIsEditing(false);
      loadRequest();
      loadHistory();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update request';
      setActionError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelEdit = () => {
    if (request) {
      setEditForm({
        priority: (request.priority as 'low' | 'medium' | 'high' | 'critical') || 'medium',
        notes: request.notes || '',
        costCenter: request.cost_center || '',
      });
    }
    setIsEditing(false);
    setActionError(null);
  };

  const handleApprove = async (approvalId: string) => {
    try {
      setIsSubmitting(true);
      setActionError(null);
      await requestsApi.approve(requestId, approvalId, approvalComment);
      setApprovalComment('');
      loadRequest();
      loadApprovals();
      loadHistory();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to approve request';
      setActionError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReject = async (approvalId: string) => {
    try {
      setIsSubmitting(true);
      setActionError(null);
      await requestsApi.reject(requestId, approvalId, approvalComment);
      setApprovalComment('');
      loadRequest();
      loadApprovals();
      loadHistory();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to reject request';
      setActionError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;

    try {
      setIsSubmitting(true);
      setActionError(null);
      await requestsApi.addComment(requestId, newComment, isInternal);
      setNewComment('');
      loadComments();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to add comment';
      setActionError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAssign = async () => {
    if (!selectedAssignee) return;

    try {
      setIsSubmitting(true);
      setActionError(null);
      await requestsApi.assign(requestId, selectedAssignee);
      setSelectedAssignee('');
      loadRequest();
      loadHistory();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to assign request';
      setActionError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStart = async () => {
    try {
      setIsSubmitting(true);
      setActionError(null);
      await requestsApi.start(requestId);
      loadRequest();
      loadHistory();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start request';
      setActionError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleComplete = async () => {
    try {
      setIsSubmitting(true);
      setActionError(null);
      await requestsApi.complete(requestId);
      loadRequest();
      loadHistory();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to complete request';
      setActionError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = async () => {
    if (!cancelReason.trim()) return;

    try {
      setIsSubmitting(true);
      setActionError(null);
      await requestsApi.cancel(requestId, cancelReason);
      setShowCancelModal(false);
      setCancelReason('');
      loadRequest();
      loadHistory();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to cancel request';
      setActionError(message);
    } finally {
      setIsSubmitting(false);
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (error || !request) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
        <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-red-800 mb-2">{error || 'Request not found'}</h3>
        <Link href="/catalog">
          <Button variant="outline">Back to Catalog</Button>
        </Link>
      </div>
    );
  }

  const statusCfg = statusConfig[request.status] || statusConfig.submitted;
  const priorityCfg = priorityConfig[request.priority] || priorityConfig.medium;
  const StatusIcon = statusCfg.icon;

  const canStart = request.status === 'approved' && request.assigned_to;
  const canComplete = request.status === 'in_progress';
  const canCancel = !['completed', 'cancelled'].includes(request.status);
  const canEdit = !['completed', 'cancelled', 'rejected'].includes(request.status);

  return (
    <div className="space-y-6">
      {/* Action Error Alert */}
      {actionError && (
        <div className="flex items-center gap-2 p-4 text-sm text-red-800 bg-red-100 rounded-md">
          <AlertCircle className="h-4 w-4" />
          {actionError}
          <button
            onClick={() => setActionError(null)}
            className="ml-auto text-red-600 hover:text-red-800"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start space-x-4">
          <Link href="/catalog" className="mt-1">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center space-x-3">
              <h1 className="text-2xl font-bold text-gray-900">{request.request_id}</h1>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusCfg.bg} ${statusCfg.text}`}>
                <StatusIcon className="h-3 w-3 mr-1" />
                {request.status.replace('_', ' ')}
              </span>
              {isEditing ? (
                <select
                  value={editForm.priority}
                  onChange={(e) => setEditForm({ ...editForm, priority: e.target.value as 'low' | 'medium' | 'high' | 'critical' })}
                  className="px-2 py-1 border border-gray-300 rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              ) : (
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${priorityCfg.bg} ${priorityCfg.text}`}>
                  {request.priority}
                </span>
              )}
            </div>
            <p className="mt-1 text-lg text-gray-600">{request.catalog_item.name}</p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          {isEditing ? (
            <>
              <Button variant="outline" onClick={handleCancelEdit} disabled={isSubmitting}>
                <X className="h-4 w-4 mr-2" />
                Cancel
              </Button>
              <Button onClick={handleSaveEdit} disabled={isSubmitting}>
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Save
              </Button>
            </>
          ) : (
            <>
              {canEdit && (
                <Button variant="outline" onClick={() => setIsEditing(true)}>
                  <Edit className="h-4 w-4 mr-2" />
                  Edit
                </Button>
              )}
              {canStart && (
                <Button onClick={handleStart} disabled={isSubmitting}>
                  <Play className="h-4 w-4 mr-2" />
                  Start Work
                </Button>
              )}
              {canComplete && (
                <Button onClick={handleComplete} disabled={isSubmitting}>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Complete
                </Button>
              )}
              {canCancel && (
                <Button variant="outline" onClick={() => setShowCancelModal(true)}>
                  <Ban className="h-4 w-4 mr-2" />
                  Cancel
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Main Info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Tabs */}
          <div className="bg-white rounded-lg shadow">
            <div className="border-b border-gray-200">
              <nav className="flex -mb-px">
                {[
                  { id: 'details', label: 'Details', icon: ShoppingCart },
                  { id: 'approvals', label: 'Approvals', icon: CheckCircle },
                  { id: 'comments', label: 'Comments', icon: MessageSquare },
                  { id: 'history', label: 'History', icon: History },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as typeof activeTab)}
                    className={`flex items-center px-6 py-4 text-sm font-medium border-b-2 ${
                      activeTab === tab.id
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    <tab.icon className="h-4 w-4 mr-2" />
                    {tab.label}
                    {tab.id === 'approvals' && approvals.filter((a) => a.status === 'pending').length > 0 && (
                      <span className="ml-2 px-2 py-0.5 text-xs bg-yellow-100 text-yellow-800 rounded-full">
                        {approvals.filter((a) => a.status === 'pending').length}
                      </span>
                    )}
                    {tab.id === 'comments' && comments.length > 0 && (
                      <span className="ml-2 px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded-full">
                        {comments.length}
                      </span>
                    )}
                  </button>
                ))}
              </nav>
            </div>

            <div className="p-6">
              {/* Details Tab */}
              {activeTab === 'details' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-sm font-medium text-gray-500 mb-2">Description</h3>
                    <p className="text-gray-900">{request.catalog_item.description}</p>
                  </div>

                  <div>
                    <h3 className="text-sm font-medium text-gray-500 mb-2">Additional Notes</h3>
                    {isEditing ? (
                      <textarea
                        value={editForm.notes}
                        onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        rows={3}
                        placeholder="Add additional notes..."
                      />
                    ) : (
                      <p className="text-gray-900">{request.notes || 'No additional notes'}</p>
                    )}
                  </div>

                  <div>
                    <h3 className="text-sm font-medium text-gray-500 mb-2">Form Data</h3>
                    <div className="bg-gray-50 rounded-lg p-4">
                      {Object.entries(request.form_data).length > 0 ? (
                        <dl className="space-y-2">
                          {Object.entries(request.form_data).map(([key, value]) => (
                            <div key={key} className="flex justify-between">
                              <dt className="text-sm text-gray-500 capitalize">{key.replace(/_/g, ' ')}</dt>
                              <dd className="text-sm font-medium text-gray-900">
                                {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                              </dd>
                            </div>
                          ))}
                        </dl>
                      ) : (
                        <p className="text-sm text-gray-500">No form data submitted</p>
                      )}
                    </div>
                  </div>

                  {request.cancel_reason && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                      <h3 className="text-sm font-medium text-red-800 mb-1">Cancellation Reason</h3>
                      <p className="text-sm text-red-700">{request.cancel_reason}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Approvals Tab */}
              {activeTab === 'approvals' && (
                <div className="space-y-4">
                  {approvals.length === 0 ? (
                    <p className="text-gray-500 text-center py-8">No approvals required for this request</p>
                  ) : (
                    approvals.map((approval) => (
                      <div key={approval.id} className="border border-gray-200 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div>
                            <h4 className="font-medium text-gray-900">{approval.step_name}</h4>
                            <p className="text-sm text-gray-500">
                              {approval.approver_name || 'Pending assignment'}
                            </p>
                          </div>
                          <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            approval.status === 'approved' ? 'bg-green-100 text-green-800' :
                            approval.status === 'rejected' ? 'bg-red-100 text-red-800' :
                            'bg-yellow-100 text-yellow-800'
                          }`}>
                            {approval.status}
                          </span>
                        </div>

                        {approval.comments && (
                          <p className="text-sm text-gray-600 mb-3">{approval.comments}</p>
                        )}

                        {approval.status === 'pending' && (
                          <div className="space-y-3">
                            <textarea
                              value={approvalComment}
                              onChange={(e) => setApprovalComment(e.target.value)}
                              placeholder="Add comments (optional)"
                              rows={2}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <div className="flex space-x-2">
                              <Button
                                onClick={() => handleApprove(approval.id)}
                                disabled={isSubmitting}
                                size="sm"
                              >
                                <CheckCircle className="h-4 w-4 mr-1" />
                                Approve
                              </Button>
                              <Button
                                onClick={() => handleReject(approval.id)}
                                disabled={isSubmitting}
                                variant="outline"
                                size="sm"
                                className="text-red-600 border-red-300 hover:bg-red-50"
                              >
                                <XCircle className="h-4 w-4 mr-1" />
                                Reject
                              </Button>
                            </div>
                          </div>
                        )}

                        {(approval.approved_at || approval.rejected_at) && (
                          <p className="text-xs text-gray-500 mt-2">
                            {approval.status === 'approved' ? 'Approved' : 'Rejected'} on{' '}
                            {formatDate(approval.approved_at || approval.rejected_at || '')}
                          </p>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Comments Tab */}
              {activeTab === 'comments' && (
                <div className="space-y-4">
                  {/* Comment Form */}
                  <form onSubmit={handleAddComment} className="space-y-3">
                    <textarea
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      placeholder="Add a comment..."
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <div className="flex items-center justify-between">
                      <label className="flex items-center text-sm text-gray-600">
                        <input
                          type="checkbox"
                          checked={isInternal}
                          onChange={(e) => setIsInternal(e.target.checked)}
                          className="mr-2 rounded"
                        />
                        Internal note (not visible to requester)
                      </label>
                      <Button type="submit" disabled={isSubmitting || !newComment.trim()} size="sm">
                        <Send className="h-4 w-4 mr-1" />
                        Send
                      </Button>
                    </div>
                  </form>

                  {/* Comments List */}
                  <div className="space-y-4">
                    {comments.length === 0 ? (
                      <p className="text-gray-500 text-center py-8">No comments yet</p>
                    ) : (
                      comments.map((comment) => (
                        <div
                          key={comment.id}
                          className={`p-4 rounded-lg ${
                            comment.is_internal ? 'bg-yellow-50 border border-yellow-200' : 'bg-gray-50'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center">
                              <div className="h-8 w-8 rounded-full bg-gray-200 flex items-center justify-center text-sm font-medium text-gray-600">
                                {comment.user.name.charAt(0)}
                              </div>
                              <div className="ml-3">
                                <p className="text-sm font-medium text-gray-900">{comment.user.name}</p>
                                <p className="text-xs text-gray-500">{formatDate(comment.created_at)}</p>
                              </div>
                            </div>
                            {comment.is_internal && (
                              <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded">
                                Internal
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-gray-700 whitespace-pre-wrap">{comment.content}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* History Tab */}
              {activeTab === 'history' && (
                <div className="space-y-4">
                  {history.length === 0 ? (
                    <p className="text-gray-500 text-center py-8">No history available</p>
                  ) : (
                    <div className="flow-root">
                      <ul className="-mb-8">
                        {history.map((item, idx) => (
                          <li key={item.id}>
                            <div className="relative pb-8">
                              {idx !== history.length - 1 && (
                                <span className="absolute top-4 left-4 -ml-px h-full w-0.5 bg-gray-200" />
                              )}
                              <div className="relative flex space-x-3">
                                <div>
                                  <span className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center">
                                    <History className="h-4 w-4 text-blue-600" />
                                  </span>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm text-gray-500">
                                    <span className="font-medium text-gray-900">{item.changed_by_name}</span>
                                    {' changed status '}
                                    {item.from_status && (
                                      <>
                                        from{' '}
                                        <span className="font-medium">{item.from_status.replace('_', ' ')}</span>
                                        {' '}
                                      </>
                                    )}
                                    to{' '}
                                    <span className="font-medium">{item.to_status.replace('_', ' ')}</span>
                                  </div>
                                  {item.notes && (
                                    <p className="mt-1 text-sm text-gray-600">{item.notes}</p>
                                  )}
                                  <p className="mt-1 text-xs text-gray-400">{formatDate(item.created_at)}</p>
                                </div>
                              </div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column - Sidebar */}
        <div className="space-y-6">
          {/* Request Info */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Request Information</h3>
            <dl className="space-y-4">
              <div>
                <dt className="text-sm text-gray-500">Requester</dt>
                <dd className="mt-1 flex items-center">
                  <User className="h-4 w-4 text-gray-400 mr-2" />
                  <span className="text-sm font-medium text-gray-900">{request.requester.name}</span>
                </dd>
              </div>

              {request.requested_for && request.requested_for.id !== request.requester.id && (
                <div>
                  <dt className="text-sm text-gray-500">Requested For</dt>
                  <dd className="mt-1 flex items-center">
                    <User className="h-4 w-4 text-gray-400 mr-2" />
                    <span className="text-sm font-medium text-gray-900">{request.requested_for.name}</span>
                  </dd>
                </div>
              )}

              <div>
                <dt className="text-sm text-gray-500">Created</dt>
                <dd className="mt-1 flex items-center">
                  <Clock className="h-4 w-4 text-gray-400 mr-2" />
                  <span className="text-sm text-gray-900">{formatDate(request.created_at)}</span>
                </dd>
              </div>

              {request.due_date && (
                <div>
                  <dt className="text-sm text-gray-500">Due Date</dt>
                  <dd className="mt-1 flex items-center">
                    <Clock className="h-4 w-4 text-gray-400 mr-2" />
                    <span className="text-sm text-gray-900">{formatDate(request.due_date)}</span>
                  </dd>
                </div>
              )}

              <div>
                <dt className="text-sm text-gray-500">Cost Center</dt>
                {isEditing ? (
                  <dd className="mt-1">
                    <Input
                      value={editForm.costCenter}
                      onChange={(e) => setEditForm({ ...editForm, costCenter: e.target.value })}
                      placeholder="Enter cost center..."
                      className="text-sm"
                    />
                  </dd>
                ) : (
                  <dd className="mt-1 text-sm text-gray-900">{request.cost_center || '-'}</dd>
                )}
              </div>

              {request.completed_at && (
                <div>
                  <dt className="text-sm text-gray-500">Completed</dt>
                  <dd className="mt-1 flex items-center">
                    <CheckCircle className="h-4 w-4 text-green-500 mr-2" />
                    <span className="text-sm text-gray-900">{formatDate(request.completed_at)}</span>
                  </dd>
                </div>
              )}
            </dl>
          </div>

          {/* Assignment */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Assignment</h3>
            {request.assigned_to ? (
              <div className="flex items-center">
                <div className="h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center text-sm font-medium text-gray-600">
                  {request.assigned_to.name.charAt(0)}
                </div>
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-900">{request.assigned_to.name}</p>
                  <p className="text-xs text-gray-500">{request.assigned_to.email}</p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-gray-500">Not assigned</p>
                <div className="flex space-x-2">
                  <select
                    value={selectedAssignee}
                    onChange={(e) => setSelectedAssignee(e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select user...</option>
                    {users.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name}
                      </option>
                    ))}
                  </select>
                  <Button onClick={handleAssign} disabled={!selectedAssignee || isSubmitting} size="sm">
                    Assign
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Timeline Summary */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Progress</h3>
            <div className="space-y-3">
              {['submitted', 'pending_approval', 'approved', 'in_progress', 'completed'].map((status, _idx) => {
                const isActive = request.status === status;
                const isPast = [
                  'submitted',
                  ...(request.status !== 'submitted' ? ['pending_approval'] : []),
                  ...(request.status === 'approved' || request.status === 'in_progress' || request.status === 'completed' ? ['approved'] : []),
                  ...(request.status === 'in_progress' || request.status === 'completed' ? ['in_progress'] : []),
                  ...(request.status === 'completed' ? ['completed'] : []),
                ].includes(status);

                return (
                  <div key={status} className="flex items-center">
                    <div className={`h-3 w-3 rounded-full ${
                      isActive ? 'bg-blue-500' : isPast ? 'bg-green-500' : 'bg-gray-300'
                    }`} />
                    <span className={`ml-3 text-sm ${
                      isActive ? 'text-blue-600 font-medium' : isPast ? 'text-gray-900' : 'text-gray-400'
                    }`}>
                      {status.replace('_', ' ').charAt(0).toUpperCase() + status.replace('_', ' ').slice(1)}
                    </span>
                  </div>
                );
              })}
              {request.status === 'cancelled' && (
                <div className="flex items-center">
                  <div className="h-3 w-3 rounded-full bg-red-500" />
                  <span className="ml-3 text-sm text-red-600 font-medium">Cancelled</span>
                </div>
              )}
              {request.status === 'rejected' && (
                <div className="flex items-center">
                  <div className="h-3 w-3 rounded-full bg-red-500" />
                  <span className="ml-3 text-sm text-red-600 font-medium">Rejected</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Cancel Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Cancel Request</h2>
            <p className="text-sm text-gray-600 mb-4">
              Please provide a reason for cancelling this request.
            </p>
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Reason for cancellation..."
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
            />
            <div className="flex justify-end space-x-3">
              <Button variant="outline" onClick={() => setShowCancelModal(false)}>
                Keep Request
              </Button>
              <Button
                onClick={handleCancel}
                disabled={!cancelReason.trim() || isSubmitting}
                className="bg-red-600 hover:bg-red-700"
              >
                Cancel Request
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
