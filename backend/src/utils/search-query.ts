import { z } from 'zod';

/**
 * Weighted full-text expression over issues.title (A) and issues.description (B).
 * Shared by migration 037 (GIN index idx_issues_fulltext) and the issue service
 * queries so the planner can use the index. Column references are unqualified:
 * use it only in a scope where `issues` is the sole table providing title/description.
 */
export const ISSUE_FULLTEXT_EXPRESSION =
  "setweight(to_tsvector('english', coalesce(title,'')),'A') || setweight(to_tsvector('english', coalesce(description,'')),'B')";

export const QUALIFIER_VALUES = {
  status: ['new', 'assigned', 'in_progress', 'pending', 'resolved', 'closed'],
  priority: ['critical', 'high', 'medium', 'low'],
  severity: ['S1', 'S2', 'S3', 'S4'],
} as const;

export type QualifierField = keyof typeof QUALIFIER_VALUES;

export const FILTER_FIELDS = [
  'status', 'priority', 'severity', 'assigned_to', 'assigned_group', 'application_id',
  'reporter_id', 'sla_breached', 'created_at', 'updated_at',
] as const;

export const FILTER_OPERATORS = [
  'eq', 'neq', 'in', 'not_in', 'gt', 'gte', 'lt', 'lte', 'is_null', 'is_not_null',
] as const;

export const MAX_FILTER_DEPTH = 3;
export const MAX_FILTER_CONDITIONS = 20;

export type FilterField = typeof FILTER_FIELDS[number];
export type FilterOperator = typeof FILTER_OPERATORS[number];
export interface FilterCondition {
  field: FilterField;
  operator: FilterOperator;
  value?: string | number | boolean | null | Array<string | number | boolean>;
}
export interface FilterGroup {
  op: 'and' | 'or';
  conditions: Array<FilterCondition | FilterGroup>;
}

export interface ParsedSearchQuery {
  text: string;
  conditions: FilterCondition[];
}

/**
 * Extract allowlisted status:/priority:/severity: qualifiers from raw text.
 * Unknown qualifiers or disallowed values stay in the free text, which is
 * intended to be matched with websearch_to_tsquery('english', text).
 */
export function parseSearchQuery(q: string | undefined | null): ParsedSearchQuery {
  const conditions: FilterCondition[] = [];
  if (!q) return { text: '', conditions };
  const remaining: string[] = [];
  const tokens = q.match(/"[^"]*"|\S+/g) ?? [];
  for (const token of tokens) {
    const m = /^(status|priority|severity):(\S+)$/i.exec(token);
    if (m) {
      const field = m[1].toLowerCase() as QualifierField;
      const allowed = QUALIFIER_VALUES[field] as readonly string[];
      const value = allowed.find((v) => v.toLowerCase() === m[2].toLowerCase());
      if (value) {
        conditions.push({ field, operator: 'eq', value });
        continue;
      }
    }
    remaining.push(token);
  }
  return { text: remaining.join(' ').trim(), conditions };
}

const scalarValue = z.union([z.string().max(500), z.number(), z.boolean()]);

export const filterConditionSchema = z.object({
  field: z.enum(FILTER_FIELDS),
  operator: z.enum(FILTER_OPERATORS),
  value: z.union([scalarValue, z.array(scalarValue).max(100), z.null()]).optional(),
}).strict().superRefine((c, ctx) => {
  if (c.operator === 'in' || c.operator === 'not_in') {
    if (!Array.isArray(c.value) || c.value.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${c.operator} requires a non-empty array value` });
    }
  } else if (c.operator !== 'is_null' && c.operator !== 'is_not_null') {
    if (c.value === undefined || c.value === null || Array.isArray(c.value)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${c.operator} requires a scalar value` });
    }
  }
});

const baseGroupSchema: z.ZodType<FilterGroup> = z.lazy(() =>
  z.object({
    op: z.enum(['and', 'or']),
    conditions: z.array(z.union([filterConditionSchema, baseGroupSchema])).min(1),
  }).strict()
) as z.ZodType<FilterGroup>;

function isGroup(node: FilterCondition | FilterGroup): node is FilterGroup {
  return Array.isArray((node as FilterGroup).conditions);
}

function measure(group: FilterGroup, depth: number): { depth: number; count: number } {
  let maxDepth = depth;
  let count = 0;
  for (const node of group.conditions) {
    if (isGroup(node)) {
      const m = measure(node, depth + 1);
      maxDepth = Math.max(maxDepth, m.depth);
      count += m.count;
    } else {
      count++;
    }
  }
  return { depth: maxDepth, count };
}

export const filterGroupSchema = baseGroupSchema.superRefine((g, ctx) => {
  const m = measure(g, 1);
  if (m.depth > MAX_FILTER_DEPTH) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Filter groups may be nested at most ${MAX_FILTER_DEPTH} levels` });
  }
  if (m.count > MAX_FILTER_CONDITIONS) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Filter may contain at most ${MAX_FILTER_CONDITIONS} conditions` });
  }
});

const SCALAR_OPS: Record<string, string> = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=' };

/**
 * Build parameterized SQL for a filter group. Validates the group with
 * filterGroupSchema (throws ZodError on unknown fields/operators/excess depth).
 * Column names come from the allowlist only; values are always bound parameters.
 */
export function buildFilterSql(
  group: FilterGroup,
  startParamIndex = 1,
  alias = 'i'
): { sql: string; values: unknown[]; nextParamIndex: number } {
  const parsed = filterGroupSchema.parse(group);
  const values: unknown[] = [];
  let idx = startParamIndex;

  const render = (g: FilterGroup): string => {
    const parts = g.conditions.map((node) => {
      if (isGroup(node)) return render(node);
      const col = `${alias}.${node.field}`;
      switch (node.operator) {
        case 'is_null':
          return `${col} IS NULL`;
        case 'is_not_null':
          return `${col} IS NOT NULL`;
        case 'in':
          values.push(node.value);
          return `${col} = ANY($${idx++})`;
        case 'not_in':
          values.push(node.value);
          return `NOT (${col} = ANY($${idx++}))`;
        default:
          values.push(node.value);
          return `${col} ${SCALAR_OPS[node.operator]} $${idx++}`;
      }
    });
    return `(${parts.join(g.op === 'and' ? ' AND ' : ' OR ')})`;
  };

  return { sql: render(parsed), values, nextParamIndex: idx };
}
