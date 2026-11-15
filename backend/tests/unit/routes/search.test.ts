import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../src/services/search.js', () => ({ searchService: {} }));
vi.mock('../../../src/services/searchTemplates.js', () => ({
  searchTemplateService: {},
  templateCreateSchema: { parse: (v: unknown) => v },
  templateUpdateSchema: { parse: (v: unknown) => v },
}));
const mockRecord = vi.fn();
vi.mock('../../../src/services/searchHistory.js', () => ({
  searchHistoryService: { record: (...a: unknown[]) => mockRecord(...a) },
  MAX_HISTORY_LIMIT: 50,
  DEFAULT_HISTORY_LIMIT: 10,
}));
vi.mock('../../../src/services/searchAnalytics.js', () => ({ searchAnalyticsService: {} }));
vi.mock('../../../src/middleware/auth.js', () => ({ requirePermission: vi.fn() }));

import searchRoutes, {
  searchQuerySchema,
  suggestQuerySchema,
  historyQuerySchema,
  analyticsQuerySchema,
  templateIdParamsSchema,
} from '../../../src/routes/search.js';

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

  it('validates history limit', () => {
    expect(historyQuerySchema.parse({}).limit).toBe(10);
    expect(historyQuerySchema.parse({ limit: '50' }).limit).toBe(50);
    expect(() => historyQuerySchema.parse({ limit: '51' })).toThrow();
  });
  it('validates analytics range', () => {
    const r = analyticsQuerySchema.parse({ from: '2026-01-01', to: '2026-02-01' });
    expect(r.from.getTime()).toBeLessThan(r.to.getTime());
    expect(() => analyticsQuerySchema.parse({ from: '2026-03-01', to: '2026-02-01' })).toThrow();
    expect(() => analyticsQuerySchema.parse({ from: 'nope' })).toThrow();
  });
  it('requires uuid template ids', () => {
    expect(() => templateIdParamsSchema.parse({ id: 'x' })).toThrow();
  });
});

describe('search route registration and history recording', () => {
  it('registers routes and does not fail the search when recording fails', async () => {
    const handlers: Record<string, (req: unknown, reply: unknown) => Promise<void>> = {};
    const app = {
      get: (p: string, _o: unknown, h: never) => (handlers[`GET ${p}`] = h),
      post: (p: string, _o: unknown, h: never) => (handlers[`POST ${p}`] = h),
      put: (p: string, _o: unknown, h: never) => (handlers[`PUT ${p}`] = h),
      delete: (p: string, _o: unknown, h: never) => (handlers[`DELETE ${p}`] = h),
    };
    const { searchService } = await import('../../../src/services/search.js');
    (searchService as Record<string, unknown>).search = vi.fn().mockResolvedValue({ issues: [], total: 0, facets: {} });
    await searchRoutes(app as never);
    for (const k of [
      'GET /templates', 'POST /templates', 'GET /templates/:id', 'PUT /templates/:id',
      'DELETE /templates/:id', 'GET /history', 'DELETE /history', 'GET /analytics',
    ]) {
      expect(handlers[k]).toBeTypeOf('function');
    }
    mockRecord.mockRejectedValue(new Error('boom'));
    const send = vi.fn();
    const request = { user: { tenantSlug: 'acme', userId: 'u1' }, query: { q: 'vpn' }, log: { error: vi.fn() } };
    await handlers['GET /'](request, { send });
    expect(send).toHaveBeenCalled();
    expect(mockRecord).toHaveBeenCalledWith('acme', 'u1', expect.objectContaining({ query: 'vpn', resultCount: 0 }));
  });
});
