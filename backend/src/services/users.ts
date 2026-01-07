import bcrypt from 'bcrypt';
import { pool } from '../config/database.js';
import { tenantService } from './tenant.js';
import { NotFoundError, ConflictError, BadRequestError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { cacheService } from '../utils/cache.js';
import type { PaginationParams } from '../types/index.js';
import { getOffset } from '../utils/pagination.js';

interface CreateUserParams {
  email: string;
  name: string;
  password?: string;
  phone?: string;
  timezone?: string;
  status?: string;
  authProvider?: string;
  externalId?: string;
  roleIds?: string[];
}

interface UpdateUserParams {
  name?: string;
  phone?: string;
  timezone?: string;
  status?: string;
  avatarUrl?: string;
  settings?: Record<string, unknown>;
}

interface User {
  id: string;
  email: string;
  name: string;
  avatar_url: string | null;
  phone: string | null;
  timezone: string;
  status: string;
  auth_provider: string;
  last_login_at: Date | null;
  settings: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
  roles?: string[];
}

export class UserService {
  async list(tenantSlug: string, params: PaginationParams, filters?: { status?: string; search?: string }): Promise<{ users: User[]; total: number }> {
    const cacheKey = `${tenantSlug}:users:list:${JSON.stringify({ params, filters })}`;

    return cacheService.getOrSet(
      cacheKey,
      async () => {
        const schema = tenantService.getSchemaName(tenantSlug);
        const offset = getOffset(params);

        let whereClause = 'WHERE 1=1';
        const values: unknown[] = [];
        let paramIndex = 1;

        if (filters?.status) {
          whereClause += ` AND u.status = $${paramIndex++}`;
          values.push(filters.status);
        }

        if (filters?.search) {
          whereClause += ` AND (u.email ILIKE $${paramIndex} OR u.name ILIKE $${paramIndex})`;
          values.push(`%${filters.search}%`);
          paramIndex++;
        }

        // Validate sort column against allowed columns to prevent SQL injection
        const allowedSortColumns = ['name', 'email', 'created_at', 'updated_at', 'status', 'last_login_at'];
        const sortColumn = allowedSortColumns.includes(params.sort || '') ? params.sort : 'created_at';
        const sortOrder = params.order === 'asc' ? 'asc' : 'desc';

        const countResult = await pool.query(
          `SELECT COUNT(*) FROM ${schema}.users u ${whereClause}`,
          values
        );
        const total = parseInt(countResult.rows[0].count, 10);

        const result = await pool.query(
          `SELECT u.id, u.email, u.name, u.avatar_url, u.phone, u.timezone, u.status,
                  u.auth_provider, u.last_login_at, u.settings, u.created_at, u.updated_at,
                  array_agg(r.name) FILTER (WHERE r.name IS NOT NULL) as roles
           FROM ${schema}.users u
           LEFT JOIN ${schema}.user_roles ur ON u.id = ur.user_id
           LEFT JOIN ${schema}.roles r ON ur.role_id = r.id
           ${whereClause}
           GROUP BY u.id
           ORDER BY u.${sortColumn} ${sortOrder}
           LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
          [...values, params.perPage, offset]
        );

        return { users: result.rows, total };
      },
      { ttl: 600 } // 10 minutes - balances read frequency with user/role changes
    );
  }

  async findById(tenantSlug: string, userId: string): Promise<User | null> {
    const cacheKey = `${tenantSlug}:users:user:${userId}`;

    return cacheService.getOrSet(
      cacheKey,
      async () => {
        const schema = tenantService.getSchemaName(tenantSlug);

        const result = await pool.query(
          `SELECT u.id, u.email, u.name, u.avatar_url, u.phone, u.timezone, u.status,
                  u.auth_provider, u.last_login_at, u.settings, u.created_at, u.updated_at,
                  array_agg(r.name) FILTER (WHERE r.name IS NOT NULL) as roles
           FROM ${schema}.users u
           LEFT JOIN ${schema}.user_roles ur ON u.id = ur.user_id
           LEFT JOIN ${schema}.roles r ON ur.role_id = r.id
           WHERE u.id = $1
           GROUP BY u.id`,
          [userId]
        );

        return result.rows[0] || null;
      },
      { ttl: 600 } // 10 minutes - individual user lookups for assignments, profiles
    );
  }

  async findByEmail(tenantSlug: string, email: string): Promise<User | null> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(
      `SELECT * FROM ${schema}.users WHERE email = $1`,
      [email]
    );

    return result.rows[0] || null;
  }

  async create(tenantSlug: string, params: CreateUserParams, createdBy?: string): Promise<User> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Check if email already exists
      const existing = await client.query(
        `SELECT id FROM ${schema}.users WHERE email = $1`,
        [params.email]
      );

      if (existing.rows.length > 0) {
        throw new ConflictError(`User with email '${params.email}' already exists`);
      }

      let passwordHash = null;
      if (params.password) {
        passwordHash = await bcrypt.hash(params.password, 12);
      }

      const result = await client.query(
        `INSERT INTO ${schema}.users (email, name, password_hash, phone, timezone, status, auth_provider, external_id, email_verified)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [
          params.email,
          params.name,
          passwordHash,
          params.phone || null,
          params.timezone || 'UTC',
          params.status || 'active',
          params.authProvider || 'local',
          params.externalId || null,
          false, // email_verified defaults to false for new users
        ]
      );

      const user = result.rows[0];

      // Assign roles
      if (params.roleIds && params.roleIds.length > 0) {
        // Validate that all role IDs exist before assigning
        const roleValidation = await client.query(
          `SELECT id FROM ${schema}.roles WHERE id = ANY($1)`,
          [params.roleIds]
        );
        const validRoleIds = new Set(roleValidation.rows.map((r: { id: string }) => r.id));
        const invalidRoles = params.roleIds.filter(id => !validRoleIds.has(id));
        if (invalidRoles.length > 0) {
          throw new BadRequestError(`Invalid role IDs: ${invalidRoles.join(', ')}`);
        }

        // Batch insert user roles (N+1 fix)
        const roleIds = params.roleIds; // Type narrowing
        const values: unknown[] = [user.id, createdBy];
        const valuePlaceholders = roleIds.map((_, idx) => {
          values.push(roleIds[idx]);
          return `($1, $${idx + 3}, $2)`;
        }).join(', ');

        await client.query(
          `INSERT INTO ${schema}.user_roles (user_id, role_id, granted_by)
           VALUES ${valuePlaceholders}`,
          values
        );
      } else {
        // Assign default 'requester' role
        await client.query(
          `INSERT INTO ${schema}.user_roles (user_id, role_id, granted_by)
           SELECT $1, id, $2 FROM ${schema}.roles WHERE name = 'requester'`,
          [user.id, createdBy]
        );
      }

      // Log audit
      await client.query(
        `INSERT INTO ${schema}.audit_logs (user_id, action, entity_type, entity_id, changes)
         VALUES ($1, 'create', 'user', $2, $3)`,
        [createdBy, user.id, JSON.stringify({ email: params.email, name: params.name })]
      );

      await client.query('COMMIT');

      // Invalidate user cache
      await cacheService.invalidateTenant(tenantSlug, 'users');

      logger.info({ userId: user.id, email: params.email }, 'User created');
      return this.findById(tenantSlug, user.id) as Promise<User>;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async update(tenantSlug: string, userId: string, params: UpdateUserParams, updatedBy: string): Promise<User> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const existing = await this.findById(tenantSlug, userId);
    if (!existing) {
      throw new NotFoundError('User', userId);
    }

    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (params.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(params.name);
    }
    if (params.phone !== undefined) {
      updates.push(`phone = $${paramIndex++}`);
      values.push(params.phone);
    }
    if (params.timezone !== undefined) {
      updates.push(`timezone = $${paramIndex++}`);
      values.push(params.timezone);
    }
    if (params.status !== undefined) {
      updates.push(`status = $${paramIndex++}`);
      values.push(params.status);
    }
    if (params.avatarUrl !== undefined) {
      updates.push(`avatar_url = $${paramIndex++}`);
      values.push(params.avatarUrl);
    }
    if (params.settings !== undefined) {
      updates.push(`settings = $${paramIndex++}`);
      values.push(JSON.stringify(params.settings));
    }

    if (updates.length === 0) {
      return existing;
    }

    updates.push(`updated_at = NOW()`);
    values.push(userId);

    await pool.query(
      `UPDATE ${schema}.users SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
      values
    );

    // Log audit
    await pool.query(
      `INSERT INTO ${schema}.audit_logs (user_id, action, entity_type, entity_id, changes)
       VALUES ($1, 'update', 'user', $2, $3)`,
      [updatedBy, userId, JSON.stringify(params)]
    );

    // Invalidate user cache
    await cacheService.invalidateTenant(tenantSlug, 'users');

    logger.info({ userId }, 'User updated');
    return this.findById(tenantSlug, userId) as Promise<User>;
  }

  async delete(tenantSlug: string, userId: string, deletedBy: string): Promise<void> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const existing = await this.findById(tenantSlug, userId);
    if (!existing) {
      throw new NotFoundError('User', userId);
    }

    // Soft delete by setting status to 'inactive'
    await pool.query(
      `UPDATE ${schema}.users SET status = 'inactive', updated_at = NOW() WHERE id = $1`,
      [userId]
    );

    // Log audit
    await pool.query(
      `INSERT INTO ${schema}.audit_logs (user_id, action, entity_type, entity_id)
       VALUES ($1, 'delete', 'user', $2)`,
      [deletedBy, userId]
    );

    // Invalidate user cache
    await cacheService.invalidateTenant(tenantSlug, 'users');

    logger.info({ userId }, 'User deleted');
  }

  async assignRoles(tenantSlug: string, userId: string, roleIds: string[], grantedBy: string): Promise<void> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Remove existing roles
      await client.query(
        `DELETE FROM ${schema}.user_roles WHERE user_id = $1`,
        [userId]
      );

      // Assign new roles (batch insert - N+1 fix)
      if (roleIds.length > 0) {
        const values: unknown[] = [userId, grantedBy];
        const valuePlaceholders = roleIds.map((_, idx) => {
          values.push(roleIds[idx]);
          return `($1, $${idx + 3}, $2)`;
        }).join(', ');

        await client.query(
          `INSERT INTO ${schema}.user_roles (user_id, role_id, granted_by)
           VALUES ${valuePlaceholders}`,
          values
        );
      }

      await client.query('COMMIT');

      // Invalidate user cache (roles affect cached user data)
      await cacheService.invalidateTenant(tenantSlug, 'users');

      logger.info({ userId, roleIds }, 'User roles updated');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getUserGroups(tenantSlug: string, userId: string): Promise<unknown[]> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(
      `SELECT g.*, gm.role as member_role, gm.joined_at
       FROM ${schema}.groups g
       JOIN ${schema}.group_members gm ON g.id = gm.group_id
       WHERE gm.user_id = $1`,
      [userId]
    );

    return result.rows;
  }
}

export const userService = new UserService();
