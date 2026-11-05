import { ValidationError } from './errors.js';

/** Shared tsvector expression; must be identical to the one indexed by idx_issues_fulltext. */
export const ISSUE_TSVECTOR_EXPR =
  "to_tsvector('english', coalesce(title,'') || ' ' || coalesce(description,''))";

export const FILTER_FIELDS = [
  'status', 'priority', 'severity', 'assigned_to', 'assigned_group', 'application_id',
  'reporter_id', 'sla_breached', 'created_at', 'updated_at',
] as const;

export const FILTER_OPERATORS = [
  'eq', 'neq', 'in', 'not_in', 'gt', 'gte', 'lt', 'lte', 'is_null', 'not_null',
] as const;

export const MAX_FILTER_DEPTH = 3;
export const MAX_FILTER_CONDITIONS = 25;

export type FilterField = (typeof FILTER_FIELDS)[number];
export type FilterOperator = (typeof FILTER_OPERATORS)[number];

export interface FilterCondition {
  field: string;
  operator: string;
  value?: unknown;
}

export interface FilterGroup {
  op: 'AND' | 'OR';
  conditions: Array<FilterCondition | FilterGroup>;
}

export interface BuiltFilter {
  sql: string;
  values: unknown[];
}

const COMPARISON: Record<string, string> = {
  eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=',
};

function isGroup(node: unknown): node is FilterGroup {
  return typeof node === 'object' && node !== null && 'op' in node && 'conditions' in node;
}

/**
 * Builds a parameterized WHERE fragment (without the WHERE keyword) from a filter tree.
 * Columns are prefixed with `alias.`. Parameters are numbered starting at startIndex.
 */
export function buildSearchFilter(
  tree: FilterGroup | undefined | null,
  startIndex = 1,
  alias = 'i'
): BuiltFilter {
  if (!tree) return { sql: '', values: [] };

  const values: unknown[] = [];
  let count = 0;
  let next = startIndex;

  const buildCondition = (c: FilterCondition): string => {
    if (!(FILTER_FIELDS as readonly string[]).includes(c.field)) {
      throw new ValidationError([{ field: 'field', message: `Unknown filter field: ${String(c.field)}` }]);
    }
    if (!(FILTER_OPERATORS as readonly string[]).includes(c.operator)) {
      throw new ValidationError([{ field: 'operator', message: `Unknown filter operator: ${String(c.operator)}` }]);
    }
    count++;
    if (count > MAX_FILTER_CONDITIONS) {
      throw new ValidationError([{ field: 'filter', message: `Too many conditions (max ${MAX_FILTER_CONDITIONS})` }]);
    }
    const col = `${alias}.${c.field}`;
    if (c.operator === 'is_null') return `${col} IS NULL`;
    if (c.operator === 'not_null') return `${col} IS NOT NULL`;
    if (c.operator === 'in' || c.operator === 'not_in') {
      if (!Array.isArray(c.value) || c.value.length === 0) {
        throw new ValidationError([{ field: 'value', message: `Operator ${c.operator} requires a non-empty array` }]);
      }
      values.push(c.value);
      return `${col} ${c.operator === 'in' ? '= ANY' : '<> ALL'}($${next++})`;
    }
    if (c.value === undefined || c.value === null || Array.isArray(c.value) || typeof c.value === 'object') {
      throw new ValidationError([{ field: 'value', message: `Operator ${c.operator} requires a scalar value` }]);
    }
    values.push(c.value);
    return `${col} ${COMPARISON[c.operator]} $${next++}`;
  };

  const buildGroup = (g: FilterGroup, depth: number): string => {
    if (depth > MAX_FILTER_DEPTH) {
      throw new ValidationError([{ field: 'filter', message: `Filter nesting too deep (max ${MAX_FILTER_DEPTH})` }]);
    }
    if (g.op !== 'AND' && g.op !== 'OR') {
      throw new ValidationError([{ field: 'op', message: `Unknown group operator: ${String(g.op)}` }]);
    }
    if (!Array.isArray(g.conditions)) {
      throw new ValidationError([{ field: 'conditions', message: 'conditions must be an array' }]);
    }
    const parts = g.conditions.map((n) => (isGroup(n) ? buildGroup(n, depth + 1) : buildCondition(n as FilterCondition)));
    const nonEmpty = parts.filter((p) => p !== '');
    if (nonEmpty.length === 0) return '';
    return `(${nonEmpty.join(` ${g.op} `)})`;
  };

  const sql = buildGroup(tree, 1);
  return { sql, values };
}
