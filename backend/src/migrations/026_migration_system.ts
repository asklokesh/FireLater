import { Pool } from 'pg';

export async function migration026MigrationSystem(pool: Pool): Promise<void> {
  await pool.query(`
    -- ============================================
    -- MIGRATION SYSTEM TABLES (Public Schema)
    -- ============================================

    -- Migration jobs tracking
    CREATE TABLE IF NOT EXISTS public.migration_jobs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
      source_system VARCHAR(50) NOT NULL,  -- 'servicenow', 'bmc_remedy', 'jira', 'generic_csv'
      entity_type VARCHAR(50) NOT NULL,    -- 'incident', 'request', 'change', 'user', 'group', 'application'
      file_path TEXT,
      file_name VARCHAR(255),
      file_size BIGINT,
      status VARCHAR(20) DEFAULT 'pending', -- pending, processing, preview, completed, failed, cancelled
      total_records INT DEFAULT 0,
      processed_records INT DEFAULT 0,
      successful_records INT DEFAULT 0,
      failed_records INT DEFAULT 0,
      skipped_records INT DEFAULT 0,
      mapping_config JSONB,
      error_log JSONB DEFAULT '[]'::jsonb,
      warnings JSONB DEFAULT '[]'::jsonb,
      summary JSONB DEFAULT '{}'::jsonb,
      created_by UUID,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      started_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      CONSTRAINT valid_status CHECK (status IN ('pending', 'processing', 'preview', 'completed', 'failed', 'cancelled')),
      CONSTRAINT valid_source_system CHECK (source_system IN ('servicenow', 'bmc_remedy', 'jira', 'generic_csv'))
    );

    CREATE INDEX idx_migration_jobs_tenant ON public.migration_jobs(tenant_id);
    CREATE INDEX idx_migration_jobs_status ON public.migration_jobs(status);
    CREATE INDEX idx_migration_jobs_created ON public.migration_jobs(created_at DESC);

    -- Migration field mappings (reusable templates)
    CREATE TABLE IF NOT EXISTS public.migration_mappings (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      source_system VARCHAR(50) NOT NULL,
      target_entity VARCHAR(50) NOT NULL,  -- 'incident', 'request', 'change', 'user'
      field_mappings JSONB NOT NULL,       -- Array of field mapping configurations
      user_mappings JSONB DEFAULT '[]'::jsonb,
      status_mappings JSONB DEFAULT '[]'::jsonb,
      priority_mappings JSONB DEFAULT '[]'::jsonb,
      is_template BOOLEAN DEFAULT false,
      is_default BOOLEAN DEFAULT false,
      created_by UUID,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(tenant_id, name, source_system, target_entity)
    );

    CREATE INDEX idx_migration_mappings_tenant ON public.migration_mappings(tenant_id);
    CREATE INDEX idx_migration_mappings_system ON public.migration_mappings(source_system, target_entity);
    CREATE INDEX idx_migration_mappings_template ON public.migration_mappings(is_template) WHERE is_template = true;

    -- Migration imported records tracking (for rollback and deduplication)
    CREATE TABLE IF NOT EXISTS public.migration_imported_records (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      migration_job_id UUID NOT NULL REFERENCES public.migration_jobs(id) ON DELETE CASCADE,
      tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
      entity_type VARCHAR(50) NOT NULL,
      source_id VARCHAR(255) NOT NULL,     -- External ID from source system
      target_id UUID NOT NULL,              -- ID in our system
      target_schema VARCHAR(100) NOT NULL,  -- Schema where record was created
      target_table VARCHAR(100) NOT NULL,   -- Table where record was created
      record_data JSONB,                    -- Snapshot of imported data
      imported_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(migration_job_id, source_id)
    );

    CREATE INDEX idx_migration_imported_job ON public.migration_imported_records(migration_job_id);
    CREATE INDEX idx_migration_imported_tenant ON public.migration_imported_records(tenant_id);
    CREATE INDEX idx_migration_imported_source ON public.migration_imported_records(source_id);
    CREATE INDEX idx_migration_imported_target ON public.migration_imported_records(target_id);

    -- ============================================
    -- SSO PROVIDER TABLES (Tenant Schema)
    -- ============================================

    -- SSO provider configurations (tenant-specific)
    CREATE TABLE IF NOT EXISTS tenant_template.sso_providers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(100) NOT NULL,
      provider_type VARCHAR(50) NOT NULL,   -- 'saml', 'oidc'
      provider_name VARCHAR(50) NOT NULL,   -- 'azure_ad', 'okta', 'google', 'auth0', 'generic'
      enabled BOOLEAN DEFAULT true,
      is_default BOOLEAN DEFAULT false,
      configuration JSONB NOT NULL,         -- Provider-specific config (endpoints, client IDs, etc.)
      attribute_mappings JSONB DEFAULT '{}'::jsonb,  -- Map IdP attributes to user fields
      jit_provisioning BOOLEAN DEFAULT true,
      auto_create_users BOOLEAN DEFAULT true,
      default_role VARCHAR(50) DEFAULT 'requester',
      require_verified_email BOOLEAN DEFAULT true,
      created_by UUID,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      CONSTRAINT valid_provider_type CHECK (provider_type IN ('saml', 'oidc'))
    );

    -- Create unique partial index to ensure only one default provider
    CREATE UNIQUE INDEX idx_sso_providers_one_default
      ON tenant_template.sso_providers(is_default)
      WHERE is_default = true;

    CREATE INDEX idx_sso_providers_enabled ON tenant_template.sso_providers(enabled);
    CREATE INDEX idx_sso_providers_type ON tenant_template.sso_providers(provider_type);

    -- SSO sessions (for tracking SSO login sessions)
    CREATE TABLE IF NOT EXISTS tenant_template.sso_sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES tenant_template.users(id) ON DELETE CASCADE,
      provider_id UUID NOT NULL REFERENCES tenant_template.sso_providers(id) ON DELETE CASCADE,
      session_index VARCHAR(255),           -- SAML SessionIndex
      name_id VARCHAR(255),                  -- SAML NameID
      idp_session_id VARCHAR(255),          -- IdP session identifier
      login_time TIMESTAMPTZ DEFAULT NOW(),
      last_activity TIMESTAMPTZ DEFAULT NOW(),
      expires_at TIMESTAMPTZ,
      logout_url TEXT,                       -- Single Logout URL
      metadata JSONB DEFAULT '{}'::jsonb,
      UNIQUE(user_id, provider_id, session_index)
    );

    CREATE INDEX idx_sso_sessions_user ON tenant_template.sso_sessions(user_id);
    CREATE INDEX idx_sso_sessions_provider ON tenant_template.sso_sessions(provider_id);
    CREATE INDEX idx_sso_sessions_expires ON tenant_template.sso_sessions(expires_at);

    -- Azure AD specific integration (tenant-specific)
    CREATE TABLE IF NOT EXISTS tenant_template.azure_ad_integration (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id_azure VARCHAR(255) NOT NULL,    -- Azure AD tenant ID
      client_id VARCHAR(255) NOT NULL,
      client_secret_encrypted TEXT NOT NULL,
      directory_id VARCHAR(255),
      authority_url TEXT,
      graph_endpoint TEXT DEFAULT 'https://graph.microsoft.com/v1.0',
      sync_enabled BOOLEAN DEFAULT false,
      sync_frequency VARCHAR(20) DEFAULT 'daily',  -- hourly, daily, weekly, manual
      last_sync_at TIMESTAMPTZ,
      next_sync_at TIMESTAMPTZ,
      group_sync_enabled BOOLEAN DEFAULT false,
      user_sync_enabled BOOLEAN DEFAULT false,
      sync_filter TEXT,                          -- Microsoft Graph query filter
      sync_options JSONB DEFAULT '{}'::jsonb,
      created_by UUID,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      CONSTRAINT valid_sync_frequency CHECK (sync_frequency IN ('hourly', 'daily', 'weekly', 'manual'))
    );

    CREATE INDEX idx_azure_ad_sync_enabled ON tenant_template.azure_ad_integration(sync_enabled);
    CREATE INDEX idx_azure_ad_next_sync ON tenant_template.azure_ad_integration(next_sync_at) WHERE sync_enabled = true;

    -- Azure AD sync history
    CREATE TABLE IF NOT EXISTS tenant_template.azure_ad_sync_history (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      integration_id UUID NOT NULL REFERENCES tenant_template.azure_ad_integration(id) ON DELETE CASCADE,
      sync_type VARCHAR(50) NOT NULL,           -- 'users', 'groups', 'full'
      status VARCHAR(20) NOT NULL,               -- 'running', 'completed', 'failed'
      started_at TIMESTAMPTZ DEFAULT NOW(),
      completed_at TIMESTAMPTZ,
      users_created INT DEFAULT 0,
      users_updated INT DEFAULT 0,
      users_deactivated INT DEFAULT 0,
      groups_created INT DEFAULT 0,
      groups_updated INT DEFAULT 0,
      errors JSONB DEFAULT '[]'::jsonb,
      summary JSONB DEFAULT '{}'::jsonb,
      CONSTRAINT valid_sync_status CHECK (status IN ('running', 'completed', 'failed'))
    );

    CREATE INDEX idx_azure_sync_history_integration ON tenant_template.azure_ad_sync_history(integration_id);
    CREATE INDEX idx_azure_sync_history_started ON tenant_template.azure_ad_sync_history(started_at DESC);
  `);

  console.log('  ✓ Created migration system tables (migration_jobs, migration_mappings, migration_imported_records)');
  console.log('  ✓ Created SSO provider tables (sso_providers, sso_sessions)');
  console.log('  ✓ Created Azure AD integration tables (azure_ad_integration, azure_ad_sync_history)');
}
