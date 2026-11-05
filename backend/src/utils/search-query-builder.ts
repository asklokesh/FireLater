import { z } from 'zod';

export const FILTER_FIELDS = {
  status: 'i.status',
  priority: 'i.priority',
  severity: 'i.severity',
  assigned_to: 'i.assigned_to',
  assigned_group: 'i.assigned_group',
  application_id: 'i.application_id',
  reporter_id: 'i.reporter_id',
  sla_breached: 'i.sla_breached',
  created_at: 'i.created_at',
  updated_at: 'i.updated_at',
} as const;

export const FILTER_OPERATORS = [
  'eq', 'neq', 'in', 'not_in', 'gt', 'gte', 'lt', 'lte', 'is_null', 'is_not_null',
] as const;

export const MAX_FILTER_DEPTH = 3;
export const MAX_FILTER_CONDITIONS = 50;

const scalar = z.union([z.string().max(500), z.number(), z.boolean()]);

const conditionSchema = z.object({
  field: z.enum(Object.keys(FILTER_FIELDS) as [keyof typeof FILTER_FIELDS, ...(keyof typeof FILTER_FIELDS)[]]),
  operator: z.enum(FILTER_OPERATORS),
  value: z.union([scalar, z.array(scalar).max(100)]).optional(),
}).strict();

export type FilterCondition = z.infer<typeof conditionSchema>;
export interface FilterGroup {
  op: 'and' | 'or';
  conditions: Array<FilterCondition | FilterGroup>;
}

const groupSchema: z.ZodType<FilterGroup> = z.lazy(() =>
  z.object({
    op: z.enum(['and', 'or']),
    conditions: z.array(z.union([conditionSchema, groupSchema])).max(MAX_FILTER_CONDITIONS),
  }).strict()
);

function measure(group: FilterGroup, depth: number): { depth: number; count: number } {
  let maxDepth = depth;
  let count = 0;
  for (const c of group.conditions) {
    if ('conditions' in c) {
      const r = measure(c, depth + 1);
      maxDepth = Math.max(maxDepth, r.depth);
      count += r.count;
    } else {
      count++;
    }
  }
  return { depth: maxDepth, count };
}

export const filterSchema: z.ZodType<FilterGroup> = groupSchema.superRefine((g, ctx) => {
  const m = measure(g, 1);
  if (m.depth > MAX_FILTER_DEPTH) {
    ctx.addIssue({ code: 'custom', message: `Filter nesting exceeds ${MAX_FILTER_DEPTH} levels` });
  }
  if (m.count > MAX_FILTER_CONDITIONS) {
    ctx.addIssue({ code: 'custom', message: `Filter has more than ${MAX_FILTER_CONDITIONS} conditions` });
  }
});

export class FilterError extends Error {}

const CMP: Record<string, string> = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=' };

export function buildFilterSql(
  filter: unknown,
  startParamIndex: number
): { sql: string; values: unknown[]; nextParamIndex: number } {
  const parsed = filterSchema.safeParse(filter);
  if (!parsed.success) {
    throw new FilterError(parsed.error.issues.map((i) => i.message).join('; '));
  }
  const values: unknown[] = [];
  let idx = startParamIndex;

  const build = (node: FilterCondition | FilterGroup): string => {
    if ('conditions' in node) {
      const parts = node.conditions.map(build).filter(Boolean);
      if (parts.length === 0) return '';
      return `(${parts.join(node.op === 'and' ? ' AND ' : ' OR ')})`;
    }
    const col = FILTER_FIELDS[node.field];
    switch (node.operator) {
      case 'is_null':
        return `${col} IS NULL`;
      case 'is_not_null':
        return `${col} IS NOT NULL`;
      case 'in':
      case 'not_in': {
        if (!Array.isArray(node.value) || node.value.length === 0) {
          throw new FilterError(`Operator ${node.operator} requires a non-empty array value`);
        }
        values.push(node.value);
        return `${col} ${node.operator === 'in' ? '= ANY' : '<> ALL'}($${idx++})`;
      }
      default: {
        if (node.value === undefined || Array.isArray(node.value)) {
          throw new FilterError(`Operator ${node.operator} requires a scalar value`);
        }
        values.push(node.value);
        return `${col} ${CMP[node.operator]} $${idx++}`;
      }
    }
  };

  const sql = build(parsed.data);
  return { sql, values, nextParamIndex: idx };
}
