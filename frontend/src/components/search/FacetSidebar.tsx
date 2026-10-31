'use client';

import type { FacetCount } from '@/hooks/useSearch';

interface FacetSidebarProps {
  facets: Record<string, FacetCount[]> | undefined;
  selected: Record<string, string[]>;
  onToggle: (dimension: string, value: string) => void;
}

/** Faceted filter sidebar: select values across status, priority and category at once. */
export function FacetSidebar({ facets, selected, onToggle }: FacetSidebarProps) {
  if (!facets) return null;
  return (
    <aside className="space-y-4" aria-label="Search facets">
      {Object.entries(facets).map(([dimension, values]) => (
        <fieldset key={dimension}>
          <legend className="mb-1 text-xs font-semibold uppercase text-gray-500">{dimension}</legend>
          {values.filter((v) => v.value !== null).map((v) => (
            <label key={v.value as string} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={(selected[dimension] ?? []).includes(v.value as string)}
                onChange={() => onToggle(dimension, v.value as string)}
              />
              <span className="flex-1 truncate">{v.value}</span>
              <span className="text-gray-400">{v.count}</span>
            </label>
          ))}
        </fieldset>
      ))}
    </aside>
  );
}
