'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Edit,
  X,
  Save,
  Clock,
  Calendar,
  CheckCircle,
  XCircle,
  MessageSquare,
  Send,
  MoreHorizontal,
  Play,
  RotateCcw,
  Loader2,
  AlertCircle,
  FileText,
  Users,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useChange, useChangeComments, useAddChangeComment, useUpdateChange, useApplications, useUsers, useGroups, ChangeComment } from '@/hooks/useApi';
import { changesApi } from '@/lib/api';

const statusColors: Record<string, { bg: string; text: string }> = {
  draft: { bg: 'bg-gray-100', text: 'text-gray-800' },
  submitted: { bg: 'bg-blue-100', text: 'text-blue-800' },
  review: { bg: 'bg-indigo-100', text: 'text-indigo-800' },
  approved: { bg: 'bg-green-100', text: 'text-green-800' },
  rejected: { bg: 'bg-red-100', text: 'text-red-800' },
  scheduled: { bg: 'bg-purple-100', text: 'text-purple-800' },
  implementing: { bg: 'bg-yellow-100', text: 'text-yellow-800' },
  completed: { bg: 'bg-green-100', text: 'text-green-800' },
  failed: { bg: 'bg-red-100', text: 'text-red-800' },
  rolled_back: { bg: 'bg-orange-100', text: 'text-orange-800' },
  cancelled: { bg: 'bg-gray-100', text: 'text-gray-800' },
};

const statusLabels: Record<string, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  review: 'In Review',
  approved: 'Approved',
  rejected: 'Rejected',
  scheduled: 'Scheduled',
  implementing: 'Implementing',
  completed: 'Completed',
  failed: 'Failed',
  rolled_back: 'Rolled Back',
  cancelled: 'Cancelled',
};

const typeColors: Record<string, { bg: string; text: string }> = {
  standard: { bg: 'bg-blue-100', text: 'text-blue-800' },
  normal: { bg: 'bg-gray-100', text: 'text-gray-800' },
  emergency: { bg: 'bg-red-100', text: 'text-red-800' },
};

const riskColors: Record<string, { bg: string; text: string }> = {
  low: { bg: 'bg-green-100', text: 'text-green-800' },
  medium: { bg: 'bg-yellow-100', text: 'text-yellow-800' },
  high: { bg: 'bg-orange-100', text: 'text-orange-800' },
  critical: { bg: 'bg-red-100', text: 'text-red-800' },
};

