import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import { createTestApp, generateTestToken, createAuthHeader, testUser, testTenant } from '../helpers.js';

// Mock data stores
interface MockMigrationJob {
  id: string;
  tenantSlug: string;
  sourceSystem: string;
  entityType: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  totalRecords: number;
  processedRecords: number;
  successfulRecords: number;
  failedRecords: number;
  filename: string;
  fileSize: number;
  mappingTemplateId?: string;
  dryRun: boolean;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  createdBy: string;
  errors: Array<{ row: number; field: string; error: string }>;
}

interface MockMappingTemplate {
  id: string;
  tenantSlug: string;
  name: string;
  sourceSystem: string;
  entityType: string;
  fieldMappings: Array<{ source: string; target: string; transform?: string }>;
  userMappings?: Array<{ source: string; target: string }>;
  statusMappings?: Array<{ source: string; target: string }>;
  priorityMappings?: Array<{ source: string; target: string }>;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const migrationJobs: MockMigrationJob[] = [];
const mappingTemplates: MockMappingTemplate[] = [];

function resetMockData() {
  migrationJobs.length = 0;
  mappingTemplates.length = 0;
}

describe('Migration Routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp();

    // Upload and create migration job
    app.post('/v1/migration/upload', async (request, reply) => {
      const body = request.body as {
        tenantSlug: string;
        sourceSystem: string;
        entityType: string;
        mappingTemplateId?: string;
        dryRun?: boolean;
        filename?: string;
        fileContent?: string;
      };

      if (!body.tenantSlug) {
        return reply.status(400).send({ error: 'tenantSlug is required' });
      }

      if (!body.sourceSystem) {
        return reply.status(400).send({ error: 'sourceSystem is required' });
      }

      if (!body.entityType) {
        return reply.status(400).send({ error: 'entityType is required' });
      }

      const validSourceSystems = ['servicenow', 'bmc_remedy', 'jira', 'generic_csv'];
      if (!validSourceSystems.includes(body.sourceSystem)) {
        return reply.status(400).send({ error: `Invalid source system. Must be one of: ${validSourceSystems.join(', ')}` });
      }

      const validEntityTypes = ['incident', 'request', 'change', 'user', 'group', 'application', 'problem'];
      if (!validEntityTypes.includes(body.entityType)) {
        return reply.status(400).send({ error: `Invalid entity type. Must be one of: ${validEntityTypes.join(', ')}` });
      }

      if (!body.filename) {
        return reply.status(400).send({ error: 'No file uploaded' });
      }

      // Simulate parsing the file
      const sampleRecords = [
        { number: 'INC001', short_description: 'Test incident 1', priority: '3', state: 'New' },
        { number: 'INC002', short_description: 'Test incident 2', priority: '2', state: 'In Progress' },
        { number: 'INC003', short_description: 'Test incident 3', priority: '1', state: 'Resolved' },
      ];

      const job: MockMigrationJob = {
        id: `mig-${Date.now()}`,
        tenantSlug: body.tenantSlug,
        sourceSystem: body.sourceSystem,
        entityType: body.entityType,
        status: 'pending',
        totalRecords: sampleRecords.length,
        processedRecords: 0,
        successfulRecords: 0,
        failedRecords: 0,
        filename: body.filename,
        fileSize: body.fileContent?.length || 1024,
        mappingTemplateId: body.mappingTemplateId,
        dryRun: body.dryRun || false,
        createdAt: new Date(),
        createdBy: testUser.userId,
        errors: [],
      };

      migrationJobs.push(job);

      // Generate preview
      const preview = {
        totalRecords: sampleRecords.length,
        sampleRecords: sampleRecords.slice(0, 5),
        fieldMappings: [
          { source: 'number', target: 'number', confidence: 100 },
          { source: 'short_description', target: 'title', confidence: 95 },
          { source: 'priority', target: 'priority', confidence: 90 },
          { source: 'state', target: 'status', confidence: 85 },
        ],
        unmappedFields: ['assignment_group', 'contact_type'],
        recommendations: [
          { field: 'assignment_group', suggestion: 'Map to assignee_group for team assignment' },
        ],
      };

      reply.send({
        job: {
          id: job.id,
          status: job.status,
          totalRecords: job.totalRecords,
          createdAt: job.createdAt.toISOString(),
        },
        preview,
      });
    });

    // Execute migration job
    app.post<{ Params: { jobId: string } }>('/v1/migration/:jobId/execute', async (request, reply) => {
      const { jobId } = request.params;
      const body = request.body as {
        mappingConfig?: Record<string, unknown>;
        continueOnError?: boolean;
        batchSize?: number;
      };

      // Validate ID format - accept UUIDs and test IDs
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const testIdRegex = /^mig-[\w-]+$/;
      if (!uuidRegex.test(jobId) && !testIdRegex.test(jobId)) {
        return reply.status(400).send({ error: 'Invalid job ID format' });
      }

      const job = migrationJobs.find(j => j.id === jobId);
      if (!job) {
        return reply.status(404).send({ statusCode: 404, message: 'Migration job not found' });
      }

      if (job.status !== 'pending') {
        return reply.status(400).send({ error: `Cannot execute job in status: ${job.status}` });
      }

      // Simulate execution
      job.status = 'completed';
      job.startedAt = new Date();
      job.completedAt = new Date();
      job.processedRecords = job.totalRecords;

      if (body.continueOnError) {
        // Simulate some failures
        job.successfulRecords = job.totalRecords - 1;
        job.failedRecords = 1;
        job.errors = [{ row: 2, field: 'priority', error: 'Invalid priority value' }];
      } else {
        job.successfulRecords = job.totalRecords;
        job.failedRecords = 0;
      }

      reply.send({
        jobId: job.id,
        status: job.status,
        totalRecords: job.totalRecords,
        successfulRecords: job.successfulRecords,
        failedRecords: job.failedRecords,
        errors: job.errors,
        summary: {
          duration: 1500,
          recordsPerSecond: job.totalRecords / 1.5,
          batchesProcessed: Math.ceil(job.totalRecords / (body.batchSize || 100)),
        },
      });
    });

    // Get migration job status
    app.get<{ Params: { jobId: string } }>('/v1/migration/:jobId', async (request, reply) => {
      const { jobId } = request.params;

      // Validate ID format - accept UUIDs and test IDs
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const testIdRegex = /^mig-[\w-]+$/;
      if (!uuidRegex.test(jobId) && !testIdRegex.test(jobId)) {
        return reply.status(400).send({ error: 'Invalid job ID format' });
      }

      const job = migrationJobs.find(j => j.id === jobId);
      if (!job) {
        return reply.status(404).send({ statusCode: 404, message: 'Migration job not found' });
      }

      reply.send({
        id: job.id,
        tenantSlug: job.tenantSlug,
        sourceSystem: job.sourceSystem,
        entityType: job.entityType,
        status: job.status,
        totalRecords: job.totalRecords,
        processedRecords: job.processedRecords,
        successfulRecords: job.successfulRecords,
        failedRecords: job.failedRecords,
        filename: job.filename,
        dryRun: job.dryRun,
        createdAt: job.createdAt.toISOString(),
        startedAt: job.startedAt?.toISOString(),
        completedAt: job.completedAt?.toISOString(),
        errors: job.errors,
      });
    });

    // List migration jobs
    app.get('/v1/migration', async (request, reply) => {
      const query = request.query as { tenantSlug?: string; limit?: string };

      if (!query.tenantSlug) {
        return reply.status(400).send({ error: 'tenantSlug query parameter is required' });
      }

      const limit = query.limit ? parseInt(query.limit, 10) : 50;
      if (isNaN(limit) || limit < 1 || limit > 100) {
        return reply.status(400).send({ error: 'limit must be between 1 and 100' });
      }

      const tenantJobs = migrationJobs
        .filter(j => j.tenantSlug === query.tenantSlug)
        .slice(0, limit)
        .map(j => ({
          id: j.id,
          sourceSystem: j.sourceSystem,
          entityType: j.entityType,
          status: j.status,
          totalRecords: j.totalRecords,
          createdAt: j.createdAt.toISOString(),
        }));

      reply.send(tenantJobs);
    });

    // Save mapping template
    app.post('/v1/migration/templates', async (request, reply) => {
      const body = request.body as {
        tenantSlug: string;
        name: string;
        sourceSystem: string;
        entityType: string;
        fieldMappings: Array<{ source: string; target: string; transform?: string }>;
        userMappings?: Array<{ source: string; target: string }>;
        statusMappings?: Array<{ source: string; target: string }>;
        priorityMappings?: Array<{ source: string; target: string }>;
      };

      if (!body.tenantSlug) {
        return reply.status(400).send({ error: 'tenantSlug is required' });
      }

      if (!body.name) {
        return reply.status(400).send({ error: 'name is required' });
      }

      if (!body.sourceSystem) {
        return reply.status(400).send({ error: 'sourceSystem is required' });
      }

      if (!body.entityType) {
        return reply.status(400).send({ error: 'entityType is required' });
      }

      if (!body.fieldMappings || body.fieldMappings.length === 0) {
        return reply.status(400).send({ error: 'fieldMappings is required and cannot be empty' });
      }

      // Check for duplicate name
      const existingTemplate = mappingTemplates.find(
        t => t.tenantSlug === body.tenantSlug && t.name === body.name
      );
      if (existingTemplate) {
        return reply.status(409).send({ error: 'Template with this name already exists' });
      }

      const template: MockMappingTemplate = {
        id: `tpl-${Date.now()}`,
        tenantSlug: body.tenantSlug,
        name: body.name,
        sourceSystem: body.sourceSystem,
        entityType: body.entityType,
        fieldMappings: body.fieldMappings,
        userMappings: body.userMappings,
        statusMappings: body.statusMappings,
        priorityMappings: body.priorityMappings,
        createdBy: testUser.userId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mappingTemplates.push(template);

      reply.status(201).send({ templateId: template.id });
    });

    // List mapping templates
    app.get('/v1/migration/templates', async (request, reply) => {
      const query = request.query as { tenantSlug?: string; sourceSystem?: string; entityType?: string };

      if (!query.tenantSlug) {
        return reply.status(400).send({ error: 'tenantSlug query parameter is required' });
      }

      let templates = mappingTemplates.filter(t => t.tenantSlug === query.tenantSlug);

      if (query.sourceSystem) {
        templates = templates.filter(t => t.sourceSystem === query.sourceSystem);
      }

      if (query.entityType) {
        templates = templates.filter(t => t.entityType === query.entityType);
      }

      reply.send(templates.map(t => ({
        id: t.id,
        name: t.name,
        sourceSystem: t.sourceSystem,
        entityType: t.entityType,
        createdAt: t.createdAt.toISOString(),
      })));
    });

    // Get single mapping template
    app.get<{ Params: { templateId: string } }>('/v1/migration/templates/:templateId', async (request, reply) => {
      const { templateId } = request.params;

      const template = mappingTemplates.find(t => t.id === templateId);
      if (!template) {
        return reply.status(404).send({ statusCode: 404, message: 'Template not found' });
      }

      reply.send(template);
    });

    // Delete mapping template
    app.delete<{ Params: { templateId: string } }>('/v1/migration/templates/:templateId', async (request, reply) => {
      const { templateId } = request.params;

      const index = mappingTemplates.findIndex(t => t.id === templateId);
      if (index === -1) {
        return reply.status(404).send({ statusCode: 404, message: 'Template not found' });
      }

      mappingTemplates.splice(index, 1);
      reply.send({ success: true });
    });

    // Rollback migration job
    app.post<{ Params: { jobId: string } }>('/v1/migration/:jobId/rollback', async (request, reply) => {
      const { jobId } = request.params;

      const job = migrationJobs.find(j => j.id === jobId);
      if (!job) {
        return reply.status(404).send({ statusCode: 404, message: 'Migration job not found' });
      }

      if (job.status !== 'completed') {
        return reply.status(400).send({ error: 'Can only rollback completed migrations' });
      }

      // Simulate rollback
      const rollbackResult = {
        jobId: job.id,
        rolledBackRecords: job.successfulRecords,
        status: 'rolled_back',
        completedAt: new Date().toISOString(),
      };

      job.status = 'failed'; // Mark as failed after rollback

      reply.send(rollbackResult);
    });

    // Get migration job errors
    app.get<{ Params: { jobId: string } }>('/v1/migration/:jobId/errors', async (request, reply) => {
      const { jobId } = request.params;

      const job = migrationJobs.find(j => j.id === jobId);
      if (!job) {
        return reply.status(404).send({ statusCode: 404, message: 'Migration job not found' });
      }

      const query = request.query as { page?: string; limit?: string };
      const page = parseInt(query.page || '1', 10);
      const limit = parseInt(query.limit || '50', 10);

      const startIndex = (page - 1) * limit;
      const paginatedErrors = job.errors.slice(startIndex, startIndex + limit);

      reply.send({
        errors: paginatedErrors,
        total: job.errors.length,
        page,
        limit,
        totalPages: Math.ceil(job.errors.length / limit),
      });
    });

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    resetMockData();
  });

