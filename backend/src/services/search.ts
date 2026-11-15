import { pool } from '../config/database.js';
import { tenantService } from './tenant.js';
import { AppError } from '../utils/errors.js';
import { createPaginatedResponse } from '../utils/pagination.js';
import type { PaginatedResponse } from '../types/index.js';
import {
  ISSUES_TSVECTOR,
  PROBLEMS_TSVECTOR,
  SERVICE_REQUESTS_TSVECTOR,
  KB_ARTICLES_TSVECTOR,
  buildFtsMatch,
  buildFtsRank,
  buildFtsHeadline,
} from '../lib/search-fts.js';
import { parseSearchQuery, tokensToFilterGroup, MAX_SEARCH_QUERY_LENGTH } from '../lib/search-query.js';
import { buildFilterSql, type FilterEntity, type FilterGroup } from '../lib/filter-builder.js';

export const SEARCH_TYPES = ['issue', 'problem', 'request', 'kb'] as const;
export type SearchType = (typeof SEARCH_TYPES)[number];

export const MAX_PER_PAGE = 50;
export const STATEMENT_TIMEOUT_MS = 5000;

interface TypeDef {
  table: string;
  entity: FilterEntity | null;
  tsvector: string;
  number: string;
  title: string;
  snippetText: string;
  hasPriority: boolean;
}

const TYPE_DEFS: Record<SearchType, TypeDef> = {
  issue: { table: 'issues', entity: 'issues', tsvector: ISSUES_TSVECTOR, number: 'issue_number', title: 'title', snippetText: "coalesce(title, '') || ' ' || coalesce(description, '')", hasPriority: true },
  problem: { table: 'problems', entity: 'problems', tsvector: PROBLEMS_TSVECTOR, number: 'problem_number', title: 'title', snippetText: "coalesce(title, '') || ' ' || coalesce(description, '')", hasPriority: true },
  request: { table: 'service_requests', entity: 'requests', tsvector: SERVICE_REQUESTS_TSVECTOR, number: 'request_number', title: 'request_number', snippetText: "coalesce(request_number, '') || ' ' || coalesce(notes, '')", hasPriority: true },
  kb: { table: 'kb_articles', entity: null, tsvector: KB_ARTICLES_TSVECTOR, number: 'article_number', title: 'title', snippetText: "coalesce(title, '') || ' ' || coalesce(summary, '') || ' ' || coalesce(content, '')", hasPriority: false },
};

export interface SearchParams {
  q: string;
  types: SearchType[];
  status?: string[];
  priority?: string[];
  page: number;
  perPage: number;
}

export interface SearchResultItem {
  type: SearchType;
  id: string;
  number: string | null;
  title: string | null;
  snippet: string;
  rank: number;
  status: string | null;
  priority: string | null;
  created_at: string | Date;
}

export interface SearchFacets {
  type: Record<string, number>;
  status: Record<string, number>;
  priority: Record<string, number>;
}

export interface SearchResponse extends PaginatedResponse<SearchResultItem> {
  facets: SearchFacets;
  took_ms: number;
}

interface Queryable {
  query: (text: string, values?: unknown[]) => Promise<{ rows: any[]; rowCount?: number | null }>;
}

