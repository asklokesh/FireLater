import { Pool } from 'pg';
import { env } from './env.js';

// Configure PostgreSQL connection pool with proper pooling settings
export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  // Connection pool settings
  max: env.DATABASE_POOL_MAX || 20, // Maximum number of clients in the pool
  min: env.DATABASE_POOL_MIN || 5,  // Minimum number of clients in the pool
  idleTimeoutMillis: env.DATABASE_IDLE_TIMEOUT || 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: env.DATABASE_CONNECTION_TIMEOUT || 5000, // Return an error after 5 seconds if connection could not be established
  // Ensure connections are properly released
  maxUses: env.DATABASE_MAX_USES || Infinity, // Close (and replace) connections that have been used more than this many times
  allowExitOnIdle: false, // Don't allow process to exit when pool is idle
});