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

describe('IncidentImporter', () => {
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
    it('should successfully import new incidents', async () => {
      const { pool } = await import('../../../../src/config/database.js');
      const { fieldMapper } = await import('../../../../src/services/migration/mappers/field-mapper.js');
      const { incidentImporter } = await import('../../../../src/services/migration/importers/incident-importer.js');

      (pool.connect as ReturnType<typeof vi.fn>).mockResolvedValue(mockClient);

      (fieldMapper.mapRecord as ReturnType<typeof vi.fn>).mockReturnValue({
        targetData: {
          title: 'Test Incident',
          priority: 2,
          status: 'open',
          external_id: 'INC001',
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
        if (sql.includes('INSERT INTO') && sql.includes('.incidents')) {
          return { rows: [{ id: 'incident-123' }] };
        }
        if (sql.includes('migration_imported_records')) {
          return { rows: [] };
        }
        return { rows: [] };
      });

      const records = [
        {
          sourceId: 'INC001',
          entityType: 'incident' as const,
          data: { number: 'INC001', short_description: 'Test Incident' },
        },
      ];

      const result = await incidentImporter.import(
        records,
        {
          entityType: 'incident',
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
      const { incidentImporter } = await import('../../../../src/services/migration/importers/incident-importer.js');

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
          sourceId: 'INC001',
          entityType: 'incident' as const,
          data: {},
        },
      ];

      const result = await incidentImporter.import(
        records,
        {
          entityType: 'incident',
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
      const { incidentImporter } = await import('../../../../src/services/migration/importers/incident-importer.js');

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
          sourceId: 'INC001',
          entityType: 'incident' as const,
          data: { short_description: '' },
        },
      ];

      const result = await incidentImporter.import(
        records,
        {
          entityType: 'incident',
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
      const { incidentImporter } = await import('../../../../src/services/migration/importers/incident-importer.js');

      (pool.connect as ReturnType<typeof vi.fn>).mockResolvedValue(mockClient);

      (fieldMapper.mapRecord as ReturnType<typeof vi.fn>).mockReturnValue({
        targetData: {
          title: 'Test Incident',
          external_id: 'INC001',
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
          sourceId: 'INC001',
          entityType: 'incident' as const,
          data: { number: 'INC001' },
        },
      ];

      const result = await incidentImporter.import(
        records,
        {
          entityType: 'incident',
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
      const { incidentImporter } = await import('../../../../src/services/migration/importers/incident-importer.js');

      (pool.connect as ReturnType<typeof vi.fn>).mockResolvedValue(mockClient);

      (fieldMapper.mapRecord as ReturnType<typeof vi.fn>).mockReturnValue({
        targetData: {
          title: 'Updated Incident',
          priority: 1,
          external_id: 'INC001',
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
          sourceId: 'INC001',
          entityType: 'incident' as const,
          data: { number: 'INC001', short_description: 'Updated Incident' },
        },
      ];

      const result = await incidentImporter.import(
        records,
        {
          entityType: 'incident',
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
      const { incidentImporter } = await import('../../../../src/services/migration/importers/incident-importer.js');

      (pool.connect as ReturnType<typeof vi.fn>).mockResolvedValue(mockClient);

      (fieldMapper.mapRecord as ReturnType<typeof vi.fn>).mockReturnValue({
        targetData: {
          title: 'Test Incident',
          external_id: 'INC001',
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
          sourceId: 'INC001',
          entityType: 'incident' as const,
          data: { number: 'INC001' },
        },
      ];

      const result = await incidentImporter.import(
        records,
        {
          entityType: 'incident',
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
      const { incidentImporter } = await import('../../../../src/services/migration/importers/incident-importer.js');

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
          sourceId: 'INC001',
          entityType: 'incident' as const,
          data: {},
        },
      ];

      const result = await incidentImporter.import(
        records,
        {
          entityType: 'incident',
          sourceSystem: 'servicenow',
          fieldMappings: [],
        },
        {
          tenantId: 'tenant-1',
          tenantSchema: 'tenant_test',
          jobId: 'job-1',
        }
      );

      // Error is caught inside loop, not causing rollback
      expect(result.failedRecords).toBe(1);
    });

    it('should import multiple records', async () => {
      const { pool } = await import('../../../../src/config/database.js');
      const { fieldMapper } = await import('../../../../src/services/migration/mappers/field-mapper.js');
      const { incidentImporter } = await import('../../../../src/services/migration/importers/incident-importer.js');

      (pool.connect as ReturnType<typeof vi.fn>).mockResolvedValue(mockClient);

      (fieldMapper.mapRecord as ReturnType<typeof vi.fn>).mockImplementation((record: any, _config: any, index: number) => ({
        targetData: {
          title: `Incident ${index + 1}`,
          priority: 2,
          external_id: record.sourceId,
        },
        errors: [],
      }));

      (fieldMapper.validateMappedData as ReturnType<typeof vi.fn>).mockReturnValue({
        valid: true,
        errors: [],
      });

      mockClient.query.mockResolvedValue({ rows: [] });
      // Mock INSERT returning unique IDs
      let insertCount = 0;
      mockClient.query.mockImplementation((sql: string) => {
        if (sql.includes('INSERT INTO') && sql.includes('incidents')) {
          insertCount++;
          return { rows: [{ id: `incident-${insertCount}` }] };
        }
        return { rows: [] };
      });

      const records = [
        { sourceId: 'INC001', entityType: 'incident' as const, data: {} },
        { sourceId: 'INC002', entityType: 'incident' as const, data: {} },
        { sourceId: 'INC003', entityType: 'incident' as const, data: {} },
      ];

      const result = await incidentImporter.import(
        records,
        {
          entityType: 'incident',
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
      const { incidentImporter } = await import('../../../../src/services/migration/importers/incident-importer.js');

      (pool.connect as ReturnType<typeof vi.fn>).mockResolvedValue(mockClient);

      const createdAt = new Date('2024-01-01T10:00:00Z');

      (fieldMapper.mapRecord as ReturnType<typeof vi.fn>).mockReturnValue({
        targetData: {
          title: 'Test Incident',
          priority: 2,
          external_id: 'INC001',
        },
        errors: [],
      });

      (fieldMapper.validateMappedData as ReturnType<typeof vi.fn>).mockReturnValue({
        valid: true,
        errors: [],
      });

      let insertQuery = '';
      mockClient.query.mockImplementation((sql: string, params?: any[]) => {
        if (sql.includes('INSERT INTO') && sql.includes('incidents')) {
          insertQuery = sql;
          return { rows: [{ id: 'incident-1' }] };
        }
        return { rows: [] };
      });

      const records = [
        {
          sourceId: 'INC001',
          entityType: 'incident' as const,
          data: {},
          metadata: { createdAt },
        },
      ];

      await incidentImporter.import(
        records,
        {
          entityType: 'incident',
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
    it('should rollback imported incidents', async () => {
      const { pool } = await import('../../../../src/config/database.js');
      const { incidentImporter } = await import('../../../../src/services/migration/importers/incident-importer.js');

      (pool.connect as ReturnType<typeof vi.fn>).mockResolvedValue(mockClient);

      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ // SELECT imported records
          rows: [
            { target_id: 'inc-1', target_schema: 'tenant_test', target_table: 'incidents' },
            { target_id: 'inc-2', target_schema: 'tenant_test', target_table: 'incidents' },
          ],
        })
        .mockResolvedValueOnce({ rows: [] }) // DELETE incident 1
        .mockResolvedValueOnce({ rows: [] }) // DELETE incident 2
        .mockResolvedValueOnce({ rows: [] }) // DELETE tracking records
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const deletedCount = await incidentImporter.rollback('job-1');

      expect(deletedCount).toBe(2);
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });

    it('should handle rollback with no records', async () => {
      const { pool } = await import('../../../../src/config/database.js');
      const { incidentImporter } = await import('../../../../src/services/migration/importers/incident-importer.js');

      (pool.connect as ReturnType<typeof vi.fn>).mockResolvedValue(mockClient);

      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // No imported records
        .mockResolvedValueOnce({ rows: [] }) // DELETE tracking (none)
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const deletedCount = await incidentImporter.rollback('job-1');

      expect(deletedCount).toBe(0);
    });

    it('should rollback on error during rollback', async () => {
      const { pool } = await import('../../../../src/config/database.js');
      const { incidentImporter } = await import('../../../../src/services/migration/importers/incident-importer.js');

      (pool.connect as ReturnType<typeof vi.fn>).mockResolvedValue(mockClient);

      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockRejectedValueOnce(new Error('Query failed')); // SELECT fails

      await expect(incidentImporter.rollback('job-1')).rejects.toThrow('Query failed');
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe('findExistingIncident', () => {
    it('should return null when no external_id provided', async () => {
      const { pool } = await import('../../../../src/config/database.js');
      const { fieldMapper } = await import('../../../../src/services/migration/mappers/field-mapper.js');
      const { incidentImporter } = await import('../../../../src/services/migration/importers/incident-importer.js');

      (pool.connect as ReturnType<typeof vi.fn>).mockResolvedValue(mockClient);

      (fieldMapper.mapRecord as ReturnType<typeof vi.fn>).mockReturnValue({
        targetData: {
          title: 'Test Incident',
          external_id: '', // Empty external_id
        },
        errors: [],
      });

      (fieldMapper.validateMappedData as ReturnType<typeof vi.fn>).mockReturnValue({
        valid: true,
        errors: [],
      });

      mockClient.query.mockImplementation((sql: string) => {
        if (sql.includes('INSERT INTO') && sql.includes('incidents')) {
          return { rows: [{ id: 'incident-1' }] };
        }
        return { rows: [] };
      });

      const records = [
        {
          sourceId: 'INC001',
          entityType: 'incident' as const,
          data: {},
        },
      ];

      const result = await incidentImporter.import(
        records,
        {
          entityType: 'incident',
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

      // Should not check for duplicates with empty external_id, so it inserts
      expect(result.successfulRecords).toBe(1);
    });
  });

  describe('updateIncident', () => {
    it('should not call update SQL when no fields to update', async () => {
      const { pool } = await import('../../../../src/config/database.js');
      const { fieldMapper } = await import('../../../../src/services/migration/mappers/field-mapper.js');
      const { incidentImporter } = await import('../../../../src/services/migration/importers/incident-importer.js');

      (pool.connect as ReturnType<typeof vi.fn>).mockResolvedValue(mockClient);

      (fieldMapper.mapRecord as ReturnType<typeof vi.fn>).mockReturnValue({
        targetData: {
          external_id: 'INC001',
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
        if (sql.includes('SELECT id FROM') && sql.includes('incidents')) {
          return { rows: [{ id: 'existing-1' }] };
        }
        return { rows: [] };
      });

      const records = [
        {
          sourceId: 'INC001',
          entityType: 'incident' as const,
          data: {},
        },
      ];

      const result = await incidentImporter.import(
        records,
        {
          entityType: 'incident',
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
      const updateQueries = queryLog.filter(sql => sql.includes('UPDATE') && sql.includes('incidents'));
      expect(updateQueries.length).toBe(0);
      // The record should still be counted as updated (found existing)
      expect(result.updatedRecords).toBe(1);
    });
  });

  describe('optional fields handling', () => {
    it('should include all optional fields when present', async () => {
      const { pool } = await import('../../../../src/config/database.js');
      const { fieldMapper } = await import('../../../../src/services/migration/mappers/field-mapper.js');
      const { incidentImporter } = await import('../../../../src/services/migration/importers/incident-importer.js');

      (pool.connect as ReturnType<typeof vi.fn>).mockResolvedValue(mockClient);

      (fieldMapper.mapRecord as ReturnType<typeof vi.fn>).mockReturnValue({
        targetData: {
          title: 'Test Incident',
          description: 'Test description',
          external_id: 'INC001',
          impact: 'high',
          urgency: 'high',
          assigned_to_email: 'user@example.com',
          assigned_group: 'IT Support',
          reporter_email: 'reporter@example.com',
          category: 'Hardware',
          subcategory: 'Laptop',
          resolution_notes: 'Fixed',
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
        if (sql.includes('INSERT INTO') && sql.includes('incidents')) {
          insertQuery = sql;
          return { rows: [{ id: 'incident-1' }] };
        }
        return { rows: [] };
      });

      const records = [
        {
          sourceId: 'INC001',
          entityType: 'incident' as const,
          data: {},
        },
      ];

      await incidentImporter.import(
        records,
        {
          entityType: 'incident',
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
      expect(insertQuery).toContain('impact');
      expect(insertQuery).toContain('urgency');
      expect(insertQuery).toContain('assigned_to_email');
      expect(insertQuery).toContain('category');
      expect(insertQuery).toContain('closed_at');
    });
  });

  describe('error handling', () => {
    it('should handle non-Error exceptions', async () => {
      const { pool } = await import('../../../../src/config/database.js');
      const { fieldMapper } = await import('../../../../src/services/migration/mappers/field-mapper.js');
      const { incidentImporter } = await import('../../../../src/services/migration/importers/incident-importer.js');

      (pool.connect as ReturnType<typeof vi.fn>).mockResolvedValue(mockClient);

      (fieldMapper.mapRecord as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw 'String error';
      });

      mockClient.query.mockResolvedValue({ rows: [] });

      const records = [
        {
          sourceId: 'INC001',
          entityType: 'incident' as const,
          data: {},
        },
      ];

      const result = await incidentImporter.import(
        records,
        {
          entityType: 'incident',
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
});
