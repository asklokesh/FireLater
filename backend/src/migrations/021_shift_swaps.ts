import { Pool } from 'pg';

export async function up(pool: Pool, tenantSlug?: string): Promise<void> {
  const schemas: string[] = [];

  if (tenantSlug) {
    schemas.push(`tenant_${tenantSlug.replace(/-/g, '_')}`);
  } else {
    const result = await pool.query(
      `SELECT nspname FROM pg_namespace WHERE nspname LIKE 'tenant_%'`
    );
    schemas.push(...result.rows.map(r => r.nspname));
  }

  for (const schema of schemas) {
    // Shift swap requests table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${schema}.shift_swap_requests (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        swap_number VARCHAR(50) NOT NULL,
        schedule_id UUID REFERENCES ${schema}.oncall_schedules(id) ON DELETE CASCADE,

        -- Original shift info
        original_shift_id UUID,
        requester_id UUID REFERENCES ${schema}.users(id),
        original_start TIMESTAMPTZ NOT NULL,
        original_end TIMESTAMPTZ NOT NULL,

        -- Offered replacement (if specific person requested)
        offered_to_user_id UUID REFERENCES ${schema}.users(id),

        -- Accepted replacement info
        accepter_id UUID REFERENCES ${schema}.users(id),
        replacement_start TIMESTAMPTZ,
        replacement_end TIMESTAMPTZ,

        -- Status workflow
        status VARCHAR(50) DEFAULT 'pending',

        -- Details
        reason TEXT,
        response_message TEXT,

        -- Timestamps
        requested_at TIMESTAMPTZ DEFAULT NOW(),
        responded_at TIMESTAMPTZ,
        expires_at TIMESTAMPTZ,

        -- Admin override
        approved_by UUID REFERENCES ${schema}.users(id),
        approved_at TIMESTAMPTZ,

        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Add comments for documentation
    await pool.query(`
      COMMENT ON COLUMN ${schema}.shift_swap_requests.status IS
      'Swap status: pending, accepted, rejected, cancelled, expired, completed'
    `);

    await pool.query(`
      COMMENT ON COLUMN ${schema}.shift_swap_requests.offered_to_user_id IS
      'If set, swap is offered to specific user. If null, open to anyone in the schedule.'
    `);

    await pool.query(`
      COMMENT ON COLUMN ${schema}.shift_swap_requests.original_shift_id IS
      'Reference to the shift being swapped (if applicable)'
    `);

    // Indexes
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_shift_swaps_schedule ON ${schema}.shift_swap_requests(schedule_id)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_shift_swaps_requester ON ${schema}.shift_swap_requests(requester_id)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_shift_swaps_status ON ${schema}.shift_swap_requests(status)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_shift_swaps_offered_to ON ${schema}.shift_swap_requests(offered_to_user_id)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_shift_swaps_dates ON ${schema}.shift_swap_requests(original_start, original_end)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_shift_swaps_accepter ON ${schema}.shift_swap_requests(accepter_id)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_shift_swaps_expires ON ${schema}.shift_swap_requests(expires_at) WHERE status = 'pending'
    `);

    // Add ID sequence for shift swaps
    await pool.query(`
      INSERT INTO ${schema}.id_sequences (entity_type, prefix, current_value)
      VALUES ('shift_swap', 'SWAP', 0)
      ON CONFLICT (entity_type) DO NOTHING
    `);
  }
}

export async function down(pool: Pool, tenantSlug?: string): Promise<void> {
  const schemas: string[] = [];

  if (tenantSlug) {
    schemas.push(`tenant_${tenantSlug.replace(/-/g, '_')}`);
  } else {
    const result = await pool.query(
      `SELECT nspname FROM pg_namespace WHERE nspname LIKE 'tenant_%'`
    );
    schemas.push(...result.rows.map(r => r.nspname));
  }

  for (const schema of schemas) {
    // Drop indexes first
    await pool.query(`DROP INDEX IF EXISTS ${schema}.idx_shift_swaps_expires`);
    await pool.query(`DROP INDEX IF EXISTS ${schema}.idx_shift_swaps_accepter`);
    await pool.query(`DROP INDEX IF EXISTS ${schema}.idx_shift_swaps_dates`);
    await pool.query(`DROP INDEX IF EXISTS ${schema}.idx_shift_swaps_offered_to`);
    await pool.query(`DROP INDEX IF EXISTS ${schema}.idx_shift_swaps_status`);
    await pool.query(`DROP INDEX IF EXISTS ${schema}.idx_shift_swaps_requester`);
    await pool.query(`DROP INDEX IF EXISTS ${schema}.idx_shift_swaps_schedule`);

    // Drop table
    await pool.query(`DROP TABLE IF EXISTS ${schema}.shift_swap_requests CASCADE`);

    // Remove ID sequence
    await pool.query(`
      DELETE FROM ${schema}.id_sequences WHERE entity_type = 'shift_swap'
    `);
  }
}
