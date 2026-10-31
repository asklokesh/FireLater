'use client';

import { useState } from 'react';
import { SearchBar } from '@/components/search/SearchBar';
import { FacetPanel } from '@/components/search/FacetPanel';
import { useSearch, useSearchFacets } from '@/hooks/useApi';
import type { SearchEntity, SearchParams } from '@/lib/search-api';

const ENTITIES: SearchEntity[] = ['issues', 'problems', 'changes', 'requests'];

export default function SearchPage() {
  const [entity, setEntity] = useState<SearchEntity>('issues');
  const [text, setText] = useState('');
  const [selected, setSelected] = useState<Record<string, string[]>>({});

  const params: SearchParams = { entity, q: text || undefined, limit: 25 };
  for (const [facet, values] of Object.entries(selected)) {
    if (values.length && (facet === 'status' || facet === 'priority' || facet === 'category')) {
      params[facet] = values.join(',');
    }
  }

  const results = useSearch(params);
  const facets = useSearchFacets(params);

  const toggle = (facet: string, value: string) => {
    setSelected((prev) => {
      const current = prev[facet] ?? [];
      const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
      return { ...prev, [facet]: next };
    });
  };

  return (
    <div className="space-y-4 p-6">
      <h1 className="text-2xl font-bold">Search</h1>
      <div className="flex gap-2">
        <select
          aria-label="Entity"
          value={entity}
          onChange={(e) => {
            setEntity(e.target.value as SearchEntity);
            setSelected({});
          }}
          className="rounded-md border px-2"
        >
          {ENTITIES.map((e) => (
            <option key={e} value={e}>{e}</option>
          ))}
        </select>
        <SearchBar value={text} onSearch={setText} />
      </div>
      <div className="grid grid-cols-4 gap-6">
        <FacetPanel facets={facets.data?.facets ?? {}} selected={selected} onToggle={toggle} />
        <div className="col-span-3 space-y-3">
          {results.isLoading && <p>Loading...</p>}
          {results.data && <p className="text-sm text-gray-500">{results.data.total} results</p>}
          {results.data?.data.map((hit) => (
            <div key={hit.id} className="rounded-md border p-3">
              <div className="flex justify-between">
                <span className="font-medium">{hit.number}: {hit.title}</span>
                <span className="text-sm text-gray-500">{hit.status}</span>
              </div>
              {hit.snippet && <p className="mt-1 text-sm text-gray-600">{hit.snippet.replace(/<\/?b>/g, '')}</p>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
