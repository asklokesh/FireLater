import { z } from 'zod';
import { BadRequestError } from '../utils/errors.js';

/**
 * Advanced filter query builder. Converts a validated AND/OR condition tree
 * into a parameterized SQL WHERE fragment. Only allowlisted fields can be
 * referenced; values are always bound as parameters.
 */

export const FILTERABLE_FIELDS: Record<string, { column: string; type: 'text' | 'uuid' | 'date' | 'boolean' }> = {
  status: { column: 'status', type: 'text' },
  priority: { column: 'priority', type: 'text' },
  urgency: { column: 'urgency', type: 'text' },
  impact: { column: 'impact', type: 'text' },
  assignedTo: { column: 'assigned_to', type: 'uuid' },
  assignedGroup: { column: 'assigned_group', type: 'uuid' },
  reporterId: { column: 'reporter_id', type: 'uuid' },
  applicationId: { column: 'application_id', type: 'uuid' },
  createdAt: { column: 'created_at', type: 'date' },
  updatedAt: { column: 'updated_at', type: 'date' },
  resolvedAt: { column: 'resolved_at', type: 'date' },
  title: { column: 'title', type: 'text' },
};

export const FILTER_OPERATORS = ['eq', 'neq', 'in', 'nin', 'gt', 'gte', 'lt', 'lte', 'contains', 'isNull', 'isNotNull'] as const;
export type FilterOperator = (typeof FILTER_OPERATORS)[number];

export interface FilterCondition {
  field: string;
  operator: FilterOperator;
  value?: string | number | boolean | Array<string | number>;
}

export interface FilterGroup {
  logicalOperator: 'AND' | 'OR';
  conditions: Array<FilterCondition | FilterGroup>;
}

export const MAX_FILTER_DEPTH = 5;
export const MAX_FILTER_CONDITIONS = 50;

const scalar = z.union([z.string().max(500), z.number(), z.boolean()]);

export const filterConditionSchema = z.object({
  field: z.string().refine((f) => f in FILTERABLE_FIELDS, { message: 'Unknown filter field' }),
  operator: z.enum(FILTER_OPERATORS),
  value: z.union([scalar, z.array(z.union([z.string().max(500), z.number()])).max(100)]).optional(),
});

export const filterGroupSchema: z.ZodType<FilterGroup> = z.lazy(() =>
  z.object({
    logicalOperator: z.enum(['AND', 'OR']),
    conditions: z.array(z.union([filterConditionSchema, filterGroupSchema])).min(1).max(MAX_FILTER_CONDITIONS),
  })
) as z.ZodType<FilterGroup>;

function isGroup(node: FilterCondition | FilterGroup): node is FilterGroup {
  return (node as FilterGroup).logicalOperator !== undefined;
}

export interface BuiltClause {
  sql: string;
  params: unknown[];
}

/**
 * Build a WHERE fragment from a filter tree. `startIndex` is the next $n
 * placeholder number. `alias` optionally prefixes columns (e.g. "i").
 */
export function buildFilterClause(
  filter: FilterGroup,
  startIndex = 1,
  alias?: string
): BuiltClause {
  const params: unknown[] = [];
  let conditionCount = 0;
  const prefix = alias ? `${alias}.` : '';

  const next = (value: unknown): string => {
    params.push(value);
    return `$${startIndex + params.length - 1}`;
  };

  const buildCondition = (c: FilterCondition): string => {
    const def = FILTERABLE_FIELDS[c.field];
    if (!def) {
      throw new BadRequestError(`Unknown filter field: ${c.field}`);
    }
    const col = `${prefix}${def.column}`;
    const needsValue = c.operator !== 'isNull' && c.operator !== 'isNotNull';
    if (needsValue && (c.value === undefined || c.value === null)) {
      throw new BadRequestError(`Operator ${c.operator} requires a value`);
    }
    switch (c.operator) {
      case 'eq':
        return `${col} = ${next(c.value)}`;
      case 'neq':
        return `${col} <> ${next(c.value)}`;
      case 'in':
      case 'nin': {
        const arr = Array.isArray(c.value) ? c.value : [c.value];
        if (arr.length === 0) {
          throw new BadRequestError(`Operator ${c.operator} requires a non-empty array`);
        }
        const cast = def.type === 'uuid' ? '::uuid[]' : '::text[]';
        return c.operator === 'in'
          ? `${col} = ANY(${next(arr.map(String))}${cast})`
          : `NOT (${col} = ANY(${next(arr.map(String))}${cast}))`;
      }
      case 'gt':
        return `${col} > ${next(c.value)}`;
      case 'gte':
        return `${col} >= ${next(c.value)}`;
      case 'lt':
        return `${col} < ${next(c.value)}`;
      case 'lte':
        return `${col} <= ${next(c.value)}`;
      case 'contains': {
        if (def.type !== 'text') {
          throw new BadRequestError(`Operator contains is only valid for text fields`);
        }
        const escaped = String(c.value).replace(/[\\%_]/g, (m) => `\\${m}`);
        return `${col} ILIKE ${next(`%${escaped}%`)}`;
      }
      case 'isNull':
        return `${col} IS NULL`;
      case 'isNotNull':
        return `${col} IS NOT NULL`;
      default:
        throw new BadRequestError(`Unsupported operator`);
    }
  };

  const buildGroup = (g: FilterGroup, depth: number): string => {
    if (depth > MAX_FILTER_DEPTH) {
      throw new BadRequestError(`Filter nesting exceeds maximum depth of ${MAX_FILTER_DEPTH}`);
    }
    if (!g.conditions || g.conditions.length === 0) {
      return 'TRUE';
    }
    const joiner = g.logicalOperator === 'OR' ? ' OR ' : ' AND ';
    const parts = g.conditions.map((node) => {
      if (isGroup(node)) {
        return buildGroup(node, depth + 1);
      }
      conditionCount += 1;
      if (conditionCount > MAX_FILTER_CONDITIONS) {
        throw new BadRequestError(`Filter exceeds maximum of ${MAX_FILTER_CONDITIONS} conditions`);
      }
      return buildCondition(node);
    });
    return `(${parts.join(joiner)})`;
  };

  return { sql: buildGroup(filter, 1), params };
}

/** Advanced filter query builder entry point: validates then builds the clause. */
export function buildQuery(input: unknown, startIndex = 1, alias?: string): BuiltClause {
  const parsed = filterGroupSchema.safeParse(input);
  if (!parsed.success) {
    throw new BadRequestError(`Invalid filter: ${parsed.error.issues.map((i) => i.message).join('; ')}`);
  }
  return buildFilterClause(parsed.data, startIndex, alias);
}
