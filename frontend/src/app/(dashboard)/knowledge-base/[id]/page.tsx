'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Edit2,
  Save,
  X,
  Loader2,
  Clock,
  Eye,
  ThumbsUp,
  ThumbsDown,
  AlertTriangle,
  Send,
  CheckCircle,
  Archive,
  RotateCcw,
  User,
  FileText,
  History,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  useKBArticle,
  useUpdateKBArticle,
  useKBCategories,
  useSubmitKBArticleForReview,
  usePublishKBArticle,
  useArchiveKBArticle,
  useRevertKBArticleToDraft,
  useSubmitKBFeedback,
  useKBArticleHistory,
  KBCategory,
  KBArticleHistory,
} from '@/hooks/useApi';

const statusColors: Record<string, { bg: string; text: string; label: string }> = {
  draft: { bg: 'bg-gray-100', text: 'text-gray-800', label: 'Draft' },
  review: { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'In Review' },
  published: { bg: 'bg-green-100', text: 'text-green-800', label: 'Published' },
  archived: { bg: 'bg-red-100', text: 'text-red-800', label: 'Archived' },
};

const _typeLabels: Record<string, string> = {
  how_to: 'How-To',
  troubleshooting: 'Troubleshooting',
  faq: 'FAQ',
  reference: 'Reference',
  policy: 'Policy',
  known_error: 'Known Error',
};

