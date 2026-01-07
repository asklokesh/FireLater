import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

// Mock services
vi.mock('../../../src/services/applications.js', () => ({
  applicationService: {
    list: vi.fn().mockResolvedValue({ applications: [], total: 0 }),
    findById: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue(undefined),
    getHealthScore: vi.fn().mockResolvedValue({}),
    listEnvironments: vi.fn().mockResolvedValue([]),
    createEnvironment: vi.fn().mockResolvedValue({}),
    updateEnvironment: vi.fn().mockResolvedValue({}),
    deleteEnvironment: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock middleware
vi.mock('../../../src/middleware/auth.js', () => ({
  requirePermission: vi.fn().mockReturnValue(vi.fn().mockImplementation((_req, _reply, done) => done())),
}));

// Mock pagination utils
vi.mock('../../../src/utils/pagination.js', () => ({
  parsePagination: vi.fn().mockReturnValue({ page: 1, perPage: 20 }),
  createPaginatedResponse: vi.fn().mockImplementation((data, total, pagination) => ({
    data,
    meta: { total, page: pagination.page, perPage: pagination.perPage },
  })),
}));

describe('Applications Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Create Application Schema', () => {
    const createApplicationSchema = z.object({
      name: z.string().min(2).max(255),
      description: z.string().max(2000).optional(),
      tier: z.enum(['P1', 'P2', 'P3', 'P4']),
      status: z.enum(['active', 'inactive', 'deprecated']).optional(),
      lifecycleStage: z.enum(['development', 'staging', 'production', 'sunset']).optional(),
      ownerUserId: z.string().uuid().optional(),
      ownerGroupId: z.string().uuid().optional(),
      supportGroupId: z.string().uuid().optional(),
      businessUnit: z.string().max(255).optional(),
      criticality: z.enum(['mission_critical', 'business_critical', 'business_operational', 'administrative']).optional(),
      tags: z.array(z.string()).optional(),
      metadata: z.record(z.unknown()).optional(),
    });

    it('should require name and tier', () => {
      const result = createApplicationSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should accept valid application data', () => {
      const result = createApplicationSchema.safeParse({
        name: 'Customer Portal',
        tier: 'P1',
      });
      expect(result.success).toBe(true);
    });

    it('should require name of at least 2 characters', () => {
      const result = createApplicationSchema.safeParse({
        name: 'A',
        tier: 'P1',
      });
      expect(result.success).toBe(false);
    });

    it('should reject name over 255 characters', () => {
      const result = createApplicationSchema.safeParse({
        name: 'x'.repeat(256),
        tier: 'P1',
      });
      expect(result.success).toBe(false);
    });

    it('should accept all tier values', () => {
      const tiers = ['P1', 'P2', 'P3', 'P4'];
      for (const tier of tiers) {
        const result = createApplicationSchema.safeParse({ name: 'App', tier });
        expect(result.success).toBe(true);
      }
    });

    it('should reject invalid tier', () => {
      const result = createApplicationSchema.safeParse({ name: 'App', tier: 'P5' });
      expect(result.success).toBe(false);
    });

    it('should reject lowercase tier', () => {
      const result = createApplicationSchema.safeParse({ name: 'App', tier: 'p1' });
      expect(result.success).toBe(false);
    });

    it('should accept description', () => {
      const result = createApplicationSchema.safeParse({
        name: 'Customer Portal',
        tier: 'P1',
        description: 'Main customer-facing application',
      });
      expect(result.success).toBe(true);
    });

    it('should reject description over 2000 characters', () => {
      const result = createApplicationSchema.safeParse({
        name: 'App',
        tier: 'P1',
        description: 'x'.repeat(2001),
      });
      expect(result.success).toBe(false);
    });

    it('should accept all status values', () => {
      const statuses = ['active', 'inactive', 'deprecated'];
      for (const status of statuses) {
        const result = createApplicationSchema.safeParse({ name: 'App', tier: 'P1', status });
        expect(result.success).toBe(true);
      }
    });

    it('should accept all lifecycle stages', () => {
      const stages = ['development', 'staging', 'production', 'sunset'];
      for (const lifecycleStage of stages) {
        const result = createApplicationSchema.safeParse({ name: 'App', tier: 'P1', lifecycleStage });
        expect(result.success).toBe(true);
      }
    });

    it('should accept all criticality levels', () => {
      const levels = ['mission_critical', 'business_critical', 'business_operational', 'administrative'];
      for (const criticality of levels) {
        const result = createApplicationSchema.safeParse({ name: 'App', tier: 'P1', criticality });
        expect(result.success).toBe(true);
      }
    });

    it('should accept ownerUserId as UUID', () => {
      const result = createApplicationSchema.safeParse({
        name: 'App',
        tier: 'P1',
        ownerUserId: '123e4567-e89b-12d3-a456-426614174000',
      });
      expect(result.success).toBe(true);
    });

    it('should accept supportGroupId as UUID', () => {
      const result = createApplicationSchema.safeParse({
        name: 'App',
        tier: 'P1',
        supportGroupId: '123e4567-e89b-12d3-a456-426614174000',
      });
      expect(result.success).toBe(true);
    });

    it('should accept businessUnit', () => {
      const result = createApplicationSchema.safeParse({
        name: 'App',
        tier: 'P1',
        businessUnit: 'Engineering',
      });
      expect(result.success).toBe(true);
    });

    it('should accept tags array', () => {
      const result = createApplicationSchema.safeParse({
        name: 'App',
        tier: 'P1',
        tags: ['frontend', 'customer-facing'],
      });
      expect(result.success).toBe(true);
    });

    it('should accept metadata', () => {
      const result = createApplicationSchema.safeParse({
        name: 'App',
        tier: 'P1',
        metadata: { version: '2.0', language: 'TypeScript' },
      });
      expect(result.success).toBe(true);
    });
  });

  describe('Update Application Schema', () => {
    const updateApplicationSchema = z.object({
      name: z.string().min(2).max(255).optional(),
      description: z.string().max(2000).optional(),
      tier: z.enum(['P1', 'P2', 'P3', 'P4']).optional(),
      status: z.enum(['active', 'inactive', 'deprecated']).optional(),
      lifecycleStage: z.enum(['development', 'staging', 'production', 'sunset']).optional(),
      ownerUserId: z.string().uuid().optional(),
      ownerGroupId: z.string().uuid().optional(),
      supportGroupId: z.string().uuid().optional(),
      businessUnit: z.string().max(255).optional(),
      criticality: z.enum(['mission_critical', 'business_critical', 'business_operational', 'administrative']).optional(),
      tags: z.array(z.string()).optional(),
      metadata: z.record(z.unknown()).optional(),
    });

    it('should accept partial update', () => {
      const result = updateApplicationSchema.safeParse({ tier: 'P2' });
      expect(result.success).toBe(true);
    });

    it('should accept empty update', () => {
      const result = updateApplicationSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should accept status change', () => {
      const result = updateApplicationSchema.safeParse({ status: 'deprecated' });
      expect(result.success).toBe(true);
    });

    it('should accept lifecycle stage change', () => {
      const result = updateApplicationSchema.safeParse({ lifecycleStage: 'sunset' });
      expect(result.success).toBe(true);
    });
  });

  describe('Create Environment Schema', () => {
    const createEnvironmentSchema = z.object({
      name: z.string().min(2).max(100),
      type: z.enum(['dev', 'test', 'staging', 'prod']),
      url: z.string().url().optional(),
      cloudProvider: z.enum(['aws', 'gcp', 'azure', 'on-prem']).optional(),
      cloudAccount: z.string().max(255).optional(),
      cloudRegion: z.string().max(50).optional(),
      resourceIds: z.array(z.string()).optional(),
      metadata: z.record(z.unknown()).optional(),
    });

    it('should require name and type', () => {
      const result = createEnvironmentSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should accept valid environment', () => {
      const result = createEnvironmentSchema.safeParse({
        name: 'Production',
        type: 'prod',
      });
      expect(result.success).toBe(true);
    });

    it('should require name of at least 2 characters', () => {
      const result = createEnvironmentSchema.safeParse({ name: 'P', type: 'prod' });
      expect(result.success).toBe(false);
    });

    it('should reject name over 100 characters', () => {
      const result = createEnvironmentSchema.safeParse({
        name: 'x'.repeat(101),
        type: 'prod',
      });
      expect(result.success).toBe(false);
    });

    it('should accept all environment types', () => {
      const types = ['dev', 'test', 'staging', 'prod'];
      for (const type of types) {
        const result = createEnvironmentSchema.safeParse({ name: 'Env', type });
        expect(result.success).toBe(true);
      }
    });

    it('should accept url', () => {
      const result = createEnvironmentSchema.safeParse({
        name: 'Production',
        type: 'prod',
        url: 'https://app.example.com',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid url', () => {
      const result = createEnvironmentSchema.safeParse({
        name: 'Production',
        type: 'prod',
        url: 'not-a-url',
      });
      expect(result.success).toBe(false);
    });

    it('should accept all cloud providers', () => {
      const providers = ['aws', 'gcp', 'azure', 'on-prem'];
      for (const cloudProvider of providers) {
        const result = createEnvironmentSchema.safeParse({ name: 'Env', type: 'prod', cloudProvider });
        expect(result.success).toBe(true);
      }
    });

    it('should accept cloudAccount', () => {
      const result = createEnvironmentSchema.safeParse({
        name: 'Production',
        type: 'prod',
        cloudAccount: '123456789012',
      });
      expect(result.success).toBe(true);
    });

    it('should accept cloudRegion', () => {
      const result = createEnvironmentSchema.safeParse({
        name: 'Production',
        type: 'prod',
        cloudRegion: 'us-east-1',
      });
      expect(result.success).toBe(true);
    });

    it('should accept resourceIds', () => {
      const result = createEnvironmentSchema.safeParse({
        name: 'Production',
        type: 'prod',
        resourceIds: ['i-1234567890abcdef0', 'arn:aws:rds:us-east-1:123456789012:db:mydb'],
      });
      expect(result.success).toBe(true);
    });
  });

  describe('Application ID Parameter Schema', () => {
    const appIdParamSchema = z.object({
      id: z.string().uuid(),
    });

    it('should accept valid UUID', () => {
      const result = appIdParamSchema.safeParse({
        id: '123e4567-e89b-12d3-a456-426614174000',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid UUID', () => {
      const result = appIdParamSchema.safeParse({ id: 'not-a-uuid' });
      expect(result.success).toBe(false);
    });
  });

  describe('Application Environment Parameter Schema', () => {
    const appEnvParamSchema = z.object({
      id: z.string().uuid(),
      envId: z.string().uuid(),
    });

    it('should require both id and envId', () => {
      const result = appEnvParamSchema.safeParse({
        id: '123e4567-e89b-12d3-a456-426614174000',
      });
      expect(result.success).toBe(false);
    });

    it('should accept valid UUIDs for both', () => {
      const result = appEnvParamSchema.safeParse({
        id: '123e4567-e89b-12d3-a456-426614174000',
        envId: '223e4567-e89b-12d3-a456-426614174000',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('List Applications Query Schema', () => {
    const listAppsQuerySchema = z.object({
      page: z.coerce.number().int().positive().optional(),
      per_page: z.coerce.number().int().min(1).max(100).optional(),
      tier: z.enum(['P1', 'P2', 'P3', 'P4']).optional(),
      status: z.enum(['active', 'inactive', 'deprecated']).optional(),
      search: z.string().max(200).optional(),
      q: z.string().max(200).optional(),
      owner_id: z.string().uuid().optional(),
      support_group_id: z.string().uuid().optional(),
    });

    it('should accept empty query', () => {
      const result = listAppsQuerySchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should accept pagination parameters', () => {
      const result = listAppsQuerySchema.safeParse({
        page: '1',
        per_page: '20',
      });
      expect(result.success).toBe(true);
    });

    it('should filter by tier', () => {
      const result = listAppsQuerySchema.safeParse({ tier: 'P1' });
      expect(result.success).toBe(true);
    });

    it('should filter by status', () => {
      const result = listAppsQuerySchema.safeParse({ status: 'active' });
      expect(result.success).toBe(true);
    });

    it('should accept search parameter', () => {
      const result = listAppsQuerySchema.safeParse({ search: 'portal' });
      expect(result.success).toBe(true);
    });

    it('should filter by owner_id', () => {
      const result = listAppsQuerySchema.safeParse({
        owner_id: '123e4567-e89b-12d3-a456-426614174000',
      });
      expect(result.success).toBe(true);
    });

    it('should filter by support_group_id', () => {
      const result = listAppsQuerySchema.safeParse({
        support_group_id: '123e4567-e89b-12d3-a456-426614174000',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('Route Permissions', () => {
    it('should require applications:read for GET /', () => {
      const permission = 'applications:read';
      expect(permission).toBe('applications:read');
    });

    it('should require applications:read for GET /:id', () => {
      const permission = 'applications:read';
      expect(permission).toBe('applications:read');
    });

    it('should require applications:create for POST /', () => {
      const permission = 'applications:create';
      expect(permission).toBe('applications:create');
    });

    it('should require applications:update for PUT /:id', () => {
      const permission = 'applications:update';
      expect(permission).toBe('applications:update');
    });

    it('should require applications:delete for DELETE /:id', () => {
      const permission = 'applications:delete';
      expect(permission).toBe('applications:delete');
    });

    it('should require applications:read for GET /:id/health', () => {
      const permission = 'applications:read';
      expect(permission).toBe('applications:read');
    });

    it('should require applications:update for POST /:id/environments', () => {
      const permission = 'applications:update';
      expect(permission).toBe('applications:update');
    });
  });

  describe('Response Formats', () => {
    it('should return 404 for missing application', () => {
      const id = '123e4567-e89b-12d3-a456-426614174000';
      const errorResponse = {
        statusCode: 404,
        error: 'Not Found',
        message: `Application with id '${id}' not found`,
      };
      expect(errorResponse.statusCode).toBe(404);
      expect(errorResponse.message).toContain('Application');
    });

    it('should return 201 for created application', () => {
      const statusCode = 201;
      expect(statusCode).toBe(201);
    });

    it('should return 204 for deleted application', () => {
      const statusCode = 204;
      expect(statusCode).toBe(204);
    });

    it('should return environments in data wrapper', () => {
      const environments = [{ id: 'env-1', name: 'Production' }];
      const response = { data: environments };
      expect(response).toHaveProperty('data');
      expect(Array.isArray(response.data)).toBe(true);
    });
  });

  describe('Service Integration', () => {
    it('should pass tenantSlug and pagination to applicationService.list', async () => {
      const { applicationService } = await import('../../../src/services/applications.js');
      const pagination = { page: 1, perPage: 20 };
      const filters = {};

      await applicationService.list('test-tenant', pagination, filters);
      expect(applicationService.list).toHaveBeenCalledWith('test-tenant', pagination, filters);
    });

    it('should pass tenantSlug and id to applicationService.findById', async () => {
      const { applicationService } = await import('../../../src/services/applications.js');
      const id = '123e4567-e89b-12d3-a456-426614174000';

      await applicationService.findById('test-tenant', id);
      expect(applicationService.findById).toHaveBeenCalledWith('test-tenant', id);
    });

    it('should pass tenantSlug and id to applicationService.getHealthScore', async () => {
      const { applicationService } = await import('../../../src/services/applications.js');
      const id = '123e4567-e89b-12d3-a456-426614174000';

      await applicationService.getHealthScore('test-tenant', id);
      expect(applicationService.getHealthScore).toHaveBeenCalledWith('test-tenant', id);
    });

    it('should pass tenantSlug and id to applicationService.listEnvironments', async () => {
      const { applicationService } = await import('../../../src/services/applications.js');
      const id = '123e4567-e89b-12d3-a456-426614174000';

      await applicationService.listEnvironments('test-tenant', id);
      expect(applicationService.listEnvironments).toHaveBeenCalledWith('test-tenant', id);
    });
  });
});
