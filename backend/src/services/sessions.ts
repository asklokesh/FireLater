import crypto from 'crypto';
import { pool } from '../config/database.js';
import { tenantService } from './tenant.js';
import { tokenRevocation } from '../lib/tokenRevocation.js';

/**
 * Session repository.
 *
 * A session is a refresh token family: every rotation of the refresh token inserts a new
 * row with the same family_id, and at most one row of a family is active (not revoked).
 * The active row carries the session metadata (IP, User-Agent, device binding).
 */

export interface ClientContext {
  ipAddress?: string;
  userAgent?: string;
  /** Raw device fingerprint supplied by the client (never stored, only its hash) */
  deviceFingerprint?: string;
}

export interface SessionRecord {
  id: string;
  userId: string;
  ipAddress: string | null;
  userAgent: string | null;
  deviceBound: boolean;
  rotationCount: number;
  createdAt: Date;
  lastUsedAt: Date | null;
  expiresAt: Date;
}

const MAX_USER_AGENT_LENGTH = 512;
const MAX_FINGERPRINT_LENGTH = 1024;

/** Hash a client supplied device fingerprint; undefined when none was supplied. */
export function hashDeviceFingerprint(fingerprint?: string): string | undefined {
  if (!fingerprint) return undefined;
  const trimmed = fingerprint.trim().slice(0, MAX_FINGERPRINT_LENGTH);
  if (!trimmed) return undefined;
  return crypto.createHash('sha256').update(trimmed).digest('hex');
}

export function normalizeUserAgent(userAgent?: string): string | undefined {
  return userAgent ? userAgent.slice(0, MAX_USER_AGENT_LENGTH) : undefined;
}

export function deviceHashesMatch(stored: string, presented: string | undefined): boolean {
  if (!presented || stored.length !== presented.length) return false;
  return crypto.timingSafeEqual(Buffer.from(stored), Buffer.from(presented));
}

interface SessionRow {
  family_id: string;
  user_id: string;
  ip_address: string | null;
  user_agent: string | null;
  device_hash: string | null;
  version: number;
  session_created_at: Date | null;
  created_at: Date;
  last_used_at: Date | null;
  expires_at: Date;
}

function toSession(row: SessionRow): SessionRecord {
  return {
    id: row.family_id,
    userId: row.user_id,
    ipAddress: row.ip_address,
    userAgent: row.user_agent,
    deviceBound: !!row.device_hash,
    rotationCount: row.version - 1,
    createdAt: row.session_created_at ?? row.created_at,
    lastUsedAt: row.last_used_at,
    expiresAt: row.expires_at,
  };
}

export class SessionService {
  /** Active sessions of a user, most recently used first. */
  async listForUser(tenantSlug: string, userId: string): Promise<SessionRecord[]> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const result = await pool.query(
      `SELECT family_id, user_id, ip_address, user_agent, device_hash, version,
              session_created_at, created_at, last_used_at, expires_at
       FROM ${schema}.refresh_tokens
       WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > NOW()
       ORDER BY COALESCE(last_used_at, created_at) DESC`,
      [userId]
    );
    return result.rows.map(toSession);
  }

  /** Revoke one session. Returns false when no active session matched. */
  async revoke(tenantSlug: string, userId: string, sessionId: string): Promise<boolean> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const result = await pool.query(
      `UPDATE ${schema}.refresh_tokens SET revoked_at = NOW()
       WHERE family_id = $1 AND user_id = $2 AND revoked_at IS NULL
       RETURNING token_hash, expires_at`,
      [sessionId, userId]
    );

    const rows = result.rows as { token_hash: string; expires_at: Date }[];
    for (const row of rows) {
      await tokenRevocation.revokeRefreshToken(schema, row.token_hash, new Date(row.expires_at));
    }
    // Kill access tokens of the session even if its refresh row was already revoked
    await tokenRevocation.revokeSession(schema, sessionId);
    return rows.length > 0;
  }

  /**
   * Revoke every session of a user and bump users.refresh_token_version so that access
   * tokens minted before now are rejected too. Returns the new version.
   */
  async revokeAll(tenantSlug: string, userId: string): Promise<number | undefined> {
    return this.revokeAllInSchema(tenantService.getSchemaName(tenantSlug), userId);
  }

  async revokeAllInSchema(schema: string, userId: string): Promise<number | undefined> {
    const result = await pool.query(
      `WITH bump AS (
         UPDATE ${schema}.users SET refresh_token_version = refresh_token_version + 1
         WHERE id = $1 RETURNING refresh_token_version
       ), revoked AS (
         UPDATE ${schema}.refresh_tokens SET revoked_at = NOW()
         WHERE user_id = $1 AND revoked_at IS NULL
       )
       SELECT refresh_token_version AS version FROM bump`,
      [userId]
    );

    const version = result?.rows?.[0]?.version as number | undefined;
    if (version !== undefined) {
      await tokenRevocation.revokeUserBefore(schema, userId, version);
    }
    return version;
  }
}

export const sessionService = new SessionService();