export default function ChangeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [newComment, setNewComment] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const changeId = params.id as string;
  const { data: change, isLoading, error: fetchError, refetch } = useChange(changeId);
  const { data: commentsData, isLoading: commentsLoading } = useChangeComments(changeId);
  const addComment = useAddChangeComment();
  const updateChange = useUpdateChange();
  const { data: applicationsData } = useApplications();
  const { data: usersData } = useUsers();
  const { data: groupsData } = useGroups();

  const applications = applicationsData?.data ?? [];
  const users = usersData?.data ?? [];
  const groups = groupsData?.data ?? [];
  const comments = commentsData?.data ?? [];

  const [editForm, setEditForm] = useState({
    title: '',
    description: '',
    justification: '',
    type: 'normal' as 'standard' | 'normal' | 'emergency',
    riskLevel: 'medium' as 'low' | 'medium' | 'high' | 'critical',
    impact: '' as '' | 'none' | 'minor' | 'moderate' | 'significant' | 'major',
    applicationId: '',
    implementerId: '',
    assignedGroup: '',
    plannedStart: '',
    plannedEnd: '',
    implementationPlan: '',
    rollbackPlan: '',
    testPlan: '',
  });

  useEffect(() => {
    if (change) {
      setEditForm({
        title: change.title || '',
        description: change.description || '',
        justification: change.justification || '',
        type: change.type || 'normal',
        riskLevel: change.risk_level || 'medium',
        impact: change.impact || '',
        applicationId: change.application_id || '',
        implementerId: change.implementer_id || '',
        assignedGroup: change.assigned_group || '',
        plannedStart: change.planned_start ? change.planned_start.slice(0, 16) : '',
        plannedEnd: change.planned_end ? change.planned_end.slice(0, 16) : '',
        implementationPlan: change.implementation_plan || '',
        rollbackPlan: change.rollback_plan || '',
        testPlan: change.test_plan || '',
      });
    }
  }, [change]);

  const handleSaveEdit = async () => {
    setError(null);
    try {
      await updateChange.mutateAsync({
        id: changeId,
        data: {
          title: editForm.title,
          description: editForm.description,
          justification: editForm.justification,
          type: editForm.type,
          riskLevel: editForm.riskLevel,
          impact: editForm.impact || undefined,
          applicationId: editForm.applicationId || undefined,
          implementerId: editForm.implementerId || undefined,
          assignedGroup: editForm.assignedGroup || undefined,
          plannedStart: editForm.plannedStart || undefined,
          plannedEnd: editForm.plannedEnd || undefined,
          implementationPlan: editForm.implementationPlan || undefined,
          rollbackPlan: editForm.rollbackPlan || undefined,
          testPlan: editForm.testPlan || undefined,
        },
      });
      setIsEditing(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update change';
      setError(message);
    }
  };

  const handleCancelEdit = () => {
    if (change) {
      setEditForm({
        title: change.title || '',
        description: change.description || '',
        justification: change.justification || '',
        type: change.type || 'normal',
        riskLevel: change.risk_level || 'medium',
        impact: change.impact || '',
        applicationId: change.application_id || '',
        implementerId: change.implementer_id || '',
        assignedGroup: change.assigned_group || '',
        plannedStart: change.planned_start ? change.planned_start.slice(0, 16) : '',
        plannedEnd: change.planned_end ? change.planned_end.slice(0, 16) : '',
        implementationPlan: change.implementation_plan || '',
        rollbackPlan: change.rollback_plan || '',
        testPlan: change.test_plan || '',
      });
    }
    setIsEditing(false);
    setError(null);
  };

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatRelativeTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;

    try {
      await addComment.mutateAsync({ id: changeId, content: newComment.trim() });
      setNewComment('');
    } catch (err) {
      console.error('Failed to add comment:', err);
    }
  };

  const handleAction = async (action: string) => {
    setActionLoading(action);
    try {
      switch (action) {
        case 'submit':
          await changesApi.submit(changeId);
          break;
        case 'approve':
          await changesApi.approve(changeId);
          break;
        case 'reject':
          const reason = prompt('Please provide a reason for rejection:');
          if (!reason) {
            setActionLoading(null);
            return;
          }
          await changesApi.reject(changeId, reason);
          break;
        case 'schedule':
          await changesApi.schedule(changeId);
          break;
        case 'start':
          await changesApi.start(changeId);
          break;
        case 'complete':
          await changesApi.complete(changeId);
          break;
        case 'fail':
          const failNotes = prompt('Please describe what went wrong:');
          if (!failNotes) {
            setActionLoading(null);
            return;
          }
          await changesApi.fail(changeId, failNotes);
          break;
        case 'rollback':
          const rollbackNotes = prompt('Please describe the rollback:');
          if (!rollbackNotes) {
            setActionLoading(null);
            return;
          }
          await changesApi.rollback(changeId, rollbackNotes);
          break;
        case 'cancel':
          const cancelReason = prompt('Please provide a reason for cancellation (optional):');
          await changesApi.cancel(changeId, cancelReason || undefined);
          break;
      }
      refetch();
    } catch (err) {
      console.error(`Failed to ${action} change:`, err);
      alert(`Failed to ${action} change. Please try again.`);
    } finally {
      setActionLoading(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (fetchError || !change) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Change not found</h2>
        <p className="text-gray-500 mb-4">The change request you&apos;re looking for doesn&apos;t exist or you don&apos;t have access to it.</p>
        <Button onClick={() => router.push('/changes')}>Back to Changes</Button>
      </div>
    );
  }

  const changeType = change.type || 'normal';
  const riskLevel = change.risk_level || 'medium';
  const status = change.status || 'draft';
  const typeStyle = typeColors[changeType] || typeColors.normal;
  const riskStyle = riskColors[riskLevel] || riskColors.medium;
  const statusStyle = statusColors[status] || statusColors.draft;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => router.back()}
            className="p-2 hover:bg-gray-100 rounded-md"
          >
            <ArrowLeft className="h-5 w-5 text-gray-500" />
          </button>
          <div>
            <div className="flex items-center space-x-3">
              <h1 className="text-2xl font-bold text-gray-900">{change.change_number}</h1>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${typeStyle.bg} ${typeStyle.text}`}>
                {changeType.charAt(0).toUpperCase() + changeType.slice(1)}
              </span>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${riskStyle.bg} ${riskStyle.text}`}>
                {riskLevel.charAt(0).toUpperCase() + riskLevel.slice(1)} Risk
              </span>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusStyle.bg} ${statusStyle.text}`}>
                {statusLabels[status] || status}
              </span>
            </div>
            {isEditing ? (
              <Input
                value={editForm.title}
                onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                className="mt-1 text-lg"
                placeholder="Change title"
              />
            ) : (
              <p className="mt-1 text-lg text-gray-700">{change.title}</p>
            )}
          </div>
        </div>
        <div className="flex items-center space-x-2">
          {isEditing ? (
            <>
              <Button variant="outline" onClick={handleCancelEdit} disabled={updateChange.isPending}>
                <X className="h-4 w-4 mr-2" />
                Cancel
              </Button>
              <Button onClick={handleSaveEdit} disabled={updateChange.isPending}>
                {updateChange.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Save
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setIsEditing(true)}>
                <Edit className="h-4 w-4 mr-2" />
                Edit
              </Button>
              <Button variant="outline">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="flex">
            <AlertCircle className="h-5 w-5 text-red-400 mr-2" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Description */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Description</h2>
            {isEditing ? (
              <textarea
                value={editForm.description}
                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={4}
                placeholder="Describe the change..."
              />
            ) : (
              <p className="text-gray-700 whitespace-pre-wrap">{change.description || 'No description provided.'}</p>
            )}
          </div>

          {/* Justification */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Justification</h2>
            {isEditing ? (
              <textarea
                value={editForm.justification}
                onChange={(e) => setEditForm({ ...editForm, justification: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={3}
                placeholder="Why is this change needed?"
              />
            ) : (
              <p className="text-gray-700 whitespace-pre-wrap">{change.justification || 'No justification provided.'}</p>
            )}
          </div>

          {/* Quick Actions */}
          {!isEditing && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Actions</h2>
              <div className="flex flex-wrap gap-2">
                {status === 'draft' && (
                  <Button size="sm" onClick={() => handleAction('submit')} disabled={actionLoading !== null}>
                    {actionLoading === 'submit' ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileText className="h-4 w-4 mr-2" />}
                    Submit for Approval
                  </Button>
                )}
                {(status === 'submitted' || status === 'review') && (
                  <>
                    <Button size="sm" onClick={() => handleAction('approve')} disabled={actionLoading !== null}>
                      {actionLoading === 'approve' ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle className="h-4 w-4 mr-2" />}
                      Approve
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleAction('reject')} disabled={actionLoading !== null}>
                      {actionLoading === 'reject' ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <XCircle className="h-4 w-4 mr-2" />}
                      Reject
                    </Button>
                  </>
                )}
                {status === 'approved' && (
                  <Button size="sm" onClick={() => handleAction('schedule')} disabled={actionLoading !== null}>
                    {actionLoading === 'schedule' ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Calendar className="h-4 w-4 mr-2" />}
                    Schedule
                  </Button>
                )}
                {status === 'scheduled' && (
                  <Button size="sm" onClick={() => handleAction('start')} disabled={actionLoading !== null}>
                    {actionLoading === 'start' ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
                    Start Implementation
                  </Button>
                )}
                {status === 'implementing' && (
                  <>
                    <Button size="sm" onClick={() => handleAction('complete')} disabled={actionLoading !== null}>
                      {actionLoading === 'complete' ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle className="h-4 w-4 mr-2" />}
                      Complete Successfully
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleAction('fail')} disabled={actionLoading !== null}>
                      {actionLoading === 'fail' ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <XCircle className="h-4 w-4 mr-2" />}
                      Mark as Failed
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleAction('rollback')} disabled={actionLoading !== null}>
                      {actionLoading === 'rollback' ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RotateCcw className="h-4 w-4 mr-2" />}
                      Rollback
                    </Button>
                  </>
                )}
                {['draft', 'submitted', 'review', 'approved', 'scheduled'].includes(status) && (
                  <Button size="sm" variant="outline" onClick={() => handleAction('cancel')} disabled={actionLoading !== null}>
                    {actionLoading === 'cancel' ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <XCircle className="h-4 w-4 mr-2" />}
                    Cancel
                  </Button>
                )}
                {['completed', 'failed', 'rolled_back', 'cancelled'].includes(status) && (
                  <span className="text-sm text-gray-500">This change is {statusLabels[status] || status}.</span>
                )}
              </div>
            </div>
          )}

          {/* Implementation Plans */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Implementation Plan</h2>
            {isEditing ? (
              <textarea
                value={editForm.implementationPlan}
                onChange={(e) => setEditForm({ ...editForm, implementationPlan: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={4}
                placeholder="Steps to implement this change..."
              />
            ) : (
              <p className="text-gray-700 whitespace-pre-wrap">{change.implementation_plan || 'No implementation plan provided.'}</p>
            )}
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Rollback Plan</h2>
            {isEditing ? (
              <textarea
                value={editForm.rollbackPlan}
                onChange={(e) => setEditForm({ ...editForm, rollbackPlan: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={4}
                placeholder="Steps to rollback if something goes wrong..."
              />
            ) : (
              <p className="text-gray-700 whitespace-pre-wrap">{change.rollback_plan || 'No rollback plan provided.'}</p>
            )}
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Test Plan</h2>
            {isEditing ? (
              <textarea
                value={editForm.testPlan}
                onChange={(e) => setEditForm({ ...editForm, testPlan: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={4}
                placeholder="How will this change be tested?"
              />
            ) : (
              <p className="text-gray-700 whitespace-pre-wrap">{change.test_plan || 'No test plan provided.'}</p>
            )}
          </div>

          {/* Approvals */}
          {!isEditing && change.approvals && change.approvals.length > 0 && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Approvals</h2>
              <div className="space-y-4">
                {change.approvals.map((approval) => (
                  <div key={approval.id} className="flex items-start space-x-3 p-3 bg-gray-50 rounded-lg">
                    <div className="flex-shrink-0">
                      {approval.status === 'approved' ? (
                        <CheckCircle className="h-5 w-5 text-green-500" />
                      ) : approval.status === 'rejected' ? (
                        <XCircle className="h-5 w-5 text-red-500" />
                      ) : (
                        <Clock className="h-5 w-5 text-yellow-500" />
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-gray-900">{approval.approver?.name || 'Unknown'}</p>
                        <p className="text-xs text-gray-500">{formatDate(approval.approved_at)}</p>
                      </div>
                      {approval.comments && <p className="text-sm text-gray-500 mt-1">{approval.comments}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Outcome Notes */}
          {!isEditing && change.outcome_notes && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                <div className="flex items-center">
                  {change.outcome === 'successful' && <CheckCircle className="h-5 w-5 text-green-500 mr-2" />}
                  {change.outcome === 'failed' && <XCircle className="h-5 w-5 text-red-500 mr-2" />}
                  {change.outcome === 'rolled_back' && <RotateCcw className="h-5 w-5 text-orange-500 mr-2" />}
                  Outcome Notes
                </div>
              </h2>
              <p className="text-gray-700 whitespace-pre-wrap">{change.outcome_notes}</p>
            </div>
          )}

          {/* Activity / Comments */}
          {!isEditing && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Comments</h2>

              <form onSubmit={handleSubmitComment} className="mb-6">
                <div className="flex space-x-3">
                  <div className="flex-shrink-0">
                    <div className="h-8 w-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-sm font-medium">
                      U
                    </div>
                  </div>
                  <div className="flex-1">
                    <textarea
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      placeholder="Add a comment..."
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    />
                    <div className="mt-2 flex justify-end">
                      <Button type="submit" size="sm" disabled={!newComment.trim() || addComment.isPending}>
                        {addComment.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                        Send
                      </Button>
                    </div>
                  </div>
                </div>
              </form>

              <div className="space-y-4">
                {commentsLoading ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                    <span className="ml-2 text-sm text-gray-500">Loading comments...</span>
                  </div>
                ) : comments.length > 0 ? (
                  comments.map((comment: ChangeComment) => (
                    <div key={comment.id} className="flex space-x-3">
                      <div className="flex-shrink-0 mt-1">
                        <MessageSquare className="h-4 w-4 text-blue-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium text-gray-900">{comment.user_name || 'Unknown User'}</p>
                          <p className="text-xs text-gray-500">{formatRelativeTime(comment.created_at)}</p>
                        </div>
                        <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">{comment.content}</p>
                        {comment.is_internal && (
                          <span className="inline-flex items-center px-2 py-0.5 mt-1 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
                            Internal Note
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-gray-500">No comments yet</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Schedule Card */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Schedule</h2>
            <dl className="space-y-4">
              <div>
                <dt className="text-sm font-medium text-gray-500">Planned Start</dt>
                {isEditing ? (
                  <input
                    type="datetime-local"
                    value={editForm.plannedStart}
                    onChange={(e) => setEditForm({ ...editForm, plannedStart: e.target.value })}
                    className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                ) : (
                  <dd className="mt-1 flex items-center text-sm text-gray-900">
                    <Calendar className="h-4 w-4 mr-2 text-gray-400" />
                    {formatDate(change.planned_start)}
                  </dd>
                )}
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Planned End</dt>
                {isEditing ? (
                  <input
                    type="datetime-local"
                    value={editForm.plannedEnd}
                    onChange={(e) => setEditForm({ ...editForm, plannedEnd: e.target.value })}
                    className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                ) : (
                  <dd className="mt-1 flex items-center text-sm text-gray-900">
                    <Calendar className="h-4 w-4 mr-2 text-gray-400" />
                    {formatDate(change.planned_end)}
                  </dd>
                )}
              </div>
              {!isEditing && change.actual_start && (
                <div>
                  <dt className="text-sm font-medium text-gray-500">Actual Start</dt>
                  <dd className="mt-1 text-sm text-gray-900">{formatDate(change.actual_start)}</dd>
                </div>
              )}
              {!isEditing && change.actual_end && (
                <div>
                  <dt className="text-sm font-medium text-gray-500">Actual End</dt>
                  <dd className="mt-1 text-sm text-gray-900">{formatDate(change.actual_end)}</dd>
                </div>
              )}
              {!isEditing && change.downtime_minutes && (
                <div>
                  <dt className="text-sm font-medium text-gray-500">Estimated Downtime</dt>
                  <dd className="mt-1 text-sm text-gray-900">{change.downtime_minutes} minutes</dd>
                </div>
              )}
            </dl>
          </div>

          {/* Details Card */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Details</h2>
            <dl className="space-y-4">
              {isEditing ? (
                <>
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Type</dt>
                    <select
                      value={editForm.type}
                      onChange={(e) => setEditForm({ ...editForm, type: e.target.value as 'standard' | 'normal' | 'emergency' })}
                      className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="standard">Standard</option>
                      <option value="normal">Normal</option>
                      <option value="emergency">Emergency</option>
                    </select>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Risk Level</dt>
                    <select
                      value={editForm.riskLevel}
                      onChange={(e) => setEditForm({ ...editForm, riskLevel: e.target.value as 'low' | 'medium' | 'high' | 'critical' })}
                      className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="critical">Critical</option>
                    </select>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Impact</dt>
                    <select
                      value={editForm.impact}
                      onChange={(e) => setEditForm({ ...editForm, impact: e.target.value as '' | 'none' | 'minor' | 'moderate' | 'significant' | 'major' })}
                      className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Select impact...</option>
                      <option value="none">None</option>
                      <option value="minor">Minor</option>
                      <option value="moderate">Moderate</option>
                      <option value="significant">Significant</option>
                      <option value="major">Major</option>
                    </select>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Implementer</dt>
                    <select
                      value={editForm.implementerId}
                      onChange={(e) => setEditForm({ ...editForm, implementerId: e.target.value })}
                      className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Select implementer...</option>
                      {users.map((user: { id: string; name: string }) => (
                        <option key={user.id} value={user.id}>{user.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Assignment Group</dt>
                    <select
                      value={editForm.assignedGroup}
                      onChange={(e) => setEditForm({ ...editForm, assignedGroup: e.target.value })}
                      className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Select group...</option>
                      {groups.map((group: { id: string; name: string }) => (
                        <option key={group.id} value={group.id}>{group.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Application</dt>
                    <select
                      value={editForm.applicationId}
                      onChange={(e) => setEditForm({ ...editForm, applicationId: e.target.value })}
                      className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Select application...</option>
                      {applications.map((app: { id: string; name: string }) => (
                        <option key={app.id} value={app.id}>{app.name}</option>
                      ))}
                    </select>
                  </div>
                </>
              ) : (
                <>
                  {change.requester_name && (
                    <div>
                      <dt className="text-sm font-medium text-gray-500">Requested By</dt>
                      <dd className="mt-1 flex items-center">
                        <div className="h-8 w-8 rounded-full bg-gray-200 flex items-center justify-center text-sm font-medium text-gray-600">
                          {change.requester_name.charAt(0)}
                        </div>
                        <div className="ml-2">
                          <p className="text-sm font-medium text-gray-900">{change.requester_name}</p>
                          {change.requester_email && <p className="text-xs text-gray-500">{change.requester_email}</p>}
                        </div>
                      </dd>
                    </div>
                  )}
                  {change.implementer_name && (
                    <div>
                      <dt className="text-sm font-medium text-gray-500">Implementer</dt>
                      <dd className="mt-1 flex items-center">
                        <div className="h-8 w-8 rounded-full bg-gray-200 flex items-center justify-center text-sm font-medium text-gray-600">
                          {change.implementer_name.charAt(0)}
                        </div>
                        <div className="ml-2">
                          <p className="text-sm font-medium text-gray-900">{change.implementer_name}</p>
                          {change.implementer_email && <p className="text-xs text-gray-500">{change.implementer_email}</p>}
                        </div>
                      </dd>
                    </div>
                  )}
                  {change.assigned_group_name && (
                    <div>
                      <dt className="text-sm font-medium text-gray-500">Assignment Group</dt>
                      <dd className="mt-1 flex items-center text-sm text-gray-900">
                        <Users className="h-4 w-4 mr-2 text-gray-400" />
                        {change.assigned_group_name}
                      </dd>
                    </div>
                  )}
                  {change.application_name && (
                    <div>
                      <dt className="text-sm font-medium text-gray-500">Application</dt>
                      <dd className="mt-1">
                        <Link
                          href={`/applications/${change.application_id}`}
                          className="text-sm text-blue-600 hover:text-blue-800"
                        >
                          {change.application_name}
                        </Link>
                      </dd>
                    </div>
                  )}
                  {change.environment_name && (
                    <div>
                      <dt className="text-sm font-medium text-gray-500">Environment</dt>
                      <dd className="mt-1 text-sm text-gray-900">{change.environment_name}</dd>
                    </div>
                  )}
                  {change.impact && (
                    <div>
                      <dt className="text-sm font-medium text-gray-500">Impact</dt>
                      <dd className="mt-1 text-sm text-gray-900 capitalize">{change.impact}</dd>
                    </div>
                  )}
                  {change.urgency && (
                    <div>
                      <dt className="text-sm font-medium text-gray-500">Urgency</dt>
                      <dd className="mt-1 text-sm text-gray-900 capitalize">{change.urgency}</dd>
                    </div>
                  )}
                  {change.cab_required && (
                    <div>
                      <dt className="text-sm font-medium text-gray-500">CAB Review</dt>
                      <dd className="mt-1 flex items-center text-sm text-gray-900">
                        <AlertTriangle className="h-4 w-4 mr-2 text-yellow-500" />
                        Required {change.cab_date && `(${formatDate(change.cab_date)})`}
                      </dd>
                    </div>
                  )}
                  <div className="border-t border-gray-200 pt-4">
                    <dt className="text-sm font-medium text-gray-500">Created</dt>
                    <dd className="mt-1 text-sm text-gray-900">{formatDate(change.created_at)}</dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Last Updated</dt>
                    <dd className="mt-1 text-sm text-gray-900">{formatDate(change.updated_at)}</dd>
                  </div>
                </>
              )}
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}
