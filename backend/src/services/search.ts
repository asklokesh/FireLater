import { pool } from '../config/database.js';
import { tenantService } from './tenant.js';
import { NotFoundError, ConflictError } from '../utils/errors.js';
import { cacheService } from '../utils/cache.js';

export interface SavedFilter {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  entityType: string;
  query: string | null;
  filter: unknown;
  isShared: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TemplateInput {
  name: string;
  description?: string | null;
  entityType?: string;
  query?: string | null;
  filter?: unknown;
  isShared?: boolean;
}

function mapRow(r: any): SavedFilter {
  return {
    id: r.id,
    userId: r.user_id,
    name: r.name,
    description: r.description ?? null,
    entityType: r.entity_type,
    query: r.query ?? null,
    filter: r.filter ?? null,
    isShared: r.is_shared,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function isUniqueViolation(err: unknown): boolean {
  return !!err && typeof err === 'object' && (err as { code?: string }).code === '23505';
}

class SearchService {
  async listTemplates(tenantSlug: string, userId: string): Promise<SavedFilter[]> {
    const key = `${tenantSlug}:search:templates:${userId}`;
    return cacheService.getOrSet(key, async () => {
      const schema = tenantService.getSchemaName(tenantSlug);
      const result = await pool.query(
        `SELECT * FROM ${schema}.saved_filters
         WHERE user_id = $1 OR is_shared = true
         ORDER BY name ASC`,
        [userId]
      );
      return result.rows.map(mapRow);
    }, { ttl: 300 });
  }

  async getTemplate(tenantSlug: string, userId: string, id: string): Promise<SavedFilter> {
    const key = `${tenantSlug}:search:template:${userId}:${id}`;
    const tpl = await cacheService.getOrSet(key, async () => {
      const schema = tenantService.getSchemaName(tenantSlug);
      const result = await pool.query(
        `SELECT * FROM ${schema}.saved_filters WHERE id = $1 AND (user_id = $2 OR is_shared = true)`,
        [id, userId]
      );
      return result.rows[0] ? mapRow(result.rows[0]) : null;
    }, { ttl: 300 });
    if (!tpl) throw new NotFoundError('Search template', id);
    return tpl;
  }

  async createTemplate(tenantSlug: string, userId: string, input: TemplateInput): Promise<SavedFilter> {
    const schema = tenantService.getSchemaName(tenantSlug);
    try {
      const result = await pool.query(
        `INSERT INTO ${schema}.saved_filters (user_id, name, description, entity_type, query, filter, is_shared)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [
          userId,
          input.name,
          input.description ?? null,
          input.entityType ?? 'issue',
          input.query ?? null,
          input.filter == null ? null : JSON.stringify(input.filter),
          input.isShared ?? false,
        ]
      );
      await cacheService.invalidateTenant(tenantSlug, 'search');
      return mapRow(result.rows[0]);
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictError('A template with this name already exists');
      throw err;
    }
  }

  async updateTemplate(
    tenantSlug: string,
    userId: string,
    id: string,
    input: Partial<TemplateInput>
  ): Promise<SavedFilter> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const sets: string[] = [];
    const values: unknown[] = [];
    const add = (col: string, val: unknown) => {
      values.push(val);
      sets.push(`${col} = $${values.length}`);
    };
    if (input.name !== undefined) add('name', input.name);
    if (input.description !== undefined) add('description', input.description);
    if (input.entityType !== undefined) add('entity_type', input.entityType);
    if (input.query !== undefined) add('query', input.query);
    if (input.filter !== undefined) add('filter', input.filter === null ? null : JSON.stringify(input.filter));
    if (input.isShared !== undefined) add('is_shared', input.isShared);
    sets.push('updated_at = NOW()');
    values.push(id, userId);
    try {
      const result = await pool.query(
        `UPDATE ${schema}.saved_filters SET ${sets.join(', ')}
         WHERE id = $${values.length - 1} AND user_id = $${values.length} RETURNING *`,
        values
      );
      if (result.rows.length === 0) throw new NotFoundError('Search template', id);
      await cacheService.invalidateTenant(tenantSlug, 'search');
      return mapRow(result.rows[0]);
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictError('A template with this name already exists');
      throw err;
    }
  }

  async deleteTemplate(tenantSlug: string, userId: string, id: string): Promise<void> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const result = await pool.query(
      `DELETE FROM ${schema}.saved_filters WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );
    if (!result.rowCount) throw new NotFoundError('Search template', id);
    await cacheService.invalidateTenant(tenantSlug, 'search');
  }

  async recordSearch(
    tenantSlug: string,
    entry: { userId: string; query?: string; filter?: unknown; resultCount: number; durationMs: number; entityType?: string }
  ): Promise<void> {
    const schema = tenantService.getSchemaName(tenantSlug);
    await pool.query(
      `INSERT INTO ${schema}.search_history (user_id, entity_type, query, filter, result_count, duration_ms)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        entry.userId,
        entry.entityType ?? 'issue',
        entry.query ?? null,
        entry.filter == null ? null : JSON.stringify(entry.filter),
        entry.resultCount,
        Math.round(entry.durationMs),
      ]
    );
  }

  async getHistory(tenantSlug: string, userId: string, limit = 10): Promise<Array<{ query: string; lastSearchedAt: string }>> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const lim = Math.min(Math.max(limit, 1), 50);
    const result = await pool.query(
      `SELECT query, MAX(created_at) AS last_searched_at
       FROM ${schema}.search_history
       WHERE user_id = $1 AND query IS NOT NULL AND query <> ''
       GROUP BY query
       ORDER BY last_searched_at DESC
       LIMIT $2`,
      [userId, lim]
    );
    return result.rows.map((r: { query: string; last_searched_at: string }) => ({
      query: r.query,
      lastSearchedAt: r.last_searched_at,
    }));
  }

  async clearHistory(tenantSlug: string, userId: string): Promise<number> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const result = await pool.query(`DELETE FROM ${schema}.search_history WHERE user_id = $1`, [userId]);
    return result.rowCount ?? 0;
  }

  async getSuggestions(tenantSlug: string, userId: string, q: string): Promise<string[]> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const prefix = q.replace(/[\\%_]/g, '\\$&') + '%';
    const own = await pool.query(
      `SELECT query FROM ${schema}.search_history
       WHERE user_id = $1 AND query ILIKE $2
       GROUP BY query ORDER BY MAX(created_at) DESC LIMIT 10`,
      [userId, prefix]
    );
    const out: string[] = own.rows.map((r: { query: string }) => r.query);
    if (out.length >= 10) return out.slice(0, 10);
    const popular = await pool.query(
      `SELECT query FROM ${schema}.search_history
       WHERE query ILIKE $1
       GROUP BY query ORDER BY COUNT(*) DESC, MAX(created_at) DESC LIMIT 10`,
      [prefix]
    );
    const seen = new Set(out.map((s) => s.toLowerCase()));
    for (const r of popular.rows as Array<{ query: string }>) {
      if (out.length >= 10) break;
      if (!seen.has(r.query.toLowerCase())) {
        seen.add(r.query.toLowerCase());
        out.push(r.query);
      }
    }
    return out;
  }

  async getAnalytics(tenantSlug: string, days = 30) {
    const schema = tenantService.getSchemaName(tenantSlug);
    const d = Math.min(Math.max(days, 1), 365);
    const since = `NOW() - ($1 || ' days')::interval`;
    const [top, zero, daily, avg] = await Promise.all([
      pool.query(
        `SELECT query, COUNT(*)::int AS count FROM ${schema}.search_history
         WHERE created_at >= ${since} AND query IS NOT NULL AND query <> ''
         GROUP BY query ORDER BY count DESC, query ASC LIMIT 10`,
        [String(d)]
      ),
      pool.query(
        `SELECT query, COUNT(*)::int AS count FROM ${schema}.search_history
         WHERE created_at >= ${since} AND result_count = 0 AND query IS NOT NULL AND query <> ''
         GROUP BY query ORDER BY count DESC, query ASC LIMIT 10`,
        [String(d)]
      ),
      pool.query(
        `SELECT TO_CHAR(DATE(created_at), 'YYYY-MM-DD') AS date, COUNT(*)::int AS count
         FROM ${schema}.search_history WHERE created_at >= ${since}
         GROUP BY DATE(created_at) ORDER BY DATE(created_at) ASC`,
        [String(d)]
      ),
      pool.query(
        `SELECT COALESCE(AVG(result_count), 0) AS avg FROM ${schema}.search_history
         WHERE created_at >= ${since}`,
        [String(d)]
      ),
    ]);
    return {
      topQueries: top.rows.map((r: { query: string; count: number }) => ({ query: r.query, count: Number(r.count) })),
      zeroResultQueries: zero.rows.map((r: { query: string; count: number }) => ({ query: r.query, count: Number(r.count) })),
      dailyVolume: daily.rows.map((r: { date: string; count: number }) => ({ date: r.date, count: Number(r.count) })),
      averageResultCount: Math.round(Number(avg.rows[0]?.avg ?? 0) * 100) / 100,
    };
  }
}

export const searchService = new SearchService();
