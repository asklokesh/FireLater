import { pool } from '../config/database.js';
import { tenantService } from './tenant.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../utils/errors.js';

export type SavedFilterEntityType = 'issues' | 'problems' | 'requests';

export interface SavedFilter {
  id: string;
  name: string;
  entity_type: SavedFilterEntityType;
  definition: Record<string, unknown>;
  is_shared: boolean;
  created_by: string;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateSavedFilterInput {
  name: string;
  entityType: SavedFilterEntityType;
  definition: Record<string, unknown>;
  isShared?: boolean;
}

export interface UpdateSavedFilterInput {
  name?: string;
  definition?: Record<string, unknown>;
  isShared?: boolean;
}

const SELECT_COLUMNS = `
  sf.id, sf.name, sf.entity_type, sf.definition, sf.is_shared, sf.created_by,
  u.name AS created_by_name, sf.created_at, sf.updated_at`;

const DUPLICATE_MESSAGE = 'A saved filter with this name already exists for this entity type';

function isUniqueViolation(error: unknown): boolean {
  return !!error && typeof error === 'object' && (error as { code?: string }).code === '23505';
}

async function getById(schema: string, id: string): Promise<SavedFilter | null> {
  const result = await pool.query(
    `SELECT ${SELECT_COLUMNS}
     FROM ${schema}.saved_filters sf
     LEFT JOIN ${schema}.users u ON u.id = sf.created_by
     WHERE sf.id = $1`,
    [id]
  );
  return result.rows[0] ?? null;
}

export const savedFilterService = {
  async list(tenantSlug: string, userId: string, entityType?: SavedFilterEntityType): Promise<SavedFilter[]> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const params: unknown[] = [userId];
    let where = '(sf.created_by = $1 OR sf.is_shared = true)';
    if (entityType) {
      params.push(entityType);
      where += ` AND sf.entity_type = $${params.length}`;
    }
    const result = await pool.query(
      `SELECT ${SELECT_COLUMNS}
       FROM ${schema}.saved_filters sf
       LEFT JOIN ${schema}.users u ON u.id = sf.created_by
       WHERE ${where}
       ORDER BY sf.name ASC`,
      params
    );
    return result.rows;
  },

  async create(tenantSlug: string, userId: string, input: CreateSavedFilterInput): Promise<SavedFilter> {
    const schema = tenantService.getSchemaName(tenantSlug);
    let id: string;
    try {
      const result = await pool.query(
        `INSERT INTO ${schema}.saved_filters (name, entity_type, definition, is_shared, created_by)
         VALUES ($1, $2, $3::jsonb, $4, $5)
         RETURNING id`,
        [input.name, input.entityType, JSON.stringify(input.definition), input.isShared ?? false, userId]
      );
      id = result.rows[0].id;
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictError(DUPLICATE_MESSAGE);
      throw error;
    }
    return (await getById(schema, id)) as SavedFilter;
  },

  async update(
    tenantSlug: string,
    id: string,
    userId: string,
    isAdmin: boolean,
    input: UpdateSavedFilterInput
  ): Promise<SavedFilter> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const existing = await getById(schema, id);
    if (!existing) throw new NotFoundError('Saved filter', id);
    if (existing.created_by !== userId && !isAdmin) {
      throw new ForbiddenError('Only the owner or an admin can modify this saved filter');
    }

    const sets: string[] = [];
    const params: unknown[] = [];
    if (input.name !== undefined) {
      params.push(input.name);
      sets.push(`name = $${params.length}`);
    }
    if (input.definition !== undefined) {
      params.push(JSON.stringify(input.definition));
      sets.push(`definition = $${params.length}::jsonb`);
    }
    if (input.isShared !== undefined) {
      params.push(input.isShared);
      sets.push(`is_shared = $${params.length}`);
    }
    if (sets.length === 0) return existing;

    sets.push('updated_at = NOW()');
    params.push(id);
    try {
      await pool.query(
        `UPDATE ${schema}.saved_filters SET ${sets.join(', ')} WHERE id = $${params.length}`,
        params
      );
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictError(DUPLICATE_MESSAGE);
      throw error;
    }
    return (await getById(schema, id)) as SavedFilter;
  },

  async delete(tenantSlug: string, id: string, userId: string, isAdmin: boolean): Promise<void> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const existing = await getById(schema, id);
    if (!existing) throw new NotFoundError('Saved filter', id);
    if (existing.created_by !== userId && !isAdmin) {
      throw new ForbiddenError('Only the owner or an admin can delete this saved filter');
    }
    await pool.query(`DELETE FROM ${schema}.saved_filters WHERE id = $1`, [id]);
  },
};
