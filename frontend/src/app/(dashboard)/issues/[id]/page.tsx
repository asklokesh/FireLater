'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Edit,
  Save,
  User,
  AlertCircle,
  AlertTriangle,
  MessageSquare,
  Paperclip,
  Send,
  CheckCircle,
  XCircle,
  Pause,
  Play,
  Loader2,
  X,
  Link2,
  Unlink,
  BookOpen,
  Plus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  useIssue,
  useUpdateIssue,
  useChangeIssueStatus,
  useAddIssueComment,
  useIssueComments,
  useAssignIssue,
  useUsers,
  useGroups,
  useApplications,
  useProblems,
  useIssueLinkedProblem,
  useLinkIssueToProblem,
  useUnlinkIssueFromProblem,
  useKBArticlesForIssue,
  useKBArticles,
  useLinkKBArticle,
  IssueComment,
  LinkedProblem,
  KBArticle,
} from '@/hooks/useApi';

const statusColors: Record<string, { bg: string; text: string }> = {
  new: { bg: 'bg-blue-100', text: 'text-blue-800' },
  assigned: { bg: 'bg-indigo-100', text: 'text-indigo-800' },
  in_progress: { bg: 'bg-yellow-100', text: 'text-yellow-800' },
  pending: { bg: 'bg-purple-100', text: 'text-purple-800' },
  resolved: { bg: 'bg-green-100', text: 'text-green-800' },
  closed: { bg: 'bg-gray-100', text: 'text-gray-800' },
};

const priorityColors: Record<string, { bg: string; text: string; label: string }> = {
  critical: { bg: 'bg-red-100', text: 'text-red-800', label: 'Critical' },
  high: { bg: 'bg-orange-100', text: 'text-orange-800', label: 'High' },
  medium: { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'Medium' },
  low: { bg: 'bg-blue-100', text: 'text-blue-800', label: 'Low' },
};

const statusLabels: Record<string, string> = {
  new: 'New',
  assigned: 'Assigned',
  in_progress: 'In Progress',
  pending: 'Pending',
  resolved: 'Resolved',
  closed: 'Closed',
};

