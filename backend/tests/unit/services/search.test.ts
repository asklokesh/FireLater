import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/config/database.js', () => ({ pool: { query: vi.fn() } }));
vi.mock('../../../src/services/tenant.js', () => ({
  tenantService: { getSchemaName: vi.fn((slug: string) => 'tenant_' + slug) },
}));

import { pool } from '../../../src/config/database.js';
import { buildFilterQuery, searchService, ENTITY_CONFIG, MAX_LIMIT } from '../../../src/services/search.js';
import { filterTemplateRepository, searchHistoryService } from '../../../src/services/search-filters.js';
import { isElasticsearchEnabled } from '../../../src/services/search-adapter.js';

const fields = ENTITY_CONFIG.issues.fields;

describe('buildFilterQuery', () => {
  it('returns empty for no conditions', () => {
    expect(buildFilterQuery(undefined, fields)).toEqual({ sql: '', params: [] });
  });

  it('combines nested AND/OR groups with parameters', () => {
    const r = buildFilterQuery({
      logic: 'AND',
      conditions: [
        { field: 'status', op: 'in', value: ['new', 'assigned'] },
        { logic: 'OR', conditions: [{ field: 'priority', op: 'eq', value: 'high' }, { field: 'priority', op: 'eq', value: 'critical' }] },
      ],
    }, fields, 2);
    expect(r.sql).toBe('(t.status::text = ANY($2::text[]) AND (t.priority = $3 OR t.priority = $4))');
    expect(r.params).toEqual([['new', 'assigned'], 'high', 'critical']);
  });

  it('rejects fields outside the allowlist', () => {
    expect(() => buildFilterQuery({ logic: 'AND', conditions: [{ field: 'x; DROP TABLE', op: 'eq', value: 1 }] }, fields)).toThrow();
  });
});

describe('searchService', () => {
  beforeEach(() => vi.mocked(pool.query).mockReset());

  it('uses websearch_to_tsquery with ts_rank ordering and caps the limit', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [{ id: '1', rank: '0.5' }] } as never)
      .mockResolvedValueOnce({ rows: [{ total: 1 }] } as never);
    const r = await searchService.search('acme', { entity: 'issues', q: 'login error', limit: 1000 });
    const [sql, values] = vi.mocked(pool.query).mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("websearch_to_tsquery('english', $1)");
    expect(sql).toMatch(/ORDER BY rank DESC/);
    expect(sql).toContain('tenant_acme.issues');
    expect(values).toEqual(['login error', MAX_LIMIT, 0]);
    expect(r.limit).toBe(MAX_LIMIT);
    expect(r.data[0].rank).toBe(0.5);
  });

  it('computes facet counts with GROUP BY', async () => {
    vi.mocked(pool.query).mockResolvedValue({ rows: [{ value: 'new', count: 3 }] } as never);
    const r = await searchService.facets('acme', { entity: 'issues', q: 'vpn' });
    expect(Object.keys(r).sort()).toEqual(['category', 'priority', 'status']);
    expect(String(vi.mocked(pool.query).mock.calls[0][0])).toContain('GROUP BY');
  });
});

describe('filter templates and search history', () => {
  beforeEach(() => vi.mocked(pool.query).mockReset());

  it('saves and loads filter templates scoped by tenant_id and user', async () => {
    vi.mocked(pool.query).mockResolvedValue({ rows: [{ id: 't1' }] } as never);
    await filterTemplateRepository.saveFilterTemplate('acme', 'u1', { name: 'Mine', entity: 'issues' });
    expect(vi.mocked(pool.query).mock.calls[0][1]?.slice(0, 2)).toEqual(['acme', 'u1']);
    const t = await filterTemplateRepository.loadFilterTemplate('acme', 'u1', 't1');
    expect(t.id).toBe('t1');
    expect(String(vi.mocked(pool.query).mock.calls[1][0])).toContain('tenant_id = $2');
  });

  it('records searches and suggests from history by user_id', async () => {
    vi.mocked(pool.query).mockResolvedValue({ rows: [{ query_text: 'vpn down' }] } as never);
    await searchHistoryService.recordSearch('acme', 'u1', { queryText: ' vpn ', resultCount: 2 });
    expect(vi.mocked(pool.query).mock.calls[0][1]?.[2]).toBe('vpn');
    const s = await searchHistoryService.suggest('acme', 'u1', 'vp%');
    expect(s).toEqual(['vpn down']);
    expect(vi.mocked(pool.query).mock.calls[1][1]?.[2]).toBe('vp\\%%');
  });

  it('elasticsearch is optional and disabled without ELASTICSEARCH_ENABLED', () => {
    expect(isElasticsearchEnabled({})).toBe(false);
    expect(isElasticsearchEnabled({ ELASTICSEARCH_ENABLED: 'true', ELASTICSEARCH_URL: 'http://es:9200' })).toBe(true);
  });
});
