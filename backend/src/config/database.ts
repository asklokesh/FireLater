import { Pool } from 'pg';
import { env } from './env.js';

// Configure PostgreSQL connection pool with explicit settings
export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  // Connection pool settings
  max: env.DATABASE_POOL_MAX || 20,        // Maximum number of clients in the pool
  min: env.DATABASE_POOL_MIN || 5,         // Minimum number of clients in the pool
  idleTimeoutMillis: env.DATABASE_POOL_IDLE_TIMEOUT || 30000,  // Close idle clients after 30 seconds
  connectionTimeoutMillis: env.DATABASE_POOL_CONNECTION_TIMEOUT || 5000, // Return an error after 5 seconds if connection could not be established
  // Additional settings for production
  ...(env.NODE_ENV === 'production' && {
    max: 30,
    idleTimeoutMillis: 20000,
  })
});