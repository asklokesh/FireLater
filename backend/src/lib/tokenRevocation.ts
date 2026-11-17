import { redis } from '../config/redis.js';
import { config } from '../config/index.js';

/**
 * Redis-backed revocation list for JWT access tokens and refresh tokens.
 *
 * Every revocation is one key with a TTL, so the list cleans itself up:
 *   - revoked:session:<ns>:<sid>        access tokens of a session (TTL = max access token lifetime)
 *   - revoked:user:<ns>:<userId>        minimum accepted refresh_token_version (TTL = max access token lifetime)
 *   - revoked:refresh:<ns>:<tokenHash>  a refresh token (TTL = remaining lifetime of that token)
 *
 * <ns> is the tenant schema name. An entry only has to outlive the tokens it covers, so the
 * TTLs never exceed the longest lifetime a covered token could still have.
 */

const UNIT_SECONDS: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400, w: 604800 };

/** Parse durations like "15m", "1h", "7d" (or a bare number of seconds). */
export function parseDurationSeconds(value: string | number): number {
  if (typeof value === 'number') return Math.max(1, Math.floor(value));
  const match = /^\s*(\d+)\s*([smhdw]?)\s*$/i.exec(value);
  if (!match) return 3600;
  const unit = match[2] ? UNIT_SECONDS[match[2].toLowerCase()] : 1;
  return Math.max(1, parseInt(match[1], 10) * unit);
}

/** Longest time an issued access token can stay valid. */
export function accessTokenTtlSeconds(): number {
  return parseDurationSeconds(config.jwt.accessExpiry);
}

export interface AccessTokenClaims {
  userId: string;
  sid?: string;
  rtv?: number;
}

class TokenRevocationList {
  private sessionKey(ns: string, sid: string) {
    return `revoked:session:${ns}:${sid}`;
  }

  private userKey(ns: string, userId: string) {
    return `revoked:user:${ns}:${userId}`;
  }

  private refreshKey(ns: string, tokenHash: string) {
    return `revoked:refresh:${ns}:${tokenHash}`;
  }

  /** Revoke the access tokens of one session. */
  async revokeSession(ns: string, sid: string): Promise<void> {
    await redis.setex(this.sessionKey(ns, sid), accessTokenTtlSeconds(), String(Date.now()));
  }

  /** Revoke every access token issued before `minVersion` for this user. */
  async revokeUserBefore(ns: string, userId: string, minVersion: number): Promise<void> {
    await redis.setex(this.userKey(ns, userId), accessTokenTtlSeconds(), String(minVersion));
  }

  /** Revoke a refresh token until it would have expired anyway. */
  async revokeRefreshToken(ns: string, tokenHash: string, expiresAt: Date): Promise<void> {
    const ttl = Math.ceil((expiresAt.getTime() - Date.now()) / 1000);
    if (!(ttl > 0)) return; // already expired (or no valid expiry), nothing to remember
    await redis.setex(this.refreshKey(ns, tokenHash), ttl, String(Date.now()));
  }

  async isRefreshTokenRevoked(ns: string, tokenHash: string): Promise<boolean> {
    return (await redis.get(this.refreshKey(ns, tokenHash))) !== null;
  }

  async isSessionRevoked(ns: string, sid: string): Promise<boolean> {
    return (await redis.get(this.sessionKey(ns, sid))) !== null;
  }

  /** True when the access token's session or user version has been revoked. */
  async isAccessTokenRevoked(ns: string, claims: AccessTokenClaims): Promise<boolean> {
    if (claims.sid && (await this.isSessionRevoked(ns, claims.sid))) {
      return true;
    }
    const floor = await redis.get(this.userKey(ns, claims.userId));
    if (floor !== null) {
      // Tokens minted before versioning existed carry no rtv and are covered by the floor too
      return (claims.rtv ?? 0) < parseInt(floor, 10);
    }
    return false;
  }
}

export const tokenRevocation = new TokenRevocationList();
