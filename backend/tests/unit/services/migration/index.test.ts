import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock all dependencies before importing the service
vi.mock('../../../../src/config/database.js', () => ({
  pool: {
    query: vi.fn(),
  },
}));

vi.mock('../../../../src/services/tenant.js', () => ({
  tenantService: {
    findBySlug: vi.fn(),
    getSchemaName: vi.fn((slug: string) => `tenant_${slug.replace(/-/g, '_')}`),
  },
}));

vi.mock('../../../../src/services/storage.js', () => ({
  storageService: {
    uploadMigrationFile: vi.fn(),
    downloadMigrationFile: vi.fn(),
    deleteMigrationFile: vi.fn(),
  },
}));

vi.mock('../../../../src/services/migration/parsers/generic-csv.js', () => ({
  genericCSVParser: {
    parseCSV: vi.fn(),
  },
}));

vi.mock('../../../../src/services/migration/parsers/servicenow.js', () => ({
  serviceNowParser: {
    parse: vi.fn(),
  },
}));

vi.mock('../../../../src/services/migration/mappers/field-mapper.js', () => ({
  fieldMapper: {
    getDefaultMappings: vi.fn(),
  },
}));

vi.mock('../../../../src/services/migration/importers/incident-importer.js', () => ({
  incidentImporter: {
    import: vi.fn(),
  },
}));

vi.mock('../../../../src/services/migration/importers/request-importer.js', () => ({
  requestImporter: {
    import: vi.fn(),
  },
}));

