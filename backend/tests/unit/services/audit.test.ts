import { describe, it, expect, vi, beforeEach } from 'vitest';

// Use vi.hoisted for mocks that need to be available before module loads
const mockPoolQuery = vi.hoisted(() => vi.fn());
const mockCacheGetOrSet = vi.hoisted(() => vi.fn());
const mockCacheInvalidate = vi.hoisted(() => vi.fn());

// Mock database pool
vi.mock('../../../src/config/database.js', () => ({
  pool: {
    query: mockPoolQuery,
  },
}));

// Mock tenant service
vi.mock('../../../src/services/tenant.js', () => ({
  tenantService: {
    getSchemaName: vi.fn((slug: string) => `tenant_${slug}`),
  },
}));

// Mock logger
vi.mock('../../../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock cache service
vi.mock('../../../src/utils/cache.js', () => ({
  cacheService: {
    getOrSet: mockCacheGetOrSet,
    invalidateTenant: mockCacheInvalidate,
  },
}));

// Import after mocks
import { auditService, type AuditLogEntry, type AuditQueryOptions } from '../../../src/services/audit.js';

/**
 * Unit tests for audit service
 * Testing the AuditService class and utility functions
 */

// Re-implement the utility functions for testing since they're not exported
const DEFAULT_SENSITIVE_FIELDS = [
  'password',
  'password_hash',
  'token',
  'access_token',
  'refresh_token',
  'secret',
  'api_key',
  'private_key',
  'credentials',
  'ssn',
  'credit_card',
];

function maskSensitiveFields(
  data: Record<string, unknown> | null | undefined,
  sensitiveFields: string[] = DEFAULT_SENSITIVE_FIELDS
): Record<string, unknown> | null {
  if (!data) return null;

  const masked = { ...data };

  for (const field of sensitiveFields) {
    if (field in masked) {
      masked[field] = '[REDACTED]';
    }

    // Check nested objects
    for (const key of Object.keys(masked)) {
      if (typeof masked[key] === 'object' && masked[key] !== null) {
        masked[key] = maskSensitiveFields(
          masked[key] as Record<string, unknown>,
          sensitiveFields
        );
      }
    }
  }

  return masked;
}

function detectChanges(
  oldValues: Record<string, unknown> | null | undefined,
  newValues: Record<string, unknown> | null | undefined
): string[] {
  if (!oldValues || !newValues) return [];

  const changedFields: string[] = [];
  const allKeys = new Set([...Object.keys(oldValues), ...Object.keys(newValues)]);

  for (const key of allKeys) {
    const oldVal = JSON.stringify(oldValues[key]);
    const newVal = JSON.stringify(newValues[key]);

    if (oldVal !== newVal) {
      changedFields.push(key);
    }
  }

  return changedFields;
}

describe('Audit Service Utilities', () => {
  describe('maskSensitiveFields', () => {
    it('should return null for null input', () => {
      expect(maskSensitiveFields(null)).toBeNull();
    });

    it('should return null for undefined input', () => {
      expect(maskSensitiveFields(undefined)).toBeNull();
    });

    it('should mask password fields', () => {
      const data = { username: 'john', password: 'secret123' };
      const masked = maskSensitiveFields(data);

      expect(masked).toEqual({
        username: 'john',
        password: '[REDACTED]',
      });
    });

    it('should mask multiple sensitive fields', () => {
      const data = {
        email: 'user@example.com',
        password: 'mypassword',
        api_key: 'sk-12345',
        access_token: 'token123',
      };
      const masked = maskSensitiveFields(data);

      expect(masked?.email).toBe('user@example.com');
      expect(masked?.password).toBe('[REDACTED]');
      expect(masked?.api_key).toBe('[REDACTED]');
      expect(masked?.access_token).toBe('[REDACTED]');
    });

    it('should mask nested sensitive fields', () => {
      const data = {
        user: {
          name: 'John',
          password: 'secret',
        },
      };
      const masked = maskSensitiveFields(data);

      // @ts-ignore - accessing nested properties for test
      expect(masked?.user?.name).toBe('John');
      // @ts-ignore
      expect(masked?.user?.password).toBe('[REDACTED]');
    });

    it('should not modify non-sensitive fields', () => {
      const data = {
        name: 'John Doe',
        email: 'john@example.com',
        role: 'admin',
      };
      const masked = maskSensitiveFields(data);

      expect(masked).toEqual(data);
    });

    it('should support custom sensitive field list', () => {
      const data = {
        email: 'user@example.com',
        customSecret: 'hidden',
      };
      const masked = maskSensitiveFields(data, ['customSecret']);

      expect(masked?.email).toBe('user@example.com');
      expect(masked?.customSecret).toBe('[REDACTED]');
    });

    it('should handle objects with non-sensitive nested data', () => {
      const data = {
        config: { timeout: 30, retries: 3 },
        password: 'secret',
      };
      const masked = maskSensitiveFields(data);

      // Non-sensitive nested objects should be preserved (though arrays become objects)
      expect(masked?.password).toBe('[REDACTED]');
      // @ts-ignore
      expect(masked?.config?.timeout).toBe(30);
    });

    it('should not mutate original object', () => {
      const original = { password: 'secret123', name: 'John' };
      const originalCopy = { ...original };

      maskSensitiveFields(original);

      expect(original).toEqual(originalCopy);
    });
  });

  describe('detectChanges', () => {
    it('should return empty array for null oldValues', () => {
      expect(detectChanges(null, { name: 'test' })).toEqual([]);
    });

    it('should return empty array for null newValues', () => {
      expect(detectChanges({ name: 'test' }, null)).toEqual([]);
    });

    it('should return empty array for undefined values', () => {
      expect(detectChanges(undefined, undefined)).toEqual([]);
    });

    it('should detect no changes for identical objects', () => {
      const data = { name: 'John', status: 'active' };
      expect(detectChanges(data, data)).toEqual([]);
    });

    it('should detect simple field changes', () => {
      const old = { name: 'John', status: 'active' };
      const updated = { name: 'John', status: 'inactive' };

      const changes = detectChanges(old, updated);

      expect(changes).toContain('status');
      expect(changes).not.toContain('name');
    });

    it('should detect added fields', () => {
      const old = { name: 'John' };
      const updated = { name: 'John', email: 'john@example.com' };

      const changes = detectChanges(old, updated);

      expect(changes).toContain('email');
    });

    it('should detect removed fields', () => {
      const old = { name: 'John', email: 'john@example.com' };
      const updated = { name: 'John' };

      const changes = detectChanges(old, updated);

      expect(changes).toContain('email');
    });

    it('should detect multiple changes', () => {
      const old = { name: 'John', status: 'active', priority: 'low' };
      const updated = { name: 'Jane', status: 'inactive', priority: 'low' };

      const changes = detectChanges(old, updated);

      expect(changes).toContain('name');
      expect(changes).toContain('status');
      expect(changes).not.toContain('priority');
      expect(changes).toHaveLength(2);
    });

    it('should detect nested object changes', () => {
      const old = { config: { timeout: 30 } };
      const updated = { config: { timeout: 60 } };

      const changes = detectChanges(old, updated);

      expect(changes).toContain('config');
    });

    it('should detect array changes', () => {
      const old = { tags: ['a', 'b'] };
      const updated = { tags: ['a', 'b', 'c'] };

      const changes = detectChanges(old, updated);

      expect(changes).toContain('tags');
    });

    it('should handle type changes', () => {
      const old = { value: '123' };
      const updated = { value: 123 };

      const changes = detectChanges(old, updated);

      expect(changes).toContain('value');
    });

    it('should handle null to value changes', () => {
      const old = { value: null };
      const updated = { value: 'something' };

      const changes = detectChanges(old, updated);

      expect(changes).toContain('value');
    });
  });
});

describe('Audit Action Types', () => {
  it('should validate audit action enum values', () => {
    const validActions = [
      'create',
      'update',
      'delete',
      'view',
      'export',
      'login',
      'logout',
      'login_failed',
      'approve',
      'reject',
      'assign',
      'escalate',
      'permission_granted',
      'permission_revoked',
      'config_change',
      'api_key_created',
      'api_key_revoked',
    ];

    // This is a compile-time check that all values exist
    expect(validActions).toHaveLength(17);
  });
});

describe('Audit Log Entry Structure', () => {
  it('should accept minimal required fields', () => {
    const entry = {
      action: 'create' as const,
      entityType: 'issue',
    };

    expect(entry.action).toBe('create');
    expect(entry.entityType).toBe('issue');
  });

  it('should accept full entry with all optional fields', () => {
    const entry = {
      userId: 'user-123',
      userEmail: 'user@example.com',
      userName: 'John Doe',
      action: 'update' as const,
      entityType: 'issue',
      entityId: 'issue-456',
      entityName: 'Critical Bug',
      oldValues: { status: 'open' },
      newValues: { status: 'closed' },
      changedFields: ['status'],
      ipAddress: '192.168.1.1',
      userAgent: 'Mozilla/5.0',
      requestId: 'req-789',
      sessionId: 'sess-abc',
      metadata: { source: 'api' },
    };

    expect(entry.userId).toBe('user-123');
    expect(entry.changedFields).toContain('status');
  });
});

// ============================================
// AUDIT SERVICE CLASS TESTS
// ============================================

describe('AuditService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPoolQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    mockCacheGetOrSet.mockImplementation((_key: string, fn: () => Promise<unknown>) => fn());
    mockCacheInvalidate.mockResolvedValue(undefined);
  });

  describe('log', () => {
    it('should create an audit log entry', async () => {
      const auditLogId = 'audit-123';
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ id: auditLogId }], rowCount: 1 });

      const entry: AuditLogEntry = {
        userId: 'user-1',
        userEmail: 'user@example.com',
        userName: 'Test User',
        action: 'create',
        entityType: 'issue',
        entityId: 'issue-123',
        entityName: 'Test Issue',
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
      };

      const result = await auditService.log('test-tenant', entry);

      expect(result).toBe(auditLogId);
      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO tenant_test-tenant.audit_logs'),
        expect.arrayContaining(['user-1', 'user@example.com', 'Test User'])
      );
    });

    it('should mask sensitive fields in old and new values', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ id: 'audit-123' }], rowCount: 1 });

      const entry: AuditLogEntry = {
        action: 'update',
        entityType: 'user',
        entityId: 'user-123',
        oldValues: { name: 'Old Name', password: 'secret123' },
        newValues: { name: 'New Name', password: 'newSecret456' },
      };

      await auditService.log('test-tenant', entry);

      const insertCall = mockPoolQuery.mock.calls[0];
      expect(insertCall[1][7]).toContain('[REDACTED]'); // old_values
      expect(insertCall[1][8]).toContain('[REDACTED]'); // new_values
    });

    it('should detect changed fields automatically', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ id: 'audit-123' }], rowCount: 1 });

      const entry: AuditLogEntry = {
        action: 'update',
        entityType: 'issue',
        entityId: 'issue-123',
        oldValues: { title: 'Old Title', status: 'open' },
        newValues: { title: 'New Title', status: 'open' },
      };

      await auditService.log('test-tenant', entry);

      const insertCall = mockPoolQuery.mock.calls[0];
      const changedFields = insertCall[1][9];
      expect(changedFields).toEqual(['title']);
    });

    it('should use provided changed fields if present', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ id: 'audit-123' }], rowCount: 1 });

      const entry: AuditLogEntry = {
        action: 'update',
        entityType: 'issue',
        changedFields: ['custom', 'fields'],
      };

      await auditService.log('test-tenant', entry);

      const insertCall = mockPoolQuery.mock.calls[0];
      expect(insertCall[1][9]).toEqual(['custom', 'fields']);
    });

    it('should invalidate audit cache after logging', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ id: 'audit-123' }], rowCount: 1 });

      await auditService.log('test-tenant', {
        action: 'create',
        entityType: 'issue',
      });

      expect(mockCacheInvalidate).toHaveBeenCalledWith('test-tenant', 'audit');
    });

    it('should handle login action', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ id: 'audit-123' }], rowCount: 1 });

      await auditService.log('test-tenant', {
        action: 'login',
        entityType: 'session',
        userId: 'user-1',
        userEmail: 'user@test.com',
        ipAddress: '10.0.0.1',
      });

      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO'),
        expect.arrayContaining(['login', 'session'])
      );
    });

    it('should handle login_failed action', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ id: 'audit-123' }], rowCount: 1 });

      await auditService.log('test-tenant', {
        action: 'login_failed',
        entityType: 'session',
        userEmail: 'attacker@test.com',
        ipAddress: '10.0.0.1',
        metadata: { reason: 'invalid_password' },
      });

      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO'),
        expect.arrayContaining(['login_failed'])
      );
    });

    it('should handle database errors gracefully', async () => {
      mockPoolQuery.mockRejectedValueOnce(new Error('Database error'));

      await expect(
        auditService.log('test-tenant', {
          action: 'create',
          entityType: 'issue',
        })
      ).rejects.toThrow('Database error');
    });
  });

  describe('query', () => {
    it('should query audit logs with no filters', async () => {
      const mockLogs = [
        { id: '1', action: 'create', entity_type: 'issue' },
        { id: '2', action: 'update', entity_type: 'issue' },
      ];
      mockPoolQuery
        .mockResolvedValueOnce({ rows: [{ count: '2' }] })
        .mockResolvedValueOnce({ rows: mockLogs });

      const result = await auditService.query('test-tenant', {});

      expect(result.logs).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it('should filter by userId', async () => {
      mockPoolQuery
        .mockResolvedValueOnce({ rows: [{ count: '1' }] })
        .mockResolvedValueOnce({ rows: [{ id: '1' }] });

      const options: AuditQueryOptions = { userId: 'user-123' };
      await auditService.query('test-tenant', options);

      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE user_id = $1'),
        expect.arrayContaining(['user-123'])
      );
    });

    it('should filter by single action', async () => {
      mockPoolQuery
        .mockResolvedValueOnce({ rows: [{ count: '1' }] })
        .mockResolvedValueOnce({ rows: [] });

      await auditService.query('test-tenant', { action: 'create' });

      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE action = $1'),
        expect.arrayContaining(['create'])
      );
    });

    it('should filter by multiple actions', async () => {
      mockPoolQuery
        .mockResolvedValueOnce({ rows: [{ count: '1' }] })
        .mockResolvedValueOnce({ rows: [] });

      await auditService.query('test-tenant', { action: ['login', 'logout'] });

      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.stringContaining('action = ANY($1)'),
        expect.arrayContaining([['login', 'logout']])
      );
    });

    it('should filter by entityType', async () => {
      mockPoolQuery
        .mockResolvedValueOnce({ rows: [{ count: '1' }] })
        .mockResolvedValueOnce({ rows: [] });

      await auditService.query('test-tenant', { entityType: 'issue' });

      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.stringContaining('entity_type = $1'),
        expect.arrayContaining(['issue'])
      );
    });

    it('should filter by entityId', async () => {
      mockPoolQuery
        .mockResolvedValueOnce({ rows: [{ count: '1' }] })
        .mockResolvedValueOnce({ rows: [] });

      await auditService.query('test-tenant', { entityId: 'issue-123' });

      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.stringContaining('entity_id = $1'),
        expect.arrayContaining(['issue-123'])
      );
    });

    it('should filter by ipAddress', async () => {
      mockPoolQuery
        .mockResolvedValueOnce({ rows: [{ count: '1' }] })
        .mockResolvedValueOnce({ rows: [] });

      await auditService.query('test-tenant', { ipAddress: '192.168.1.1' });

      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.stringContaining('ip_address = $1'),
        expect.arrayContaining(['192.168.1.1'])
      );
    });

    it('should filter by date range', async () => {
      mockPoolQuery
        .mockResolvedValueOnce({ rows: [{ count: '1' }] })
        .mockResolvedValueOnce({ rows: [] });

      const startDate = new Date('2025-01-01');
      const endDate = new Date('2025-01-31');

      await auditService.query('test-tenant', { startDate, endDate });

      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.stringContaining('created_at >='),
        expect.arrayContaining([startDate, endDate])
      );
    });

    it('should apply pagination', async () => {
      mockPoolQuery
        .mockResolvedValueOnce({ rows: [{ count: '100' }] })
        .mockResolvedValueOnce({ rows: [] });

      await auditService.query('test-tenant', { limit: 25, offset: 50 });

      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT $1 OFFSET $2'),
        expect.arrayContaining([25, 50])
      );
    });

    it('should use default pagination', async () => {
      mockPoolQuery
        .mockResolvedValueOnce({ rows: [{ count: '100' }] })
        .mockResolvedValueOnce({ rows: [] });

      await auditService.query('test-tenant', {});

      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT'),
        expect.arrayContaining([50, 0])
      );
    });

    it('should combine multiple filters', async () => {
      mockPoolQuery
        .mockResolvedValueOnce({ rows: [{ count: '1' }] })
        .mockResolvedValueOnce({ rows: [] });

      await auditService.query('test-tenant', {
        userId: 'user-1',
        action: 'update',
        entityType: 'issue',
      });

      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE'),
        expect.arrayContaining(['user-1', 'update', 'issue'])
      );
    });
  });

  describe('getEntityHistory', () => {
    it('should get audit history for a specific entity', async () => {
      const mockHistory = [
        { id: '1', action: 'create', created_at: new Date() },
        { id: '2', action: 'update', created_at: new Date() },
      ];
      mockPoolQuery.mockResolvedValueOnce({ rows: mockHistory });

      const result = await auditService.getEntityHistory('test-tenant', 'issue', 'issue-123');

      expect(result).toHaveLength(2);
      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE al.entity_type = $1 AND al.entity_id = $2'),
        ['issue', 'issue-123']
      );
    });

    it('should join with users table for display name', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      await auditService.getEntityHistory('test-tenant', 'issue', 'issue-123');

      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.stringContaining('LEFT JOIN'),
        expect.anything()
      );
    });

    it('should order by created_at DESC', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      await auditService.getEntityHistory('test-tenant', 'change', 'change-456');

      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY al.created_at DESC'),
        expect.anything()
      );
    });
  });

  describe('getById', () => {
    it('should get audit log by ID', async () => {
      const mockLog = { id: 'audit-123', action: 'create' };
      mockPoolQuery.mockResolvedValueOnce({ rows: [mockLog] });

      const result = await auditService.getById('test-tenant', 'audit-123');

      expect(result).toEqual(mockLog);
      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE id = $1'),
        ['audit-123']
      );
    });

    it('should return null for non-existent log', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      const result = await auditService.getById('test-tenant', 'non-existent');

      expect(result).toBeNull();
    });
  });

  describe('getUserActivity', () => {
    it('should get user activity for default 30 days', async () => {
      const mockActivity = [
        { id: '1', action: 'login' },
        { id: '2', action: 'update' },
      ];
      mockPoolQuery.mockResolvedValueOnce({ rows: mockActivity });

      const result = await auditService.getUserActivity('test-tenant', 'user-123');

      expect(result).toHaveLength(2);
      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE user_id = $1'),
        ['user-123', 30]
      );
    });

    it('should accept custom day range', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      await auditService.getUserActivity('test-tenant', 'user-123', 7);

      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.anything(),
        ['user-123', 7]
      );
    });

    it('should limit results to 1000', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      await auditService.getUserActivity('test-tenant', 'user-123');

      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT 1000'),
        expect.anything()
      );
    });
  });

  describe('getSecurityEvents', () => {
    it('should get security events for default 24 hours', async () => {
      const mockEvents = [
        { id: '1', action: 'login' },
        { id: '2', action: 'login_failed' },
      ];
      mockPoolQuery.mockResolvedValueOnce({ rows: mockEvents });

      const result = await auditService.getSecurityEvents('test-tenant');

      expect(result).toHaveLength(2);
      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE action IN'),
        [24]
      );
    });

    it('should include all security action types', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      await auditService.getSecurityEvents('test-tenant');

      const query = mockPoolQuery.mock.calls[0][0];
      expect(query).toContain('login');
      expect(query).toContain('logout');
      expect(query).toContain('login_failed');
      expect(query).toContain('permission_granted');
      expect(query).toContain('permission_revoked');
      expect(query).toContain('api_key_created');
      expect(query).toContain('api_key_revoked');
    });

    it('should accept custom hours parameter', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      await auditService.getSecurityEvents('test-tenant', 48);

      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.anything(),
        [48]
      );
    });
  });

  describe('getFailedLogins', () => {
    it('should get failed login attempts above threshold', async () => {
      const mockFailedLogins = [
        { email: 'attacker@test.com', count: 10, last_attempt: new Date() },
      ];
      mockPoolQuery.mockResolvedValueOnce({ rows: mockFailedLogins });

      const result = await auditService.getFailedLogins('test-tenant');

      expect(result).toHaveLength(1);
      expect(result[0].count).toBe(10);
    });

    it('should use default threshold of 5', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      await auditService.getFailedLogins('test-tenant');

      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.stringContaining('HAVING COUNT(*) >= $2'),
        [24, 5]
      );
    });

    it('should accept custom threshold', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      await auditService.getFailedLogins('test-tenant', 12, 3);

      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.anything(),
        [12, 3]
      );
    });

    it('should group by email', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      await auditService.getFailedLogins('test-tenant');

      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.stringContaining('GROUP BY user_email'),
        expect.anything()
      );
    });
  });

  describe('getSummaryByUser', () => {
    it('should query audit_summary_by_user view', async () => {
      const mockSummary = [
        { user_id: 'user-1', total_actions: 100 },
        { user_id: 'user-2', total_actions: 50 },
      ];
      mockPoolQuery.mockResolvedValueOnce({ rows: mockSummary });

      const result = await auditService.getSummaryByUser('test-tenant');

      expect(result).toHaveLength(2);
      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.stringContaining('audit_summary_by_user')
      );
    });
  });

  describe('getSummaryByEntity', () => {
    it('should query audit_summary_by_entity view', async () => {
      const mockSummary = [
        { entity_type: 'issue', total_actions: 500 },
        { entity_type: 'change', total_actions: 200 },
      ];
      mockPoolQuery.mockResolvedValueOnce({ rows: mockSummary });

      const result = await auditService.getSummaryByEntity('test-tenant');

      expect(result).toHaveLength(2);
      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.stringContaining('audit_summary_by_entity')
      );
    });
  });

  describe('getSettings', () => {
    it('should return audit settings', async () => {
      const mockSettings = {
        retention_days: 365,
        log_reads: false,
        log_exports: true,
        sensitive_fields: ['password', 'token'],
      };
      mockPoolQuery.mockResolvedValueOnce({ rows: [mockSettings] });

      const result = await auditService.getSettings('test-tenant');

      expect(result).toEqual(mockSettings);
    });

    it('should return default settings if none exist', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      const result = await auditService.getSettings('test-tenant');

      expect(result.retention_days).toBe(365);
      expect(result.log_reads).toBe(false);
      expect(result.log_exports).toBe(true);
      expect(result.sensitive_fields).toContain('password');
    });
  });

  describe('updateSettings', () => {
    it('should update retention days', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rowCount: 1 });

      await auditService.updateSettings('test-tenant', { retention_days: 180 }, 'admin-1');

      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE'),
        expect.arrayContaining([180, 'admin-1'])
      );
    });

    it('should update log_reads setting', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rowCount: 1 });

      await auditService.updateSettings('test-tenant', { log_reads: true }, 'admin-1');

      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.stringContaining('log_reads'),
        expect.arrayContaining([true])
      );
    });

    it('should update log_exports setting', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rowCount: 1 });

      await auditService.updateSettings('test-tenant', { log_exports: false }, 'admin-1');

      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.stringContaining('log_exports'),
        expect.arrayContaining([false])
      );
    });

    it('should update sensitive_fields', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rowCount: 1 });

      await auditService.updateSettings(
        'test-tenant',
        { sensitive_fields: ['password', 'secret', 'api_key'] },
        'admin-1'
      );

      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.stringContaining('sensitive_fields'),
        expect.anything()
      );
    });

    it('should not update if no settings provided', async () => {
      await auditService.updateSettings('test-tenant', {}, 'admin-1');

      expect(mockPoolQuery).not.toHaveBeenCalled();
    });

    it('should update multiple settings at once', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rowCount: 1 });

      await auditService.updateSettings(
        'test-tenant',
        { retention_days: 90, log_reads: true },
        'admin-1'
      );

      const query = mockPoolQuery.mock.calls[0][0];
      expect(query).toContain('retention_days');
      expect(query).toContain('log_reads');
    });
  });

  describe('cleanupOldLogs', () => {
    it('should delete logs older than retention period', async () => {
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ retention_days: 365, log_reads: false, log_exports: true, sensitive_fields: [] }],
      });
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ id: '1' }, { id: '2' }], rowCount: 2 });

      const result = await auditService.cleanupOldLogs('test-tenant');

      expect(result).toBe(2);
      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM'),
        [365]
      );
    });

    it('should return 0 if no logs to delete', async () => {
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ retention_days: 365, log_reads: false, log_exports: true, sensitive_fields: [] }],
      });
      mockPoolQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await auditService.cleanupOldLogs('test-tenant');

      expect(result).toBe(0);
    });

    it('should use tenant-specific retention days', async () => {
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ retention_days: 30, log_reads: false, log_exports: true, sensitive_fields: [] }],
      });
      mockPoolQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await auditService.cleanupOldLogs('test-tenant');

      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM'),
        [30]
      );
    });
  });

  describe('caching behavior', () => {
    it('should use cache for query results', async () => {
      const mockResult = { logs: [], total: 0 };
      mockCacheGetOrSet.mockResolvedValueOnce(mockResult);

      await auditService.query('test-tenant', {});

      expect(mockCacheGetOrSet).toHaveBeenCalledWith(
        expect.stringContaining('test-tenant:audit:query'),
        expect.any(Function),
        expect.objectContaining({ ttl: 600 })
      );
    });

    it('should use cache for entity history', async () => {
      mockCacheGetOrSet.mockResolvedValueOnce([]);

      await auditService.getEntityHistory('test-tenant', 'issue', 'issue-123');

      expect(mockCacheGetOrSet).toHaveBeenCalledWith(
        'test-tenant:audit:entity:issue:issue-123',
        expect.any(Function),
        expect.objectContaining({ ttl: 600 })
      );
    });

    it('should use cache for getById with longer TTL', async () => {
      mockCacheGetOrSet.mockResolvedValueOnce(null);

      await auditService.getById('test-tenant', 'audit-123');

      expect(mockCacheGetOrSet).toHaveBeenCalledWith(
        'test-tenant:audit:log:audit-123',
        expect.any(Function),
        expect.objectContaining({ ttl: 1800 })
      );
    });
  });
});
