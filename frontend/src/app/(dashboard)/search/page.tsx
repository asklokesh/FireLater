'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Save, Trash2 } from 'lucide-react';
import { SearchBar } from '@/components/search/SearchBar';
import { FacetSidebar } from '@/components/search/FacetSidebar';
import {
  useSearch,
  useSearchFacets,
  useFilterTemplates,
  useSaveFilterTemplate,
  useDeleteFilterTemplate,
  FilterGroup,
  FilterCondition,
} from '@/hooks/useSearch';

function selectedToFilterGroup(selected: Record<string, string[]>): FilterGroup | undefined {
  const conditions: FilterCondition[] = Object.entries(selected)
    .filter(([, values]) => values.length > 0)
    .map(([field, values]) => ({ field, op: 'in', value: values }));
  return conditions.length ? { operator: 'AND', conditions } : undefined;
}

function filterGroupToSelected(group: FilterGroup | undefined): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const c of group?.conditions ?? []) {
    if ('field' in c && c.op === 'in' && Array.isArray(c.value)) out[c.field] = c.value.map(String);
  }
  return out;
}

export default function SearchPage() {
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const filterGroup = useMemo(() => selectedToFilterGroup(selected), [selected]);
  const request = { q: query, filterGroup, page, perPage: 20 };

  const results = useSearch(request);
  const facets = useSearchFacets({ q: query, filterGroup });
  const templates = useFilterTemplates();
  const saveTemplate = useSaveFilterTemplate();
  const deleteTemplate = useDeleteFilterTemplate();

  const toggle = (dimension: string, value: string) => {
    setPage(1);
    setSelected((prev) => {
      const current = prev[dimension] ?? [];
      const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
      return { ...prev, [dimension]: next };
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Search</h1>
        <Link href="/search/analytics" className="text-sm text-blue-600 hover:underline">Search analytics</Link>
      </div>
      <SearchBar value={input} onChange={setInput} onSubmit={(v) => { setQuery(v); setPage(1); }} />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
        <div className="space-y-6">
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Saved filters</h2>
              <button
                type="button"
                className="flex items-center gap-1 text-xs text-blue-600"
                onClick={() => {
                  const name = window.prompt('Name this filter');
                  if (name) saveTemplate.mutate({ name, query, filterGroup });
                }}
              >
                <Save className="h-3 w-3" /> Save
              </button>
            </div>
            <ul className="space-y-1">
              {(templates.data?.data ?? []).map((t) => (
                <li key={t.id} className="flex items-center justify-between text-sm">
                  <button
                    type="button"
                    className="truncate text-left hover:underline"
                    onClick={() => {
                      setInput(t.query ?? '');
                      setQuery(t.query ?? '');
                      setSelected(filterGroupToSelected(t.filter_group));
                      setPage(1);
                    }}
                  >
                    {t.name}
                  </button>
                  <button type="button" aria-label={`Delete ${t.name}`} onClick={() => deleteTemplate.mutate(t.id)}>
                    <Trash2 className="h-3 w-3 text-gray-400" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
          <FacetSidebar facets={facets.data?.facets} selected={selected} onToggle={toggle} />
        </div>

        <div className="md:col-span-3">
          {results.isLoading && <p className="text-sm text-gray-500">Searching...</p>}
          {results.isError && <p className="text-sm text-red-600">Search failed.</p>}
          {results.data && (
            <>
              <p className="mb-2 text-sm text-gray-500">{results.data.pagination.total} results</p>
              <ul className="divide-y rounded-md border">
                {results.data.data.map((r) => (
                  <li key={r.id} className="p-3">
                    <Link href={`/issues/${r.id}`} className="font-medium hover:underline">
                      {r.issue_number}: {r.title}
                    </Link>
                    <div className="text-xs text-gray-500">{r.status} / {r.priority}</div>
                    {r.headline && <p className="mt-1 text-sm text-gray-700">{r.headline.replace(/<\/?b>/g, '')}</p>}
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex gap-2">
                <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className="text-sm disabled:opacity-40">Previous</button>
                <button
                  type="button"
                  disabled={page >= results.data.pagination.totalPages}
                  onClick={() => setPage(page + 1)}
                  className="text-sm disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
