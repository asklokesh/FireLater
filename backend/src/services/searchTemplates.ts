import { pool } from '../config/database.js';
import { tenantService } from './tenant.js';
import { cacheService } from '../utils/cache.js';
import { NotFoundError, ForbiddenError } from '../utils/errors.js';
import { buildSearchFilter, type FilterGroup } from '../utils/searchFilterBuilder.js';

export interface SearchTemplate {
  id: string;
  user_id: string;
  name: string;
  entity_type: string;
  query: string | null;
  filter: FilterGroup | null;
  is_shared: boolean;
  created_at: string;
  updated_at: string;
}

export interface TemplateInput {
  name: string;
  entityType?: string;
  query?: string | null;
  filter?: FilterGroup | null;
  isShared?: boolean;
}

const CATEGORY = 'search-templates';

function validateFilter(filter: FilterGroup | null | undefined): void {
  // Throws ValidationError on invalid trees
  if (filter) buildSearchFilter(filter);
}

export const searchTemplatesService = {
  async list(tenantSlug: string, userId: string, entityType?: string): Promise<SearchTemplate[]> {
    const key = `${tenantSlug}:${CATEGORY}:list:${userId}:${entityType ?? ''}`;
    return cacheService.getOrSet(key, async () => {
      const schema = tenantService.getSchemaName(tenantSlug);
      const params: unknown[] = [userId];
      let sql = `SELECT * FROM ${schema}.search_filter_templates WHERE (user_id = $1 OR is_shared = true)`;
      if (entityType) {
        params.push(entityType);
        sql += ` AND entity_type = $2`;
      }
      sql += ' ORDER BY name';
      const result = await pool.query(sql, params);
      return result.rows as SearchTemplate[];
    }, { ttl: 300 });
  },

  async get(tenantSlug: string, userId: string, id: string): Promise<SearchTemplate> {
    const key = `${tenantSlug}:${CATEGORY}:get:${id}`;
    const tpl = await cacheService.getOrSet(key, async () => {
      const schema = tenantService.getSchemaName(tenantSlug);
      const result = await pool.query(`SELECT * FROM ${schema}.search_filter_templates WHERE id = $1`, [id]);
      return (result.rows[0] as SearchTemplate | undefined) ?? null;
    }, { ttl: 300 });
    if (!tpl || (tpl.user_id !== userId && !tpl.is_shared)) {
      throw new NotFoundError('Search template');
    }
    return tpl;
  },

  async create(tenantSlug: string, userId: string, input: TemplateInput): Promise<SearchTemplate> {
    validateFilter(input.filter);
    const schema = tenantService.getSchemaName(tenantSlug);
    const result = await pool.query(
      `INSERT INTO ${schema}.search_filter_templates (user_id, name, entity_type, query, filter, is_shared)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [
        userId,
        input.name,
        input.entityType ?? 'issue',
        input.query ?? null,
        input.filter ? JSON.stringify(input.filter) : null,
        input.isShared ?? false,
      ]
    );
    await cacheService.invalidateTenant(tenantSlug, CATEGORY);
    return result.rows[0] as SearchTemplate;
  },

  async update(tenantSlug: string, userId: string, id: string, input: Partial<TemplateInput>): Promise<SearchTemplate> {
    validateFilter(input.filter);
    const schema = tenantService.getSchemaName(tenantSlug);
    const existing = await pool.query(`SELECT user_id FROM ${schema}.search_filter_templates WHERE id = $1`, [id]);
    if (existing.rows.length === 0) throw new NotFoundError('Search template');
    if (existing.rows[0].user_id !== userId) throw new ForbiddenError('Only the owner can modify this template');

    const sets: string[] = [];
    const params: unknown[] = [];
    const add = (col: string, val: unknown) => {
      params.push(val);
      sets.push(`${col} = $${params.length}`);
    };
    if (input.name !== undefined) add('name', input.name);
    if (input.entityType !== undefined) add('entity_type', input.entityType);
    if (input.query !== undefined) add('query', input.query);
    if (input.filter !== undefined) add('filter', input.filter ? JSON.stringify(input.filter) : null);
    if (input.isShared !== undefined) add('is_shared', input.isShared);
    sets.push('updated_at = NOW()');
    params.push(id, userId);
    const result = await pool.query(
      `UPDATE ${schema}.search_filter_templates SET ${sets.join(', ')}
       WHERE id = $${params.length - 1} AND user_id = $${params.length} RETURNING *`,
      params
    );
    if (result.rows.length === 0) throw new NotFoundError('Search template');
    await cacheService.invalidateTenant(tenantSlug, CATEGORY);
    return result.rows[0] as SearchTemplate;
  },

  async delete(tenantSlug: string, userId: string, id: string): Promise<void> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const existing = await pool.query(`SELECT user_id FROM ${schema}.search_filter_templates WHERE id = $1`, [id]);
    if (existing.rows.length === 0) throw new NotFoundError('Search template');
    if (existing.rows[0].user_id !== userId) throw new ForbiddenError('Only the owner can delete this template');
    await pool.query(`DELETE FROM ${schema}.search_filter_templates WHERE id = $1 AND user_id = $2`, [id, userId]);
    await cacheService.invalidateTenant(tenantSlug, CATEGORY);
  },
};
