import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import { createTestApp, generateTestToken, createAuthHeader } from '../helpers.js';

// Mock data stores
interface MockAuditLog {
  id: string;
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
}

interface MockAuditSettings {
  retentionDays: number;
  logReads: boolean;
  logExports: boolean;
  sensitiveFields: string[];
}

const auditLogs: MockAuditLog[] = [];
let auditSettings: MockAuditSettings = {
  retentionDays: 90,
  logReads: false,
  logExports: true,
  sensitiveFields: ['password', 'apiKey', 'token'],
};

function resetMockData() {
  auditLogs.length = 0;
  auditSettings = {
    retentionDays: 90,
    logReads: false,
    logExports: true,
    sensitiveFields: ['password', 'apiKey', 'token'],
  };
}

describe('Audit Routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp();

    // Query audit logs
    app.get('/v1/audit', async (request, reply) => {
      const query = request.query as {
        userId?: string;
        action?: string;
        entityType?: string;
        entityId?: string;
        ipAddress?: string;
        startDate?: string;
        endDate?: string;
        limit?: string;
        offset?: string;
      };

      let filtered = [...auditLogs];

      if (query.userId) {
        filtered = filtered.filter(l => l.userId === query.userId);
      }
      if (query.action) {
        filtered = filtered.filter(l => l.action === query.action);
      }
      if (query.entityType) {
        filtered = filtered.filter(l => l.entityType === query.entityType);
      }
      if (query.entityId) {
        filtered = filtered.filter(l => l.entityId === query.entityId);
      }
      if (query.ipAddress) {
        filtered = filtered.filter(l => l.ipAddress === query.ipAddress);
      }
      if (query.startDate) {
        const start = new Date(query.startDate);
        filtered = filtered.filter(l => l.createdAt >= start);
      }
      if (query.endDate) {
        const end = new Date(query.endDate);
        filtered = filtered.filter(l => l.createdAt <= end);
      }

      const limit = parseInt(query.limit || '50', 10);
      const offset = parseInt(query.offset || '0', 10);
      const data = filtered.slice(offset, offset + limit);

      reply.send({
        logs: data,
        total: filtered.length,
        limit,
        offset,
      });
    });

    // Get entity history
    app.get<{ Params: { entityType: string; entityId: string } }>('/v1/audit/entity/:entityType/:entityId', async (request, reply) => {
      const { entityType, entityId } = request.params;
      const logs = auditLogs.filter(l => l.entityType === entityType && l.entityId === entityId);
      reply.send({ logs });
    });

    // Get user activity
    app.get<{ Params: { userId: string }; Querystring: { days?: string } }>('/v1/audit/user/:userId', async (request, reply) => {
      const { userId } = request.params;
      const days = parseInt(request.query.days || '30', 10);
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const logs = auditLogs.filter(l => l.userId === userId && l.createdAt >= cutoff);
      reply.send({ logs });
    });

    // Get security events
    app.get('/v1/audit/security', async (request, reply) => {
      const query = request.query as { hours?: string };
      const hours = parseInt(query.hours || '24', 10);
      const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);

      const securityActions = ['login', 'logout', 'login_failed', 'password_changed', 'password_reset', 'two_factor_enabled', 'two_factor_disabled', 'api_key_created', 'api_key_revoked'];
      const events = auditLogs.filter(l => securityActions.includes(l.action) && l.createdAt >= cutoff);
      reply.send({ events });
    });

    // Get failed login attempts
    app.get('/v1/audit/security/failed-logins', async (request, reply) => {
      const query = request.query as { hours?: string; threshold?: string };
      const hours = parseInt(query.hours || '24', 10);
      const threshold = parseInt(query.threshold || '5', 10);
      const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);

      const failedLogins = auditLogs.filter(l => l.action === 'login_failed' && l.createdAt >= cutoff);

      // Group by IP
      const byIp: Record<string, { count: number; lastAttempt: Date; users: string[] }> = {};
      for (const log of failedLogins) {
        const ip = log.ipAddress || 'unknown';
        if (!byIp[ip]) {
          byIp[ip] = { count: 0, lastAttempt: log.createdAt, users: [] };
        }
        byIp[ip].count++;
        if (log.createdAt > byIp[ip].lastAttempt) {
          byIp[ip].lastAttempt = log.createdAt;
        }
        if (!byIp[ip].users.includes(log.userId)) {
          byIp[ip].users.push(log.userId);
        }
      }

      const attempts = Object.entries(byIp)
        .filter(([, data]) => data.count >= threshold)
        .map(([ip, data]) => ({
          ipAddress: ip,
          count: data.count,
          lastAttempt: data.lastAttempt,
          users: data.users,
        }));

      reply.send({ attempts });
    });

    // Get summary by user
    app.get('/v1/audit/summary/users', async (request, reply) => {
      const userCounts: Record<string, number> = {};
      for (const log of auditLogs) {
        userCounts[log.userId] = (userCounts[log.userId] || 0) + 1;
      }

      const summary = Object.entries(userCounts).map(([userId, count]) => ({
        userId,
        count,
      }));

      reply.send({ summary });
    });

    // Get summary by entity
    app.get('/v1/audit/summary/entities', async (request, reply) => {
      const entityCounts: Record<string, number> = {};
      for (const log of auditLogs) {
        entityCounts[log.entityType] = (entityCounts[log.entityType] || 0) + 1;
      }

      const summary = Object.entries(entityCounts).map(([entityType, count]) => ({
        entityType,
        count,
      }));

      reply.send({ summary });
    });

    // Get audit settings
    app.get('/v1/audit/settings', async (request, reply) => {
      reply.send({ settings: auditSettings });
    });

    // Update audit settings
    app.patch('/v1/audit/settings', async (request, reply) => {
      const body = request.body as Partial<{
        retention_days: number;
        log_reads: boolean;
        log_exports: boolean;
        sensitive_fields: string[];
      }>;

      if (body.retention_days !== undefined) {
        if (body.retention_days < 30 || body.retention_days > 365) {
          return reply.status(400).send({ error: 'Retention days must be between 30 and 365' });
        }
        auditSettings.retentionDays = body.retention_days;
      }
      if (body.log_reads !== undefined) {
        auditSettings.logReads = body.log_reads;
      }
      if (body.log_exports !== undefined) {
        auditSettings.logExports = body.log_exports;
      }
      if (body.sensitive_fields !== undefined) {
        auditSettings.sensitiveFields = body.sensitive_fields;
      }

      reply.send({ settings: auditSettings });
    });

    // Manual cleanup
    app.post('/v1/audit/cleanup', async (request, reply) => {
      const cutoff = new Date(Date.now() - auditSettings.retentionDays * 24 * 60 * 60 * 1000);
      const before = auditLogs.length;

      // Remove logs older than retention period
      const toKeep = auditLogs.filter(l => l.createdAt >= cutoff);
      auditLogs.length = 0;
      auditLogs.push(...toKeep);

      reply.send({ deletedCount: before - auditLogs.length });
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
  // QUERY AUDIT LOGS TESTS
  // ============================================

  describe('GET /v1/audit', () => {
    it('should return empty list when no logs exist', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/audit',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.logs).toEqual([]);
      expect(body.total).toBe(0);
    });

    it('should return paginated audit logs', async () => {
      // Add some logs
      for (let i = 0; i < 10; i++) {
        auditLogs.push({
          id: `log-${i}`,
          userId: `user-${i % 3}`,
          action: 'update',
          entityType: 'issue',
          entityId: `iss-${i}`,
          createdAt: new Date(),
        });
      }

      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/audit?limit=5&offset=0',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.logs).toHaveLength(5);
      expect(body.total).toBe(10);
    });

    it('should filter logs by userId', async () => {
      auditLogs.push({
        id: 'log-1',
        userId: 'user-123',
        action: 'create',
        entityType: 'issue',
        entityId: 'iss-1',
        createdAt: new Date(),
      });
      auditLogs.push({
        id: 'log-2',
        userId: 'user-456',
        action: 'update',
        entityType: 'issue',
        entityId: 'iss-2',
        createdAt: new Date(),
      });

      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/audit?userId=user-123',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.logs).toHaveLength(1);
      expect(body.logs[0].userId).toBe('user-123');
    });

    it('should filter logs by action', async () => {
      auditLogs.push({
        id: 'log-1',
        userId: 'user-1',
        action: 'create',
        entityType: 'issue',
        entityId: 'iss-1',
        createdAt: new Date(),
      });
      auditLogs.push({
        id: 'log-2',
        userId: 'user-1',
        action: 'delete',
        entityType: 'issue',
        entityId: 'iss-2',
        createdAt: new Date(),
      });

      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/audit?action=delete',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.logs).toHaveLength(1);
      expect(body.logs[0].action).toBe('delete');
    });

    it('should filter logs by entityType', async () => {
      auditLogs.push({
        id: 'log-1',
        userId: 'user-1',
        action: 'update',
        entityType: 'issue',
        entityId: 'iss-1',
        createdAt: new Date(),
      });
      auditLogs.push({
        id: 'log-2',
        userId: 'user-1',
        action: 'update',
        entityType: 'change',
        entityId: 'chg-1',
        createdAt: new Date(),
      });

      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/audit?entityType=change',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.logs).toHaveLength(1);
      expect(body.logs[0].entityType).toBe('change');
    });

    it('should filter logs by ipAddress', async () => {
      auditLogs.push({
        id: 'log-1',
        userId: 'user-1',
        action: 'login',
        entityType: 'session',
        entityId: 'sess-1',
        ipAddress: '192.168.1.1',
        createdAt: new Date(),
      });
      auditLogs.push({
        id: 'log-2',
        userId: 'user-2',
        action: 'login',
        entityType: 'session',
        entityId: 'sess-2',
        ipAddress: '10.0.0.1',
        createdAt: new Date(),
      });

      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/audit?ipAddress=192.168.1.1',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.logs).toHaveLength(1);
      expect(body.logs[0].ipAddress).toBe('192.168.1.1');
    });
  });

  // ============================================
  // ENTITY HISTORY TESTS
  // ============================================

  describe('GET /v1/audit/entity/:entityType/:entityId', () => {
    it('should return history for specific entity', async () => {
      auditLogs.push({
        id: 'log-1',
        userId: 'user-1',
        action: 'create',
        entityType: 'issue',
        entityId: 'iss-123',
        createdAt: new Date(),
      });
      auditLogs.push({
        id: 'log-2',
        userId: 'user-2',
        action: 'update',
        entityType: 'issue',
        entityId: 'iss-123',
        oldValues: { status: 'open' },
        newValues: { status: 'in_progress' },
        createdAt: new Date(),
      });
      auditLogs.push({
        id: 'log-3',
        userId: 'user-1',
        action: 'create',
        entityType: 'issue',
        entityId: 'iss-456',
        createdAt: new Date(),
      });

      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/audit/entity/issue/iss-123',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.logs).toHaveLength(2);
      expect(body.logs[0].entityId).toBe('iss-123');
      expect(body.logs[1].entityId).toBe('iss-123');
    });

    it('should return empty list for non-existent entity', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/audit/entity/issue/non-existent',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.logs).toEqual([]);
    });
  });

  // ============================================
  // USER ACTIVITY TESTS
  // ============================================

  describe('GET /v1/audit/user/:userId', () => {
    it('should return user activity', async () => {
      auditLogs.push({
        id: 'log-1',
        userId: 'user-123',
        action: 'create',
        entityType: 'issue',
        entityId: 'iss-1',
        createdAt: new Date(),
      });
      auditLogs.push({
        id: 'log-2',
        userId: 'user-123',
        action: 'update',
        entityType: 'change',
        entityId: 'chg-1',
        createdAt: new Date(),
      });
      auditLogs.push({
        id: 'log-3',
        userId: 'user-456',
        action: 'delete',
        entityType: 'issue',
        entityId: 'iss-2',
        createdAt: new Date(),
      });

      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/audit/user/user-123',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.logs).toHaveLength(2);
      expect(body.logs.every((l: { userId: string }) => l.userId === 'user-123')).toBe(true);
    });

    it('should filter by days parameter', async () => {
      // Old log (40 days ago)
      auditLogs.push({
        id: 'log-old',
        userId: 'user-123',
        action: 'create',
        entityType: 'issue',
        entityId: 'iss-old',
        createdAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
      });
      // Recent log
      auditLogs.push({
        id: 'log-new',
        userId: 'user-123',
        action: 'update',
        entityType: 'issue',
        entityId: 'iss-new',
        createdAt: new Date(),
      });

      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/audit/user/user-123?days=30',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.logs).toHaveLength(1);
      expect(body.logs[0].id).toBe('log-new');
    });
  });

  // ============================================
  // SECURITY EVENTS TESTS
  // ============================================

  describe('GET /v1/audit/security', () => {
    it('should return security events', async () => {
      auditLogs.push({
        id: 'log-1',
        userId: 'user-1',
        action: 'login',
        entityType: 'session',
        entityId: 'sess-1',
        createdAt: new Date(),
      });
      auditLogs.push({
        id: 'log-2',
        userId: 'user-1',
        action: 'password_changed',
        entityType: 'user',
        entityId: 'user-1',
        createdAt: new Date(),
      });
      auditLogs.push({
        id: 'log-3',
        userId: 'user-1',
        action: 'update',
        entityType: 'issue',
        entityId: 'iss-1',
        createdAt: new Date(),
      });

      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/audit/security',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.events).toHaveLength(2);
      expect(body.events.some((e: { action: string }) => e.action === 'login')).toBe(true);
      expect(body.events.some((e: { action: string }) => e.action === 'password_changed')).toBe(true);
    });

    it('should filter by hours parameter', async () => {
      // Old security event (48 hours ago)
      auditLogs.push({
        id: 'log-old',
        userId: 'user-1',
        action: 'login',
        entityType: 'session',
        entityId: 'sess-old',
        createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
      });
      // Recent event
      auditLogs.push({
        id: 'log-new',
        userId: 'user-1',
        action: 'logout',
        entityType: 'session',
        entityId: 'sess-new',
        createdAt: new Date(),
      });

      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/audit/security?hours=24',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.events).toHaveLength(1);
      expect(body.events[0].id).toBe('log-new');
    });
  });

  // ============================================
  // FAILED LOGINS TESTS
  // ============================================

  describe('GET /v1/audit/security/failed-logins', () => {
    it('should return failed login attempts above threshold', async () => {
      // Add 6 failed logins from same IP
      for (let i = 0; i < 6; i++) {
        auditLogs.push({
          id: `log-${i}`,
          userId: `user-${i}`,
          action: 'login_failed',
          entityType: 'session',
          entityId: `sess-${i}`,
          ipAddress: '192.168.1.100',
          createdAt: new Date(),
        });
      }
      // Add 2 failed logins from different IP
      auditLogs.push({
        id: 'log-other',
        userId: 'user-other',
        action: 'login_failed',
        entityType: 'session',
        entityId: 'sess-other',
        ipAddress: '10.0.0.1',
        createdAt: new Date(),
      });

      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/audit/security/failed-logins?threshold=5',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.attempts).toHaveLength(1);
      expect(body.attempts[0].ipAddress).toBe('192.168.1.100');
      expect(body.attempts[0].count).toBe(6);
    });

    it('should return empty when below threshold', async () => {
      auditLogs.push({
        id: 'log-1',
        userId: 'user-1',
        action: 'login_failed',
        entityType: 'session',
        entityId: 'sess-1',
        ipAddress: '192.168.1.1',
        createdAt: new Date(),
      });

      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/audit/security/failed-logins?threshold=5',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.attempts).toEqual([]);
    });
  });

  // ============================================
  // SUMMARY TESTS
  // ============================================

  describe('GET /v1/audit/summary/users', () => {
    it('should return activity summary by user', async () => {
      auditLogs.push({
        id: 'log-1',
        userId: 'user-1',
        action: 'create',
        entityType: 'issue',
        entityId: 'iss-1',
        createdAt: new Date(),
      });
      auditLogs.push({
        id: 'log-2',
        userId: 'user-1',
        action: 'update',
        entityType: 'issue',
        entityId: 'iss-1',
        createdAt: new Date(),
      });
      auditLogs.push({
        id: 'log-3',
        userId: 'user-2',
        action: 'create',
        entityType: 'change',
        entityId: 'chg-1',
        createdAt: new Date(),
      });

      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/audit/summary/users',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.summary).toHaveLength(2);
      expect(body.summary.find((s: { userId: string }) => s.userId === 'user-1')?.count).toBe(2);
      expect(body.summary.find((s: { userId: string }) => s.userId === 'user-2')?.count).toBe(1);
    });
  });

  describe('GET /v1/audit/summary/entities', () => {
    it('should return activity summary by entity type', async () => {
      auditLogs.push({
        id: 'log-1',
        userId: 'user-1',
        action: 'create',
        entityType: 'issue',
        entityId: 'iss-1',
        createdAt: new Date(),
      });
      auditLogs.push({
        id: 'log-2',
        userId: 'user-1',
        action: 'update',
        entityType: 'issue',
        entityId: 'iss-2',
        createdAt: new Date(),
      });
      auditLogs.push({
        id: 'log-3',
        userId: 'user-1',
        action: 'create',
        entityType: 'change',
        entityId: 'chg-1',
        createdAt: new Date(),
      });

      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/audit/summary/entities',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.summary).toHaveLength(2);
      expect(body.summary.find((s: { entityType: string }) => s.entityType === 'issue')?.count).toBe(2);
      expect(body.summary.find((s: { entityType: string }) => s.entityType === 'change')?.count).toBe(1);
    });
  });

  // ============================================
  // SETTINGS TESTS
  // ============================================

  describe('GET /v1/audit/settings', () => {
    it('should return audit settings', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/audit/settings',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.settings.retentionDays).toBe(90);
      expect(body.settings.logReads).toBe(false);
      expect(body.settings.logExports).toBe(true);
      expect(body.settings.sensitiveFields).toContain('password');
    });
  });

  describe('PATCH /v1/audit/settings', () => {
    it('should update retention days', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'PATCH',
        url: '/v1/audit/settings',
        headers: createAuthHeader(token),
        payload: {
          retention_days: 180,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.settings.retentionDays).toBe(180);
    });

    it('should update log_reads setting', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'PATCH',
        url: '/v1/audit/settings',
        headers: createAuthHeader(token),
        payload: {
          log_reads: true,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.settings.logReads).toBe(true);
    });

    it('should update sensitive fields', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'PATCH',
        url: '/v1/audit/settings',
        headers: createAuthHeader(token),
        payload: {
          sensitive_fields: ['password', 'ssn', 'creditCard'],
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.settings.sensitiveFields).toContain('ssn');
      expect(body.settings.sensitiveFields).toContain('creditCard');
    });

    it('should reject invalid retention days (too low)', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'PATCH',
        url: '/v1/audit/settings',
        headers: createAuthHeader(token),
        payload: {
          retention_days: 10,
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should reject invalid retention days (too high)', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'PATCH',
        url: '/v1/audit/settings',
        headers: createAuthHeader(token),
        payload: {
          retention_days: 500,
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  // ============================================
  // CLEANUP TESTS
  // ============================================

  describe('POST /v1/audit/cleanup', () => {
    it('should delete logs older than retention period', async () => {
      // Add old log (older than 90 days)
      auditLogs.push({
        id: 'log-old',
        userId: 'user-1',
        action: 'create',
        entityType: 'issue',
        entityId: 'iss-old',
        createdAt: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000),
      });
      // Add recent log
      auditLogs.push({
        id: 'log-new',
        userId: 'user-1',
        action: 'update',
        entityType: 'issue',
        entityId: 'iss-new',
        createdAt: new Date(),
      });

      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'POST',
        url: '/v1/audit/cleanup',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.deletedCount).toBe(1);
      expect(auditLogs).toHaveLength(1);
      expect(auditLogs[0].id).toBe('log-new');
    });

    it('should return 0 when no old logs exist', async () => {
      auditLogs.push({
        id: 'log-new',
        userId: 'user-1',
        action: 'create',
        entityType: 'issue',
        entityId: 'iss-1',
        createdAt: new Date(),
      });

      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'POST',
        url: '/v1/audit/cleanup',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.deletedCount).toBe(0);
    });
  });
});
