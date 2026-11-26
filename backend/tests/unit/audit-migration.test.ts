import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Pool } from 'pg';

vi.mock('../../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { migration038AuditEnhancements } from '../../src/migrations/038_audit_enhancements.js';

function fakePool(schemas: string[]) {
  const queries: Array<{ sql: string; params?: unknown[] }> = [];
  const pool = {
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      queries.push({ sql, params });
      if (sql.includes('pg_namespace')) return { rows: schemas.map((nspname) => ({ nspname })) };
      return { rows: [], rowCount: 0 };
    }),
  } as unknown as Pool;
  return { pool, queries };
}

describe('migration 038 (audit enhancements)', () => {
  let queries: Array<{ sql: string; params?: unknown[] }>;
  let pool: Pool;

  beforeEach(async () => {
    ({ pool, queries } = fakePool(['tenant_acme']));
    await migration038AuditEnhancements(pool);
  });

  const sqlFor = (schema: string) => queries.filter((q) => q.sql.includes(`"${schema}"`)).map((q) => q.sql);

  it('applies to every tenant schema and to the template', () => {
    expect(sqlFor('tenant_acme').length).toBeGreaterThan(10);
    expect(sqlFor('tenant_template').length).toBe(sqlFor('tenant_acme').length);
  });

  it('adds the context, hash-chain and content columns and makes entity_id optional', () => {
    const sql = sqlFor('tenant_acme').join('\n');
    for (const column of ['severity', 'outcome', 'http_method', 'request_path', 'status_code', 'content_digest', 'chain_position']) {
      expect(sql).toContain(`ADD COLUMN IF NOT EXISTS ${column}`);
    }
    expect(sql).toContain('ALTER COLUMN entity_id DROP NOT NULL');
  });

  it('creates the search, composite and sealing indexes', () => {
    const sql = sqlFor('tenant_acme').join('\n');
    for (const index of [
      'idx_audit_logs_user_created', 'idx_audit_logs_entity_created', 'idx_audit_logs_action_created',
      'idx_audit_logs_created_brin', 'idx_audit_logs_search', 'idx_audit_logs_unsealed',
      'idx_audit_logs_chain_position',
    ]) {
      expect(sql).toContain(index);
    }
    expect(sql).toContain('USING gin');
    expect(sql).toContain('WHERE record_hash IS NULL');
  });

  it('creates alert rules, alerts and the archive, and seeds the default rules idempotently', () => {
    const sql = sqlFor('tenant_acme').join('\n');
    expect(sql).toContain('audit_alert_rules');
    expect(sql).toContain('audit_alerts');
    expect(sql).toContain('audit_logs_archive');
    const seeds = queries.filter((q) => q.sql.includes('INSERT INTO "tenant_acme".audit_alert_rules'));
    expect(seeds.map((s) => (s.params as unknown[])[0])).toEqual([
      'Repeated failed logins', 'Mass deletion', 'Bulk data export', 'Access denied burst', 'Privilege changes',
    ]);
    for (const seed of seeds) expect(seed.sql).toContain('ON CONFLICT (name) DO NOTHING');
  });

  it('refuses a schema name that could inject SQL', async () => {
    const { pool: bad } = fakePool(['tenant_x"; DROP TABLE users; --']);
    await expect(migration038AuditEnhancements(bad)).rejects.toThrow(/Unexpected tenant schema name/);
  });
});
