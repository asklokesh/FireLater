import { describe, it, expect, beforeAll, afterAll } from 'vitest';

/**
 * Audit trail behaviour against a real PostgreSQL database.
 *
 * Runs only when AUDIT_DB_TEST_URL points at a database migrated with
 * `npm run migrate` (it creates and drops its own tenant); skipped otherwise.
 * Covers what mocked unit tests cannot: archiving copies whole rows, the
 * content digest covers the legacy `changes` column, the manual cleanup purge
 * keeps the chain verifiable, and a request merges into the service's row.
 */
const DB_URL = process.env.AUDIT_DB_TEST_URL;
if (DB_URL) process.env.DATABASE_URL = DB_URL;

type Services = {
  pool: typeof import('../../src/config/database.js')['pool'];
  tenantService: typeof import('../../src/services/tenant.js')['tenantService'];
  auditService: typeof import('../../src/services/audit.js')['auditService'];
  auditChainService: typeof import('../../src/services/audit-chain.js')['auditChainService'];
  auditRetentionService: typeof import('../../src/services/audit-retention.js')['auditRetentionService'];
};

describe.skipIf(!DB_URL)('audit trail on PostgreSQL', () => {
  const slug = `auditdb${Date.now().toString(36)}`;
  const schema = `tenant_${slug}`;
  let s: Services;
  let userId: string;

  const q = async (sql: string, params: unknown[] = []) => (await s.pool.query(sql, params)).rows;
  const insertServiceRow = async (daysAgo: number, changes: Record<string, unknown>) =>
    (
      await q(
        `INSERT INTO ${schema}.audit_logs (user_id, action, entity_type, entity_id, changes, created_at)
         VALUES ($1, 'update', 'issue', gen_random_uuid(), $2, NOW() - INTERVAL '1 day' * $3)
         RETURNING id, sequence`,
        [userId, JSON.stringify(changes), daysAgo]
      )
    )[0] as { id: string; sequence: string };

  beforeAll(async () => {
    s = {
      pool: (await import('../../src/config/database.js')).pool,
      tenantService: (await import('../../src/services/tenant.js')).tenantService,
      auditService: (await import('../../src/services/audit.js')).auditService,
      auditChainService: (await import('../../src/services/audit-chain.js')).auditChainService,
      auditRetentionService: (await import('../../src/services/audit-retention.js')).auditRetentionService,
    };
    await s.tenantService.create({
      name: 'Audit DB test',
      slug,
      adminEmail: `admin@${slug}.test`,
      adminName: 'Admin',
      adminPassword: 'Str0ng!Passw0rd#2026',
    });
    userId = (await q(`SELECT id FROM ${schema}.users LIMIT 1`))[0].id;
    // Interleave old and recent rows so the expired ones sit mid-chain.
    for (let i = 0; i < 12; i++) {
      await insertServiceRow(i % 3 === 0 ? 400 : i % 3 === 1 ? 60 : 1, { n: i, note: `row ${i}` });
    }
    await s.auditService.sealPending(slug);
  });

  afterAll(async () => {
    if (!s) return;
    await s.tenantService.delete(slug).catch(() => undefined);
    await s.pool.end();
  });

  it('archive has every live column and archiving moves whole rows (changes included)', async () => {
    const cols = async (table: string) =>
      (await q(
        `SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 ORDER BY column_name`,
        [schema, table]
      )).map((r) => r.column_name as string);
    const live = await cols('audit_logs');
    expect((await cols('audit_logs_archive')).filter((c) => c !== 'archived_at')).toEqual(live);

    await s.auditRetentionService.applyRetentionPolicy(slug, 365);
    const before = await q(
      `SELECT id, to_jsonb(a) AS row FROM ${schema}.audit_logs a
        WHERE created_at < NOW() - INTERVAL '30 days' ORDER BY sequence`
    );
    expect(before.length).toBeGreaterThan(0);
    const moved = await s.auditRetentionService.archiveOld(slug, 30);
    expect(moved).toBe(before.length);
    const after = await q(
      `SELECT id, to_jsonb(a) - 'archived_at' AS row FROM ${schema}.audit_logs_archive a ORDER BY sequence`
    );
    expect(after).toEqual(before);
    expect(after.every((r) => r.row.changes !== null)).toBe(true);
    expect(await s.auditChainService.verifyChain(slug)).toMatchObject({ valid: true });
  });

  it('an edit of changes on a sealed row breaks verification; restoring it heals it', async () => {
    const [row] = await q(
      `SELECT id, sequence, changes FROM ${schema}.audit_logs WHERE record_hash IS NOT NULL ORDER BY sequence LIMIT 1`
    );
    await q(`UPDATE ${schema}.audit_logs SET changes = '{"n": -1}' WHERE id = $1`, [row.id]);
    const broken = await s.auditChainService.verifyChain(slug);
    expect(broken.valid).toBe(false);
    expect(broken.firstBrokenSequence).toBe(Number(row.sequence));
    await q(`UPDATE ${schema}.audit_logs SET changes = $2 WHERE id = $1`, [row.id, JSON.stringify(row.changes)]);
    expect((await s.auditChainService.verifyChain(slug)).valid).toBe(true);
  });

  it('manual cleanup purges mid-chain rows and the chain still verifies; a raw delete does not', async () => {
    const before = await s.auditChainService.verifyChain(slug);
    expect(before.valid).toBe(true);
    const deleted = await s.auditService.cleanupOldLogs(slug);
    expect(deleted).toBeGreaterThan(0);
    const after = await s.auditChainService.verifyChain(slug);
    expect(after.valid).toBe(true);

    const [victim] = await q(
      `SELECT id FROM ${schema}.audit_logs WHERE record_hash IS NOT NULL ORDER BY sequence LIMIT 1 OFFSET 1`
    );
    await q(`DELETE FROM ${schema}.audit_logs WHERE id = $1`, [victim.id]);
    expect((await s.auditChainService.verifyChain(slug)).valid).toBe(false);
  });

  it('a request merges into the row its service wrote: one record with the request context', async () => {
    const watermark = await s.auditService.currentSequence(slug);
    const svc = await insertServiceRow(0, { title: 'Printer!' });
    const [svcRow] = await q(`SELECT entity_id FROM ${schema}.audit_logs WHERE id = $1`, [svc.id]);
    await s.auditService.logRequest(
      slug,
      {
        userId, action: 'update', entityType: 'issue', entityId: svcRow.entity_id,
        oldValues: { title: 'Printer' }, newValues: { title: 'Printer!' }, changedFields: ['title'],
        ipAddress: '10.1.2.3', userAgent: 'db-test', requestId: 'req-db-1',
        httpMethod: 'PUT', requestPath: '/v1/issues/x', statusCode: 200,
      },
      watermark
    );
    const rows = await q(`SELECT * FROM ${schema}.audit_logs WHERE entity_id = $1`, [svcRow.entity_id]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: svc.id,
      changed_fields: ['title'],
      old_values: { title: 'Printer' },
      new_values: { title: 'Printer!' },
      ip_address: '10.1.2.3',
      user_agent: 'db-test',
      changes: { title: 'Printer!' },
    });
    await s.auditService.sealPending(slug);
    const [sealed] = await q(`SELECT record_hash, digest_version FROM ${schema}.audit_logs WHERE id = $1`, [svc.id]);
    expect(sealed.record_hash).not.toBeNull();
    expect(sealed.digest_version).toBe(2);
  });
});
