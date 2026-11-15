import { z } from 'zod';
import { buildTextSearchClause } from './fts.js';

export const MAX_FILTER_DEPTH = 4;
export const MAX_FILTER_CONDITIONS = 50;
export const MAX_IN_VALUES = 50;

export const ENUM_VALUES = {
  status: ['new', 'assigned', 'in_progress', 'pending', 'resolved', 'closed'],
  priority: ['critical', 'high', 'medium', 'low'],
  severity: ['S1', 'S2', 'S3', 'S4'],
  impact: ['widespread', 'significant', 'moderate', 'minor'],
  urgency: ['immediate', 'high', 'medium', 'low'],
  issue_type: ['issue', 'problem', 'question'],
  source: ['portal', 'email', 'phone', 'monitoring', 'api'],
} as const;

type FieldType = 'enum' | 'id' | 'boolean' | 'timestamp' | 'text';

export const FILTER_FIELDS: Record<string, FieldType> = {
  status: 'enum',
  priority: 'enum',
  severity: 'enum',
  impact: 'enum',
  urgency: 'enum',
  issue_type: 'enum',
  source: 'enum',
  category_id: 'id',
  assigned_to: 'id',
  assigned_group: 'id',
  application_id: 'id',
  environment_id: 'id',
  reporter_id: 'id',
  sla_breached: 'boolean',
  created_at: 'timestamp',
  updated_at: 'timestamp',
  resolved_at: 'timestamp',
  text: 'text',
};

export const FILTER_OPERATORS = [
  'eq', 'neq', 'in', 'nin', 'gt', 'gte', 'lt', 'lte', 'between', 'is_null', 'is_not_null',
] as const;
export type FilterOperator = (typeof FILTER_OPERATORS)[number];

export const OPERATORS_BY_TYPE: Record<FieldType, readonly FilterOperator[]> = {
  enum: ['eq', 'neq', 'in', 'nin', 'is_null', 'is_not_null'],
  id: ['eq', 'neq', 'in', 'nin', 'is_null', 'is_not_null'],
  boolean: ['eq', 'neq'],
  timestamp: ['eq', 'gt', 'gte', 'lt', 'lte', 'between', 'is_null', 'is_not_null'],
  text: ['eq'],
};

const fieldNames = Object.keys(FILTER_FIELDS) as [string, ...string[]];

export interface FilterCondition {
  field: string;
  operator: FilterOperator;
  value?: unknown;
}
export interface FilterGroup {
  op: 'and' | 'or';
  conditions: Array<FilterGroup | FilterCondition>;
}

function scalarSchema(field: string, type: FieldType): z.ZodTypeAny {
  switch (type) {
    case 'enum':
      return z.enum(ENUM_VALUES[field as keyof typeof ENUM_VALUES] as unknown as [string, ...string[]]);
    case 'id':
      return z.string().min(1).max(100);
    case 'boolean':
      return z.boolean();
    case 'timestamp':
      return z
        .string()
        .min(1)
        .refine((s) => !Number.isNaN(Date.parse(s)), 'Invalid date');
    case 'text':
      return z.string().min(1).max(500);
  }
}

const conditionSchema = z
  .object({
    field: z.enum(fieldNames),
    operator: z.enum(FILTER_OPERATORS),
    value: z.unknown().optional(),
  })
  .strict()
  .superRefine((c, ctx) => {
    const type = FILTER_FIELDS[c.field];
    if (!OPERATORS_BY_TYPE[type].includes(c.operator)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['operator'],
        message: `Operator ${c.operator} is not allowed for field ${c.field}`,
      });
      return;
    }
    if (c.operator === 'is_null' || c.operator === 'is_not_null') return;
    let valueSchema: z.ZodTypeAny;
    if (c.operator === 'in' || c.operator === 'nin') {
      valueSchema = z.array(scalarSchema(c.field, type)).min(1).max(MAX_IN_VALUES);
    } else if (c.operator === 'between') {
      valueSchema = z.tuple([scalarSchema(c.field, type), scalarSchema(c.field, type)]);
    } else {
      valueSchema = scalarSchema(c.field, type);
    }
    const r = valueSchema.safeParse(c.value);
    if (!r.success) {
      for (const issue of r.error.issues) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['value', ...issue.path],
          message: issue.message,
        });
      }
    }
  });

const baseGroupSchema: z.ZodType<FilterGroup, z.ZodTypeDef, unknown> = z.lazy(() =>
  z
    .object({
      op: z.enum(['and', 'or']),
      conditions: z.array(z.union([baseGroupSchema, conditionSchema])),
    })
    .strict()
) as z.ZodType<FilterGroup, z.ZodTypeDef, unknown>;

function measure(group: FilterGroup, depth: number): { depth: number; count: number } {
  let maxDepth = depth;
  let count = 0;
  for (const c of group.conditions) {
    if ('conditions' in c) {
      const m = measure(c, depth + 1);
      maxDepth = Math.max(maxDepth, m.depth);
      count += m.count;
    } else {
      count += 1;
    }
  }
  return { depth: maxDepth, count };
}

export const filterGroupSchema = baseGroupSchema.superRefine((g, ctx) => {
  const { depth, count } = measure(g, 1);
  if (depth > MAX_FILTER_DEPTH) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Filter nesting exceeds ${MAX_FILTER_DEPTH} levels` });
  }
  if (count > MAX_FILTER_CONDITIONS) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Filter exceeds ${MAX_FILTER_CONDITIONS} conditions` });
  }
});

export interface FilterClause {
  sql: string;
  values: unknown[];
  nextIndex: number;
}

const SIMPLE_OPS: Record<string, string> = {
  eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=',
};

function build(
  node: FilterGroup | FilterCondition,
  alias: string,
  index: number,
  values: unknown[]
): { sql: string; index: number } {
  if ('conditions' in node) {
    if (node.conditions.length === 0) return { sql: 'TRUE', index };
    const parts: string[] = [];
    for (const child of node.conditions) {
      const r = build(child, alias, index, values);
      parts.push(r.sql);
      index = r.index;
    }
    return { sql: `(${parts.join(node.op === 'and' ? ' AND ' : ' OR ')})`, index };
  }
  const { field, operator, value } = node;
  if (field === 'text') {
    values.push(value);
    return { sql: buildTextSearchClause(alias, index), index: index + 1 };
  }
  const col = `${alias}.${field}`;
  switch (operator) {
    case 'is_null':
      return { sql: `${col} IS NULL`, index };
    case 'is_not_null':
      return { sql: `${col} IS NOT NULL`, index };
    case 'in':
    case 'nin':
      values.push(value);
      return {
        sql: `${col} ${operator === 'in' ? '= ANY' : '<> ALL'}($${index})`,
        index: index + 1,
      };
    case 'between': {
      const [a, b] = value as [unknown, unknown];
      values.push(a, b);
      return { sql: `${col} BETWEEN $${index} AND $${index + 1}`, index: index + 2 };
    }
    default:
      values.push(value);
      return { sql: `${col} ${SIMPLE_OPS[operator]} $${index}`, index: index + 1 };
  }
}

export function buildFilterClause(
  group: FilterGroup,
  opts: { alias: string; startIndex: number }
): FilterClause {
  if (!/^[a-z_][a-z0-9_]*$/i.test(opts.alias)) {
    throw new Error('Invalid table alias');
  }
  const parsed = filterGroupSchema.parse(group);
  const values: unknown[] = [];
  const r = build(parsed, opts.alias, opts.startIndex, values);
  return { sql: r.sql, values, nextIndex: r.index };
}
