'use client';

import { useT } from '@/i18n/useT';
import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, BarChart2, ChevronDown, Filter, History, Loader2, SearchX, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SearchBox } from '@/components/search/SearchBox';
import { FacetGroup } from '@/components/search/FacetGroup';
import { FilterBuilder } from '@/components/search/FilterBuilder';
import { SavedSearches } from '@/components/search/SavedSearches';
import { HighlightedText } from '@/components/search/HighlightedText';
import {
  useClearSearchHistory,
  useRecordSavedSearchUse,
  useSearchFields,
  useSearchHistory,
  useSearchResults,
} from '@/hooks/useSearch';
import type { SavedSearch, SearchEntityType, SearchFilterGroup, SearchSort } from '@/lib/api';
import {
  ENTITY_LABELS,
  ENTITY_SINGULAR,
  buildSearchFilters,
  humanize,
  rowsToFilterGroup,
  splitSavedFilters,
  toggleValue,
  type FilterRow,
  type SearchFieldType,
} from '@/lib/search';

const PER_PAGE = 20;
const BUILDER_DEBOUNCE_MS = 400;

const ENTITY_BADGE: Record<SearchEntityType, string> = {
  issue: 'bg-error-subtle text-error',
  problem: 'bg-warning-subtle text-warning',
  change: 'bg-info-subtle text-info',
  knowledge: 'bg-success-subtle text-success',
};

