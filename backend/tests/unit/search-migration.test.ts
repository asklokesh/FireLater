import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  migration037AdvancedSearch,
  migration037AdvancedSearchDown,
} from '../../src/migrations/037_advanced_search.js';
import { searchConfig } from '../../src/services/search/config.js';

function makePool() {
  const calls: string[] = [];
  const query = vi.fn(async (sql: string) => {
    calls.push(sql);
    if (sql.includes('pg_namespace')) {
      return { rows: [{ nspname: 'tenant_acme' }, { nspname: 'tenant_beta' }] };
    }
    return { rows: [] };
  });
  return { pool: { query } as any, calls };
}

const schemas = ['tenant_acme', 'tenant_beta', 'tenant_template'];

describe('migration 037 advanced search', () => {
  it('config expressions are as specified', () => {
    const expected =
      "setweight(to_tsvector('english', coalesce(title, '')), 'A') || setweight(to_tsvector('english', coalesce(description, '')), 'B')";
    expect(searchConfig.issues.tsvector).toBe(expected);
    expect(searchConfig.problems.tsvector).toBe(expected);
    expect(searchConfig.requests.tsvector).toContain('notes');
    expect(searchConfig.requests.table).toBe('service_requests');
  });

  it('applies to every tenant schema plus tenant_template', async () => {
    const { pool, calls } = makePool();
    await migration037AdvancedSearch(pool);
    for (const s of schemas) {
      expect(calls.some((c) => c.includes(`${s}.saved_filters`))).toBe(true);
      expect(calls.some((c) => c.includes(`${s}.search_history`))).toBe(true);
      expect(calls.some((c) => c.includes(`${s}.service_requests`))).toBe(true);
    }
  });

  it('creates gin indexes using config expressions', async () => {
    const { pool, calls } = makePool();
    await migration037AdvancedSearch(pool);
    for (const s of schemas) {
      for (const [entity, table] of [
        ['issues', 'issues'],
        ['problems', 'problems'],
        ['requests', 'service_requests'],
      ] as const) {
        const stmt = calls.find(
          (c) => c.includes('USING gin') && c.includes(`${s}.${table} `)
        );
        expect(stmt).toBeDefined();
        expect(stmt).toContain(searchConfig[entity].tsvector);
      }
    }
  });

  it('is idempotent', async () => {
    const { pool, calls } = makePool();
    await migration037AdvancedSearch(pool);
    const ddl = calls.filter((c) => /CREATE/.test(c));
    expect(ddl.length).toBeGreaterThan(0);
    for (const c of ddl) {
      expect(c).toMatch(/CREATE (TABLE|INDEX) IF NOT EXISTS/);
    }
  });

  it('down drops indexes and tables', async () => {
    const { pool, calls } = makePool();
    await migration037AdvancedSearchDown(pool);
    for (const s of schemas) {
      expect(calls).toContain(`DROP TABLE IF EXISTS ${s}.saved_filters`);
      expect(calls).toContain(`DROP TABLE IF EXISTS ${s}.search_history`);
      expect(calls).toContain(`DROP INDEX IF EXISTS ${s}.idx_issues_search_fts`);
      expect(calls).toContain(`DROP INDEX IF EXISTS ${s}.idx_problems_search_fts`);
      expect(calls).toContain(`DROP INDEX IF EXISTS ${s}.idx_service_requests_search_fts`);
    }
  });
});