  // ============================================
  // UPLOAD MIGRATION JOB TESTS
  // ============================================

  describe('POST /v1/migration/upload', () => {
    it('should create migration job with file upload', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'POST',
        url: '/v1/migration/upload',
        headers: createAuthHeader(token),
        payload: {
          tenantSlug: testTenant.slug,
          sourceSystem: 'servicenow',
          entityType: 'incident',
          filename: 'incidents.csv',
          fileContent: 'number,short_description,priority\nINC001,Test,3',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.job).toBeDefined();
      expect(body.job.id).toBeDefined();
      expect(body.job.status).toBe('pending');
      expect(body.job.totalRecords).toBeGreaterThan(0);
      expect(body.preview).toBeDefined();
      expect(body.preview.sampleRecords).toHaveLength(3);
      expect(body.preview.fieldMappings.length).toBeGreaterThan(0);
    });

    it('should include field mapping suggestions in preview', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'POST',
        url: '/v1/migration/upload',
        headers: createAuthHeader(token),
        payload: {
          tenantSlug: testTenant.slug,
          sourceSystem: 'servicenow',
          entityType: 'incident',
          filename: 'incidents.csv',
          fileContent: 'data',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.preview.fieldMappings).toBeDefined();
      expect(body.preview.unmappedFields).toBeDefined();
      expect(body.preview.recommendations).toBeDefined();
    });

