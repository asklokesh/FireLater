import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import baseline from './baseline.json';
import { explainQuery } from '../../src/services/indexAdvisor';

/**
 * Query-plan regression test against a real PostgreSQL (CI provides one).
 * Run with: PERF_DB=1 (PERF_DATABASE_URL or PG* env vars) npm run test:perf
 *
 * Without an index the advisor must flag the seq scan (even for a selective filter);
 * after creating the recommended index the plan must use it and cost at most
 * baseline.indexedPlanCostRatioMax of the unindexed plan.
 */
describe.skipIf(!process.env.PERF_DB)('query plan regression (real database)', () => {
  const schema = 'perf_regression';
  let pool: Pool;

  beforeAll(async () => {
    // tests/setup.ts overwrites DATABASE_URL with a dummy value, so use PERF_DATABASE_URL;
    // when unset, pg falls back to the standard PGHOST/PGUSER/PGPASSWORD/PGDATABASE env vars
    pool = new Pool({ connectionString: process.env.PERF_DATABASE_URL });
    await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await pool.query(`CREATE SCHEMA ${schema}`);
    await pool.query(`CREATE TABLE ${schema}.items (id serial primary key, status text, title text)`);
    await pool.query(
      `INSERT INTO ${schema}.items (status, title) SELECT CASE WHEN g % 500 = 0 THEN 'rare' ELSE 'common' END, 'row ' || g FROM generate_series(1, 30000) g`
    );
    await pool.query(`ANALYZE ${schema}.items`);
  });

  afterAll(async () => {
    await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await pool.end();
  });

  it('flags a selective seq scan, and the recommended index fixes the plan within budget', async () => {
    const q = `SELECT * FROM ${schema}.items WHERE status = 'rare'`;
    const before = await explainQuery(pool, q);
    expect(before.plan?.['Node Type']).toBe('Seq Scan');
    // ~60 rows returned from a 30k row table: the filtered estimate is below the threshold
    expect(before.plan?.['Plan Rows']).toBeLessThan(baseline.minSeqScanRows);
    expect(before.recommendations).toHaveLength(1);
    const rec = before.recommendations[0];
    expect(rec.statement).toContain(`${schema}.items (status)`);

    await pool.query(rec.statement.replace('CONCURRENTLY ', ''));
    await pool.query(`ANALYZE ${schema}.items`);
    const after = await explainQuery(pool, q);
    expect(JSON.stringify(after.plan)).toContain('Index');
    expect(after.recommendations).toHaveLength(0);
    expect(after.plan!['Total Cost']! / before.plan!['Total Cost']!).toBeLessThan(baseline.indexedPlanCostRatioMax);
  });

  it('rejects multi-statement input and never persists side effects, even with ANALYZE', async () => {
    await pool.query(
      `CREATE OR REPLACE FUNCTION ${schema}.bump() RETURNS int LANGUAGE sql AS $$ UPDATE ${schema}.items SET title = 'x' RETURNING 1 $$`
    );
    await expect(explainQuery(pool, `SELECT 1; DELETE FROM ${schema}.items`)).rejects.toThrow(/read-only/i);
    // the side-effecting function is blocked by the READ ONLY transaction
    await expect(explainQuery(pool, `SELECT ${schema}.bump()`, [], { analyze: true })).rejects.toThrow();
    const { rows } = await pool.query(`SELECT count(*)::int AS n FROM ${schema}.items WHERE title = 'x'`);
    expect(rows[0].n).toBe(0);
  });
});
