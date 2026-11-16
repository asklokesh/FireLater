/**
 * Advanced filter query builder.
 *
 * Filters are a tree of AND/OR groups whose leaves are field conditions.
 * Field names are resolved through the entity whitelist in entities.ts and all
 * values are bound as parameters, so no user input is ever interpolated into
 * SQL.
 */
import { z } from 'zod';
import { BadRequestError } from '../../utils/errors.js';
import { ALL_SEARCH_FIELDS, type SearchEntityDef, type SearchFieldDef } from './entities.js';

export const FILTER_OPERATORS = [
  'eq',
  'neq',
  'in',
  'nin',
  'gt',
  'gte',
  'lt',
  'lte',
  'contains',
  'is_null',
  'not_null',
] as const;

export type FilterOperator = (typeof FILTER_OPERATORS)[number];

export type FilterValue = string | number | boolean | null;

export interface FilterCondition {
  field: string;
  operator: FilterOperator;
  value?: FilterValue | FilterValue[];
}

export interface FilterGroup {
  op: 'and' | 'or';
  conditions: Array<FilterCondition | FilterGroup>;
}

export const MAX_FILTER_DEPTH = 4;
export const MAX_FILTER_CONDITIONS = 50;
const MAX_IN_VALUES = 50;
const MAX_VALUE_LENGTH = 200;

const filterValueSchema = z.union([z.string().max(MAX_VALUE_LENGTH), z.number(), z.boolean(), z.null()]);

export const filterConditionSchema = z.object({
  field: z.string().min(1).max(50),
  operator: z.enum(FILTER_OPERATORS),
  value: z.union([filterValueSchema, z.array(filterValueSchema).max(MAX_IN_VALUES)]).optional(),
});

export const filterGroupSchema: z.ZodType<FilterGroup> = z.lazy(() =>
  z.object({
    op: z.enum(['and', 'or']),
    conditions: z.array(z.union([filterConditionSchema, filterGroupSchema])).max(MAX_FILTER_CONDITIONS),
  })
);

export function isFilterGroup(node: FilterCondition | FilterGroup): node is FilterGroup {
  return (node as FilterGroup).op !== undefined && Array.isArray((node as FilterGroup).conditions);
}

/**
 * Structural validation beyond the zod shape: depth, total size and that every
 * field is known to at least one entity. Throws BadRequestError.
 */
export function validateFilterTree(group: FilterGroup): void {
  let count = 0;
  const walk = (node: FilterGroup, depth: number) => {
    if (depth > MAX_FILTER_DEPTH) {
      throw new BadRequestError(`Filter nesting exceeds maximum depth of ${MAX_FILTER_DEPTH}`);
    }
    for (const child of node.conditions) {
      if (isFilterGroup(child)) {
        walk(child, depth + 1);
      } else {
        count++;
        if (!ALL_SEARCH_FIELDS.has(child.field)) {
          throw new BadRequestError(`Unknown filter field: ${child.field}`);
        }
      }
    }
  };
  walk(group, 1);
  if (count > MAX_FILTER_CONDITIONS) {
    throw new BadRequestError(`Filter has more than ${MAX_FILTER_CONDITIONS} conditions`);
  }
}

/** Collects positional parameters shared across one SQL statement. */
export class SqlParams {
  readonly values: unknown[] = [];

  add(value: unknown): string {
    this.values.push(value);
    return `$${this.values.length}`;
  }
}

