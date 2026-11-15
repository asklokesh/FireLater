'use client';

export const FACET_DIMENSIONS = [
  { key: 'status', label: 'Status' },
  { key: 'priority', label: 'Priority' },
  { key: 'severity', label: 'Severity' },
  { key: 'assigned_group', label: 'Assigned group' },
  { key: 'application_id', label: 'Application' },
] as const;

export type FacetKey = (typeof FACET_DIMENSIONS)[number]['key'];
export type FacetValue = { value: string | null; count: number };
export type Facets = Partial<Record<FacetKey, FacetValue[]>>;
export type FacetSelection = Partial<Record<FacetKey, string[]>>;

interface Props {
  facets: Facets;
  selected: FacetSelection;
  labels?: Partial<Record<FacetKey, Record<string, string>>>;
  onToggle: (key: FacetKey, value: string) => void;
  onClear: (key: FacetKey, value: string) => void;
}

export function FacetSidebar({ facets, selected, labels, onToggle, onClear }: Props) {
  return (
    <aside aria-label="Search facets" className="w-60 shrink-0 space-y-4">
      {FACET_DIMENSIONS.map(({ key, label }) => {
        const values = (facets[key] ?? []).filter((f) => f.value !== null);
        const sel = selected[key] ?? [];
        return (
          <section key={key} data-testid={`facet-${key}`}>
            <h3 className="text-sm font-semibold mb-1">{label}</h3>
            {sel.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-1">
                {sel.map((v) => (
                  <button
                    key={v}
                    type="button"
                    aria-label={`Clear ${label}: ${labels?.[key]?.[v] ?? v}`}
                    onClick={() => onClear(key, v)}
                    className="text-xs px-2 py-0.5 rounded bg-primary/10 text-primary"
                  >
                    {labels?.[key]?.[v] ?? v} ×
                  </button>
                ))}
              </div>
            )}
            <ul className="space-y-1">
              {values.map((f) => {
                const v = f.value as string;
                const id = `facet-${key}-${v}`;
                return (
                  <li key={v} className="flex items-center gap-2 text-sm">
                    <input
                      id={id}
                      type="checkbox"
                      checked={sel.includes(v)}
                      onChange={() => onToggle(key, v)}
                    />
                    <label htmlFor={id} className="flex-1">
                      {labels?.[key]?.[v] ?? v}
                    </label>
                    <span className="text-muted">{f.count}</span>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </aside>
  );
}
