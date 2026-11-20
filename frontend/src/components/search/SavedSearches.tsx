'use client';

import { useT } from '@/i18n/useT';
import { useState } from 'react';
import { Bookmark, Trash2, Users } from 'lucide-react';
import type { SavedSearch, SavedSearchInput } from '@/lib/api';
import { useCreateSavedSearch, useDeleteSavedSearch, useSavedSearches } from '@/hooks/useSearch';
import { Button } from '@/components/ui/button';

interface SavedSearchesProps {
  current: Omit<SavedSearchInput, 'name'>;
  onLoad: (template: SavedSearch) => void;
}

export function SavedSearches({ current, onLoad }: SavedSearchesProps) {
  const sh = useT('shared');
  const { data: templates = [], isLoading } = useSavedSearches();
  const createMutation = useCreateSavedSearch();
  const deleteMutation = useDeleteSavedSearch();
  const [name, setName] = useState('');
  const [shared, setShared] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSave = name.trim().length > 0 && (Boolean(current.queryText?.trim()) || Boolean(current.filters) || Boolean(current.entityTypes?.length));

  const save = async () => {
    setError(null);
    try {
      await createMutation.mutateAsync({ ...current, name: name.trim(), isShared: shared });
      setName('');
      setShared(false);
    } catch (err) {
      const message = (err as { response?: { data?: { message?: string; error?: string } } }).response?.data;
      setError(message?.message ?? message?.error ?? sh('saveFailed'));
    }
  };

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{sh('savedSearches')}</h3>
      {isLoading && <p className="text-sm text-muted">{sh('loading')}</p>}
      {!isLoading && templates.length === 0 && <p className="text-sm text-muted">{sh('noSaved')}</p>}
      <ul className="space-y-1">
        {templates.map((t) => (
          <li key={t.id} className="group flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => onLoad(t)}
              className="flex items-center gap-2 text-sm text-secondary hover:text-foreground truncate text-left"
              title={t.description ?? t.queryText}
            >
              <Bookmark className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{t.name}</span>
              {t.isShared && <Users className="h-3.5 w-3.5 shrink-0 text-muted" aria-label={sh('shared')} />}
            </button>
            {t.isOwner && (
              <button
                type="button"
                aria-label={`Delete saved search ${t.name}`}
                onClick={() => deleteMutation.mutate(t.id)}
                className="p-1 text-muted opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-error"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </li>
        ))}
      </ul>

      <div className="pt-3 border-t border-border space-y-2">
        <input
          aria-label={sh('savedName')}
          value={name}
          maxLength={100}
          placeholder={sh('nameThis')}
          onChange={(e) => setName(e.target.value)}
          className="w-full px-2.5 py-1.5 border border-border-strong rounded-lg text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        />
        <label className="flex items-center gap-2 text-sm text-secondary">
          <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} />
          {sh('shareTeam')}
        </label>
        <Button size="sm" variant="secondary" onClick={save} disabled={!canSave} isLoading={createMutation.isPending} className="w-full">
          {sh('saveCurrent')}
        </Button>
        {error && <p className="text-xs text-error" role="alert">{error}</p>}
      </div>
    </div>
  );
}
