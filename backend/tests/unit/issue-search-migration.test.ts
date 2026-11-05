import { describe, it, expect, vi } from 'vitest';
import { migration037IssueSearch } from '../../src/migrations/037_issue_search.js';

describe('037_issue_search', () => {
  it('creates generated column and GIN index idempotently, incl. tenant_template', async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [{ nspname: 'tenant_a' }] }).mockResolvedValue({ rows: [] });
    await migration037IssueSearch({ query } as never);
    const sqls = query.mock.calls.map((c) => c[0] as string);
    expect(sqls.some((s) => s.includes('tenant_template.issues'))).toBe(true);
    expect(sqls.filter((s) => s.includes('ADD COLUMN IF NOT EXISTS search_vector')).length).toBe(2);
    expect(sqls.join(' ')).toContain('GENERATED ALWAYS');
    const idx = sqls.filter((s) => s.includes('idx_issues_search_vector'));
    expect(idx.length).toBe(2);
    for (const s of idx) {
      expect(s).toContain('CREATE INDEX IF NOT EXISTS');
      expect(s).toContain('USING GIN');
    }
  });
});
