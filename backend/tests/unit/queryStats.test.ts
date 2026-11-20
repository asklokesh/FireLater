import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { queryStats, fingerprintQuery } from '../../src/services/queryStats';

describe('queryStats', () => {
  beforeEach(() => {
    queryStats.reset();
    process.env.DB_SLOW_QUERY_THRESHOLD = '100';
  });
  afterEach(() => {
    delete process.env.DB_SLOW_QUERY_THRESHOLD;
  });

  it('fingerprints strip literals and params', () => {
    expect(fingerprintQuery("SELECT * FROM t WHERE id = 5 AND n = 'x'")).toBe(
      fingerprintQuery('select * from t where id = $1 and n = $2')
    );
    expect(fingerprintQuery('SELECT 1 WHERE a IN (1, 2, 3)')).toBe(fingerprintQuery('SELECT 1 WHERE a IN (4)'));
  });

  it('aggregates count, duration and rows per fingerprint', () => {
    queryStats.record({ text: 'SELECT * FROM t WHERE id = 1', durationMs: 10, rowCount: 2 });
    queryStats.record({ text: 'SELECT * FROM t WHERE id = 2', durationMs: 30, rowCount: 4 });
    const [top] = queryStats.topFrequent(1);
    expect(top.count).toBe(2);
    expect(top.avgMs).toBe(20);
    expect(top.maxMs).toBe(30);
    expect(top.avgRows).toBe(3);
  });

  it('flags queries over the threshold as slow (strictly greater)', () => {
    expect(queryStats.record({ text: 'select 1', durationMs: 100 }).slow).toBe(false);
    expect(queryStats.record({ text: 'select 2 from x', durationMs: 101, rowCount: 7 }).slow).toBe(true);
    expect(queryStats.recentSlow()).toHaveLength(1);
    expect(queryStats.recentSlow()[0].rowCount).toBe(7);
    expect(queryStats.summary().slowQueries).toBe(1);
  });

  it('honours DB_SLOW_QUERY_THRESHOLD', () => {
    process.env.DB_SLOW_QUERY_THRESHOLD = '5';
    expect(queryStats.record({ text: 'select 1', durationMs: 6 }).slow).toBe(true);
  });

  it('orders slowest by average duration', () => {
    queryStats.record({ text: 'select a from fast', durationMs: 1 });
    queryStats.record({ text: 'select b from slow', durationMs: 500 });
    expect(queryStats.topSlowest(1)[0].sample).toContain('slow');
  });

  it('counts failures and renders prometheus text', () => {
    queryStats.record({ text: 'select 1', durationMs: 3, failed: true });
    const text = queryStats.prometheus();
    expect(text).toContain('db_queries_total 1');
    expect(text).toContain('db_query_errors_total 1');
    expect(text).toContain('db_query_duration_seconds_bucket{le="+Inf"} 1');
  });

  // Performance regression guard: recording must stay cheap on the hot path.
  it('records 20k queries well under the time budget', () => {
    const start = performance.now();
    for (let i = 0; i < 20000; i++) {
      queryStats.record({ text: `select * from t where id = ${i}`, durationMs: 1, rowCount: 1 });
    }
    expect(performance.now() - start).toBeLessThan(2000);
    expect(queryStats.summary().uniqueFingerprints).toBe(1);
  });
});
