import { pool } from '../config/database.js';
import { tenantService } from './tenant.js';
import { NotFoundError, ConflictError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import type { PaginationParams } from '../types/index.js';
import { getOffset } from '../utils/pagination.js';

interface CreateGroupParams {
  name: string;
  description?: string;
  type?: string;
  parentId?: string;
  managerId?: string;
  email?: string;
  settings?: Record<string, unknown>;
}

interface UpdateGroupParams {
  name?: string;
  description?: string;
  type?: string;
  parentId?: string | null;
  managerId?: string | null;
  email?: string;
  settings?: Record<string, unknown>;
}

interface Group {
  id: string;
  name: string;
  description: string | null;
  type: string;
  parent_id: string | null;
  manager_id: string | null;
  email: string | null;
  settings: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
  member_count?: number;
}

export class GroupService {
  async list(tenantSlug: string, params: PaginationParams, filters?: { type?: string; search?: string }): Promise<{ groups: Group[]; total: number }> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const offset = getOffset(params);

    let whereClause = 'WHERE 1=1';
    const values: unknown[] = [];
    let paramIndex = 1;

    if (filters?.type) {
      whereClause += ` AND g.type = $${paramIndex++}`;
      values.push(filters.type);
    }

    if (filters?.search) {
      whereClause += ` AND (g.name ILIKE $${paramIndex} OR g.description ILIKE $${paramIndex})`;
      values.push(`%${filters.search}%`);
      paramIndex++;
    }

    // Validate sort column against allowed columns to prevent SQL injection
    const allowedSortColumns = ['name', 'type', 'created_at', 'updated_at'];
    const sortColumn = allowedSortColumns.includes(params.sort || '') ? params.sort : 'name';
    const sortOrder = params.order === 'desc' ? 'desc' : 'asc';

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM ${schema}.groups g ${whereClause}`,
      values
    );
    const total = parseInt(countResult.rows[0].count, 10);

    const result = await pool.query(
      `SELECT g.*,
              (SELECT COUNT(*) FROM ${schema}.group_members WHERE group_id = g.id) as member_count,
              u.name as manager_name
       FROM ${schema}.groups g
       LEFT JOIN ${schema}.users u ON g.manager_id = u.id
       ${whereClause}
       ORDER BY g.${sortColumn} ${sortOrder}
       LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      [...values, params.perPage, offset]
    );

    return { groups: result.rows, total };
  }

  async findById(tenantSlug: string, groupId: string): Promise<Group | null> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(
      `SELECT g.*,
              (SELECT COUNT(*) FROM ${schema}.group_members WHERE group_id = g.id) as member_count,
              u.name as manager_name,
              p.name as parent_name
       FROM ${schema}.groups g
       LEFT JOIN ${schema}.users u ON g.manager_id = u.id
       LEFT JOIN ${schema}.groups p ON g.parent_id = p.id
       WHERE g.id = $1`,
      [groupId]
    );

    return result.rows[0] || null;
  }

  async create(tenantSlug: string, params: CreateGroupParams, createdBy: string): Promise<Group> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(
      `INSERT INTO ${schema}.groups (name, description, type, parent_id, manager_id, email, settings)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        params.name,
        params.description || null,
        params.type || 'team',
        params.parentId || null,
        params.managerId || null,
        params.email || null,
        JSON.stringify(params.settings || {}),
      ]
    );

    const group = result.rows[0];

    // Log audit
    await pool.query(
      `INSERT INTO ${schema}.audit_logs (user_id, action, entity_type, entity_id, changes)
       VALUES ($1, 'create', 'group', $2, $3)`,
      [createdBy, group.id, JSON.stringify({ name: params.name })]
    );

    logger.info({ groupId: group.id, name: params.name }, 'Group created');
    return this.findById(tenantSlug, group.id) as Promise<Group>;
  }

  async update(tenantSlug: string, groupId: string, params: UpdateGroupParams, updatedBy: string): Promise<Group> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const existing = await this.findById(tenantSlug, groupId);
    if (!existing) {
      throw new NotFoundError('Group', groupId);
    }

    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (params.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(params.name);
    }
    if (params.description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(params.description);
    }
    if (params.type !== undefined) {
      updates.push(`type = $${paramIndex++}`);
      values.push(params.type);
    }
    if (params.parentId !== undefined) {
      updates.push(`parent_id = $${paramIndex++}`);
      values.push(params.parentId);
    }
    if (params.managerId !== undefined) {
      updates.push(`manager_id = $${paramIndex++}`);
      values.push(params.managerId);
    }
    if (params.email !== undefined) {
      updates.push(`email = $${paramIndex++}`);
      values.push(params.email);
    }
    if (params.settings !== undefined) {
      updates.push(`settings = $${paramIndex++}`);
      values.push(JSON.stringify(params.settings));
    }

    if (updates.length === 0) {
      return existing;
    }

    updates.push(`updated_at = NOW()`);
    values.push(groupId);

    await pool.query(
      `UPDATE ${schema}.groups SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
      values
    );

    // Log audit
    await pool.query(
      `INSERT INTO ${schema}.audit_logs (user_id, action, entity_type, entity_id, changes)
       VALUES ($1, 'update', 'group', $2, $3)`,
      [updatedBy, groupId, JSON.stringify(params)]
    );

    logger.info({ groupId }, 'Group updated');
    return this.findById(tenantSlug, groupId) as Promise<Group>;
  }

  async delete(tenantSlug: string, groupId: string, deletedBy: string): Promise<void> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const existing = await this.findById(tenantSlug, groupId);
    if (!existing) {
      throw new NotFoundError('Group', groupId);
    }

    await pool.query(`DELETE FROM ${schema}.groups WHERE id = $1`, [groupId]);

    // Log audit
    await pool.query(
      `INSERT INTO ${schema}.audit_logs (user_id, action, entity_type, entity_id)
       VALUES ($1, 'delete', 'group', $2)`,
      [deletedBy, groupId]
    );

    logger.info({ groupId }, 'Group deleted');
  }

  async getMembers(tenantSlug: string, groupId: string): Promise<unknown[]> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(
      `SELECT u.id, u.email, u.name, u.avatar_url, u.status, gm.role, gm.joined_at
       FROM ${schema}.users u
       JOIN ${schema}.group_members gm ON u.id = gm.user_id
       WHERE gm.group_id = $1
       ORDER BY gm.joined_at`,
      [groupId]
    );

    return result.rows;
  }

  async addMember(tenantSlug: string, groupId: string, userId: string, role: string = 'member', addedBy: string): Promise<void> {
    const schema = tenantService.getSchemaName(tenantSlug);

    // Check if already a member
    const existing = await pool.query(
      `SELECT 1 FROM ${schema}.group_members WHERE group_id = $1 AND user_id = $2`,
      [groupId, userId]
    );

    if (existing.rows.length > 0) {
      throw new ConflictError('User is already a member of this group');
    }

    await pool.query(
      `INSERT INTO ${schema}.group_members (group_id, user_id, role)
       VALUES ($1, $2, $3)`,
      [groupId, userId, role]
    );

    // Log audit
    await pool.query(
      `INSERT INTO ${schema}.audit_logs (user_id, action, entity_type, entity_id, changes)
       VALUES ($1, 'add_member', 'group', $2, $3)`,
      [addedBy, groupId, JSON.stringify({ userId, role })]
    );

    logger.info({ groupId, userId, role }, 'Member added to group');
  }

  async removeMember(tenantSlug: string, groupId: string, userId: string, removedBy: string): Promise<void> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(
      `DELETE FROM ${schema}.group_members WHERE group_id = $1 AND user_id = $2`,
      [groupId, userId]
    );

    if (result.rowCount === 0) {
      throw new NotFoundError('Group member');
    }

    // Log audit
    await pool.query(
      `INSERT INTO ${schema}.audit_logs (user_id, action, entity_type, entity_id, changes)
       VALUES ($1, 'remove_member', 'group', $2, $3)`,
      [removedBy, groupId, JSON.stringify({ userId })]
    );

    logger.info({ groupId, userId }, 'Member removed from group');
  }

  async updateMemberRole(tenantSlug: string, groupId: string, userId: string, role: string, _updatedBy: string): Promise<void> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(
      `UPDATE ${schema}.group_members SET role = $1 WHERE group_id = $2 AND user_id = $3`,
      [role, groupId, userId]
    );

    if (result.rowCount === 0) {
      throw new NotFoundError('Group member');
    }

    logger.info({ groupId, userId, role }, 'Member role updated');
  }
}

export const groupService = new GroupService();
