import { pool } from '../config/database.js';
import { tenantService } from './tenant.js';
import { z } from 'zod';
import { BadRequestError } from '../utils/errors.js';
import { cacheService } from '../utils/cache.js';
import { getOffset } from '../utils/pagination.js';
import type { PaginationParams } from '../types/index.js';

const MAX_QUERY_LENGTH = 200;
const MAX_DEPTH = 4;
const MAX_CONDITIONS = 50;
const MAX_IN_VALUES = 100;

export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Turn user text into a websearch_to_tsquery input. Supports "quoted phrases",
 * OR and -exclusion. Unparseable fragments (unbalanced quotes, dangling
 * operators, control characters) are neutralized. Returns null when nothing
 * searchable remains.
 */
export function parseSearchQuery(input: string): string | null {
  if (typeof input !== 'string') return null;
  // eslint-disable-next-line no-control-regex
  let text = input.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, MAX_QUERY_LENGTH);

  // Drop an unmatched trailing quote so the phrase parser stays balanced
  if ((text.match(/"/g) || []).length % 2 === 1) {
    const idx = text.lastIndexOf('"');
    text = text.slice(0, idx) + text.slice(idx + 1);
  }

  const tokens: string[] = [];
  const re = /(-?"[^"]*")|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    let tok = m[0];
    if (m[1]) {
      const negative = tok.startsWith('-');
      const inner = tok.slice(negative ? 2 : 1, -1).trim();
      if (!inner) continue;
      tokens.push(`${negative ? '-' : ''}"${inner}"`);
      continue;
    }
    if (tok.toUpperCase() === 'OR') {
      tokens.push('OR');
      continue;
    }
    const negative = tok.startsWith('-');
    tok = tok.replace(/^-+/, '').replace(/["]/g, '');
    if (!tok || !/[\p{L}\p{N}]/u.test(tok)) continue;
    tokens.push(negative ? `-${tok}` : tok);
  }

  // Remove leading/trailing/duplicate OR
  const cleaned: string[] = [];
  for (const t of tokens) {
    if (t === 'OR' && (cleaned.length === 0 || cleaned[cleaned.length - 1] === 'OR')) continue;
    cleaned.push(t);
  }
  while (cleaned.length && cleaned[cleaned.length - 1] === 'OR') cleaned.pop();

  if (!cleaned.some((t) => t !== 'OR')) return null;
  return cleaned.join(' ');
}

// ---------------------------------------------------------------------------
// Advanced filter builder
// ---------------------------------------------------------------------------

type FieldType = 'string' | 'uuid' | 'boolean' | 'date';

export const FILTER_FIELDS: Record<string, FieldType> = {
  status: 'string',
  priority: 'string',
  severity: 'string',
  assigned_to: 'uuid',
  assigned_group: 'uuid',
  application_id: 'uuid',
  reporter_id: 'uuid',
  sla_breached: 'boolean',
  created_at: 'date',
  updated_at: 'date',
};

export const FILTER_OPERATORS = ['eq', 'in', 'neq', 'gte', 'lte'] as const;
export type FilterOperator = (typeof FILTER_OPERATORS)[number];

export interface FilterCondition {
  field: string;
  op: FilterOperator;
  value: unknown;
}

export interface FilterGroup {
  op: 'and' | 'or';
  conditions: Array<FilterCondition | FilterGroup>;
}

/** Zod schema for a stored/submitted filter group; also validates fields, operators and values. */
export const filterGroupSchema = z
  .object({
    op: z.enum(['and', 'or']),
    conditions: z.array(z.any()).max(MAX_CONDITIONS),
  })
  .superRefine((val, ctx) => {
    try {
      buildFilterClause(val as FilterGroup);
    } catch (e) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: e instanceof Error ? e.message : 'Invalid filters' });
    }
  });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function coerceValue(field: string, type: FieldType, value: unknown): unknown {
  switch (type) {
    case 'boolean':
      if (typeof value !== 'boolean') throw new BadRequestError(`Filter value for ${field} must be a boolean`);
      return value;
    case 'uuid':
      if (typeof value !== 'string' || !UUID_RE.test(value)) {
        throw new BadRequestError(`Filter value for ${field} must be a UUID`);
      }
      return value;
    case 'date': {
      if (typeof value !== 'string' || Number.isNaN(new Date(value).getTime())) {
        throw new BadRequestError(`Filter value for ${field} must be a valid date`);
      }
      return value;
    }
    default:
      if (typeof value !== 'string' || value.length === 0 || value.length > 100) {
        throw new BadRequestError(`Filter value for ${field} must be a non-empty string`);
      }
      return value;
  }
}

export interface BuiltFilter {
  sql: string;
  values: unknown[];
}

/**
 * Build a parameterized SQL fragment from a nested AND/OR group. Field names
 * are checked against an allowlist; every value is a bind parameter.
 * Placeholder numbering starts at startIndex.
 */
