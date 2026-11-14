import { pool } from '../config/database.js';
import { tenantService } from './tenant.js';
import { filterSchema, type FilterNode } from './search-filters.js';
import { NotFoundError, BadRequestError } from '../utils/errors.js';

export interface SavedFilter {
  id: string;
  name: string;
  query: string | null;
  filter: FilterNode | null;
  isShared: boolean;
  createdAt: string;
}

export interface SavedFilterInput {
  name: string;
  query?: string;
  filter?: unknown;
  isShared?: boolean;
}

function map(r: Record<string, unknown>): SavedFilter {
  return {
    id: r.id as string,
    name: r.name as string,
    query: (r.query as string | null) ?? null,
    filter: (r.filter as FilterNode | null) ?? null,
    isShared: Boolean(r.is_shared),
    createdAt: r.created_at as string,
  };
}

const COLS = 'id, name, query, filter, is_shared, created_at';

function validateFilter(filter: unknown): FilterNode | null {
  if (filter === undefined || filter === null) return null;
  const parsed = filterSchema.safeParse(filter);
  if (!parsed.success) throw new BadRequestError('Invalid filter');
  return parsed.data;
}

export class SavedFilterService {
  async create(tenantSlug: string, userId: string, input: SavedFilterInput): Promise<SavedFilter> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const filter = validateFilter(input.filter);
    const res = await pool.query(
      `INSERT INTO ${schema}.saved_filters (user_id, name, query, filter, is_shared)
       VALUES ($1, $2, $3, $4, $5) RETURNING ${COLS}`,
      [userId, input.name, input.query ?? null, filter ? JSON.stringify(filter) : null, input.isShared ?? false]
    );
    return map(res.rows[0]);
  }

  async list(tenantSlug: string, userId: string): Promise<SavedFilter[]> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const res = await pool.query(
      `SELECT ${COLS} FROM ${schema}.saved_filters
       WHERE user_id = $1 OR is_shared = true ORDER BY name`,
      [userId]
    );
    return res.rows.map(map);
  }

  async get(tenantSlug: string, userId: string, id: string): Promise<SavedFilter> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const res = await pool.query(
      `SELECT ${COLS} FROM ${schema}.saved_filters
       WHERE id = $1 AND (user_id = $2 OR is_shared = true)`,
      [id, userId]
    );
    if (res.rows.length === 0) throw new NotFoundError('Filter template', id);
    return map(res.rows[0]);
  }

  async update(
    tenantSlug: string,
    userId: string,
    id: string,
    input: Partial<SavedFilterInput>
  ): Promise<SavedFilter> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const sets: string[] = [];
    const values: unknown[] = [];
    if (input.name !== undefined) { values.push(input.name); sets.push(`name = $${values.length}`); }
    if (input.query !== undefined) { values.push(input.query); sets.push(`query = $${values.length}`); }
    if (input.filter !== undefined) {
      const f = validateFilter(input.filter);
      values.push(f ? JSON.stringify(f) : null);
      sets.push(`filter = $${values.length}`);
    }
    if (input.isShared !== undefined) { values.push(input.isShared); sets.push(`is_shared = $${values.length}`); }
    if (sets.length === 0) throw new BadRequestError('No fields to update');
    sets.push('updated_at = NOW()');
    values.push(id, userId);
    const res = await pool.query(
      `UPDATE ${schema}.saved_filters SET ${sets.join(', ')}
       WHERE id = $${values.length - 1} AND user_id = $${values.length} RETURNING ${COLS}`,
      values
    );
    if (res.rows.length === 0) throw new NotFoundError('Filter template', id);
    return map(res.rows[0]);
  }

  async delete(tenantSlug: string, userId: string, id: string): Promise<void> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const res = await pool.query(
      `DELETE FROM ${schema}.saved_filters WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );
    if (!res.rowCount) throw new NotFoundError('Filter template', id);
  }
}

export const savedFilterService = new SavedFilterService();