/** Run fn inside a transaction with a local statement_timeout. */
export async function withStatementTimeout<T>(fn: (client: Queryable) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL statement_timeout = ${STATEMENT_TIMEOUT_MS}`);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    if (err && typeof err === 'object' && (err as { code?: string }).code === '57014') {
      throw new AppError(503, 'Search Timeout', 'Search took too long and was cancelled; please narrow your query');
    }
    throw err;
  } finally {
    client.release();
  }
}

interface BuiltType {
  where: string;
  values: unknown[];
  rank: string;
  snippet: string;
}

/** Returns null when the type cannot satisfy the request (no results). */
function buildTypeQuery(
  type: SearchType,
  text: string,
  tokens: ReturnType<typeof parseSearchQuery>['tokens'],
  status?: string[],
  priority?: string[],
): BuiltType | null {
  const def = TYPE_DEFS[type];
  const values: unknown[] = [];
  const conds: string[] = [];
  let rank = '0';
  let snippet = `left(coalesce(${def.title}, ''), 200)`;
  if (text) {
    values.push(text);
    conds.push(buildFtsMatch(def.tsvector, 1));
    rank = buildFtsRank(def.tsvector, 1);
    snippet = buildFtsHeadline(def.snippetText, 1);
  }
  if (tokens.length > 0) {
    if (!def.entity) return null;
    const { group, unsupported } = tokensToFilterGroup(def.entity, tokens);
    if (unsupported.length > 0) return null;
    if (group) {
      const built = buildFilterSql(def.entity, group, values.length + 1);
      conds.push(built.sql);
      values.push(...built.values);
    }
  }
  if (status && status.length) {
    values.push(status);
    conds.push(`status = ANY($${values.length})`);
  }
  if (priority && priority.length) {
    if (!def.hasPriority) return null;
    values.push(priority);
    conds.push(`priority = ANY($${values.length})`);
  }
  return { where: conds.length ? `WHERE ${conds.join(' AND ')}` : '', values, rank, snippet };
}

export const searchService = {
  async search(tenantSlug: string, params: SearchParams): Promise<SearchResponse> {
    const started = Date.now();
    const perPage = Math.min(Math.max(1, params.perPage), MAX_PER_PAGE);
    const page = Math.max(1, params.page);
    const parsed = parseSearchQuery(params.q);
    const schema = tenantService.getSchemaName(tenantSlug);
    const facets: SearchFacets = { type: {}, status: {}, priority: {} };
    let items: SearchResultItem[] = [];

    for (const t of params.types) facets.type[t] = 0;

    await withStatementTimeout(async (client) => {
      for (const type of params.types) {
        const def = TYPE_DEFS[type];
        const built = buildTypeQuery(type, parsed.text, parsed.tokens, params.status, params.priority);
        if (!built) continue;
        const priorityCol = def.hasPriority ? 'priority' : 'NULL::text';
        const facetRes = await client.query(
          `SELECT 'status' AS facet, status AS value, COUNT(*) AS count FROM ${schema}.${def.table} ${built.where} GROUP BY status
           UNION ALL
           SELECT 'priority' AS facet, ${priorityCol} AS value, COUNT(*) AS count FROM ${schema}.${def.table} ${built.where} GROUP BY 2`,
          built.values,
        );
        let total = 0;
        for (const row of facetRes.rows) {
          const n = parseInt(row.count, 10);
          if (row.facet === 'status') total += n;
          if (row.value === null || row.value === undefined) continue;
          const bucket = row.facet === 'status' ? facets.status : facets.priority;
          bucket[row.value] = (bucket[row.value] ?? 0) + n;
        }
        facets.type[type] = total;
        if (total === 0) continue;

        const dataRes = await client.query(
          `SELECT '${type}' AS type, id, ${def.number} AS number, ${def.title} AS title,
                  ${built.snippet} AS snippet, ${built.rank} AS rank, status,
                  ${priorityCol} AS priority, created_at
           FROM ${schema}.${def.table} ${built.where}
           ORDER BY rank DESC, created_at DESC
           LIMIT $${built.values.length + 1}`,
          [...built.values, page * perPage],
        );
        items.push(...dataRes.rows.map((r) => ({ ...r, rank: Number(r.rank) }) as SearchResultItem));
      }
    });

    items.sort((a, b) => {
      if (b.rank !== a.rank) return b.rank - a.rank;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
    const total = Object.values(facets.type).reduce((s, n) => s + n, 0);
    items = items.slice((page - 1) * perPage, page * perPage);
    const paged = createPaginatedResponse(items, total, { page, perPage });
    return { ...paged, facets, took_ms: Date.now() - started };
  },

  async advancedQuery(
    tenantSlug: string,
    p: {
      entityType: FilterEntity;
      filter: FilterGroup;
      q?: string;
      sort?: string;
      order?: 'asc' | 'desc';
      page: number;
      perPage: number;
    },
  ): Promise<PaginatedResponse<Record<string, unknown>>> {
    const perPage = Math.min(Math.max(1, p.perPage), MAX_PER_PAGE);
    const page = Math.max(1, p.page);
    const schema = tenantService.getSchemaName(tenantSlug);
    const alias = p.entityType === 'requests' ? 'r' : p.entityType === 'issues' ? 'i' : 'p';
    const table = p.entityType === 'requests' ? 'service_requests' : p.entityType;
    const tsvector = { issues: ISSUES_TSVECTOR, problems: PROBLEMS_TSVECTOR, requests: SERVICE_REQUESTS_TSVECTOR }[p.entityType];

    const built = buildFilterSql(p.entityType, p.filter, 1, alias);
    const values = [...built.values];
    const conds = [built.sql];
    const q = (p.q ?? '').trim().slice(0, MAX_SEARCH_QUERY_LENGTH);
    if (q) {
      values.push(q);
      // tsvector expressions use unqualified columns, so match in a subselect on the base table.
      conds.push(`${alias}.id IN (SELECT id FROM ${schema}.${table} WHERE ${buildFtsMatch(tsvector, values.length)})`);
    }
    const where = `WHERE ${conds.join(' AND ')}`;
    const sortable = ['created_at', 'updated_at', 'priority', 'status'];
    const sortColumn = sortable.includes(p.sort ?? '') ? p.sort : 'created_at';
    const order = p.order === 'asc' ? 'ASC' : 'DESC';

    const select =
      p.entityType === 'requests'
        ? `SELECT r.*, req.name as requester_name, req.email as requester_email,
                  rf.name as requested_for_name, rf.email as requested_for_email,
                  a.name as assignee_name, a.email as assignee_email,
                  ci.name as catalog_item_name, fg.name as fulfillment_group_name
           FROM ${schema}.service_requests r
           LEFT JOIN ${schema}.users req ON r.requester_id = req.id
           LEFT JOIN ${schema}.users rf ON r.requested_for_id = rf.id
           LEFT JOIN ${schema}.users a ON r.assigned_to = a.id
           LEFT JOIN ${schema}.catalog_items ci ON r.catalog_item_id = ci.id
           LEFT JOIN ${schema}.groups fg ON r.fulfillment_group_id = fg.id`
        : `SELECT ${alias}.*, r.name as reporter_name, r.email as reporter_email,
                  a.name as assignee_name, a.email as assignee_email,
                  g.name as assigned_group_name,
                  app.name as application_name, app.app_id as application_app_id
           FROM ${schema}.${table} ${alias}
           LEFT JOIN ${schema}.users r ON ${alias}.reporter_id = r.id
           LEFT JOIN ${schema}.users a ON ${alias}.assigned_to = a.id
           LEFT JOIN ${schema}.groups g ON ${alias}.assigned_group = g.id
           LEFT JOIN ${schema}.applications app ON ${alias}.application_id = app.id`;

    return withStatementTimeout(async (client) => {
      const count = await client.query(`SELECT COUNT(*) FROM ${schema}.${table} ${alias} ${where}`, values);
      const total = parseInt(count.rows[0].count, 10);
      const res = await client.query(
        `${select} ${where} ORDER BY ${alias}.${sortColumn} ${order} LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
        [...values, perPage, (page - 1) * perPage],
      );
      return createPaginatedResponse(res.rows, total, { page, perPage });
    });
  },
};
