'use client';

import { useCallback, useEffect, useState } from 'react';
import { searchApi } from '@/lib/api';
import type { SearchFilter, SearchTemplate } from '@/lib/api';

interface SavedFiltersProps {
  query: string;
  filter?: SearchFilter;
  onLoad: (t: { query: string; filter?: SearchFilter }) => void;
}

export function SavedFilters({ query, filter, onLoad }: SavedFiltersProps) {
  const [templates, setTemplates] = useState<SearchTemplate[]>([]);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await searchApi.listTemplates();
      setTemplates(res?.data ?? []);
      setError(null);
    } catch {
      setError('Failed to load saved filters');
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    searchApi
      .listTemplates()
      .then((res) => {
        if (cancelled) return;
        setTemplates(res?.data ?? []);
        setError(null);
      })
      .catch(() => {
        if (!cancelled) setError('Failed to load saved filters');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const save = async () => {
    const n = name.trim();
    if (!n) return;
    try {
      await searchApi.createTemplate({ name: n, query, filter });
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
    <div className="space-y-2">
      <h3 className="text-sm font-medium">Saved filters</h3>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <input aria-label="Filter name" value={name} onChange={(e) => setName(e.target.value)}
          className="border border-border rounded px-2 py-1 text-sm bg-surface" />
        <button type="button" onClick={save}
          className="px-3 py-1 text-sm rounded bg-primary text-primary-fg">
          Save
        </button>
      </div>
      <ul className="space-y-1">
        {templates.map((t) => (
          <li key={t.id} className="flex items-center gap-2 text-sm">
            <button type="button" onClick={() => onLoad({ query: t.query ?? '', filter: t.filter })}>
              {t.name}
            </button>
            <button type="button" aria-label={`Delete ${t.name}`} className="text-muted"
              onClick={() => remove(t.id)}>
              Delete
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
