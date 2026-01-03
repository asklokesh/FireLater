import { Pool } from 'pg';
import { logger } from '../utils/logger.js';

export async function migration016Assets(pool: Pool): Promise<void> {
  await pool.query(`
    -- ============================================
    -- ASSET MANAGEMENT / CMDB MODULE
    -- ============================================
    -- Configuration Items (CI) management for
    -- hardware, software, and infrastructure

    SET search_path TO tenant_template;

    -- Add ASSET ID sequence if not exists
    INSERT INTO id_sequences (entity_type, prefix, current_value)
    VALUES ('ASSET', 'AST', 0)
    ON CONFLICT (entity_type) DO NOTHING;

    -- ============================================
    -- ASSETS TABLE
    -- ============================================

    CREATE TABLE IF NOT EXISTS assets (
        id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        asset_tag           VARCHAR(50) NOT NULL UNIQUE,
        name                VARCHAR(200) NOT NULL,
        description         TEXT,

        -- Classification
        asset_type          VARCHAR(50) NOT NULL,
        category            VARCHAR(50) NOT NULL,
        status              VARCHAR(50) DEFAULT 'active',

        -- Location & ownership
        location            VARCHAR(200),
        department          VARCHAR(100),
        owner_id            UUID REFERENCES users(id) ON DELETE SET NULL,
        assigned_to_id      UUID REFERENCES users(id) ON DELETE SET NULL,

        -- Hardware details
        manufacturer        VARCHAR(100),
        model               VARCHAR(100),
        serial_number       VARCHAR(100),

        -- Software details
        version             VARCHAR(50),
        license_type        VARCHAR(50),
        license_count       INTEGER,
        license_expiry      DATE,

        -- Financial
        purchase_date       DATE,
        purchase_cost       DECIMAL(12, 2),
        warranty_expiry     DATE,
        vendor              VARCHAR(100),
        po_number           VARCHAR(50),

        -- Network
        ip_address          VARCHAR(50),
        mac_address         VARCHAR(50),
        hostname            VARCHAR(100),

        -- Custom attributes
        attributes          JSONB DEFAULT '{}',

        -- Audit
        created_by          UUID REFERENCES users(id),
        created_at          TIMESTAMPTZ DEFAULT NOW(),
        updated_at          TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_assets_tag ON assets(asset_tag);
    CREATE INDEX IF NOT EXISTS idx_assets_type ON assets(asset_type);
    CREATE INDEX IF NOT EXISTS idx_assets_category ON assets(category);
    CREATE INDEX IF NOT EXISTS idx_assets_status ON assets(status);
    CREATE INDEX IF NOT EXISTS idx_assets_owner ON assets(owner_id);
    CREATE INDEX IF NOT EXISTS idx_assets_assigned ON assets(assigned_to_id);
    CREATE INDEX IF NOT EXISTS idx_assets_serial ON assets(serial_number) WHERE serial_number IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_assets_hostname ON assets(hostname) WHERE hostname IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_assets_ip ON assets(ip_address) WHERE ip_address IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_assets_warranty ON assets(warranty_expiry) WHERE warranty_expiry IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_assets_license_expiry ON assets(license_expiry) WHERE license_expiry IS NOT NULL;

    -- ============================================
    -- ASSET RELATIONSHIPS (CMDB Dependencies)
    -- ============================================

    CREATE TABLE IF NOT EXISTS asset_relationships (
        id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        parent_asset_id     UUID REFERENCES assets(id) ON DELETE CASCADE,
        child_asset_id      UUID REFERENCES assets(id) ON DELETE CASCADE,
        relationship_type   VARCHAR(50) NOT NULL,
        created_at          TIMESTAMPTZ DEFAULT NOW(),
        CONSTRAINT unique_asset_relationship UNIQUE (parent_asset_id, child_asset_id, relationship_type)
    );

    CREATE INDEX IF NOT EXISTS idx_asset_rel_parent ON asset_relationships(parent_asset_id);
    CREATE INDEX IF NOT EXISTS idx_asset_rel_child ON asset_relationships(child_asset_id);
    CREATE INDEX IF NOT EXISTS idx_asset_rel_type ON asset_relationships(relationship_type);

    -- ============================================
    -- ASSET ISSUE LINKS
    -- ============================================

    CREATE TABLE IF NOT EXISTS asset_issue_links (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        asset_id    UUID REFERENCES assets(id) ON DELETE CASCADE,
        issue_id    UUID REFERENCES issues(id) ON DELETE CASCADE,
        created_at  TIMESTAMPTZ DEFAULT NOW(),
        CONSTRAINT unique_asset_issue UNIQUE (asset_id, issue_id)
    );

    CREATE INDEX IF NOT EXISTS idx_asset_issue_asset ON asset_issue_links(asset_id);
    CREATE INDEX IF NOT EXISTS idx_asset_issue_issue ON asset_issue_links(issue_id);

    -- ============================================
    -- ASSET CHANGE LINKS
    -- ============================================

    CREATE TABLE IF NOT EXISTS asset_change_links (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        asset_id    UUID REFERENCES assets(id) ON DELETE CASCADE,
        change_id   UUID REFERENCES changes(id) ON DELETE CASCADE,
        created_at  TIMESTAMPTZ DEFAULT NOW(),
        CONSTRAINT unique_asset_change UNIQUE (asset_id, change_id)
    );

    CREATE INDEX IF NOT EXISTS idx_asset_change_asset ON asset_change_links(asset_id);
    CREATE INDEX IF NOT EXISTS idx_asset_change_change ON asset_change_links(change_id);

    -- ============================================
    -- ASSET AUDIT HISTORY
    -- ============================================

    CREATE TABLE IF NOT EXISTS asset_history (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        asset_id        UUID REFERENCES assets(id) ON DELETE CASCADE,
        changed_by      UUID REFERENCES users(id),
        action          VARCHAR(50) NOT NULL,
        field_changes   JSONB,
        created_at      TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_asset_history_asset ON asset_history(asset_id);
    CREATE INDEX IF NOT EXISTS idx_asset_history_created ON asset_history(created_at DESC);

    -- ============================================
    -- ASSET PERMISSIONS
    -- ============================================

    INSERT INTO permissions (resource, action, description) VALUES
        ('assets', 'create', 'Create assets'),
        ('assets', 'read', 'View assets'),
        ('assets', 'update', 'Update assets'),
        ('assets', 'delete', 'Delete assets'),
        ('assets', 'link', 'Link assets to issues/changes'),
        ('asset_relationships', 'create', 'Create asset relationships'),
        ('asset_relationships', 'delete', 'Delete asset relationships')
    ON CONFLICT (resource, action) DO NOTHING;

    -- Grant permissions to admin role
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT r.id, p.id
    FROM roles r, permissions p
    WHERE r.name = 'admin'
    AND p.resource IN ('assets', 'asset_relationships')
    ON CONFLICT DO NOTHING;

    -- Grant permissions to manager role
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT r.id, p.id
    FROM roles r, permissions p
    WHERE r.name = 'manager'
    AND (p.resource, p.action) IN (
        ('assets', 'create'),
        ('assets', 'read'),
        ('assets', 'update'),
        ('assets', 'link'),
        ('asset_relationships', 'create'),
        ('asset_relationships', 'delete')
    )
    ON CONFLICT DO NOTHING;

    -- Grant read permissions to agent role
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT r.id, p.id
    FROM roles r, permissions p
    WHERE r.name = 'agent'
    AND (p.resource, p.action) IN (
        ('assets', 'read'),
        ('assets', 'link')
    )
    ON CONFLICT DO NOTHING;

    RESET search_path;
  `);

  // Apply to existing tenant schemas
  const tenantsResult = await pool.query(`
    SELECT slug FROM public.tenants WHERE status = 'active'
  `);

  for (const tenant of tenantsResult.rows) {
    const schema = `tenant_${tenant.slug.replace(/-/g, '_')}`;

    try {
      await pool.query(`
        SET search_path TO ${schema};

        -- Add ASSET ID sequence if not exists
        INSERT INTO id_sequences (entity_type, prefix, current_value)
        VALUES ('ASSET', 'AST', 0)
        ON CONFLICT (entity_type) DO NOTHING;

        -- Assets
        CREATE TABLE IF NOT EXISTS assets (
            id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            asset_tag           VARCHAR(50) NOT NULL UNIQUE,
            name                VARCHAR(200) NOT NULL,
            description         TEXT,
            asset_type          VARCHAR(50) NOT NULL,
            category            VARCHAR(50) NOT NULL,
            status              VARCHAR(50) DEFAULT 'active',
            location            VARCHAR(200),
            department          VARCHAR(100),
            owner_id            UUID REFERENCES users(id) ON DELETE SET NULL,
            assigned_to_id      UUID REFERENCES users(id) ON DELETE SET NULL,
            manufacturer        VARCHAR(100),
            model               VARCHAR(100),
            serial_number       VARCHAR(100),
            version             VARCHAR(50),
            license_type        VARCHAR(50),
            license_count       INTEGER,
            license_expiry      DATE,
            purchase_date       DATE,
            purchase_cost       DECIMAL(12, 2),
            warranty_expiry     DATE,
            vendor              VARCHAR(100),
            po_number           VARCHAR(50),
            ip_address          VARCHAR(50),
            mac_address         VARCHAR(50),
            hostname            VARCHAR(100),
            attributes          JSONB DEFAULT '{}',
            created_by          UUID REFERENCES users(id),
            created_at          TIMESTAMPTZ DEFAULT NOW(),
            updated_at          TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_assets_tag ON assets(asset_tag);
        CREATE INDEX IF NOT EXISTS idx_assets_type ON assets(asset_type);
        CREATE INDEX IF NOT EXISTS idx_assets_category ON assets(category);
        CREATE INDEX IF NOT EXISTS idx_assets_status ON assets(status);
        CREATE INDEX IF NOT EXISTS idx_assets_owner ON assets(owner_id);
        CREATE INDEX IF NOT EXISTS idx_assets_assigned ON assets(assigned_to_id);
        CREATE INDEX IF NOT EXISTS idx_assets_serial ON assets(serial_number) WHERE serial_number IS NOT NULL;
        CREATE INDEX IF NOT EXISTS idx_assets_hostname ON assets(hostname) WHERE hostname IS NOT NULL;
        CREATE INDEX IF NOT EXISTS idx_assets_ip ON assets(ip_address) WHERE ip_address IS NOT NULL;
        CREATE INDEX IF NOT EXISTS idx_assets_warranty ON assets(warranty_expiry) WHERE warranty_expiry IS NOT NULL;
        CREATE INDEX IF NOT EXISTS idx_assets_license_expiry ON assets(license_expiry) WHERE license_expiry IS NOT NULL;

        -- Asset Relationships
        CREATE TABLE IF NOT EXISTS asset_relationships (
            id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            parent_asset_id     UUID REFERENCES assets(id) ON DELETE CASCADE,
            child_asset_id      UUID REFERENCES assets(id) ON DELETE CASCADE,
            relationship_type   VARCHAR(50) NOT NULL,
            created_at          TIMESTAMPTZ DEFAULT NOW(),
            CONSTRAINT unique_asset_relationship UNIQUE (parent_asset_id, child_asset_id, relationship_type)
        );

        CREATE INDEX IF NOT EXISTS idx_asset_rel_parent ON asset_relationships(parent_asset_id);
        CREATE INDEX IF NOT EXISTS idx_asset_rel_child ON asset_relationships(child_asset_id);
        CREATE INDEX IF NOT EXISTS idx_asset_rel_type ON asset_relationships(relationship_type);

        -- Asset Issue Links
        CREATE TABLE IF NOT EXISTS asset_issue_links (
            id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            asset_id    UUID REFERENCES assets(id) ON DELETE CASCADE,
            issue_id    UUID REFERENCES issues(id) ON DELETE CASCADE,
            created_at  TIMESTAMPTZ DEFAULT NOW(),
            CONSTRAINT unique_asset_issue UNIQUE (asset_id, issue_id)
        );

        CREATE INDEX IF NOT EXISTS idx_asset_issue_asset ON asset_issue_links(asset_id);
        CREATE INDEX IF NOT EXISTS idx_asset_issue_issue ON asset_issue_links(issue_id);

        -- Asset Change Links
        CREATE TABLE IF NOT EXISTS asset_change_links (
            id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            asset_id    UUID REFERENCES assets(id) ON DELETE CASCADE,
            change_id   UUID REFERENCES changes(id) ON DELETE CASCADE,
            created_at  TIMESTAMPTZ DEFAULT NOW(),
            CONSTRAINT unique_asset_change UNIQUE (asset_id, change_id)
        );

        CREATE INDEX IF NOT EXISTS idx_asset_change_asset ON asset_change_links(asset_id);
        CREATE INDEX IF NOT EXISTS idx_asset_change_change ON asset_change_links(change_id);

        -- Asset History
        CREATE TABLE IF NOT EXISTS asset_history (
            id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            asset_id        UUID REFERENCES assets(id) ON DELETE CASCADE,
            changed_by      UUID REFERENCES users(id),
            action          VARCHAR(50) NOT NULL,
            field_changes   JSONB,
            created_at      TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_asset_history_asset ON asset_history(asset_id);
        CREATE INDEX IF NOT EXISTS idx_asset_history_created ON asset_history(created_at DESC);

        -- Add permissions
        INSERT INTO permissions (resource, action, description) VALUES
            ('assets', 'create', 'Create assets'),
            ('assets', 'read', 'View assets'),
            ('assets', 'update', 'Update assets'),
            ('assets', 'delete', 'Delete assets'),
            ('assets', 'link', 'Link assets to issues/changes'),
            ('asset_relationships', 'create', 'Create asset relationships'),
            ('asset_relationships', 'delete', 'Delete asset relationships')
        ON CONFLICT (resource, action) DO NOTHING;

        -- Grant permissions
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT r.id, p.id
        FROM roles r, permissions p
        WHERE r.name = 'admin'
        AND p.resource IN ('assets', 'asset_relationships')
        ON CONFLICT DO NOTHING;

        INSERT INTO role_permissions (role_id, permission_id)
        SELECT r.id, p.id
        FROM roles r, permissions p
        WHERE r.name = 'manager'
        AND (p.resource, p.action) IN (
            ('assets', 'create'),
            ('assets', 'read'),
            ('assets', 'update'),
            ('assets', 'link'),
            ('asset_relationships', 'create'),
            ('asset_relationships', 'delete')
        )
        ON CONFLICT DO NOTHING;

        INSERT INTO role_permissions (role_id, permission_id)
        SELECT r.id, p.id
        FROM roles r, permissions p
        WHERE r.name = 'agent'
        AND (p.resource, p.action) IN (
            ('assets', 'read'),
            ('assets', 'link')
        )
        ON CONFLICT DO NOTHING;

        RESET search_path;
      `);
    } catch (err) {
      logger.error({ err, tenantSlug: tenant.slug }, 'Failed to apply assets migration to tenant');
    }
  }
}
