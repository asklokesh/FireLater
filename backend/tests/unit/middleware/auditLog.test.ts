import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FastifyRequest, FastifyReply } from 'fastify';

// Mock logger
vi.mock('../../../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock auditService
const mockAuditLog = vi.fn();
vi.mock('../../../src/services/audit.js', () => ({
  auditService: {
    log: (...args: unknown[]) => mockAuditLog(...args),
  },
}));

import {
  auditLog,
  logAuditEvent,
  auditCreate,
  auditUpdate,
  auditDelete,
  auditView,
  createAuditLog,
} from '../../../src/middleware/auditLog.js';
import { logger } from '../../../src/utils/logger.js';

describe('AuditLog Middleware', () => {
  const createMockRequest = (overrides: Partial<FastifyRequest> = {}): FastifyRequest => ({
    id: 'req-123',
    ip: '192.168.1.1',
    headers: { 'user-agent': 'Mozilla/5.0' },
    params: {},
    body: {},
    user: {
      tenantSlug: 'test-tenant',
      userId: 'user-123',
      email: 'user@example.com',
    },
    ...overrides,
  } as unknown as FastifyRequest);

  const mockReply = {} as FastifyReply;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAuditLog.mockResolvedValue(undefined);
  });

  describe('auditLog', () => {
    it('should store audit options on request', async () => {
      const options = {
        action: 'create' as const,
        entityType: 'issue',
      };

      const middleware = auditLog(options);
      const request = createMockRequest();

      await middleware(request, mockReply);

      expect((request as unknown as { _auditOptions: unknown })._auditOptions).toEqual(options);
    });

    it('should return a function', () => {
      const middleware = auditLog({
        action: 'update' as const,
        entityType: 'change',
      });

      expect(typeof middleware).toBe('function');
    });
  });

  describe('logAuditEvent', () => {
    it('should log audit event with correct parameters', async () => {
      const request = createMockRequest({
        params: { id: 'entity-456' },
        body: { name: 'Test Entity' },
      });

      const options = {
        action: 'create' as const,
        entityType: 'issue',
        getEntityId: (req: FastifyRequest) => (req.params as { id?: string }).id,
        getNewValues: (req: FastifyRequest) => req.body as Record<string, unknown>,
      };

      await logAuditEvent(request, options);

      expect(mockAuditLog).toHaveBeenCalledWith('test-tenant', {
        userId: 'user-123',
        userEmail: 'user@example.com',
        action: 'create',
        entityType: 'issue',
        entityId: 'entity-456',
        entityName: undefined,
        oldValues: undefined,
        newValues: { name: 'Test Entity' },
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        requestId: 'req-123',
        metadata: undefined,
      });
    });

    it('should use extra values over option getters', async () => {
      const request = createMockRequest({
        params: { id: 'entity-456' },
      });

      const options = {
        action: 'update' as const,
        entityType: 'change',
        getEntityId: () => 'from-getter',
      };

      await logAuditEvent(request, options, {
        entityId: 'from-extra',
        entityName: 'Extra Name',
        oldValues: { status: 'old' },
        newValues: { status: 'new' },
      });

      expect(mockAuditLog).toHaveBeenCalledWith('test-tenant', expect.objectContaining({
        entityId: 'from-extra',
        entityName: 'Extra Name',
        oldValues: { status: 'old' },
        newValues: { status: 'new' },
      }));
    });

    it('should not log if user has no tenantSlug', async () => {
      const request = createMockRequest({
        user: undefined,
      } as unknown as Partial<FastifyRequest>);

      await logAuditEvent(request, {
        action: 'view' as const,
        entityType: 'asset',
      });

      expect(mockAuditLog).not.toHaveBeenCalled();
    });

    it('should handle metadata from options', async () => {
      const request = createMockRequest();

      const options = {
        action: 'delete' as const,
        entityType: 'problem',
        getMetadata: () => ({ reason: 'cleanup', force: true }),
      };

      await logAuditEvent(request, options);

      expect(mockAuditLog).toHaveBeenCalledWith('test-tenant', expect.objectContaining({
        metadata: { reason: 'cleanup', force: true },
      }));
    });

    it('should log error and not throw on audit service failure', async () => {
      mockAuditLog.mockRejectedValue(new Error('Audit service failed'));

      const request = createMockRequest();

      // Should not throw
      await expect(logAuditEvent(request, {
        action: 'view' as const,
        entityType: 'user',
      })).resolves.not.toThrow();

      expect(logger.error).toHaveBeenCalledWith(
        { err: expect.any(Error) },
        'Failed to log audit event'
      );
    });
  });

  describe('auditCreate', () => {
    it('should create middleware with create action', async () => {
      const middleware = auditCreate('issue');
      const request = createMockRequest({ params: { id: 'issue-1' } });

      await middleware(request, mockReply);

      const storedOptions = (request as unknown as { _auditOptions: unknown })._auditOptions;
      expect(storedOptions).toEqual(expect.objectContaining({
        action: 'create',
        entityType: 'issue',
      }));
    });

    it('should extract entity ID from params', async () => {
      const middleware = auditCreate('request');
      const request = createMockRequest({ params: { id: 'req-999' } });

      await middleware(request, mockReply);

      const options = (request as unknown as { _auditOptions: { getEntityId: (r: FastifyRequest) => string | undefined } })._auditOptions;
      expect(options.getEntityId(request)).toBe('req-999');
    });

    it('should extract new values from body', async () => {
      const middleware = auditCreate('change');
      const request = createMockRequest({
        body: { title: 'New Change', priority: 'high' },
      });

      await middleware(request, mockReply);

      const options = (request as unknown as { _auditOptions: { getNewValues: (r: FastifyRequest) => Record<string, unknown> | undefined } })._auditOptions;
      expect(options.getNewValues(request)).toEqual({ title: 'New Change', priority: 'high' });
    });
  });

  describe('auditUpdate', () => {
    it('should create middleware with update action', async () => {
      const middleware = auditUpdate('problem');
      const request = createMockRequest();

      await middleware(request, mockReply);

      const storedOptions = (request as unknown as { _auditOptions: { action: string } })._auditOptions;
      expect(storedOptions.action).toBe('update');
    });
  });

  describe('auditDelete', () => {
    it('should create middleware with delete action', async () => {
      const middleware = auditDelete('asset');
      const request = createMockRequest();

      await middleware(request, mockReply);

      const storedOptions = (request as unknown as { _auditOptions: { action: string; entityType: string } })._auditOptions;
      expect(storedOptions.action).toBe('delete');
      expect(storedOptions.entityType).toBe('asset');
    });
  });

  describe('auditView', () => {
    it('should create middleware with view action', async () => {
      const middleware = auditView('knowledge');
      const request = createMockRequest({ params: { id: 'article-789' } });

      await middleware(request, mockReply);

      const storedOptions = (request as unknown as { _auditOptions: { action: string; entityType: string } })._auditOptions;
      expect(storedOptions.action).toBe('view');
      expect(storedOptions.entityType).toBe('knowledge');
    });
  });

  describe('createAuditLog', () => {
    it('should directly log audit event', async () => {
      const request = createMockRequest();

      await createAuditLog(request, 'create', 'issue', {
        entityId: 'issue-100',
        entityName: 'Test Issue',
        newValues: { status: 'new' },
      });

      expect(mockAuditLog).toHaveBeenCalledWith('test-tenant', {
        userId: 'user-123',
        userEmail: 'user@example.com',
        action: 'create',
        entityType: 'issue',
        entityId: 'issue-100',
        entityName: 'Test Issue',
        oldValues: undefined,
        newValues: { status: 'new' },
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        requestId: 'req-123',
        metadata: undefined,
      });
    });

    it('should handle all option types', async () => {
      const request = createMockRequest();

      await createAuditLog(request, 'update', 'change', {
        entityId: 'change-50',
        entityName: 'Server Migration',
        oldValues: { status: 'pending' },
        newValues: { status: 'approved' },
        metadata: { approver: 'admin', reason: 'Urgent' },
      });

      expect(mockAuditLog).toHaveBeenCalledWith('test-tenant', expect.objectContaining({
        action: 'update',
        entityType: 'change',
        oldValues: { status: 'pending' },
        newValues: { status: 'approved' },
        metadata: { approver: 'admin', reason: 'Urgent' },
      }));
    });

    it('should not log if user has no tenantSlug', async () => {
      const request = createMockRequest({
        user: undefined,
      } as unknown as Partial<FastifyRequest>);

      await createAuditLog(request, 'delete', 'user');

      expect(mockAuditLog).not.toHaveBeenCalled();
    });

    it('should handle empty options', async () => {
      const request = createMockRequest();

      await createAuditLog(request, 'view', 'dashboard');

      expect(mockAuditLog).toHaveBeenCalledWith('test-tenant', expect.objectContaining({
        action: 'view',
        entityType: 'dashboard',
        entityId: undefined,
        entityName: undefined,
        oldValues: undefined,
        newValues: undefined,
        metadata: undefined,
      }));
    });

    it('should log error and not throw on failure', async () => {
      mockAuditLog.mockRejectedValue(new Error('Database error'));

      const request = createMockRequest();

      await expect(createAuditLog(request, 'create', 'notification')).resolves.not.toThrow();

      expect(logger.error).toHaveBeenCalledWith(
        { err: expect.any(Error) },
        'Failed to create audit log'
      );
    });

    it('should use request IP and user agent', async () => {
      const request = createMockRequest({
        ip: '10.0.0.1',
        headers: { 'user-agent': 'Custom Agent/1.0' },
      });

      await createAuditLog(request, 'view', 'report');

      expect(mockAuditLog).toHaveBeenCalledWith('test-tenant', expect.objectContaining({
        ipAddress: '10.0.0.1',
        userAgent: 'Custom Agent/1.0',
      }));
    });
  });
});