export function buildFilterClause(group: FilterGroup, startIndex = 1, alias = 'i'): BuiltFilter {
  const values: unknown[] = [];
  let count = 0;
  let index = startIndex;

  const buildCondition = (c: FilterCondition): string => {
    if (!c || typeof c !== 'object') throw new BadRequestError('Invalid filter condition');
    if (typeof c.field !== 'string' || !Object.prototype.hasOwnProperty.call(FILTER_FIELDS, c.field)) {
      throw new BadRequestError(`Unknown filter field: ${String(c.field)}`);
    }
    if (!FILTER_OPERATORS.includes(c.op)) {
      throw new BadRequestError(`Unknown filter operator: ${String(c.op)}`);
    }
    const type = FILTER_FIELDS[c.field];
    const col = `${alias}.${c.field}`;
    if ((c.op === 'gte' || c.op === 'lte') && type !== 'date') {
      throw new BadRequestError(`Operator ${c.op} is only supported on date fields`);
    }
    if (c.op === 'in') {
      if (!Array.isArray(c.value) || c.value.length === 0 || c.value.length > MAX_IN_VALUES) {
        throw new BadRequestError(`Operator in requires a non-empty array for ${c.field}`);
      }
      values.push(c.value.map((v) => coerceValue(c.field, type, v)));
      return `${col} = ANY($${index++})`;
    }
    values.push(coerceValue(c.field, type, c.value));
    const sqlOp = { eq: '=', neq: '<>', gte: '>=', lte: '<=' }[c.op];
    return `${col} ${sqlOp} $${index++}`;
  };

  const buildGroup = (g: FilterGroup, depth: number): string => {
    if (!g || typeof g !== 'object' || (g.op !== 'and' && g.op !== 'or') || !Array.isArray(g.conditions)) {
      throw new BadRequestError('Filter group must have op (and|or) and conditions array');
    }
    if (depth > MAX_DEPTH) throw new BadRequestError('Filter nesting too deep');
    const parts = g.conditions.map((child) => {
      if (child && typeof child === 'object' && 'conditions' in child) {
        return buildGroup(child as FilterGroup, depth + 1);
      }
      if (++count > MAX_CONDITIONS) throw new BadRequestError('Too many filter conditions');
      return buildCondition(child as FilterCondition);
    });
    if (parts.length === 0) return 'TRUE';
    return `(${parts.join(g.op === 'and' ? ' AND ' : ' OR ')})`;
  };

  const sql = buildGroup(group, 0);
  return { sql, values };
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export const FACET_FIELDS = ['status', 'priority', 'severity', 'assigned_group', 'application_id'] as const;

export interface FacetValue {
  value: string | null;
  count: number;
}

export interface SearchResult {
  issues: Array<Record<string, unknown> & { rank: number }>;
  total: number;
  facets: Record<(typeof FACET_FIELDS)[number], FacetValue[]>;
}

export interface SearchOptions {
  q?: string;
  filters?: FilterGroup;
}

export const RANK_ORDER_CLAUSE = 'ORDER BY rank DESC, i.created_at DESC';

export class SearchService {
  async search(tenantSlug: string, params: PaginationParams, options: SearchOptions): Promise<SearchResult> {
    const cacheKey = `${tenantSlug}:issues:search:${JSON.stringify({ params, options })}`;

    return cacheService.getOrSet(cacheKey, async () => {
      const schema = tenantService.getSchemaName(tenantSlug);
      const offset = getOffset(params);
      const values: unknown[] = [];
      const conds: string[] = [];
      let rankExpr = '0::real';

      const tsq = options.q ? parseSearchQuery(options.q) : null;
      if (tsq) {
        values.push(tsq);
        const qi = values.length;
        values.push(`${escapeLike(options.q!.trim())}%`);
        const pi = values.length;
        conds.push(`(i.search_vector @@ websearch_to_tsquery('english', $${qi}) OR i.issue_number ILIKE $${pi})`);
        rankExpr = `ts_rank(i.search_vector, websearch_to_tsquery('english', $${qi}))`;
      }
      if (options.filters) {
        const built = buildFilterClause(options.filters, values.length + 1);
        values.push(...built.values);
        conds.push(built.sql);
      }
      const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

      // Facets: one query, all dimensions combined via UNION ALL, same predicate
      const facetSql = FACET_FIELDS.map(
        (f) => `SELECT '${f}' AS facet, i.${f}::text AS value, COUNT(*)::int AS count
                FROM ${schema}.issues i ${where} GROUP BY i.${f}`
      ).join(' UNION ALL ');

      const limitIdx = values.length + 1;
      const [rowsResult, facetResult] = await Promise.all([
        pool.query(
          `SELECT i.*, ${rankExpr} AS rank, COUNT(*) OVER() AS total_count
           FROM ${schema}.issues i
           ${where}
           ${RANK_ORDER_CLAUSE}
           LIMIT $${limitIdx} OFFSET $${limitIdx + 1}`,
          [...values, params.perPage, offset]
        ),
        pool.query(`SELECT * FROM (${facetSql}) f ORDER BY facet, count DESC`, values),
      ]);

      const facets = Object.fromEntries(FACET_FIELDS.map((f) => [f, [] as FacetValue[]])) as SearchResult['facets'];
      for (const row of facetResult.rows) {
        facets[row.facet as (typeof FACET_FIELDS)[number]]?.push({ value: row.value, count: Number(row.count) });
      }

      const total = rowsResult.rows.length ? parseInt(rowsResult.rows[0].total_count, 10) : 0;
      const issues = rowsResult.rows.map(({ total_count: _t, rank, ...rest }) => ({ ...rest, rank: Number(rank) }));
      return { issues, total, facets };
    }, { ttl: 60 });
  }

  async suggest(tenantSlug: string, text: string): Promise<Array<{ id: string; issue_number: string; title: string }>> {
    const trimmed = text.trim().slice(0, MAX_QUERY_LENGTH);
    if (!trimmed) return [];
    const cacheKey = `${tenantSlug}:issues:suggest:${trimmed.toLowerCase()}`;
    return cacheService.getOrSet(cacheKey, async () => {
      const schema = tenantService.getSchemaName(tenantSlug);
      const pattern = `${escapeLike(trimmed)}%`;
      const result = await pool.query(
        `SELECT id, issue_number, title FROM ${schema}.issues
         WHERE issue_number ILIKE $1 OR title ILIKE $1
         ORDER BY created_at DESC
         LIMIT 10`,
        [pattern]
      );
      return result.rows;
    }, { ttl: 60 });
  }
}

export const searchService = new SearchService();
