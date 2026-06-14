'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Save,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCreateKBArticle, useKBCategories, KBCategory } from '@/hooks/useApi';

export default function NewArticlePage() {
  const router = useRouter();
  const { data: categoriesData } = useKBCategories();
  const categories = categoriesData ?? [];

  const createArticle = useCreateKBArticle();

  const [formData, setFormData] = useState({
    title: '',
    summary: '',
    content: '',
    type: 'how_to' as 'how_to' | 'troubleshooting' | 'faq' | 'reference' | 'policy' | 'known_error',
    visibility: 'internal' as 'public' | 'internal' | 'restricted',
    categoryId: '',
    tags: '',
    keywords: '',
  });
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.title.trim() || formData.title.length < 5) {
      setError('Title must be at least 5 characters');
      return;
    }
    if (!formData.content.trim() || formData.content.length < 10) {
      setError('Content must be at least 10 characters');
      return;
    }

    try {
      await createArticle.mutateAsync({
        title: formData.title.trim(),
        summary: formData.summary.trim() || undefined,
        content: formData.content.trim(),
        type: formData.type,
        visibility: formData.visibility,
        categoryId: formData.categoryId || undefined,
        tags: formData.tags ? formData.tags.split(',').map(t => t.trim()).filter(Boolean) : undefined,
        keywords: formData.keywords ? formData.keywords.split(',').map(k => k.trim()).filter(Boolean) : undefined,
      });
      router.push('/knowledge-base');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create article');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link href="/knowledge-base" className="text-muted hover:text-secondary">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-foreground">New Article</h1>
            <p className="mt-1 text-sm text-muted">Create a new knowledge base article</p>
          </div>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="bg-surface rounded-xl shadow-sm" role="form">
        <div className="p-6 space-y-6">
          {error && (
            <div className="bg-error-subtle border border-error rounded-lg p-4 text-sm text-error">
              {error}
            </div>
          )}

          {/* Title */}
          <div>
            <label htmlFor="title" className="block text-sm font-medium text-secondary mb-1">
              Title <span className="text-error">*</span>
            </label>
            <input
              id="title"
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full px-4 py-2 border border-border-strong rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="Enter article title"
              required
            />
          </div>

          {/* Summary */}
          <div>
            <label htmlFor="summary" className="block text-sm font-medium text-secondary mb-1">
              Summary
            </label>
            <textarea
              id="summary"
              value={formData.summary}
              onChange={(e) => setFormData({ ...formData, summary: e.target.value })}
              rows={2}
              className="w-full px-4 py-2 border border-border-strong rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="Brief summary of the article"
            />
          </div>

          {/* Content */}
          <div>
            <label htmlFor="content" className="block text-sm font-medium text-secondary mb-1">
              Content <span className="text-error">*</span>
            </label>
            <textarea
              id="content"
              value={formData.content}
              onChange={(e) => setFormData({ ...formData, content: e.target.value })}
              rows={12}
              className="w-full px-4 py-2 border border-border-strong rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary font-mono"
              placeholder="Article content (Markdown supported)"
              required
            />
            <p className="mt-1 text-xs text-muted">Supports Markdown formatting</p>
          </div>

          {/* Type and Visibility */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label htmlFor="type" className="block text-sm font-medium text-secondary mb-1">
                Article Type
              </label>
              <select
                id="type"
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value as typeof formData.type })}
                className="w-full px-4 py-2 border border-border-strong rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="how_to">How-To Guide</option>
                <option value="troubleshooting">Troubleshooting</option>
                <option value="faq">FAQ</option>
                <option value="reference">Reference</option>
                <option value="policy">Policy</option>
                <option value="known_error">Known Error</option>
              </select>
            </div>
            <div>
              <label htmlFor="visibility" className="block text-sm font-medium text-secondary mb-1">
                Visibility
              </label>
              <select
                id="visibility"
                value={formData.visibility}
                onChange={(e) => setFormData({ ...formData, visibility: e.target.value as typeof formData.visibility })}
                className="w-full px-4 py-2 border border-border-strong rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="public">Public</option>
                <option value="internal">Internal</option>
                <option value="restricted">Restricted</option>
              </select>
            </div>
            <div>
              <label htmlFor="category" className="block text-sm font-medium text-secondary mb-1">
                Category
              </label>
              <select
                id="category"
                value={formData.categoryId}
                onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
                className="w-full px-4 py-2 border border-border-strong rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">No Category</option>
                {categories.map((cat: KBCategory) => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Tags and Keywords */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="tags" className="block text-sm font-medium text-secondary mb-1">
                Tags
              </label>
              <input
                id="tags"
                type="text"
                value={formData.tags}
                onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                className="w-full px-4 py-2 border border-border-strong rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="tag1, tag2, tag3"
              />
              <p className="mt-1 text-xs text-muted">Comma-separated list</p>
            </div>
            <div>
              <label htmlFor="keywords" className="block text-sm font-medium text-secondary mb-1">
                Keywords
              </label>
              <input
                id="keywords"
                type="text"
                value={formData.keywords}
                onChange={(e) => setFormData({ ...formData, keywords: e.target.value })}
                className="w-full px-4 py-2 border border-border-strong rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="keyword1, keyword2, keyword3"
              />
              <p className="mt-1 text-xs text-muted">Comma-separated list for search</p>
            </div>
          </div>
        </div>

        {/* Form Actions */}
        <div className="px-6 py-4 border-t border-border flex justify-end space-x-3">
          <Link href="/knowledge-base">
            <Button variant="outline" type="button">
              Cancel
            </Button>
          </Link>
          <Button type="submit" disabled={createArticle.isPending}>
            {createArticle.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Create Article
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
