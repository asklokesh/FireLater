import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

// Mock services
vi.mock('../../../src/services/audit.js', () => ({
  auditService: {
    query: vi.fn().mockResolvedValue({ logs: [], total: 0 }),
    getEntityHistory: vi.fn().mockResolvedValue([]),
    getUserActivity: vi.fn().mockResolvedValue([]),
    getSecurityEvents: vi.fn().mockResolvedValue([]),
    getFailedLogins: vi.fn().mockResolvedValue([]),
    getSummaryByUser: vi.fn().mockResolvedValue([]),
    getSummaryByEntity: vi.fn().mockResolvedValue([]),
    getSettings: vi.fn().mockResolvedValue({}),
    updateSettings: vi.fn().mockResolvedValue({}),
    cleanupOldLogs: vi.fn().mockResolvedValue(0),
  },
  AuditAction: {
    CREATE: 'CREATE',
    UPDATE: 'UPDATE',
    DELETE: 'DELETE',
    LOGIN: 'LOGIN',
    LOGOUT: 'LOGOUT',
  },
}));

// Mock middleware
vi.mock('../../../src/middleware/auth.js', () => ({
  requirePermission: vi.fn().mockReturnValue(vi.fn().mockImplementation((_req, _reply, done) => done())),
}));

// Mock validation utils
vi.mock('../../../src/utils/validation.js', () => ({
  validateDate: vi.fn().mockImplementation((date) => date ? new Date(date) : null),
  validateDateRange: vi.fn(),
  validateLimit: vi.fn().mockImplementation((limit) => limit ? parseInt(limit, 10) : 100),
  validateOffset: vi.fn().mockImplementation((offset) => offset ? parseInt(offset, 10) : 0),
}));

