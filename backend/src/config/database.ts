import { Pool, PoolClient, QueryResult } from 'pg';
import { logger } from '../utils/logger.js';
import { queryStats, getSlowQueryThresholdMs } from '../services/queryStats.js';
import { explainQuery, isExplainable, parseSearchPath, shouldAnalyze, storeAnalysis } from '../services/indexAdvisor.js';
import { sendSlowQueryAlert } from '../services/slowQueryAlerts.js';

const originalPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: parseInt(process.env.DB_POOL_MAX_CONNECTIONS || '20'),
  min: parseInt(process.env.DB_POOL_MIN_CONNECTIONS || '5'),
  idleTimeoutMillis: parseInt(process.env.DB_POOL_IDLE_TIMEOUT || '30000'),
  connectionTimeoutMillis: parseInt(process.env.DB_POOL_CONNECTION_TIMEOUT || '5000'),
  query_timeout: parseInt(process.env.DB_QUERY_TIMEOUT || '30000'),
  statement_timeout: parseInt(process.env.DB_STATEMENT_TIMEOUT || '30000'),
});

const originalQuery = originalPool.query.bind(originalPool);

function truncateQuery(text: string): string {
  return text.length > 200 ? text.substring(0, 200) + '...' : text;
}

/** Log the (non-ANALYZE) plan of a slow query once per fingerprint interval. */
function logSlowQueryPlan(
  fingerprint: string,
  text: string,
  values: unknown[] | undefined,
  searchPath: string | null
): void {
  if (process.env.DB_LOG_QUERY_PLANS === 'false') return;
  if (!isExplainable(text) || !shouldAnalyze(fingerprint)) return;
  // Uses the un-instrumented pool (so the EXPLAIN is not itself tracked) on a dedicated connection
  // in a READ ONLY transaction, replaying the originating connection's search_path if it set one.
  const db = {
    query: (t: string, v?: unknown[]) => originalQuery(t, v as never) as never,
    connect: () => originalConnect() as never,
  };
  explainQuery(db, text, values ?? [], { searchPath })
    .then((result) => {
      storeAnalysis(fingerprint, truncateQuery(text), result);
      logger.info(
        { fingerprint, plan: result.plan, recommendations: result.recommendations },
        'Slow query plan'
      );
    })
    .catch((err: Error) => {
      logger.warn({ err: err.message, fingerprint, query: truncateQuery(text) }, 'Could not EXPLAIN slow query');
    });
}

function observe(
  text: string,
  values: unknown[] | undefined,
  startTime: number,
  res: QueryResult | null,
  err?: Error,
  searchPath: string | null = null
) {
  const duration = Date.now() - startTime;
  const { fingerprint, slow } = queryStats.record({
    text,
    durationMs: duration,
    rowCount: res?.rowCount ?? null,
    failed: !!err,
  });
  if (err) {
    logger.error({ duration, err, query: truncateQuery(text) }, 'Query failed');
  }
  if (slow) {
    logger.warn(
      { duration, rowCount: res?.rowCount ?? null, thresholdMs: getSlowQueryThresholdMs(), fingerprint, query: truncateQuery(text) },
      'Slow query detected'
    );
    sendSlowQueryAlert({
      fingerprint,
      query: truncateQuery(text),
      durationMs: duration,
      rowCount: res?.rowCount ?? null,
      thresholdMs: getSlowQueryThresholdMs(),
    });
    logSlowQueryPlan(fingerprint, text, values, searchPath);
  }
}

/**
 * Wrap a promise-style query function with performance tracking. For checked-out
 * clients, `ctx` remembers a `SET search_path` issued on that connection so slow-query
 * plans can be produced against the same schema.
 */
function instrument<F extends (...args: any[]) => any>(fn: F, ctx?: { searchPath: string | null }): F {
  return function (this: unknown, queryTextOrConfig: string | { text: string; values?: unknown[] }, values?: unknown[]) {
    const isPromiseStyle = typeof queryTextOrConfig !== 'function' && typeof values !== 'function';
    const result = fn.apply(this, arguments as unknown as unknown[]);
    if (!isPromiseStyle || !result || typeof result.then !== 'function') return result;
    const startTime = Date.now();
    const text = typeof queryTextOrConfig === 'string' ? queryTextOrConfig : queryTextOrConfig?.text ?? '';
    const vals = Array.isArray(values) ? values : typeof queryTextOrConfig === 'object' ? queryTextOrConfig.values : undefined;
    return result.then(
      (res: QueryResult) => {
        if (ctx) {
          const sp = parseSearchPath(text);
          if (sp) ctx.searchPath = sp;
          else if (/^\s*reset\s+(all|search_path)\b/i.test(text)) ctx.searchPath = null;
        }
        observe(text, vals, startTime, res, undefined, ctx?.searchPath ?? null);
        return res;
      },
      (err: Error) => {
        observe(text, vals, startTime, null, err, ctx?.searchPath ?? null);
        throw err;
      }
    );
  } as unknown as F;
}

originalPool.query = instrument(originalQuery) as typeof originalQuery;

// Also instrument queries issued on checked-out clients (transactions etc.)
const originalConnect = originalPool.connect.bind(originalPool) as (...args: unknown[]) => unknown;
originalPool.connect = function (...args: unknown[]) {
  if (typeof args[0] === 'function') return originalConnect(...args);
  return (originalConnect() as Promise<PoolClient>).then((client) => {
    const c = client as PoolClient & { __instrumented?: boolean };
    if (!c.__instrumented) {
      c.__instrumented = true;
      c.query = instrument(c.query.bind(c), { searchPath: null }) as typeof c.query;
    }
    return client;
  });
} as typeof originalPool.connect;

const pool = originalPool;

export async function testConnection(): Promise<boolean> {
  try {
    const client = await pool.connect();
    try {
      await client.query('SELECT 1');
      return true;
    } finally {
      client.release();
    }
  } catch (_error) {
    return false;
  }
}

export async function closeDatabase(): Promise<void> {
  await pool.end();
}

export { pool };