import { Pool, QueryResult, QueryResultRow } from 'pg';
import { logger } from '../utils/logger.js';

const originalPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: parseInt(process.env.DB_POOL_MAX_CONNECTIONS || '20'),
  min: parseInt(process.env.DB_POOL_MIN_CONNECTIONS || '5'),
  idleTimeoutMillis: parseInt(process.env.DB_POOL_IDLE_TIMEOUT || '30000'),
  connectionTimeoutMillis: parseInt(process.env.DB_POOL_CONNECTION_TIMEOUT || '5000'),
  query_timeout: parseInt(process.env.DB_QUERY_TIMEOUT || '30000'),
  statement_timeout: parseInt(process.env.DB_STATEMENT_TIMEOUT || '30000'),
});

// Slow query threshold in milliseconds
const SLOW_QUERY_THRESHOLD = parseInt(process.env.DB_SLOW_QUERY_THRESHOLD || '100');

// Wrap pool.query to add performance monitoring
const originalQuery = originalPool.query.bind(originalPool);

// Simplified query wrapper with performance monitoring
originalPool.query = function (queryTextOrConfig: string | { text: string }, values?: unknown[]): Promise<QueryResult> {
  const startTime = Date.now();
  const queryText = typeof queryTextOrConfig === 'string' ? queryTextOrConfig : queryTextOrConfig.text;

  // Call original query
  const resultPromise = originalQuery(queryTextOrConfig as never, values as never) as Promise<QueryResult>;

  // Only log slow queries in production or when explicitly enabled
  if (process.env.NODE_ENV === 'production' || process.env.LOG_SLOW_QUERIES === 'true') {
    return resultPromise
      .then((res: QueryResult) => {
        const duration = Date.now() - startTime;
        if (duration > SLOW_QUERY_THRESHOLD) {
          // Truncate query text for logging (max 200 chars)
          const truncatedQuery = queryText.length > 200
            ? queryText.substring(0, 200) + '...'
            : queryText;

          logger.warn({
            duration,
            rowCount: res.rowCount,
            query: truncatedQuery,
          }, 'Slow query detected');
        }
        return res;
      })
      .catch((err: Error) => {
        const duration = Date.now() - startTime;
        logger.error({
          duration,
          err,
          query: queryText.substring(0, 200),
        }, 'Query failed');
        throw err;
      });
  }

  return resultPromise;
} as typeof originalQuery;

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
  } catch (error) {
    return false;
  }
}

export async function closeDatabase(): Promise<void> {
  await pool.end();
}

export { pool };