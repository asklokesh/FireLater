import { Pool } from 'pg';
import { logger } from '../utils/logger.js';

/**
 * Migration 037: refresh token rotation, session tracking and revocation support.
 *
 * - users.refresh_token_version: bumped whenever all of a user's sessions are revoked
 * - refresh_tokens.family_id: one family == one login session, shared by every rotation
 * - refresh_tokens.version: rotation counter within a family
 * - refresh_tokens.ip_address / user_agent / device_hash: session metadata
 *   (device_hash is the SHA-256 of the optional client device fingerprint)
 */
export async function migration037RefreshTokenRotation(pool: Pool): Promise<void> {
  const schemasResult = await pool.query(
    `SELECT nspname FROM pg_namespace WHERE nspname LIKE 'tenant_%'`
  );

  const schemas: string[] = schemasResult.rows.map((r: { nspname: string }) => r.nspname);

  if (!schemas.includes('tenant_template')) {
    schemas.push('tenant_template');
  }

  for (const schema of schemas) {
    logger.info({ schema }, 'Applying refresh token rotation migration');

    await pool.query(`
      ALTER TABLE ${schema}.users
        ADD COLUMN IF NOT EXISTS refresh_token_version INTEGER NOT NULL DEFAULT 1
    `);

    // Existing rows each receive their own family (a random default per row)
    await pool.query(`
      ALTER TABLE ${schema}.refresh_tokens
        ADD COLUMN IF NOT EXISTS family_id UUID NOT NULL DEFAULT gen_random_uuid(),
        ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1,
        ADD COLUMN IF NOT EXISTS ip_address VARCHAR(64),
        ADD COLUMN IF NOT EXISTS user_agent VARCHAR(512),
        ADD COLUMN IF NOT EXISTS device_hash VARCHAR(64),
        ADD COLUMN IF NOT EXISTS session_created_at TIMESTAMPTZ DEFAULT NOW(),
        ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_refresh_tokens_family ON ${schema}.refresh_tokens(family_id)
    `);
  }

  logger.info('Migration 037: refresh token rotation columns added across all tenant schemas');
}
