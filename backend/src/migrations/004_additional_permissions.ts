import { Pool } from 'pg';

export async function migration004AdditionalPermissions(pool: Pool): Promise<void> {
  await pool.query(`
    SET search_path TO tenant_template;

    -- Add missing permissions for requests and approvals
    INSERT INTO permissions (resource, action, description) VALUES
        ('requests', 'assign', 'Assign service requests'),
        ('approvals', 'read', 'View approvals'),
        ('approvals', 'approve', 'Approve or reject requests')
    ON CONFLICT (resource, action) DO NOTHING;

    -- Assign new permissions to admin role
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT r.id, p.id
    FROM roles r, permissions p
    WHERE r.name = 'admin'
    AND (p.resource, p.action) IN (
        ('requests', 'assign'),
        ('approvals', 'read'),
        ('approvals', 'approve')
    )
    ON CONFLICT DO NOTHING;

    -- Assign permissions to manager role
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT r.id, p.id
    FROM roles r, permissions p
    WHERE r.name = 'manager'
    AND (p.resource, p.action) IN (
        ('requests', 'assign'),
        ('approvals', 'read'),
        ('approvals', 'approve')
    )
    ON CONFLICT DO NOTHING;

    -- Assign permissions to agent role
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT r.id, p.id
    FROM roles r, permissions p
    WHERE r.name = 'agent'
    AND (p.resource, p.action) IN (
        ('requests', 'assign'),
        ('approvals', 'read')
    )
    ON CONFLICT DO NOTHING;

    RESET search_path;
  `);
}
