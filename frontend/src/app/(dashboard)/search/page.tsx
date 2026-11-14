'use client';

import { useCallback, useEffect, useState } from 'react';
import { searchApi } from '@/lib/api';
import type { SearchFilter, SearchResponse } from '@/lib/api';
import { SearchBar } from '@/components/search/SearchBar';
import { FacetPanel, FACET_FIELDS } from '@/components/search/FacetPanel';
import { FilterBuilder } from '@/components/search/FilterBuilder';
import { SavedFilters } from '@/components/search/SavedFilters';
import { EmptyState } from '@/components/ui/empty-state';
import { PageLoading } from '@/components/ui/loading';

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [builderFilter, setBuilderFilter] = useState<SearchFilter | undefined>();
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Facet selections combine with AND, and AND with the builder filter.
  const buildFilter = useCallback((): SearchFilter | undefined => {
    const facetConds = Object.entries(selected).map(([field, values]) => ({
      field,
      operator: 'in' as const,
      value: values,
    }));
    if (facetConds.length === 0) return builderFilter;
    if (!builderFilter) return { op: 'and', conditions: facetConds };
    return { op: 'and', conditions: [builderFilter, ...facetConds] };
  }, [selected, builderFilter]);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await searchApi.search({
        q: query || undefined,
        filter: buildFilter(),
        facets: FACET_FIELDS,
      });
      setResult(res);
    } catch {
      setError('Search failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [query, buildFilter]);

  useEffect(() => {
    run();
  }, [run]);

  return (
    <div className="space-y-4 p-6">
      <h1 className="text-xl font-semibold">Search</h1>
      <SearchBar value={query} onSubmit={setQuery} />
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="space-y-6">
          <FacetPanel facets={result?.facets} selected={selected} onChange={setSelected} />
          <FilterBuilder value={builderFilter} onChange={setBuilderFilter} />
          <SavedFilters
            query={query}
            filter={buildFilter()}
            onLoad={(t) => {
              setQuery(t.query);
              setSelected({});
              setBuilderFilter(t.filter);
            }}
          />
        </div>
        <div className="lg:col-span-3">
          {loading ? (
            <PageLoading text="Searching..." />
          ) : error ? (
            <div role="alert" className="text-sm text-red-600">{error}</div>
          ) : !result || result.data.length === 0 ? (
            <EmptyState title="No results found" description="Try adjusting your search or filters." />
          ) : (
            <ul className="divide-y divide-border">
              {result.data.map((r) => (
                <li key={r.id} className="py-3">
                  <div className="font-medium">
                    <span>{r.issue_number}</span> <span>{r.title}</span>
                  </div>
                  <div className="text-sm text-secondary">
                    Status: {r.status} | Priority: {r.priority}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
