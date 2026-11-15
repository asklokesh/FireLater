import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

vi.mock('../../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { migration037Search } from '../../src/migrations/037_search.js';
import { ISSUES_TSVECTOR } from '../../src/lib/search-fts.js';

function makePool(schemas: string[]) {
  const query = vi.fn().mockImplementation(async (sql: string) => {
    if (sql.includes('pg_namespace')) return { rows: schemas.map((nspname) => ({ nspname })) };
    return { rows: [] };
  });
  return { query } as any;
}

describe('migration 037_search', () => {
  it('processes tenant_template even when no tenant schemas exist', async () => {
    const pool = makePool([]);
    await migration037Search(pool);
    const sql = pool.query.mock.calls.map((c: any[]) => c[0]).join('\n');
    expect(sql).toContain('tenant_template.issues');
  });

  it('processes existing tenant schemas and the template', async () => {
    const pool = makePool(['tenant_acme']);
    await migration037Search(pool);
    const sql = pool.query.mock.calls.map((c: any[]) => c[0]).join('\n');
    expect(sql).toContain('tenant_acme.saved_filters');
    expect(sql).toContain('tenant_template.saved_filters');
  });

  it('creates indexes and tables idempotently', async () => {
    const pool = makePool([]);
    await migration037Search(pool);
    const stmts: string[] = pool.query.mock.calls.map((c: any[]) => c[0]).filter((s: string) => !s.includes('pg_namespace'));
    const sql = stmts.join('\n');
    for (const name of ['idx_issues_fts', 'idx_problems_fts', 'idx_service_requests_fts', 'saved_filters', 'search_history']) {
      expect(sql).toContain(name);
    }
    expect(sql).toContain(ISSUES_TSVECTOR);
    for (const s of stmts) expect(s).toContain('IF NOT EXISTS');
  });

  it('is registered last in run.ts', () => {
    const src = readFileSync(resolve(__dirname, '../../src/migrations/run.ts'), 'utf8');
    const names = [...src.matchAll(/name: '(\d{3}_[a-z_]+)'/g)].map((m) => m[1]);
    expect(names[names.length - 1]).toBe('037_search');
    expect(names[names.length - 2]).toBe('036_vendor_risk');
  });
});
