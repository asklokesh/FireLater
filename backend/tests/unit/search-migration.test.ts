import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { migration037Search } from '../../src/migrations/037_search.js';

describe('migration037Search', () => {
  it('creates search schema objects for each tenant including template', async () => {
    const query = vi.fn().mockImplementation(async (sql: string) => {
      if (sql.includes('pg_namespace')) return { rows: [{ nspname: 'tenant_acme' }] };
      return { rows: [] };
    });

    await migration037Search({ query } as never);

    const sqls: string[] = query.mock.calls.map((c) => c[0] as string);
    const all = sqls.join('\n');

    expect(all).toContain('search_vector tsvector');
    expect(all).toContain('GENERATED ALWAYS AS');
    expect(all).toContain("to_tsvector('english'");
    expect(all).toContain('USING GIN (search_vector)');
    expect(all).toContain('tenant_acme.saved_filters');
    expect(all).toContain('tenant_template.saved_filters');
    expect(all).toContain('tenant_template.search_history');
    expect(all).toContain('search_history(user_id, created_at DESC)');
    expect(all).toContain('search_history(created_at DESC)');
    expect(all).toContain('search_history(lower(query) text_pattern_ops)');

    const ddl = sqls.filter((s) => !s.includes('pg_namespace'));
    for (const s of ddl) expect(s).toContain('IF NOT EXISTS');
  });
});
