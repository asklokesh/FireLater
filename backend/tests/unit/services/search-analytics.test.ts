import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockQuery = vi.fn();
vi.mock('../../../src/config/database.js', () => ({
  pool: { query: (...args: unknown[]) => mockQuery(...args) },
}));
vi.mock('../../../src/services/tenant.js', () => ({
  tenantService: { getSchemaName: vi.fn().mockReturnValue('tenant_test') },
}));

import { getSearchAnalytics } from '../../../src/services/search/analytics.js';

function today(offset = 0): string {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate() + offset)).toISOString().slice(0, 10);
}

function setup(totals: Record<string, unknown>, top: unknown[] = [], zero: unknown[] = [], daily: unknown[] = []) {
  mockQuery.mockImplementation(async (sql: string) => {
    if (sql.includes('COUNT(DISTINCT')) return { rows: [totals] };
    if (sql.includes('AVG(result_count)')) return { rows: top };
    if (sql.includes('result_count = 0 AND')) return { rows: zero };
    return { rows: daily };
  });
}

beforeEach(() => { mockQuery.mockReset(); });

describe('getSearchAnalytics', () => {
  it('maps rates and averages and passes days param', async () => {
    setup(
      { total: '10', unique_queries: '4', zero_count: '3', avg_took_ms: '12.6' },
      [{ query: 'vpn', count: '5', avg_results: '2.5' }],
      [{ query: 'zzz', count: '2' }],
      [{ date: today(0), count: '10' }]
    );
    const r = await getSearchAnalytics('t', 3);
    expect(r).toMatchObject({
      period_days: 3,
      total_searches: 10,
      unique_queries: 4,
      zero_result_rate: 0.3,
      avg_took_ms: 13,
      top_queries: [{ query: 'vpn', count: 5, avg_results: 2.5 }],
      zero_result_queries: [{ query: 'zzz', count: 2 }],
    });
    expect(mockQuery).toHaveBeenCalledTimes(4);
    for (const call of mockQuery.mock.calls) {
      expect(call[1]).toEqual([3]);
      expect(call[0]).toContain('tenant_test.search_history');
    }
    const sqls = mockQuery.mock.calls.map((c) => c[0] as string).join('\n');
    expect(sqls).toContain('lower(trim(query))');
    expect(sqls.match(/LIMIT 10/g)).toHaveLength(2);
  });

  it('handles zero searches without NaN', async () => {
    setup({ total: '0', unique_queries: '0', zero_count: '0', avg_took_ms: null });
    const r = await getSearchAnalytics('t', 30);
    expect(r.zero_result_rate).toBe(0);
    expect(r.avg_took_ms).toBe(0);
    expect(r.top_queries).toEqual([]);
  });

  it('fills day gaps ascending', async () => {
    setup({ total: '2' }, [], [], [{ date: today(-2), count: '2' }]);
    const r = await getSearchAnalytics('t', 3);
    expect(r.daily).toEqual([
      { date: today(-2), count: 2 },
      { date: today(-1), count: 0 },
      { date: today(0), count: 0 },
    ]);
  });

  it('enforces days bounds', async () => {
    await expect(getSearchAnalytics('t', 0)).rejects.toThrow(RangeError);
    await expect(getSearchAnalytics('t', 366)).rejects.toThrow(RangeError);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});
