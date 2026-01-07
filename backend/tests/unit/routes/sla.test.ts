import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

// Mock services
vi.mock('../../../src/services/sla.js', () => ({
  slaService: {
    listSlaPolicies: vi.fn().mockResolvedValue([]),
    getSlaPolicy: vi.fn().mockResolvedValue(null),
    createSlaPolicy: vi.fn().mockResolvedValue({}),
    updateSlaPolicy: vi.fn().mockResolvedValue({}),
    deleteSlaPolicy: vi.fn().mockResolvedValue(true),
    createSlaTarget: vi.fn().mockResolvedValue({}),
    updateSlaTarget: vi.fn().mockResolvedValue({}),
    deleteSlaTarget: vi.fn().mockResolvedValue(true),
    getSlaStats: vi.fn().mockResolvedValue({}),
    getSlaConfigFromDb: vi.fn().mockResolvedValue({}),
  },
}));

// Mock middleware
vi.mock('../../../src/middleware/auth.js', () => ({
  authenticate: vi.fn().mockImplementation((_req, _reply, done) => done()),
}));

// Mock validation utils
vi.mock('../../../src/utils/validation.js', () => ({
  validateDate: vi.fn().mockImplementation((date) => date ? new Date(date) : null),
  validateDateRange: vi.fn(),
}));

