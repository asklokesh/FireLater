'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search } from 'lucide-react';
import { searchApi, type SearchFilterGroup, type SearchResponse } from '@/lib/api';
import { FacetsPanel } from '@/components/search/facets-panel';
import { SearchAutocomplete } from '@/components/search/search-autocomplete';
import { SavedFiltersMenu } from '@/components/search/saved-filters-menu';
import { FilterBuilder } from '@/components/search/filter-builder';
import { EmptyState } from '@/components/ui/empty-state';
import { PageLoading } from '@/components/ui/loading';

function parseFilter(raw: string | null): SearchFilterGroup | undefined {
  if (!raw) return undefined;
  try {
    const f = JSON.parse(raw);
    return f && Array.isArray(f.conditions) ? f : undefined;
  } catch {
    return undefined;
  }
}

function SearchPageContent() {
  const router = useRouter();
  const params = useSearchParams();
  const q = params.get('q') ?? '';
  const filter = parseFilter(params.get('filter'));
  const page = Math.max(1, parseInt(params.get('page') ?? '1', 10) || 1);
  const sort = params.get('sort') ?? undefined;
  const orderParam = params.get('order');
  const order = orderParam === 'asc' || orderParam === 'desc' ? orderParam : undefined;

  const [input, setInput] = useState(q);
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filterKey = params.get('filter') ?? '';

  const navigate = useCallback(
    (next: { q?: string; filter?: SearchFilterGroup; page?: number; sort?: string; order?: 'asc' | 'desc' }) => {
      const sp = new URLSearchParams();
      if (next.q) sp.set('q', next.q);
      if (next.filter) sp.set('filter', JSON.stringify(next.filter));
      if (next.sort) sp.set('sort', next.sort);
      if (next.order) sp.set('order', next.order);
      if (next.page && next.page > 1) sp.set('page', String(next.page));
      const qs = sp.toString();
      router.push(qs ? `/search?${qs}` : '/search');
    },
    [router]
  );

  useEffect(() => {
    setInput(q);
  }, [q]);

  useEffect(() => {
    if (!q && !filterKey) {
      setResult(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    searchApi
      .search({
        q: q || undefined,
        filter: parseFilter(filterKey || null),
        page,
        ...(sort ? { sort } : {}),
        ...(order ? { order } : {}),
      })
      .then((r) => {
        if (!cancelled) setResult(r);
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message || 'Search failed');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [q, filterKey, page, sort, order]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Search</h1>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          navigate({ q: input.trim(), filter, sort, order, page: 1 });
        }}
        className="flex gap-2"
      >
        <SearchAutocomplete
          value={input}
          onChange={setInput}
          onSelect={(text) => navigate({ q: text.trim(), filter, sort, order, page: 1 })}
        />
        <button type="submit" className="px-4 py-2 rounded bg-primary text-white text-sm flex items-center gap-1">
          <Search className="h-4 w-4" /> Search
        </button>
        <SavedFiltersMenu
          q={q}
          filter={filter}
          onApply={(t) => {
            setInput(t.q ?? '');
            navigate({ q: t.q, filter: t.filter, sort: t.sort, order: t.order, page: 1 });
          }}
        />
      </form>

      <FilterBuilder
        key={filterKey}
        value={filter}
        onApply={(f) => navigate({ q, filter: f, page: 1 })}
      />

      <div className="flex gap-6">
        <aside className="w-64 flex-shrink-0">
          {result && (
            <FacetsPanel
              facets={result.facets}
              filter={filter}
              onChange={(f) => navigate({ q, filter: f, page: 1 })}
            />
          )}
        </aside>
        <div className="flex-1">
          {loading ? (
            <PageLoading />
          ) : error ? (
            <div role="alert" className="text-red-600">
              {error}
            </div>
          ) : result ? (
            result.data.length === 0 ? (
              <EmptyState title="No results found" description="Try a different query or filters." />
            ) : (
              <>
                <p className="text-sm text-muted mb-2">
                  {result.pagination.total} results in {result.tookMs} ms
                </p>
                <ul className="divide-y divide-border">
                  {result.data.map((row) => (
                    <li key={row.id} className="py-2 flex gap-4 items-center text-sm">
                      <Link href={`/issues/${row.id}`} className="font-medium text-primary">
                        {row.issue_number}
                      </Link>
                      <span className="flex-1">{row.title}</span>
                      <span>{row.status}</span>
                      <span>{row.priority}</span>
                      <span>{row.application_name ?? ''}</span>
                    </li>
                  ))}
                </ul>
                <div className="flex items-center gap-3 mt-4 text-sm">
                  <button
                    type="button"
                    disabled={result.pagination.page <= 1}
                    onClick={() => navigate({ q, filter, page: page - 1 })}
                  >
                    Previous
                  </button>
                  <span>
                    Page {result.pagination.page} of {result.pagination.totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={result.pagination.page >= result.pagination.totalPages}
                    onClick={() => navigate({ q, filter, page: page + 1 })}
                  >
                    Next
                  </button>
                </div>
              </>
            )
          ) : (
            <EmptyState title="Search issues" description="Enter a query to begin." />
          )}
        </div>
      </div>
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <SearchPageContent />
    </Suspense>
  );
}
