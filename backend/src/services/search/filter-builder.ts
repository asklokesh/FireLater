import { z } from 'zod';
import { searchConfig, type SearchEntity, type SearchFieldType } from './config.js';

export const MAX_FILTER_DEPTH = 4;
export const MAX_FILTER_CONDITIONS = 25;

export const FILTER_OPERATORS = [
  'eq', 'ne', 'in', 'nin', 'gt', 'gte', 'lt', 'lte', 'between', 'contains', 'isnull', 'notnull',
] as const;
export type FilterOperator = (typeof FILTER_OPERATORS)[number];

const scalar = z.union([z.string(), z.number(), z.boolean()]);

export const filterConditionSchema = z.object({
  field: z.string().min(1),
  operator: z.enum(FILTER_OPERATORS),
  value: z.union([scalar, z.array(scalar), z.null()]).optional(),
});

export interface FilterCondition {
  field: string;
  operator: FilterOperator;
  value?: string | number | boolean | Array<string | number | boolean> | null;
}
export interface FilterGroup {
  op: 'and' | 'or';
  conditions: Array<FilterCondition | FilterGroup>;
}

export const filterTreeSchema: z.ZodType<FilterGroup> = z.lazy(() =>
  z.object({
    op: z.enum(['and', 'or']),
    conditions: z.array(z.union([filterConditionSchema, filterTreeSchema])),
  })
) as z.ZodType<FilterGroup>;

export class FilterBuildError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FilterBuildError';
  }
}

export interface FilterClause {
  sql: string;
  params: unknown[];
}

