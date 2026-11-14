'use client';

import { useState } from 'react';
import type { SearchFilter, SearchCondition } from '@/lib/api';

const FIELDS = ['status', 'priority', 'severity', 'assigned_group', 'application_id', 'title'];
const OPERATORS: SearchCondition['operator'][] = ['eq', 'neq', 'in', 'gte', 'lte', 'contains'];

interface FilterBuilderProps {
  value?: SearchFilter;
  onChange: (filter: SearchFilter | undefined) => void;
}

export function FilterBuilder({ value, onChange }: FilterBuilderProps) {
  const [field, setField] = useState(FIELDS[0]);
  const [operator, setOperator] = useState<SearchCondition['operator']>('eq');
  const [text, setText] = useState('');

  const filter: SearchFilter = value ?? { op: 'and', conditions: [] };
  const conditions = filter.conditions;

  const emit = (next: SearchFilter) =>
    onChange(next.conditions.length ? next : undefined);

  const add = () => {
    const v = text.trim();
    if (!v) return;
    const cond: SearchCondition = {
      field,
      operator,
      value: operator === 'in' ? v.split(',').map((s) => s.trim()).filter(Boolean) : v,
    };
    emit({ ...filter, conditions: [...conditions, cond] });
    setText('');
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <label htmlFor="fb-group-op" className="text-sm">Match</label>
        <select
          id="fb-group-op"
          aria-label="Group operator"
          value={filter.op}
          onChange={(e) => emit({ ...filter, op: e.target.value as 'and' | 'or' })}
          className="border border-border rounded px-2 py-1 text-sm bg-surface"
        >
          <option value="and">AND</option>
          <option value="or">OR</option>
        </select>
      </div>
      <ul className="space-y-1">
        {conditions.map((c, i) => (
          <li key={i} className="flex items-center gap-2 text-sm">
            {'conditions' in c ? (
              <span>(nested group)</span>
            ) : (
              <span>
                {c.field} {c.operator} {Array.isArray(c.value) ? c.value.join(', ') : String(c.value)}
              </span>
            )}
            <button
              type="button"
              aria-label={`Remove condition ${i + 1}`}
              className="text-muted"
              onClick={() => emit({ ...filter, conditions: conditions.filter((_, j) => j !== i) })}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <select aria-label="Field" value={field} onChange={(e) => setField(e.target.value)}
          className="border border-border rounded px-2 py-1 text-sm bg-surface">
          {FIELDS.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
        <select aria-label="Operator" value={operator}
          onChange={(e) => setOperator(e.target.value as SearchCondition['operator'])}
          className="border border-border rounded px-2 py-1 text-sm bg-surface">
          {OPERATORS.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <input aria-label="Value" value={text} onChange={(e) => setText(e.target.value)}
          className="border border-border rounded px-2 py-1 text-sm bg-surface" />
        <button type="button" onClick={add}
          className="px-3 py-1 text-sm rounded bg-primary text-primary-fg">
          Add condition
        </button>
      </div>
    </div>
  );
}
