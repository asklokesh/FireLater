import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../src/middleware/auth.js', () => ({
  requirePermission: vi.fn((...p: string[]) => ({ perms: p })),
}));
vi.mock('../../../src/services/search/analytics.js', () => ({
  getSearchAnalytics: vi.fn(),
}));

import { analyticsQuerySchema, ANALYTICS_PERMISSION } from '../../../src/routes/search-analytics.js';

describe('search-analytics route schema', () => {
  it('uses reports:read', () => {
    expect(ANALYTICS_PERMISSION).toBe('reports:read');
  });

  it('defaults and bounds days', () => {
    expect(analyticsQuerySchema.parse({}).days).toBe(30);
    expect(analyticsQuerySchema.parse({ days: '365' }).days).toBe(365);
    expect(analyticsQuerySchema.safeParse({ days: '0' }).success).toBe(false);
    expect(analyticsQuerySchema.safeParse({ days: '366' }).success).toBe(false);
    expect(analyticsQuerySchema.safeParse({ days: '1.5' }).success).toBe(false);
  });
});
