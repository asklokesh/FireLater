'use client';

import type { SearchFacets } from '@/lib/api';

export type SelectedFacets = Partial<Record<keyof SearchFacets, string[]>>;

interface FacetSidebarProps {
  facets?: SearchFacets;
  selected: SelectedFacets;
  onChange: (next: SelectedFacets) => void;
}

const LABELS: Record<keyof SearchFacets, string> = {
  status: 'Status',
  priority: 'Priority',
  urgency: 'Urgency',
  impact: 'Impact',
};

/** Faceted filter sidebar: values within a facet are OR-ed, facets are AND-ed. */
export function FacetSidebar({ facets, selected, onChange }: FacetSidebarProps) {
  if (!facets) return null;
  const toggle = (facet: keyof SearchFacets, value: string) => {
    const current = selected[facet] ?? [];
    const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
    onChange({ ...selected, [facet]: next });
  };

  return (
    <aside className="space-y-4" aria-label="Search facets">
      {(Object.keys(LABELS) as Array<keyof SearchFacets>).map((facet) =>
        facets[facet]?.length ? (
          <fieldset key={facet}>
            <legend className="mb-1 text-sm font-semibold text-gray-700">{LABELS[facet]}</legend>
            {facets[facet].map((f) => (
              <label key={f.value} className="flex items-center gap-2 text-sm text-gray-600">
                <input
                  type="checkbox"
                  checked={(selected[facet] ?? []).includes(f.value)}
                  onChange={() => toggle(facet, f.value)}
                />
                <span className="flex-1">{f.value}</span>
                <span className="text-xs text-gray-400">{f.count}</span>
              </label>
            ))}
          </fieldset>
        ) : null
      )}
    </aside>
  );
}

/** Convert selected facets into an AND-of-ORs filter tree for the search API. */
export function facetsToFilter(selected: SelectedFacets) {
  const conditions = (Object.entries(selected) as Array<[string, string[] | undefined]>)
    .filter(([, values]) => values && values.length > 0)
    .map(([field, values]) => ({ field, operator: 'in' as const, value: values as string[] }));
  return conditions.length ? { logicalOperator: 'AND' as const, conditions } : undefined;
}
