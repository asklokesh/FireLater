'use client';

import { useState } from 'react';
import Link from 'next/link';
import { SearchBar } from '@/components/search/SearchBar';
import {
  useIssueSearch,
  useSearchFacets,
  useSavedFilters,
  useCreateSavedFilter,
  useDeleteSavedFilter,
  type SearchFilterNode,
} from '@/hooks/useApi';

interface FacetBucket {
  value: string | null;
  count: number;
}

export default function SearchPage() {
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [mode, setMode] = useState<'and' | 'or'>('and');
  const [page, setPage] = useState(1);

  // Within one facet values are OR-ed; facets are combined using the chosen mode
  const conditions: SearchFilterNode[] = Object.entries(selected)
    .filter(([, v]) => v.length > 0)
    .map(([field, values]) => ({ field, op: 'in' as const, value: values }));
  const filter: SearchFilterNode | undefined =
    conditions.length === 0 ? undefined : mode === 'and' ? { and: conditions } : { or: conditions };

  const results = useIssueSearch({ q: q || undefined, filter, page, perPage: 20 });
  const facets = useSearchFacets({ q: q || undefined, filter });
  const saved = useSavedFilters();
  const createFilter = useCreateSavedFilter();
  const deleteFilter = useDeleteSavedFilter();

  const toggle = (field: string, value: string) => {
    setPage(1);
    setSelected((prev) => {
      const cur = prev[field] ?? [];
      return { ...prev, [field]: cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value] };
    });
  };

  const saveCurrent = () => {
    const name = window.prompt('Name this filter');
    if (name) createFilter.mutate({ name, query: q || undefined, filter });
  };

  const applySaved = (f: { query?: string; filter?: SearchFilterNode }) => {
    setQ(f.query ?? '');
    setPage(1);
    const next: Record<string, string[]> = {};
    const node = f.filter as { and?: SearchFilterNode[]; or?: SearchFilterNode[] } | undefined;
    const kids = node?.and ?? node?.or ?? [];
    setMode(node?.or ? 'or' : 'and');
    for (const k of kids) {
      if ('field' in k && k.op === 'in' && Array.isArray(k.value)) next[k.field] = k.value.map(String);
    }
    setSelected(next);
  };

  const rows = results.data?.data ?? [];

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Search</h1>
        <Link href="/search/analytics" className="text-sm text-blue-600 hover:underline">
          Search analytics
        </Link>
      </div>
      <SearchBar value={q} onSubmit={(v) => { setQ(v); setPage(1); }} />

      <div className="grid grid-cols-4 gap-6">
        <aside className="col-span-1 space-y-4">
          <div className="flex items-center gap-2 text-sm">
            <span>Combine facets with</span>
            <select value={mode} onChange={(e) => setMode(e.target.value as 'and' | 'or')} className="border rounded px-1">
              <option value="and">AND</option>
              <option value="or">OR</option>
            </select>
          </div>
          {Object.entries((facets.data ?? {}) as Record<string, FacetBucket[]>).map(([field, buckets]) => (
            <div key={field}>
              <h2 className="text-sm font-medium capitalize">{field.replace(/_/g, ' ')}</h2>
              <ul>
                {buckets
                  .filter((b) => b.value !== null)
                  .map((b) => (
                    <li key={b.value as string}>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={(selected[field] ?? []).includes(b.value as string)}
                          onChange={() => toggle(field, b.value as string)}
                        />
                        <span className="truncate">{b.value}</span>
                        <span className="ml-auto text-gray-500">{b.count}</span>
                      </label>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
          <div>
            <h2 className="text-sm font-medium">Saved filters</h2>
            <button type="button" onClick={saveCurrent} className="text-sm text-blue-600 hover:underline">
              Save current search
            </button>
            <ul>
              {(saved.data?.filters ?? []).map((f: { id: string; name: string; query?: string; filter?: SearchFilterNode }) => (
                <li key={f.id} className="flex items-center justify-between text-sm">
                  <button type="button" onClick={() => applySaved(f)} className="hover:underline">
                    {f.name}
                  </button>
                  <button type="button" onClick={() => deleteFilter.mutate(f.id)} className="text-gray-500 hover:text-red-600">
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </aside>

        <main className="col-span-3">
          {results.isLoading ? (
            <p>Loading...</p>
          ) : rows.length === 0 ? (
            <p className="text-gray-500">No results.</p>
          ) : (
            <>
              <p className="mb-2 text-sm text-gray-500">{results.data?.total} results</p>
              <ul className="divide-y">
                {rows.map((r: { id: string; issue_number: string; title: string; status: string; priority: string }) => (
                  <li key={r.id} className="py-2">
                    <Link href={`/issues/${r.id}`} className="font-medium text-blue-600 hover:underline">
                      {r.issue_number} {r.title}
                    </Link>
                    <div className="text-xs text-gray-500">
                      {r.status} / {r.priority}
                    </div>
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex gap-2">
                <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className="border rounded px-2 py-1 text-sm disabled:opacity-50">
                  Previous
                </button>
                <button type="button" disabled={page * 20 >= (results.data?.total ?? 0)} onClick={() => setPage(page + 1)} className="border rounded px-2 py-1 text-sm disabled:opacity-50">
                  Next
                </button>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
