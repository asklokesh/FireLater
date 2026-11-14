import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { migration037Search } from '../../../src/migrations/037_search.js';

describe('migration 037 search', () => {
  it('creates GIN and facet indexes for every schema plus tenant_template', async () => {
    const query = vi.fn().mockImplementation(async (sql: string) =>
      sql.includes('pg_namespace') ? { rows: [{ nspname: 'tenant_a' }, { nspname: 'tenant_b' }] } : { rows: [] }
    );
    await migration037Search({ query } as never);
    const sqls = query.mock.calls.map((c) => c[0] as string);

    for (const schema of ['tenant_a', 'tenant_b', 'tenant_template']) {
      expect(sqls.some((s) => s.includes(`${schema}.issues`) && s.includes('USING GIN (search_vector)'))).toBe(true);
      expect(sqls.some((s) => s.includes(`ALTER TABLE ${schema}.issues`) && s.includes('tsvector'))).toBe(true);
      for (const col of ['status', 'priority', 'severity', 'assigned_group', 'application_id']) {
        expect(
          sqls.some((s) => s.includes('CREATE INDEX IF NOT EXISTS') && s.includes(`${schema}.issues (${col})`))
        ).toBe(true);
      }
    }
  });
});
