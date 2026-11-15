import { pool } from '../config/database.js';
import { tenantService } from './tenant.js';
import { buildFilterClause, type FilterGroup, type SearchEntity } from '../lib/search-query.js';
import { ForbiddenError, NotFoundError } from '../utils/errors.js';

export interface SavedFilter {
  id: string;
  owner_id: string;
  name: string;
  entity: SearchEntity;
  query: string | null;
  filter: FilterGroup | null;
  is_shared: boolean;
  created_at: string;
  updated_at: string;
}

export interface TemplateInput {
  name: string;
  entity: SearchEntity;
  query?: string | null;
  filter?: FilterGroup | null;
  isShared?: boolean;
}

const schemaOf = (slug: string) => tenantService.getSchemaName(slug);

export async function createTemplate(tenantSlug: string, userId: string, input: TemplateInput): Promise<SavedFilter> {
  buildFilterClause(input.entity, input.filter);
  const r = await pool.query(
    `INSERT INTO ${schemaOf(tenantSlug)}.saved_filters (owner_id, name, entity, query, filter, is_shared)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [userId, input.name, input.entity, input.query ?? null,
      input.filter ? JSON.stringify(input.filter) : null, input.isShared ?? false]
  );
  return r.rows[0];
}

export async function listTemplates(tenantSlug: string, userId: string): Promise<SavedFilter[]> {
  const r = await pool.query(
    `SELECT * FROM ${schemaOf(tenantSlug)}.saved_filters
     WHERE owner_id = $1 OR is_shared = true ORDER BY name`,
    [userId]
  );
  return r.rows;
}

export async function getTemplate(tenantSlug: string, userId: string, id: string): Promise<SavedFilter> {
  const r = await pool.query(
    `SELECT * FROM ${schemaOf(tenantSlug)}.saved_filters WHERE id = $1 AND (owner_id = $2 OR is_shared = true)`,
    [id, userId]
  );
  if (!r.rows[0]) throw new NotFoundError('Saved filter', id);
  return r.rows[0];
}

async function getOwned(tenantSlug: string, userId: string, id: string): Promise<SavedFilter> {
  const r = await pool.query(`SELECT * FROM ${schemaOf(tenantSlug)}.saved_filters WHERE id = $1`, [id]);
  const row = r.rows[0] as SavedFilter | undefined;
  if (!row || (row.owner_id !== userId && !row.is_shared)) throw new NotFoundError('Saved filter', id);
  if (row.owner_id !== userId) throw new ForbiddenError('Only the owner can modify this template');
  return row;
}

export async function updateTemplate(
  tenantSlug: string, userId: string, id: string, input: Partial<TemplateInput>
): Promise<SavedFilter> {
  const existing = await getOwned(tenantSlug, userId, id);
  const entity = input.entity ?? existing.entity;
  const filter = input.filter !== undefined ? input.filter : existing.filter;
  buildFilterClause(entity, filter);
  const r = await pool.query(
    `UPDATE ${schemaOf(tenantSlug)}.saved_filters
     SET name = $2, entity = $3, query = $4, filter = $5, is_shared = $6, updated_at = NOW()
     WHERE id = $1 RETURNING *`,
    [id, input.name ?? existing.name, entity,
      input.query !== undefined ? input.query : existing.query,
      filter ? JSON.stringify(filter) : null, input.isShared ?? existing.is_shared]
  );
  return r.rows[0];
}

export async function deleteTemplate(tenantSlug: string, userId: string, id: string): Promise<void> {
  await getOwned(tenantSlug, userId, id);
  await pool.query(`DELETE FROM ${schemaOf(tenantSlug)}.saved_filters WHERE id = $1`, [id]);
}

export async function recordSearch(
  tenantSlug: string, userId: string, query: string | undefined, entity: SearchEntity, resultCount: number
): Promise<void> {
  const q = (query ?? '').trim();
  if (!q) return;
  await pool.query(
    `INSERT INTO ${schemaOf(tenantSlug)}.search_history (user_id, query, entity, result_count)
     VALUES ($1, $2, $3, $4)`,
    [userId, q, entity, resultCount]
  );
}

export async function recentSearches(tenantSlug: string, userId: string, limit = 10): Promise<string[]> {
  const r = await pool.query(
    `SELECT query FROM ${schemaOf(tenantSlug)}.search_history WHERE user_id = $1
     GROUP BY query ORDER BY MAX(created_at) DESC LIMIT $2`,
    [userId, limit]
  );
  return r.rows.map((row: { query: string }) => row.query);
}

export async function clearHistory(tenantSlug: string, userId: string): Promise<void> {
  await pool.query(`DELETE FROM ${schemaOf(tenantSlug)}.search_history WHERE user_id = $1`, [userId]);
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export async function suggest(tenantSlug: string, userId: string, prefix: string, limit = 10): Promise<string[]> {
  const p = prefix.trim();
  if (!p) return [];
  const pattern = `${escapeLike(p)}%`;
  const schema = schemaOf(tenantSlug);
  const own = await pool.query(
    `SELECT query FROM ${schema}.search_history WHERE user_id = $1 AND query ILIKE $2
     GROUP BY query ORDER BY MAX(created_at) DESC LIMIT $3`,
    [userId, pattern, limit]
  );
  const out: string[] = own.rows.map((r: { query: string }) => r.query);
  if (out.length >= limit) return out;
  const popular = await pool.query(
    `SELECT query FROM ${schema}.search_history WHERE query ILIKE $1
     GROUP BY query ORDER BY COUNT(*) DESC, MAX(created_at) DESC LIMIT $2`,
    [pattern, limit]
  );
  for (const row of popular.rows as Array<{ query: string }>) {
    if (out.length >= limit) break;
    if (!out.includes(row.query)) out.push(row.query);
  }
  return out;
}

export interface SearchAnalytics {
  topQueries: Array<{ query: string; count: number }>;
  zeroResultQueries: Array<{ query: string; count: number }>;
  searchesPerDay: Array<{ day: string; count: number }>;
  averageResultCount: number;
}

export async function getAnalytics(tenantSlug: string, days = 30, limit = 10): Promise<SearchAnalytics> {
  const schema = schemaOf(tenantSlug);
  const since = `created_at >= NOW() - ($1::int * INTERVAL '1 day')`;
  const [top, zero, perDay, avg] = await Promise.all([
    pool.query(`SELECT query, COUNT(*) AS count FROM ${schema}.search_history WHERE ${since}
      GROUP BY query ORDER BY count DESC LIMIT $2`, [days, limit]),
    pool.query(`SELECT query, COUNT(*) AS count FROM ${schema}.search_history WHERE ${since} AND result_count = 0
      GROUP BY query ORDER BY count DESC LIMIT $2`, [days, limit]),
    pool.query(`SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day, COUNT(*) AS count
      FROM ${schema}.search_history WHERE ${since} GROUP BY 1 ORDER BY 1`, [days]),
    pool.query(`SELECT COALESCE(AVG(result_count), 0) AS avg FROM ${schema}.search_history WHERE ${since}`, [days]),
  ]);
  const num = (v: string) => parseInt(v, 10);
  return {
    topQueries: top.rows.map((r: { query: string; count: string }) => ({ query: r.query, count: num(r.count) })),
    zeroResultQueries: zero.rows.map((r: { query: string; count: string }) => ({ query: r.query, count: num(r.count) })),
    searchesPerDay: perDay.rows.map((r: { day: string; count: string }) => ({ day: r.day, count: num(r.count) })),
    averageResultCount: Number(avg.rows[0]?.avg ?? 0),
  };
}
