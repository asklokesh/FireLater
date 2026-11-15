'use client';

import { useCallback, useEffect, useState } from 'react';
import { searchApi, type SearchFilterGroup } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';

export interface SavedTemplate {
  id: string;
  owner_id: string;
  name: string;
  entity: 'issues' | 'problems';
  query: string | null;
  filter: SearchFilterGroup | null;
  is_shared: boolean;
}

interface Props {
  query: string;
  filters: SearchFilterGroup;
  onLoad: (query: string, filters: SearchFilterGroup) => void;
}

export function SavedFiltersMenu({ query, filters, onLoad }: Props) {
  const { user } = useAuthStore();
  const [templates, setTemplates] = useState<SavedTemplate[]>([]);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await searchApi.listTemplates();
      setTemplates(res?.data ?? []);
    } catch {
      setError('Failed to load saved filters');
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    searchApi
      .listTemplates()
      .then((res) => {
        if (!cancelled) setTemplates(res?.data ?? []);
      })
      .catch(() => {
        if (!cancelled) setError('Failed to load saved filters');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const save = async () => {
    if (!name.trim()) return;
    try {
      await searchApi.createTemplate({
        name: name.trim(),
        entity: 'issues',
        query: query || null,
        filter: filters.conditions.length ? filters : null,
      });
      setName('');
      await refresh();
    } catch {
      setError('Failed to save filter');
    }
  };

  const remove = async (id: string) => {
    try {
      await searchApi.deleteTemplate(id);
      await refresh();
    } catch {
      setError('Failed to delete filter');
    }
  };

  return (
    <div className="space-y-2" aria-label="Saved filters">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">Saved filters</h3>
      {error && <p className="text-xs text-error">{error}</p>}
      <ul className="space-y-1">
        {templates.map((t) => {
          const own = t.owner_id === user?.id;
          return (
            <li key={t.id} className="flex items-center gap-2 text-sm">
              <button
                type="button"
                className="flex-1 text-left hover:underline"
                onClick={() => onLoad(t.query ?? '', t.filter ?? { logic: 'AND', conditions: [] })}
              >
                {t.name}
              </button>
              {!own && <span className="text-xs text-muted">Shared (read-only)</span>}
              {own && (
                <button type="button" aria-label={`Delete ${t.name}`} className="text-xs text-error" onClick={() => remove(t.id)}>
                  Delete
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <div className="flex gap-2">
        <input
          aria-label="Filter name"
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="flex-1 rounded border border-border-strong bg-surface text-sm px-2 py-1"
        />
        <button type="button" onClick={save} className="text-sm text-primary">
          Save
        </button>
      </div>
    </div>
  );
}
