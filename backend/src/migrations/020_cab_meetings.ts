import { Pool } from 'pg';

export async function migration020CabMeetings(pool: Pool): Promise<void> {
  await up(pool);
}

async function up(pool: Pool, tenantSlug?: string): Promise<void> {
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
    // CAB Meetings table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${schema}.cab_meetings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        meeting_number VARCHAR(50) NOT NULL,
        title VARCHAR(500) NOT NULL,
        description TEXT,
        status VARCHAR(50) DEFAULT 'scheduled',
        meeting_date TIMESTAMPTZ NOT NULL,
        meeting_end TIMESTAMPTZ,
        location VARCHAR(500),
        meeting_link VARCHAR(1000),
        organizer_id UUID REFERENCES ${schema}.users(id),
        agenda TEXT,
        minutes TEXT,
        decisions JSONB DEFAULT '[]',
        action_items JSONB DEFAULT '[]',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Add comment explaining JSONB structures
    await pool.query(`
      COMMENT ON COLUMN ${schema}.cab_meetings.status IS
      'Meeting status: scheduled, in_progress, completed, cancelled'
    `);

    await pool.query(`
      COMMENT ON COLUMN ${schema}.cab_meetings.decisions IS
      'Array of {change_id, decision, notes} objects for change decisions made in meeting'
    `);

    await pool.query(`
      COMMENT ON COLUMN ${schema}.cab_meetings.action_items IS
      'Array of {id, description, assignee_id, due_date, status} objects for action items'
    `);

    // CAB Meeting Attendees
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${schema}.cab_meeting_attendees (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        meeting_id UUID REFERENCES ${schema}.cab_meetings(id) ON DELETE CASCADE,
        user_id UUID REFERENCES ${schema}.users(id),
        role VARCHAR(100),
        attendance_status VARCHAR(50) DEFAULT 'pending',
        response_at TIMESTAMPTZ,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(meeting_id, user_id)
      )
    `);

    await pool.query(`
      COMMENT ON COLUMN ${schema}.cab_meeting_attendees.role IS
      'Attendee role: chair, member, guest'
    `);

    await pool.query(`
      COMMENT ON COLUMN ${schema}.cab_meeting_attendees.attendance_status IS
      'RSVP status: pending, accepted, declined, attended'
    `);

    // CAB Meeting Changes (changes to be reviewed in meeting)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${schema}.cab_meeting_changes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        meeting_id UUID REFERENCES ${schema}.cab_meetings(id) ON DELETE CASCADE,
        change_id UUID REFERENCES ${schema}.change_requests(id) ON DELETE CASCADE,
        sort_order INTEGER DEFAULT 0,
        discussion_notes TEXT,
        time_allocated_minutes INTEGER DEFAULT 10,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(meeting_id, change_id)
      )
    `);

    // Indexes
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_cab_meetings_date ON ${schema}.cab_meetings(meeting_date)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_cab_meetings_status ON ${schema}.cab_meetings(status)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_cab_meetings_organizer ON ${schema}.cab_meetings(organizer_id)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_cab_meeting_attendees_meeting ON ${schema}.cab_meeting_attendees(meeting_id)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_cab_meeting_attendees_user ON ${schema}.cab_meeting_attendees(user_id)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_cab_meeting_changes_meeting ON ${schema}.cab_meeting_changes(meeting_id)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_cab_meeting_changes_change ON ${schema}.cab_meeting_changes(change_id)
    `);

    // Add ID sequence for CAB meetings if not exists
    await pool.query(`
      INSERT INTO ${schema}.id_sequences (entity_type, prefix, current_value)
      VALUES ('cab_meeting', 'CAB', 0)
      ON CONFLICT (entity_type) DO NOTHING
    `);
  }
}

async function down(pool: Pool, tenantSlug?: string): Promise<void> {
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
    await pool.query(`DROP INDEX IF EXISTS ${schema}.idx_cab_meeting_changes_change`);
    await pool.query(`DROP INDEX IF EXISTS ${schema}.idx_cab_meeting_changes_meeting`);
    await pool.query(`DROP INDEX IF EXISTS ${schema}.idx_cab_meeting_attendees_user`);
    await pool.query(`DROP INDEX IF EXISTS ${schema}.idx_cab_meeting_attendees_meeting`);
    await pool.query(`DROP INDEX IF EXISTS ${schema}.idx_cab_meetings_organizer`);
    await pool.query(`DROP INDEX IF EXISTS ${schema}.idx_cab_meetings_status`);
    await pool.query(`DROP INDEX IF EXISTS ${schema}.idx_cab_meetings_date`);

    // Drop tables (order matters due to foreign keys)
    await pool.query(`DROP TABLE IF EXISTS ${schema}.cab_meeting_changes CASCADE`);
    await pool.query(`DROP TABLE IF EXISTS ${schema}.cab_meeting_attendees CASCADE`);
    await pool.query(`DROP TABLE IF EXISTS ${schema}.cab_meetings CASCADE`);

    // Remove ID sequence
    await pool.query(`
      DELETE FROM ${schema}.id_sequences WHERE entity_type = 'cab_meeting'
    `);
  }
}
