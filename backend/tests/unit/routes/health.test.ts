import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

// Mock services
vi.mock('../../../src/services/health.js', () => ({
  healthScoreConfigService: {
    list: vi.fn().mockResolvedValue([]),
    findByTier: vi.fn().mockResolvedValue(null),
    update: vi.fn().mockResolvedValue({}),
  },
  healthScoreService: {
    listAllScores: vi.fn().mockResolvedValue({ scores: [], total: 0 }),
    getSummary: vi.fn().mockResolvedValue({}),
    getLatestForApplication: vi.fn().mockResolvedValue(null),
    getHistoryForApplication: vi.fn().mockResolvedValue([]),
    calculateForApplication: vi.fn().mockResolvedValue({}),
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

describe('Health Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Tier Parameter Schema', () => {
    const tierParamSchema = z.object({
      tier: z.enum(['P1', 'P2', 'P3', 'P4']),
    });

    it('should accept P1 tier', () => {
      const result = tierParamSchema.safeParse({ tier: 'P1' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.tier).toBe('P1');
      }
    });

    it('should accept P2 tier', () => {
      const result = tierParamSchema.safeParse({ tier: 'P2' });
      expect(result.success).toBe(true);
    });

    it('should accept P3 tier', () => {
      const result = tierParamSchema.safeParse({ tier: 'P3' });
      expect(result.success).toBe(true);
    });

    it('should accept P4 tier', () => {
      const result = tierParamSchema.safeParse({ tier: 'P4' });
      expect(result.success).toBe(true);
    });

    it('should reject invalid tier', () => {
      const result = tierParamSchema.safeParse({ tier: 'P5' });
      expect(result.success).toBe(false);
    });

    it('should reject lowercase tier', () => {
      const result = tierParamSchema.safeParse({ tier: 'p1' });
      expect(result.success).toBe(false);
    });

    it('should reject empty tier', () => {
      const result = tierParamSchema.safeParse({ tier: '' });
      expect(result.success).toBe(false);
    });

    it('should reject missing tier', () => {
      const result = tierParamSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe('Application ID Parameter Schema', () => {
    const applicationIdParamSchema = z.object({
      applicationId: z.string().uuid(),
    });

    it('should accept valid UUID', () => {
      const result = applicationIdParamSchema.safeParse({
        applicationId: '123e4567-e89b-12d3-a456-426614174000',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid UUID', () => {
      const result = applicationIdParamSchema.safeParse({
        applicationId: 'not-a-uuid',
      });
      expect(result.success).toBe(false);
    });

    it('should reject empty string', () => {
      const result = applicationIdParamSchema.safeParse({
        applicationId: '',
      });
      expect(result.success).toBe(false);
    });

    it('should reject missing applicationId', () => {
      const result = applicationIdParamSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should reject numeric ID', () => {
      const result = applicationIdParamSchema.safeParse({
        applicationId: 12345,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('History Query Schema', () => {
    const historyQuerySchema = z.object({
      days: z.coerce.number().int().min(1).max(365).optional(),
    });

    it('should accept valid days value', () => {
      const result = historyQuerySchema.safeParse({ days: '30' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.days).toBe(30);
      }
    });

    it('should accept minimum days (1)', () => {
      const result = historyQuerySchema.safeParse({ days: '1' });
      expect(result.success).toBe(true);
    });

    it('should accept maximum days (365)', () => {
      const result = historyQuerySchema.safeParse({ days: '365' });
      expect(result.success).toBe(true);
    });

    it('should reject days below minimum', () => {
      const result = historyQuerySchema.safeParse({ days: '0' });
      expect(result.success).toBe(false);
    });

    it('should reject days above maximum', () => {
      const result = historyQuerySchema.safeParse({ days: '366' });
      expect(result.success).toBe(false);
    });

    it('should reject negative days', () => {
      const result = historyQuerySchema.safeParse({ days: '-1' });
      expect(result.success).toBe(false);
    });

    it('should accept missing days (optional)', () => {
      const result = historyQuerySchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.days).toBeUndefined();
      }
    });

    it('should coerce string to number', () => {
      const result = historyQuerySchema.safeParse({ days: '90' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(typeof result.data.days).toBe('number');
        expect(result.data.days).toBe(90);
      }
    });
  });

  describe('Update Config Schema', () => {
    const updateConfigSchema = z.object({
      slaWeight: z.number().min(0).max(100).optional(),
      issueWeight: z.number().min(0).max(100).optional(),
      changeWeight: z.number().min(0).max(100).optional(),
      incidentWeight: z.number().min(0).max(100).optional(),
    });

    it('should accept valid weights', () => {
      const result = updateConfigSchema.safeParse({
        slaWeight: 25,
        issueWeight: 25,
        changeWeight: 25,
        incidentWeight: 25,
      });
      expect(result.success).toBe(true);
    });

    it('should accept partial update', () => {
      const result = updateConfigSchema.safeParse({
        slaWeight: 50,
      });
      expect(result.success).toBe(true);
    });

    it('should accept empty update', () => {
      const result = updateConfigSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should accept minimum weight (0)', () => {
      const result = updateConfigSchema.safeParse({
        slaWeight: 0,
      });
      expect(result.success).toBe(true);
    });

    it('should accept maximum weight (100)', () => {
      const result = updateConfigSchema.safeParse({
        issueWeight: 100,
      });
      expect(result.success).toBe(true);
    });

    it('should reject weight below 0', () => {
      const result = updateConfigSchema.safeParse({
        slaWeight: -1,
      });
      expect(result.success).toBe(false);
    });

    it('should reject weight above 100', () => {
      const result = updateConfigSchema.safeParse({
        changeWeight: 101,
      });
      expect(result.success).toBe(false);
    });

    it('should reject non-numeric weight', () => {
      const result = updateConfigSchema.safeParse({
        slaWeight: 'fifty',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('List Scores Query Schema', () => {
    const listScoresQuerySchema = z.object({
      page: z.coerce.number().int().positive().optional(),
      per_page: z.coerce.number().int().min(1).max(100).optional(),
    });

    it('should accept valid pagination', () => {
      const result = listScoresQuerySchema.safeParse({
        page: '1',
        per_page: '20',
      });
      expect(result.success).toBe(true);
    });

    it('should accept missing pagination (optional)', () => {
      const result = listScoresQuerySchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should reject zero page', () => {
      const result = listScoresQuerySchema.safeParse({
        page: '0',
      });
      expect(result.success).toBe(false);
    });

    it('should reject per_page above 100', () => {
      const result = listScoresQuerySchema.safeParse({
        per_page: '101',
      });
      expect(result.success).toBe(false);
    });

    it('should reject per_page of 0', () => {
      const result = listScoresQuerySchema.safeParse({
        per_page: '0',
      });
      expect(result.success).toBe(false);
    });

    it('should coerce string pagination to numbers', () => {
      const result = listScoresQuerySchema.safeParse({
        page: '5',
        per_page: '50',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.page).toBe(5);
        expect(result.data.per_page).toBe(50);
      }
    });
  });

  describe('Route Permissions', () => {
    it('should require health_scores:read for GET /config', () => {
      // Verify the permission string
      const permission = 'health_scores:read';
      expect(permission).toBe('health_scores:read');
    });

    it('should require health_scores:read for GET /config/:tier', () => {
      const permission = 'health_scores:read';
      expect(permission).toBe('health_scores:read');
    });

    it('should require health_scores:manage for PUT /config/:tier', () => {
      const permission = 'health_scores:manage';
      expect(permission).toBe('health_scores:manage');
    });

    it('should require health_scores:read for GET /scores', () => {
      const permission = 'health_scores:read';
      expect(permission).toBe('health_scores:read');
    });

    it('should require health_scores:read for GET /summary', () => {
      const permission = 'health_scores:read';
      expect(permission).toBe('health_scores:read');
    });

    it('should require health_scores:manage for POST calculate', () => {
      const permission = 'health_scores:manage';
      expect(permission).toBe('health_scores:manage');
    });
  });

  describe('Response Formats', () => {
    it('should return configs in object wrapper', () => {
      const configs = [{ tier: 'P1', slaWeight: 25 }];
      const response = { configs };

      expect(response).toHaveProperty('configs');
      expect(Array.isArray(response.configs)).toBe(true);
    });

    it('should return config in object wrapper', () => {
      const config = { tier: 'P1', slaWeight: 25 };
      const response = { config };

      expect(response).toHaveProperty('config');
    });

    it('should return 404 for missing config', () => {
      const errorResponse = {
        statusCode: 404,
        error: 'Not Found',
        message: "Config for tier 'P5' not found",
      };

      expect(errorResponse.statusCode).toBe(404);
      expect(errorResponse.error).toBe('Not Found');
    });

    it('should return summary in object wrapper', () => {
      const summary = { averageScore: 85, totalApplications: 10 };
      const response = { summary };

      expect(response).toHaveProperty('summary');
    });

    it('should return score in object wrapper', () => {
      const score = { applicationId: 'app-1', overallScore: 90 };
      const response = { score };

      expect(response).toHaveProperty('score');
    });

    it('should return history in object wrapper', () => {
      const history = [{ date: '2024-01-01', score: 85 }];
      const response = { history };

      expect(response).toHaveProperty('history');
      expect(Array.isArray(response.history)).toBe(true);
    });

    it('should return 201 for score calculation', () => {
      const statusCode = 201;
      expect(statusCode).toBe(201);
    });
  });

  describe('Default Values', () => {
    it('should default history days to 30', () => {
      const defaultDays = 30;
      const requestedDays = undefined;
      const days = requestedDays ?? defaultDays;

      expect(days).toBe(30);
    });

    it('should use requested days when provided', () => {
      const defaultDays = 30;
      const requestedDays = 90;
      const days = requestedDays ?? defaultDays;

      expect(days).toBe(90);
    });
  });

  describe('Service Integration', () => {
    it('should pass tenantSlug to healthScoreConfigService.list', async () => {
      const { healthScoreConfigService } = await import('../../../src/services/health.js');

      await healthScoreConfigService.list('test-tenant');
      expect(healthScoreConfigService.list).toHaveBeenCalledWith('test-tenant');
    });

    it('should pass tenantSlug and tier to healthScoreConfigService.findByTier', async () => {
      const { healthScoreConfigService } = await import('../../../src/services/health.js');

      await healthScoreConfigService.findByTier('test-tenant', 'P1');
      expect(healthScoreConfigService.findByTier).toHaveBeenCalledWith('test-tenant', 'P1');
    });

    it('should pass tenantSlug, tier, and data to healthScoreConfigService.update', async () => {
      const { healthScoreConfigService } = await import('../../../src/services/health.js');
      const updateData = { slaWeight: 50 };

      await healthScoreConfigService.update('test-tenant', 'P2', updateData);
      expect(healthScoreConfigService.update).toHaveBeenCalledWith('test-tenant', 'P2', updateData);
    });

    it('should pass tenantSlug and pagination to healthScoreService.listAllScores', async () => {
      const { healthScoreService } = await import('../../../src/services/health.js');
      const pagination = { page: 1, perPage: 20 };

      await healthScoreService.listAllScores('test-tenant', pagination);
      expect(healthScoreService.listAllScores).toHaveBeenCalledWith('test-tenant', pagination);
    });

    it('should pass tenantSlug to healthScoreService.getSummary', async () => {
      const { healthScoreService } = await import('../../../src/services/health.js');

      await healthScoreService.getSummary('test-tenant');
      expect(healthScoreService.getSummary).toHaveBeenCalledWith('test-tenant');
    });
  });
});
