import { pool } from '../config/database.js';
import { tenantService } from './tenant.js';
import { cacheService } from '../utils/cache.js';
import { BadRequestError } from '../utils/errors.js';
import { searchConfig, type SearchEntity } from './search/config.js';
import { parseSearchQuery } from './search/query-parser.js';
import { buildFilterClause, buildRankedMatchSql, FilterBuildError } from './search/filter-builder.js';

export const SEARCH_ENTITIES: SearchEntity[] = ['issues', 'problems', 'requests', 'kb'];
export const MAX_PER_PAGE = 50;
export const MAX_RESULT_WINDOW = 1000;
export const MAX_QUERY_LENGTH = 200;
export const MAX_FACET_VALUES = 20;
export const SEARCH_CACHE_TTL = 30;

export const ENTITY_PERMISSIONS: Record<SearchEntity, string> = {
  issues: 'issues:read',
  problems: 'problems:read',
  requests: 'requests:read',
  kb: 'kb:read',
};

const TITLE_EXPR: Record<SearchEntity, string> = {
  issues: 'title',
  problems: 'title',
  requests: "coalesce(notes, '')",
  kb: 'title',
};
const HEADLINE_EXPR: Record<SearchEntity, string> = {
  issues: "coalesce(description, '')",
  problems: "coalesce(description, '')",
  requests: "coalesce(notes, '')",
  kb: "coalesce(summary, '') || ' ' || coalesce(content, '')",
};

export const DEFAULT_FACETS = ['status', 'priority', 'category'];
const FACET_ALIASES: Record<string, string> = { category: 'category_id' };

export interface FacetValue { value: string; count: number }
export interface SearchHit { id: string; title: string; snippet: string; rank: number }
export interface EntityResult {
  results: SearchHit[];
  total: number;
  facets: Record<string, FacetValue[]>;
}
export interface SearchParams {
  tenantSlug: string;
  userId: string;
  permissions: string[];
  q?: string;
  entities?: string[];
  filter?: unknown;
  sort?: 'rank' | 'date';
  page?: number;
  perPage?: number;
  facets?: string[];
}
export interface SearchResponse {
  q: string;
  page: number;
  perPage: number;
  results: Partial<Record<SearchEntity, EntityResult>>;
}

function entityFacetColumns(entity: SearchEntity, facets: string[]): Array<{ name: string; column: string }> {
  const cols = new Set(searchConfig[entity].filterFields.map((f) => f.column));
  const out: Array<{ name: string; column: string }> = [];
  for (const f of facets) {
    const column = FACET_ALIASES[f] ?? f;
    if (cols.has(column)) out.push({ name: f, column });
  }
  return out;
}

