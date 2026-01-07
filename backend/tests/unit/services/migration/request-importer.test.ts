import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
vi.mock('../../../../src/config/database.js', () => ({
  pool: {
    connect: vi.fn(),
  },
}));

vi.mock('../../../../src/services/migration/mappers/field-mapper.js', () => ({
  fieldMapper: {
    mapRecord: vi.fn(),
    validateMappedData: vi.fn(),
  },
}));

vi.mock('../../../../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('RequestImporter', () => {
  let mockClient: any;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    mockClient = {
      query: vi.fn(),
      release: vi.fn(),
    };
  });

  describe('import', () => {
    it('should successfully import new requests', async () => {
      const { pool } = await import('../../../../src/config/database.js');
      const { fieldMapper } = await import('../../../../src/services/migration/mappers/field-mapper.js');
      const { requestImporter } = await import('../../../../src/services/migration/importers/request-importer.js');

      (pool.connect as ReturnType<typeof vi.fn>).mockResolvedValue(mockClient);

      (fieldMapper.mapRecord as ReturnType<typeof vi.fn>).mockReturnValue({
        targetData: {
          title: 'Test Request',
          priority: 3,
          status: 'open',
          external_id: 'REQ001',
        },
        errors: [],
      });

      (fieldMapper.validateMappedData as ReturnType<typeof vi.fn>).mockReturnValue({
        valid: true,
        errors: [],
      });

      // Use mockImplementation to handle different query types
      mockClient.query.mockImplementation((sql: string) => {
        if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
          return { rows: [] };
        }
        if (sql.includes('INSERT INTO') && sql.includes('.catalog_requests')) {
          return { rows: [{ id: 'request-123' }] };
        }
        if (sql.includes('migration_imported_records')) {
          return { rows: [] };
        }
        return { rows: [] };
      });

      const records = [
        {
          sourceId: 'REQ001',
          entityType: 'request' as const,
          data: { number: 'REQ001', short_description: 'Test Request' },
        },
      ];

      const result = await requestImporter.import(
        records,
        {
          entityType: 'request',
          sourceSystem: 'servicenow',
          fieldMappings: [],
        },
        {
          tenantId: 'tenant-1',
          tenantSchema: 'tenant_test',
          jobId: 'job-1',
        }
      );

      expect(result.totalRecords).toBe(1);
      expect(result.successfulRecords).toBe(1);
      expect(result.failedRecords).toBe(0);
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should skip records with mapping errors', async () => {
      const { pool } = await import('../../../../src/config/database.js');
      const { fieldMapper } = await import('../../../../src/services/migration/mappers/field-mapper.js');
      const { requestImporter } = await import('../../../../src/services/migration/importers/request-importer.js');

      (pool.connect as ReturnType<typeof vi.fn>).mockResolvedValue(mockClient);
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      (fieldMapper.mapRecord as ReturnType<typeof vi.fn>).mockReturnValue({
        targetData: {},
        errors: [
          {
            recordIndex: 0,
            errorType: 'mapping',
            errorMessage: 'Required field missing',
            timestamp: new Date(),
          },
        ],
      });

      const records = [
        {
          sourceId: 'REQ001',
          entityType: 'request' as const,
          data: {},
        },
      ];

      const result = await requestImporter.import(
        records,
        {
          entityType: 'request',
          sourceSystem: 'servicenow',
          fieldMappings: [],
        },
        {
          tenantId: 'tenant-1',
          tenantSchema: 'tenant_test',
          jobId: 'job-1',
        }
      );

      expect(result.totalRecords).toBe(1);
      expect(result.skippedRecords).toBe(1);
      expect(result.errors.length).toBe(1);
    });

    it('should skip records with validation errors', async () => {
      const { pool } = await import('../../../../src/config/database.js');
      const { fieldMapper } = await import('../../../../src/services/migration/mappers/field-mapper.js');
      const { requestImporter } = await import('../../../../src/services/migration/importers/request-importer.js');

      (pool.connect as ReturnType<typeof vi.fn>).mockResolvedValue(mockClient);
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      (fieldMapper.mapRecord as ReturnType<typeof vi.fn>).mockReturnValue({
        targetData: { title: '' },
        errors: [],
      });

      (fieldMapper.validateMappedData as ReturnType<typeof vi.fn>).mockReturnValue({
        valid: false,
        errors: ['Title is required'],
      });

      const records = [
        {
          sourceId: 'REQ001',
          entityType: 'request' as const,
          data: { short_description: '' },
        },
      ];

      const result = await requestImporter.import(
        records,
        {
          entityType: 'request',
          sourceSystem: 'servicenow',
          fieldMappings: [],
        },
        {
          tenantId: 'tenant-1',
          tenantSchema: 'tenant_test',
          jobId: 'job-1',
        }
      );

      expect(result.skippedRecords).toBe(1);
      expect(result.errors[0].errorType).toBe('validation');
    });

    it('should skip duplicates when skipDuplicates is true', async () => {
      const { pool } = await import('../../../../src/config/database.js');
      const { fieldMapper } = await import('../../../../src/services/migration/mappers/field-mapper.js');
      const { requestImporter } = await import('../../../../src/services/migration/importers/request-importer.js');

      (pool.connect as ReturnType<typeof vi.fn>).mockResolvedValue(mockClient);

      (fieldMapper.mapRecord as ReturnType<typeof vi.fn>).mockReturnValue({
        targetData: {
          title: 'Test Request',
          external_id: 'REQ001',
        },
        errors: [],
      });

      (fieldMapper.validateMappedData as ReturnType<typeof vi.fn>).mockReturnValue({
        valid: true,
        errors: [],
      });

      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 'existing-123' }] }) // Find existing
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const records = [
        {
          sourceId: 'REQ001',
          entityType: 'request' as const,
          data: { number: 'REQ001' },
        },
      ];

      const result = await requestImporter.import(
        records,
        {
          entityType: 'request',
          sourceSystem: 'servicenow',
          fieldMappings: [],
        },
        {
          tenantId: 'tenant-1',
          tenantSchema: 'tenant_test',
          jobId: 'job-1',
          skipDuplicates: true,
        }
      );

      expect(result.skippedRecords).toBe(1);
      expect(result.successfulRecords).toBe(0);
    });

    it('should update existing records when updateExisting is true', async () => {
      const { pool } = await import('../../../../src/config/database.js');
      const { fieldMapper } = await import('../../../../src/services/migration/mappers/field-mapper.js');
      const { requestImporter } = await import('../../../../src/services/migration/importers/request-importer.js');

      (pool.connect as ReturnType<typeof vi.fn>).mockResolvedValue(mockClient);

      (fieldMapper.mapRecord as ReturnType<typeof vi.fn>).mockReturnValue({
        targetData: {
          title: 'Updated Request',
          priority: 1,
          external_id: 'REQ001',
        },
        errors: [],
      });

      (fieldMapper.validateMappedData as ReturnType<typeof vi.fn>).mockReturnValue({
        valid: true,
        errors: [],
      });

      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 'existing-123' }] }) // Find existing
        .mockResolvedValueOnce({ rows: [] }) // UPDATE
        .mockResolvedValueOnce({ rows: [] }) // Track imported
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const records = [
        {
          sourceId: 'REQ001',
          entityType: 'request' as const,
          data: { number: 'REQ001', short_description: 'Updated Request' },
        },
      ];

      const result = await requestImporter.import(
        records,
        {
          entityType: 'request',
          sourceSystem: 'servicenow',
          fieldMappings: [],
        },
        {
          tenantId: 'tenant-1',
          tenantSchema: 'tenant_test',
          jobId: 'job-1',
          updateExisting: true,
        }
      );

      expect(result.updatedRecords).toBe(1);
      expect(result.successfulRecords).toBe(0);
    });

    it('should handle import errors gracefully', async () => {
      const { pool } = await import('../../../../src/config/database.js');
      const { fieldMapper } = await import('../../../../src/services/migration/mappers/field-mapper.js');
      const { requestImporter } = await import('../../../../src/services/migration/importers/request-importer.js');

      (pool.connect as ReturnType<typeof vi.fn>).mockResolvedValue(mockClient);

      (fieldMapper.mapRecord as ReturnType<typeof vi.fn>).mockReturnValue({
        targetData: {
          title: 'Test Request',
          external_id: 'REQ001',
        },
        errors: [],
      });

      (fieldMapper.validateMappedData as ReturnType<typeof vi.fn>).mockReturnValue({
        valid: true,
        errors: [],
      });

      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockRejectedValueOnce(new Error('Database constraint violation')) // INSERT fails
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const records = [
        {
          sourceId: 'REQ001',
          entityType: 'request' as const,
          data: { number: 'REQ001' },
        },
      ];

      const result = await requestImporter.import(
        records,
        {
          entityType: 'request',
          sourceSystem: 'servicenow',
          fieldMappings: [],
        },
        {
          tenantId: 'tenant-1',
          tenantSchema: 'tenant_test',
          jobId: 'job-1',
        }
      );

      expect(result.failedRecords).toBe(1);
      expect(result.errors[0].errorType).toBe('import');
      expect(result.errors[0].errorMessage).toContain('Database constraint violation');
    });

    it('should catch errors in the import loop gracefully', async () => {
      const { pool } = await import('../../../../src/config/database.js');
      const { fieldMapper } = await import('../../../../src/services/migration/mappers/field-mapper.js');
      const { requestImporter } = await import('../../../../src/services/migration/importers/request-importer.js');

      (pool.connect as ReturnType<typeof vi.fn>).mockResolvedValue(mockClient);

      // Throw inside the loop - errors are caught per-record
      (fieldMapper.mapRecord as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new Error('Critical failure in mapper');
      });

      mockClient.query.mockImplementation((sql: string) => {
        if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
          return { rows: [] };
        }
        return { rows: [] };
      });

      const records = [
        {
          sourceId: 'REQ001',
          entityType: 'request' as const,
          data: {},
        },
      ];

      const result = await requestImporter.import(
        records,
        {
          entityType: 'request',
          sourceSystem: 'servicenow',
          fieldMappings: [],
        },
        {
          tenantId: 'tenant-1',
          tenantSchema: 'tenant_test',
          jobId: 'job-1',
        }
      );

      expect(result.failedRecords).toBe(1);
    });

    it('should import multiple records', async () => {
      const { pool } = await import('../../../../src/config/database.js');
      const { fieldMapper } = await import('../../../../src/services/migration/mappers/field-mapper.js');
      const { requestImporter } = await import('../../../../src/services/migration/importers/request-importer.js');

      (pool.connect as ReturnType<typeof vi.fn>).mockResolvedValue(mockClient);

      (fieldMapper.mapRecord as ReturnType<typeof vi.fn>).mockImplementation((record: any, _config: any, index: number) => ({
        targetData: {
          title: `Request ${index + 1}`,
          priority: 3,
          external_id: record.sourceId,
        },
        errors: [],
      }));

      (fieldMapper.validateMappedData as ReturnType<typeof vi.fn>).mockReturnValue({
        valid: true,
        errors: [],
      });

      mockClient.query.mockResolvedValue({ rows: [] });
      let insertCount = 0;
      mockClient.query.mockImplementation((sql: string) => {
        if (sql.includes('INSERT INTO') && sql.includes('catalog_requests')) {
          insertCount++;
          return { rows: [{ id: `request-${insertCount}` }] };
        }
        return { rows: [] };
      });

      const records = [
        { sourceId: 'REQ001', entityType: 'request' as const, data: {} },
        { sourceId: 'REQ002', entityType: 'request' as const, data: {} },
        { sourceId: 'REQ003', entityType: 'request' as const, data: {} },
      ];

      const result = await requestImporter.import(
        records,
        {
          entityType: 'request',
          sourceSystem: 'servicenow',
          fieldMappings: [],
        },
        {
          tenantId: 'tenant-1',
          tenantSchema: 'tenant_test',
          jobId: 'job-1',
        }
      );

      expect(result.totalRecords).toBe(3);
      expect(result.successfulRecords).toBe(3);
    });

    it('should preserve metadata dates during import', async () => {
      const { pool } = await import('../../../../src/config/database.js');
      const { fieldMapper } = await import('../../../../src/services/migration/mappers/field-mapper.js');
      const { requestImporter } = await import('../../../../src/services/migration/importers/request-importer.js');

      (pool.connect as ReturnType<typeof vi.fn>).mockResolvedValue(mockClient);

      const createdAt = new Date('2024-01-01T10:00:00Z');

      (fieldMapper.mapRecord as ReturnType<typeof vi.fn>).mockReturnValue({
        targetData: {
          title: 'Test Request',
          priority: 3,
          external_id: 'REQ001',
        },
        errors: [],
      });

      (fieldMapper.validateMappedData as ReturnType<typeof vi.fn>).mockReturnValue({
        valid: true,
        errors: [],
      });

      let insertQuery = '';
      mockClient.query.mockImplementation((sql: string) => {
        if (sql.includes('INSERT INTO') && sql.includes('catalog_requests')) {
          insertQuery = sql;
          return { rows: [{ id: 'request-1' }] };
        }
        return { rows: [] };
      });

      const records = [
        {
          sourceId: 'REQ001',
          entityType: 'request' as const,
          data: {},
          metadata: { createdAt },
        },
      ];

      await requestImporter.import(
        records,
        {
          entityType: 'request',
          sourceSystem: 'servicenow',
          fieldMappings: [],
        },
        {
          tenantId: 'tenant-1',
          tenantSchema: 'tenant_test',
          jobId: 'job-1',
        }
      );

      expect(insertQuery).toContain('created_at');
    });
  });

  describe('rollback', () => {
    it('should rollback imported requests', async () => {
      const { pool } = await import('../../../../src/config/database.js');
      const { requestImporter } = await import('../../../../src/services/migration/importers/request-importer.js');

      (pool.connect as ReturnType<typeof vi.fn>).mockResolvedValue(mockClient);

      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ // SELECT imported records
          rows: [
            { target_id: 'req-1', target_schema: 'tenant_test', target_table: 'catalog_requests' },
            { target_id: 'req-2', target_schema: 'tenant_test', target_table: 'catalog_requests' },
          ],
        })
        .mockResolvedValueOnce({ rows: [] }) // DELETE request 1
        .mockResolvedValueOnce({ rows: [] }) // DELETE request 2
        .mockResolvedValueOnce({ rows: [] }) // DELETE tracking records
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const deletedCount = await requestImporter.rollback('job-1');

      expect(deletedCount).toBe(2);
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });

    it('should handle rollback with no records', async () => {
      const { pool } = await import('../../../../src/config/database.js');
      const { requestImporter } = await import('../../../../src/services/migration/importers/request-importer.js');

      (pool.connect as ReturnType<typeof vi.fn>).mockResolvedValue(mockClient);

      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // No imported records
        .mockResolvedValueOnce({ rows: [] }) // DELETE tracking (none)
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const deletedCount = await requestImporter.rollback('job-1');

      expect(deletedCount).toBe(0);
    });

    it('should rollback on error during rollback', async () => {
      const { pool } = await import('../../../../src/config/database.js');
      const { requestImporter } = await import('../../../../src/services/migration/importers/request-importer.js');

      (pool.connect as ReturnType<typeof vi.fn>).mockResolvedValue(mockClient);

      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockRejectedValueOnce(new Error('Query failed')); // SELECT fails

      await expect(requestImporter.rollback('job-1')).rejects.toThrow('Query failed');
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe('findExistingRequest', () => {
    it('should return null when no external_id provided', async () => {
      const { pool } = await import('../../../../src/config/database.js');
      const { fieldMapper } = await import('../../../../src/services/migration/mappers/field-mapper.js');
      const { requestImporter } = await import('../../../../src/services/migration/importers/request-importer.js');

      (pool.connect as ReturnType<typeof vi.fn>).mockResolvedValue(mockClient);

      (fieldMapper.mapRecord as ReturnType<typeof vi.fn>).mockReturnValue({
        targetData: {
          title: 'Test Request',
          external_id: '',
        },
        errors: [],
      });

      (fieldMapper.validateMappedData as ReturnType<typeof vi.fn>).mockReturnValue({
        valid: true,
        errors: [],
      });

      mockClient.query.mockImplementation((sql: string) => {
        if (sql.includes('INSERT INTO') && sql.includes('catalog_requests')) {
          return { rows: [{ id: 'request-1' }] };
        }
        return { rows: [] };
      });

      const records = [
        {
          sourceId: 'REQ001',
          entityType: 'request' as const,
          data: {},
        },
      ];

      const result = await requestImporter.import(
        records,
        {
          entityType: 'request',
          sourceSystem: 'servicenow',
          fieldMappings: [],
        },
        {
          tenantId: 'tenant-1',
          tenantSchema: 'tenant_test',
          jobId: 'job-1',
          skipDuplicates: true,
        }
      );

      expect(result.successfulRecords).toBe(1);
    });
  });

  describe('updateRequest', () => {
    it('should not call update SQL when no fields to update', async () => {
      const { pool } = await import('../../../../src/config/database.js');
      const { fieldMapper } = await import('../../../../src/services/migration/mappers/field-mapper.js');
      const { requestImporter } = await import('../../../../src/services/migration/importers/request-importer.js');

      (pool.connect as ReturnType<typeof vi.fn>).mockResolvedValue(mockClient);

      (fieldMapper.mapRecord as ReturnType<typeof vi.fn>).mockReturnValue({
        targetData: {
          external_id: 'REQ001',
          // No updatable fields (only external_id which is not in updatable list)
        },
        errors: [],
      });

      (fieldMapper.validateMappedData as ReturnType<typeof vi.fn>).mockReturnValue({
        valid: true,
        errors: [],
      });

      const queryLog: string[] = [];
      mockClient.query.mockImplementation((sql: string) => {
        queryLog.push(sql);
        if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
          return { rows: [] };
        }
        if (sql.includes('SELECT id FROM') && sql.includes('catalog_requests')) {
          return { rows: [{ id: 'existing-1' }] };
        }
        return { rows: [] };
      });

      const records = [
        {
          sourceId: 'REQ001',
          entityType: 'request' as const,
          data: {},
        },
      ];

      const result = await requestImporter.import(
        records,
        {
          entityType: 'request',
          sourceSystem: 'servicenow',
          fieldMappings: [],
        },
        {
          tenantId: 'tenant-1',
          tenantSchema: 'tenant_test',
          jobId: 'job-1',
          updateExisting: true,
        }
      );

      // Check no UPDATE was called - only SELECT, tracking, and transaction queries
      const updateQueries = queryLog.filter(sql => sql.includes('UPDATE') && sql.includes('catalog_requests'));
      expect(updateQueries.length).toBe(0);
      // The record should still be counted as updated (found existing)
      expect(result.updatedRecords).toBe(1);
    });
  });

  describe('optional fields handling', () => {
    it('should include all optional fields when present', async () => {
      const { pool } = await import('../../../../src/config/database.js');
      const { fieldMapper } = await import('../../../../src/services/migration/mappers/field-mapper.js');
      const { requestImporter } = await import('../../../../src/services/migration/importers/request-importer.js');

      (pool.connect as ReturnType<typeof vi.fn>).mockResolvedValue(mockClient);

      (fieldMapper.mapRecord as ReturnType<typeof vi.fn>).mockReturnValue({
        targetData: {
          title: 'Test Request',
          description: 'Test description',
          external_id: 'REQ001',
          requested_for_email: 'requester@example.com',
          assigned_to_email: 'user@example.com',
          assigned_group: 'IT Support',
          category: 'Software',
          approval_status: 'approved',
          fulfillment_notes: 'Fulfilled',
          closed_at: '2024-01-15T12:00:00Z',
        },
        errors: [],
      });

      (fieldMapper.validateMappedData as ReturnType<typeof vi.fn>).mockReturnValue({
        valid: true,
        errors: [],
      });

      let insertQuery = '';
      mockClient.query.mockImplementation((sql: string) => {
        if (sql.includes('INSERT INTO') && sql.includes('catalog_requests')) {
          insertQuery = sql;
          return { rows: [{ id: 'request-1' }] };
        }
        return { rows: [] };
      });

      const records = [
        {
          sourceId: 'REQ001',
          entityType: 'request' as const,
          data: {},
        },
      ];

      await requestImporter.import(
        records,
        {
          entityType: 'request',
          sourceSystem: 'servicenow',
          fieldMappings: [],
        },
        {
          tenantId: 'tenant-1',
          tenantSchema: 'tenant_test',
          jobId: 'job-1',
        }
      );

      expect(insertQuery).toContain('description');
      expect(insertQuery).toContain('external_id');
      expect(insertQuery).toContain('requested_for_email');
      expect(insertQuery).toContain('assigned_to_email');
      expect(insertQuery).toContain('category');
      expect(insertQuery).toContain('approval_status');
      expect(insertQuery).toContain('fulfillment_notes');
      expect(insertQuery).toContain('closed_at');
    });
  });

  describe('error handling', () => {
    it('should handle non-Error exceptions', async () => {
      const { pool } = await import('../../../../src/config/database.js');
      const { fieldMapper } = await import('../../../../src/services/migration/mappers/field-mapper.js');
      const { requestImporter } = await import('../../../../src/services/migration/importers/request-importer.js');

      (pool.connect as ReturnType<typeof vi.fn>).mockResolvedValue(mockClient);

      (fieldMapper.mapRecord as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw 'String error';
      });

      mockClient.query.mockResolvedValue({ rows: [] });

      const records = [
        {
          sourceId: 'REQ001',
          entityType: 'request' as const,
          data: {},
        },
      ];

      const result = await requestImporter.import(
        records,
        {
          entityType: 'request',
          sourceSystem: 'servicenow',
          fieldMappings: [],
        },
        {
          tenantId: 'tenant-1',
          tenantSchema: 'tenant_test',
          jobId: 'job-1',
        }
      );

      expect(result.failedRecords).toBe(1);
      expect(result.errors[0].errorMessage).toBe('Unknown import error');
    });
  });

  describe('tracking imported records', () => {
    it('should use upsert for tracking records', async () => {
      const { pool } = await import('../../../../src/config/database.js');
      const { fieldMapper } = await import('../../../../src/services/migration/mappers/field-mapper.js');
      const { requestImporter } = await import('../../../../src/services/migration/importers/request-importer.js');

      (pool.connect as ReturnType<typeof vi.fn>).mockResolvedValue(mockClient);

      (fieldMapper.mapRecord as ReturnType<typeof vi.fn>).mockReturnValue({
        targetData: {
          title: 'Test Request',
          external_id: 'REQ001',
        },
        errors: [],
      });

      (fieldMapper.validateMappedData as ReturnType<typeof vi.fn>).mockReturnValue({
        valid: true,
        errors: [],
      });

      let trackingQuery = '';
      mockClient.query.mockImplementation((sql: string) => {
        if (sql.includes('INSERT INTO') && sql.includes('catalog_requests')) {
          return { rows: [{ id: 'request-1' }] };
        }
        if (sql.includes('migration_imported_records')) {
          trackingQuery = sql;
        }
        return { rows: [] };
      });

      const records = [
        {
          sourceId: 'REQ001',
          entityType: 'request' as const,
          data: {},
        },
      ];

      await requestImporter.import(
        records,
        {
          entityType: 'request',
          sourceSystem: 'servicenow',
          fieldMappings: [],
        },
        {
          tenantId: 'tenant-1',
          tenantSchema: 'tenant_test',
          jobId: 'job-1',
        }
      );

      expect(trackingQuery).toContain('ON CONFLICT');
      expect(trackingQuery).toContain('DO UPDATE');
    });
  });
});
