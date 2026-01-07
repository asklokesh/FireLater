import { describe, it, expect, vi, beforeEach } from 'vitest';

// Use vi.hoisted to ensure mock is created before module loads
const mockQuery = vi.hoisted(() => vi.fn());

// Mock the database pool
vi.mock('../../../src/config/database.js', () => ({
  pool: {
    query: mockQuery,
  },
}));

// Mock the tenant service
vi.mock('../../../src/services/tenant.js', () => ({
  tenantService: {
    getSchemaName: vi.fn().mockImplementation((slug: string) => `tenant_${slug}`),
  },
}));

import { databaseService } from '../../../src/services/database.js';
import { tenantService } from '../../../src/services/tenant.js';

describe('DatabaseService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
  });

  describe('executeQuery', () => {
    it('should execute query with schema replacement', async () => {
      const query = 'SELECT * FROM ${schema}.users WHERE id = $1';
      const params = ['user-123'];
      const options = { tenantSlug: 'acme' };

      await databaseService.executeQuery(query, params, options);

      expect(tenantService.getSchemaName).toHaveBeenCalledWith('acme');
      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT * FROM tenant_acme.users WHERE id = $1',
        params
      );
    });

    it('should handle multiple schema placeholders', async () => {
      const query = 'SELECT u.*, r.name FROM ${schema}.users u JOIN ${schema}.roles r ON u.role_id = r.id';
      const params: unknown[] = [];
      const options = { tenantSlug: 'enterprise' };

      await databaseService.executeQuery(query, params, options);

      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT u.*, r.name FROM tenant_enterprise.users u JOIN tenant_enterprise.roles r ON u.role_id = r.id',
        params
      );
    });

    it('should handle queries without schema placeholder', async () => {
      const query = 'SELECT NOW()';
      const params: unknown[] = [];
      const options = { tenantSlug: 'test' };

      await databaseService.executeQuery(query, params, options);

      expect(mockQuery).toHaveBeenCalledWith('SELECT NOW()', params);
    });

    it('should pass through query parameters correctly', async () => {
      const query = 'INSERT INTO ${schema}.issues (title, priority, status) VALUES ($1, $2, $3)';
      const params = ['Test Issue', 'high', 'open'];
      const options = { tenantSlug: 'startup' };

      await databaseService.executeQuery(query, params, options);

      expect(mockQuery).toHaveBeenCalledWith(
        'INSERT INTO tenant_startup.issues (title, priority, status) VALUES ($1, $2, $3)',
        params
      );
    });

    it('should return query results', async () => {
      const mockResult = {
        rows: [
          { id: '1', name: 'User 1' },
          { id: '2', name: 'User 2' },
        ],
        rowCount: 2,
      };
      mockQuery.mockResolvedValueOnce(mockResult);

      const query = 'SELECT * FROM ${schema}.users';
      const params: unknown[] = [];
      const options = { tenantSlug: 'demo' };

      const result = await databaseService.executeQuery(query, params, options);

      expect(result).toEqual(mockResult);
      expect(result.rows).toHaveLength(2);
    });

    it('should handle empty results', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const query = 'SELECT * FROM ${schema}.nonexistent WHERE 1=0';
      const params: unknown[] = [];
      const options = { tenantSlug: 'empty' };

      const result = await databaseService.executeQuery(query, params, options);

      expect(result.rows).toEqual([]);
      expect(result.rowCount).toBe(0);
    });

    it('should propagate database errors', async () => {
      const dbError = new Error('Connection refused');
      mockQuery.mockRejectedValueOnce(dbError);

      const query = 'SELECT * FROM ${schema}.users';
      const params: unknown[] = [];
      const options = { tenantSlug: 'error-test' };

      await expect(
        databaseService.executeQuery(query, params, options)
      ).rejects.toThrow('Connection refused');
    });

    it('should handle different tenant slugs', async () => {
      const tenantSlugs = ['tenant-a', 'tenant-b', 'tenant-c'];
      const query = 'SELECT COUNT(*) FROM ${schema}.assets';
      const params: unknown[] = [];

      for (const slug of tenantSlugs) {
        await databaseService.executeQuery(query, params, { tenantSlug: slug });
      }

      expect(tenantService.getSchemaName).toHaveBeenCalledTimes(3);
      expect(tenantService.getSchemaName).toHaveBeenCalledWith('tenant-a');
      expect(tenantService.getSchemaName).toHaveBeenCalledWith('tenant-b');
      expect(tenantService.getSchemaName).toHaveBeenCalledWith('tenant-c');
    });

    it('should handle parameterized queries with various types', async () => {
      const query = 'UPDATE ${schema}.issues SET status = $1, updated_at = $2, priority = $3, is_resolved = $4 WHERE id = $5';
      const params = ['closed', new Date('2024-01-15'), 'low', true, 'issue-123'];
      const options = { tenantSlug: 'typed' };

      await databaseService.executeQuery(query, params, options);

      expect(mockQuery).toHaveBeenCalledWith(
        'UPDATE tenant_typed.issues SET status = $1, updated_at = $2, priority = $3, is_resolved = $4 WHERE id = $5',
        params
      );
    });

    it('should handle null parameters', async () => {
      const query = 'UPDATE ${schema}.users SET deleted_at = $1 WHERE id = $2';
      const params = [null, 'user-123'];
      const options = { tenantSlug: 'null-test' };

      await databaseService.executeQuery(query, params, options);

      expect(mockQuery).toHaveBeenCalledWith(
        'UPDATE tenant_null-test.users SET deleted_at = $1 WHERE id = $2',
        params
      );
    });

    it('should handle array parameters', async () => {
      const query = 'SELECT * FROM ${schema}.users WHERE id = ANY($1)';
      const params = [['user-1', 'user-2', 'user-3']];
      const options = { tenantSlug: 'array-test' };

      await databaseService.executeQuery(query, params, options);

      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT * FROM tenant_array-test.users WHERE id = ANY($1)',
        params
      );
    });

    it('should handle JSON parameters', async () => {
      const query = 'INSERT INTO ${schema}.config (settings) VALUES ($1)';
      const params = [{ theme: 'dark', notifications: true }];
      const options = { tenantSlug: 'json-test' };

      await databaseService.executeQuery(query, params, options);

      expect(mockQuery).toHaveBeenCalledWith(
        'INSERT INTO tenant_json-test.config (settings) VALUES ($1)',
        params
      );
    });
  });

  describe('Service Export', () => {
    it('should export databaseService as named export', () => {
      expect(databaseService).toBeDefined();
      expect(typeof databaseService.executeQuery).toBe('function');
    });
  });
});
