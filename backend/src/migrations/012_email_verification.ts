import { Pool } from 'pg';

export async function migration012EmailVerification(pool: Pool): Promise<void> {
  // Get all tenant schemas
  const schemasResult = await pool.query(`
    SELECT schema_name FROM information_schema.schemata
    WHERE schema_name LIKE 'tenant_%'
  `);

  const schemas = ['tenant_template', ...schemasResult.rows.map((r) => r.schema_name)];

  for (const schema of schemas) {
    await pool.query(`
      SET search_path TO ${schema};

      -- Add email verification columns to users table
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false,
        ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;

      -- Create email verification tokens table
      CREATE TABLE IF NOT EXISTS email_verification_tokens (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
        token_hash      VARCHAR(255) NOT NULL UNIQUE,
        expires_at      TIMESTAMPTZ NOT NULL,
        created_at      TIMESTAMPTZ DEFAULT NOW(),
        used_at         TIMESTAMPTZ
      );

      CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_user ON email_verification_tokens(user_id);
      CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_hash ON email_verification_tokens(token_hash);
      CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_expires ON email_verification_tokens(expires_at);

      -- Mark existing users as verified (they registered before verification was implemented)
      UPDATE users SET email_verified = true, email_verified_at = created_at WHERE email_verified IS NULL;

      RESET search_path;
    `);
  }
}
