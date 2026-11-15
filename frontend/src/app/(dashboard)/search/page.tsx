'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, Search as SearchIcon } from 'lucide-react';
import { searchApi, type SearchFilterGroup } from '@/lib/api';
import { SearchBox } from '@/components/search/search-box';
import { FilterBuilder } from '@/components/search/filter-builder';
import { FacetPanel, type Facets } from '@/components/search/facet-panel';
import { SavedFiltersMenu } from '@/components/search/saved-filters-menu';
import { EmptyState } from '@/components/ui/empty-state';

interface SearchResult {
  id: string;
  title: string;
  status?: string;
  priority?: string;
  rank?: number;
  issue_number?: string;
  problem_number?: string;
}

const PER_PAGE = 20;
const emptyFilters = (): SearchFilterGroup => ({ logic: 'AND', conditions: [] });

function parseFilters(raw: string | null): SearchFilterGroup {
  if (!raw) return emptyFilters();
  try {
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.conditions)) return parsed;
  } catch {
    /* ignore malformed */
  }
  return emptyFilters();
}

function SearchPageContent() {
  const router = useRouter();
  const params = useSearchParams();
  const q = params.get('q') ?? '';
  const filtersRaw = params.get('filters');
  const page = Math.max(1, parseInt(params.get('page') ?? '1', 10) || 1);
  const filters = useMemo(() => parseFilters(filtersRaw), [filtersRaw]);

  const requestKey = `${q}\u0000${filtersRaw ?? ''}\u0000${page}`;
  const [outcome, setOutcome] = useState<{
    key: string;
    results: SearchResult[];
    total: number;
    facets: Facets;
    error: string | null;
  } | null>(null);
  const loading = outcome?.key !== requestKey;
  const results = outcome?.results ?? [];
  const total = outcome?.total ?? 0;
  const facets = outcome?.facets ?? {};
  const error = outcome?.error ?? null;

  const update = useCallback(
    (next: { q?: string; filters?: SearchFilterGroup; page?: number }) => {
      const nq = next.q ?? q;
      const nf = next.filters ?? filters;
      const np = next.page ?? 1;
      const sp = new URLSearchParams();
      if (nq) sp.set('q', nq);
      if (nf.conditions.length) sp.set('filters', JSON.stringify(nf));
      if (np > 1) sp.set('page', String(np));
      const qs = sp.toString();
      router.push(qs ? `/search?${qs}` : '/search');
    },
    [q, filters, router]
  );

  useEffect(() => {
    let cancelled = false;
    searchApi
      .search({ q, filters, page, per_page: PER_PAGE })
      .then((res) => {
        if (cancelled) return;
        setOutcome({
          key: requestKey,
          results: res.results ?? [],
          total: res.total ?? 0,
          facets: res.facets ?? {},
          error: null,
        });
      })
      .catch(() => {
        if (!cancelled) setOutcome({ key: requestKey, results: [], total: 0, facets: {}, error: 'Search failed' });
      });
    return () => {
      cancelled = true;
    };
  }, [q, filters, page, requestKey]);

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-foreground">Search</h1>
      <SearchBox value={q} onSubmit={(text) => update({ q: text })} />
      <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
        <aside className="space-y-6">
          <FacetPanel facets={facets} filters={filters} onChange={(f) => update({ filters: f })} />
          <SavedFiltersMenu
            query={q}
            filters={filters}
            onLoad={(lq, lf) => update({ q: lq, filters: lf })}
          />
        </aside>
        <main className="space-y-4">
          <FilterBuilder value={filters} onChange={(f) => update({ filters: f })} />
          {loading ? (
            <div className="flex items-center gap-2 text-muted" role="status">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading results...
            </div>
          ) : error ? (
            <p className="text-error">{error}</p>
          ) : results.length === 0 ? (
            <EmptyState icon={SearchIcon} title="No results found" description="Try a different query or fewer filters." />
          ) : (
            <>
              <p className="text-sm text-muted">{total} results</p>
              <ul className="divide-y divide-border rounded-lg border border-border">
                {results.map((r) => (
                  <li key={r.id} className="p-3">
                    <Link href={`/issues/${r.id}`} className="font-medium text-foreground hover:underline">
                      {r.title}
                    </Link>
                    <div className="text-xs text-muted">
                      {[r.issue_number ?? r.problem_number, r.status, r.priority].filter(Boolean).join(' · ')}
                    </div>
                  </li>
                ))}
              </ul>
              <div className="flex items-center justify-between text-sm">
                <button disabled={page <= 1} onClick={() => update({ page: page - 1 })}>
                  Previous
                </button>
                <span>
                  Page {page} of {totalPages}
                </span>
                <button disabled={page >= totalPages} onClick={() => update({ page: page + 1 })}>
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

export default function SearchPage() {
  return (
    <Suspense fallback={null}>
      <SearchPageContent />
    </Suspense>
  );
}
