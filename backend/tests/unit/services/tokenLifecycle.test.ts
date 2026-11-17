import { describe, it, expect, vi, beforeEach } from 'vitest';
import bcrypt from 'bcrypt';

/**
 * Token lifecycle: rotation, revocation list (Redis, TTL), session tracking,
 * device binding, reuse detection and audit events.
 */

const mockQuery = vi.fn();
vi.mock('../../../src/config/database.js', () => ({
  pool: { query: (...args: unknown[]) => mockQuery(...args) },
}));

const redisData = new Map<string, string>();
const redisTtl = new Map<string, number>();
vi.mock('../../../src/config/redis.js', () => ({
  redis: {
    get: vi.fn((key: string) => Promise.resolve(redisData.get(key) ?? null)),
    setex: vi.fn((key: string, ttl: number, value: string) => {
      redisData.set(key, value);
      redisTtl.set(key, ttl);
      return Promise.resolve('OK');
    }),
    del: vi.fn(() => Promise.resolve(1)),
  },
}));

vi.mock('../../../src/services/tenant.js', () => ({
  tenantService: {
    findBySlug: vi.fn(),
    getSchemaName: vi.fn(),
  },
}));

vi.mock('../../../src/services/email.js', () => ({
  emailService: {},
}));

const auditLog = vi.fn().mockResolvedValue('audit-id');
vi.mock('../../../src/services/audit.js', () => ({
  auditService: { log: (...args: unknown[]) => auditLog(...args) },
}));

