import { describe, it, expect, beforeEach } from 'vitest';
import {
  explainQuery,
  extractFilterColumns,
  isExplainable,
  parseSearchPath,
  recommendFromPlan,
  shouldAnalyze,
  storeAnalysis,
  getRecommendations,
  resetAdvisor,
} from '../../src/services/indexAdvisor';

const seqScanPlan = {
  'Node Type': 'Seq Scan',
  'Relation Name': 'issues',
  Schema: 'tenant_acme',
  Filter: '((status)::text = \'new\'::text)',
  'Plan Rows': 50000,
};

describe('indexAdvisor', () => {
  beforeEach(() => resetAdvisor());

  it('extracts filter columns', () => {
    expect(extractFilterColumns("((status)::text = 'new'::text) AND (priority = 3)")).toEqual(['status', 'priority']);
  });

  it('recommends an index for a large filtered seq scan', () => {
    const recs = recommendFromPlan({ 'Node Type': 'Limit', Plans: [seqScanPlan] });
    expect(recs).toHaveLength(1);
    expect(recs[0].statement).toBe(
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_issues_status ON tenant_acme.issues (status);'
    );
  });

  it('ignores small tables and unfiltered scans', () => {
    expect(recommendFromPlan({ ...seqScanPlan, 'Plan Rows': 10 })).toHaveLength(0);
    expect(recommendFromPlan({ ...seqScanPlan, Filter: undefined })).toHaveLength(0);
  });

  it('only explains read-only statements', async () => {
    expect(isExplainable('SELECT 1')).toBe(true);
    expect(isExplainable('DELETE FROM t')).toBe(false);
    expect(isExplainable('WITH x AS (DELETE FROM t RETURNING *) SELECT * FROM x')).toBe(false);
    await expect(explainQuery({ query: async () => ({ rows: [] }) }, 'UPDATE t SET a=1')).rejects.toThrow();
  });

  it('uses EXPLAIN (FORMAT JSON) and ANALYZE only when asked', async () => {
    const seen: string[] = [];
    const db = {
      query: async (sql: string) => {
        seen.push(sql);
        return { rows: [{ 'QUERY PLAN': [{ Plan: seqScanPlan, 'Execution Time': 2 }] }] };
      },
    };
    const r1 = await explainQuery(db, 'SELECT * FROM tenant_acme.issues');
    expect(seen[0]).toBe('EXPLAIN (VERBOSE, FORMAT JSON) SELECT * FROM tenant_acme.issues');
    expect(r1.recommendations).toHaveLength(1);
    await explainQuery(db, 'SELECT 1', [], { analyze: true });
    expect(seen.filter((s) => s.startsWith('EXPLAIN'))[1]).toContain('ANALYZE');
  });

  it('judges seq scans by rows scanned (reltuples), not the filtered estimate', () => {
    const selective = { ...seqScanPlan, 'Plan Rows': 3 };
    expect(recommendFromPlan(selective)).toHaveLength(0);
    const tableRows = new Map([['tenant_acme.issues', 5_000_000]]);
    const recs = recommendFromPlan(selective, 1000, tableRows);
    expect(recs).toHaveLength(1);
    expect(recs[0].estimatedRows).toBe(5_000_000);
    // ANALYZEd plans: rows read = returned + removed by filter
    const analyzed = { ...selective, 'Actual Rows': 3, 'Rows Removed by Filter': 200000 };
    expect(recommendFromPlan(analyzed)).toHaveLength(1);
  });

  it('reads pg_class.reltuples through explainQuery', async () => {
    const db = {
      query: async (sql: string) =>
        sql.startsWith('EXPLAIN')
          ? { rows: [{ 'QUERY PLAN': [{ Plan: { ...seqScanPlan, 'Plan Rows': 2 } }] }] }
          : { rows: [{ n: '900000' }] },
    };
    const r = await explainQuery(db, "SELECT * FROM tenant_acme.issues WHERE status = 'x'");
    expect(r.recommendations).toHaveLength(1);
  });

  it('isExplainable ignores keywords in quotes and rejects multi-statement / side-effect input', () => {
    expect(isExplainable("SELECT \"update\", 'delete me' FROM t WHERE note = 'create'")).toBe(true);
    expect(isExplainable('SELECT 1; DROP TABLE t')).toBe(false);
    expect(isExplainable('SELECT 1;')).toBe(true);
    expect(isExplainable('SELECT * INTO newt FROM t')).toBe(false);
    expect(isExplainable('SELECT * FROM t FOR UPDATE')).toBe(false);
  });

  it('runs on a dedicated READ ONLY transaction that is rolled back, replaying search_path', async () => {
    const log: string[] = [];
    let released = false;
    const client = {
      query: async (sql: string) => {
        log.push(sql);
        return { rows: sql.startsWith('EXPLAIN') ? [{ 'QUERY PLAN': [{ Plan: { 'Node Type': 'Result' } }] }] : [] };
      },
      release: () => {
        released = true;
      },
    };
    const db = { query: async () => ({ rows: [] }), connect: async () => client };
    await explainQuery(db, 'SELECT 1', [], { searchPath: 'tenant_acme, public' });
    expect(log[0]).toBe('BEGIN READ ONLY');
    expect(log).toContain('SET LOCAL search_path TO tenant_acme, public');
    expect(log[log.length - 1]).toBe('ROLLBACK');
    expect(released).toBe(true);
    expect(parseSearchPath('SET search_path TO tenant_acme, public')).toBe('tenant_acme, public');
    expect(parseSearchPath("SET search_path TO x; DROP TABLE y")).toBeNull();
  });

  it('aggregates stored recommendations and rate limits analysis', () => {
    storeAnalysis('fp', 'q', { plan: seqScanPlan, analyzed: false, recommendations: recommendFromPlan(seqScanPlan) });
    expect(getRecommendations()).toHaveLength(1);
    expect(shouldAnalyze('fp2', 1000, 0)).toBe(true);
    expect(shouldAnalyze('fp2', 1000, 500)).toBe(false);
    expect(shouldAnalyze('fp2', 1000, 2000)).toBe(true);
  });
});
