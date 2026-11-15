import { ValidationError } from '../utils/errors.js';

/** Shared tsvector expression: used by migration 037 (GIN index) and by queries so the index is usable. */
export const SEARCH_TSVECTOR_EXPR =
  "to_tsvector('english', coalesce(title,'') || ' ' || coalesce(description,''))";

export type SearchEntity = 'issues' | 'problems';

export const MAX_FILTER_DEPTH = 3;

export type FilterOp = 'eq' | 'neq' | 'in' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'is_null';
const FILTER_OPS: FilterOp[] = ['eq', 'neq', 'in', 'gt', 'gte', 'lt', 'lte', 'contains', 'is_null'];

export interface FilterCondition {
  field: string;
  op: FilterOp;
  value?: unknown;
}
export interface FilterGroup {
  logic?: 'AND' | 'OR';
  conditions: Array<FilterCondition | FilterGroup>;
}

export const ENTITY_FIELDS: Record<SearchEntity, string[]> = {
  issues: [
    'issue_number', 'title', 'description', 'status', 'priority', 'severity', 'impact', 'urgency',
    'category_id', 'issue_type', 'source', 'application_id', 'environment_id', 'reporter_id',
    'assigned_to', 'assigned_group', 'sla_breached', 'created_at', 'updated_at', 'resolved_at', 'closed_at',
  ],
  problems: [
    'problem_number', 'title', 'description', 'status', 'priority', 'impact', 'urgency',
    'category_id', 'problem_type', 'application_id', 'reporter_id', 'assigned_to', 'assigned_group',
    'is_known_error', 'has_workaround', 'created_at', 'updated_at',
  ],
};

export interface ParsedSearchQuery {
  /** Input for websearch_to_tsquery($n, ...) - always bound as a parameter. */
  tsquery: string;
  isEmpty: boolean;
}

/**
 * Turn user text into websearch_to_tsquery input.
 * Supports "quoted phrases", -exclusion, OR and trailing-star prefix (word*).
 * websearch_to_tsquery has no prefix syntax, so the star is kept in `tsquery`
 * only for callers that want it; use {@link toWebsearchInput} for the bound value.
 * Everything else that is not a letter/digit is stripped, so the result is safe to bind.
 */
export function parseSearchQuery(input: string | undefined | null): ParsedSearchQuery {
  const text = (input ?? '').trim();
  if (!text) return { tsquery: '', isEmpty: true };
  const tokens: string[] = [];
  const re = /(-?"[^"]*"?)|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const raw = m[0];
    if (raw === 'OR' || raw === 'or') {
      tokens.push('or');
      continue;
    }
    const neg = raw.startsWith('-');
    let body = neg ? raw.slice(1) : raw;
    if (body.startsWith('"')) {
      const inner = body.replace(/"/g, '').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
      if (inner) tokens.push(`${neg ? '-' : ''}"${inner}"`);
      continue;
    }
    const prefix = body.endsWith('*');
    body = body.replace(/[^\p{L}\p{N}_]/gu, '');
    if (!body) continue;
    tokens.push(`${neg ? '-' : ''}${body}${prefix ? '*' : ''}`);
  }
  while (tokens.length && tokens[tokens.length - 1] === 'or') tokens.pop();
  while (tokens.length && tokens[0] === 'or') tokens.shift();
  return { tsquery: tokens.join(' '), isEmpty: tokens.length === 0 };
}

/** websearch_to_tsquery expression with the text bound as parameter $paramIndex. */
export function buildTsQueryExpr(paramIndex: number): string {
  return `websearch_to_tsquery('english', $${paramIndex})`;
}

/** Bound value for websearch_to_tsquery (prefix stars removed; websearch has no prefix syntax). */
export function toWebsearchInput(parsed: ParsedSearchQuery): string {
  return parsed.tsquery.replace(/\*/g, '');
}

function isGroup(n: FilterCondition | FilterGroup): n is FilterGroup {
  return Array.isArray((n as FilterGroup).conditions);
}

export interface FilterClause {
  sql: string;
  values: unknown[];
}

/**
 * Build a parameterized WHERE fragment. Placeholders start at startIndex+1.
 * Columns are prefixed with `alias.` when alias is given.
 */
export function buildFilterClause(
  entity: SearchEntity,
  group: FilterGroup | undefined | null,
  startIndex = 0,
  alias = ''
): FilterClause {
  const allowed = ENTITY_FIELDS[entity];
  if (!allowed) throw new ValidationError({ entity: ['Unknown entity'] });
  if (!group) return { sql: '', values: [] };
  const values: unknown[] = [];
  const prefix = alias ? `${alias}.` : '';

  const walk = (node: FilterCondition | FilterGroup, depth: number): string => {
    if (isGroup(node)) {
      if (depth > MAX_FILTER_DEPTH) {
        throw new ValidationError({ filters: [`Filter nesting deeper than ${MAX_FILTER_DEPTH}`] });
      }
      const logic = node.logic === undefined ? 'AND' : String(node.logic).toUpperCase();
      if (logic !== 'AND' && logic !== 'OR') {
        throw new ValidationError({ filters: ['Unknown group logic'] });
      }
      const parts = node.conditions.map((c) => walk(c, depth + 1)).filter(Boolean);
      if (parts.length === 0) return '';
      return `(${parts.join(` ${logic} `)})`;
    }
    if (!allowed.includes(node.field)) {
      throw new ValidationError({ filters: [`Unknown filter field: ${String(node.field)}`] });
    }
    if (!FILTER_OPS.includes(node.op)) {
      throw new ValidationError({ filters: [`Unknown filter op: ${String(node.op)}`] });
    }
    const col = `${prefix}${node.field}`;
    const bind = (v: unknown): string => {
      values.push(v);
      return `$${startIndex + values.length}`;
    };
    switch (node.op) {
      case 'eq': return `${col} = ${bind(node.value)}`;
      case 'neq': return `${col} IS DISTINCT FROM ${bind(node.value)}`;
      case 'gt': return `${col} > ${bind(node.value)}`;
      case 'gte': return `${col} >= ${bind(node.value)}`;
      case 'lt': return `${col} < ${bind(node.value)}`;
      case 'lte': return `${col} <= ${bind(node.value)}`;
      case 'in': {
        if (!Array.isArray(node.value) || node.value.length === 0) {
          throw new ValidationError({ filters: ['"in" requires a non-empty array'] });
        }
        return `${col} = ANY(${bind(node.value)})`;
      }
      case 'contains': {
        const s = String(node.value ?? '').replace(/[\\%_]/g, (c) => `\\${c}`);
        return `${col}::text ILIKE ${bind(`%${s}%`)}`;
      }
      case 'is_null':
        return node.value === false ? `${col} IS NOT NULL` : `${col} IS NULL`;
    }
  };

  const sql = walk(group, 1);
  return { sql, values };
}
