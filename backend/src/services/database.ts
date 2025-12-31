import { Pool, PoolClient } from 'pg';
import { pool } from '../config/database.js';

interface QueryOptions {
  timeout?: number;
  tenantSlug?: string;
}

class DatabaseService {
  private pool: Pool;

  constructor() {
    this.pool = pool;
  }

  async executeQuery<T>(
    query: string,
    params: unknown[] = [],
    options: QueryOptions = {}
  ): Promise<{ rows: T[]; rowCount: number }> {
    const client = await this.pool.connect();
    try {
      if (options.timeout) {
        await client.query(`SET LOCAL statement_timeout = ${options.timeout}`);
      }
      
      if (options.tenantSlug) {
        await client.query(`SET LOCAL app.current_tenant = $1`, [options.tenantSlug]);
      }
      
      return await client.query(query, params);
    } finally {
      client.release();
    }
  }

  async executeTransaction<T>(
    callback: (client: PoolClient) => Promise<T>
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

export const databaseService = new DatabaseService();