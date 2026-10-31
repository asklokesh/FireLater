'use client';

import type { FacetBucket } from '@/lib/search-api';

interface FacetPanelProps {
  facets: Record<string, FacetBucket[]>;
  selected: Record<string, string[]>;
  onToggle: (facet: string, value: string) => void;
}

// Faceted filters: each dimension lists values with result counts; selections combine across facets.
export function FacetPanel({ facets, selected, onToggle }: FacetPanelProps) {
  return (
    <aside className="space-y-4">
      {Object.entries(facets).map(([facet, buckets]) => (
        <div key={facet}>
          <h3 className="mb-1 text-sm font-semibold capitalize">{facet}</h3>
          <ul className="space-y-1">
            {buckets.filter((b) => b.value !== null).map((b) => {
              const value = b.value as string;
              const checked = selected[facet]?.includes(value) ?? false;
              return (
                <li key={value}>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={checked} onChange={() => onToggle(facet, value)} />
                    <span className="flex-1">{value}</span>
                    <span className="text-gray-500">{b.count}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </aside>
  );
}
