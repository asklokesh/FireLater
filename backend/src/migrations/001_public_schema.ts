import { Pool } from 'pg';

export async function migration001PublicSchema(pool: Pool): Promise<void> {
  await pool.query(`
    -- ============================================
    -- PUBLIC SCHEMA (Shared across all tenants)
    -- ============================================

    CREATE EXTENSION IF NOT EXISTS "pgcrypto";

    CREATE TABLE IF NOT EXISTS plans (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name            VARCHAR(100) NOT NULL UNIQUE,
        display_name    VARCHAR(255) NOT NULL,
        max_users       INTEGER,
        max_applications INTEGER,
        features        JSONB DEFAULT '{}',
        price_monthly   DECIMAL(10,2),
        price_yearly    DECIMAL(10,2),
        is_active       BOOLEAN DEFAULT true,
        created_at      TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS tenants (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name            VARCHAR(255) NOT NULL,
        slug            VARCHAR(100) UNIQUE NOT NULL,
        plan_id         UUID REFERENCES plans(id),
        status          VARCHAR(50) DEFAULT 'active',
        settings        JSONB DEFAULT '{}',
        billing_email   VARCHAR(255),
        trial_ends_at   TIMESTAMPTZ,
        created_at      TIMESTAMPTZ DEFAULT NOW(),
        updated_at      TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_tenants_slug ON tenants(slug);
    CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status);

    -- Insert default plans
    INSERT INTO plans (name, display_name, max_users, max_applications, price_monthly, price_yearly, features) VALUES
        ('starter', 'Starter', 10, 25, 29.00, 290.00, '{"issues": true, "requests": false, "oncall": false, "changes": false}'),
        ('professional', 'Professional', 50, 100, 99.00, 990.00, '{"issues": true, "requests": true, "oncall": true, "changes": false}'),
        ('enterprise', 'Enterprise', NULL, NULL, 299.00, 2990.00, '{"issues": true, "requests": true, "oncall": true, "changes": true, "cloud_integration": true}')
    ON CONFLICT (name) DO NOTHING;
  `);
}
