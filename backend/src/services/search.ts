import { pool } from '../config/database.js';
import { tenantService } from './tenant.js';
import { BadRequestError } from '../utils/errors.js';

/**
 * Full-text search over issues, problems, changes and requests using
 * PostgreSQL websearch_to_tsquery with ts_rank relevance ordering.
 * All user input is passed as bind parameters; only allowlisted identifiers
 * are ever placed into SQL text.
 */

export type SearchEntity = 'issues' | 'problems' | 'changes' | 'requests';

interface EntityConfig {
  table: string;
  numberColumn: string;
  titleExpr: string;
  bodyExpr: string;
  vector: string;
  fields: Record<string, string>;
  facets: string[];
}

// Weighted vectors: these expressions match the GIN indexes in migration 037.
const DOC_VECTOR =
  "(setweight(to_tsvector('english', coalesce(t.title, '')), 'A') || setweight(to_tsvector('english', coalesce(t.description, '')), 'B'))";
const REQUEST_VECTOR =
  "(setweight(to_tsvector('english', coalesce(t.request_number, '')), 'A') || setweight(to_tsvector('english', coalesce(t.notes, '')), 'B'))";

export const ENTITY_CONFIG: Record<SearchEntity, EntityConfig> = {
  issues: {
    table: 'issues',
    numberColumn: 'issue_number',
    titleExpr: 't.title',
    bodyExpr: "coalesce(t.description, '')",
    vector: DOC_VECTOR,
    fields: { status: 't.status', priority: 't.priority', category: 't.category_id', assigned_to: 't.assigned_to', created_at: 't.created_at' },
    facets: ['status', 'priority', 'category'],
  },
  problems: {
    table: 'problems',
    numberColumn: 'problem_number',
    titleExpr: 't.title',
    bodyExpr: "coalesce(t.description, '')",
    vector: DOC_VECTOR,
    fields: { status: 't.status', priority: 't.priority', category: 't.category_id', assigned_to: 't.assigned_to', created_at: 't.created_at' },
    facets: ['status', 'priority', 'category'],
  },
  changes: {
    table: 'change_requests',
    numberColumn: 'change_number',
    titleExpr: 't.title',
    bodyExpr: "coalesce(t.description, '')",
    vector: DOC_VECTOR,
    fields: { status: 't.status', type: 't.type', category: 't.category', risk_level: 't.risk_level', created_at: 't.created_at' },
    facets: ['status', 'type', 'category'],
  },
  requests: {
    table: 'service_requests',
    numberColumn: 'request_number',
    titleExpr: 't.request_number',
    bodyExpr: "coalesce(t.notes, '')",
    vector: REQUEST_VECTOR,
    fields: { status: 't.status', priority: 't.priority', created_at: 't.created_at' },
    facets: ['status', 'priority'],
  },
};

export const MAX_LIMIT = 100;
export const DEFAULT_LIMIT = 25;

export type FilterOperator = 'eq' | 'neq' | 'in' | 'gt' | 'gte' | 'lt' | 'lte';

export interface FilterCondition {
  field: string;
  op: FilterOperator;
  value: string | number | Array<string | number>;
}

export interface FilterGroup {
  logic: 'AND' | 'OR';
  conditions: Array<FilterCondition | FilterGroup>;
}

export interface BuiltFilter {
  sql: string;
  params: unknown[];
}

const OPERATORS: Record<Exclude<FilterOperator, 'in'>, string> = {
  eq: '=',
  neq: '<>',
  gt: '>',
  gte: '>=',
  lt: '<',
  lte: '<=',
};

const MAX_DEPTH = 5;

function isGroup(node: FilterCondition | FilterGroup): node is FilterGroup {
  return (node as FilterGroup).conditions !== undefined;
}

/**
 * Build a parameterized WHERE fragment from a nested AND/OR filter tree.
 * Field names are mapped through the entity allowlist; values become $n params.
 * `startIndex` is the next free placeholder number.
 */
export function buildFilterQuery(
  group: FilterGroup | undefined,
  fields: Record<string, string>,
  startIndex = 1,
  depth = 0
): BuiltFilter {
  if (!group || group.conditions.length === 0) return { sql: '', params: [] };
  if (depth > MAX_DEPTH) throw new BadRequestError('Filter nesting too deep');
  if (group.logic !== 'AND' && group.logic !== 'OR') {
    throw new BadRequestError('Filter logic must be AND or OR');
  }

  const params: unknown[] = [];
  const parts: string[] = [];

  for (const node of group.conditions) {
    if (isGroup(node)) {
      const nested = buildFilterQuery(node, fields, startIndex + params.length, depth + 1);
      if (nested.sql) {
        parts.push(nested.sql);
        params.push(...nested.params);
      }
      continue;
    }
    const column = fields[node.field];
    if (!column) throw new BadRequestError('Unknown filter field: ' + node.field);
    if (node.op === 'in') {
      if (!Array.isArray(node.value) || node.value.length === 0) {
        throw new BadRequestError('Operator "in" requires a non-empty array');
      }
      params.push(node.value.map(String));
      parts.push(column + '::text = ANY($' + (startIndex + params.length - 1) + '::text[])');
      continue;
    }
    const sqlOp = OPERATORS[node.op];
    if (!sqlOp) throw new BadRequestError('Unknown filter operator');
    if (Array.isArray(node.value)) throw new BadRequestError('Array value requires operator "in"');
    params.push(node.value);
    parts.push(column + ' ' + sqlOp + ' $' + (startIndex + params.length - 1));
  }

  if (parts.length === 0) return { sql: '', params: [] };
  const joiner = group.logic === 'OR' ? ' OR ' : ' AND ';
  return { sql: '(' + parts.join(joiner) + ')', params };
}

