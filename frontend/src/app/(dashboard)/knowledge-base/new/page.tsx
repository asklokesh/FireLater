'use client';

import { useT } from '@/i18n/useT';
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
  const kb = useT('kbForm');
  const tm = useT('listpages2');
  const tl = useT('listpages');
  const tf = useT('forms');
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
            <h1 className="text-2xl font-bold text-foreground">{kb('title')}</h1>
            <p className="mt-1 text-sm text-muted">{kb('subtitle')}</p>
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
              {kb('titleLabel')} <span className="text-error">*</span>
            </label>
            <input
              id="title"
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full px-4 py-2 border border-border-strong rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder={kb('titlePh')}
              required
            />
          </div>

          {/* Summary */}
          <div>
            <label htmlFor="summary" className="block text-sm font-medium text-secondary mb-1">
              {kb('summary')}
            </label>
            <textarea
              id="summary"
              value={formData.summary}
              onChange={(e) => setFormData({ ...formData, summary: e.target.value })}
              rows={2}
              className="w-full px-4 py-2 border border-border-strong rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder={kb('summaryPh')}
            />
          </div>

          {/* Content */}
          <div>
            <label htmlFor="content" className="block text-sm font-medium text-secondary mb-1">
              {kb('content')} <span className="text-error">*</span>
            </label>
            <textarea
              id="content"
              value={formData.content}
              onChange={(e) => setFormData({ ...formData, content: e.target.value })}
              rows={12}
              className="w-full px-4 py-2 border border-border-strong rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary font-mono"
              placeholder={kb('contentPh')}
              required
            />
            <p className="mt-1 text-xs text-muted">{kb('markdownHint')}</p>
          </div>

          {/* Type and Visibility */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label htmlFor="type" className="block text-sm font-medium text-secondary mb-1">
                {kb('articleType')}
              </label>
              <select
                id="type"
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value as typeof formData.type })}
                className="w-full px-4 py-2 border border-border-strong rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="how_to">{kb('howToGuide')}</option>
                <option value="troubleshooting">{tm('troubleshooting')}</option>
                <option value="faq">{tm('faq')}</option>
                <option value="reference">{tm('reference')}</option>
                <option value="policy">{tm('policy')}</option>
                <option value="known_error">{tl('knownError')}</option>
              </select>
            </div>
            <div>
              <label htmlFor="visibility" className="block text-sm font-medium text-secondary mb-1">
                {kb('visibility')}
              </label>
              <select
                id="visibility"
                value={formData.visibility}
                onChange={(e) => setFormData({ ...formData, visibility: e.target.value as typeof formData.visibility })}
                className="w-full px-4 py-2 border border-border-strong rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="public">{kb('public')}</option>
                <option value="internal">{kb('internal')}</option>
                <option value="restricted">{kb('restricted')}</option>
              </select>
            </div>
            <div>
              <label htmlFor="category" className="block text-sm font-medium text-secondary mb-1">
                {kb('category')}
              </label>
              <select
                id="category"
                value={formData.categoryId}
                onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
                className="w-full px-4 py-2 border border-border-strong rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">{kb('noCategory')}</option>
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
                {kb('tags')}
              </label>
              <input
                id="tags"
                type="text"
                value={formData.tags}
                onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                className="w-full px-4 py-2 border border-border-strong rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder={kb('tagsPh')}
              />
              <p className="mt-1 text-xs text-muted">{kb('commaHint')}</p>
            </div>
            <div>
              <label htmlFor="keywords" className="block text-sm font-medium text-secondary mb-1">
                {kb('keywords')}
              </label>
              <input
                id="keywords"
                type="text"
                value={formData.keywords}
                onChange={(e) => setFormData({ ...formData, keywords: e.target.value })}
                className="w-full px-4 py-2 border border-border-strong rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder={kb('keywordsPh')}
              />
              <p className="mt-1 text-xs text-muted">{kb('commaSearchHint')}</p>
            </div>
          </div>
        </div>

        {/* Form Actions */}
        <div className="px-6 py-4 border-t border-border flex justify-end space-x-3">
          <Link href="/knowledge-base">
            <Button variant="outline" type="button">
              {tf('cancel')}
            </Button>
          </Link>
          <Button type="submit" disabled={createArticle.isPending}>
            {createArticle.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {kb('creating')}
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                {kb('create')}
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
