import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pool } from '../config/database.js';
import { tenantService } from '../services/tenant.js';
import { requirePermission, requireRole } from '../middleware/auth.js';
import { NotFoundError, BadRequestError } from '../utils/errors.js';

const createRoleSchema = z.object({
  name: z.string().min(2).max(100).regex(/^[a-z_]+$/),
  displayName: z.string().min(2).max(255),
  description: z.string().max(1000).optional(),
  permissionIds: z.array(z.string().uuid()).optional(),
});

const updateRoleSchema = z.object({
  displayName: z.string().min(2).max(255).optional(),
  description: z.string().max(1000).optional(),
  permissionIds: z.array(z.string().uuid()).optional(),
});

export default async function roleRoutes(app: FastifyInstance) {
  // List roles
  app.get('/', {
    preHandler: [requirePermission('users:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(
      `SELECT r.*, COUNT(ur.user_id) as user_count
       FROM ${schema}.roles r
       LEFT JOIN ${schema}.user_roles ur ON r.id = ur.role_id
       GROUP BY r.id
       ORDER BY r.is_system DESC, r.name`
    );

    reply.send({ data: result.rows });
  });

  // Get role with permissions
  app.get<{ Params: { id: string } }>('/:id', {
    preHandler: [requirePermission('users:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const schema = tenantService.getSchemaName(tenantSlug);

    const roleResult = await pool.query(
      `SELECT * FROM ${schema}.roles WHERE id = $1`,
      [request.params.id]
    );

    if (roleResult.rows.length === 0) {
      throw new NotFoundError('Role', request.params.id);
    }

    const permissionsResult = await pool.query(
      `SELECT p.* FROM ${schema}.permissions p
       JOIN ${schema}.role_permissions rp ON p.id = rp.permission_id
       WHERE rp.role_id = $1
       ORDER BY p.resource, p.action`,
      [request.params.id]
    );

    reply.send({
      ...roleResult.rows[0],
      permissions: permissionsResult.rows,
    });
  });

  // Create custom role
  app.post('/', {
    preHandler: [requireRole('admin')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const schema = tenantService.getSchemaName(tenantSlug);
    const body = createRoleSchema.parse(request.body);
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const roleResult = await client.query(
        `INSERT INTO ${schema}.roles (name, display_name, description, is_system)
         VALUES ($1, $2, $3, false)
         RETURNING *`,
        [body.name, body.displayName, body.description]
      );

      const role = roleResult.rows[0];

      // Assign permissions (batch insert - N+1 fix)
      if (body.permissionIds && body.permissionIds.length > 0) {
        const permissionIds = body.permissionIds; // Type narrowing
        const values: unknown[] = [role.id];
        const valuePlaceholders = permissionIds.map((_, idx) => {
          values.push(permissionIds[idx]);
          return `($1, $${idx + 2})`;
        }).join(', ');

        await client.query(
          `INSERT INTO ${schema}.role_permissions (role_id, permission_id)
           VALUES ${valuePlaceholders}`,
          values
        );
      }

      // Log audit
      await client.query(
        `INSERT INTO ${schema}.audit_logs (user_id, action, entity_type, entity_id, changes)
         VALUES ($1, 'create', 'role', $2, $3)`,
        [userId, role.id, JSON.stringify({ name: body.name })]
      );

      await client.query('COMMIT');

      reply.status(201).send(role);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  // Update role
  app.put<{ Params: { id: string } }>('/:id', {
    preHandler: [requireRole('admin')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const schema = tenantService.getSchemaName(tenantSlug);
    const body = updateRoleSchema.parse(request.body);
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Check if role exists and is not a system role
      const existingResult = await client.query(
        `SELECT * FROM ${schema}.roles WHERE id = $1`,
        [request.params.id]
      );

      if (existingResult.rows.length === 0) {
        throw new NotFoundError('Role', request.params.id);
      }

      const existing = existingResult.rows[0];

      if (existing.is_system && body.permissionIds) {
        throw new BadRequestError('Cannot modify permissions of system roles');
      }

      // Update role
      const updates: string[] = [];
      const values: unknown[] = [];
      let paramIndex = 1;

      if (body.displayName !== undefined) {
        updates.push(`display_name = $${paramIndex++}`);
        values.push(body.displayName);
      }
      if (body.description !== undefined) {
        updates.push(`description = $${paramIndex++}`);
        values.push(body.description);
      }

      if (updates.length > 0) {
        values.push(request.params.id);
        await client.query(
          `UPDATE ${schema}.roles SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
          values
        );
      }

      // Update permissions if provided and not system role
      if (body.permissionIds && !existing.is_system) {
        await client.query(
          `DELETE FROM ${schema}.role_permissions WHERE role_id = $1`,
          [request.params.id]
        );

        // Batch insert permissions (N+1 fix)
        if (body.permissionIds.length > 0) {
          const permissionIds = body.permissionIds; // Type narrowing
          const values: unknown[] = [request.params.id];
          const valuePlaceholders = permissionIds.map((_, idx) => {
            values.push(permissionIds[idx]);
            return `($1, $${idx + 2})`;
          }).join(', ');

          await client.query(
            `INSERT INTO ${schema}.role_permissions (role_id, permission_id)
             VALUES ${valuePlaceholders}`,
            values
          );
        }
      }

      await client.query('COMMIT');

      // Fetch updated role
      const updatedResult = await pool.query(
        `SELECT * FROM ${schema}.roles WHERE id = $1`,
        [request.params.id]
      );

      reply.send(updatedResult.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  // Delete role
  app.delete<{ Params: { id: string } }>('/:id', {
    preHandler: [requireRole('admin')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const schema = tenantService.getSchemaName(tenantSlug);

    // Check if role exists and is not a system role
    const existingResult = await pool.query(
      `SELECT * FROM ${schema}.roles WHERE id = $1`,
      [request.params.id]
    );

    if (existingResult.rows.length === 0) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: `Role with id '${request.params.id}' not found`,
      });
    }

    const existing = existingResult.rows[0];
    if (existing.is_system) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Cannot delete system roles',
      });
    }

    // Delete role (cascade will handle role_permissions and user_roles)
    await pool.query(
      `DELETE FROM ${schema}.roles WHERE id = $1`,
      [request.params.id]
    );

    reply.status(204).send();
  });

  // List all permissions
  app.get('/permissions', {
    preHandler: [requirePermission('users:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(
      `SELECT * FROM ${schema}.permissions ORDER BY resource, action`
    );

    // Group by resource
    const grouped = result.rows.reduce((acc, p) => {
      if (!acc[p.resource]) {
        acc[p.resource] = [];
      }
      acc[p.resource].push(p);
      return acc;
    }, {} as Record<string, unknown[]>);

    reply.send({ data: result.rows, grouped });
  });
}