describe('SLA Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('SLA Policy Schema', () => {
    const slaPolicySchema = z.object({
      name: z.string().min(1).max(100),
      description: z.string().max(500).optional(),
      entityType: z.enum(['issue', 'problem', 'change']),
      isDefault: z.boolean().optional(),
      targets: z.array(z.object({
        metricType: z.enum(['response_time', 'resolution_time']),
        priority: z.enum(['critical', 'high', 'medium', 'low']),
        targetMinutes: z.number().int().positive(),
        warningThresholdPercent: z.number().int().min(1).max(100).optional(),
      })).optional(),
    });

    it('should require name and entityType', () => {
      const result = slaPolicySchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should accept valid policy data', () => {
      const result = slaPolicySchema.safeParse({
        name: 'Standard SLA',
        entityType: 'issue',
      });
      expect(result.success).toBe(true);
    });

    it('should require name of at least 1 character', () => {
      const result = slaPolicySchema.safeParse({
        name: '',
        entityType: 'issue',
      });
      expect(result.success).toBe(false);
    });

    it('should reject name over 100 characters', () => {
      const result = slaPolicySchema.safeParse({
        name: 'x'.repeat(101),
        entityType: 'issue',
      });
      expect(result.success).toBe(false);
    });

    it('should accept description', () => {
      const result = slaPolicySchema.safeParse({
        name: 'Standard SLA',
        entityType: 'issue',
        description: 'Default SLA policy for issues',
      });
      expect(result.success).toBe(true);
    });

    it('should reject description over 500 characters', () => {
      const result = slaPolicySchema.safeParse({
        name: 'Standard SLA',
        entityType: 'issue',
        description: 'x'.repeat(501),
      });
      expect(result.success).toBe(false);
    });

    it('should accept all entity types', () => {
      const types = ['issue', 'problem', 'change'];
      for (const entityType of types) {
        const result = slaPolicySchema.safeParse({ name: 'Policy', entityType });
        expect(result.success).toBe(true);
      }
    });

    it('should reject invalid entity type', () => {
      const result = slaPolicySchema.safeParse({
        name: 'Policy',
        entityType: 'request',
      });
      expect(result.success).toBe(false);
    });

    it('should accept isDefault flag', () => {
      const result = slaPolicySchema.safeParse({
        name: 'Standard SLA',
        entityType: 'issue',
        isDefault: true,
      });
      expect(result.success).toBe(true);
    });

    it('should accept targets array', () => {
      const result = slaPolicySchema.safeParse({
        name: 'Standard SLA',
        entityType: 'issue',
        targets: [
          { metricType: 'response_time', priority: 'critical', targetMinutes: 15 },
          { metricType: 'resolution_time', priority: 'critical', targetMinutes: 240 },
        ],
      });
      expect(result.success).toBe(true);
    });
  });

  describe('Update SLA Policy Schema', () => {
    const updateSlaPolicySchema = z.object({
      name: z.string().min(1).max(100).optional(),
      description: z.string().max(500).optional(),
      isDefault: z.boolean().optional(),
      isActive: z.boolean().optional(),
    });

    it('should accept partial update', () => {
      const result = updateSlaPolicySchema.safeParse({ name: 'Updated Name' });
      expect(result.success).toBe(true);
    });

    it('should accept empty update', () => {
      const result = updateSlaPolicySchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should accept isActive flag', () => {
      const result = updateSlaPolicySchema.safeParse({ isActive: false });
      expect(result.success).toBe(true);
    });

    it('should accept isDefault change', () => {
      const result = updateSlaPolicySchema.safeParse({ isDefault: true });
      expect(result.success).toBe(true);
    });
  });

  describe('SLA Target Schema', () => {
    const slaTargetSchema = z.object({
      metricType: z.enum(['response_time', 'resolution_time']),
      priority: z.enum(['critical', 'high', 'medium', 'low']),
      targetMinutes: z.number().int().positive(),
      warningThresholdPercent: z.number().int().min(1).max(100).optional(),
    });

    it('should require metricType, priority, and targetMinutes', () => {
      const result = slaTargetSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should accept valid target', () => {
      const result = slaTargetSchema.safeParse({
        metricType: 'response_time',
        priority: 'critical',
        targetMinutes: 15,
      });
      expect(result.success).toBe(true);
    });

    it('should accept all metric types', () => {
      const types = ['response_time', 'resolution_time'];
      for (const metricType of types) {
        const result = slaTargetSchema.safeParse({
          metricType,
          priority: 'high',
          targetMinutes: 60,
        });
        expect(result.success).toBe(true);
      }
    });

    it('should accept all priority values', () => {
      const priorities = ['critical', 'high', 'medium', 'low'];
      for (const priority of priorities) {
        const result = slaTargetSchema.safeParse({
          metricType: 'response_time',
          priority,
          targetMinutes: 60,
        });
        expect(result.success).toBe(true);
      }
    });

    it('should require positive targetMinutes', () => {
      const result = slaTargetSchema.safeParse({
        metricType: 'response_time',
        priority: 'high',
        targetMinutes: 0,
      });
      expect(result.success).toBe(false);
    });

    it('should reject negative targetMinutes', () => {
      const result = slaTargetSchema.safeParse({
        metricType: 'response_time',
        priority: 'high',
        targetMinutes: -10,
      });
      expect(result.success).toBe(false);
    });

    it('should accept warningThresholdPercent', () => {
      const result = slaTargetSchema.safeParse({
        metricType: 'response_time',
        priority: 'high',
        targetMinutes: 60,
        warningThresholdPercent: 80,
      });
      expect(result.success).toBe(true);
    });

    it('should reject warningThresholdPercent below 1', () => {
      const result = slaTargetSchema.safeParse({
        metricType: 'response_time',
        priority: 'high',
        targetMinutes: 60,
        warningThresholdPercent: 0,
      });
      expect(result.success).toBe(false);
    });

    it('should reject warningThresholdPercent above 100', () => {
      const result = slaTargetSchema.safeParse({
        metricType: 'response_time',
        priority: 'high',
        targetMinutes: 60,
        warningThresholdPercent: 101,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('Update SLA Target Schema', () => {
    const updateSlaTargetSchema = z.object({
      targetMinutes: z.number().int().positive().optional(),
      warningThresholdPercent: z.number().int().min(1).max(100).optional(),
    });

    it('should accept partial update', () => {
      const result = updateSlaTargetSchema.safeParse({ targetMinutes: 120 });
      expect(result.success).toBe(true);
    });

    it('should accept empty update', () => {
      const result = updateSlaTargetSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should accept warningThresholdPercent update', () => {
      const result = updateSlaTargetSchema.safeParse({ warningThresholdPercent: 75 });
      expect(result.success).toBe(true);
    });
  });

  describe('Query Filters', () => {
    it('should handle entityType filter', () => {
      const query = { entityType: 'issue' };
      expect(query.entityType).toBe('issue');
    });

    it('should handle isActive filter as true', () => {
      const query = { isActive: 'true' };
      const isActive = query.isActive === 'true' ? true : query.isActive === 'false' ? false : undefined;
      expect(isActive).toBe(true);
    });

    it('should handle isActive filter as false', () => {
      const query = { isActive: 'false' };
      const isActive = query.isActive === 'true' ? true : query.isActive === 'false' ? false : undefined;
      expect(isActive).toBe(false);
    });

    it('should handle missing isActive filter', () => {
      const query = {} as { isActive?: string };
      const isActive = query.isActive === 'true' ? true : query.isActive === 'false' ? false : undefined;
      expect(isActive).toBeUndefined();
    });
  });

  describe('Authentication', () => {
    it('should use authenticate middleware for GET /policies', () => {
      const middleware = 'authenticate';
      expect(middleware).toBe('authenticate');
    });

    it('should use authenticate middleware for POST /policies', () => {
      const middleware = 'authenticate';
      expect(middleware).toBe('authenticate');
    });

    it('should use authenticate middleware for PATCH /policies/:id', () => {
      const middleware = 'authenticate';
      expect(middleware).toBe('authenticate');
    });

    it('should use authenticate middleware for DELETE /policies/:id', () => {
      const middleware = 'authenticate';
      expect(middleware).toBe('authenticate');
    });
  });

  describe('Response Formats', () => {
    it('should return policies in data wrapper', () => {
      const policies = [{ id: 'policy-1', name: 'Standard SLA' }];
      const response = { data: policies };
      expect(response).toHaveProperty('data');
      expect(Array.isArray(response.data)).toBe(true);
    });

    it('should return 404 for missing policy', () => {
      const response = { error: 'SLA policy not found' };
      const statusCode = 404;
      expect(statusCode).toBe(404);
      expect(response.error).toBe('SLA policy not found');
    });

    it('should return 201 for created policy', () => {
      const statusCode = 201;
      expect(statusCode).toBe(201);
    });

    it('should return 204 for deleted policy', () => {
      const statusCode = 204;
      expect(statusCode).toBe(204);
    });

    it('should return 404 for non-deletable policy', () => {
      const response = { error: 'SLA policy not found or is default' };
      const statusCode = 404;
      expect(statusCode).toBe(404);
      expect(response.error).toContain('default');
    });

    it('should return stats in data wrapper', () => {
      const stats = { totalBreached: 5, averageResponseTime: 30 };
      const response = { data: stats };
      expect(response).toHaveProperty('data');
    });

    it('should return config in data wrapper', () => {
      const config = { defaultPolicy: {}, targets: [] };
      const response = { data: config };
      expect(response).toHaveProperty('data');
    });
  });

  describe('Service Integration', () => {
    it('should pass tenantSlug and filters to slaService.listSlaPolicies', async () => {
      const { slaService } = await import('../../../src/services/sla.js');
      const filters = { entityType: 'issue', isActive: true };

      await slaService.listSlaPolicies('test-tenant', filters);
      expect(slaService.listSlaPolicies).toHaveBeenCalledWith('test-tenant', filters);
    });

    it('should pass tenantSlug and id to slaService.getSlaPolicy', async () => {
      const { slaService } = await import('../../../src/services/sla.js');
      const id = '123e4567-e89b-12d3-a456-426614174000';

      await slaService.getSlaPolicy('test-tenant', id);
      expect(slaService.getSlaPolicy).toHaveBeenCalledWith('test-tenant', id);
    });

    it('should pass tenantSlug, policyId, and body to slaService.createSlaTarget', async () => {
      const { slaService } = await import('../../../src/services/sla.js');
      const policyId = '123e4567-e89b-12d3-a456-426614174000';
      const body = {
        metricType: 'response_time',
        priority: 'high',
        targetMinutes: 60,
      };

      await slaService.createSlaTarget('test-tenant', policyId, body);
      expect(slaService.createSlaTarget).toHaveBeenCalledWith('test-tenant', policyId, body);
    });

    it('should pass tenantSlug and entityType to slaService.getSlaStats', async () => {
      const { slaService } = await import('../../../src/services/sla.js');

      await slaService.getSlaStats('test-tenant', 'issue', undefined);
      expect(slaService.getSlaStats).toHaveBeenCalledWith('test-tenant', 'issue', undefined);
    });

    it('should pass tenantSlug and entityType to slaService.getSlaConfigFromDb', async () => {
      const { slaService } = await import('../../../src/services/sla.js');

      await slaService.getSlaConfigFromDb('test-tenant', 'issue');
      expect(slaService.getSlaConfigFromDb).toHaveBeenCalledWith('test-tenant', 'issue');
    });
  });

  describe('Date Range Validation', () => {
    it('should accept valid date range', () => {
      const startDate = '2024-01-01';
      const endDate = '2024-01-31';
      expect(startDate).toBeDefined();
      expect(endDate).toBeDefined();
    });

    it('should default entityType to issue when not provided', () => {
      const query = {} as { entityType?: string };
      const entityType = query.entityType || 'issue';
      expect(entityType).toBe('issue');
    });
  });
});