    it('should support dry run mode', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'POST',
        url: '/v1/migration/upload',
        headers: createAuthHeader(token),
        payload: {
          tenantSlug: testTenant.slug,
          sourceSystem: 'generic_csv',
          entityType: 'request',
          filename: 'requests.csv',
          fileContent: 'data',
          dryRun: true,
        },
      });

      expect(response.statusCode).toBe(200);
      const job = migrationJobs[0];
      expect(job.dryRun).toBe(true);
    });

    it('should accept mapping template ID', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'POST',
        url: '/v1/migration/upload',
        headers: createAuthHeader(token),
        payload: {
          tenantSlug: testTenant.slug,
          sourceSystem: 'jira',
          entityType: 'incident',
          filename: 'jira-export.json',
          fileContent: '{}',
          mappingTemplateId: 'tpl-123',
        },
      });

      expect(response.statusCode).toBe(200);
      const job = migrationJobs[0];
      expect(job.mappingTemplateId).toBe('tpl-123');
    });

    it('should reject missing tenantSlug', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'POST',
        url: '/v1/migration/upload',
        headers: createAuthHeader(token),
        payload: {
          sourceSystem: 'servicenow',
          entityType: 'incident',
          filename: 'file.csv',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('tenantSlug');
    });

    it('should reject missing sourceSystem', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'POST',
        url: '/v1/migration/upload',
        headers: createAuthHeader(token),
        payload: {
          tenantSlug: testTenant.slug,
          entityType: 'incident',
          filename: 'file.csv',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('sourceSystem');
    });

    it('should reject missing entityType', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'POST',
        url: '/v1/migration/upload',
        headers: createAuthHeader(token),
        payload: {
          tenantSlug: testTenant.slug,
          sourceSystem: 'servicenow',
          filename: 'file.csv',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('entityType');
    });

    it('should reject invalid sourceSystem', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'POST',
        url: '/v1/migration/upload',
        headers: createAuthHeader(token),
        payload: {
          tenantSlug: testTenant.slug,
          sourceSystem: 'invalid_system',
          entityType: 'incident',
          filename: 'file.csv',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('Invalid source system');
    });

    it('should reject invalid entityType', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'POST',
        url: '/v1/migration/upload',
        headers: createAuthHeader(token),
        payload: {
          tenantSlug: testTenant.slug,
          sourceSystem: 'servicenow',
          entityType: 'invalid_entity',
          filename: 'file.csv',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('Invalid entity type');
    });

    it('should reject missing file', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'POST',
        url: '/v1/migration/upload',
        headers: createAuthHeader(token),
        payload: {
          tenantSlug: testTenant.slug,
          sourceSystem: 'servicenow',
          entityType: 'incident',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('No file');
    });

    it('should support all valid source systems', async () => {
      const token = generateTestToken(app);
      const sourceSystems = ['servicenow', 'bmc_remedy', 'jira', 'generic_csv'];

      for (const sourceSystem of sourceSystems) {
        const response = await app.inject({
          method: 'POST',
          url: '/v1/migration/upload',
          headers: createAuthHeader(token),
          payload: {
            tenantSlug: testTenant.slug,
            sourceSystem,
            entityType: 'incident',
            filename: `${sourceSystem}-export.csv`,
            fileContent: 'data',
          },
        });

        expect(response.statusCode).toBe(200);
      }
    });

    it('should support all valid entity types', async () => {
      const token = generateTestToken(app);
      const entityTypes = ['incident', 'request', 'change', 'user', 'group', 'application', 'problem'];

      for (const entityType of entityTypes) {
        const response = await app.inject({
          method: 'POST',
          url: '/v1/migration/upload',
          headers: createAuthHeader(token),
          payload: {
            tenantSlug: testTenant.slug,
            sourceSystem: 'generic_csv',
            entityType,
            filename: `${entityType}s.csv`,
            fileContent: 'data',
          },
        });

        expect(response.statusCode).toBe(200);
      }
    });
  });

  // ============================================
  // EXECUTE MIGRATION JOB TESTS
  // ============================================

  describe('POST /v1/migration/:jobId/execute', () => {
    it('should execute pending migration job', async () => {
      // Create a job first
      migrationJobs.push({
        id: 'mig-exec-1',
        tenantSlug: testTenant.slug,
        sourceSystem: 'servicenow',
        entityType: 'incident',
        status: 'pending',
        totalRecords: 100,
        processedRecords: 0,
        successfulRecords: 0,
        failedRecords: 0,
        filename: 'incidents.csv',
        fileSize: 5000,
        dryRun: false,
        createdAt: new Date(),
        createdBy: testUser.userId,
        errors: [],
      });

      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'POST',
        url: '/v1/migration/mig-exec-1/execute',
        headers: createAuthHeader(token),
        payload: {},
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.jobId).toBe('mig-exec-1');
      expect(body.status).toBe('completed');
      expect(body.totalRecords).toBe(100);
      expect(body.successfulRecords).toBe(100);
      expect(body.failedRecords).toBe(0);
      expect(body.summary).toBeDefined();
    });

    it('should support custom batch size', async () => {
      migrationJobs.push({
        id: 'mig-batch-1',
        tenantSlug: testTenant.slug,
        sourceSystem: 'servicenow',
        entityType: 'incident',
        status: 'pending',
        totalRecords: 500,
        processedRecords: 0,
        successfulRecords: 0,
        failedRecords: 0,
        filename: 'incidents.csv',
        fileSize: 25000,
        dryRun: false,
        createdAt: new Date(),
        createdBy: testUser.userId,
        errors: [],
      });

      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'POST',
        url: '/v1/migration/mig-batch-1/execute',
        headers: createAuthHeader(token),
        payload: {
          batchSize: 50,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.summary.batchesProcessed).toBe(10); // 500 / 50
    });

    it('should continue on error when flag is set', async () => {
      migrationJobs.push({
        id: 'mig-continue-1',
        tenantSlug: testTenant.slug,
        sourceSystem: 'servicenow',
        entityType: 'incident',
        status: 'pending',
        totalRecords: 10,
        processedRecords: 0,
        successfulRecords: 0,
        failedRecords: 0,
        filename: 'incidents.csv',
        fileSize: 500,
        dryRun: false,
        createdAt: new Date(),
        createdBy: testUser.userId,
        errors: [],
      });

      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'POST',
        url: '/v1/migration/mig-continue-1/execute',
        headers: createAuthHeader(token),
        payload: {
          continueOnError: true,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.failedRecords).toBeGreaterThan(0);
      expect(body.errors.length).toBeGreaterThan(0);
    });

    it('should return 404 for non-existent job', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'POST',
        url: '/v1/migration/mig-nonexistent/execute',
        headers: createAuthHeader(token),
        payload: {},
      });

      expect(response.statusCode).toBe(404);
    });

    it('should reject execution of non-pending job', async () => {
      migrationJobs.push({
        id: 'mig-completed-1',
        tenantSlug: testTenant.slug,
        sourceSystem: 'servicenow',
        entityType: 'incident',
        status: 'completed',
        totalRecords: 100,
        processedRecords: 100,
        successfulRecords: 100,
        failedRecords: 0,
        filename: 'incidents.csv',
        fileSize: 5000,
        dryRun: false,
        createdAt: new Date(),
        createdBy: testUser.userId,
        errors: [],
      });

      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'POST',
        url: '/v1/migration/mig-completed-1/execute',
        headers: createAuthHeader(token),
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('Cannot execute');
    });

    it('should accept custom mapping config', async () => {
      migrationJobs.push({
        id: 'mig-mapping-1',
        tenantSlug: testTenant.slug,
        sourceSystem: 'generic_csv',
        entityType: 'incident',
        status: 'pending',
        totalRecords: 50,
        processedRecords: 0,
        successfulRecords: 0,
        failedRecords: 0,
        filename: 'custom.csv',
        fileSize: 2500,
        dryRun: false,
        createdAt: new Date(),
        createdBy: testUser.userId,
        errors: [],
      });

      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'POST',
        url: '/v1/migration/mig-mapping-1/execute',
        headers: createAuthHeader(token),
        payload: {
          mappingConfig: {
            fieldMappings: [
              { source: 'custom_field', target: 'description' },
            ],
          },
        },
      });

      expect(response.statusCode).toBe(200);
    });
  });

  // ============================================
  // GET MIGRATION JOB STATUS TESTS
  // ============================================

  describe('GET /v1/migration/:jobId', () => {
    it('should return job details', async () => {
      const createdAt = new Date();
      migrationJobs.push({
        id: 'mig-get-1',
        tenantSlug: testTenant.slug,
        sourceSystem: 'servicenow',
        entityType: 'incident',
        status: 'pending',
        totalRecords: 150,
        processedRecords: 0,
        successfulRecords: 0,
        failedRecords: 0,
        filename: 'export.csv',
        fileSize: 7500,
        dryRun: false,
        createdAt,
        createdBy: testUser.userId,
        errors: [],
      });

      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/migration/mig-get-1',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.id).toBe('mig-get-1');
      expect(body.tenantSlug).toBe(testTenant.slug);
      expect(body.sourceSystem).toBe('servicenow');
      expect(body.entityType).toBe('incident');
      expect(body.status).toBe('pending');
      expect(body.totalRecords).toBe(150);
      expect(body.filename).toBe('export.csv');
    });

    it('should return completed job with execution details', async () => {
      const createdAt = new Date(Date.now() - 60000);
      const startedAt = new Date(Date.now() - 30000);
      const completedAt = new Date();

      migrationJobs.push({
        id: 'mig-get-2',
        tenantSlug: testTenant.slug,
        sourceSystem: 'jira',
        entityType: 'request',
        status: 'completed',
        totalRecords: 200,
        processedRecords: 200,
        successfulRecords: 195,
        failedRecords: 5,
        filename: 'jira-requests.json',
        fileSize: 15000,
        dryRun: false,
        createdAt,
        startedAt,
        completedAt,
        createdBy: testUser.userId,
        errors: [
          { row: 10, field: 'status', error: 'Invalid status' },
          { row: 25, field: 'priority', error: 'Missing priority' },
        ],
      });

      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/migration/mig-get-2',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('completed');
      expect(body.successfulRecords).toBe(195);
      expect(body.failedRecords).toBe(5);
      expect(body.startedAt).toBeDefined();
      expect(body.completedAt).toBeDefined();
      expect(body.errors).toHaveLength(2);
    });

    it('should return 404 for non-existent job', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/migration/mig-nonexistent',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(404);
    });
  });

  // ============================================
  // LIST MIGRATION JOBS TESTS
  // ============================================

  describe('GET /v1/migration', () => {
    it('should return empty list when no jobs exist', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: `/v1/migration?tenantSlug=${testTenant.slug}`,
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toEqual([]);
    });

    it('should return jobs for specific tenant', async () => {
      migrationJobs.push(
        {
          id: 'mig-list-1',
          tenantSlug: testTenant.slug,
          sourceSystem: 'servicenow',
          entityType: 'incident',
          status: 'pending',
          totalRecords: 100,
          processedRecords: 0,
          successfulRecords: 0,
          failedRecords: 0,
          filename: 'file1.csv',
          fileSize: 5000,
          dryRun: false,
          createdAt: new Date(),
          createdBy: testUser.userId,
          errors: [],
        },
        {
          id: 'mig-list-2',
          tenantSlug: testTenant.slug,
          sourceSystem: 'jira',
          entityType: 'request',
          status: 'completed',
          totalRecords: 50,
          processedRecords: 50,
          successfulRecords: 50,
          failedRecords: 0,
          filename: 'file2.json',
          fileSize: 2500,
          dryRun: false,
          createdAt: new Date(),
          createdBy: testUser.userId,
          errors: [],
        },
        {
          id: 'mig-list-3',
          tenantSlug: 'other-tenant',
          sourceSystem: 'generic_csv',
          entityType: 'user',
          status: 'pending',
          totalRecords: 25,
          processedRecords: 0,
          successfulRecords: 0,
          failedRecords: 0,
          filename: 'file3.csv',
          fileSize: 1250,
          dryRun: false,
          createdAt: new Date(),
          createdBy: 'other-user',
          errors: [],
        }
      );

      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: `/v1/migration?tenantSlug=${testTenant.slug}`,
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveLength(2);
      expect(body.every((j: { id: string }) => j.id !== 'mig-list-3')).toBe(true);
    });

    it('should respect limit parameter', async () => {
      for (let i = 1; i <= 10; i++) {
        migrationJobs.push({
          id: `mig-limit-${i}`,
          tenantSlug: testTenant.slug,
          sourceSystem: 'servicenow',
          entityType: 'incident',
          status: 'pending',
          totalRecords: i * 10,
          processedRecords: 0,
          successfulRecords: 0,
          failedRecords: 0,
          filename: `file${i}.csv`,
          fileSize: i * 500,
          dryRun: false,
          createdAt: new Date(),
          createdBy: testUser.userId,
          errors: [],
        });
      }

      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: `/v1/migration?tenantSlug=${testTenant.slug}&limit=5`,
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveLength(5);
    });

    it('should reject missing tenantSlug', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/migration',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('tenantSlug');
    });

    it('should reject invalid limit', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: `/v1/migration?tenantSlug=${testTenant.slug}&limit=200`,
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('limit');
    });
  });

  // ============================================
  // MAPPING TEMPLATE TESTS
  // ============================================

  describe('POST /v1/migration/templates', () => {
    it('should create mapping template', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'POST',
        url: '/v1/migration/templates',
        headers: createAuthHeader(token),
        payload: {
          tenantSlug: testTenant.slug,
          name: 'ServiceNow Incident Template',
          sourceSystem: 'servicenow',
          entityType: 'incident',
          fieldMappings: [
            { source: 'number', target: 'number' },
            { source: 'short_description', target: 'title' },
            { source: 'description', target: 'description' },
            { source: 'priority', target: 'priority', transform: 'priorityMap' },
          ],
          statusMappings: [
            { source: 'New', target: 'new' },
            { source: 'In Progress', target: 'in_progress' },
            { source: 'Resolved', target: 'resolved' },
          ],
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.templateId).toBeDefined();
    });

    it('should include user and priority mappings', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'POST',
        url: '/v1/migration/templates',
        headers: createAuthHeader(token),
        payload: {
          tenantSlug: testTenant.slug,
          name: 'Full Mapping Template',
          sourceSystem: 'servicenow',
          entityType: 'incident',
          fieldMappings: [
            { source: 'number', target: 'number' },
          ],
          userMappings: [
            { source: 'john.doe@old.com', target: 'john.doe@new.com' },
          ],
          priorityMappings: [
            { source: '1 - Critical', target: '1' },
            { source: '2 - High', target: '2' },
          ],
        },
      });

      expect(response.statusCode).toBe(201);
      const template = mappingTemplates[0];
      expect(template.userMappings).toHaveLength(1);
      expect(template.priorityMappings).toHaveLength(2);
    });

    it('should reject missing required fields', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'POST',
        url: '/v1/migration/templates',
        headers: createAuthHeader(token),
        payload: {
          tenantSlug: testTenant.slug,
          name: 'Incomplete Template',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should reject empty fieldMappings', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'POST',
        url: '/v1/migration/templates',
        headers: createAuthHeader(token),
        payload: {
          tenantSlug: testTenant.slug,
          name: 'Empty Mappings Template',
          sourceSystem: 'servicenow',
          entityType: 'incident',
          fieldMappings: [],
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('fieldMappings');
    });

    it('should reject duplicate template name for same tenant', async () => {
      mappingTemplates.push({
        id: 'tpl-existing',
        tenantSlug: testTenant.slug,
        name: 'Existing Template',
        sourceSystem: 'servicenow',
        entityType: 'incident',
        fieldMappings: [{ source: 'number', target: 'number' }],
        createdBy: testUser.userId,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'POST',
        url: '/v1/migration/templates',
        headers: createAuthHeader(token),
        payload: {
          tenantSlug: testTenant.slug,
          name: 'Existing Template',
          sourceSystem: 'servicenow',
          entityType: 'incident',
          fieldMappings: [{ source: 'number', target: 'number' }],
        },
      });

      expect(response.statusCode).toBe(409);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('already exists');
    });
  });

  describe('GET /v1/migration/templates', () => {
    it('should return templates for tenant', async () => {
      mappingTemplates.push(
        {
          id: 'tpl-1',
          tenantSlug: testTenant.slug,
          name: 'Template 1',
          sourceSystem: 'servicenow',
          entityType: 'incident',
          fieldMappings: [{ source: 'number', target: 'number' }],
          createdBy: testUser.userId,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'tpl-2',
          tenantSlug: testTenant.slug,
          name: 'Template 2',
          sourceSystem: 'jira',
          entityType: 'request',
          fieldMappings: [{ source: 'key', target: 'number' }],
          createdBy: testUser.userId,
          createdAt: new Date(),
          updatedAt: new Date(),
        }
      );

      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: `/v1/migration/templates?tenantSlug=${testTenant.slug}`,
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveLength(2);
    });

    it('should filter by sourceSystem', async () => {
      mappingTemplates.push(
        {
          id: 'tpl-sn-1',
          tenantSlug: testTenant.slug,
          name: 'ServiceNow Template',
          sourceSystem: 'servicenow',
          entityType: 'incident',
          fieldMappings: [{ source: 'number', target: 'number' }],
          createdBy: testUser.userId,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'tpl-jira-1',
          tenantSlug: testTenant.slug,
          name: 'Jira Template',
          sourceSystem: 'jira',
          entityType: 'incident',
          fieldMappings: [{ source: 'key', target: 'number' }],
          createdBy: testUser.userId,
          createdAt: new Date(),
          updatedAt: new Date(),
        }
      );

      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: `/v1/migration/templates?tenantSlug=${testTenant.slug}&sourceSystem=servicenow`,
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveLength(1);
      expect(body[0].sourceSystem).toBe('servicenow');
    });

    it('should filter by entityType', async () => {
      mappingTemplates.push(
        {
          id: 'tpl-inc',
          tenantSlug: testTenant.slug,
          name: 'Incident Template',
          sourceSystem: 'servicenow',
          entityType: 'incident',
          fieldMappings: [{ source: 'number', target: 'number' }],
          createdBy: testUser.userId,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'tpl-req',
          tenantSlug: testTenant.slug,
          name: 'Request Template',
          sourceSystem: 'servicenow',
          entityType: 'request',
          fieldMappings: [{ source: 'number', target: 'number' }],
          createdBy: testUser.userId,
          createdAt: new Date(),
          updatedAt: new Date(),
        }
      );

      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: `/v1/migration/templates?tenantSlug=${testTenant.slug}&entityType=request`,
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveLength(1);
      expect(body[0].entityType).toBe('request');
    });

    it('should reject missing tenantSlug', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/migration/templates',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /v1/migration/templates/:templateId', () => {
    it('should return template details', async () => {
      mappingTemplates.push({
        id: 'tpl-detail',
        tenantSlug: testTenant.slug,
        name: 'Detail Template',
        sourceSystem: 'servicenow',
        entityType: 'incident',
        fieldMappings: [
          { source: 'number', target: 'number' },
          { source: 'short_description', target: 'title' },
        ],
        statusMappings: [
          { source: 'New', target: 'new' },
        ],
        createdBy: testUser.userId,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/migration/templates/tpl-detail',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.id).toBe('tpl-detail');
      expect(body.name).toBe('Detail Template');
      expect(body.fieldMappings).toHaveLength(2);
      expect(body.statusMappings).toHaveLength(1);
    });

    it('should return 404 for non-existent template', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/migration/templates/tpl-nonexistent',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('DELETE /v1/migration/templates/:templateId', () => {
    it('should delete template', async () => {
      mappingTemplates.push({
        id: 'tpl-delete',
        tenantSlug: testTenant.slug,
        name: 'Delete Me',
        sourceSystem: 'servicenow',
        entityType: 'incident',
        fieldMappings: [{ source: 'number', target: 'number' }],
        createdBy: testUser.userId,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'DELETE',
        url: '/v1/migration/templates/tpl-delete',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(mappingTemplates.find(t => t.id === 'tpl-delete')).toBeUndefined();
    });

    it('should return 404 for non-existent template', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'DELETE',
        url: '/v1/migration/templates/tpl-nonexistent',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(404);
    });
  });

  // ============================================
  // ROLLBACK MIGRATION TESTS
  // ============================================

  describe('POST /v1/migration/:jobId/rollback', () => {
    it('should rollback completed migration', async () => {
      migrationJobs.push({
        id: 'mig-rollback-1',
        tenantSlug: testTenant.slug,
        sourceSystem: 'servicenow',
        entityType: 'incident',
        status: 'completed',
        totalRecords: 100,
        processedRecords: 100,
        successfulRecords: 95,
        failedRecords: 5,
        filename: 'incidents.csv',
        fileSize: 5000,
        dryRun: false,
        createdAt: new Date(),
        completedAt: new Date(),
        createdBy: testUser.userId,
        errors: [],
      });

      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'POST',
        url: '/v1/migration/mig-rollback-1/rollback',
        headers: createAuthHeader(token),
        payload: {},
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.jobId).toBe('mig-rollback-1');
      expect(body.rolledBackRecords).toBe(95);
      expect(body.status).toBe('rolled_back');
    });

    it('should reject rollback of pending job', async () => {
      migrationJobs.push({
        id: 'mig-rollback-pending',
        tenantSlug: testTenant.slug,
        sourceSystem: 'servicenow',
        entityType: 'incident',
        status: 'pending',
        totalRecords: 100,
        processedRecords: 0,
        successfulRecords: 0,
        failedRecords: 0,
        filename: 'incidents.csv',
        fileSize: 5000,
        dryRun: false,
        createdAt: new Date(),
        createdBy: testUser.userId,
        errors: [],
      });

      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'POST',
        url: '/v1/migration/mig-rollback-pending/rollback',
        headers: createAuthHeader(token),
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('rollback completed');
    });

    it('should return 404 for non-existent job', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'POST',
        url: '/v1/migration/mig-nonexistent/rollback',
        headers: createAuthHeader(token),
        payload: {},
      });

      expect(response.statusCode).toBe(404);
    });
  });

  // ============================================
  // JOB ERRORS TESTS
  // ============================================

  describe('GET /v1/migration/:jobId/errors', () => {
    it('should return paginated errors', async () => {
      const errors: Array<{ row: number; field: string; error: string }> = [];
      for (let i = 1; i <= 25; i++) {
        errors.push({ row: i, field: 'priority', error: `Invalid value at row ${i}` });
      }

      migrationJobs.push({
        id: 'mig-errors-1',
        tenantSlug: testTenant.slug,
        sourceSystem: 'servicenow',
        entityType: 'incident',
        status: 'completed',
        totalRecords: 100,
        processedRecords: 100,
        successfulRecords: 75,
        failedRecords: 25,
        filename: 'incidents.csv',
        fileSize: 5000,
        dryRun: false,
        createdAt: new Date(),
        completedAt: new Date(),
        createdBy: testUser.userId,
        errors,
      });

      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/migration/mig-errors-1/errors?page=1&limit=10',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.errors).toHaveLength(10);
      expect(body.total).toBe(25);
      expect(body.page).toBe(1);
      expect(body.totalPages).toBe(3);
    });

    it('should return second page of errors', async () => {
      const errors: Array<{ row: number; field: string; error: string }> = [];
      for (let i = 1; i <= 25; i++) {
        errors.push({ row: i, field: 'priority', error: `Invalid value at row ${i}` });
      }

      migrationJobs.push({
        id: 'mig-errors-2',
        tenantSlug: testTenant.slug,
        sourceSystem: 'servicenow',
        entityType: 'incident',
        status: 'completed',
        totalRecords: 100,
        processedRecords: 100,
        successfulRecords: 75,
        failedRecords: 25,
        filename: 'incidents.csv',
        fileSize: 5000,
        dryRun: false,
        createdAt: new Date(),
        completedAt: new Date(),
        createdBy: testUser.userId,
        errors,
      });

      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/migration/mig-errors-2/errors?page=2&limit=10',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.errors).toHaveLength(10);
      expect(body.page).toBe(2);
      expect(body.errors[0].row).toBe(11);
    });

    it('should return empty errors for successful job', async () => {
      migrationJobs.push({
        id: 'mig-no-errors',
        tenantSlug: testTenant.slug,
        sourceSystem: 'servicenow',
        entityType: 'incident',
        status: 'completed',
        totalRecords: 100,
        processedRecords: 100,
        successfulRecords: 100,
        failedRecords: 0,
        filename: 'incidents.csv',
        fileSize: 5000,
        dryRun: false,
        createdAt: new Date(),
        completedAt: new Date(),
        createdBy: testUser.userId,
        errors: [],
      });

      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/migration/mig-no-errors/errors',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.errors).toEqual([]);
      expect(body.total).toBe(0);
    });

    it('should return 404 for non-existent job', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/migration/mig-nonexistent/errors',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(404);
    });
  });
});
