'use client';

import { useState } from 'react';

export const FILTER_FIELD_OPTIONS = [
  'status', 'priority', 'severity', 'assigned_to', 'assigned_group', 'application_id',
  'reporter_id', 'sla_breached', 'created_at', 'updated_at',
] as const;
export const FILTER_OPERATOR_OPTIONS = ['eq', 'neq', 'in', 'gte', 'lte'] as const;

export interface FilterCondition { field: string; op: string; value: unknown }
export interface FilterGroup { op: 'and' | 'or'; conditions: Array<FilterCondition | FilterGroup> }

interface Row { field: string; op: string; value: string }

function coerce(field: string, op: string, raw: string): unknown {
  if (op === 'in') return raw.split(',').map((s) => s.trim()).filter(Boolean);
  if (field === 'sla_breached') return raw.trim() === 'true';
  return raw;
}

/** Serialize builder rows to the filters JSON accepted by GET /v1/search. */
export function serializeFilters(groupOp: 'and' | 'or', rows: Row[]): FilterGroup | null {
  const conditions = rows
    .filter((r) => r.value.trim() !== '')
    .map((r) => ({ field: r.field, op: r.op, value: coerce(r.field, r.op, r.value) }));
  return conditions.length ? { op: groupOp, conditions } : null;
}

interface Props {
  onApply: (filters: FilterGroup | null) => void;
  error?: string | null;
}

export function FilterBuilder({ onApply, error }: Props) {
  const [groupOp, setGroupOp] = useState<'and' | 'or'>('and');
  const [rows, setRows] = useState<Row[]>([]);

  const update = (i: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  return (
    <div className="border border-border rounded-lg p-3 space-y-2" data-testid="filter-builder">
      <div className="flex items-center gap-2 text-sm">
        <span className="font-semibold">Match</span>
        <select aria-label="Group operator" value={groupOp} onChange={(e) => setGroupOp(e.target.value as 'and' | 'or')}>
          <option value="and">AND</option>
          <option value="or">OR</option>
        </select>
        <button type="button" onClick={() => setRows((rs) => [...rs, { field: 'status', op: 'eq', value: '' }])}>
          Add condition
        </button>
      </div>
      {rows.map((r, i) => (
        <div key={i} className="flex items-center gap-2 text-sm">
          <select aria-label={`Field ${i + 1}`} value={r.field} onChange={(e) => update(i, { field: e.target.value })}>
            {FILTER_FIELD_OPTIONS.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
          <select aria-label={`Operator ${i + 1}`} value={r.op} onChange={(e) => update(i, { op: e.target.value })}>
            {FILTER_OPERATOR_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
          <input aria-label={`Value ${i + 1}`} value={r.value} onChange={(e) => update(i, { value: e.target.value })} />
          <button type="button" aria-label={`Remove condition ${i + 1}`} onClick={() => setRows((rs) => rs.filter((_, idx) => idx !== i))}>
            ×
          </button>
        </div>
      ))}
      <div className="flex gap-2 text-sm">
        <button type="button" onClick={() => onApply(serializeFilters(groupOp, rows))}>Apply filters</button>
        <button type="button" onClick={() => { setRows([]); onApply(null); }}>Reset</button>
      </div>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
