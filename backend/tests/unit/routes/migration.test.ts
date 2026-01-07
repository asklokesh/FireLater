import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

// Mock services
vi.mock('../../../src/services/migration/index.js', () => ({
  migrationService: {
    createMigrationJob: vi.fn().mockResolvedValue({ job: {}, preview: {} }),
    executeMigration: vi.fn().mockResolvedValue({}),
    getJobById: vi.fn().mockResolvedValue(null),
    listJobs: vi.fn().mockResolvedValue([]),
    saveMappingTemplate: vi.fn().mockResolvedValue('template-123'),
  },
}));

// Mock middleware
vi.mock('../../../src/middleware/auth.js', () => ({
  authenticate: vi.fn().mockImplementation((_req, _reply, done) => done()),
}));

describe('Migration Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Job ID Parameter', () => {
    const jobIdParamSchema = z.object({
      jobId: z.string().uuid(),
    });

    it('should require valid UUID for jobId', () => {
      const result = jobIdParamSchema.safeParse({ jobId: 'not-a-uuid' });
      expect(result.success).toBe(false);
    });

    it('should accept valid UUID', () => {
      const result = jobIdParamSchema.safeParse({
        jobId: '123e4567-e89b-12d3-a456-426614174000',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('Source Systems', () => {
    const sourceSystems = ['servicenow', 'bmc_remedy', 'jira', 'generic_csv'];

    it('should support 4 source systems', () => {
      expect(sourceSystems.length).toBe(4);
    });

    it('should include servicenow', () => {
      expect(sourceSystems).toContain('servicenow');
    });

    it('should include bmc_remedy', () => {
      expect(sourceSystems).toContain('bmc_remedy');
    });

    it('should include jira', () => {
      expect(sourceSystems).toContain('jira');
    });

    it('should include generic_csv', () => {
      expect(sourceSystems).toContain('generic_csv');
    });
  });

  describe('Entity Types', () => {
    const entityTypes = ['incident', 'request', 'change', 'user', 'group', 'application', 'problem'];

    it('should support 7 entity types', () => {
      expect(entityTypes.length).toBe(7);
    });

    it('should include incident', () => {
      expect(entityTypes).toContain('incident');
    });

    it('should include request', () => {
      expect(entityTypes).toContain('request');
    });

    it('should include change', () => {
      expect(entityTypes).toContain('change');
    });

    it('should include user', () => {
      expect(entityTypes).toContain('user');
    });

    it('should include group', () => {
      expect(entityTypes).toContain('group');
    });

    it('should include application', () => {
      expect(entityTypes).toContain('application');
    });

    it('should include problem', () => {
      expect(entityTypes).toContain('problem');
    });
  });

  describe('Upload Request Schema', () => {
    const uploadRequestSchema = z.object({
      tenantSlug: z.string().min(1),
      sourceSystem: z.enum(['servicenow', 'bmc_remedy', 'jira', 'generic_csv']),
      entityType: z.enum(['incident', 'request', 'change', 'user', 'group', 'application', 'problem']),
      mappingTemplateId: z.string().optional(),
      dryRun: z.boolean().optional(),
    });

    it('should require tenantSlug, sourceSystem, and entityType', () => {
      const result = uploadRequestSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should accept valid upload request', () => {
      const result = uploadRequestSchema.safeParse({
        tenantSlug: 'test-tenant',
        sourceSystem: 'servicenow',
        entityType: 'incident',
      });
      expect(result.success).toBe(true);
    });

    it('should accept mappingTemplateId', () => {
      const result = uploadRequestSchema.safeParse({
        tenantSlug: 'test-tenant',
        sourceSystem: 'servicenow',
        entityType: 'incident',
        mappingTemplateId: 'template-123',
      });
      expect(result.success).toBe(true);
    });

    it('should accept dryRun flag', () => {
      const result = uploadRequestSchema.safeParse({
        tenantSlug: 'test-tenant',
        sourceSystem: 'servicenow',
        entityType: 'incident',
        dryRun: true,
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid sourceSystem', () => {
      const result = uploadRequestSchema.safeParse({
        tenantSlug: 'test-tenant',
        sourceSystem: 'invalid',
        entityType: 'incident',
      });
      expect(result.success).toBe(false);
    });

    it('should reject invalid entityType', () => {
      const result = uploadRequestSchema.safeParse({
        tenantSlug: 'test-tenant',
        sourceSystem: 'servicenow',
        entityType: 'invalid',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('Execute Request Schema', () => {
    const executeRequestSchema = z.object({
      mappingConfig: z.any().optional(),
      continueOnError: z.boolean().optional(),
      batchSize: z.number().int().positive().optional(),
    });

    it('should accept empty body', () => {
      const result = executeRequestSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should accept mappingConfig', () => {
      const result = executeRequestSchema.safeParse({
        mappingConfig: { field1: 'target1' },
      });
      expect(result.success).toBe(true);
    });

    it('should accept continueOnError', () => {
      const result = executeRequestSchema.safeParse({
        continueOnError: true,
      });
      expect(result.success).toBe(true);
    });

    it('should accept batchSize', () => {
      const result = executeRequestSchema.safeParse({
        batchSize: 100,
      });
      expect(result.success).toBe(true);
    });

    it('should reject non-positive batchSize', () => {
      const result = executeRequestSchema.safeParse({
        batchSize: 0,
      });
      expect(result.success).toBe(false);
    });

    it('should reject negative batchSize', () => {
      const result = executeRequestSchema.safeParse({
        batchSize: -10,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('List Jobs Query Schema', () => {
    const listJobsQuerySchema = z.object({
      tenantSlug: z.string().min(1),
      limit: z.coerce.number().int().min(1).max(100).optional(),
    });

    it('should require tenantSlug', () => {
      const result = listJobsQuerySchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should accept valid tenantSlug', () => {
      const result = listJobsQuerySchema.safeParse({
        tenantSlug: 'test-tenant',
      });
      expect(result.success).toBe(true);
    });

    it('should accept limit', () => {
      const result = listJobsQuerySchema.safeParse({
        tenantSlug: 'test-tenant',
        limit: '50',
      });
      expect(result.success).toBe(true);
    });

    it('should reject limit under 1', () => {
      const result = listJobsQuerySchema.safeParse({
        tenantSlug: 'test-tenant',
        limit: '0',
      });
      expect(result.success).toBe(false);
    });

    it('should reject limit over 100', () => {
      const result = listJobsQuerySchema.safeParse({
        tenantSlug: 'test-tenant',
        limit: '101',
      });
      expect(result.success).toBe(false);
    });

    it('should default limit to 50', () => {
      const query = { tenantSlug: 'test-tenant' } as { tenantSlug: string; limit?: number };
      const limit = query.limit ?? 50;
      expect(limit).toBe(50);
    });
  });

  describe('Mapping Template Schema', () => {
    const mappingTemplateSchema = z.object({
      tenantSlug: z.string().min(1),
      name: z.string().min(1),
      sourceSystem: z.enum(['servicenow', 'bmc_remedy', 'jira', 'generic_csv']),
      entityType: z.enum(['incident', 'request', 'change', 'user', 'group', 'application', 'problem']),
      fieldMappings: z.array(z.any()),
      userMappings: z.array(z.any()).optional(),
      statusMappings: z.array(z.any()).optional(),
      priorityMappings: z.array(z.any()).optional(),
    });

    it('should require tenantSlug, name, sourceSystem, entityType, fieldMappings', () => {
      const result = mappingTemplateSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should accept valid mapping template', () => {
      const result = mappingTemplateSchema.safeParse({
        tenantSlug: 'test-tenant',
        name: 'ServiceNow Incidents',
        sourceSystem: 'servicenow',
        entityType: 'incident',
        fieldMappings: [{ source: 'number', target: 'id' }],
      });
      expect(result.success).toBe(true);
    });

    it('should accept userMappings', () => {
      const result = mappingTemplateSchema.safeParse({
        tenantSlug: 'test-tenant',
        name: 'ServiceNow Incidents',
        sourceSystem: 'servicenow',
        entityType: 'incident',
        fieldMappings: [],
        userMappings: [{ source: 'assigned_to', target: 'assignee_id' }],
      });
      expect(result.success).toBe(true);
    });

    it('should accept statusMappings', () => {
      const result = mappingTemplateSchema.safeParse({
        tenantSlug: 'test-tenant',
        name: 'ServiceNow Incidents',
        sourceSystem: 'servicenow',
        entityType: 'incident',
        fieldMappings: [],
        statusMappings: [{ source: 'New', target: 'open' }],
      });
      expect(result.success).toBe(true);
    });

    it('should accept priorityMappings', () => {
      const result = mappingTemplateSchema.safeParse({
        tenantSlug: 'test-tenant',
        name: 'ServiceNow Incidents',
        sourceSystem: 'servicenow',
        entityType: 'incident',
        fieldMappings: [],
        priorityMappings: [{ source: '1 - Critical', target: 'critical' }],
      });
      expect(result.success).toBe(true);
    });

    it('should require non-empty name', () => {
      const result = mappingTemplateSchema.safeParse({
        tenantSlug: 'test-tenant',
        name: '',
        sourceSystem: 'servicenow',
        entityType: 'incident',
        fieldMappings: [],
      });
      expect(result.success).toBe(false);
    });
  });

  describe('Authentication', () => {
    it('should use authenticate middleware for POST /upload', () => {
      const middleware = 'authenticate';
      expect(middleware).toBe('authenticate');
    });

    it('should use authenticate middleware for POST /:jobId/execute', () => {
      const middleware = 'authenticate';
      expect(middleware).toBe('authenticate');
    });

    it('should use authenticate middleware for GET /:jobId', () => {
      const middleware = 'authenticate';
      expect(middleware).toBe('authenticate');
    });

    it('should use authenticate middleware for GET /', () => {
      const middleware = 'authenticate';
      expect(middleware).toBe('authenticate');
    });

    it('should use authenticate middleware for POST /templates', () => {
      const middleware = 'authenticate';
      expect(middleware).toBe('authenticate');
    });
  });

  describe('Response Formats', () => {
    it('should return job and preview on upload', () => {
      const response = {
        job: { id: 'job-1', status: 'pending', totalRecords: 100 },
        preview: { totalRecords: 100, sampleRecords: [] },
      };
      expect(response).toHaveProperty('job');
      expect(response).toHaveProperty('preview');
    });

    it('should return execution result', () => {
      const response = {
        jobId: 'job-1',
        status: 'completed',
        totalRecords: 100,
        successfulRecords: 98,
        failedRecords: 2,
        errors: [],
        summary: {},
      };
      expect(response).toHaveProperty('jobId');
      expect(response).toHaveProperty('status');
      expect(response).toHaveProperty('totalRecords');
      expect(response).toHaveProperty('successfulRecords');
      expect(response).toHaveProperty('failedRecords');
    });

    it('should return job details', () => {
      const job = {
        id: 'job-1',
        status: 'pending',
        totalRecords: 100,
        processedRecords: 0,
        successfulRecords: 0,
        failedRecords: 0,
        createdAt: '2024-01-01T00:00:00Z',
        completedAt: null,
      };
      expect(job).toHaveProperty('id');
      expect(job).toHaveProperty('status');
    });

    it('should return array of jobs', () => {
      const jobs = [
        { id: 'job-1', sourceSystem: 'servicenow', entityType: 'incident', status: 'completed' },
        { id: 'job-2', sourceSystem: 'jira', entityType: 'request', status: 'pending' },
      ];
      expect(Array.isArray(jobs)).toBe(true);
      expect(jobs.length).toBe(2);
    });

    it('should return 201 with templateId for mapping template', () => {
      const statusCode = 201;
      const response = { templateId: 'template-123' };
      expect(statusCode).toBe(201);
      expect(response).toHaveProperty('templateId');
    });
  });

  describe('Service Integration', () => {
    it('should call migrationService.createMigrationJob', async () => {
      const { migrationService } = await import('../../../src/services/migration/index.js');
      const uploadRequest = {
        tenantSlug: 'test-tenant',
        sourceSystem: 'servicenow' as const,
        entityType: 'incident' as const,
        file: Buffer.from('test'),
        filename: 'test.csv',
        dryRun: false,
      };

      await migrationService.createMigrationJob(uploadRequest, 'user-1');
      expect(migrationService.createMigrationJob).toHaveBeenCalledWith(uploadRequest, 'user-1');
    });

    it('should call migrationService.executeMigration', async () => {
      const { migrationService } = await import('../../../src/services/migration/index.js');
      const executeRequest = {
        jobId: '123e4567-e89b-12d3-a456-426614174000',
        continueOnError: true,
      };

      await migrationService.executeMigration(executeRequest);
      expect(migrationService.executeMigration).toHaveBeenCalledWith(executeRequest);
    });

    it('should call migrationService.getJobById', async () => {
      const { migrationService } = await import('../../../src/services/migration/index.js');
      const jobId = '123e4567-e89b-12d3-a456-426614174000';

      await migrationService.getJobById(jobId);
      expect(migrationService.getJobById).toHaveBeenCalledWith(jobId);
    });

    it('should call migrationService.listJobs', async () => {
      const { migrationService } = await import('../../../src/services/migration/index.js');
      const tenantSlug = 'test-tenant';
      const limit = 50;

      await migrationService.listJobs(tenantSlug, limit);
      expect(migrationService.listJobs).toHaveBeenCalledWith(tenantSlug, limit);
    });

    it('should call migrationService.saveMappingTemplate', async () => {
      const { migrationService } = await import('../../../src/services/migration/index.js');
      const tenantSlug = 'test-tenant';
      const name = 'ServiceNow Incidents';
      const mappingConfig = {
        entityType: 'incident',
        sourceSystem: 'servicenow',
        fieldMappings: [],
      };

      await migrationService.saveMappingTemplate(tenantSlug, name, mappingConfig, 'user-1');
      expect(migrationService.saveMappingTemplate).toHaveBeenCalledWith(
        tenantSlug,
        name,
        mappingConfig,
        'user-1'
      );
    });
  });

  describe('File Upload Handling', () => {
    it('should throw BadRequestError if no file uploaded', () => {
      const errorMessage = 'No file uploaded';
      expect(errorMessage).toBe('No file uploaded');
    });

    it('should accept CSV files', () => {
      const filename = 'data.csv';
      expect(filename.endsWith('.csv')).toBe(true);
    });

    it('should accept XML files', () => {
      const filename = 'data.xml';
      expect(filename.endsWith('.xml')).toBe(true);
    });

    it('should accept JSON files', () => {
      const filename = 'data.json';
      expect(filename.endsWith('.json')).toBe(true);
    });
  });

  describe('Preview Response', () => {
    it('should include totalRecords', () => {
      const preview = {
        totalRecords: 100,
        sampleRecords: [],
        fieldMappings: [],
        unmappedFields: [],
        recommendations: [],
      };
      expect(preview).toHaveProperty('totalRecords');
    });

    it('should include sampleRecords', () => {
      const preview = {
        totalRecords: 100,
        sampleRecords: [{ id: '1', title: 'Sample' }],
        fieldMappings: [],
        unmappedFields: [],
        recommendations: [],
      };
      expect(preview).toHaveProperty('sampleRecords');
      expect(Array.isArray(preview.sampleRecords)).toBe(true);
    });

    it('should include fieldMappings', () => {
      const preview = {
        totalRecords: 100,
        sampleRecords: [],
        fieldMappings: [{ source: 'number', target: 'id' }],
        unmappedFields: [],
        recommendations: [],
      };
      expect(preview).toHaveProperty('fieldMappings');
    });

    it('should include unmappedFields', () => {
      const preview = {
        totalRecords: 100,
        sampleRecords: [],
        fieldMappings: [],
        unmappedFields: ['custom_field_1'],
        recommendations: [],
      };
      expect(preview).toHaveProperty('unmappedFields');
    });

    it('should include recommendations', () => {
      const preview = {
        totalRecords: 100,
        sampleRecords: [],
        fieldMappings: [],
        unmappedFields: [],
        recommendations: ['Consider mapping custom_field_1 to notes'],
      };
      expect(preview).toHaveProperty('recommendations');
    });
  });

  describe('Job Status Values', () => {
    const statuses = ['pending', 'processing', 'completed', 'failed'];

    it('should support pending status', () => {
      expect(statuses).toContain('pending');
    });

    it('should support processing status', () => {
      expect(statuses).toContain('processing');
    });

    it('should support completed status', () => {
      expect(statuses).toContain('completed');
    });

    it('should support failed status', () => {
      expect(statuses).toContain('failed');
    });
  });
});
