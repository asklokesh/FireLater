import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../src/services/search.js', () => ({ searchService: {} }));
vi.mock('../../../src/middleware/auth.js', () => ({ requirePermission: vi.fn() }));

import { searchQuerySchema, suggestQuerySchema } from '../../../src/routes/search.js';

describe('search route validation', () => {
  it('applies defaults and parses filters JSON', () => {
    const r = searchQuerySchema.parse({ q: 'x', filters: '{"op":"and","conditions":[]}' });
    expect(r.page).toBe(1);
    expect(r.per_page).toBe(25);
    expect(r.filters).toEqual({ op: 'and', conditions: [] });
  });
  it('rejects invalid JSON filters', () => {
    expect(() => searchQuerySchema.parse({ filters: '{bad' })).toThrow();
  });
  it('rejects bad paging', () => {
    expect(() => searchQuerySchema.parse({ page: '0' })).toThrow();
    expect(() => searchQuerySchema.parse({ per_page: '1000' })).toThrow();
  });
  it('requires q for suggest', () => {
    expect(() => suggestQuerySchema.parse({})).toThrow();
  });
});
