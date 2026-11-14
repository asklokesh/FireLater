import { BadRequestError } from '../utils/errors.js';

export type FilterOperator = 'eq' | 'neq' | 'in' | 'gte' | 'lte' | 'contains';

export interface FilterCondition {
  field: string;
  operator: FilterOperator;
  value: unknown;
}

export interface FilterGroup {
  op: 'and' | 'or';
  conditions: FilterNode[];
}

export type FilterNode = FilterGroup | FilterCondition;

export const FILTER_FIELDS = [
  'status', 'priority', 'severity', 'impact', 'urgency', 'issue_type', 'source',
  'assigned_group', 'assigned_to', 'application_id', 'reporter_id', 'category_id',
  'sla_breached', 'created_at', 'updated_at',
] as const;

export const FILTER_OPERATORS: FilterOperator[] = ['eq', 'neq', 'in', 'gte', 'lte', 'contains'];

export const MAX_FILTER_DEPTH = 4;
const MAX_IN_VALUES = 100;
const MAX_CONDITIONS = 50;

type Scalar = string | number | boolean;

function isScalar(v: unknown): v is Scalar {
  return typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean';
}

function isGroup(node: unknown): node is FilterGroup {
  return typeof node === 'object' && node !== null && 'conditions' in node;
}

/**
 * Builds a parameterized SQL fragment (table alias `i`) from a filter tree.
 * Values are only ever pushed to `values`; column names come from an allowlist.
 */
export function buildFilterClause(
  tree: FilterNode,
  startIndex = 1
): { sql: string; values: unknown[] } {
  const values: unknown[] = [];
  let count = 0;

  const build = (node: FilterNode, depth: number): string => {
    if (depth > MAX_FILTER_DEPTH) {
      throw new BadRequestError(`Filter nesting exceeds maximum depth of ${MAX_FILTER_DEPTH}`);
    }
    if (isGroup(node)) {
      if (node.op !== 'and' && node.op !== 'or') {
        throw new BadRequestError('Invalid filter group operator');
      }
      if (!Array.isArray(node.conditions) || node.conditions.length === 0) {
        throw new BadRequestError('Filter group requires at least one condition');
      }
      const parts = node.conditions.map((c) => build(c, depth + 1));
      return `(${parts.join(node.op === 'and' ? ' AND ' : ' OR ')})`;
    }

    const { field, operator, value } = node as FilterCondition;
    if (typeof field !== 'string' || !(FILTER_FIELDS as readonly string[]).includes(field)) {
      throw new BadRequestError(`Filter field not allowed: ${String(field)}`);
    }
    if (!FILTER_OPERATORS.includes(operator)) {
      throw new BadRequestError(`Filter operator not allowed: ${String(operator)}`);
    }
    if (++count > MAX_CONDITIONS) {
      throw new BadRequestError('Too many filter conditions');
    }
    const col = `i.${field}`;
    const param = (v: unknown): string => {
      values.push(v);
      return `$${startIndex + values.length - 1}`;
    };

    if (operator === 'in') {
      if (!Array.isArray(value) || value.length === 0 || value.length > MAX_IN_VALUES || !value.every(isScalar)) {
        throw new BadRequestError('Operator "in" requires a non-empty array of scalar values');
      }
      return `${col}::text = ANY(${param(value.map(String))}::text[])`;
    }
    if (!isScalar(value)) {
      throw new BadRequestError(`Filter value for ${field} must be a scalar`);
    }
    switch (operator) {
      case 'eq':
        return `${col}::text = ${param(String(value))}`;
      case 'neq':
        return `${col}::text IS DISTINCT FROM ${param(String(value))}`;
      case 'gte':
        return `${col}::text >= ${param(String(value))}`;
      case 'lte':
        return `${col}::text <= ${param(String(value))}`;
      default:
        return `position(lower(${param(String(value))}) in lower(${col}::text)) > 0`;
    }
  };

  return { sql: build(tree, 1), values };
}
