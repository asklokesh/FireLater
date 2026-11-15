'use client';

import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { SearchFilterGroup, SearchCondition } from '@/lib/api';

export const FILTER_FIELDS = [
  'status',
  'priority',
  'severity',
  'urgency',
  'impact',
  'application_id',
  'assigned_to',
  'assigned_group',
  'reporter_id',
  'created_at',
  'updated_at',
  'resolved_at',
  'title',
  'description',
];

export const FILTER_OPERATORS = ['eq', 'neq', 'in', 'nin', 'gt', 'gte', 'lt', 'lte', 'contains'];

type Node = SearchFilterGroup | SearchCondition;

function isGroup(n: Node): n is SearchFilterGroup {
  return (n as SearchFilterGroup).conditions !== undefined;
}

function emptyCondition(): SearchCondition {
  return { field: FILTER_FIELDS[0], operator: 'eq', value: '' };
}

function parseValue(operator: string, raw: string): unknown {
  if (operator === 'in' || operator === 'nin') {
    return raw.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return raw;
}

function displayValue(value: unknown): string {
  return Array.isArray(value) ? value.join(',') : String(value ?? '');
}

interface GroupEditorProps {
  group: SearchFilterGroup;
  onChange: (g: SearchFilterGroup) => void;
  onRemove?: () => void;
}

function GroupEditor({ group, onChange, onRemove }: GroupEditorProps) {
  const update = (i: number, n: Node) =>
    onChange({ ...group, conditions: group.conditions.map((c, j) => (j === i ? n : c)) });
  const remove = (i: number) =>
    onChange({ ...group, conditions: group.conditions.filter((_, j) => j !== i) });

  return (
    <div className="border border-border rounded-lg p-3 space-y-2" data-testid="filter-group">
      <div className="flex items-center gap-2">
        <select
          aria-label="Group operator"
          value={group.op}
          onChange={(e) => onChange({ ...group, op: e.target.value as 'and' | 'or' })}
          className="border border-border rounded px-2 py-1 text-sm"
        >
          <option value="and">AND</option>
          <option value="or">OR</option>
        </select>
        {onRemove && (
          <button type="button" aria-label="Remove group" onClick={onRemove}>
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
      {group.conditions.map((c, i) =>
        isGroup(c) ? (
          <GroupEditor key={i} group={c} onChange={(g) => update(i, g)} onRemove={() => remove(i)} />
        ) : (
          <div key={i} className="flex items-center gap-2" data-testid="filter-condition">
            <select
              aria-label="Field"
              value={c.field}
              onChange={(e) => update(i, { ...c, field: e.target.value })}
              className="border border-border rounded px-2 py-1 text-sm"
            >
              {FILTER_FIELDS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
            <select
              aria-label="Operator"
              value={c.operator}
              onChange={(e) =>
                update(i, { ...c, operator: e.target.value, value: parseValue(e.target.value, displayValue(c.value)) })
              }
              className="border border-border rounded px-2 py-1 text-sm"
            >
              {FILTER_OPERATORS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
            <input
              aria-label="Value"
              value={displayValue(c.value)}
              onChange={(e) => update(i, { ...c, value: parseValue(c.operator, e.target.value) })}
              className="border border-border rounded px-2 py-1 text-sm"
            />
            <button type="button" aria-label="Remove condition" onClick={() => remove(i)}>
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        )
      )}
      <div className="flex gap-2">
        <button
          type="button"
          className="flex items-center gap-1 text-sm"
          onClick={() => onChange({ ...group, conditions: [...group.conditions, emptyCondition()] })}
        >
          <Plus className="h-4 w-4" /> Add condition
        </button>
        <button
          type="button"
          className="flex items-center gap-1 text-sm"
          onClick={() =>
            onChange({ ...group, conditions: [...group.conditions, { op: 'and', conditions: [emptyCondition()] }] })
          }
        >
          <Plus className="h-4 w-4" /> Add group
        </button>
      </div>
    </div>
  );
}

interface FilterBuilderProps {
  value?: SearchFilterGroup;
  onApply: (filter: SearchFilterGroup | undefined) => void;
}

export function FilterBuilder({ value, onApply }: FilterBuilderProps) {
  const [group, setGroup] = useState<SearchFilterGroup>(value ?? { op: 'and', conditions: [] });
  return (
    <div className="space-y-2">
      <GroupEditor group={group} onChange={setGroup} />
      <button
        type="button"
        className="px-3 py-1.5 rounded bg-primary text-white text-sm"
        onClick={() => onApply(group.conditions.length ? group : undefined)}
      >
        Apply filters
      </button>
    </div>
  );
}
