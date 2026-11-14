import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { migration038SearchPersistence } from '../../../src/migrations/038_search_persistence.js';

describe('migration 038 search persistence', () => {
  it('creates tables and index for every schema plus tenant_template', async () => {
    const query = vi.fn().mockImplementation(async (sql: string) =>
      sql.includes('pg_namespace') ? { rows: [{ nspname: 'tenant_a' }] } : { rows: [] }
    );
    await migration038SearchPersistence({ query } as never);
    const sqls = query.mock.calls.map((c) => c[0] as string);
    for (const schema of ['tenant_a', 'tenant_template']) {
      expect(sqls.some((s) => s.includes(`CREATE TABLE IF NOT EXISTS ${schema}.saved_filters`) && s.includes('UNIQUE (user_id, name)'))).toBe(true);
      expect(sqls.some((s) => s.includes(`CREATE TABLE IF NOT EXISTS ${schema}.search_history`))).toBe(true);
      expect(sqls.some((s) => s.includes(`${schema}.search_history (user_id, created_at DESC)`))).toBe(true);
    }
  });
});
