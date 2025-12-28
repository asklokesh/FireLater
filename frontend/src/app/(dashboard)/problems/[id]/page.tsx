'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Edit,
  Clock,
  User,
  AlertTriangle,
  MessageSquare,
  Send,
  MoreHorizontal,
  CheckCircle,
  XCircle,
  Loader2,
  X,
  Lightbulb,
  FileSearch,
  Link2,
  Plus,
  Timer,
  Save,
  BookOpen,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  useProblem,
  useChangeProblemStatus,
  useAddProblemComment,
  useProblemComments,
  useAssignProblem,
  useUsers,
  useProblemLinkedIssues,
  useLinkIssueToProblem,
  useUnlinkIssueFromProblem,
  useProblemHistory,
  useConvertToKnownError,
  useUpdateProblem,
  useIssues,
  useApplications,
  useGroups,
  useKBArticlesForProblem,
  useKBArticles,
  useLinkKBArticle,
  ProblemComment,
  LinkedIssue,
  KBArticle,
} from '@/hooks/useApi';

const statusColors: Record<string, { bg: string; text: string }> = {
  new: { bg: 'bg-blue-100', text: 'text-blue-800' },
  assigned: { bg: 'bg-indigo-100', text: 'text-indigo-800' },
  investigating: { bg: 'bg-yellow-100', text: 'text-yellow-800' },
  root_cause_identified: { bg: 'bg-orange-100', text: 'text-orange-800' },
  known_error: { bg: 'bg-purple-100', text: 'text-purple-800' },
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
  investigating: 'Investigating',
  root_cause_identified: 'Root Cause Identified',
  known_error: 'Known Error',
  resolved: 'Resolved',
  closed: 'Closed',
};