vi.mock('../../../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { AuthService } from '../../../src/services/auth.js';
import { sessionService, hashDeviceFingerprint } from '../../../src/services/sessions.js';
import { tokenRevocation, parseDurationSeconds } from '../../../src/lib/tokenRevocation.js';
import { tenantService } from '../../../src/services/tenant.js';
import { UnauthorizedError } from '../../../src/utils/errors.js';

const SCHEMA = 'tenant_acme';
const FAMILY = '11111111-1111-4111-8111-111111111111';
const signToken = vi.fn().mockReturnValue('access-jwt');

function tokenRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rt-1',
    user_id: 'user-1',
    family_id: FAMILY,
    version: 1,
    email: 'user@example.com',
    status: 'active',
    refresh_token_version: 3,
    roles: ['admin', null],
    expires_at: new Date(Date.now() + 3600_000),
    revoked_at: null,
    device_hash: null,
    ip_address: '10.0.0.1',
    user_agent: 'UA/1',
    session_created_at: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

describe('refresh token lifecycle', () => {
  let service: AuthService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockQuery.mockReset();
    redisData.clear();
    redisTtl.clear();
    service = new AuthService();
    vi.mocked(tenantService.findBySlug).mockResolvedValue({ id: 'tenant-1', slug: 'acme' } as never);
    vi.mocked(tenantService.getSchemaName).mockReturnValue(SCHEMA);
  });

  describe('login', () => {
    it('creates a session family, stores metadata and audits token issuance', async () => {
      const passwordHash = await bcrypt.hash('pw-123456', 4);
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'user-1', email: 'user@example.com', name: 'U', status: 'active',
          auth_provider: 'local', password_hash: passwordHash, roles: ['user'],
          refresh_token_version: 2,
        }],
      });
      mockQuery.mockResolvedValue({ rows: [] });

      await service.login(
        { tenantSlug: 'acme', email: 'user@example.com', password: 'pw-123456' },
        signToken,
        { ipAddress: '1.2.3.4', userAgent: 'Browser/9', deviceFingerprint: 'fp-1' }
      );

      const payload = signToken.mock.calls[0][0];
      expect(payload.sid).toMatch(/^[0-9a-f-]{36}$/);
      expect(payload.rtv).toBe(2);

      const insert = mockQuery.mock.calls.find((c) => String(c[0]).includes('INSERT INTO'))!;
      expect(insert[1][3]).toBe(payload.sid); // family_id == sid
      expect(insert[1][4]).toBe(1); // first version
      expect(insert[1][5]).toBe('1.2.3.4');
      expect(insert[1][6]).toBe('Browser/9');
      expect(insert[1][7]).toBe(hashDeviceFingerprint('fp-1')); // hash, never the raw fingerprint

      expect(auditLog).toHaveBeenCalledWith(
        'acme',
        expect.objectContaining({ action: 'token_issued', sessionId: payload.sid, ipAddress: '1.2.3.4' })
      );
    });
  });

  describe('rotation', () => {
    it('revokes the used token, issues a new one in the same family with a bumped version', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [tokenRow({ version: 4 })] }); // lookup
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // claim old token
      mockQuery.mockResolvedValue({ rows: [] }); // insert + cleanup

      const result = await service.refresh('old-token', 'acme', signToken, { ipAddress: '9.9.9.9' });

      expect(result.refreshToken).toBeDefined();
      expect(result.refreshToken).not.toBe('old-token');
      expect(signToken.mock.calls[0][0]).toMatchObject({ sid: FAMILY, rtv: 3 });

      const claim = mockQuery.mock.calls[1];
      expect(claim[0]).toContain('revoked_at IS NULL');

      const insert = mockQuery.mock.calls[2];
      expect(insert[1][3]).toBe(FAMILY);
      expect(insert[1][4]).toBe(5);
      expect(insert[1][5]).toBe('9.9.9.9');

      expect(auditLog).toHaveBeenCalledWith(
        'acme',
        expect.objectContaining({ action: 'token_refreshed', sessionId: FAMILY })
      );
    });

    it('adds the rotated token to the Redis revocation list with its remaining lifetime as TTL', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [tokenRow()] });
      mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });

      await service.refresh('old-token', 'acme', signToken);

      const keys = [...redisTtl.keys()].filter((k) => k.startsWith(`revoked:refresh:${SCHEMA}:`));
      expect(keys).toHaveLength(1);
      const ttl = redisTtl.get(keys[0])!;
      expect(ttl).toBeGreaterThan(3500);
      expect(ttl).toBeLessThanOrEqual(3600);
    });

    it('treats a lost rotation race as reuse', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [tokenRow()] });
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // someone else claimed it
      mockQuery.mockResolvedValue({ rows: [] });

      await expect(service.refresh('old-token', 'acme', signToken)).rejects.toThrow(UnauthorizedError);
      expect(auditLog).toHaveBeenCalledWith('acme', expect.objectContaining({ action: 'token_reuse_detected' }));
    });
  });

  describe('reuse detection', () => {
    it('revokes the whole session when a rotated token is presented again', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [tokenRow({ revoked_at: new Date() })] });
      mockQuery.mockResolvedValue({ rows: [] });

      await expect(service.refresh('old-token', 'acme', signToken)).rejects.toThrow(
        'Invalid or expired refresh token'
      );

      const revokeFamily = mockQuery.mock.calls[1];
      expect(revokeFamily[0]).toContain('family_id = $1');
      expect(revokeFamily[1]).toEqual([FAMILY, 'user-1']);
      expect(signToken).not.toHaveBeenCalled();
      expect(await tokenRevocation.isSessionRevoked(SCHEMA, FAMILY)).toBe(true);
      expect(auditLog).toHaveBeenCalledWith(
        'acme',
        expect.objectContaining({ action: 'token_reuse_detected', sessionId: FAMILY })
      );
    });

    it('rejects a token that Redis lists as revoked even if the database row looks active', async () => {
      const hash = (service as unknown as { hashToken(t: string): string }).hashToken('stolen');
      await tokenRevocation.revokeRefreshToken(SCHEMA, hash, new Date(Date.now() + 60_000));
      mockQuery.mockResolvedValueOnce({ rows: [tokenRow()] });
      mockQuery.mockResolvedValue({ rows: [] });

      await expect(service.refresh('stolen', 'acme', signToken)).rejects.toThrow(UnauthorizedError);
      expect(signToken).not.toHaveBeenCalled();
    });

    it('answers an unknown token with a plain 401 and no session revocation', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      await expect(service.refresh('nope', 'acme', signToken)).rejects.toThrow(UnauthorizedError);
      expect(mockQuery).toHaveBeenCalledTimes(1);
      expect(auditLog).not.toHaveBeenCalled();
    });
  });

  describe('device binding', () => {
    const bound = () => tokenRow({ device_hash: hashDeviceFingerprint('device-one') });

    it('refreshes from the bound device and keeps the binding', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [bound()] });
      mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });

      await service.refresh('tok', 'acme', signToken, { deviceFingerprint: 'device-one' });

      const insert = mockQuery.mock.calls[2];
      expect(insert[1][7]).toBe(hashDeviceFingerprint('device-one'));
    });

    it('rejects and revokes the session when the fingerprint differs', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [bound()] });
      mockQuery.mockResolvedValue({ rows: [] });

      await expect(
        service.refresh('tok', 'acme', signToken, { deviceFingerprint: 'device-two' })
      ).rejects.toThrow(UnauthorizedError);

      expect(await tokenRevocation.isSessionRevoked(SCHEMA, FAMILY)).toBe(true);
      expect(auditLog).toHaveBeenCalledWith(
        'acme',
        expect.objectContaining({ action: 'token_revoked', metadata: { reason: 'device_mismatch' } })
      );
    });

    it('rejects when a bound session presents no fingerprint', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [bound()] });
      mockQuery.mockResolvedValue({ rows: [] });
      await expect(service.refresh('tok', 'acme', signToken)).rejects.toThrow(UnauthorizedError);
    });

    it('does not bind sessions created without a fingerprint', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [tokenRow()] });
      mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });
      await expect(
        service.refresh('tok', 'acme', signToken, { deviceFingerprint: 'anything' })
      ).resolves.toBeDefined();
    });
  });

  describe('revocation list', () => {
    it('logout revokes the refresh token and the access tokens of the session', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ user_id: 'user-1', family_id: FAMILY, expires_at: new Date(Date.now() + 5000_000) }],
      });

      await service.logout('tok', 'acme');

      expect(await tokenRevocation.isAccessTokenRevoked(SCHEMA, { userId: 'user-1', sid: FAMILY, rtv: 3 })).toBe(true);
      expect(auditLog).toHaveBeenCalledWith('acme', expect.objectContaining({ action: 'token_revoked' }));
    });

    it('session revocation entries expire with the access token lifetime', async () => {
      await tokenRevocation.revokeSession(SCHEMA, FAMILY);
      expect(redisTtl.get(`revoked:session:${SCHEMA}:${FAMILY}`)).toBe(parseDurationSeconds('1h'));
    });

    it('does not store refresh token revocations for tokens that already expired', async () => {
      await tokenRevocation.revokeRefreshToken(SCHEMA, 'h', new Date(Date.now() - 1000));
      expect(redisData.size).toBe(0);
    });

    it('revoke-all bumps the user version floor and rejects older access tokens only', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ version: 4 }] });

      await service.revokeAllUserTokens('user-1', SCHEMA);

      expect(mockQuery.mock.calls[0][0]).toContain('refresh_token_version = refresh_token_version + 1');
      expect(await tokenRevocation.isAccessTokenRevoked(SCHEMA, { userId: 'user-1', sid: 's', rtv: 3 })).toBe(true);
      expect(await tokenRevocation.isAccessTokenRevoked(SCHEMA, { userId: 'user-1', sid: 's', rtv: 4 })).toBe(false);
      expect(await tokenRevocation.isAccessTokenRevoked(SCHEMA, { userId: 'user-2', sid: 's', rtv: 1 })).toBe(false);
    });

    it('parses durations', () => {
      expect(parseDurationSeconds('15m')).toBe(900);
      expect(parseDurationSeconds('7d')).toBe(604800);
      expect(parseDurationSeconds('90')).toBe(90);
    });
  });

  describe('session repository', () => {
    it('lists active sessions with metadata', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          family_id: FAMILY, user_id: 'user-1', ip_address: '10.0.0.1', user_agent: 'UA/1',
          device_hash: 'abc', version: 3, session_created_at: new Date('2026-01-01T00:00:00Z'),
          created_at: new Date('2026-01-02T00:00:00Z'), last_used_at: null, expires_at: new Date('2026-02-01T00:00:00Z'),
        }],
      });

      const sessions = await sessionService.listForUser('acme', 'user-1');

      expect(sessions).toEqual([
        expect.objectContaining({
          id: FAMILY, ipAddress: '10.0.0.1', userAgent: 'UA/1', deviceBound: true, rotationCount: 2,
          createdAt: new Date('2026-01-01T00:00:00Z'),
        }),
      ]);
      expect(mockQuery.mock.calls[0][0]).toContain('revoked_at IS NULL');
    });

    it('revokes one session scoped to its owner and reports whether one matched', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ token_hash: 'h1', expires_at: new Date(Date.now() + 1000_000) }],
      });
      expect(await sessionService.revoke('acme', 'user-1', FAMILY)).toBe(true);
      expect(mockQuery.mock.calls[0][1]).toEqual([FAMILY, 'user-1']);
      expect(await tokenRevocation.isSessionRevoked(SCHEMA, FAMILY)).toBe(true);

      mockQuery.mockResolvedValueOnce({ rows: [] });
      expect(await sessionService.revoke('acme', 'user-1', FAMILY)).toBe(false);
    });
  });
});