export interface FilterContext {
  /** Substituted for the value "me" on uuid fields */
  userId: string;
  now?: Date;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RELATIVE_RE = /^(\d{1,4})([hdwmy])$/i;
const RELATIVE_MS: Record<string, number> = {
  h: 3_600_000,
  d: 86_400_000,
  w: 7 * 86_400_000,
  m: 30 * 86_400_000,
  y: 365 * 86_400_000,
};

/**
 * Parses a date filter value. Accepts ISO dates/datetimes or a relative age
 * such as "7d" (7 days ago), "12h", "2w", "3m" (30 day months) or "1y".
 */
export function parseDateValue(raw: FilterValue, now: Date = new Date()): string {
  if (typeof raw !== 'string' && typeof raw !== 'number') {
    throw new BadRequestError('Date filters require a date value');
  }
  const value = String(raw).trim();
  const rel = RELATIVE_RE.exec(value);
  if (rel) {
    const amount = parseInt(rel[1], 10);
    const unit = rel[2].toLowerCase();
    return new Date(now.getTime() - amount * RELATIVE_MS[unit]).toISOString();
  }
  if (!/^\d{4}-\d{2}-\d{2}([T ][\d:.]+(Z|[+-]\d{2}:?\d{2})?)?$/.test(value)) {
    throw new BadRequestError(`Invalid date value: ${value}`);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestError(`Invalid date value: ${value}`);
  }
  return parsed.toISOString();
}

function coerceValue(def: SearchFieldDef, field: string, raw: FilterValue, ctx: FilterContext): unknown {
  switch (def.type) {
    case 'uuid': {
      const value = String(raw ?? '').trim();
      if (value.toLowerCase() === 'me') return ctx.userId;
      if (!UUID_RE.test(value)) throw new BadRequestError(`Field ${field} expects a UUID or "me"`);
      return value;
    }
    case 'boolean': {
      if (typeof raw === 'boolean') return raw;
      const value = String(raw ?? '').trim().toLowerCase();
      if (['true', 'yes', '1'].includes(value)) return true;
      if (['false', 'no', '0'].includes(value)) return false;
      throw new BadRequestError(`Field ${field} expects true or false`);
    }
    case 'date':
      return parseDateValue(raw, ctx.now);
    case 'text':
    default: {
      if (raw === null || raw === undefined) throw new BadRequestError(`Field ${field} requires a value`);
      const value = String(raw);
      if (value.length > MAX_VALUE_LENGTH) throw new BadRequestError(`Value for ${field} is too long`);
      return value;
    }
  }
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

const OPERATORS_BY_TYPE: Record<SearchFieldDef['type'], ReadonlySet<FilterOperator>> = {
  text: new Set<FilterOperator>(['eq', 'neq', 'in', 'nin', 'contains', 'is_null', 'not_null']),
  uuid: new Set<FilterOperator>(['eq', 'neq', 'in', 'nin', 'is_null', 'not_null']),
  boolean: new Set<FilterOperator>(['eq', 'neq']),
  date: new Set<FilterOperator>(['eq', 'gt', 'gte', 'lt', 'lte', 'is_null', 'not_null']),
};

const COMPARATORS: Partial<Record<FilterOperator, string>> = {
  gt: '>',
  gte: '>=',
  lt: '<',
  lte: '<=',
};

function asArray(value: FilterCondition['value']): FilterValue[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

export function buildConditionSql(
  cond: FilterCondition,
  entity: SearchEntityDef,
  alias: string,
  params: SqlParams,
  ctx: FilterContext
): string {
  const def = entity.fields[cond.field];
  if (!def) {
    // The entity has no such attribute. Only "is empty" can be true for it.
    return cond.operator === 'is_null' ? 'TRUE' : 'FALSE';
  }
  if (!OPERATORS_BY_TYPE[def.type].has(cond.operator)) {
    throw new BadRequestError(`Operator ${cond.operator} is not supported for field ${cond.field}`);
  }

  const col = `${alias}.${def.column}`;
  const sqlType = def.type === 'uuid' ? 'uuid' : def.type === 'date' ? 'timestamptz' : def.type === 'boolean' ? 'boolean' : 'text';

  switch (cond.operator) {
    case 'is_null':
      return `${col} IS NULL`;
    case 'not_null':
      return `${col} IS NOT NULL`;
    case 'eq': {
      const [raw] = asArray(cond.value);
      const value = coerceValue(def, cond.field, raw ?? null, ctx);
      if (def.type === 'date') {
        const p = params.add(value);
        return `(${col} >= date_trunc('day', ${p}::timestamptz) AND ${col} < date_trunc('day', ${p}::timestamptz) + interval '1 day')`;
      }
      return `${col} = ${params.add(value)}::${sqlType}`;
    }
    case 'neq': {
      const [raw] = asArray(cond.value);
      const value = coerceValue(def, cond.field, raw ?? null, ctx);
      return `${col} IS DISTINCT FROM ${params.add(value)}::${sqlType}`;
    }
    case 'in':
    case 'nin': {
      const values = asArray(cond.value).map((v) => coerceValue(def, cond.field, v, ctx));
      if (values.length === 0) throw new BadRequestError(`Operator ${cond.operator} requires at least one value`);
      const p = params.add(values);
      return cond.operator === 'in'
        ? `${col} = ANY(${p}::${sqlType}[])`
        : `(${col} IS NULL OR NOT (${col} = ANY(${p}::${sqlType}[])))`;
    }
    case 'contains': {
      const [raw] = asArray(cond.value);
      const value = coerceValue(def, cond.field, raw ?? null, ctx) as string;
      return `${col} ILIKE ${params.add(`%${escapeLike(value)}%`)}`;
    }
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte': {
      const [raw] = asArray(cond.value);
      const value = coerceValue(def, cond.field, raw ?? null, ctx);
      return `${col} ${COMPARATORS[cond.operator]} ${params.add(value)}::${sqlType}`;
    }
    default:
      throw new BadRequestError(`Unsupported operator: ${String(cond.operator)}`);
  }
}

/** Builds a SQL boolean expression for a filter tree against one entity. */
export function buildFilterSql(
  group: FilterGroup,
  entity: SearchEntityDef,
  alias: string,
  params: SqlParams,
  ctx: FilterContext
): string {
  const parts = group.conditions.map((node) =>
    isFilterGroup(node)
      ? buildFilterSql(node, entity, alias, params, ctx)
      : buildConditionSql(node, entity, alias, params, ctx)
  );
  if (parts.length === 0) return 'TRUE';
  const joiner = group.op === 'or' ? ' OR ' : ' AND ';
  return `(${parts.join(joiner)})`;
}

/** Combines parsed query conditions with an explicit filter tree (AND). */
export function mergeFilters(conditions: FilterCondition[], tree?: FilterGroup | null): FilterGroup {
  const merged: FilterGroup = { op: 'and', conditions: [...conditions] };
  if (tree && tree.conditions.length > 0) merged.conditions.push(tree);
  return merged;
}