function formatDate(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function SearchPageContent() {
  const tp = useT('pages');
  const tn = useT('listpages3');
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQ = searchParams.get('q') ?? '';

  const [input, setInput] = useState(initialQ);
  const [q, setQ] = useState(initialQ);
  const [types, setTypes] = useState<SearchEntityType[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [priorities, setPriorities] = useState<string[]>([]);
  const [rows, setRows] = useState<FilterRow[]>([]);
  const [rowsOp, setRowsOp] = useState<'and' | 'or'>('and');
  const [nested, setNested] = useState<SearchFilterGroup[]>([]);
  const [sort, setSort] = useState<SearchSort | ''>('');
  const [page, setPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);

  // Follow ?q= changes, for example from the header search box. State is
  // adjusted during render rather than in an effect to avoid a second render.
  const [syncedQ, setSyncedQ] = useState(initialQ);
  if (syncedQ !== initialQ) {
    setSyncedQ(initialQ);
    setInput(initialQ);
    setQ(initialQ);
    setPage(1);
  }

  const { data: fields } = useSearchFields();
  const fieldTypes = useMemo(() => {
    const map = new Map<string, SearchFieldType>();
    for (const entity of fields?.entities ?? []) {
      for (const f of entity.fields) if (!map.has(f.name)) map.set(f.name, f.type);
    }
    return map;
  }, [fields]);

  // Builder edits apply after a short pause so each keystroke is not a
  // search. Loading a template or history entry applies rows immediately.
  const [appliedRows, setAppliedRows] = useState<FilterRow[]>([]);
  useEffect(() => {
    if (rows === appliedRows) return;
    const handle = setTimeout(() => setAppliedRows(rows), BUILDER_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [rows, appliedRows]);
  const setRowsNow = (next: FilterRow[]) => {
    setRows(next);
    setAppliedRows(next);
  };

  const filters = useMemo(
    () => buildSearchFilters({ statuses, priorities, rows: appliedRows, rowsOp, nested, fieldTypes }),
    [statuses, priorities, appliedRows, rowsOp, nested, fieldTypes]
  );
  const hasCriteria = q.trim().length > 0 || filters !== null || types.length > 0;

  const request = useMemo(
    () => ({
      q: q || undefined,
      filters,
      entityTypes: types.length ? types : undefined,
      page,
      perPage: PER_PAGE,
      sort: sort || undefined,
    }),
    [q, filters, types, page, sort]
  );

  const { data, isLoading, isFetching, error } = useSearchResults(request, hasCriteria);
  const { data: history = [] } = useSearchHistory();
  const clearHistory = useClearSearchHistory();
  const recordUse = useRecordSavedSearchUse();

  const submit = (value: string) => {
    setQ(value);
    setPage(1);
    const params = new URLSearchParams();
    if (value) params.set('q', value);
    router.replace(params.toString() ? `/search?${params}` : '/search');
  };

  const resetFilters = () => {
    setTypes([]);
    setStatuses([]);
    setPriorities([]);
    setRowsNow([]);
    setRowsOp('and');
    setNested([]);
    setPage(1);
  };

  const loadTemplate = (t: SavedSearch) => {
    const split = splitSavedFilters(t.filters);
    setInput(t.queryText);
    setTypes(t.entityTypes);
    setStatuses(split.statuses);
    setPriorities(split.priorities);
    setRowsNow(split.rows);
    setRowsOp(split.rowsOp);
    setNested(split.nested);
    setShowFilters(split.rows.length > 0);
    submit(t.queryText);
    recordUse.mutate(t.id);
  };

  const loadHistory = (queryText: string, savedFilters: SearchFilterGroup | Record<string, never>, entityTypes: SearchEntityType[]) => {
    const split = splitSavedFilters(savedFilters);
    setInput(queryText);
    setTypes(entityTypes.length === Object.keys(ENTITY_LABELS).length ? [] : entityTypes);
    setStatuses(split.statuses);
    setPriorities(split.priorities);
    setRowsNow(split.rows);
    setRowsOp(split.rowsOp);
    setNested(split.nested);
    submit(queryText);
  };

  const activeBuilderCount = rowsToFilterGroup(rows, rowsOp, fieldTypes)?.conditions.length ?? 0;
  const filterCount = types.length + statuses.length + priorities.length + activeBuilderCount + nested.length;
  const facets = data?.facets;
  const errorMessage = (error as { response?: { data?: { message?: string } } } | null)?.response?.data?.message;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{tp('search')}</h1>
          <p className="mt-1 text-sm text-muted">
            {tn('searchSubtitle')}
          </p>
        </div>
        <Link href="/search/analytics">
          <Button variant="outline" size="sm">
            <BarChart2 className="h-4 w-4" />
            Analytics
          </Button>
        </Link>
      </div>

      <div className="bg-surface rounded-xl shadow-sm p-4 space-y-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <SearchBox value={input} onChange={setInput} onSubmit={submit} autoFocus />
          </div>
          <select
            aria-label="Sort by"
            value={sort}
            onChange={(e) => {
              setSort(e.target.value as SearchSort | '');
              setPage(1);
            }}
            className="px-3 py-2 border border-border-strong rounded-xl text-sm bg-surface"
          >
            <option value="">{tn('bestMatch')}</option>
            <option value="updated">{tn('recentlyUpdated')}</option>
            <option value="created">{tn('newest')}</option>
          </select>
          <Button variant="outline" onClick={() => setShowFilters((s) => !s)} aria-expanded={showFilters}>
            <Filter className="h-4 w-4" />
            Filters{filterCount > 0 ? ` (${filterCount})` : ''}
            <ChevronDown className={`h-4 w-4 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
          </Button>
        </div>
        <p className="text-xs text-muted">
          Try <code className="font-mono">vpn status:new,in_progress assignee:me</code>,{' '}
          <code className="font-mono">&quot;disk full&quot; -status:closed created:&gt;7d</code> or{' '}
          <code className="font-mono">type:kb reset password</code>
        </p>
        {showFilters && (
          <div className="pt-4 border-t border-border">
            <FilterBuilder
              fields={fields}
              rows={rows}
              op={rowsOp}
              onChange={(nextRows, nextOp) => {
                setRows(nextRows);
                setRowsOp(nextOp);
                setPage(1);
              }}
            />
            {nested.length > 0 && (
              <p className="mt-3 text-xs text-muted">
                This search also includes {nested.length} nested filter group{nested.length > 1 ? 's' : ''} from a saved search.
              </p>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[16rem_1fr] gap-6">
        <aside className="space-y-6">
          <div className="bg-surface rounded-xl shadow-sm p-4 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground">Refine</h2>
              {filterCount > 0 && (
                <button type="button" onClick={resetFilters} className="text-xs text-primary hover:underline">
                  {tn('clearAll')}
                </button>
              )}
            </div>
            <FacetGroup
              title="Type"
              buckets={facets?.entityType ?? []}
              selected={types}
              onToggle={(v) => {
                setTypes((t) => toggleValue(t, v as SearchEntityType));
                setPage(1);
              }}
              labelFor={(v) => ENTITY_LABELS[v as SearchEntityType] ?? humanize(v)}
            />
            <FacetGroup
              title="Status"
              buckets={facets?.status ?? []}
              selected={statuses}
              onToggle={(v) => {
                setStatuses((s) => toggleValue(s, v));
                setPage(1);
              }}
              labelFor={humanize}
            />
            <FacetGroup
              title="Priority"
              buckets={facets?.priority ?? []}
              selected={priorities}
              onToggle={(v) => {
                setPriorities((p) => toggleValue(p, v));
                setPage(1);
              }}
              labelFor={humanize}
            />
            {!facets && <p className="text-sm text-muted">Run a search to see filters.</p>}
          </div>

          <div className="bg-surface rounded-xl shadow-sm p-4">
            <SavedSearches
              current={{ queryText: q, filters, entityTypes: types }}
              onLoad={loadTemplate}
            />
          </div>

          {history.length > 0 && (
            <div className="bg-surface rounded-xl shadow-sm p-4 space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Recent searches</h3>
                <button
                  type="button"
                  aria-label="Clear recent searches"
                  onClick={() => clearHistory.mutate()}
                  className="p-1 text-muted hover:text-error"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <ul className="space-y-1">
                {history.map((h) => (
                  <li key={h.id}>
                    <button
                      type="button"
                      onClick={() => loadHistory(h.queryText, h.filters, h.entityTypes)}
                      className="flex items-center gap-2 w-full text-left text-sm text-secondary hover:text-foreground"
                    >
                      <History className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{h.queryText || 'Filters only'}</span>
                      <span className="ml-auto text-xs text-muted tabular-nums">{h.resultCount}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>

        <section aria-label="Search results" className="space-y-3">
          {!hasCriteria && (
            <div className="bg-surface rounded-xl shadow-sm p-10 text-center text-muted">
              {tn('startHint')}
            </div>
          )}

          {hasCriteria && error && (
            <div className="bg-error-subtle rounded-xl p-6 text-center" role="alert">
              <AlertTriangle className="h-8 w-8 text-error mx-auto mb-2" />
              <p className="text-error">{errorMessage ?? 'Search failed. Please try again.'}</p>
            </div>
          )}

          {hasCriteria && isLoading && (
            <div className="flex justify-center p-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted" aria-label="Loading results" />
            </div>
          )}

          {hasCriteria && data && !error && (
            <>
              <div className="flex items-center justify-between text-sm text-muted">
                <span>
                  {data.total.toLocaleString()} result{data.total === 1 ? '' : 's'}
                  {isFetching && <Loader2 className="inline h-3.5 w-3.5 ml-2 animate-spin" />}
                </span>
                <span>{data.tookMs} ms</span>
              </div>
              {data.query.warnings.map((w) => (
                <p key={w} className="text-xs text-warning">
                  {w}
                </p>
              ))}

              {data.results.length === 0 ? (
                <div className="bg-surface rounded-xl shadow-sm p-10 text-center">
                  <SearchX className="h-8 w-8 text-muted mx-auto mb-2" />
                  <p className="text-foreground font-medium">No matches</p>
                  <p className="text-sm text-muted mt-1">Try fewer words, different spelling or removing filters.</p>
                </div>
              ) : (
                <ul className="space-y-3">
                  {data.results.map((r) => (
                    <li key={`${r.entityType}-${r.id}`} className="bg-surface rounded-xl shadow-sm p-4 hover:shadow-md transition-shadow">
                      <div className="flex items-center gap-2 text-xs">
                        <span className={`px-2 py-0.5 rounded-full font-medium ${ENTITY_BADGE[r.entityType]}`}>
                          {ENTITY_SINGULAR[r.entityType]}
                        </span>
                        <span className="font-mono text-muted">{r.number}</span>
                        {r.status && <span className="text-secondary">{humanize(r.status)}</span>}
                        {r.priority && <span className="text-secondary">{humanize(r.priority)} priority</span>}
                        <span className="ml-auto text-muted">Updated {formatDate(r.updatedAt)}</span>
                      </div>
                      <Link href={r.url} className="block mt-1.5 font-medium text-foreground hover:text-primary">
                        {r.title}
                      </Link>
                      {r.snippet && <HighlightedText text={r.snippet} className="block mt-1 text-sm text-secondary line-clamp-2" />}
                    </li>
                  ))}
                </ul>
              )}

              {data.totalPages > 1 && (
                <div className="flex items-center justify-between pt-2">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                    Previous
                  </Button>
                  <span className="text-sm text-muted">
                    Page {data.page} of {data.totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= data.totalPages || page * PER_PAGE >= 1000}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center p-10">
          <Loader2 className="h-6 w-6 animate-spin text-muted" />
        </div>
      }
    >
      <SearchPageContent />
    </Suspense>
  );
}