export default function IssueDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showLinkProblemModal, setShowLinkProblemModal] = useState(false);
  const [selectedProblemId, setSelectedProblemId] = useState('');
  const [linkRelationshipType, setLinkRelationshipType] = useState('caused_by');
  const [showLinkKBModal, setShowLinkKBModal] = useState(false);
  const [selectedKBArticleId, setSelectedKBArticleId] = useState('');

  // Edit form state
  const [editForm, setEditForm] = useState({
    title: '',
    description: '',
    priority: 'medium' as 'critical' | 'high' | 'medium' | 'low',
    severity: '' as '' | 'S1' | 'S2' | 'S3' | 'S4',
    assignedTo: '',
    assignedGroup: '',
    applicationId: '',
  });

  const issueId = params.id as string;
  const { data: issue, isLoading, error: fetchError } = useIssue(issueId);
  const { data: commentsData, isLoading: commentsLoading } = useIssueComments(issueId);
  const { data: usersData } = useUsers({ limit: 100 });
  const { data: groupsData } = useGroups({ limit: 100 });
  const { data: applicationsData } = useApplications({ limit: 100 });
  const { data: problemsData } = useProblems({ limit: 100 });
  const { data: linkedProblemData } = useIssueLinkedProblem(issueId);
  const { data: linkedKBArticlesData } = useKBArticlesForIssue(issueId);
  const { data: allKBArticlesData } = useKBArticles({ status: 'published', limit: 100 });

  const updateIssue = useUpdateIssue();
  const changeStatus = useChangeIssueStatus();
  const addComment = useAddIssueComment();
  const assignIssue = useAssignIssue();
  const linkToProblem = useLinkIssueToProblem();
  const unlinkFromProblem = useUnlinkIssueFromProblem();
  const linkKBArticle = useLinkKBArticle();

  const comments = commentsData?.data ?? [];
  const users = usersData?.data ?? [];
  const groups = groupsData?.data ?? [];
  const applications = applicationsData?.data ?? [];
  const problems = problemsData?.data ?? [];
  const linkedProblem: LinkedProblem | null = linkedProblemData?.data ?? null;
  const linkedKBArticles: KBArticle[] = linkedKBArticlesData?.data ?? [];
  const allKBArticles: KBArticle[] = allKBArticlesData?.data ?? [];

  // Initialize edit form when user clicks Edit button
  const handleStartEditing = () => {
    if (issue) {
      setEditForm({
        title: issue.title || '',
        description: issue.description || '',
        priority: issue.priority || 'medium',
        severity: issue.severity || '',
        assignedTo: issue.assigned_to || '',
        assignedGroup: issue.assigned_group || '',
        applicationId: issue.application_id || '',
      });
    }
    setIsEditing(true);
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

  const handleSaveEdit = async () => {
    setError(null);
    try {
      await updateIssue.mutateAsync({
        id: issueId,
        data: {
          title: editForm.title,
          description: editForm.description,
          priority: editForm.priority,
          severity: editForm.severity || undefined,
          assignedTo: editForm.assignedTo || undefined,
          assignedGroup: editForm.assignedGroup || undefined,
          applicationId: editForm.applicationId || undefined,
        },
      });
      setIsEditing(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update issue';
      setError(message);
    }
  };

  const handleCancelEdit = () => {
    if (issue) {
      setEditForm({
        title: issue.title || '',
        description: issue.description || '',
        priority: issue.priority || 'medium',
        severity: issue.severity || '',
        assignedTo: issue.assigned_to || '',
        assignedGroup: issue.assigned_group || '',
        applicationId: issue.application_id || '',
      });
    }
    setIsEditing(false);
    setError(null);
  };

  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;
    setError(null);

    try {
      await addComment.mutateAsync({ id: issueId, content: newComment });
      setNewComment('');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to add comment';
      setError(message);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    setError(null);
    try {
      await changeStatus.mutateAsync({ id: issueId, status: newStatus });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update status';
      setError(message);
    }
  };

  const handleAssign = async (userId: string) => {
    setError(null);
    try {
      await assignIssue.mutateAsync({ id: issueId, assignedTo: userId });
      setShowAssignModal(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to assign issue';
      setError(message);
    }
  };

  const handleLinkToProblem = async () => {
    if (!selectedProblemId) return;
    setError(null);
    try {
      await linkToProblem.mutateAsync({
        issueId,
        problemId: selectedProblemId,
        relationshipType: linkRelationshipType,
      });
      setShowLinkProblemModal(false);
      setSelectedProblemId('');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to link to problem';
      setError(message);
    }
  };

  const handleUnlinkFromProblem = async () => {
    setError(null);
    try {
      await unlinkFromProblem.mutateAsync(issueId);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to unlink from problem';
      setError(message);
    }
  };

  const handleLinkKBArticle = async () => {
    if (!selectedKBArticleId) return;
    setError(null);
    try {
      await linkKBArticle.mutateAsync({
        id: selectedKBArticleId,
        issueId,
      });
      setShowLinkKBModal(false);
      setSelectedKBArticleId('');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to link KB article';
      setError(message);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (fetchError || !issue) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Issue not found</h2>
        <p className="text-gray-500 mb-4">The issue you&apos;re looking for doesn&apos;t exist or you don&apos;t have access to it.</p>
        <Button onClick={() => router.push('/issues')}>Back to Issues</Button>
      </div>
    );
  }

  const currentStatus = issue.status || 'new';
  const currentPriority = issue.priority || 'medium';
  const statusColor = statusColors[currentStatus] || statusColors.new;
  const priorityColor = priorityColors[currentPriority] || priorityColors.medium;

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
              <h1 className="text-2xl font-bold text-gray-900">{issue.issue_number}</h1>
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${priorityColor.bg} ${priorityColor.text}`}
              >
                {priorityColor.label}
              </span>
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColor.bg} ${statusColor.text}`}
              >
                {statusLabels[currentStatus] || currentStatus}
              </span>
            </div>
            {!isEditing ? (
              <p className="mt-1 text-lg text-gray-700">{issue.title}</p>
            ) : null}
          </div>
        </div>
        <div className="flex items-center space-x-2">
          {isEditing ? (
            <>
              <Button variant="outline" onClick={handleCancelEdit}>
                <X className="h-4 w-4 mr-2" />
                Cancel
              </Button>
              <Button onClick={handleSaveEdit} disabled={updateIssue.isPending}>
                {updateIssue.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Save
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={handleStartEditing}>
              <Edit className="h-4 w-4 mr-2" />
              Edit
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-4 text-sm text-red-800 bg-red-100 rounded-md">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Title & Description */}
          <div className="bg-white rounded-lg shadow p-6">
            {isEditing ? (
              <div className="space-y-4">
                <Input
                  id="title"
                  type="text"
                  label="Title"
                  value={editForm.title}
                  onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                  required
                />
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <textarea
                    rows={5}
                    value={editForm.description}
                    onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Describe the issue..."
                  />
                </div>
              </div>
            ) : (
              <>
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Description</h2>
                <p className="text-gray-700 whitespace-pre-wrap">{issue.description || 'No description provided'}</p>
              </>
            )}
          </div>

          {/* Quick Actions - only show when not editing */}
          {!isEditing && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Actions</h2>
              <div className="flex flex-wrap gap-2">
                {currentStatus === 'new' && (
                  <>
                    <Button size="sm" onClick={() => setShowAssignModal(true)} disabled={assignIssue.isPending}>
                      <User className="h-4 w-4 mr-2" />
                      Assign
                    </Button>
                    <Button size="sm" onClick={() => handleStatusChange('in_progress')} disabled={changeStatus.isPending}>
                      <Play className="h-4 w-4 mr-2" />
                      Start Working
                    </Button>
                  </>
                )}
                {currentStatus === 'assigned' && (
                  <Button size="sm" onClick={() => handleStatusChange('in_progress')} disabled={changeStatus.isPending}>
                    <Play className="h-4 w-4 mr-2" />
                    Start Working
                  </Button>
                )}
                {currentStatus === 'in_progress' && (
                  <>
                    <Button size="sm" variant="outline" onClick={() => handleStatusChange('pending')} disabled={changeStatus.isPending}>
                      <Pause className="h-4 w-4 mr-2" />
                      Put On Hold
                    </Button>
                    <Button size="sm" onClick={() => handleStatusChange('resolved')} disabled={changeStatus.isPending}>
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Resolve
                    </Button>
                  </>
                )}
                {currentStatus === 'pending' && (
                  <Button size="sm" onClick={() => handleStatusChange('in_progress')} disabled={changeStatus.isPending}>
                    <Play className="h-4 w-4 mr-2" />
                    Resume
                  </Button>
                )}
                {currentStatus === 'resolved' && (
                  <>
                    <Button size="sm" onClick={() => handleStatusChange('closed')} disabled={changeStatus.isPending}>
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Close
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleStatusChange('in_progress')} disabled={changeStatus.isPending}>
                      <XCircle className="h-4 w-4 mr-2" />
                      Reopen
                    </Button>
                  </>
                )}
                {currentStatus !== 'closed' && currentStatus !== 'resolved' && (
                  <Button size="sm" variant="outline" onClick={() => handleStatusChange('closed')} disabled={changeStatus.isPending}>
                    <XCircle className="h-4 w-4 mr-2" />
                    Close
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Activity / Comments */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Activity</h2>

            {/* Add Comment */}
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
                  <div className="mt-2 flex justify-between items-center">
                    <button
                      type="button"
                      className="text-gray-400 hover:text-gray-600"
                    >
                      <Paperclip className="h-5 w-5" />
                    </button>
                    <Button type="submit" size="sm" disabled={!newComment.trim() || addComment.isPending}>
                      <Send className="h-4 w-4 mr-2" />
                      {addComment.isPending ? 'Sending...' : 'Send'}
                    </Button>
                  </div>
                </div>
              </div>
            </form>

            {/* Comments List */}
            <div className="space-y-4">
              {commentsLoading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                  <span className="ml-2 text-sm text-gray-500">Loading comments...</span>
                </div>
              ) : comments.length > 0 ? (
                comments.map((comment: IssueComment) => (
                  <div key={comment.id} className="flex space-x-3">
                    <div className="flex-shrink-0 mt-1">
                      <MessageSquare className="h-4 w-4 text-blue-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-gray-900">
                          {comment.user_name || 'Unknown User'}
                        </p>
                        <p className="text-xs text-gray-500">
                          {formatRelativeTime(comment.created_at)}
                        </p>
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
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Details Card */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Details</h2>
            {isEditing ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                  <select
                    value={editForm.priority}
                    onChange={(e) => setEditForm({ ...editForm, priority: e.target.value as 'critical' | 'high' | 'medium' | 'low' })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="critical">Critical</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Severity</label>
                  <select
                    value={editForm.severity}
                    onChange={(e) => setEditForm({ ...editForm, severity: e.target.value as '' | 'S1' | 'S2' | 'S3' | 'S4' })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select severity</option>
                    <option value="S1">S1 - Critical</option>
                    <option value="S2">S2 - Major</option>
                    <option value="S3">S3 - Minor</option>
                    <option value="S4">S4 - Cosmetic</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Assigned To</label>
                  <select
                    value={editForm.assignedTo}
                    onChange={(e) => setEditForm({ ...editForm, assignedTo: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Unassigned</option>
                    {users.map((user: { id: string; name: string }) => (
                      <option key={user.id} value={user.id}>{user.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Assignment Group</label>
                  <select
                    value={editForm.assignedGroup}
                    onChange={(e) => setEditForm({ ...editForm, assignedGroup: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">No group</option>
                    {groups.map((group: { id: string; name: string }) => (
                      <option key={group.id} value={group.id}>{group.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Application</label>
                  <select
                    value={editForm.applicationId}
                    onChange={(e) => setEditForm({ ...editForm, applicationId: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">No application</option>
                    {applications.map((app: { id: string; name: string }) => (
                      <option key={app.id} value={app.id}>{app.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            ) : (
              <dl className="space-y-4">
                <div>
                  <dt className="text-sm font-medium text-gray-500">Assigned To</dt>
                  <dd className="mt-1">
                    {issue.assignee_name ? (
                      <div className="flex items-center">
                        <div className="h-8 w-8 rounded-full bg-gray-200 flex items-center justify-center text-sm font-medium text-gray-600">
                          {issue.assignee_name.charAt(0)}
                        </div>
                        <div className="ml-2">
                          <p className="text-sm font-medium text-gray-900">
                            {issue.assignee_name}
                          </p>
                          {issue.assignee_email && (
                            <p className="text-xs text-gray-500">{issue.assignee_email}</p>
                          )}
                        </div>
                      </div>
                    ) : (
                      <span className="text-sm text-gray-500 italic">Unassigned</span>
                    )}
                  </dd>
                </div>

                <div>
                  <dt className="text-sm font-medium text-gray-500">Assignment Group</dt>
                  <dd className="mt-1 text-sm text-gray-900">
                    {issue.assigned_group_name || '-'}
                  </dd>
                </div>

                {issue.reporter_name && (
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Reporter</dt>
                    <dd className="mt-1">
                      <div className="flex items-center">
                        <div className="h-8 w-8 rounded-full bg-gray-200 flex items-center justify-center text-sm font-medium text-gray-600">
                          {issue.reporter_name.charAt(0)}
                        </div>
                        <div className="ml-2">
                          <p className="text-sm font-medium text-gray-900">
                            {issue.reporter_name}
                          </p>
                          {issue.reporter_email && (
                            <p className="text-xs text-gray-500">{issue.reporter_email}</p>
                          )}
                        </div>
                      </div>
                    </dd>
                  </div>
                )}

                <div>
                  <dt className="text-sm font-medium text-gray-500">Application</dt>
                  <dd className="mt-1 text-sm text-gray-900">
                    {issue.application_id && issue.application_name ? (
                      <Link
                        href={`/applications/${issue.application_id}`}
                        className="text-blue-600 hover:text-blue-800"
                      >
                        {issue.application_name}
                      </Link>
                    ) : (
                      '-'
                    )}
                  </dd>
                </div>

                <div className="border-t border-gray-200 pt-4">
                  <dt className="text-sm font-medium text-gray-500">Priority</dt>
                  <dd className="mt-1">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${priorityColor.bg} ${priorityColor.text}`}
                    >
                      {priorityColor.label}
                    </span>
                  </dd>
                </div>

                {issue.severity && (
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Severity</dt>
                    <dd className="mt-1 text-sm text-gray-900">{issue.severity}</dd>
                  </div>
                )}

                {issue.urgency && (
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Urgency</dt>
                    <dd className="mt-1 text-sm text-gray-900 capitalize">{issue.urgency}</dd>
                  </div>
                )}

                {issue.impact && (
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Impact</dt>
                    <dd className="mt-1 text-sm text-gray-900 capitalize">{issue.impact}</dd>
                  </div>
                )}

                {issue.sla_breached && (
                  <div>
                    <dt className="text-sm font-medium text-gray-500">SLA Status</dt>
                    <dd className="mt-1 text-sm text-red-600 font-medium">Breached</dd>
                  </div>
                )}
              </dl>
            )}
          </div>

          {/* Dates Card - only show when not editing */}
          {!isEditing && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Timeline</h2>
              <dl className="space-y-4">
                <div>
                  <dt className="text-sm font-medium text-gray-500">Created</dt>
                  <dd className="mt-1 text-sm text-gray-900">{formatDate(issue.created_at)}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Last Updated</dt>
                  <dd className="mt-1 text-sm text-gray-900">{formatDate(issue.updated_at)}</dd>
                </div>
                {issue.first_response_at && (
                  <div>
                    <dt className="text-sm font-medium text-gray-500">First Response</dt>
                    <dd className="mt-1 text-sm text-gray-900">{formatDate(issue.first_response_at)}</dd>
                  </div>
                )}
                {issue.sla_breached_at && (
                  <div>
                    <dt className="text-sm font-medium text-gray-500">SLA Breached At</dt>
                    <dd className="mt-1 text-sm text-red-600 font-medium">
                      {formatDate(issue.sla_breached_at)}
                    </dd>
                  </div>
                )}
                {issue.resolved_at && (
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Resolved</dt>
                    <dd className="mt-1 text-sm text-gray-900">{formatDate(issue.resolved_at)}</dd>
                  </div>
                )}
                {issue.closed_at && (
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Closed</dt>
                    <dd className="mt-1 text-sm text-gray-900">{formatDate(issue.closed_at)}</dd>
                  </div>
                )}
              </dl>
            </div>
          )}

          {/* Linked Problem - only show when not editing */}
          {!isEditing && (
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">Linked Problem</h2>
                {!linkedProblem && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowLinkProblemModal(true)}
                  >
                    <Link2 className="h-4 w-4 mr-1" />
                    Link
                  </Button>
                )}
              </div>
              {linkedProblem ? (
                <div className="space-y-3">
                  <Link
                    href={`/problems/${linkedProblem.id}`}
                    className="block p-3 border border-gray-200 rounded-lg hover:bg-gray-50"
                  >
                    <div className="flex items-start space-x-3">
                      <AlertTriangle className="h-5 w-5 text-yellow-500 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-blue-600 hover:text-blue-800">
                          {linkedProblem.problem_number}
                        </p>
                        <p className="text-sm text-gray-900 truncate">{linkedProblem.title}</p>
                        <div className="flex items-center space-x-2 mt-1">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            linkedProblem.status === 'known_error' ? 'bg-purple-100 text-purple-800' :
                            linkedProblem.status === 'resolved' ? 'bg-green-100 text-green-800' :
                            'bg-yellow-100 text-yellow-800'
                          }`}>
                            {linkedProblem.status.replace(/_/g, ' ')}
                          </span>
                          {linkedProblem.is_known_error && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                              Known Error
                            </span>
                          )}
                        </div>
                        {linkedProblem.workaround && (
                          <p className="text-xs text-gray-500 mt-2">
                            <span className="font-medium">Workaround:</span> {linkedProblem.workaround.substring(0, 100)}...
                          </p>
                        )}
                      </div>
                    </div>
                  </Link>
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>
                      Relationship: {linkedProblem.relationship_type?.replace(/_/g, ' ') || 'caused by'}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={handleUnlinkFromProblem}
                      disabled={unlinkFromProblem.isPending}
                      className="text-red-600 hover:text-red-800 hover:bg-red-50"
                    >
                      <Unlink className="h-4 w-4 mr-1" />
                      Unlink
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-gray-500">
                  No linked problem. Link this issue to a problem for root cause analysis.
                </div>
              )}
            </div>
          )}

          {/* Knowledge Base Articles - only show when not editing */}
          {!isEditing && (
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">Knowledge Base</h2>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowLinkKBModal(true)}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Link
                </Button>
              </div>
              {linkedKBArticles.length > 0 ? (
                <div className="space-y-3">
                  {linkedKBArticles.map((article: KBArticle) => (
                    <Link
                      key={article.id}
                      href={`/knowledge-base/${article.id}`}
                      className="block p-3 border border-gray-200 rounded-lg hover:bg-gray-50"
                    >
                      <div className="flex items-start space-x-3">
                        <BookOpen className="h-5 w-5 text-blue-500 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-blue-600 hover:text-blue-800">
                            {article.title}
                          </p>
                          {article.summary && (
                            <p className="text-xs text-gray-500 mt-1 line-clamp-2">{article.summary}</p>
                          )}
                          <div className="flex items-center space-x-2 mt-1">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                              article.type === 'troubleshooting' ? 'bg-orange-100 text-orange-800' :
                              article.type === 'how_to' ? 'bg-green-100 text-green-800' :
                              article.type === 'known_error' ? 'bg-purple-100 text-purple-800' :
                              'bg-gray-100 text-gray-800'
                            }`}>
                              {article.type.replace(/_/g, ' ')}
                            </span>
                          </div>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-gray-500">
                  No linked articles. Link KB articles to help resolve this issue.
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Assignment Modal */}
      {showAssignModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-screen items-center justify-center p-4">
            <div className="fixed inset-0 bg-black bg-opacity-30" onClick={() => setShowAssignModal(false)} />
            <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Assign Issue</h3>
                <button
                  onClick={() => setShowAssignModal(false)}
                  className="text-gray-400 hover:text-gray-500"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <p className="text-sm text-gray-500 mb-4">Select a user to assign this issue to:</p>
              <div className="max-h-64 overflow-y-auto space-y-2">
                {users.map((user: { id: string; name: string; email: string }) => (
                  <button
                    key={user.id}
                    onClick={() => handleAssign(user.id)}
                    disabled={assignIssue.isPending}
                    className="w-full flex items-center p-3 rounded-lg hover:bg-gray-50 border border-gray-200 text-left"
                  >
                    <div className="h-8 w-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-sm font-medium">
                      {user.name.charAt(0)}
                    </div>
                    <div className="ml-3">
                      <p className="text-sm font-medium text-gray-900">{user.name}</p>
                      <p className="text-xs text-gray-500">{user.email}</p>
                    </div>
                  </button>
                ))}
                {users.length === 0 && (
                  <p className="text-sm text-gray-500 text-center py-4">No users available</p>
                )}
              </div>
              <div className="mt-4 flex justify-end">
                <Button variant="outline" onClick={() => setShowAssignModal(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Link Problem Modal */}
      {showLinkProblemModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-screen items-center justify-center p-4">
            <div className="fixed inset-0 bg-black bg-opacity-30" onClick={() => setShowLinkProblemModal(false)} />
            <div className="relative bg-white rounded-lg shadow-xl max-w-lg w-full p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Link to Problem</h3>
                <button
                  onClick={() => setShowLinkProblemModal(false)}
                  className="text-gray-400 hover:text-gray-500"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <p className="text-sm text-gray-500 mb-4">
                Link this issue to an existing problem for root cause analysis. This helps identify recurring issues.
              </p>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Select Problem
                  </label>
                  <select
                    value={selectedProblemId}
                    onChange={(e) => setSelectedProblemId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Choose a problem...</option>
                    {problems.map((problem: { id: string; problem_number: string; title: string; status: string }) => (
                      <option key={problem.id} value={problem.id}>
                        {problem.problem_number} - {problem.title} ({problem.status})
                      </option>
                    ))}
                  </select>
                  {problems.length === 0 && (
                    <p className="mt-1 text-xs text-gray-500">
                      No problems found. <Link href="/problems/new" className="text-blue-600 hover:text-blue-800">Create a new problem</Link>
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Relationship Type
                  </label>
                  <select
                    value={linkRelationshipType}
                    onChange={(e) => setLinkRelationshipType(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="caused_by">Caused by (this issue is a symptom of the problem)</option>
                    <option value="related_to">Related to (this issue is related but not directly caused)</option>
                    <option value="duplicate_of">Duplicate of (this issue is a duplicate of an existing problem)</option>
                  </select>
                </div>
              </div>

              <div className="mt-6 flex justify-end space-x-3">
                <Button variant="outline" onClick={() => setShowLinkProblemModal(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleLinkToProblem}
                  disabled={!selectedProblemId || linkToProblem.isPending}
                >
                  {linkToProblem.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Linking...
                    </>
                  ) : (
                    <>
                      <Link2 className="h-4 w-4 mr-2" />
                      Link to Problem
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Link KB Article Modal */}
      {showLinkKBModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-screen items-center justify-center p-4">
            <div className="fixed inset-0 bg-black bg-opacity-30" onClick={() => setShowLinkKBModal(false)} />
            <div className="relative bg-white rounded-lg shadow-xl max-w-lg w-full p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Link Knowledge Base Article</h3>
                <button
                  onClick={() => setShowLinkKBModal(false)}
                  className="text-gray-400 hover:text-gray-500"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <p className="text-sm text-gray-500 mb-4">
                Link a published KB article to help resolve this issue.
              </p>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Select Article
                  </label>
                  <select
                    value={selectedKBArticleId}
                    onChange={(e) => setSelectedKBArticleId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Choose an article...</option>
                    {allKBArticles
                      .filter((article: KBArticle) => !linkedKBArticles.some((linked: KBArticle) => linked.id === article.id))
                      .map((article: KBArticle) => (
                        <option key={article.id} value={article.id}>
                          {article.title} ({article.type.replace(/_/g, ' ')})
                        </option>
                      ))}
                  </select>
                  {allKBArticles.length === 0 && (
                    <p className="mt-1 text-xs text-gray-500">
                      No published articles found. <Link href="/knowledge-base/new" className="text-blue-600 hover:text-blue-800">Create a new article</Link>
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-6 flex justify-end space-x-3">
                <Button variant="outline" onClick={() => setShowLinkKBModal(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleLinkKBArticle}
                  disabled={!selectedKBArticleId || linkKBArticle.isPending}
                >
                  {linkKBArticle.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Linking...
                    </>
                  ) : (
                    <>
                      <BookOpen className="h-4 w-4 mr-2" />
                      Link Article
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