export interface SearchParams {
  entity: SearchEntity;
  q?: string;
  filters?: FilterGroup;
  limit?: number;
  offset?: number;
}

export interface SearchResult {
  id: string;
  number: string;
  title: string;
  snippet: string | null;
  status: string | null;
  rank: number;
  created_at: string;
}

export interface FacetBucket {
  value: string | null;
  count: number;
}

function getConfig(entity: SearchEntity): EntityConfig {
  const config = ENTITY_CONFIG[entity];
  if (!config) throw new BadRequestError('Unknown search entity');
  return config;
}

function clampLimit(limit?: number): number {
  if (!limit || limit < 1) return DEFAULT_LIMIT;
  return Math.min(limit, MAX_LIMIT);
}

/** Builds the shared WHERE clause (text match + filters). */
function buildWhere(config: EntityConfig, params: SearchParams): { where: string; values: unknown[]; hasText: boolean } {
  const values: unknown[] = [];
  const clauses: string[] = [];
  const text = params.q?.trim();
  const hasText = !!text;
  if (hasText) {
    values.push(text);
    clauses.push(config.vector + " @@ websearch_to_tsquery('english', $1)");
  }
  const built = buildFilterQuery(params.filters, config.fields, values.length + 1);
  if (built.sql) {
    clauses.push(built.sql);
    values.push(...built.params);
  }
  return { where: clauses.length ? 'WHERE ' + clauses.join(' AND ') : '', values, hasText };
}

export const searchService = {
  async search(tenantSlug: string, params: SearchParams): Promise<{ data: SearchResult[]; total: number; limit: number; offset: number }> {
    const config = getConfig(params.entity);
    const schema = tenantService.getSchemaName(tenantSlug);
    const limit = clampLimit(params.limit);
    const offset = Math.max(0, params.offset ?? 0);
    const { where, values, hasText } = buildWhere(config, params);

    const rankExpr = hasText ? "ts_rank(" + config.vector + ", websearch_to_tsquery('english', $1))" : '0';
    const snippetExpr = hasText
      ? "ts_headline('english', " + config.bodyExpr + ", websearch_to_tsquery('english', $1), 'MaxFragments=2, MaxWords=20, MinWords=5')"
      : 'NULL';

    const limitIdx = values.length + 1;
    const sql = `
      SELECT t.id, t.${config.numberColumn} AS number, ${config.titleExpr} AS title,
             ${snippetExpr} AS snippet, t.status, ${rankExpr} AS rank, t.created_at
      FROM ${schema}.${config.table} t
      ${where}
      ORDER BY rank DESC, t.created_at DESC, t.id DESC
      LIMIT $${limitIdx} OFFSET $${limitIdx + 1}
    `;
    const countSql = `SELECT COUNT(*)::int AS total FROM ${schema}.${config.table} t ${where}`;

    const [rows, count] = await Promise.all([
      pool.query(sql, [...values, limit, offset]),
      pool.query(countSql, values),
    ]);

    return {
      data: rows.rows.map((r) => ({ ...r, rank: Number(r.rank) })),
      total: count.rows[0]?.total ?? 0,
      limit,
      offset,
    };
  },

  /** Facet counts per dimension (GROUP BY), honoring the same text and filters. */
  async facets(tenantSlug: string, params: SearchParams): Promise<Record<string, FacetBucket[]>> {
    const config = getConfig(params.entity);
    const schema = tenantService.getSchemaName(tenantSlug);
    const { where, values } = buildWhere(config, params);

    const result: Record<string, FacetBucket[]> = {};
    await Promise.all(
      config.facets.map(async (facet) => {
        const column = config.fields[facet];
        const res = await pool.query(
          `SELECT ${column}::text AS value, COUNT(*)::int AS count
           FROM ${schema}.${config.table} t
           ${where}
           GROUP BY ${column}
           ORDER BY count DESC
           LIMIT 50`,
          values
        );
        result[facet] = res.rows.map((r) => ({ value: r.value, count: Number(r.count) }));
      })
    );
    return result;
  },
};