function isGroup(n: FilterCondition | FilterGroup): n is FilterGroup {
  return (n as FilterGroup).conditions !== undefined && (n as FilterGroup).op !== undefined;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function checkScalar(type: SearchFieldType, v: unknown, ctx: string): unknown {
  switch (type) {
    case 'boolean':
      if (typeof v !== 'boolean') throw new FilterBuildError(`${ctx} requires a boolean value`);
      return v;
    case 'uuid':
      if (typeof v !== 'string' || !UUID_RE.test(v)) throw new FilterBuildError(`${ctx} requires a UUID string value`);
      return v;
    case 'date':
      if (typeof v !== 'string' || Number.isNaN(Date.parse(v))) throw new FilterBuildError(`${ctx} requires a valid date string value`);
      return v;
    default:
      if (typeof v !== 'string') throw new FilterBuildError(`${ctx} requires a string value`);
      return v;
  }
}

function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export function buildFilterClause(
  entity: SearchEntity,
  tree: unknown,
  startParamIndex = 1
): FilterClause {
  const cfg = searchConfig[entity];
  if (!cfg) throw new FilterBuildError(`Unknown search entity: ${String(entity)}`);
  if (!Number.isInteger(startParamIndex) || startParamIndex < 1) {
    throw new FilterBuildError('startParamIndex must be a positive integer');
  }
  const parsed = filterTreeSchema.safeParse(tree);
  if (!parsed.success) {
    throw new FilterBuildError(`Invalid filter tree: ${parsed.error.issues.map((i) => i.message).join('; ')}`);
  }
  const fieldMap = new Map(cfg.filterFields.map((f) => [f.column, f.type]));
  const params: unknown[] = [];
  let count = 0;

  const add = (v: unknown): string => {
    params.push(v);
    return `$${startParamIndex + params.length - 1}`;
  };

  const buildCondition = (c: FilterCondition): string => {
    count++;
    if (count > MAX_FILTER_CONDITIONS) {
      throw new FilterBuildError(`Filter has more than ${MAX_FILTER_CONDITIONS} conditions`);
    }
    const type = fieldMap.get(c.field);
    if (!type) {
      throw new FilterBuildError(`Field '${c.field}' is not filterable for ${entity}`);
    }
    const col = `${cfg.alias}.${c.field}`; // column from whitelist only
    const ctx = `Operator '${c.operator}' on field '${c.field}'`;
    const v = c.value;
    switch (c.operator) {
      case 'isnull':
      case 'notnull':
        if (v !== undefined && v !== null) throw new FilterBuildError(`${ctx} does not take a value`);
        return `${col} IS ${c.operator === 'isnull' ? '' : 'NOT '}NULL`;
      case 'eq':
      case 'ne': {
        if (Array.isArray(v) || v === undefined || v === null) throw new FilterBuildError(`${ctx} requires a single scalar value`);
        return `${col} ${c.operator === 'eq' ? '=' : '<>'} ${add(checkScalar(type, v, ctx))}`;
      }
      case 'gt':
      case 'gte':
      case 'lt':
      case 'lte': {
        if (type !== 'date' && type !== 'text') throw new FilterBuildError(`${ctx} is not supported for ${type} fields`);
        if (Array.isArray(v) || v === undefined || v === null) throw new FilterBuildError(`${ctx} requires a single scalar value`);
        const sym = { gt: '>', gte: '>=', lt: '<', lte: '<=' }[c.operator];
        return `${col} ${sym} ${add(checkScalar(type, v, ctx))}`;
      }
      case 'in':
      case 'nin': {
        if (!Array.isArray(v) || v.length === 0) throw new FilterBuildError(`${ctx} requires a non-empty array value`);
        const vals = v.map((x) => checkScalar(type, x, ctx));
        return `${col} ${c.operator === 'in' ? '= ANY' : '<> ALL'}(${add(vals)})`;
      }
      case 'between': {
        if (type !== 'date') throw new FilterBuildError(`${ctx} is only supported for date fields`);
        if (!Array.isArray(v) || v.length !== 2) throw new FilterBuildError(`${ctx} requires an array of exactly two values`);
        const a = add(checkScalar(type, v[0], ctx));
        const b = add(checkScalar(type, v[1], ctx));
        return `${col} BETWEEN ${a} AND ${b}`;
      }
      case 'contains': {
        if (type !== 'text' && type !== 'enum') throw new FilterBuildError(`${ctx} is only supported for text fields`);
        if (typeof v !== 'string' || v.length === 0) throw new FilterBuildError(`${ctx} requires a non-empty string value`);
        return `${col} ILIKE ${add(`%${escapeLike(v)}%`)}`;
      }
    }
  };

  const buildNode = (n: FilterCondition | FilterGroup, depth: number): string => {
    if (!isGroup(n)) return buildCondition(n);
    if (depth > MAX_FILTER_DEPTH) {
      throw new FilterBuildError(`Filter tree is deeper than ${MAX_FILTER_DEPTH} levels`);
    }
    if (n.conditions.length === 0) throw new FilterBuildError('Filter group must contain at least one condition');
    const parts = n.conditions.map((c) => buildNode(c, depth + 1));
    return `(${parts.join(n.op === 'and' ? ' AND ' : ' OR ')})`;
  };

  const sql = buildNode(parsed.data, 1);
  return { sql, params };
}

export interface RankedMatchFragment {
  /** WHERE predicate; references the query text at the given param index */
  where: string;
  /** ORDER BY expression (descending rank) */
  orderBy: string;
}

/** Ranked full-text fragments. The query text must be bound at $paramIndex. */
export function buildRankedMatchSql(entity: SearchEntity, paramIndex: number): RankedMatchFragment {
  const cfg = searchConfig[entity];
  if (!cfg) throw new FilterBuildError(`Unknown search entity: ${String(entity)}`);
  if (!Number.isInteger(paramIndex) || paramIndex < 1) {
    throw new FilterBuildError('paramIndex must be a positive integer');
  }
  const q = `websearch_to_tsquery('english', $${paramIndex})`;
  return {
    where: `(${cfg.tsvector}) @@ ${q}`,
    orderBy: `ts_rank_cd((${cfg.tsvector}), ${q}) DESC`,
  };
}
