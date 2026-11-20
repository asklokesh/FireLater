'use client';

import { useT } from '@/i18n/useT';
import { useMemo } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { SearchFieldsResponse, SearchFilterOperator } from '@/lib/api';
import {
  OPERATOR_LABELS,
  OPERATORS_BY_FIELD_TYPE,
  humanize,
  newRowId,
  operatorNeedsValue,
  type FilterRow,
} from '@/lib/search';

interface FilterBuilderProps {
  fields: SearchFieldsResponse | undefined;
  rows: FilterRow[];
  op: 'and' | 'or';
  onChange: (rows: FilterRow[], op: 'and' | 'or') => void;
}

const inputClass =
  'px-2.5 py-1.5 border border-border-strong rounded-lg text-sm bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary';

function placeholderFor(type: string | undefined, operator: SearchFilterOperator): string {
  if (type === 'date') return 'e.g. 7d or 2026-01-31';
  if (type === 'boolean') return 'true or false';
  if (type === 'uuid') return operator === 'in' || operator === 'nin' ? 'ids, comma separated, or me' : 'id or me';
  return operator === 'in' || operator === 'nin' ? 'values, comma separated' : 'value';
}

export function FilterBuilder({ fields, rows, op, onChange }: FilterBuilderProps) {
  const sh = useT('shared');
  // Union of fields across the entity types the user can search.
  const fieldTypes = useMemo(() => {
    const map = new Map<string, 'text' | 'uuid' | 'date' | 'boolean'>();
    for (const entity of fields?.entities ?? []) {
      for (const f of entity.fields) if (!map.has(f.name)) map.set(f.name, f.type);
    }
    return map;
  }, [fields]);
  const fieldNames = useMemo(() => [...fieldTypes.keys()].sort(), [fieldTypes]);

  const update = (id: string, patch: Partial<FilterRow>) =>
    onChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)), op);

  const addRow = () => {
    const field = fieldNames.includes('status') ? 'status' : fieldNames[0] ?? 'status';
    onChange([...rows, { id: newRowId(), field, operator: 'eq', value: '' }], op);
  };

  return (
    <div className="space-y-3" aria-label={sh('advancedFilters')}>
      {rows.length > 1 && (
        <div className="flex items-center gap-2 text-sm text-secondary">
          {sh('match')}
          <select
            aria-label={sh('combineWith')}
            value={op}
            onChange={(e) => onChange(rows, e.target.value as 'and' | 'or')}
            className={inputClass}
          >
            <option value="and">all conditions (AND)</option>
            <option value="or">any condition (OR)</option>
          </select>
        </div>
      )}

      {rows.map((row, index) => {
        const type = fieldTypes.get(row.field);
        const operators = OPERATORS_BY_FIELD_TYPE[type ?? 'text'];
        return (
          <div key={row.id} className="flex flex-wrap items-center gap-2" data-testid="filter-row">
            <span className="w-10 text-xs uppercase text-muted">{index === 0 ? 'where' : op}</span>
            <select
              aria-label={sh('field')}
              value={row.field}
              onChange={(e) => {
                const nextType = fieldTypes.get(e.target.value) ?? 'text';
                const allowed = OPERATORS_BY_FIELD_TYPE[nextType];
                update(row.id, {
                  field: e.target.value,
                  operator: allowed.includes(row.operator) ? row.operator : allowed[0],
                });
              }}
              className={inputClass}
            >
              {!fieldNames.includes(row.field) && <option value={row.field}>{humanize(row.field)}</option>}
              {fieldNames.map((name) => (
                <option key={name} value={name}>
                  {humanize(name)}
                </option>
              ))}
            </select>
            <select
              aria-label={sh('operator')}
              value={row.operator}
              onChange={(e) => update(row.id, { operator: e.target.value as SearchFilterOperator })}
              className={inputClass}
            >
              {operators.map((o) => (
                <option key={o} value={o}>
                  {OPERATOR_LABELS[o]}
                </option>
              ))}
            </select>
            {operatorNeedsValue(row.operator) &&
              (type === 'boolean' ? (
                <select
                  aria-label={sh('value')}
                  value={row.value}
                  onChange={(e) => update(row.id, { value: e.target.value })}
                  className={inputClass}
                >
                  <option value="">{sh('select')}</option>
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              ) : (
                <input
                  aria-label={sh('value')}
                  value={row.value}
                  placeholder={placeholderFor(type, row.operator)}
                  onChange={(e) => update(row.id, { value: e.target.value })}
                  className={`${inputClass} flex-1 min-w-[10rem]`}
                />
              ))}
            <button
              type="button"
              aria-label={sh('removeFilter')}
              onClick={() => onChange(rows.filter((r) => r.id !== row.id), op)}
              className="p-1.5 text-muted hover:text-error rounded-lg hover:bg-surface-hover"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        );
      })}

      <button
        type="button"
        onClick={addRow}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
      >
        <Plus className="h-4 w-4" />
        {sh('addCondition')}
      </button>
    </div>
  );
}