vi.mock('../../../../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { MigrationService } from '../../../../src/services/migration/index.js';
import { pool } from '../../../../src/config/database.js';
import { tenantService } from '../../../../src/services/tenant.js';
import { storageService } from '../../../../src/services/storage.js';
import { genericCSVParser } from '../../../../src/services/migration/parsers/generic-csv.js';
import { serviceNowParser } from '../../../../src/services/migration/parsers/servicenow.js';
import { fieldMapper } from '../../../../src/services/migration/mappers/field-mapper.js';
import { incidentImporter } from '../../../../src/services/migration/importers/incident-importer.js';
import { requestImporter } from '../../../../src/services/migration/importers/request-importer.js';

describe('MigrationService', () => {
  let service: MigrationService;

  const mockTenant = {
    id: 'tenant-123',
    slug: 'test-tenant',
    name: 'Test Tenant',
    schema_name: 'tenant_test_tenant',
  };

  const mockUserId = 'user-456';

  const mockParsedRecords = [
    { data: { number: 'INC001', short_description: 'Test issue 1', priority: '2' }, rowNumber: 1 },
    { data: { number: 'INC002', short_description: 'Test issue 2', priority: '3' }, rowNumber: 2 },
  ];

  const mockFieldMappings = [
    { sourceField: 'number', targetField: 'external_id', required: true },
    { sourceField: 'short_description', targetField: 'title', required: true },
    { sourceField: 'priority', targetField: 'priority', required: false },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    service = new MigrationService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createMigrationJob', () => {
    const baseRequest = {
      tenantSlug: 'test-tenant',
      sourceSystem: 'csv' as const,
      entityType: 'incident' as const,
      filename: 'incidents.csv',
      file: Buffer.from('number,short_description,priority\nINC001,Test,2'),
      dryRun: false,
    };

    it('should create migration job from CSV file', async () => {
      vi.mocked(tenantService.findBySlug).mockResolvedValue(mockTenant as any);
      vi.mocked(genericCSVParser.parseCSV).mockResolvedValue({
        records: mockParsedRecords,
        errors: [],
        metadata: { totalRows: 2, parsedRows: 2 },
      });
      vi.mocked(fieldMapper.getDefaultMappings).mockReturnValue(mockFieldMappings);
      vi.mocked(storageService.uploadMigrationFile).mockResolvedValue('migrations/test-tenant/incidents.csv');
      vi.mocked(pool.query).mockResolvedValue({
        rows: [{
          id: 'job-789',
          tenant_id: mockTenant.id,
          source_system: 'csv',
          entity_type: 'incident',
          status: 'pending',
          total_records: 2,
          mappingConfig: {
            entityType: 'incident',
            sourceSystem: 'csv',
            fieldMappings: mockFieldMappings,
          },
        }],
        rowCount: 1,
      } as any);

      const result = await service.createMigrationJob(baseRequest, mockUserId);

      expect(result.job).toBeDefined();
      expect(result.job.id).toBe('job-789');
      expect(result.preview).toBeDefined();
      expect(tenantService.findBySlug).toHaveBeenCalledWith('test-tenant');
      expect(genericCSVParser.parseCSV).toHaveBeenCalledWith(
        baseRequest.file,
        'incident'
      );
      expect(storageService.uploadMigrationFile).toHaveBeenCalled();
    });

    it('should create migration job from ServiceNow file', async () => {
      const snRequest = {
        ...baseRequest,
        sourceSystem: 'servicenow' as const,
        filename: 'incidents.xml',
      };

      vi.mocked(tenantService.findBySlug).mockResolvedValue(mockTenant as any);
      vi.mocked(serviceNowParser.parse).mockResolvedValue({
        records: mockParsedRecords,
        errors: [],
        metadata: { totalRows: 2, parsedRows: 2 },
      });
      vi.mocked(fieldMapper.getDefaultMappings).mockReturnValue(mockFieldMappings);
      vi.mocked(storageService.uploadMigrationFile).mockResolvedValue('migrations/test-tenant/incidents.xml');
      vi.mocked(pool.query).mockResolvedValue({
        rows: [{
          id: 'job-789',
          tenant_id: mockTenant.id,
          source_system: 'servicenow',
          entity_type: 'incident',
          status: 'pending',
          total_records: 2,
          mappingConfig: {
            entityType: 'incident',
            sourceSystem: 'servicenow',
            fieldMappings: mockFieldMappings,
          },
        }],
        rowCount: 1,
      } as any);

      const result = await service.createMigrationJob(snRequest, mockUserId);

      expect(result.job).toBeDefined();
      expect(serviceNowParser.parse).toHaveBeenCalledWith(
        snRequest.file,
        'incident'
      );
    });

    it('should use mapping template when provided', async () => {
      const requestWithTemplate = {
        ...baseRequest,
        mappingTemplateId: 'template-123',
      };

      const templateMappings = [
        { sourceField: 'sys_id', targetField: 'external_id', required: true },
      ];

      vi.mocked(tenantService.findBySlug).mockResolvedValue(mockTenant as any);
      vi.mocked(genericCSVParser.parseCSV).mockResolvedValue({
        records: mockParsedRecords,
        errors: [],
        metadata: { totalRows: 2, parsedRows: 2 },
      });
      vi.mocked(storageService.uploadMigrationFile).mockResolvedValue('migrations/test-tenant/incidents.csv');

      // First call for template lookup, second for job insert
      vi.mocked(pool.query)
        .mockResolvedValueOnce({
          rows: [{
            id: 'template-123',
            target_entity: 'incident',
            source_system: 'csv',
            field_mappings: templateMappings,
            user_mappings: [],
            status_mappings: [],
            priority_mappings: [],
          }],
          rowCount: 1,
        } as any)
        .mockResolvedValueOnce({
          rows: [{
            id: 'job-789',
            tenant_id: mockTenant.id,
            mappingConfig: {
              entityType: 'incident',
              sourceSystem: 'csv',
              fieldMappings: templateMappings,
            },
          }],
          rowCount: 1,
        } as any);

      const result = await service.createMigrationJob(requestWithTemplate, mockUserId);

      expect(result.job).toBeDefined();
      expect(fieldMapper.getDefaultMappings).not.toHaveBeenCalled();
    });

    it('should throw NotFoundError when tenant not found', async () => {
      vi.mocked(tenantService.findBySlug).mockResolvedValue(null);

      await expect(service.createMigrationJob(baseRequest, mockUserId))
        .rejects.toThrow('Tenant');
    });

    it('should throw BadRequestError when no valid records parsed', async () => {
      vi.mocked(tenantService.findBySlug).mockResolvedValue(mockTenant as any);
      vi.mocked(genericCSVParser.parseCSV).mockResolvedValue({
        records: [],
        errors: [{ row: 1, message: 'Invalid format' }],
        metadata: { totalRows: 1, parsedRows: 0 },
      });

      await expect(service.createMigrationJob(baseRequest, mockUserId))
        .rejects.toThrow('Failed to parse file');
    });

    it('should set status to preview when dryRun is true', async () => {
      const dryRunRequest = { ...baseRequest, dryRun: true };

      vi.mocked(tenantService.findBySlug).mockResolvedValue(mockTenant as any);
      vi.mocked(genericCSVParser.parseCSV).mockResolvedValue({
        records: mockParsedRecords,
        errors: [],
        metadata: { totalRows: 2, parsedRows: 2 },
      });
      vi.mocked(fieldMapper.getDefaultMappings).mockReturnValue(mockFieldMappings);
      vi.mocked(storageService.uploadMigrationFile).mockResolvedValue('migrations/test-tenant/incidents.csv');
      vi.mocked(pool.query).mockResolvedValue({
        rows: [{
          id: 'job-789',
          status: 'preview',
          mappingConfig: {
            entityType: 'incident',
            sourceSystem: 'csv',
            fieldMappings: mockFieldMappings,
          },
        }],
        rowCount: 1,
      } as any);

      const result = await service.createMigrationJob(dryRunRequest, mockUserId);

      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO public.migration_jobs'),
        expect.arrayContaining(['preview'])
      );
    });
  });

  describe('executeMigration', () => {
    const mockJob = {
      id: 'job-789',
      tenantId: 'tenant-123',
      sourceSystem: 'csv',
      entityType: 'incident',
      status: 'pending',
      filePath: 'migrations/test-tenant/incidents.csv',
      mappingConfig: {
        entityType: 'incident',
        sourceSystem: 'csv',
        fieldMappings: mockFieldMappings,
      },
    };

    it('should execute incident migration successfully', async () => {
      // Mock getJobById
      vi.mocked(pool.query)
        .mockResolvedValueOnce({ rows: [mockJob], rowCount: 1 } as any) // getJobById
        .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any) // updateJobStatus to processing
        .mockResolvedValueOnce({ rows: [mockTenant], rowCount: 1 } as any) // get tenant
        .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any); // updateJobStatus to completed

      vi.mocked(storageService.downloadMigrationFile).mockResolvedValue(
        Buffer.from('number,short_description\nINC001,Test')
      );
      vi.mocked(genericCSVParser.parseCSV).mockResolvedValue({
        records: mockParsedRecords,
        errors: [],
        metadata: { totalRows: 2, parsedRows: 2 },
      });
      vi.mocked(incidentImporter.import).mockResolvedValue({
        totalRecords: 2,
        successfulRecords: 2,
        failedRecords: 0,
        skippedRecords: 0,
        errors: [],
        importedIds: ['id-1', 'id-2'],
      });
      vi.mocked(storageService.deleteMigrationFile).mockResolvedValue(undefined);

      const result = await service.executeMigration({ jobId: 'job-789' });

      expect(result.status).toBe('completed');
      expect(result.successfulRecords).toBe(2);
      expect(result.failedRecords).toBe(0);
      expect(incidentImporter.import).toHaveBeenCalled();
      expect(storageService.deleteMigrationFile).toHaveBeenCalled();
    });

    it('should execute request migration successfully', async () => {
      const requestJob = {
        ...mockJob,
        mappingConfig: {
          ...mockJob.mappingConfig,
          entityType: 'request',
        },
      };

      vi.mocked(pool.query)
        .mockResolvedValueOnce({ rows: [requestJob], rowCount: 1 } as any)
        .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any)
        .mockResolvedValueOnce({ rows: [mockTenant], rowCount: 1 } as any)
        .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      vi.mocked(storageService.downloadMigrationFile).mockResolvedValue(
        Buffer.from('number,short_description\nREQ001,Test')
      );
      vi.mocked(genericCSVParser.parseCSV).mockResolvedValue({
        records: mockParsedRecords,
        errors: [],
        metadata: { totalRows: 2, parsedRows: 2 },
      });
      vi.mocked(requestImporter.import).mockResolvedValue({
        totalRecords: 2,
        successfulRecords: 2,
        failedRecords: 0,
        skippedRecords: 0,
        errors: [],
        importedIds: ['id-1', 'id-2'],
      });
      vi.mocked(storageService.deleteMigrationFile).mockResolvedValue(undefined);

      const result = await service.executeMigration({ jobId: 'job-789' });

      expect(result.status).toBe('completed');
      expect(requestImporter.import).toHaveBeenCalled();
    });

    it('should throw BadRequestError for invalid job status', async () => {
      const completedJob = { ...mockJob, status: 'completed' };
      vi.mocked(pool.query).mockResolvedValueOnce({ rows: [completedJob], rowCount: 1 } as any);

      await expect(service.executeMigration({ jobId: 'job-789' }))
        .rejects.toThrow('Cannot execute migration in status');
    });

    it('should throw BadRequestError when job has no file path', async () => {
      const jobWithoutFile = { ...mockJob, filePath: null };
      vi.mocked(pool.query)
        .mockResolvedValueOnce({ rows: [jobWithoutFile], rowCount: 1 } as any)
        .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any) // updateJobStatus to processing
        .mockResolvedValueOnce({ rows: [mockTenant], rowCount: 1 } as any) // get tenant
        .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any); // updateJobStatus to failed

      await expect(service.executeMigration({ jobId: 'job-789' }))
        .rejects.toThrow('Migration job has no file path');
    });

    it('should throw NotFoundError when tenant not found during execution', async () => {
      vi.mocked(pool.query)
        .mockResolvedValueOnce({ rows: [mockJob], rowCount: 1 } as any)
        .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any) // updateJobStatus to processing
        .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any) // tenant not found
        .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any); // updateJobStatus to failed

      await expect(service.executeMigration({ jobId: 'job-789' }))
        .rejects.toThrow('Tenant');
    });

    it('should throw BadRequestError for unsupported entity type', async () => {
      const unsupportedJob = {
        ...mockJob,
        mappingConfig: {
          ...mockJob.mappingConfig,
          entityType: 'change',
        },
      };

      vi.mocked(pool.query)
        .mockResolvedValueOnce({ rows: [unsupportedJob], rowCount: 1 } as any)
        .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any)
        .mockResolvedValueOnce({ rows: [mockTenant], rowCount: 1 } as any)
        .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      vi.mocked(storageService.downloadMigrationFile).mockResolvedValue(
        Buffer.from('data')
      );
      vi.mocked(genericCSVParser.parseCSV).mockResolvedValue({
        records: mockParsedRecords,
        errors: [],
        metadata: { totalRows: 2, parsedRows: 2 },
      });

      await expect(service.executeMigration({ jobId: 'job-789' }))
        .rejects.toThrow('not yet supported');
    });

    it('should use ServiceNow parser for servicenow source system', async () => {
      const snJob = { ...mockJob, sourceSystem: 'servicenow' };

      vi.mocked(pool.query)
        .mockResolvedValueOnce({ rows: [snJob], rowCount: 1 } as any)
        .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any)
        .mockResolvedValueOnce({ rows: [mockTenant], rowCount: 1 } as any)
        .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      vi.mocked(storageService.downloadMigrationFile).mockResolvedValue(
        Buffer.from('<xml>data</xml>')
      );
      vi.mocked(serviceNowParser.parse).mockResolvedValue({
        records: mockParsedRecords,
        errors: [],
        metadata: { totalRows: 2, parsedRows: 2 },
      });
      vi.mocked(incidentImporter.import).mockResolvedValue({
        totalRecords: 2,
        successfulRecords: 2,
        failedRecords: 0,
        skippedRecords: 0,
        errors: [],
        importedIds: ['id-1', 'id-2'],
      });
      vi.mocked(storageService.deleteMigrationFile).mockResolvedValue(undefined);

      await service.executeMigration({ jobId: 'job-789' });

      expect(serviceNowParser.parse).toHaveBeenCalled();
      expect(genericCSVParser.parseCSV).not.toHaveBeenCalled();
    });

    it('should handle file cleanup failure gracefully', async () => {
      vi.mocked(pool.query)
        .mockResolvedValueOnce({ rows: [mockJob], rowCount: 1 } as any)
        .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any)
        .mockResolvedValueOnce({ rows: [mockTenant], rowCount: 1 } as any)
        .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      vi.mocked(storageService.downloadMigrationFile).mockResolvedValue(
        Buffer.from('data')
      );
      vi.mocked(genericCSVParser.parseCSV).mockResolvedValue({
        records: mockParsedRecords,
        errors: [],
        metadata: { totalRows: 2, parsedRows: 2 },
      });
      vi.mocked(incidentImporter.import).mockResolvedValue({
        totalRecords: 2,
        successfulRecords: 2,
        failedRecords: 0,
        skippedRecords: 0,
        errors: [],
        importedIds: ['id-1', 'id-2'],
      });
      vi.mocked(storageService.deleteMigrationFile).mockRejectedValue(new Error('Storage error'));

      // Should not throw - cleanup failure is logged but not fatal
      const result = await service.executeMigration({ jobId: 'job-789' });

      expect(result.status).toBe('completed');
    });

    it('should allow execution from preview status', async () => {
      const previewJob = { ...mockJob, status: 'preview' };

      vi.mocked(pool.query)
        .mockResolvedValueOnce({ rows: [previewJob], rowCount: 1 } as any)
        .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any)
        .mockResolvedValueOnce({ rows: [mockTenant], rowCount: 1 } as any)
        .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      vi.mocked(storageService.downloadMigrationFile).mockResolvedValue(
        Buffer.from('data')
      );
      vi.mocked(genericCSVParser.parseCSV).mockResolvedValue({
        records: mockParsedRecords,
        errors: [],
        metadata: { totalRows: 2, parsedRows: 2 },
      });
      vi.mocked(incidentImporter.import).mockResolvedValue({
        totalRecords: 2,
        successfulRecords: 2,
        failedRecords: 0,
        skippedRecords: 0,
        errors: [],
        importedIds: ['id-1', 'id-2'],
      });
      vi.mocked(storageService.deleteMigrationFile).mockResolvedValue(undefined);

      const result = await service.executeMigration({ jobId: 'job-789' });

      expect(result.status).toBe('completed');
    });
  });

  describe('getJobById', () => {
    it('should return job when found', async () => {
      const mockJob = {
        id: 'job-789',
        status: 'pending',
        total_records: 100,
      };

      vi.mocked(pool.query).mockResolvedValue({ rows: [mockJob], rowCount: 1 } as any);

      const result = await service.getJobById('job-789');

      expect(result).toEqual(mockJob);
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM public.migration_jobs'),
        ['job-789']
      );
    });

    it('should throw NotFoundError when job not found', async () => {
      vi.mocked(pool.query).mockResolvedValue({ rows: [], rowCount: 0 } as any);

      await expect(service.getJobById('nonexistent'))
        .rejects.toThrow('Migration job');
    });
  });

  describe('listJobs', () => {
    it('should list jobs for tenant', async () => {
      const mockJobs = [
        { id: 'job-1', status: 'completed' },
        { id: 'job-2', status: 'pending' },
      ];

      vi.mocked(tenantService.findBySlug).mockResolvedValue(mockTenant as any);
      vi.mocked(pool.query).mockResolvedValue({ rows: mockJobs, rowCount: 2 } as any);

      const result = await service.listJobs('test-tenant');

      expect(result).toEqual(mockJobs);
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE tenant_id = $1'),
        [mockTenant.id, 50]
      );
    });

    it('should respect custom limit', async () => {
      vi.mocked(tenantService.findBySlug).mockResolvedValue(mockTenant as any);
      vi.mocked(pool.query).mockResolvedValue({ rows: [], rowCount: 0 } as any);

      await service.listJobs('test-tenant', 10);

      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT $2'),
        [mockTenant.id, 10]
      );
    });

    it('should throw NotFoundError when tenant not found', async () => {
      vi.mocked(tenantService.findBySlug).mockResolvedValue(null);

      await expect(service.listJobs('nonexistent'))
        .rejects.toThrow('Tenant');
    });
  });

  describe('saveMappingTemplate', () => {
    const mockConfig = {
      entityType: 'incident' as const,
      sourceSystem: 'csv' as const,
      fieldMappings: mockFieldMappings,
      userMappings: [],
      statusMappings: [],
      priorityMappings: [],
    };

    it('should save mapping template successfully', async () => {
      vi.mocked(tenantService.findBySlug).mockResolvedValue(mockTenant as any);
      vi.mocked(pool.query).mockResolvedValue({
        rows: [{ id: 'template-123' }],
        rowCount: 1,
      } as any);

      const result = await service.saveMappingTemplate(
        'test-tenant',
        'My Template',
        mockConfig,
        mockUserId
      );

      expect(result).toBe('template-123');
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO public.migration_mappings'),
        expect.arrayContaining([
          mockTenant.id,
          'My Template',
          'csv',
          'incident',
        ])
      );
    });

    it('should throw NotFoundError when tenant not found', async () => {
      vi.mocked(tenantService.findBySlug).mockResolvedValue(null);

      await expect(
        service.saveMappingTemplate('nonexistent', 'Template', mockConfig, mockUserId)
      ).rejects.toThrow('Tenant');
    });
  });

  describe('preview generation', () => {
    const baseRequest = {
      tenantSlug: 'test-tenant',
      sourceSystem: 'csv' as const,
      entityType: 'incident' as const,
      filename: 'incidents.csv',
      file: Buffer.from('data'),
      dryRun: true,
    };

    it('should identify unmapped fields', async () => {
      const recordsWithExtraFields = [
        { data: { number: 'INC001', title: 'Test', custom_field: 'value' }, rowNumber: 1 },
      ];

      vi.mocked(tenantService.findBySlug).mockResolvedValue(mockTenant as any);
      vi.mocked(genericCSVParser.parseCSV).mockResolvedValue({
        records: recordsWithExtraFields,
        errors: [],
        metadata: { totalRows: 1, parsedRows: 1 },
      });
      vi.mocked(fieldMapper.getDefaultMappings).mockReturnValue([
        { sourceField: 'number', targetField: 'external_id', required: true },
      ]);
      vi.mocked(storageService.uploadMigrationFile).mockResolvedValue('path');
      vi.mocked(pool.query).mockResolvedValue({
        rows: [{
          id: 'job-1',
          mappingConfig: {
            entityType: 'incident',
            sourceSystem: 'csv',
            fieldMappings: [
              { sourceField: 'number', targetField: 'external_id', required: true },
            ],
          },
        }],
        rowCount: 1,
      } as any);

      const result = await service.createMigrationJob(baseRequest, mockUserId);

      expect(result.preview?.unmappedFields).toContain('title');
      expect(result.preview?.unmappedFields).toContain('custom_field');
    });

    it('should identify missing required field mappings', async () => {
      vi.mocked(tenantService.findBySlug).mockResolvedValue(mockTenant as any);
      vi.mocked(genericCSVParser.parseCSV).mockResolvedValue({
        records: [{ data: { description: 'Test' }, rowNumber: 1 }],
        errors: [],
        metadata: { totalRows: 1, parsedRows: 1 },
      });
      vi.mocked(fieldMapper.getDefaultMappings).mockReturnValue([
        { sourceField: null, targetField: 'title', required: true }, // Required but no source mapping
        { sourceField: 'description', targetField: 'description', required: false },
      ]);
      vi.mocked(storageService.uploadMigrationFile).mockResolvedValue('path');
      vi.mocked(pool.query).mockResolvedValue({
        rows: [{
          id: 'job-1',
          mappingConfig: {
            entityType: 'incident',
            sourceSystem: 'csv',
            fieldMappings: [
              { sourceField: null, targetField: 'title', required: true },
              { sourceField: 'description', targetField: 'description', required: false },
            ],
          },
        }],
        rowCount: 1,
      } as any);

      const result = await service.createMigrationJob(baseRequest, mockUserId);

      expect(result.preview?.missingRequiredFields).toContain('title');
    });

    it('should limit sample records to 10', async () => {
      const manyRecords = Array.from({ length: 20 }, (_, i) => ({
        data: { number: `INC${i}` },
        rowNumber: i + 1,
      }));

      vi.mocked(tenantService.findBySlug).mockResolvedValue(mockTenant as any);
      vi.mocked(genericCSVParser.parseCSV).mockResolvedValue({
        records: manyRecords,
        errors: [],
        metadata: { totalRows: 20, parsedRows: 20 },
      });
      vi.mocked(fieldMapper.getDefaultMappings).mockReturnValue(mockFieldMappings);
      vi.mocked(storageService.uploadMigrationFile).mockResolvedValue('path');
      vi.mocked(pool.query).mockResolvedValue({
        rows: [{
          id: 'job-1',
          mappingConfig: {
            entityType: 'incident',
            sourceSystem: 'csv',
            fieldMappings: mockFieldMappings,
          },
        }],
        rowCount: 1,
      } as any);

      const result = await service.createMigrationJob(baseRequest, mockUserId);

      expect(result.preview?.sampleRecords.length).toBe(10);
      expect(result.preview?.totalRecords).toBe(20);
    });

    it('should generate recommendations for unmapped and missing fields', async () => {
      vi.mocked(tenantService.findBySlug).mockResolvedValue(mockTenant as any);
      vi.mocked(genericCSVParser.parseCSV).mockResolvedValue({
        records: [{ data: { extra: 'value' }, rowNumber: 1 }],
        errors: [],
        metadata: { totalRows: 1, parsedRows: 1 },
      });
      vi.mocked(fieldMapper.getDefaultMappings).mockReturnValue([
        { sourceField: null, targetField: 'title', required: true },
      ]);
      vi.mocked(storageService.uploadMigrationFile).mockResolvedValue('path');
      vi.mocked(pool.query).mockResolvedValue({
        rows: [{
          id: 'job-1',
          mappingConfig: {
            entityType: 'incident',
            sourceSystem: 'csv',
            fieldMappings: [
              { sourceField: null, targetField: 'title', required: true },
            ],
          },
        }],
        rowCount: 1,
      } as any);

      const result = await service.createMigrationJob(baseRequest, mockUserId);

      expect(result.preview?.recommendations.length).toBeGreaterThan(0);
      expect(result.preview?.recommendations.some(r => r.includes('not mapped'))).toBe(true);
      expect(result.preview?.recommendations.some(r => r.includes('Missing mappings'))).toBe(true);
    });
  });
});
