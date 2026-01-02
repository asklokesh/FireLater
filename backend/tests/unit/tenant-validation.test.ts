import { describe, it, expect, vi, beforeEach } from 'vitest';
import { tenantService } from '../../src/services/tenant.js';
import { NotFoundError } from '../../src/utils/errors.js';
import { pool } from '../../src/config/database.js';

// Mock the database pool
vi.mock('../../src/config/database.js', () => ({
  pool: {
    query: vi.fn(),
  },
}));

describe('TenantService - Schema Validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('validateAndGetSchema', () => {
    it('should return schema name when tenant and schema exist', async () => {
      // Mock tenant exists
      vi.mocked(pool.query).mockResolvedValueOnce({
        rows: [{ id: '123', slug: 'acme-corp', name: 'ACME Corp' }],
        command: 'SELECT',
        rowCount: 1,
        oid: 0,
        fields: [],
      } as any);

      // Mock schema exists
      vi.mocked(pool.query).mockResolvedValueOnce({
        rows: [{ '?column?': 1 }],
        command: 'SELECT',
        rowCount: 1,
        oid: 0,
        fields: [],
      } as any);

      const schemaName = await tenantService.validateAndGetSchema('acme-corp');

      expect(schemaName).toBe('tenant_acme_corp');
      expect(pool.query).toHaveBeenCalledTimes(2);
      expect(pool.query).toHaveBeenNthCalledWith(
        1,
        'SELECT * FROM tenants WHERE slug = $1',
        ['acme-corp']
      );
      expect(pool.query).toHaveBeenNthCalledWith(
        2,
        'SELECT 1 FROM pg_namespace WHERE nspname = $1',
        ['tenant_acme_corp']
      );
    });

    it('should throw NotFoundError when tenant does not exist', async () => {
      // Mock tenant does not exist
      vi.mocked(pool.query).mockResolvedValueOnce({
        rows: [],
        command: 'SELECT',
        rowCount: 0,
        oid: 0,
        fields: [],
      } as any);

      await expect(tenantService.validateAndGetSchema('nonexistent')).rejects.toThrow(
        NotFoundError
      );
      expect(pool.query).toHaveBeenCalledTimes(1);
    });

    it('should throw NotFoundError when schema does not exist', async () => {
      // Mock tenant exists
      vi.mocked(pool.query).mockResolvedValueOnce({
        rows: [{ id: '123', slug: 'orphaned', name: 'Orphaned Tenant' }],
        command: 'SELECT',
        rowCount: 1,
        oid: 0,
        fields: [],
      } as any);

      // Mock schema does not exist
      vi.mocked(pool.query).mockResolvedValueOnce({
        rows: [],
        command: 'SELECT',
        rowCount: 0,
        oid: 0,
        fields: [],
      } as any);

      await expect(tenantService.validateAndGetSchema('orphaned')).rejects.toThrow(
        NotFoundError
      );
      expect(pool.query).toHaveBeenCalledTimes(2);
    });

    it('should sanitize tenant slug correctly', async () => {
      // Mock tenant exists
      vi.mocked(pool.query).mockResolvedValueOnce({
        rows: [{ id: '123', slug: 'test-company', name: 'Test Company' }],
        command: 'SELECT',
        rowCount: 1,
        oid: 0,
        fields: [],
      } as any);

      // Mock schema exists
      vi.mocked(pool.query).mockResolvedValueOnce({
        rows: [{ '?column?': 1 }],
        command: 'SELECT',
        rowCount: 1,
        oid: 0,
        fields: [],
      } as any);

      const schemaName = await tenantService.validateAndGetSchema('test-company');

      // Hyphens should be converted to underscores
      expect(schemaName).toBe('tenant_test_company');
    });
  });

  describe('getSchemaName', () => {
    it('should convert hyphens to underscores', () => {
      const schema = tenantService.getSchemaName('my-company');
      expect(schema).toBe('tenant_my_company');
    });

    it('should remove special characters', () => {
      const schema = tenantService.getSchemaName('my@company!');
      expect(schema).toBe('tenant_mycompany');
    });

    it('should preserve alphanumeric characters', () => {
      const schema = tenantService.getSchemaName('Company123');
      expect(schema).toBe('tenant_Company123');
    });

    it('should handle complex slugs', () => {
      // Underscores are removed, hyphens converted to underscores
      const schema = tenantService.getSchemaName('test-company_123-abc');
      expect(schema).toBe('tenant_test_company123_abc');
    });
  });
});
