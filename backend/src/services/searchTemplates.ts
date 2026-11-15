import { z } from 'zod';
import { pool } from '../config/database.js';
import { tenantService } from './tenant.js';
import { filterGroupSchema, type FilterGroup } from './search.js';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../utils/errors.js';

export interface SearchTemplate {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  query: string | null;
  filters: FilterGroup | null;
  is_shared: boolean;
  created_at: string;
  updated_at: string;
}

export const templateCreateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().max(1000).nullish(),
  query: z.string().max(200).nullish(),
  filters: filterGroupSchema.nullish(),
  is_shared: z.boolean().optional(),
});

export const templateUpdateSchema = templateCreateSchema.partial();

function parseInput<T extends z.ZodTypeAny>(schema: T, input: unknown): z.infer<T> {
  const r = schema.safeParse(input);
  if (!r.success) {
    throw new BadRequestError(r.error.issues.map((i) => `${i.path.join('.') || 'input'}: ${i.message}`).join('; '));
  }
  return r.data;
}

function isUniqueViolation(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: string }).code === '23505';
}

class SearchTemplateService {
  private table(tenantSlug: string) {
    return `${tenantService.getSchemaName(tenantSlug)}.search_filter_templates`;
  }

  async create(tenantSlug: string, userId: string, input: unknown): Promise<SearchTemplate> {
    const data = parseInput(templateCreateSchema, input);
    const existing = await pool.query(`SELECT 1 FROM ${this.table(tenantSlug)} WHERE user_id = $1 AND name = $2`, [
      userId,
      data.name,
    ]);
    if (existing.rows.length) throw new ConflictError('A template with this name already exists');
    try {
      const r = await pool.query(
        `INSERT INTO ${this.table(tenantSlug)} (user_id, name, description, query, filters, is_shared)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [
          userId,
          data.name,
          data.description ?? null,
          data.query ?? null,
          data.filters ? JSON.stringify(data.filters) : null,
          data.is_shared ?? false,
        ]
      );
      return r.rows[0];
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictError('A template with this name already exists');
      throw e;
    }
  }

  async list(tenantSlug: string, userId: string): Promise<SearchTemplate[]> {
    const r = await pool.query(
      `SELECT * FROM ${this.table(tenantSlug)}
       WHERE user_id = $1 OR is_shared = true
       ORDER BY name ASC`,
      [userId]
    );
    return r.rows;
  }

  async get(tenantSlug: string, userId: string, id: string): Promise<SearchTemplate> {
    const r = await pool.query(`SELECT * FROM ${this.table(tenantSlug)} WHERE id = $1`, [id]);
    const row = r.rows[0];
    if (!row || (row.user_id !== userId && !row.is_shared)) throw new NotFoundError('Search template', id);
    return row;
  }

  private async getOwned(tenantSlug: string, userId: string, id: string): Promise<SearchTemplate> {
    const row = await this.get(tenantSlug, userId, id);
    if (row.user_id !== userId) throw new ForbiddenError('Only the owner can modify this template');
    return row;
  }

  async update(tenantSlug: string, userId: string, id: string, input: unknown): Promise<SearchTemplate> {
    const data = parseInput(templateUpdateSchema, input);
    await this.getOwned(tenantSlug, userId, id);

    const sets: string[] = [];
    const values: unknown[] = [];
    const add = (col: string, val: unknown) => {
      values.push(val);
      sets.push(`${col} = $${values.length}`);
    };
    if (data.name !== undefined) {
      const dup = await pool.query(
        `SELECT 1 FROM ${this.table(tenantSlug)} WHERE user_id = $1 AND name = $2 AND id <> $3`,
        [userId, data.name, id]
      );
      if (dup.rows.length) throw new ConflictError('A template with this name already exists');
      add('name', data.name);
    }
    if (data.description !== undefined) add('description', data.description);
    if (data.query !== undefined) add('query', data.query);
    if (data.filters !== undefined) add('filters', data.filters ? JSON.stringify(data.filters) : null);
    if (data.is_shared !== undefined) add('is_shared', data.is_shared);
    if (!sets.length) throw new BadRequestError('No fields to update');

    values.push(id, userId);
    try {
      const r = await pool.query(
        `UPDATE ${this.table(tenantSlug)} SET ${sets.join(', ')}, updated_at = NOW()
         WHERE id = $${values.length - 1} AND user_id = $${values.length} RETURNING *`,
        values
      );
      if (!r.rows.length) throw new NotFoundError('Search template', id);
      return r.rows[0];
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictError('A template with this name already exists');
      throw e;
    }
  }

  async delete(tenantSlug: string, userId: string, id: string): Promise<void> {
    await this.getOwned(tenantSlug, userId, id);
    await pool.query(`DELETE FROM ${this.table(tenantSlug)} WHERE id = $1 AND user_id = $2`, [id, userId]);
  }
}

export const searchTemplateService = new SearchTemplateService();
