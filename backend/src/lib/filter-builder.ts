import { z } from 'zod';
import { BadRequestError } from '../utils/errors.js';

export type FilterEntity = 'issues' | 'problems' | 'requests';
export type FieldType = 'string' | 'number' | 'boolean' | 'date';
export type FilterOperator =
  | 'eq' | 'neq' | 'in' | 'not_in' | 'gt' | 'gte' | 'lt' | 'lte'
  | 'contains' | 'is_null' | 'is_not_null';

export const FILTER_OPERATORS: readonly FilterOperator[] = [
  'eq', 'neq', 'in', 'not_in', 'gt', 'gte', 'lt', 'lte', 'contains', 'is_null', 'is_not_null',
];

export const MAX_FILTER_DEPTH = 3;
export const MAX_FILTER_CONDITIONS = 25;
export const MAX_IN_VALUES = 100;

export type FilterScalar = string | number | boolean | null;
export interface FilterCondition {
  field: string;
  operator: FilterOperator;
  value?: FilterScalar | FilterScalar[];
}
export interface FilterGroup {
  op: 'and' | 'or';
  conditions: Array<FilterCondition | FilterGroup>;
}

const scalar = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const conditionSchema = z.object({
  field: z.string(),
  operator: z.enum(FILTER_OPERATORS as [FilterOperator, ...FilterOperator[]]),
  value: z.union([scalar, z.array(scalar)]).optional(),
});

export const FilterGroupSchema: z.ZodType<FilterGroup> = z.lazy(() =>
  z.object({
    op: z.enum(['and', 'or']),
    conditions: z.array(z.union([conditionSchema, FilterGroupSchema])),
  }),
) as z.ZodType<FilterGroup>;

/** Operators allowed per field type. */
export const OPERATORS_BY_TYPE: Record<FieldType, readonly FilterOperator[]> = {
  string: ['eq', 'neq', 'in', 'not_in', 'contains', 'is_null', 'is_not_null'],
  number: ['eq', 'neq', 'in', 'not_in', 'gt', 'gte', 'lt', 'lte', 'is_null', 'is_not_null'],
  boolean: ['eq', 'neq', 'is_null', 'is_not_null'],
  date: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'is_null', 'is_not_null'],
};

const COMMON: Record<string, FieldType> = {
  id: 'string',
  status: 'string',
  priority: 'string',
  assigned_to: 'string',
  created_at: 'date',
  updated_at: 'date',
};

/** Whitelisted columns (tenant_template migrations 002, 003, 013). */
export const ENTITY_FIELDS: Record<FilterEntity, { table: string; fields: Record<string, FieldType> }> = {
  issues: {
    table: 'issues',
    fields: {
      ...COMMON,
      issue_number: 'string', title: 'string', description: 'string', severity: 'string',
      impact: 'string', urgency: 'string', category_id: 'string', issue_type: 'string',
      source: 'string', application_id: 'string', environment_id: 'string',
      reporter_id: 'string', assigned_group: 'string', escalation_level: 'number',
      sla_breached: 'boolean', resolution_code: 'string',
      first_response_at: 'date', resolved_at: 'date', closed_at: 'date',
    },
  },
  problems: {
    table: 'problems',
    fields: {
      ...COMMON,
      problem_number: 'string', title: 'string', description: 'string', impact: 'string',
      urgency: 'string', category_id: 'string', problem_type: 'string',
      application_id: 'string', reporter_id: 'string', assigned_group: 'string',
      has_workaround: 'boolean', is_known_error: 'boolean', resolution_code: 'string',
      resolved_at: 'date', closed_at: 'date',
    },
  },
  requests: {
    table: 'service_requests',
    fields: {
      ...COMMON,
      request_number: 'string', catalog_item_id: 'string', bundle_id: 'string',
      requester_id: 'string', requested_for_id: 'string', notes: 'string',
      cost_center: 'string', total_cost: 'number', fulfillment_group_id: 'string',
      due_date: 'date', completed_at: 'date', cancelled_at: 'date',
    },
  },
};

export interface BuiltFilter {
  sql: string;
  values: unknown[];
  nextParamIndex: number;
}

function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

function isGroup(n: unknown): n is Record<string, unknown> {
  return typeof n === 'object' && n !== null && 'conditions' in n;
}