async function searchEntity(
  schema: string, entity: SearchEntity, text: string, tokens: Array<{ field: string; value: string }>,
  filter: unknown, sort: 'rank' | 'date', page: number, perPage: number, facets: string[]
): Promise<EntityResult> {
  const cfg = searchConfig[entity];
  const params: unknown[] = [];
  const where: string[] = [];
  let rankExpr = '0';
  let order = `${cfg.alias}.created_at DESC`;
  let textIdx = 0;

  if (text) {
    params.push(text);
    textIdx = params.length;
    const q = buildRankedMatchSql(entity, textIdx);
    where.push(q.where);
    rankExpr = q.orderBy.replace(/ DESC$/, '');
    if (sort === 'rank') order = `${q.orderBy}, ${cfg.alias}.created_at DESC`;
  }
  for (const t of tokens) {
    params.push(t.value);
    where.push(`${cfg.alias}.${t.field}::text = $${params.length}`);
  }
  if (filter) {
    const clause = buildFilterClause(entity, filter, params.length + 1);
    where.push(clause.sql);
    params.push(...clause.params);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const from = `FROM ${schema}.${cfg.table} ${cfg.alias}`;
  const headline = textIdx
    ? `ts_headline('english', ${HEADLINE_EXPR[entity]}, websearch_to_tsquery('english', $${textIdx}))`
    : `left(${HEADLINE_EXPR[entity]}, 200)`;
  const offset = (page - 1) * perPage;

  const facetCols = entityFacetColumns(entity, facets);
  const listP = pool.query(
    `SELECT ${cfg.alias}.id, ${TITLE_EXPR[entity]} AS title, ${headline} AS snippet, ${rankExpr} AS rank
     ${from} ${whereSql} ORDER BY ${order} LIMIT ${perPage} OFFSET ${offset}`,
    params
  );
  const countP = pool.query(`SELECT COUNT(*)::int AS total ${from} ${whereSql}`, params);
  const facetPs = facetCols.map((f) =>
    pool.query(
      `SELECT ${cfg.alias}.${f.column}::text AS value, COUNT(*)::int AS count ${from} ${whereSql}
       GROUP BY ${cfg.alias}.${f.column} ORDER BY count DESC, value ASC LIMIT ${MAX_FACET_VALUES}`,
      params
    )
  );
  const [list, count, ...facetRes] = await Promise.all([listP, countP, ...facetPs]);

  const facetOut: Record<string, FacetValue[]> = {};
  facetCols.forEach((f, i) => {
    facetOut[f.name] = (facetRes[i].rows as Array<{ value: string | null; count: number }>)
      .filter((r) => r.value !== null)
      .slice(0, MAX_FACET_VALUES)
      .map((r) => ({ value: r.value as string, count: Number(r.count) }));
  });
  return {
    results: (list.rows as Array<{ id: string; title: string; snippet: string; rank: number | string }>).map((r) => ({
      id: r.id, title: r.title, snippet: r.snippet, rank: Number(r.rank),
    })),
    total: Number(count.rows[0]?.total ?? 0),
    facets: facetOut,
  };
}

export const searchService = {
  /** Entities (optionally narrowed to `requested`) the permission list allows reading. */
  permittedEntities(permissions: string[], isAdmin = false, requested?: string[]): SearchEntity[] {
    const wanted = requested && requested.length
      ? SEARCH_ENTITIES.filter((e) => requested.includes(e))
      : SEARCH_ENTITIES;
    return wanted.filter((e) => isAdmin || permissions.includes(ENTITY_PERMISSIONS[e]));
  },

  /** `permissions` must already be the effective list (admins expanded by the caller). */
  async search(p: SearchParams): Promise<SearchResponse> {
    const rawQ = (p.q ?? '').trim();
    if (rawQ.length > MAX_QUERY_LENGTH) throw new BadRequestError(`q must be at most ${MAX_QUERY_LENGTH} characters`);
    const perPage = Math.min(Math.max(Math.floor(p.perPage ?? 20) || 20, 1), MAX_PER_PAGE);
    const page = Math.max(Math.floor(p.page ?? 1) || 1, 1);
    if ((page - 1) * perPage >= MAX_RESULT_WINDOW) {
      throw new BadRequestError(`Result window exceeded: results beyond position ${MAX_RESULT_WINDOW} are not available`);
    }
    const sort = p.sort === 'date' ? 'date' : 'rank';
    const facets = p.facets ?? DEFAULT_FACETS;
    const entities = this.permittedEntities(p.permissions, false, p.entities);

    const key = `${p.tenantSlug}:search:${[...p.permissions].sort().join(',')}:${JSON.stringify({
      u: p.userId, q: rawQ, entities, filter: p.filter ?? null, sort, page, perPage, facets,
    })}`;
    return cacheService.getOrSet(key, async () => {
      const schema = tenantService.getSchemaName(p.tenantSlug);
      let perEntity: EntityResult[];
      try {
        perEntity = await Promise.all(
          entities.map((e) => {
            const parsed = parseSearchQuery(rawQ, e);
            return searchEntity(schema, e, parsed.text, parsed.filters, p.filter, sort, page, perPage, facets);
          })
        );
      } catch (err) {
        if (err instanceof FilterBuildError) throw new BadRequestError(err.message);
        throw err;
      }
      const results: Partial<Record<SearchEntity, EntityResult>> = {};
      entities.forEach((e, i) => { results[e] = perEntity[i]; });
      return { q: rawQ, page, perPage, results };
    }, { ttl: SEARCH_CACHE_TTL });
  },
};
