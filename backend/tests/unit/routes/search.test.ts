import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../src/middleware/auth.js', () => ({
  requirePermission: vi.fn(() => async () => undefined),
}));
vi.mock('../../../src/services/search/search.js', () => ({
  searchIssues: vi.fn(),
  listSearchHistory: vi.fn(),
  clearSearchHistory: vi.fn(),
  deleteSearchHistoryEntry: vi.fn(),
  getSuggestions: vi.fn(),
}));

import { searchIssuesBodySchema } from '../../../src/routes/search.js';

describe('searchIssuesBodySchema', () => {
  it('accepts a valid body and applies defaults', () => {
    const r = searchIssuesBodySchema.parse({
      q: 'status:new login',
      filter: { op: 'and', conditions: [{ field: 'status', operator: 'eq', value: 'new' }] },
      sort: 'relevance',
      order: 'desc',
    });
    expect(r.page).toBe(1);
    expect(r.perPage).toBe(25);
  });

  it('rejects perPage 101', () => {
    expect(searchIssuesBodySchema.safeParse({ perPage: 101 }).success).toBe(false);
  });

  it('rejects q over 500 characters', () => {
    expect(searchIssuesBodySchema.safeParse({ q: 'a'.repeat(501) }).success).toBe(false);
  });

  it('rejects an unknown filter field', () => {
    const r = searchIssuesBodySchema.safeParse({
      filter: { op: 'and', conditions: [{ field: 'bogus', operator: 'eq', value: 'x' }] },
    });
    expect(r.success).toBe(false);
  });

  it('rejects an invalid sort', () => {
    expect(searchIssuesBodySchema.safeParse({ sort: 'title' }).success).toBe(false);
  });
});
