import { pool } from '../config/database.js';
import { tenantService } from './tenant.js';
import {
  SEARCH_TSVECTOR_EXPR,
  buildFilterClause,
  buildTsQueryExpr,
  parseSearchQuery,
  toWebsearchInput,
  type FilterGroup,
  type SearchEntity,
} from '../lib/search-query.js';

export const MAX_PER_PAGE = 100;

export interface SearchParams {
  q?: string;
  entity?: SearchEntity;
  filters?: FilterGroup;
  page?: number;
  perPage?: number;
}

export interface SearchResult {
  results: Array<Record<string, unknown> & { rank: number }>;
  total: number;
}

export type Facets = Record<string, Array<{ value: string | null; count: number }>>;

const FACET_FIELDS: Record<SearchEntity, string[]> = {
  issues: ['status', 'priority', 'severity', 'assigned_group'],
  problems: ['status', 'priority', 'assigned_group'], // problems have no severity column
};

function buildWhere(schemaEntity: SearchEntity, q: string | undefined, filters: FilterGroup | undefined) {
  const parsed = parseSearchQuery(q);
  const values: unknown[] = [];
  const conds: string[] = [];
  let rankExpr = '0::real';
  if (!parsed.isEmpty) {
    values.push(toWebsearchInput(parsed));
    const tsq = buildTsQueryExpr(values.length);
    conds.push(`${SEARCH_TSVECTOR_EXPR} @@ ${tsq}`);
    rankExpr = `ts_rank(${SEARCH_TSVECTOR_EXPR}, ${tsq})`;
  }
  const fc = buildFilterClause(schemaEntity, filters, values.length);
  if (fc.sql) {
    conds.push(fc.sql);
    values.push(...fc.values);
  }
  return { where: conds.length ? `WHERE ${conds.join(' AND ')}` : '', values, rankExpr };
}

export async function search(tenantSlug: string, params: SearchParams): Promise<SearchResult> {
  const entity: SearchEntity = params.entity ?? 'issues';
  const schema = tenantService.getSchemaName(tenantSlug);
  const perPage = Math.min(Math.max(Math.floor(params.perPage ?? 20), 1), MAX_PER_PAGE);
  const page = Math.max(Math.floor(params.page ?? 1), 1);
  const offset = (page - 1) * perPage;
  const { where, values, rankExpr } = buildWhere(entity, params.q, params.filters);

  const countResult = await pool.query(`SELECT COUNT(*) FROM ${schema}.${entity} ${where}`, values);
  const total = parseInt(countResult.rows[0].count, 10);

  const result = await pool.query(
    `SELECT *, ${rankExpr} AS rank
     FROM ${schema}.${entity}
     ${where}
     ORDER BY rank DESC, created_at DESC
     LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, perPage, offset]
  );
  return { results: result.rows, total };
}

export async function getFacets(
  tenantSlug: string,
  params: Pick<SearchParams, 'q' | 'entity' | 'filters'>
): Promise<Facets> {
  const entity: SearchEntity = params.entity ?? 'issues';
  const schema = tenantService.getSchemaName(tenantSlug);
  const { where, values } = buildWhere(entity, params.q, params.filters);
  const facets: Facets = {};
  for (const field of FACET_FIELDS[entity]) {
    const r = await pool.query(
      `SELECT ${field} AS value, COUNT(*) AS count FROM ${schema}.${entity} ${where} GROUP BY ${field} ORDER BY count DESC`,
      values
    );
    facets[field] = r.rows.map((row: { value: string | null; count: string }) => ({
      value: row.value,
      count: parseInt(row.count, 10),
    }));
  }
  return facets;
}
