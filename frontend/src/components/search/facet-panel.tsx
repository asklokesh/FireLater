'use client';

import type { SearchFilterGroup, SearchFilterCondition } from '@/lib/api';

export type Facets = Record<string, Array<{ value: string | null; count: number }>>;

/** True when the group has a top-level eq condition for field/value. */
export function hasFacetFilter(filters: SearchFilterGroup, field: string, value: string): boolean {
  return filters.conditions.some(
    (c) => !('conditions' in c) && c.field === field && c.op === 'eq' && c.value === value
  );
}

/** Adds the condition, or removes it if it is already present. */
export function toggleFacetFilter(filters: SearchFilterGroup, field: string, value: string): SearchFilterGroup {
  if (hasFacetFilter(filters, field, value)) {
    return {
      ...filters,
      conditions: filters.conditions.filter(
        (c) => 'conditions' in c || !(c.field === field && c.op === 'eq' && c.value === value)
      ),
    };
  }
  const cond: SearchFilterCondition = { field, op: 'eq', value };
  return { ...filters, conditions: [...filters.conditions, cond] };
}

interface FacetPanelProps {
  facets: Facets;
  filters: SearchFilterGroup;
  onChange: (filters: SearchFilterGroup) => void;
}

export function FacetPanel({ facets, filters, onChange }: FacetPanelProps) {
  return (
    <div className="space-y-4" aria-label="Facets">
      {Object.entries(facets).map(([field, values]) => (
        <div key={field}>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted mb-1">
            {field.replace(/_/g, ' ')}
          </h3>
          <ul className="space-y-0.5">
            {values
              .filter((v) => v.value !== null)
              .map((v) => {
                const selected = hasFacetFilter(filters, field, v.value as string);
                return (
                  <li key={v.value}>
                    <button
                      type="button"
                      aria-pressed={selected}
                      className={`flex w-full justify-between rounded px-2 py-1 text-sm ${
                        selected ? 'bg-sidebar-active font-medium' : 'hover:bg-surface-hover'
                      }`}
                      onClick={() => onChange(toggleFacetFilter(filters, field, v.value as string))}
                    >
                      <span>{v.value}</span>
                      <span className="text-muted">{v.count}</span>
                    </button>
                  </li>
                );
              })}
          </ul>
        </div>
      ))}
    </div>
  );
}