function countLeaves(node: unknown, depth: number): number {
  if (!isGroup(node)) return 1;
  if (depth > MAX_FILTER_DEPTH) {
    throw new BadRequestError(`Filter nesting exceeds maximum depth of ${MAX_FILTER_DEPTH}`);
  }
  if (!Array.isArray(node.conditions)) throw new BadRequestError('Filter group conditions must be an array');
  let n = 0;
  for (const c of node.conditions) n += countLeaves(c, depth + 1);
  if (n > MAX_FILTER_CONDITIONS) {
    throw new BadRequestError(`Filter exceeds maximum of ${MAX_FILTER_CONDITIONS} conditions`);
  }
  return n;
}

function checkValue(type: FieldType, v: unknown, field: string): FilterScalar {
  const ok =
    (type === 'string' && typeof v === 'string') ||
    (type === 'number' && typeof v === 'number' && Number.isFinite(v)) ||
    (type === 'boolean' && typeof v === 'boolean') ||
    (type === 'date' && typeof v === 'string' && !Number.isNaN(Date.parse(v)));
  if (!ok) throw new BadRequestError('Invalid value for filter field');
  return v as FilterScalar;
}

const SQL_OPS: Record<string, string> = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=' };

/**
 * Build a parenthesized SQL boolean expression. The first placeholder is
 * $startParamIndex; every value is bound. Throws BadRequestError (and
 * returns no SQL) for unknown fields/operators or oversized groups.
 */
export function buildFilterSql(
  entity: FilterEntity,
  group: unknown,
  startParamIndex = 1,
  alias?: string,
): BuiltFilter {
  const def = Object.prototype.hasOwnProperty.call(ENTITY_FIELDS, entity) ? ENTITY_FIELDS[entity] : undefined;
  if (!def) throw new BadRequestError('Unknown filter entity');
  if (!Number.isInteger(startParamIndex) || startParamIndex < 1) {
    throw new BadRequestError('Invalid start parameter index');
  }
  if (alias !== undefined && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(alias)) {
    throw new BadRequestError('Invalid table alias');
  }
  if (!isGroup(group)) throw new BadRequestError('Filter must be a group');
  countLeaves(group, 1);

  const values: unknown[] = [];
  let next = startParamIndex;
  const prefix = alias ? `${alias}.` : '';
  const bind = (v: unknown): string => {
    values.push(v);
    return `$${next++}`;
  };

  const buildNode = (node: unknown): string => {
    if (isGroup(node)) {
      if (node.op !== 'and' && node.op !== 'or') throw new BadRequestError('Filter group op must be and or or');
      const conds = node.conditions as unknown[];
      if (conds.length === 0) throw new BadRequestError('Filter group must have at least one condition');
      const parts = conds.map(buildNode);
      return `(${parts.join(node.op === 'and' ? ' AND ' : ' OR ')})`;
    }
    if (typeof node !== 'object' || node === null) throw new BadRequestError('Invalid filter condition');
    const { field, operator, value } = node as Record<string, unknown>;
    if (typeof field !== 'string' || !Object.prototype.hasOwnProperty.call(def.fields, field)) {
      throw new BadRequestError('Unknown filter field');
    }
    const type = def.fields[field];
    if (typeof operator !== 'string' || !(FILTER_OPERATORS as readonly string[]).includes(operator)) {
      throw new BadRequestError('Unknown filter operator');
    }
    if (!OPERATORS_BY_TYPE[type].includes(operator as FilterOperator)) {
      throw new BadRequestError(`Operator '${operator}' is not supported for field '${field}'`);
    }
    const col = `${prefix}${field}`;
    switch (operator as FilterOperator) {
      case 'is_null':
        return `${col} IS NULL`;
      case 'is_not_null':
        return `${col} IS NOT NULL`;
      case 'in':
      case 'not_in': {
        if (!Array.isArray(value) || value.length === 0 || value.length > MAX_IN_VALUES) {
          throw new BadRequestError(`Operator '${operator}' requires 1-${MAX_IN_VALUES} values`);
        }
        const arr = value.map((v) => checkValue(type, v, field));
        const p = bind(arr);
        return operator === 'in' ? `${col} = ANY(${p})` : `NOT (${col} = ANY(${p}))`;
      }
      case 'contains': {
        if (typeof value !== 'string') throw new BadRequestError('Invalid value for filter field');
        return `${col} ILIKE ${bind(`%${escapeLike(value)}%`)} ESCAPE '\\'`;
      }
      default: {
        if (Array.isArray(value) || value === null || value === undefined) {
          throw new BadRequestError('Invalid value for filter field');
        }
        const v = checkValue(type, value, field);
        return `${col} ${SQL_OPS[operator as string]} ${bind(v)}`;
      }
    }
  };

  const sql = buildNode(group);
  return { sql, values, nextParamIndex: next };
}