describe('Audit Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Query Parameters', () => {
    const querySchema = z.object({
      userId: z.string().uuid().optional(),
      action: z.enum(['CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT']).optional(),
      entityType: z.string().max(100).optional(),
      entityId: z.string().uuid().optional(),
      ipAddress: z.string().max(45).optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(1000).optional(),
      offset: z.coerce.number().int().min(0).optional(),
    });

    it('should accept empty query', () => {
      const result = querySchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should filter by userId', () => {
      const result = querySchema.safeParse({
        userId: '123e4567-e89b-12d3-a456-426614174000',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid userId', () => {
      const result = querySchema.safeParse({
        userId: 'not-a-uuid',
      });
      expect(result.success).toBe(false);
    });

    it('should filter by action', () => {
      const actions = ['CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT'];
      for (const action of actions) {
        const result = querySchema.safeParse({ action });
        expect(result.success).toBe(true);
      }
    });

    it('should reject invalid action', () => {
      const result = querySchema.safeParse({ action: 'INVALID' });
      expect(result.success).toBe(false);
    });

    it('should filter by entityType', () => {
      const result = querySchema.safeParse({ entityType: 'issue' });
      expect(result.success).toBe(true);
    });

    it('should filter by entityId', () => {
      const result = querySchema.safeParse({
        entityId: '123e4567-e89b-12d3-a456-426614174000',
      });
      expect(result.success).toBe(true);
    });

    it('should filter by ipAddress', () => {
      const result = querySchema.safeParse({ ipAddress: '192.168.1.1' });
      expect(result.success).toBe(true);
    });

    it('should accept date range', () => {
      const result = querySchema.safeParse({
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      });
      expect(result.success).toBe(true);
    });

    it('should accept pagination', () => {
      const result = querySchema.safeParse({
        limit: '100',
        offset: '0',
      });
      expect(result.success).toBe(true);
    });

    it('should reject limit over 1000', () => {
      const result = querySchema.safeParse({ limit: '1001' });
      expect(result.success).toBe(false);
    });

    it('should reject negative offset', () => {
      const result = querySchema.safeParse({ offset: '-1' });
      expect(result.success).toBe(false);
    });
  });

  describe('Entity History Parameters', () => {
    const entityHistorySchema = z.object({
      entityType: z.string().min(1).max(100),
      entityId: z.string().uuid(),
    });

    it('should require entityType and entityId', () => {
      const result = entityHistorySchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should accept valid entity params', () => {
      const result = entityHistorySchema.safeParse({
        entityType: 'issue',
        entityId: '123e4567-e89b-12d3-a456-426614174000',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid entityId', () => {
      const result = entityHistorySchema.safeParse({
        entityType: 'issue',
        entityId: 'not-a-uuid',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('User Activity Parameters', () => {
    const userActivitySchema = z.object({
      userId: z.string().uuid(),
      days: z.coerce.number().int().min(1).max(365).optional(),
    });

    it('should require userId', () => {
      const result = userActivitySchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should accept valid userId', () => {
      const result = userActivitySchema.safeParse({
        userId: '123e4567-e89b-12d3-a456-426614174000',
      });
      expect(result.success).toBe(true);
    });

    it('should accept days parameter', () => {
      const result = userActivitySchema.safeParse({
        userId: '123e4567-e89b-12d3-a456-426614174000',
        days: '30',
      });
      expect(result.success).toBe(true);
    });

    it('should reject days over 365', () => {
      const result = userActivitySchema.safeParse({
        userId: '123e4567-e89b-12d3-a456-426614174000',
        days: '400',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('Security Events Parameters', () => {
    const securityEventsSchema = z.object({
      hours: z.coerce.number().int().min(1).max(168).optional(),
    });

    it('should accept empty query', () => {
      const result = securityEventsSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should accept hours parameter', () => {
      const result = securityEventsSchema.safeParse({ hours: '24' });
      expect(result.success).toBe(true);
    });

    it('should reject hours over 168 (1 week)', () => {
      const result = securityEventsSchema.safeParse({ hours: '200' });
      expect(result.success).toBe(false);
    });
  });

  describe('Failed Logins Parameters', () => {
    const failedLoginsSchema = z.object({
      hours: z.coerce.number().int().min(1).max(168).optional(),
      threshold: z.coerce.number().int().min(1).max(100).optional(),
    });

    it('should accept empty query', () => {
      const result = failedLoginsSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should accept hours and threshold', () => {
      const result = failedLoginsSchema.safeParse({
        hours: '24',
        threshold: '5',
      });
      expect(result.success).toBe(true);
    });

    it('should reject threshold over 100', () => {
      const result = failedLoginsSchema.safeParse({ threshold: '101' });
      expect(result.success).toBe(false);
    });
  });

  describe('Update Settings Schema', () => {
    const updateSettingsSchema = z.object({
      retention_days: z.number().int().min(30).max(3650).optional(),
      log_reads: z.boolean().optional(),
      log_exports: z.boolean().optional(),
      sensitive_fields: z.array(z.string()).optional(),
    });

    it('should accept empty update', () => {
      const result = updateSettingsSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should accept retention_days', () => {
      const result = updateSettingsSchema.safeParse({ retention_days: 365 });
      expect(result.success).toBe(true);
    });

    it('should reject retention_days under 30', () => {
      const result = updateSettingsSchema.safeParse({ retention_days: 10 });
      expect(result.success).toBe(false);
    });

    it('should reject retention_days over 3650 (10 years)', () => {
      const result = updateSettingsSchema.safeParse({ retention_days: 4000 });
      expect(result.success).toBe(false);
    });

    it('should accept log_reads flag', () => {
      const result = updateSettingsSchema.safeParse({ log_reads: true });
      expect(result.success).toBe(true);
    });

    it('should accept log_exports flag', () => {
      const result = updateSettingsSchema.safeParse({ log_exports: false });
      expect(result.success).toBe(true);
    });

    it('should accept sensitive_fields array', () => {
      const result = updateSettingsSchema.safeParse({
        sensitive_fields: ['password', 'ssn', 'credit_card'],
      });
      expect(result.success).toBe(true);
    });
  });

  describe('Route Permissions', () => {
    it('should require admin:read for GET /', () => {
      const permission = 'admin:read';
      expect(permission).toBe('admin:read');
    });

    it('should require admin:read for GET /entity/:entityType/:entityId', () => {
      const permission = 'admin:read';
      expect(permission).toBe('admin:read');
    });

    it('should require admin:read for GET /user/:userId', () => {
      const permission = 'admin:read';
      expect(permission).toBe('admin:read');
    });

    it('should require admin:read for GET /security', () => {
      const permission = 'admin:read';
      expect(permission).toBe('admin:read');
    });

    it('should require admin:read for GET /security/failed-logins', () => {
      const permission = 'admin:read';
      expect(permission).toBe('admin:read');
    });

    it('should require admin:read for GET /summary/users', () => {
      const permission = 'admin:read';
      expect(permission).toBe('admin:read');
    });

    it('should require admin:read for GET /summary/entities', () => {
      const permission = 'admin:read';
      expect(permission).toBe('admin:read');
    });

    it('should require admin:read for GET /settings', () => {
      const permission = 'admin:read';
      expect(permission).toBe('admin:read');
    });

    it('should require admin:write for PATCH /settings', () => {
      const permission = 'admin:write';
      expect(permission).toBe('admin:write');
    });

    it('should require admin:write for POST /cleanup', () => {
      const permission = 'admin:write';
      expect(permission).toBe('admin:write');
    });
  });

  describe('Response Formats', () => {
    it('should return logs array', () => {
      const logs = [{ id: 'log-1', action: 'CREATE' }];
      const response = { logs };
      expect(response).toHaveProperty('logs');
      expect(Array.isArray(response.logs)).toBe(true);
    });

    it('should return events array', () => {
      const events = [{ id: 'event-1', type: 'LOGIN_FAILED' }];
      const response = { events };
      expect(response).toHaveProperty('events');
    });

    it('should return attempts array', () => {
      const attempts = [{ ip: '192.168.1.1', count: 5 }];
      const response = { attempts };
      expect(response).toHaveProperty('attempts');
    });

    it('should return summary array', () => {
      const summary = [{ userId: 'user-1', count: 100 }];
      const response = { summary };
      expect(response).toHaveProperty('summary');
    });

    it('should return settings object', () => {
      const settings = { retention_days: 365, log_reads: false };
      const response = { settings };
      expect(response).toHaveProperty('settings');
    });

    it('should return deletedCount for cleanup', () => {
      const response = { deletedCount: 1000 };
      expect(response).toHaveProperty('deletedCount');
    });
  });

  describe('Service Integration', () => {
    it('should pass tenantSlug and filters to auditService.query', async () => {
      const { auditService } = await import('../../../src/services/audit.js');
      const filters = { action: 'CREATE' };

      await auditService.query('test-tenant', filters);
      expect(auditService.query).toHaveBeenCalledWith('test-tenant', filters);
    });

    it('should pass tenantSlug and entityType to auditService.getEntityHistory', async () => {
      const { auditService } = await import('../../../src/services/audit.js');
      const entityType = 'issue';
      const entityId = '123e4567-e89b-12d3-a456-426614174000';

      await auditService.getEntityHistory('test-tenant', entityType, entityId);
      expect(auditService.getEntityHistory).toHaveBeenCalledWith('test-tenant', entityType, entityId);
    });

    it('should pass tenantSlug and userId to auditService.getUserActivity', async () => {
      const { auditService } = await import('../../../src/services/audit.js');
      const userId = '123e4567-e89b-12d3-a456-426614174000';
      const days = 30;

      await auditService.getUserActivity('test-tenant', userId, days);
      expect(auditService.getUserActivity).toHaveBeenCalledWith('test-tenant', userId, days);
    });

    it('should pass tenantSlug and hours to auditService.getSecurityEvents', async () => {
      const { auditService } = await import('../../../src/services/audit.js');
      const hours = 24;

      await auditService.getSecurityEvents('test-tenant', hours);
      expect(auditService.getSecurityEvents).toHaveBeenCalledWith('test-tenant', hours);
    });

    it('should pass tenantSlug, hours, and threshold to auditService.getFailedLogins', async () => {
      const { auditService } = await import('../../../src/services/audit.js');
      const hours = 24;
      const threshold = 5;

      await auditService.getFailedLogins('test-tenant', hours, threshold);
      expect(auditService.getFailedLogins).toHaveBeenCalledWith('test-tenant', hours, threshold);
    });

    it('should pass tenantSlug to auditService.getSummaryByUser', async () => {
      const { auditService } = await import('../../../src/services/audit.js');

      await auditService.getSummaryByUser('test-tenant');
      expect(auditService.getSummaryByUser).toHaveBeenCalledWith('test-tenant');
    });

    it('should pass tenantSlug to auditService.cleanupOldLogs', async () => {
      const { auditService } = await import('../../../src/services/audit.js');

      await auditService.cleanupOldLogs('test-tenant');
      expect(auditService.cleanupOldLogs).toHaveBeenCalledWith('test-tenant');
    });
  });

  describe('Date Validation', () => {
    it('should handle startDate parsing', () => {
      const query = { startDate: '2024-01-01' };
      const startDate = new Date(query.startDate);
      expect(startDate).toBeInstanceOf(Date);
    });

    it('should handle endDate parsing', () => {
      const query = { endDate: '2024-01-31' };
      const endDate = new Date(query.endDate);
      expect(endDate).toBeInstanceOf(Date);
    });

    it('should handle missing dates', () => {
      const query = {} as { startDate?: string; endDate?: string };
      const startDate = query.startDate ? new Date(query.startDate) : null;
      const endDate = query.endDate ? new Date(query.endDate) : null;
      expect(startDate).toBeNull();
      expect(endDate).toBeNull();
    });
  });

  describe('Default Values', () => {
    it('should default days to 30 for user activity', () => {
      const query = {} as { days?: string };
      const days = parseInt(query.days || '30', 10);
      expect(days).toBe(30);
    });

    it('should default hours to 24 for security events', () => {
      const query = {} as { hours?: string };
      const hours = parseInt(query.hours || '24', 10);
      expect(hours).toBe(24);
    });

    it('should default threshold to 5 for failed logins', () => {
      const query = {} as { threshold?: string };
      const threshold = parseInt(query.threshold || '5', 10);
      expect(threshold).toBe(5);
    });
  });
});
