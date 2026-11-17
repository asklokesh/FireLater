import type { SearchFacetBucket } from '@/lib/api';

interface FacetGroupProps {
  title: string;
  buckets: SearchFacetBucket[];
  selected: string[];
  onToggle: (value: string) => void;
  labelFor?: (value: string) => string;
}

/** Checkbox list of facet values with match counts. Selected values always stay visible. */
export function FacetGroup({ title, buckets, selected, onToggle, labelFor }: FacetGroupProps) {
  const counts = new Map(buckets.map((b) => [b.value, b.count]));
  const values = [...buckets.map((b) => b.value), ...selected.filter((s) => !counts.has(s))];
  if (values.length === 0) return null;

  return (
    <fieldset className="space-y-1.5">
      <legend className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">{title}</legend>
      {values.map((value) => (
        <label key={value} className="flex items-center justify-between gap-2 text-sm cursor-pointer text-secondary hover:text-foreground">
          <span className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={selected.includes(value)}
              onChange={() => onToggle(value)}
              className="rounded border-border-strong text-primary focus:ring-primary/20"
            />
            {labelFor ? labelFor(value) : value}
          </span>
          <span className="text-xs tabular-nums text-muted">{counts.get(value) ?? 0}</span>
        </label>
      ))}
    </fieldset>
  );
}
