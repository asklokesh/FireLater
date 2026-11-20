import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import baseline from './baseline.json';

const h = vi.hoisted(() => {
  const state = {
    clientLog: [] as string[],
    slowSelects: false,
  };
  const planRows = [{ 'QUERY PLAN': [{ Plan: { 'Node Type': 'Result' } }] }];
  class MockClient {
    async query(sql: string) {
      state.clientLog.push(sql);
      if (state.slowSelects && sql.startsWith('select')) await new Promise((r) => setTimeout(r, 20));
      return { rows: sql.startsWith('EXPLAIN') ? planRows : [], rowCount: 1 };
    }
    release() {}
  }
  class MockPool {
    async query(_sql: string) {
      return { rows: [], rowCount: 1 };
    }
    async connect() {
      return new MockClient();
    }
    async end() {}
  }
  return { state, MockPool };
});

vi.mock('pg', () => ({ Pool: h.MockPool }));

describe('pool wrapper performance regression', () => {
  beforeEach(() => {
    process.env.DB_SLOW_QUERY_THRESHOLD = '100000';
    process.env.DB_LOG_QUERY_PLANS = 'false';
    h.state.clientLog.length = 0;
    h.state.slowSelects = false;
    vi.resetModules();
  });
  afterEach(() => {
    delete process.env.DB_SLOW_QUERY_ALERT_WEBHOOK_URL;
    vi.unstubAllGlobals();
  });

  it('adds less than the baseline overhead per query and records every query', async () => {
    const { pool } = await import('../../src/config/database');
    const { queryStats } = await import('../../src/services/queryStats');
    queryStats.reset();
    const N = 5000;
    const raw = new h.MockPool();

    const t0 = performance.now();
    for (let i = 0; i < N; i++) await raw.query(`select * from t where id = ${i}`);
    const rawMs = performance.now() - t0;

    const t1 = performance.now();
    for (let i = 0; i < N; i++) await pool.query(`select * from t where id = ${i}`);
    const wrappedMs = performance.now() - t1;

    expect(queryStats.summary().totalQueries).toBe(N);
    expect(queryStats.summary().uniqueFingerprints).toBe(1);
    const overheadPerQuery = (wrappedMs - rawMs) / N;
    expect(overheadPerQuery).toBeLessThan(baseline.wrapperOverheadMsPerQueryMax);
  });

  it('records queries from checked-out clients too', async () => {
    const { pool } = await import('../../src/config/database');
    const { queryStats } = await import('../../src/services/queryStats');
    queryStats.reset();
    const client = await pool.connect();
    await client.query('select 1 from clients_table');
    client.release();
    expect(queryStats.topFrequent(1)[0].sample).toContain('clients_table');
  });

  it('alerts via webhook and replays the connection search_path for the slow-query plan', async () => {
    process.env.DB_SLOW_QUERY_THRESHOLD = '5';
    process.env.DB_LOG_QUERY_PLANS = 'true';
    process.env.DB_SLOW_QUERY_ALERT_WEBHOOK_URL = 'http://127.0.0.1:9/hook';
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);
    const { pool } = await import('../../src/config/database');
    const { queryStats } = await import('../../src/services/queryStats');
    queryStats.reset();

    const client = await pool.connect();
    await client.query('SET search_path TO tenant_x');
    h.state.slowSelects = true;
    await client.query('select * from things where id = 1');
    h.state.slowSelects = false;

    expect(queryStats.summary().slowQueries).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(h.state.clientLog).toContain('SET LOCAL search_path TO tenant_x'));
    expect(h.state.clientLog.some((s) => s.startsWith('EXPLAIN (VERBOSE, FORMAT JSON) select * from things'))).toBe(true);
    expect(h.state.clientLog).toContain('BEGIN READ ONLY');
    expect(h.state.clientLog).toContain('ROLLBACK');
  });
});
