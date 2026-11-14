'use client';

export const FACET_FIELDS = ['status', 'priority', 'severity', 'assigned_group', 'application_id'];

const LABELS: Record<string, string> = {
  status: 'Status',
  priority: 'Priority',
  severity: 'Severity',
  assigned_group: 'Assigned group',
  application_id: 'Application',
};

interface FacetPanelProps {
  facets?: Record<string, Array<{ value: string; count: number }>>;
  selected: Record<string, string[]>;
  onChange: (selected: Record<string, string[]>) => void;
}

export function FacetPanel({ facets, selected, onChange }: FacetPanelProps) {
  const toggle = (field: string, value: string) => {
    const cur = selected[field] ?? [];
    const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value];
    const out = { ...selected };
    if (next.length) out[field] = next;
    else delete out[field];
    onChange(out);
  };
  const hasSelection = Object.keys(selected).length > 0;

  return (
    <aside aria-label="Facets" className="space-y-4">
      {hasSelection && (
        <button type="button" className="text-sm text-primary" onClick={() => onChange({})}>
          Clear facets
        </button>
      )}
      {FACET_FIELDS.map((field) => {
        const groups = facets?.[field];
        if (!groups || groups.length === 0) return null;
        return (
          <fieldset key={field}>
            <legend className="text-sm font-medium mb-1">{LABELS[field]}</legend>
            {groups.map((f) => (
              <label key={f.value} className="flex items-center gap-2 text-sm py-0.5">
                <input
                  type="checkbox"
                  checked={(selected[field] ?? []).includes(f.value)}
                  onChange={() => toggle(field, f.value)}
                />
                <span>{f.value}</span>
                <span className="ml-auto text-muted">{f.count}</span>
              </label>
            ))}
          </fieldset>
        );
      })}
    </aside>
  );
}
