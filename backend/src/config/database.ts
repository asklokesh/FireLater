import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: parseInt(process.env.DB_POOL_MAX_CONNECTIONS || '20'),
  min: parseInt(process.env.DB_POOL_MIN_CONNECTIONS || '5'),
  idleTimeoutMillis: parseInt(process.env.DB_POOL_IDLE_TIMEOUT || '30000'),
  connectionTimeoutMillis: parseInt(process.env.DB_POOL_CONNECTION_TIMEOUT || '5000'),
  query_timeout: parseInt(process.env.DB_QUERY_TIMEOUT || '30000'),
  statement_timeout: parseInt(process.env.DB_STATEMENT_TIMEOUT || '30000'),
});

export { pool };