export default function ProblemDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [newComment, setNewComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showLinkIssueModal, setShowLinkIssueModal] = useState(false);
  const [showRootCauseModal, setShowRootCauseModal] = useState(false);
  const [showWorkaroundModal, setShowWorkaroundModal] = useState(false);
  const [rootCause, setRootCause] = useState('');
  const [workaround, setWorkaround] = useState('');
  const [activeTab, setActiveTab] = useState<'comments' | 'issues' | 'history' | 'kb'>('comments');
  const [isEditing, setIsEditing] = useState(false);
  const [showLinkKBModal, setShowLinkKBModal] = useState(false);
  const [selectedKBArticleId, setSelectedKBArticleId] = useState('');

  const problemId = params.id as string;
  const { data: problem, isLoading, error: fetchError } = useProblem(problemId);
  const { data: commentsData, isLoading: commentsLoading } = useProblemComments(problemId);
  const { data: linkedIssuesData, isLoading: issuesLoading } = useProblemLinkedIssues(problemId);
  const { data: historyData } = useProblemHistory(problemId);
  const { data: usersData } = useUsers({ limit: 100 });
  const { data: issuesData } = useIssues({ limit: 100 });
  const { data: applicationsData } = useApplications();
  const { data: groupsData } = useGroups();
  const { data: linkedKBArticlesData } = useKBArticlesForProblem(problemId);
  const { data: allKBArticlesData } = useKBArticles({ status: 'published', limit: 100 });

  const changeStatus = useChangeProblemStatus();
  const addComment = useAddProblemComment();
  const assignProblem = useAssignProblem();
  const linkIssue = useLinkIssueToProblem();
  const unlinkIssue = useUnlinkIssueFromProblem();
  const convertToKnownError = useConvertToKnownError();
  const updateProblem = useUpdateProblem();
  const linkKBArticle = useLinkKBArticle();

  const comments = commentsData?.data ?? commentsData ?? [];
  const linkedIssues = linkedIssuesData?.data ?? linkedIssuesData ?? [];
  const history = historyData?.data ?? historyData ?? [];
  const users = usersData?.data ?? [];
  const allIssues = issuesData?.data ?? [];
  const applications = applicationsData?.data ?? [];
  const groups = groupsData?.data ?? [];
  const linkedKBArticles: KBArticle[] = linkedKBArticlesData?.data ?? [];
  const allKBArticles: KBArticle[] = allKBArticlesData?.data ?? [];

  const [editForm, setEditForm] = useState({
    title: '',
    description: '',
    priority: 'medium' as 'critical' | 'high' | 'medium' | 'low',
    impact: '' as '' | 'widespread' | 'significant' | 'moderate' | 'minor',
    urgency: '' as '' | 'immediate' | 'high' | 'medium' | 'low',
    assignedTo: '',
    assignedGroup: '',
    applicationId: '',
  });

  // Initialize edit form when user clicks Edit button
  const handleStartEditing = () => {
    if (problem) {
      setEditForm({
        title: problem.title || '',
        description: problem.description || '',
        priority: problem.priority || 'medium',
        impact: problem.impact || '',
        urgency: problem.urgency || '',
        assignedTo: problem.assigned_to || '',
        assignedGroup: problem.assigned_group || '',
        applicationId: problem.application_id || '',
      });
    }
    setIsEditing(true);
  };

  const handleSaveEdit = async () => {
    setError(null);
    try {
      await updateProblem.mutateAsync({
        id: problemId,
        data: {
          title: editForm.title,
          description: editForm.description,
          priority: editForm.priority,
          impact: editForm.impact || undefined,
          urgency: editForm.urgency || undefined,
          assignedTo: editForm.assignedTo || null,
          assignedGroup: editForm.assignedGroup || null,
          applicationId: editForm.applicationId || null,
        },
      });
      setIsEditing(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update problem';
      setError(message);
    }
  };

  const handleCancelEdit = () => {
    if (problem) {
      setEditForm({
        title: problem.title || '',
        description: problem.description || '',
        priority: problem.priority || 'medium',
        impact: problem.impact || '',
        urgency: problem.urgency || '',
        assignedTo: problem.assigned_to || '',
        assignedGroup: problem.assigned_group || '',
        applicationId: problem.application_id || '',
      });
    }
    setIsEditing(false);
    setError(null);
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

  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;
    setError(null);

    try {
      await addComment.mutateAsync({ id: problemId, content: newComment });
      setNewComment('');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to add comment';
      setError(message);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    setError(null);
    try {
      await changeStatus.mutateAsync({ id: problemId, status: newStatus });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update status';
      setError(message);
    }
  };

  const handleAssign = async (userId: string) => {
    setError(null);
    try {
      await assignProblem.mutateAsync({ id: problemId, assigneeId: userId });
      setShowAssignModal(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to assign problem';
      setError(message);
    }
  };

  const handleLinkIssue = async (issueId: string) => {
    setError(null);
    try {
      await linkIssue.mutateAsync({ issueId, problemId, relationshipType: 'caused_by' });
      setShowLinkIssueModal(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to link issue';
      setError(message);
    }
  };

  const handleUnlinkIssue = async (issueId: string) => {
    setError(null);
    try {
      await unlinkIssue.mutateAsync(issueId);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to unlink issue';
      setError(message);
    }
  };

  const handleConvertToKnownError = async () => {
    setError(null);
    try {
      await convertToKnownError.mutateAsync(problemId);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to convert to known error';
      setError(message);
    }
  };

  const handleSaveRootCause = async () => {
    setError(null);
    try {
      await updateProblem.mutateAsync({ id: problemId, data: { rootCause } });
      setShowRootCauseModal(false);
      if (problem?.status === 'investigating') {
        await handleStatusChange('root_cause_identified');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save root cause';
      setError(message);
    }
  };

  const handleSaveWorkaround = async () => {
    setError(null);
    try {
      await updateProblem.mutateAsync({ id: problemId, data: { workaround } });
      setShowWorkaroundModal(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save workaround';
      setError(message);
    }
  };

  const handleLinkKBArticle = async () => {
    if (!selectedKBArticleId) return;
    setError(null);
    try {
      await linkKBArticle.mutateAsync({
        id: selectedKBArticleId,
        problemId,
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

  if (fetchError || !problem) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <AlertTriangle className="h-12 w-12 text-red-500 mb-4" />
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Problem not found</h2>
        <p className="text-gray-500 mb-4">The problem you&apos;re looking for doesn&apos;t exist or you don&apos;t have access to it.</p>
        <Button onClick={() => router.push('/problems')}>Back to Problems</Button>
      </div>
    );
  }

  const currentStatus = problem.status || 'new';
  const currentPriority = problem.priority || 'medium';
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
              <h1 className="text-2xl font-bold text-gray-900">{problem.problem_number}</h1>
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
              {problem.is_known_error && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                  <Lightbulb className="h-3 w-3 mr-1" />
                  KEDB
                </span>
              )}
            </div>
            {isEditing ? (
              <Input
                value={editForm.title}
                onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                className="mt-1 text-lg"
                placeholder="Problem title"
              />
            ) : (
              <p className="mt-1 text-lg text-gray-700">{problem.title}</p>
            )}
          </div>
        </div>
        <div className="flex items-center space-x-2">
          {isEditing ? (
            <>
              <Button variant="outline" onClick={handleCancelEdit} disabled={updateProblem.isPending}>
                <X className="h-4 w-4 mr-2" />
                Cancel
              </Button>
              <Button onClick={handleSaveEdit} disabled={updateProblem.isPending}>
                {updateProblem.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Save
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={handleStartEditing}>
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
        <div className="flex items-center gap-2 p-4 text-sm text-red-800 bg-red-100 rounded-md">
          <AlertTriangle className="h-4 w-4" />
          {error}
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
                placeholder="Describe the problem..."
              />
            ) : (
              <p className="text-gray-700 whitespace-pre-wrap">{problem.description || 'No description provided'}</p>
            )}
          </div>

          {/* Root Cause & Workaround */}
          {!isEditing && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Root Cause Analysis</h2>
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-gray-700">Root Cause</label>
                    <Button size="sm" variant="outline" onClick={() => { setRootCause(problem.root_cause || ''); setShowRootCauseModal(true); }}>
                      <Edit className="h-3 w-3 mr-1" />
                      {problem.root_cause ? 'Edit' : 'Add'}
                    </Button>
                  </div>
                  {problem.root_cause ? (
                    <p className="text-sm text-gray-700 bg-gray-50 p-3 rounded whitespace-pre-wrap">{problem.root_cause}</p>
                  ) : (
                    <p className="text-sm text-gray-500 italic">Root cause not yet identified</p>
                  )}
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-gray-700">Workaround</label>
                    <Button size="sm" variant="outline" onClick={() => { setWorkaround(problem.workaround || ''); setShowWorkaroundModal(true); }}>
                      <Edit className="h-3 w-3 mr-1" />
                      {problem.workaround ? 'Edit' : 'Add'}
                    </Button>
                  </div>
                  {problem.workaround ? (
                    <p className="text-sm text-gray-700 bg-yellow-50 p-3 rounded border border-yellow-200 whitespace-pre-wrap">{problem.workaround}</p>
                  ) : (
                    <p className="text-sm text-gray-500 italic">No workaround available</p>
                  )}
                </div>
                {problem.resolution && (
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-2 block">Resolution</label>
                    <p className="text-sm text-gray-700 bg-green-50 p-3 rounded border border-green-200 whitespace-pre-wrap">{problem.resolution}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Quick Actions */}
          {!isEditing && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Actions</h2>
              <div className="flex flex-wrap gap-2">
                {currentStatus === 'new' && (
                  <>
                    <Button size="sm" onClick={() => setShowAssignModal(true)} disabled={assignProblem.isPending}>
                      <User className="h-4 w-4 mr-2" />
                      Assign
                    </Button>
                    <Button size="sm" onClick={() => handleStatusChange('investigating')} disabled={changeStatus.isPending}>
                      <FileSearch className="h-4 w-4 mr-2" />
                      Start Investigation
                    </Button>
                  </>
                )}
                {currentStatus === 'assigned' && (
                  <Button size="sm" onClick={() => handleStatusChange('investigating')} disabled={changeStatus.isPending}>
                    <FileSearch className="h-4 w-4 mr-2" />
                    Start Investigation
                  </Button>
                )}
                {currentStatus === 'investigating' && (
                  <>
                    <Button size="sm" onClick={() => { setRootCause(problem.root_cause || ''); setShowRootCauseModal(true); }}>
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Document Root Cause
                    </Button>
                  </>
                )}
                {currentStatus === 'root_cause_identified' && (
                  <>
                    <Button size="sm" onClick={handleConvertToKnownError} disabled={convertToKnownError.isPending}>
                      <Lightbulb className="h-4 w-4 mr-2" />
                      Convert to Known Error
                    </Button>
                    <Button size="sm" onClick={() => handleStatusChange('resolved')} disabled={changeStatus.isPending}>
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Mark Resolved
                    </Button>
                  </>
                )}
                {currentStatus === 'known_error' && (
                  <Button size="sm" onClick={() => handleStatusChange('resolved')} disabled={changeStatus.isPending}>
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Mark Resolved
                  </Button>
                )}
                {currentStatus === 'resolved' && (
                  <>
                    <Button size="sm" onClick={() => handleStatusChange('closed')} disabled={changeStatus.isPending}>
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Close
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleStatusChange('investigating')} disabled={changeStatus.isPending}>
                      <XCircle className="h-4 w-4 mr-2" />
                      Reopen
                    </Button>
                  </>
                )}
                <Button size="sm" variant="outline" onClick={() => setShowLinkIssueModal(true)}>
                  <Link2 className="h-4 w-4 mr-2" />
                  Link Issue
                </Button>
              </div>
            </div>
          )}

          {/* Tabs: Comments, Linked Issues, History */}
          {!isEditing && (
            <div className="bg-white rounded-lg shadow">
              <div className="border-b border-gray-200">
                <nav className="flex -mb-px">
                  <button
                    onClick={() => setActiveTab('comments')}
                    className={`px-6 py-3 text-sm font-medium border-b-2 ${
                      activeTab === 'comments'
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    <MessageSquare className="h-4 w-4 inline mr-2" />
                    Comments
                  </button>
                  <button
                    onClick={() => setActiveTab('issues')}
                    className={`px-6 py-3 text-sm font-medium border-b-2 ${
                      activeTab === 'issues'
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    <Link2 className="h-4 w-4 inline mr-2" />
                    Linked Issues ({linkedIssues.length})
                  </button>
                  <button
                    onClick={() => setActiveTab('history')}
                    className={`px-6 py-3 text-sm font-medium border-b-2 ${
                      activeTab === 'history'
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    <Timer className="h-4 w-4 inline mr-2" />
                    History
                  </button>
                  <button
                    onClick={() => setActiveTab('kb')}
                    className={`px-6 py-3 text-sm font-medium border-b-2 ${
                      activeTab === 'kb'
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    <BookOpen className="h-4 w-4 inline mr-2" />
                    KB Articles ({linkedKBArticles.length})
                  </button>
                </nav>
              </div>

              <div className="p-6">
                {activeTab === 'comments' && (
                  <>
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
                          <div className="mt-2 flex justify-end">
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
                        comments.map((comment: ProblemComment) => (
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
                  </>
                )}

                {activeTab === 'issues' && (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <h3 className="text-sm font-medium text-gray-700">Linked Issues</h3>
                      <Button size="sm" variant="outline" onClick={() => setShowLinkIssueModal(true)}>
                        <Plus className="h-4 w-4 mr-1" />
                        Link Issue
                      </Button>
                    </div>
                    {issuesLoading ? (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                      </div>
                    ) : linkedIssues.length > 0 ? (
                      <div className="space-y-2">
                        {linkedIssues.map((linked: LinkedIssue) => (
                          <div key={linked.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                            <div className="flex items-center space-x-3">
                              <AlertTriangle className="h-4 w-4 text-yellow-500" />
                              <div>
                                <Link href={`/issues/${linked.issue_id}`} className="text-sm font-medium text-blue-600 hover:text-blue-800">
                                  {linked.issue_number}
                                </Link>
                                <p className="text-xs text-gray-600">{linked.issue_title}</p>
                              </div>
                            </div>
                            <div className="flex items-center space-x-2">
                              <span className="text-xs text-gray-500">{linked.relationship_type}</span>
                              <button
                                onClick={() => handleUnlinkIssue(linked.issue_id)}
                                className="text-gray-400 hover:text-red-500"
                                disabled={unlinkIssue.isPending}
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500">No linked issues</p>
                    )}
                  </div>
                )}

                {activeTab === 'history' && (
                  <div className="space-y-4">
                    {history.length > 0 ? (
                      history.map((entry: { id: string; from_status: string; to_status: string; reason?: string; changed_by_name?: string; changed_at: string }) => (
                        <div key={entry.id} className="flex space-x-3">
                          <div className="flex-shrink-0">
                            <Clock className="h-4 w-4 text-gray-400 mt-1" />
                          </div>
                          <div className="flex-1">
                            <p className="text-sm text-gray-900">
                              Status changed from{' '}
                              <span className="font-medium">{statusLabels[entry.from_status] || entry.from_status}</span>
                              {' '}to{' '}
                              <span className="font-medium">{statusLabels[entry.to_status] || entry.to_status}</span>
                            </p>
                            {entry.reason && (
                              <p className="text-xs text-gray-600 mt-1">Reason: {entry.reason}</p>
                            )}
                            <p className="text-xs text-gray-500 mt-1">
                              by {entry.changed_by_name || 'System'} - {formatRelativeTime(entry.changed_at)}
                            </p>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-gray-500">No history available</p>
                    )}
                  </div>
                )}

                {activeTab === 'kb' && (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <h3 className="text-sm font-medium text-gray-700">Knowledge Base Articles</h3>
                      <Button size="sm" variant="outline" onClick={() => setShowLinkKBModal(true)}>
                        <Plus className="h-4 w-4 mr-1" />
                        Link Article
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
                      <p className="text-sm text-gray-500">No linked KB articles. Link articles to document solutions for this problem.</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Details Card */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Details</h2>
            <dl className="space-y-4">
              {isEditing ? (
                <>
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Priority</dt>
                    <select
                      value={editForm.priority}
                      onChange={(e) => setEditForm({ ...editForm, priority: e.target.value as 'critical' | 'high' | 'medium' | 'low' })}
                      className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="critical">Critical</option>
                      <option value="high">High</option>
                      <option value="medium">Medium</option>
                      <option value="low">Low</option>
                    </select>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Impact</dt>
                    <select
                      value={editForm.impact}
                      onChange={(e) => setEditForm({ ...editForm, impact: e.target.value as '' | 'widespread' | 'significant' | 'moderate' | 'minor' })}
                      className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Select impact...</option>
                      <option value="widespread">Widespread</option>
                      <option value="significant">Significant</option>
                      <option value="moderate">Moderate</option>
                      <option value="minor">Minor</option>
                    </select>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Urgency</dt>
                    <select
                      value={editForm.urgency}
                      onChange={(e) => setEditForm({ ...editForm, urgency: e.target.value as '' | 'immediate' | 'high' | 'medium' | 'low' })}
                      className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Select urgency...</option>
                      <option value="immediate">Immediate</option>
                      <option value="high">High</option>
                      <option value="medium">Medium</option>
                      <option value="low">Low</option>
                    </select>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Assigned To</dt>
                    <select
                      value={editForm.assignedTo}
                      onChange={(e) => setEditForm({ ...editForm, assignedTo: e.target.value })}
                      className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Unassigned</option>
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
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Assigned To</dt>
                    <dd className="mt-1">
                      {problem.assignee_name ? (
                        <div className="flex items-center">
                          <div className="h-8 w-8 rounded-full bg-gray-200 flex items-center justify-center text-sm font-medium text-gray-600">
                            {problem.assignee_name.charAt(0)}
                          </div>
                          <div className="ml-2">
                            <p className="text-sm font-medium text-gray-900">
                              {problem.assignee_name}
                            </p>
                            {problem.assignee_email && (
                              <p className="text-xs text-gray-500">{problem.assignee_email}</p>
                            )}
                          </div>
                        </div>
                      ) : (
                        <span className="text-sm text-gray-500 italic">Unassigned</span>
                      )}
                    </dd>
                  </div>

                  <div>
                    <dt className="text-sm font-medium text-gray-500">Problem Type</dt>
                    <dd className="mt-1">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        problem.problem_type === 'proactive' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {problem.problem_type === 'proactive' ? 'Proactive' : 'Reactive'}
                      </span>
                    </dd>
                  </div>

                  <div>
                    <dt className="text-sm font-medium text-gray-500">Application</dt>
                    <dd className="mt-1 text-sm text-gray-900">
                      {problem.application_id && problem.application_name ? (
                        <Link
                          href={`/applications/${problem.application_id}`}
                          className="text-blue-600 hover:text-blue-800"
                        >
                          {problem.application_name}
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

                  {problem.impact && (
                    <div>
                      <dt className="text-sm font-medium text-gray-500">Impact</dt>
                      <dd className="mt-1 text-sm text-gray-900 capitalize">{problem.impact}</dd>
                    </div>
                  )}

                  {problem.urgency && (
                    <div>
                      <dt className="text-sm font-medium text-gray-500">Urgency</dt>
                      <dd className="mt-1 text-sm text-gray-900 capitalize">{problem.urgency}</dd>
                    </div>
                  )}

                  <div>
                    <dt className="text-sm font-medium text-gray-500">Linked Issues</dt>
                    <dd className="mt-1 text-sm text-gray-900">{linkedIssues.length} issues</dd>
                  </div>
                </>
              )}
            </dl>
          </div>

          {/* Timeline Card */}
          {!isEditing && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Timeline</h2>
              <dl className="space-y-4">
                <div>
                  <dt className="text-sm font-medium text-gray-500">Created</dt>
                  <dd className="mt-1 text-sm text-gray-900">{formatDate(problem.created_at)}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Last Updated</dt>
                  <dd className="mt-1 text-sm text-gray-900">{formatDate(problem.updated_at)}</dd>
                </div>
                {problem.resolved_at && (
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Resolved</dt>
                    <dd className="mt-1 text-sm text-gray-900">{formatDate(problem.resolved_at)}</dd>
                  </div>
                )}
                {problem.closed_at && (
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Closed</dt>
                    <dd className="mt-1 text-sm text-gray-900">{formatDate(problem.closed_at)}</dd>
                  </div>
                )}
              </dl>
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
                <h3 className="text-lg font-semibold text-gray-900">Assign Problem</h3>
                <button onClick={() => setShowAssignModal(false)} className="text-gray-400 hover:text-gray-500">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="max-h-64 overflow-y-auto space-y-2">
                {users.map((user: { id: string; name: string; email: string }) => (
                  <button
                    key={user.id}
                    onClick={() => handleAssign(user.id)}
                    disabled={assignProblem.isPending}
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
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Link Issue Modal */}
      {showLinkIssueModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-screen items-center justify-center p-4">
            <div className="fixed inset-0 bg-black bg-opacity-30" onClick={() => setShowLinkIssueModal(false)} />
            <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Link Issue</h3>
                <button onClick={() => setShowLinkIssueModal(false)} className="text-gray-400 hover:text-gray-500">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <p className="text-sm text-gray-500 mb-4">Select an issue to link to this problem:</p>
              <div className="max-h-64 overflow-y-auto space-y-2">
                {allIssues.filter((issue: { id: string }) => !linkedIssues.some((li: LinkedIssue) => li.issue_id === issue.id)).map((issue: { id: string; issue_number: string; title: string; status: string }) => (
                  <button
                    key={issue.id}
                    onClick={() => handleLinkIssue(issue.id)}
                    disabled={linkIssue.isPending}
                    className="w-full flex items-center p-3 rounded-lg hover:bg-gray-50 border border-gray-200 text-left"
                  >
                    <AlertTriangle className="h-4 w-4 text-yellow-500 mr-3" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">{issue.issue_number}</p>
                      <p className="text-xs text-gray-600">{issue.title}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Root Cause Modal */}
      {showRootCauseModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-screen items-center justify-center p-4">
            <div className="fixed inset-0 bg-black bg-opacity-30" onClick={() => setShowRootCauseModal(false)} />
            <div className="relative bg-white rounded-lg shadow-xl max-w-lg w-full p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Document Root Cause</h3>
                <button onClick={() => setShowRootCauseModal(false)} className="text-gray-400 hover:text-gray-500">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <textarea
                value={rootCause}
                onChange={(e) => setRootCause(e.target.value)}
                placeholder="Describe the root cause of this problem..."
                rows={6}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
              <div className="mt-4 flex justify-end space-x-2">
                <Button variant="outline" onClick={() => setShowRootCauseModal(false)}>Cancel</Button>
                <Button onClick={handleSaveRootCause} disabled={!rootCause.trim() || updateProblem.isPending}>
                  {updateProblem.isPending ? 'Saving...' : 'Save Root Cause'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Workaround Modal */}
      {showWorkaroundModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-screen items-center justify-center p-4">
            <div className="fixed inset-0 bg-black bg-opacity-30" onClick={() => setShowWorkaroundModal(false)} />
            <div className="relative bg-white rounded-lg shadow-xl max-w-lg w-full p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Document Workaround</h3>
                <button onClick={() => setShowWorkaroundModal(false)} className="text-gray-400 hover:text-gray-500">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <textarea
                value={workaround}
                onChange={(e) => setWorkaround(e.target.value)}
                placeholder="Describe the temporary workaround..."
                rows={6}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
              <div className="mt-4 flex justify-end space-x-2">
                <Button variant="outline" onClick={() => setShowWorkaroundModal(false)}>Cancel</Button>
                <Button onClick={handleSaveWorkaround} disabled={!workaround.trim() || updateProblem.isPending}>
                  {updateProblem.isPending ? 'Saving...' : 'Save Workaround'}
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
                Link a published KB article to document solutions for this problem.
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
