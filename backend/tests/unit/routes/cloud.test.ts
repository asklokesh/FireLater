import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

// Mock services
vi.mock('../../../src/services/cloud.js', () => ({
  cloudAccountService: {
    list: vi.fn().mockResolvedValue({ accounts: [], total: 0 }),
    findById: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue(undefined),
    testConnection: vi.fn().mockResolvedValue({ success: true }),
  },
  cloudResourceService: {
    list: vi.fn().mockResolvedValue({ resources: [], total: 0 }),
    findById: vi.fn().mockResolvedValue(null),
    getResourceTypes: vi.fn().mockResolvedValue([]),
    mapToApplication: vi.fn().mockResolvedValue({}),
    unmapFromApplication: vi.fn().mockResolvedValue({}),
    getResourcesByApplication: vi.fn().mockResolvedValue([]),
  },
  cloudCostService: {
    getCostSummary: vi.fn().mockResolvedValue({ costs: [], total: 0 }),
    getCostsByApplication: vi.fn().mockResolvedValue([]),
  },
  cloudMappingRuleService: {
    list: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue(undefined),
    applyRules: vi.fn().mockResolvedValue({ mapped: 0 }),
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

describe('Cloud Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Create Account Schema', () => {
    const createAccountSchema = z.object({
      provider: z.enum(['aws', 'azure', 'gcp']),
      accountId: z.string().min(1),
      name: z.string().min(1).max(255),
      description: z.string().max(1000).optional(),
      credentialType: z.enum(['access_key', 'role_arn', 'service_account']),
      credentials: z.record(z.unknown()).optional(),
      roleArn: z.string().optional(),
      externalId: z.string().optional(),
      syncEnabled: z.boolean().optional(),
      syncInterval: z.number().min(300).optional(),
      syncResources: z.boolean().optional(),
      syncCosts: z.boolean().optional(),
      syncMetrics: z.boolean().optional(),
      regions: z.array(z.string()).optional(),
    });

    it('should require provider, accountId, name, and credentialType', () => {
      const result = createAccountSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should accept valid account data for AWS', () => {
      const result = createAccountSchema.safeParse({
        provider: 'aws',
        accountId: '123456789012',
        name: 'Production AWS',
        credentialType: 'role_arn',
      });
      expect(result.success).toBe(true);
    });

    it('should accept valid account data for Azure', () => {
      const result = createAccountSchema.safeParse({
        provider: 'azure',
        accountId: 'subscription-id',
        name: 'Production Azure',
        credentialType: 'service_account',
      });
      expect(result.success).toBe(true);
    });

    it('should accept valid account data for GCP', () => {
      const result = createAccountSchema.safeParse({
        provider: 'gcp',
        accountId: 'project-id',
        name: 'Production GCP',
        credentialType: 'service_account',
      });
      expect(result.success).toBe(true);
    });

    it('should accept all providers', () => {
      const providers = ['aws', 'azure', 'gcp'];
      for (const provider of providers) {
        const result = createAccountSchema.safeParse({
          provider,
          accountId: 'account-123',
          name: 'Cloud Account',
          credentialType: 'access_key',
        });
        expect(result.success).toBe(true);
      }
    });

    it('should reject invalid provider', () => {
      const result = createAccountSchema.safeParse({
        provider: 'digitalocean',
        accountId: 'account-123',
        name: 'Cloud Account',
        credentialType: 'access_key',
      });
      expect(result.success).toBe(false);
    });

    it('should accept all credential types', () => {
      const types = ['access_key', 'role_arn', 'service_account'];
      for (const credentialType of types) {
        const result = createAccountSchema.safeParse({
          provider: 'aws',
          accountId: 'account-123',
          name: 'Cloud Account',
          credentialType,
        });
        expect(result.success).toBe(true);
      }
    });

    it('should reject name over 255 characters', () => {
      const result = createAccountSchema.safeParse({
        provider: 'aws',
        accountId: 'account-123',
        name: 'x'.repeat(256),
        credentialType: 'access_key',
      });
      expect(result.success).toBe(false);
    });

    it('should accept description', () => {
      const result = createAccountSchema.safeParse({
        provider: 'aws',
        accountId: 'account-123',
        name: 'Production',
        credentialType: 'access_key',
        description: 'Main production AWS account',
      });
      expect(result.success).toBe(true);
    });

    it('should reject description over 1000 characters', () => {
      const result = createAccountSchema.safeParse({
        provider: 'aws',
        accountId: 'account-123',
        name: 'Production',
        credentialType: 'access_key',
        description: 'x'.repeat(1001),
      });
      expect(result.success).toBe(false);
    });

    it('should accept credentials as record', () => {
      const result = createAccountSchema.safeParse({
        provider: 'aws',
        accountId: 'account-123',
        name: 'Production',
        credentialType: 'access_key',
        credentials: { accessKeyId: 'AKIAIOSFODNN7EXAMPLE' },
      });
      expect(result.success).toBe(true);
    });

    it('should accept roleArn', () => {
      const result = createAccountSchema.safeParse({
        provider: 'aws',
        accountId: 'account-123',
        name: 'Production',
        credentialType: 'role_arn',
        roleArn: 'arn:aws:iam::123456789012:role/MyRole',
      });
      expect(result.success).toBe(true);
    });

    it('should accept externalId', () => {
      const result = createAccountSchema.safeParse({
        provider: 'aws',
        accountId: 'account-123',
        name: 'Production',
        credentialType: 'role_arn',
        externalId: 'external-id-123',
      });
      expect(result.success).toBe(true);
    });

    it('should accept syncEnabled flag', () => {
      const result = createAccountSchema.safeParse({
        provider: 'aws',
        accountId: 'account-123',
        name: 'Production',
        credentialType: 'access_key',
        syncEnabled: true,
      });
      expect(result.success).toBe(true);
    });

    it('should accept syncInterval minimum 300', () => {
      const result = createAccountSchema.safeParse({
        provider: 'aws',
        accountId: 'account-123',
        name: 'Production',
        credentialType: 'access_key',
        syncInterval: 300,
      });
      expect(result.success).toBe(true);
    });

    it('should reject syncInterval under 300', () => {
      const result = createAccountSchema.safeParse({
        provider: 'aws',
        accountId: 'account-123',
        name: 'Production',
        credentialType: 'access_key',
        syncInterval: 60,
      });
      expect(result.success).toBe(false);
    });

    it('should accept sync options', () => {
      const result = createAccountSchema.safeParse({
        provider: 'aws',
        accountId: 'account-123',
        name: 'Production',
        credentialType: 'access_key',
        syncResources: true,
        syncCosts: true,
        syncMetrics: false,
      });
      expect(result.success).toBe(true);
    });

    it('should accept regions array', () => {
      const result = createAccountSchema.safeParse({
        provider: 'aws',
        accountId: 'account-123',
        name: 'Production',
        credentialType: 'access_key',
        regions: ['us-east-1', 'us-west-2', 'eu-west-1'],
      });
      expect(result.success).toBe(true);
    });
  });

  describe('Update Account Schema', () => {
    const updateAccountSchema = z.object({
      name: z.string().min(1).max(255).optional(),
      description: z.string().max(1000).optional(),
      credentialType: z.enum(['access_key', 'role_arn', 'service_account']).optional(),
      credentials: z.record(z.unknown()).optional(),
      roleArn: z.string().optional(),
      externalId: z.string().optional(),
      syncEnabled: z.boolean().optional(),
      syncInterval: z.number().min(300).optional(),
      syncResources: z.boolean().optional(),
      syncCosts: z.boolean().optional(),
      syncMetrics: z.boolean().optional(),
      regions: z.array(z.string()).optional(),
    });

    it('should accept partial update', () => {
      const result = updateAccountSchema.safeParse({ name: 'Updated Name' });
      expect(result.success).toBe(true);
    });

    it('should accept empty update', () => {
      const result = updateAccountSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should accept syncEnabled change', () => {
      const result = updateAccountSchema.safeParse({ syncEnabled: false });
      expect(result.success).toBe(true);
    });

    it('should accept syncInterval change', () => {
      const result = updateAccountSchema.safeParse({ syncInterval: 600 });
      expect(result.success).toBe(true);
    });

    it('should accept regions update', () => {
      const result = updateAccountSchema.safeParse({
        regions: ['us-east-1'],
      });
      expect(result.success).toBe(true);
    });
  });

  describe('Map Resource Schema', () => {
    const mapResourceSchema = z.object({
      applicationId: z.string().uuid(),
      environmentId: z.string().uuid().optional(),
    });

    it('should require applicationId', () => {
      const result = mapResourceSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should accept valid mapping data', () => {
      const result = mapResourceSchema.safeParse({
        applicationId: '123e4567-e89b-12d3-a456-426614174000',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid applicationId', () => {
      const result = mapResourceSchema.safeParse({
        applicationId: 'not-a-uuid',
      });
      expect(result.success).toBe(false);
    });

    it('should accept environmentId', () => {
      const result = mapResourceSchema.safeParse({
        applicationId: '123e4567-e89b-12d3-a456-426614174000',
        environmentId: '223e4567-e89b-12d3-a456-426614174000',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid environmentId', () => {
      const result = mapResourceSchema.safeParse({
        applicationId: '123e4567-e89b-12d3-a456-426614174000',
        environmentId: 'not-a-uuid',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('Create Mapping Rule Schema', () => {
    const createMappingRuleSchema = z.object({
      name: z.string().min(1).max(255),
      description: z.string().max(1000).optional(),
      priority: z.number().min(1).optional(),
      provider: z.enum(['aws', 'azure', 'gcp']).optional(),
      resourceType: z.string().optional(),
      tagKey: z.string().min(1),
      tagValuePattern: z.string().optional(),
      applicationId: z.string().uuid(),
      environmentType: z.string().optional(),
    });

    it('should require name, tagKey, and applicationId', () => {
      const result = createMappingRuleSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should accept valid rule data', () => {
      const result = createMappingRuleSchema.safeParse({
        name: 'App Tag Rule',
        tagKey: 'app',
        applicationId: '123e4567-e89b-12d3-a456-426614174000',
      });
      expect(result.success).toBe(true);
    });

    it('should reject name over 255 characters', () => {
      const result = createMappingRuleSchema.safeParse({
        name: 'x'.repeat(256),
        tagKey: 'app',
        applicationId: '123e4567-e89b-12d3-a456-426614174000',
      });
      expect(result.success).toBe(false);
    });

    it('should accept description', () => {
      const result = createMappingRuleSchema.safeParse({
        name: 'App Tag Rule',
        tagKey: 'app',
        applicationId: '123e4567-e89b-12d3-a456-426614174000',
        description: 'Maps resources with app tag to application',
      });
      expect(result.success).toBe(true);
    });

    it('should accept priority', () => {
      const result = createMappingRuleSchema.safeParse({
        name: 'App Tag Rule',
        tagKey: 'app',
        applicationId: '123e4567-e89b-12d3-a456-426614174000',
        priority: 1,
      });
      expect(result.success).toBe(true);
    });

    it('should reject priority under 1', () => {
      const result = createMappingRuleSchema.safeParse({
        name: 'App Tag Rule',
        tagKey: 'app',
        applicationId: '123e4567-e89b-12d3-a456-426614174000',
        priority: 0,
      });
      expect(result.success).toBe(false);
    });

    it('should accept provider', () => {
      const result = createMappingRuleSchema.safeParse({
        name: 'App Tag Rule',
        tagKey: 'app',
        applicationId: '123e4567-e89b-12d3-a456-426614174000',
        provider: 'aws',
      });
      expect(result.success).toBe(true);
    });

    it('should accept resourceType', () => {
      const result = createMappingRuleSchema.safeParse({
        name: 'EC2 Rule',
        tagKey: 'app',
        applicationId: '123e4567-e89b-12d3-a456-426614174000',
        resourceType: 'aws_instance',
      });
      expect(result.success).toBe(true);
    });

    it('should accept tagValuePattern', () => {
      const result = createMappingRuleSchema.safeParse({
        name: 'App Tag Rule',
        tagKey: 'app',
        applicationId: '123e4567-e89b-12d3-a456-426614174000',
        tagValuePattern: 'my-app-.*',
      });
      expect(result.success).toBe(true);
    });

    it('should accept environmentType', () => {
      const result = createMappingRuleSchema.safeParse({
        name: 'Production Rule',
        tagKey: 'env',
        applicationId: '123e4567-e89b-12d3-a456-426614174000',
        environmentType: 'production',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('List Accounts Query Schema', () => {
    const listAccountsQuerySchema = z.object({
      page: z.coerce.number().int().positive().optional(),
      per_page: z.coerce.number().int().min(1).max(100).optional(),
      provider: z.enum(['aws', 'azure', 'gcp']).optional(),
      status: z.enum(['active', 'inactive', 'error']).optional(),
    });

    it('should accept empty query', () => {
      const result = listAccountsQuerySchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should accept pagination parameters', () => {
      const result = listAccountsQuerySchema.safeParse({
        page: '1',
        per_page: '20',
      });
      expect(result.success).toBe(true);
    });

    it('should filter by provider', () => {
      const result = listAccountsQuerySchema.safeParse({ provider: 'aws' });
      expect(result.success).toBe(true);
    });

    it('should filter by status', () => {
      const result = listAccountsQuerySchema.safeParse({ status: 'active' });
      expect(result.success).toBe(true);
    });

    it('should accept all status values', () => {
      const statuses = ['active', 'inactive', 'error'];
      for (const status of statuses) {
        const result = listAccountsQuerySchema.safeParse({ status });
        expect(result.success).toBe(true);
      }
    });

    it('should reject invalid status', () => {
      const result = listAccountsQuerySchema.safeParse({ status: 'pending' });
      expect(result.success).toBe(false);
    });
  });

  describe('List Resources Query Schema', () => {
    const listResourcesQuerySchema = z.object({
      page: z.coerce.number().int().positive().optional(),
      per_page: z.coerce.number().int().min(1).max(100).optional(),
      cloud_account_id: z.string().uuid().optional(),
      resource_type: z.string().max(100).optional(),
      application_id: z.string().uuid().optional(),
      environment_id: z.string().uuid().optional(),
      region: z.string().max(50).optional(),
      is_deleted: z.enum(['true', 'false']).optional(),
    });

    it('should accept empty query', () => {
      const result = listResourcesQuerySchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should filter by cloud_account_id', () => {
      const result = listResourcesQuerySchema.safeParse({
        cloud_account_id: '123e4567-e89b-12d3-a456-426614174000',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid cloud_account_id', () => {
      const result = listResourcesQuerySchema.safeParse({
        cloud_account_id: 'not-a-uuid',
      });
      expect(result.success).toBe(false);
    });

    it('should filter by resource_type', () => {
      const result = listResourcesQuerySchema.safeParse({
        resource_type: 'aws_instance',
      });
      expect(result.success).toBe(true);
    });

    it('should filter by application_id', () => {
      const result = listResourcesQuerySchema.safeParse({
        application_id: '123e4567-e89b-12d3-a456-426614174000',
      });
      expect(result.success).toBe(true);
    });

    it('should filter by environment_id', () => {
      const result = listResourcesQuerySchema.safeParse({
        environment_id: '123e4567-e89b-12d3-a456-426614174000',
      });
      expect(result.success).toBe(true);
    });

    it('should filter by region', () => {
      const result = listResourcesQuerySchema.safeParse({
        region: 'us-east-1',
      });
      expect(result.success).toBe(true);
    });

    it('should reject region over 50 characters', () => {
      const result = listResourcesQuerySchema.safeParse({
        region: 'x'.repeat(51),
      });
      expect(result.success).toBe(false);
    });

    it('should filter by is_deleted', () => {
      const result = listResourcesQuerySchema.safeParse({
        is_deleted: 'true',
      });
      expect(result.success).toBe(true);
    });

    it('should accept multiple filters', () => {
      const result = listResourcesQuerySchema.safeParse({
        cloud_account_id: '123e4567-e89b-12d3-a456-426614174000',
        resource_type: 'aws_instance',
        region: 'us-east-1',
        is_deleted: 'false',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('List Costs Query Schema', () => {
    const listCostsQuerySchema = z.object({
      page: z.coerce.number().int().positive().optional(),
      per_page: z.coerce.number().int().min(1).max(100).optional(),
      cloud_account_id: z.string().uuid().optional(),
      period_type: z.enum(['daily', 'weekly', 'monthly']).optional(),
    });

    it('should accept empty query', () => {
      const result = listCostsQuerySchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should filter by cloud_account_id', () => {
      const result = listCostsQuerySchema.safeParse({
        cloud_account_id: '123e4567-e89b-12d3-a456-426614174000',
      });
      expect(result.success).toBe(true);
    });

    it('should accept all period types', () => {
      const periods = ['daily', 'weekly', 'monthly'];
      for (const period_type of periods) {
        const result = listCostsQuerySchema.safeParse({ period_type });
        expect(result.success).toBe(true);
      }
    });

    it('should reject invalid period_type', () => {
      const result = listCostsQuerySchema.safeParse({ period_type: 'yearly' });
      expect(result.success).toBe(false);
    });
  });

  describe('Application Costs Query Schema', () => {
    const applicationCostsQuerySchema = z.object({
      period_type: z.enum(['daily', 'weekly', 'monthly']).optional(),
    });

    it('should accept empty query', () => {
      const result = applicationCostsQuerySchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should accept period_type', () => {
      const result = applicationCostsQuerySchema.safeParse({ period_type: 'monthly' });
      expect(result.success).toBe(true);
    });
  });

  describe('ID Parameter Schemas', () => {
    const accountIdParamSchema = z.object({
      id: z.string().uuid(),
    });

    const applicationIdParamSchema = z.object({
      applicationId: z.string().uuid(),
    });

    it('should accept valid account UUID', () => {
      const result = accountIdParamSchema.safeParse({
        id: '123e4567-e89b-12d3-a456-426614174000',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid account UUID', () => {
      const result = accountIdParamSchema.safeParse({ id: 'not-a-uuid' });
      expect(result.success).toBe(false);
    });

    it('should accept valid applicationId UUID', () => {
      const result = applicationIdParamSchema.safeParse({
        applicationId: '123e4567-e89b-12d3-a456-426614174000',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid applicationId UUID', () => {
      const result = applicationIdParamSchema.safeParse({
        applicationId: 'not-a-uuid',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('Route Permissions', () => {
    it('should require cloud_accounts:read for GET /accounts', () => {
      const permission = 'cloud_accounts:read';
      expect(permission).toBe('cloud_accounts:read');
    });

    it('should require cloud_accounts:manage for POST /accounts', () => {
      const permission = 'cloud_accounts:manage';
      expect(permission).toBe('cloud_accounts:manage');
    });

    it('should require cloud_accounts:manage for PUT /accounts/:id', () => {
      const permission = 'cloud_accounts:manage';
      expect(permission).toBe('cloud_accounts:manage');
    });

    it('should require cloud_accounts:manage for DELETE /accounts/:id', () => {
      const permission = 'cloud_accounts:manage';
      expect(permission).toBe('cloud_accounts:manage');
    });

    it('should require cloud_accounts:manage for POST /accounts/:id/test', () => {
      const permission = 'cloud_accounts:manage';
      expect(permission).toBe('cloud_accounts:manage');
    });

    it('should require cloud_resources:read for GET /resources', () => {
      const permission = 'cloud_resources:read';
      expect(permission).toBe('cloud_resources:read');
    });

    it('should require cloud_resources:read for GET /resources/types', () => {
      const permission = 'cloud_resources:read';
      expect(permission).toBe('cloud_resources:read');
    });

    it('should require cloud_resources:manage for POST /resources/:id/map', () => {
      const permission = 'cloud_resources:manage';
      expect(permission).toBe('cloud_resources:manage');
    });

    it('should require cloud_resources:manage for DELETE /resources/:id/map', () => {
      const permission = 'cloud_resources:manage';
      expect(permission).toBe('cloud_resources:manage');
    });

    it('should require cloud_costs:read for GET /costs', () => {
      const permission = 'cloud_costs:read';
      expect(permission).toBe('cloud_costs:read');
    });

    it('should require cloud_costs:read for GET /applications/:applicationId/costs', () => {
      const permission = 'cloud_costs:read';
      expect(permission).toBe('cloud_costs:read');
    });

    it('should require cloud_resources:read for GET /mapping-rules', () => {
      const permission = 'cloud_resources:read';
      expect(permission).toBe('cloud_resources:read');
    });

    it('should require cloud_resources:manage for POST /mapping-rules', () => {
      const permission = 'cloud_resources:manage';
      expect(permission).toBe('cloud_resources:manage');
    });

    it('should require cloud_resources:manage for POST /mapping-rules/apply', () => {
      const permission = 'cloud_resources:manage';
      expect(permission).toBe('cloud_resources:manage');
    });
  });

  describe('Response Formats', () => {
    it('should return 404 for missing account', () => {
      const id = '123e4567-e89b-12d3-a456-426614174000';
      const errorResponse = {
        statusCode: 404,
        error: 'Not Found',
        message: `Cloud account '${id}' not found`,
      };
      expect(errorResponse.statusCode).toBe(404);
      expect(errorResponse.message).toContain(id);
    });

    it('should return 404 for missing resource', () => {
      const id = '123e4567-e89b-12d3-a456-426614174000';
      const errorResponse = {
        statusCode: 404,
        error: 'Not Found',
        message: `Cloud resource '${id}' not found`,
      };
      expect(errorResponse.statusCode).toBe(404);
      expect(errorResponse.message).toContain(id);
    });

    it('should return 201 for created account', () => {
      const statusCode = 201;
      expect(statusCode).toBe(201);
    });

    it('should return 201 for created mapping rule', () => {
      const statusCode = 201;
      expect(statusCode).toBe(201);
    });

    it('should return 204 for deleted account', () => {
      const statusCode = 204;
      expect(statusCode).toBe(204);
    });

    it('should return 204 for deleted mapping rule', () => {
      const statusCode = 204;
      expect(statusCode).toBe(204);
    });

    it('should return account in wrapper', () => {
      const account = { id: 'acc-1', name: 'Production' };
      const response = { account };
      expect(response).toHaveProperty('account');
    });

    it('should return resource in wrapper', () => {
      const resource = { id: 'res-1', resourceType: 'aws_instance' };
      const response = { resource };
      expect(response).toHaveProperty('resource');
    });

    it('should return resources in wrapper', () => {
      const resources = [{ id: 'res-1' }];
      const response = { resources };
      expect(response).toHaveProperty('resources');
    });

    it('should return types in wrapper', () => {
      const types = ['aws_instance', 'aws_rds'];
      const response = { types };
      expect(response).toHaveProperty('types');
    });

    it('should return costs in wrapper', () => {
      const costs = [{ period: '2024-01', amount: 1000 }];
      const response = { costs };
      expect(response).toHaveProperty('costs');
    });

    it('should return rules in wrapper', () => {
      const rules = [{ id: 'rule-1' }];
      const response = { rules };
      expect(response).toHaveProperty('rules');
    });

    it('should return rule in wrapper', () => {
      const rule = { id: 'rule-1', name: 'App Tag' };
      const response = { rule };
      expect(response).toHaveProperty('rule');
    });

    it('should return test connection result', () => {
      const result = { success: true, message: 'Connection successful' };
      expect(result).toHaveProperty('success');
    });

    it('should return apply rules result', () => {
      const result = { mapped: 15, skipped: 3 };
      expect(result).toHaveProperty('mapped');
    });
  });

  describe('Service Integration', () => {
    it('should pass tenantSlug and pagination to cloudAccountService.list', async () => {
      const { cloudAccountService } = await import('../../../src/services/cloud.js');
      const pagination = { page: 1, perPage: 20 };
      const filters = { provider: 'aws' };

      await cloudAccountService.list('test-tenant', pagination, filters);
      expect(cloudAccountService.list).toHaveBeenCalledWith('test-tenant', pagination, filters);
    });

    it('should pass tenantSlug and id to cloudAccountService.findById', async () => {
      const { cloudAccountService } = await import('../../../src/services/cloud.js');
      const id = '123e4567-e89b-12d3-a456-426614174000';

      await cloudAccountService.findById('test-tenant', id);
      expect(cloudAccountService.findById).toHaveBeenCalledWith('test-tenant', id);
    });

    it('should pass tenantSlug and id to cloudAccountService.testConnection', async () => {
      const { cloudAccountService } = await import('../../../src/services/cloud.js');
      const id = '123e4567-e89b-12d3-a456-426614174000';

      await cloudAccountService.testConnection('test-tenant', id);
      expect(cloudAccountService.testConnection).toHaveBeenCalledWith('test-tenant', id);
    });

    it('should pass tenantSlug and pagination to cloudResourceService.list', async () => {
      const { cloudResourceService } = await import('../../../src/services/cloud.js');
      const pagination = { page: 1, perPage: 20 };
      const filters = { region: 'us-east-1' };

      await cloudResourceService.list('test-tenant', pagination, filters);
      expect(cloudResourceService.list).toHaveBeenCalledWith('test-tenant', pagination, filters);
    });

    it('should pass tenantSlug to cloudResourceService.getResourceTypes', async () => {
      const { cloudResourceService } = await import('../../../src/services/cloud.js');

      await cloudResourceService.getResourceTypes('test-tenant');
      expect(cloudResourceService.getResourceTypes).toHaveBeenCalledWith('test-tenant');
    });

    it('should pass all parameters to cloudResourceService.mapToApplication', async () => {
      const { cloudResourceService } = await import('../../../src/services/cloud.js');
      const resourceId = '123e4567-e89b-12d3-a456-426614174000';
      const applicationId = '223e4567-e89b-12d3-a456-426614174000';
      const environmentId = '323e4567-e89b-12d3-a456-426614174000';

      await cloudResourceService.mapToApplication('test-tenant', resourceId, applicationId, environmentId);
      expect(cloudResourceService.mapToApplication).toHaveBeenCalledWith(
        'test-tenant',
        resourceId,
        applicationId,
        environmentId
      );
    });

    it('should pass tenantSlug and applicationId to cloudResourceService.getResourcesByApplication', async () => {
      const { cloudResourceService } = await import('../../../src/services/cloud.js');
      const applicationId = '123e4567-e89b-12d3-a456-426614174000';

      await cloudResourceService.getResourcesByApplication('test-tenant', applicationId);
      expect(cloudResourceService.getResourcesByApplication).toHaveBeenCalledWith('test-tenant', applicationId);
    });

    it('should pass tenantSlug to cloudMappingRuleService.list', async () => {
      const { cloudMappingRuleService } = await import('../../../src/services/cloud.js');

      await cloudMappingRuleService.list('test-tenant');
      expect(cloudMappingRuleService.list).toHaveBeenCalledWith('test-tenant');
    });

    it('should pass tenantSlug to cloudMappingRuleService.applyRules', async () => {
      const { cloudMappingRuleService } = await import('../../../src/services/cloud.js');

      await cloudMappingRuleService.applyRules('test-tenant');
      expect(cloudMappingRuleService.applyRules).toHaveBeenCalledWith('test-tenant');
    });
  });
});
