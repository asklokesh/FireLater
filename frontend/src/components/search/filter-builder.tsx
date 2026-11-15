'use client';

import { Plus, X } from 'lucide-react';
import type { SearchFilterCondition, SearchFilterGroup } from '@/lib/api';

export const FILTER_FIELDS = ['status', 'priority', 'severity', 'assigned_group', 'title'];
export const FILTER_OPS = ['eq', 'neq', 'contains', 'gt', 'gte', 'lt', 'lte'];

const isGroup = (n: SearchFilterCondition | SearchFilterGroup): n is SearchFilterGroup =>
  'conditions' in n;

interface FilterBuilderProps {
  value: SearchFilterGroup;
  onChange: (group: SearchFilterGroup) => void;
  depth?: number;
  onRemove?: () => void;
}

export function FilterBuilder({ value, onChange, depth = 1, onRemove }: FilterBuilderProps) {
  const logic = value.logic ?? 'AND';
  const setNode = (i: number, node: SearchFilterCondition | SearchFilterGroup) =>
    onChange({ ...value, conditions: value.conditions.map((c, idx) => (idx === i ? node : c)) });
  const removeNode = (i: number) =>
    onChange({ ...value, conditions: value.conditions.filter((_, idx) => idx !== i) });

  return (
    <div className="space-y-2 rounded-lg border border-border p-3" data-testid={`filter-group-${depth}`}>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label="Toggle AND/OR"
          className="px-2 py-1 text-xs font-semibold rounded border border-border-strong"
          onClick={() => onChange({ ...value, logic: logic === 'AND' ? 'OR' : 'AND' })}
        >
          {logic}
        </button>
        {onRemove && (
          <button type="button" aria-label="Remove group" onClick={onRemove} className="ml-auto text-muted">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      {value.conditions.map((node, i) =>
        isGroup(node) ? (
          <FilterBuilder
            key={i}
            value={node}
            depth={depth + 1}
            onChange={(g) => setNode(i, g)}
            onRemove={() => removeNode(i)}
          />
        ) : (
          <div key={i} className="flex items-center gap-2">
            <select
              aria-label="Field"
              value={node.field}
              className="rounded border border-border-strong bg-surface text-sm px-2 py-1"
              onChange={(e) => setNode(i, { ...node, field: e.target.value })}
            >
              {[...new Set([...FILTER_FIELDS, node.field])].map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
            <select
              aria-label="Operator"
              value={node.op}
              className="rounded border border-border-strong bg-surface text-sm px-2 py-1"
              onChange={(e) => setNode(i, { ...node, op: e.target.value })}
            >
              {[...new Set([...FILTER_OPS, node.op])].map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
            <input
              aria-label="Value"
              value={String(node.value ?? '')}
              className="flex-1 rounded border border-border-strong bg-surface text-sm px-2 py-1"
              onChange={(e) => setNode(i, { ...node, value: e.target.value })}
            />
            <button type="button" aria-label="Remove condition" onClick={() => removeNode(i)} className="text-muted">
              <X className="h-4 w-4" />
            </button>
          </div>
        )
      )}
      <div className="flex gap-2">
        <button
          type="button"
          className="inline-flex items-center gap-1 text-xs text-primary"
          onClick={() =>
            onChange({ ...value, conditions: [...value.conditions, { field: 'status', op: 'eq', value: '' }] })
          }
        >
          <Plus className="h-3 w-3" /> Add condition
        </button>
        {depth < 3 && (
          <button
            type="button"
            className="inline-flex items-center gap-1 text-xs text-primary"
            onClick={() =>
              onChange({
                ...value,
                conditions: [...value.conditions, { logic: 'OR', conditions: [{ field: 'status', op: 'eq', value: '' }] }],
              })
            }
          >
            <Plus className="h-3 w-3" /> Add group
          </button>
        )}
      </div>
    </div>
  );
}
