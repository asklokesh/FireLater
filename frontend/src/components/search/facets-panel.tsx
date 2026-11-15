'use client';

import type { SearchFacetField, SearchFacetValue, SearchFilterGroup, SearchCondition } from '@/lib/api';

export const FACET_TITLES: Record<SearchFacetField, string> = {
  status: 'Status',
  priority: 'Priority',
  severity: 'Severity',
  application_id: 'Application',
  assigned_to: 'Assignee',
};

function isCondition(c: SearchFilterGroup | SearchCondition): c is SearchCondition {
  return (c as SearchCondition).field !== undefined;
}

export function getSelectedValues(filter: SearchFilterGroup | undefined, field: string): string[] {
  if (!filter) return [];
  const c = filter.conditions.find((x) => isCondition(x) && x.field === field && x.operator === 'in');
  return c && isCondition(c) && Array.isArray(c.value) ? (c.value as string[]) : [];
}

/** Toggle a facet value; facet conditions live at the top level and combine with AND. */
export function toggleFacetValue(
  filter: SearchFilterGroup | undefined,
  field: string,
  value: string
): SearchFilterGroup | undefined {
  const base: SearchFilterGroup = filter
    ? filter.op === 'and'
      ? filter
      : { op: 'and', conditions: [filter] }
    : { op: 'and', conditions: [] };
  const selected = getSelectedValues(base, field);
  const next = selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value];
  const others = base.conditions.filter(
    (x) => !(isCondition(x) && x.field === field && x.operator === 'in')
  );
  const conditions = next.length ? [...others, { field, operator: 'in', value: next }] : others;
  return conditions.length ? { op: 'and', conditions } : undefined;
}

interface FacetsPanelProps {
  facets: Partial<Record<SearchFacetField, SearchFacetValue[]>>;
  filter?: SearchFilterGroup;
  onChange: (filter: SearchFilterGroup | undefined) => void;
}

export function FacetsPanel({ facets, filter, onChange }: FacetsPanelProps) {
  return (
    <div className="space-y-4" data-testid="facets-panel">
      {(Object.keys(FACET_TITLES) as SearchFacetField[]).map((field) => {
        const values = facets[field] ?? [];
        if (values.length === 0) return null;
        const selected = getSelectedValues(filter, field);
        return (
          <div key={field}>
            <h3 className="text-sm font-medium mb-2">{FACET_TITLES[field]}</h3>
            <ul className="space-y-1">
              {values.map((v) => {
                const isSel = selected.includes(v.value);
                return (
                  <li key={v.value}>
                    <button
                      type="button"
                      aria-pressed={isSel}
                      onClick={() => onChange(toggleFacetValue(filter, field, v.value))}
                      className={`w-full flex justify-between px-2 py-1 rounded text-sm ${
                        isSel ? 'bg-primary text-white font-medium' : 'hover:bg-sidebar-hover'
                      }`}
                    >
                      <span>{v.label}</span>
                      <span>{v.count}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
