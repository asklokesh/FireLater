import { pool } from '../../config/database.js';
import { tenantService } from '../tenant.js';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../../utils/errors.js';
import { filterGroupSchema } from './filter-builder.js';

export const MAX_DEFINITION_BYTES = 20 * 1024;

export interface TemplateDefinition {
  q?: string;
  filter?: unknown;
  sort?: 'relevance' | 'created_at' | 'updated_at' | 'priority' | 'status';
  order?: 'asc' | 'desc';
}

export interface SearchTemplate {
  id: string;
  name: string;
  definition: TemplateDefinition;
  is_shared: boolean;
  owner_id: string;
  owner_name?: string | null;
  created_at: string;
  updated_at: string;
}

function validateDefinition(definition: TemplateDefinition): void {
  if (definition.filter !== undefined) {
    const parsed = filterGroupSchema.safeParse(definition.filter);
    if (!parsed.success) {
      throw new BadRequestError(`Invalid filter: ${parsed.error.issues[0]?.message ?? 'invalid'}`);
    }
  }
  if (Buffer.byteLength(JSON.stringify(definition), 'utf8') > MAX_DEFINITION_BYTES) {
    throw new BadRequestError('Template definition exceeds 20 KB');
  }
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505';
}

const RETURNING = 'RETURNING id, name, definition, is_shared, owner_id, created_at, updated_at';

export async function listTemplates(tenantSlug: string, userId: string): Promise<SearchTemplate[]> {
  const schema = tenantService.getSchemaName(tenantSlug);
  const result = await pool.query(
    `SELECT f.id, f.name, f.definition, f.is_shared, f.owner_id, u.name AS owner_name,
            f.created_at, f.updated_at
     FROM ${schema}.saved_filters f
     LEFT JOIN ${schema}.users u ON u.id = f.owner_id
     WHERE f.owner_id = $1 OR f.is_shared = true
     ORDER BY f.name ASC`,
    [userId]
  );
  return result.rows;
}

export async function createTemplate(
  tenantSlug: string,
  userId: string,
  input: { name: string; definition: TemplateDefinition; isShared?: boolean }
): Promise<SearchTemplate> {
  validateDefinition(input.definition);
  const schema = tenantService.getSchemaName(tenantSlug);
  try {
    const result = await pool.query(
      `INSERT INTO ${schema}.saved_filters (name, owner_id, definition, is_shared)
       VALUES ($1, $2, $3, $4)
       ${RETURNING}`,
      [input.name, userId, JSON.stringify(input.definition), input.isShared ?? false]
    );
    return result.rows[0];
  } catch (err) {
    if (isUniqueViolation(err)) throw new ConflictError('A template with this name already exists');
    throw err;
  }
}

async function assertOwner(schema: string, userId: string, id: string): Promise<void> {
  const existing = await pool.query(`SELECT owner_id FROM ${schema}.saved_filters WHERE id = $1`, [id]);
  if (existing.rows.length === 0) throw new NotFoundError('Search template', id);
  if (existing.rows[0].owner_id !== userId) {
    throw new ForbiddenError('Only the owner can modify this template');
  }
}

export async function updateTemplate(
  tenantSlug: string,
  userId: string,
  id: string,
  input: { name?: string; definition?: TemplateDefinition; isShared?: boolean }
): Promise<SearchTemplate> {
  const schema = tenantService.getSchemaName(tenantSlug);
  await assertOwner(schema, userId, id);
  if (input.definition) validateDefinition(input.definition);

  const sets: string[] = [];
  const values: unknown[] = [];
  if (input.name !== undefined) {
    values.push(input.name);
    sets.push(`name = $${values.length}`);
  }
  if (input.definition !== undefined) {
    values.push(JSON.stringify(input.definition));
    sets.push(`definition = $${values.length}`);
  }
  if (input.isShared !== undefined) {
    values.push(input.isShared);
    sets.push(`is_shared = $${values.length}`);
  }
  sets.push('updated_at = NOW()');
  values.push(id);
  try {
    const result = await pool.query(
      `UPDATE ${schema}.saved_filters SET ${sets.join(', ')} WHERE id = $${values.length}
       ${RETURNING}`,
      values
    );
    return result.rows[0];
  } catch (err) {
    if (isUniqueViolation(err)) throw new ConflictError('A template with this name already exists');
    throw err;
  }
}

export async function deleteTemplate(tenantSlug: string, userId: string, id: string): Promise<void> {
  const schema = tenantService.getSchemaName(tenantSlug);
  await assertOwner(schema, userId, id);
  await pool.query(`DELETE FROM ${schema}.saved_filters WHERE id = $1`, [id]);
}
