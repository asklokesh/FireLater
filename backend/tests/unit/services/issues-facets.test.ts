import { describe, it, expect, vi } from 'vitest';
const mockQuery = vi.fn();
const mockClientQuery = vi.fn();
const mockRelease = vi.fn();
const mockConnect = vi.fn().mockResolvedValue({
  query: mockClientQuery,
  release: mockRelease,
});

vi.mock('../../../src/config/database.js', () => ({
  pool: {
    query: (...args: unknown[]) => mockQuery(...args),
    connect: () => mockConnect(),
  },
}));

// Mock cache service - bypass caching entirely
vi.mock('../../../src/utils/cache.js', () => ({
  cacheService: {
    getOrSet: vi.fn(async (_key: string, fetcher: () => Promise<unknown>) => fetcher()),
    invalidateTenant: vi.fn().mockResolvedValue(undefined),
    invalidate: vi.fn().mockResolvedValue(1),
  },
}));

vi.mock('../../../src/services/tenant.js', () => ({
  tenantService: {
    getSchemaName: vi.fn().mockReturnValue('tenant_test'),
    findBySlug: vi.fn(),
  },
}));

vi.mock('../../../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../../../src/utils/contentSanitization.js', () => ({
  sanitizeMarkdown: vi.fn((content: string) => content),
}));

vi.mock('../../../src/services/dashboard.js', () => ({
  dashboardService: {
    invalidateCache: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../../src/utils/pagination.js', () => ({
  getOffset: vi.fn((params: { page?: number; perPage?: number }) => ((params.page || 1) - 1) * (params.perPage || 50)),
}));

// Import after mocks
import { issueService } from '../../../src/services/issues.js';

describe('IssueService.list facets and filter', () => {
  it('runs a single GROUPING SETS query with the same WHERE and applies filter', async () => {
    mockQuery.mockReset();
    mockQuery.mockResolvedValueOnce({ rows: [{ count: '1' }] });
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 1 }] });
    mockQuery.mockResolvedValueOnce({ rows: [
      { facet: 'status', value: 'open', label: null, count: 1 },
      { facet: 'application_id', value: 'a1', label: 'CRM', count: 1 },
    ] });
    const r = await issueService.list('t', { page: 1, perPage: 10 }, {
      search: 'disk',
      filter: { op: 'and', conditions: [{ field: 'status', operator: 'eq', value: 'open' }] },
      facets: true,
    });
    expect(mockQuery).toHaveBeenCalledTimes(3);
    const facetSql = mockQuery.mock.calls[2][0] as string;
    expect(facetSql).toContain('GROUPING SETS');
    expect(facetSql).toContain("websearch_to_tsquery('english', $1)");
    expect(facetSql).toContain('i.status = $3');
    expect(r.facets?.status).toEqual([{ value: 'open', count: 1 }]);
    expect(r.facets?.application_id).toEqual([{ value: 'a1', label: 'CRM', count: 1 }]);
  });
});
