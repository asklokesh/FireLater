import { pool } from '../config/database.js';
import { tenantService } from './tenant.js';

interface QueryOptions {
  tenantSlug: string;
}

class DatabaseService {
  async executeQuery(
    query: string,
    params: unknown[],
    options: QueryOptions
  ) {
    const schema = tenantService.getSchemaName(options.tenantSlug);
    const fullQuery = query.replace(/\$\{schema\}/g, schema);
    return await pool.query(fullQuery, params);
  }
}

export const databaseService = new DatabaseService();