export default function ArticleDetailPage() {
  const params = useParams();
  const _router = useRouter();
  const id = params.id as string;

  const { data: article, isLoading, error, refetch } = useKBArticle(id);
  const { data: categoriesData } = useKBCategories();
  const { data: historyData } = useKBArticleHistory(id);
  const categories = categoriesData ?? [];
  const history = historyData ?? [];

  const updateArticle = useUpdateKBArticle();
  const submitForReview = useSubmitKBArticleForReview();
  const publishArticle = usePublishKBArticle();
  const archiveArticle = useArchiveKBArticle();
  const revertToDraft = useRevertKBArticleToDraft();
  const submitFeedback = useSubmitKBFeedback();

  // Inline editing state
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'content' | 'history'>('content');
  const [feedbackComment, setFeedbackComment] = useState('');

  const startEditing = (field: string, value: string) => {
    setEditingField(field);
    setEditValue(value);
  };

  const cancelEditing = () => {
    setEditingField(null);
    setEditValue('');
  };

  const saveField = async (field: string) => {
    if (!article) return;
    setIsSaving(true);

    try {
      const updateData: Record<string, unknown> = { [field]: editValue };
      await updateArticle.mutateAsync({ id: article.id, data: updateData });
      setEditingField(null);
      setEditValue('');
      refetch();
    } catch (err) {
      console.error('Failed to save:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleStatusAction = async (action: 'submitForReview' | 'publish' | 'archive' | 'revertToDraft') => {
    if (!article) return;
    try {
      switch (action) {
        case 'submitForReview':
          await submitForReview.mutateAsync(article.id);
          break;
        case 'publish':
          await publishArticle.mutateAsync(article.id);
          break;
        case 'archive':
          await archiveArticle.mutateAsync(article.id);
          break;
        case 'revertToDraft':
          await revertToDraft.mutateAsync(article.id);
          break;
      }
      refetch();
    } catch (err) {
      console.error('Failed to change status:', err);
    }
  };

  const handleFeedback = async (isHelpful: boolean) => {
    if (!article) return;
    try {
      await submitFeedback.mutateAsync({
        id: article.id,
        isHelpful,
        comment: feedbackComment || undefined,
      });
      setFeedbackComment('');
      refetch();
    } catch (err) {
      console.error('Failed to submit feedback:', err);
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

  const EditableField = ({
    field,
    value,
    label,
    type = 'text',
    options,
    multiline = false,
  }: {
    field: string;
    value: string;
    label: string;
    type?: 'text' | 'select';
    options?: { value: string; label: string }[];
    multiline?: boolean;
  }) => {
    const isEditing = editingField === field;

    if (isEditing) {
      return (
        <div className="space-y-2">
          <label className="text-xs font-medium text-gray-500 uppercase">{label}</label>
          <div className="flex items-start gap-2">
            {type === 'select' && options ? (
              <select
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                className="flex-1 px-3 py-2 border border-blue-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              >
                {options.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            ) : multiline ? (
              <textarea
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                rows={10}
                className="flex-1 px-3 py-2 border border-blue-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                autoFocus
              />
            ) : (
              <input
                type="text"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                className="flex-1 px-3 py-2 border border-blue-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
            )}
            <Button size="sm" onClick={() => saveField(field)} disabled={isSaving}>
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            </Button>
            <Button size="sm" variant="outline" onClick={cancelEditing}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      );
    }

    return (
      <div
        className="group cursor-pointer hover:bg-gray-50 rounded-md p-2 -m-2"
        onClick={() => startEditing(field, value)}
      >
        <label className="text-xs font-medium text-gray-500 uppercase">{label}</label>
        <div className="flex items-center justify-between">
          <span className={`text-sm ${value ? 'text-gray-900' : 'text-gray-400 italic'}`}>
            {value || `Add ${label.toLowerCase()}`}
          </span>
          <Edit2 className="h-4 w-4 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        <span className="ml-2 text-gray-500">Loading article...</span>
      </div>
    );
  }

  if (error || !article) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
        <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-red-800 mb-2">Error loading article</h3>
        <p className="text-red-600">Please try refreshing the page</p>
      </div>
    );
  }

  const statusStyle = statusColors[article.status] || statusColors.draft;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link href="/knowledge-base" className="text-gray-500 hover:text-gray-700">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900">{article.article_number}</h1>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusStyle.bg} ${statusStyle.text}`}>
                {statusStyle.label}
              </span>
            </div>
            <p className="mt-1 text-sm text-gray-500">{article.title}</p>
          </div>
        </div>

        {/* Status Actions */}
        <div className="flex items-center gap-2">
          {article.status === 'draft' && (
            <Button onClick={() => handleStatusAction('submitForReview')} disabled={submitForReview.isPending}>
              {submitForReview.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
              Submit for Review
            </Button>
          )}
          {article.status === 'review' && (
            <>
              <Button onClick={() => handleStatusAction('publish')} disabled={publishArticle.isPending}>
                {publishArticle.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle className="h-4 w-4 mr-2" />}
                Publish
              </Button>
              <Button variant="outline" onClick={() => handleStatusAction('revertToDraft')} disabled={revertToDraft.isPending}>
                <RotateCcw className="h-4 w-4 mr-2" />
                Back to Draft
              </Button>
            </>
          )}
          {article.status === 'published' && (
            <Button variant="outline" onClick={() => handleStatusAction('archive')} disabled={archiveArticle.isPending}>
              <Archive className="h-4 w-4 mr-2" />
              Archive
            </Button>
          )}
          {article.status === 'archived' && (
            <Button onClick={() => handleStatusAction('revertToDraft')} disabled={revertToDraft.isPending}>
              <RotateCcw className="h-4 w-4 mr-2" />
              Restore
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Tabs */}
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-8">
              <button
                onClick={() => setActiveTab('content')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'content'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <FileText className="h-4 w-4 inline-block mr-2" />
                Content
              </button>
              <button
                onClick={() => setActiveTab('history')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'history'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <History className="h-4 w-4 inline-block mr-2" />
                History
              </button>
            </nav>
          </div>

          {activeTab === 'content' ? (
            <>
              {/* Title */}
              <div className="bg-white rounded-lg shadow p-6">
                <EditableField field="title" value={article.title} label="Title" />
              </div>

              {/* Summary */}
              <div className="bg-white rounded-lg shadow p-6">
                <EditableField field="summary" value={article.summary || ''} label="Summary" />
              </div>

              {/* Content */}
              <div className="bg-white rounded-lg shadow p-6">
                <EditableField field="content" value={article.content} label="Content" multiline />
              </div>

              {/* Feedback Section - Only for published articles */}
              {article.status === 'published' && (
                <div className="bg-white rounded-lg shadow p-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Was this article helpful?</h3>
                  <div className="space-y-4">
                    <div className="flex items-center gap-4">
                      <Button
                        variant="outline"
                        onClick={() => handleFeedback(true)}
                        disabled={submitFeedback.isPending}
                        className="flex items-center"
                      >
                        <ThumbsUp className="h-4 w-4 mr-2" />
                        Yes ({article.helpful_count || 0})
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => handleFeedback(false)}
                        disabled={submitFeedback.isPending}
                        className="flex items-center"
                      >
                        <ThumbsDown className="h-4 w-4 mr-2" />
                        No ({article.not_helpful_count || 0})
                      </Button>
                    </div>
                    <textarea
                      value={feedbackComment}
                      onChange={(e) => setFeedbackComment(e.target.value)}
                      placeholder="Additional feedback (optional)"
                      rows={2}
                      className="w-full px-4 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="bg-white rounded-lg shadow">
              <div className="p-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Version History</h3>
                {history.length === 0 ? (
                  <p className="text-gray-500 text-center py-4">No history available</p>
                ) : (
                  <div className="space-y-4">
                    {history.map((entry: KBArticleHistory) => (
                      <div key={entry.id} className="border-l-2 border-gray-200 pl-4">
                        <p className="text-sm font-medium text-gray-900">{entry.action}</p>
                        <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
                          <User className="h-3 w-3" />
                          <span>{entry.changed_by_name || 'Unknown'}</span>
                          <Clock className="h-3 w-3 ml-2" />
                          <span>{formatDate(entry.created_at)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Details Card */}
          <div className="bg-white rounded-lg shadow p-6 space-y-4">
            <h3 className="text-lg font-medium text-gray-900">Details</h3>

            <EditableField
              field="type"
              value={article.type}
              label="Type"
              type="select"
              options={[
                { value: 'how_to', label: 'How-To' },
                { value: 'troubleshooting', label: 'Troubleshooting' },
                { value: 'faq', label: 'FAQ' },
                { value: 'reference', label: 'Reference' },
                { value: 'policy', label: 'Policy' },
                { value: 'known_error', label: 'Known Error' },
              ]}
            />

            <EditableField
              field="visibility"
              value={article.visibility}
              label="Visibility"
              type="select"
              options={[
                { value: 'public', label: 'Public' },
                { value: 'internal', label: 'Internal' },
                { value: 'restricted', label: 'Restricted' },
              ]}
            />

            <EditableField
              field="categoryId"
              value={article.category_id || ''}
              label="Category"
              type="select"
              options={[
                { value: '', label: 'No Category' },
                ...categories.map((cat: KBCategory) => ({ value: cat.id, label: cat.name })),
              ]}
            />

            <EditableField
              field="tags"
              value={(article.tags || []).join(', ')}
              label="Tags"
            />
          </div>

          {/* Author Card */}
          <div className="bg-white rounded-lg shadow p-6 space-y-4">
            <h3 className="text-lg font-medium text-gray-900">Author</h3>
            <div className="flex items-center">
              <div className="h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center text-lg font-medium text-gray-600">
                {article.author_name?.charAt(0) || '?'}
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-900">{article.author_name || 'Unknown'}</p>
                <p className="text-xs text-gray-500">{article.author_email}</p>
              </div>
            </div>
          </div>

          {/* Statistics Card */}
          <div className="bg-white rounded-lg shadow p-6 space-y-4">
            <h3 className="text-lg font-medium text-gray-900">Statistics</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-gray-500 uppercase">Views</p>
                <div className="flex items-center mt-1">
                  <Eye className="h-4 w-4 text-gray-400 mr-2" />
                  <span className="text-lg font-semibold text-gray-900">{article.view_count || 0}</span>
                </div>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase">Helpful</p>
                <div className="flex items-center mt-1">
                  <ThumbsUp className="h-4 w-4 text-green-500 mr-2" />
                  <span className="text-lg font-semibold text-gray-900">{article.helpful_count || 0}</span>
                </div>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase">Not Helpful</p>
                <div className="flex items-center mt-1">
                  <ThumbsDown className="h-4 w-4 text-red-500 mr-2" />
                  <span className="text-lg font-semibold text-gray-900">{article.not_helpful_count || 0}</span>
                </div>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase">Version</p>
                <span className="text-lg font-semibold text-gray-900">v{article.version}</span>
              </div>
            </div>
          </div>

          {/* Timestamps Card */}
          <div className="bg-white rounded-lg shadow p-6 space-y-3">
            <h3 className="text-lg font-medium text-gray-900">Timestamps</h3>
            <div className="text-sm">
              <p className="text-gray-500">Created</p>
              <p className="text-gray-900">{formatDate(article.created_at)}</p>
            </div>
            <div className="text-sm">
              <p className="text-gray-500">Last Updated</p>
              <p className="text-gray-900">{formatDate(article.updated_at)}</p>
            </div>
            {article.published_at && (
              <div className="text-sm">
                <p className="text-gray-500">Published</p>
                <p className="text-gray-900">{formatDate(article.published_at)}</p>
              </div>
            )}
          </div>

          {/* Related Items */}
          {(article.related_problem_id || article.related_issue_id) && (
            <div className="bg-white rounded-lg shadow p-6 space-y-3">
              <h3 className="text-lg font-medium text-gray-900">Related Items</h3>
              {article.related_problem_id && (
                <div className="text-sm">
                  <p className="text-gray-500">Related Problem</p>
                  <Link href={`/problems/${article.related_problem_id}`} className="text-blue-600 hover:text-blue-800">
                    {article.related_problem_number} - {article.related_problem_title}
                  </Link>
                </div>
              )}
              {article.related_issue_id && (
                <div className="text-sm">
                  <p className="text-gray-500">Related Issue</p>
                  <Link href={`/issues/${article.related_issue_id}`} className="text-blue-600 hover:text-blue-800">
                    {article.related_issue_number} - {article.related_issue_title}
                  </Link>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
