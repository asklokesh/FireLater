import { Pool } from 'pg';
import { logger } from '../utils/logger.js';

export async function migration029DataResidency(pool: Pool): Promise<void> {
  // Apply to tenant_template first
  await pool.query(`
    -- Per-tenant residency and encryption settings
    CREATE TABLE IF NOT EXISTS tenant_template.data_security_settings (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      data_residency_region VARCHAR(50) DEFAULT 'us-east-1',
      encryption_key_id VARCHAR(255),
      pii_masking_enabled BOOLEAN DEFAULT true,
      pci_tokenization_enabled BOOLEAN DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Field classification registry
    CREATE TABLE IF NOT EXISTS tenant_template.field_classifications (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      table_name VARCHAR(100) NOT NULL,
      field_name VARCHAR(100) NOT NULL,
      classification VARCHAR(20) NOT NULL CHECK (classification IN ('PII','PCI','NPI','SENSITIVE')),
      masking_strategy VARCHAR(20) DEFAULT 'partial' CHECK (masking_strategy IN ('full','partial','tokenize','hash')),
      unmask_permission VARCHAR(100) DEFAULT 'admin:write',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(table_name, field_name)
    );

    -- Unmask audit events
    CREATE TABLE IF NOT EXISTS tenant_template.unmask_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      actor_id VARCHAR(255) NOT NULL,
      actor_email VARCHAR(255),
      table_name VARCHAR(100) NOT NULL,
      field_name VARCHAR(100) NOT NULL,
      entity_id VARCHAR(255) NOT NULL,
      reason TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Seed default field classifications
    INSERT INTO tenant_template.field_classifications (table_name, field_name, classification, masking_strategy, unmask_permission)
    VALUES
      ('users', 'ssn', 'PII', 'hash', 'admin:write'),
      ('users', 'credit_card', 'PCI', 'tokenize', 'admin:write'),
      ('users', 'account_number', 'PCI', 'partial', 'admin:write'),
      ('users', 'phone', 'PII', 'partial', 'user:read')
    ON CONFLICT (table_name, field_name) DO NOTHING;
  `);

  logger.info('Created data_security_settings, field_classifications, unmask_events in tenant_template');

  // Apply to all existing tenant schemas
  const tenantSchemas = await pool.query(`
    SELECT schema_name
    FROM information_schema.schemata
    WHERE schema_name LIKE 'tenant_%'
    AND schema_name != 'tenant_template'
  `);

  for (const row of tenantSchemas.rows) {
    const schema = row.schema_name;

    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${schema}.data_security_settings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        data_residency_region VARCHAR(50) DEFAULT 'us-east-1',
        encryption_key_id VARCHAR(255),
        pii_masking_enabled BOOLEAN DEFAULT true,
        pci_tokenization_enabled BOOLEAN DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS ${schema}.field_classifications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        table_name VARCHAR(100) NOT NULL,
        field_name VARCHAR(100) NOT NULL,
        classification VARCHAR(20) NOT NULL CHECK (classification IN ('PII','PCI','NPI','SENSITIVE')),
        masking_strategy VARCHAR(20) DEFAULT 'partial' CHECK (masking_strategy IN ('full','partial','tokenize','hash')),
        unmask_permission VARCHAR(100) DEFAULT 'admin:write',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(table_name, field_name)
      );

      CREATE TABLE IF NOT EXISTS ${schema}.unmask_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        actor_id VARCHAR(255) NOT NULL,
        actor_email VARCHAR(255),
        table_name VARCHAR(100) NOT NULL,
        field_name VARCHAR(100) NOT NULL,
        entity_id VARCHAR(255) NOT NULL,
        reason TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      INSERT INTO ${schema}.field_classifications (table_name, field_name, classification, masking_strategy, unmask_permission)
      VALUES
        ('users', 'ssn', 'PII', 'hash', 'admin:write'),
        ('users', 'credit_card', 'PCI', 'tokenize', 'admin:write'),
        ('users', 'account_number', 'PCI', 'partial', 'admin:write'),
        ('users', 'phone', 'PII', 'partial', 'user:read')
      ON CONFLICT (table_name, field_name) DO NOTHING;
    `);

    logger.info({ schema }, 'Created data security tables in tenant schema');
  }
}
