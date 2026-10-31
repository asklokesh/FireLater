'use client';

import { useState } from 'react';
import Link from 'next/link';
import { SearchBar } from '@/components/search/SearchBar';
import { FacetSidebar, facetsToFilter, SelectedFacets } from '@/components/search/FacetSidebar';
import { useSearch, useSearchFacets } from '@/hooks/useApi';
import type { SearchEntityType } from '@/lib/api';

export default function SearchPage() {
  const [q, setQ] = useState('');
  const [entityType, setEntityType] = useState<SearchEntityType>('issue');
  const [selected, setSelected] = useState<SelectedFacets>({});
  const [page, setPage] = useState(1);

  const filter = facetsToFilter(selected);
  const { data, isLoading } = useSearch({ q: q || undefined, entityType, filter, page, perPage: 20 });
  const { data: facetData } = useSearchFacets({ q: q || undefined, entityType });
  const basePath = entityType === 'issue' ? '/issues' : '/problems';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Search</h1>
        <Link href="/search/analytics" className="text-sm text-blue-600 hover:underline">
          Search analytics
        </Link>
      </div>
      <div className="flex gap-2">
        <select
          aria-label="Entity type"
          className="rounded-md border border-gray-300 px-2 text-sm"
          value={entityType}
          onChange={(e) => {
            setEntityType(e.target.value as SearchEntityType);
            setSelected({});
            setPage(1);
          }}
        >
          <option value="issue">Issues</option>
          <option value="problem">Problems</option>
        </select>
        <SearchBar
          initialValue={q}
          onSearch={(next) => {
            setQ(next);
            setPage(1);
          }}
        />
      </div>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
        <FacetSidebar
          facets={facetData?.facets}
          selected={selected}
          onChange={(next) => {
            setSelected(next);
            setPage(1);
          }}
        />
        <div className="md:col-span-3">
          {isLoading ? (
            <p className="text-sm text-gray-500">Searching...</p>
          ) : (
            <>
              <p className="mb-2 text-sm text-gray-500">
                {data?.total ?? 0} results{data ? ` in ${data.durationMs} ms` : ''}
              </p>
              <ul className="divide-y divide-gray-200 rounded-md border border-gray-200 bg-white">
                {(data?.items ?? []).map((item) => (
                  <li key={item.id} className="p-3">
                    <Link href={`${basePath}/${item.id}`} className="font-medium text-blue-700 hover:underline">
                      {item.number}: {item.title}
                    </Link>
                    <div className="text-xs text-gray-500">
                      {item.status} | {item.priority}
                    </div>
                    {item.headline && <p className="mt-1 text-sm text-gray-600">{item.headline.replace(/<\/?b>/g, '')}</p>}
                  </li>
                ))}
              </ul>
              {data && data.total > page * data.perPage && (
                <button className="mt-3 text-sm text-blue-600" onClick={() => setPage(page + 1)}>
                  Next page
                </button>
              )}
              {page > 1 && (
                <button className="ml-4 mt-3 text-sm text-blue-600" onClick={() => setPage(page - 1)}>
                  Previous page
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
