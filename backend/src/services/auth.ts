import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { pool } from '../config/database.js';
import { redis } from '../config/redis.js';
import { tenantService } from './tenant.js';
import { emailService } from './email.js';
import { UnauthorizedError, NotFoundError, BadRequestError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import type { JwtPayload } from '../types/index.js';

interface LoginParams {
  tenantSlug: string;
  email: string;
  password: string;
}

interface LoginResult {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    name: string;
    roles: string[];
  };
}

interface User {
  id: string;
  email: string;
  name: string;
  avatar_url: string | null;
  status: string;
  password_hash: string | null;
  auth_provider: string;
}

export class AuthService {
  private refreshTokenExpiry = 7 * 24 * 60 * 60 * 1000; // 7 days in ms

  async login(
    params: LoginParams,
    signToken: (payload: JwtPayload) => string
  ): Promise<LoginResult> {
    const tenant = await tenantService.findBySlug(params.tenantSlug);
    if (!tenant) {
      throw new NotFoundError('Tenant', params.tenantSlug);
    }

    const schema = tenantService.getSchemaName(params.tenantSlug);

    // Get user with roles
    const userResult = await pool.query(
      `SELECT u.*, array_agg(r.name) as roles
       FROM ${schema}.users u
       LEFT JOIN ${schema}.user_roles ur ON u.id = ur.user_id
       LEFT JOIN ${schema}.roles r ON ur.role_id = r.id
       WHERE u.email = $1
       GROUP BY u.id`,
      [params.email]
    );

    const user = userResult.rows[0] as User & { roles: string[]; failed_login_attempts?: number; locked_until?: Date };
    if (!user) {
      throw new UnauthorizedError('Invalid email or password');
    }

    if (user.status !== 'active') {
      throw new UnauthorizedError('Account is not active');
    }

    // Check if account is locked
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      const lockoutMinutesRemaining = Math.ceil((new Date(user.locked_until).getTime() - Date.now()) / 60000);
      throw new UnauthorizedError(
        `Account is temporarily locked due to multiple failed login attempts. Please try again in ${lockoutMinutesRemaining} minute(s).`
      );
    }

    if (user.auth_provider !== 'local' || !user.password_hash) {
      throw new UnauthorizedError('Please use SSO to login');
    }

    const validPassword = await bcrypt.compare(params.password, user.password_hash);
    if (!validPassword) {
      // Increment failed login attempts
      const newAttempts = (user.failed_login_attempts || 0) + 1;
      const lockoutThreshold = 5;

      if (newAttempts >= lockoutThreshold) {
        // Lock account for 30 minutes
        const lockoutDurationMs = 30 * 60 * 1000;
        const lockedUntil = new Date(Date.now() + lockoutDurationMs);

        await pool.query(
          `UPDATE ${schema}.users SET failed_login_attempts = $1, locked_until = $2 WHERE id = $3`,
          [newAttempts, lockedUntil, user.id]
        );

        throw new UnauthorizedError(
          'Account has been temporarily locked due to too many failed login attempts. Please try again in 30 minutes.'
        );
      } else {
        // Just increment the counter
        await pool.query(
          `UPDATE ${schema}.users SET failed_login_attempts = $1 WHERE id = $2`,
          [newAttempts, user.id]
        );

        const attemptsRemaining = lockoutThreshold - newAttempts;
        throw new UnauthorizedError(
          `Invalid email or password. ${attemptsRemaining} attempt(s) remaining before account lockout.`
        );
      }
    }

    // Successful login - reset failed attempts and lockout
    await pool.query(
      `UPDATE ${schema}.users
       SET last_login_at = NOW(), failed_login_attempts = 0, locked_until = NULL
       WHERE id = $1`,
      [user.id]
    );

    // Generate tokens
    const roles = user.roles.filter(Boolean);
    const payload: JwtPayload = {
      userId: user.id,
      tenantId: tenant.id,
      tenantSlug: params.tenantSlug,
      email: user.email,
      roles,
    };

    const accessToken = signToken(payload);
    const refreshToken = await this.createRefreshToken(user.id, schema);

    logger.info({ userId: user.id, tenantSlug: params.tenantSlug }, 'User logged in');

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        roles,
      },
    };
  }

  async refresh(
    refreshToken: string,
    tenantSlug: string,
    signToken: (payload: JwtPayload) => string
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const tenant = await tenantService.findBySlug(tenantSlug);
    if (!tenant) {
      throw new NotFoundError('Tenant', tenantSlug);
    }

    const schema = tenantService.getSchemaName(tenantSlug);
    const tokenHash = this.hashToken(refreshToken);

    // Verify refresh token
    const tokenResult = await pool.query(
      `SELECT rt.*, u.email, u.status,
              array_agg(r.name) as roles
       FROM ${schema}.refresh_tokens rt
       JOIN ${schema}.users u ON rt.user_id = u.id
       LEFT JOIN ${schema}.user_roles ur ON u.id = ur.user_id
       LEFT JOIN ${schema}.roles r ON ur.role_id = r.id
       WHERE rt.token_hash = $1
         AND rt.expires_at > NOW()
         AND rt.revoked_at IS NULL
       GROUP BY rt.id, u.id`,
      [tokenHash]
    );

    if (tokenResult.rows.length === 0) {
      throw new UnauthorizedError('Invalid or expired refresh token');
    }

    const tokenData = tokenResult.rows[0];

    if (tokenData.status !== 'active') {
      throw new UnauthorizedError('Account is not active');
    }

    // Revoke old token (rotation)
    await pool.query(
      `UPDATE ${schema}.refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1`,
      [tokenHash]
    );

    // Create new tokens
    const roles = tokenData.roles.filter(Boolean);
    const payload: JwtPayload = {
      userId: tokenData.user_id,
      tenantId: tenant.id,
      tenantSlug,
      email: tokenData.email,
      roles,
    };

    const newAccessToken = signToken(payload);
    const newRefreshToken = await this.createRefreshToken(tokenData.user_id, schema);

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    };
  }

  async logout(refreshToken: string, tenantSlug: string): Promise<void> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const tokenHash = this.hashToken(refreshToken);

    await pool.query(
      `UPDATE ${schema}.refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1`,
      [tokenHash]
    );
  }

  async revokeAllUserTokens(userId: string, schema: string): Promise<void> {
    await pool.query(
      `UPDATE ${schema}.refresh_tokens SET revoked_at = NOW()
       WHERE user_id = $1 AND revoked_at IS NULL`,
      [userId]
    );
  }

  async changePassword(
    userId: string,
    oldPassword: string,
    newPassword: string,
    schema: string
  ): Promise<void> {
    const userResult = await pool.query(
      `SELECT password_hash FROM ${schema}.users WHERE id = $1`,
      [userId]
    );

    const user = userResult.rows[0];
    if (!user || !user.password_hash) {
      throw new BadRequestError('Cannot change password for SSO users');
    }

    const validPassword = await bcrypt.compare(oldPassword, user.password_hash);
    if (!validPassword) {
      throw new UnauthorizedError('Current password is incorrect');
    }

    const newHash = await bcrypt.hash(newPassword, 12);
    await pool.query(
      `UPDATE ${schema}.users SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
      [newHash, userId]
    );

    // Revoke all refresh tokens
    await this.revokeAllUserTokens(userId, schema);

    logger.info({ userId }, 'Password changed');
  }

  private async createRefreshToken(userId: string, schema: string): Promise<string> {
    const token = crypto.randomBytes(64).toString('hex');
    const tokenHash = this.hashToken(token);
    const expiresAt = new Date(Date.now() + this.refreshTokenExpiry);

    await pool.query(
      `INSERT INTO ${schema}.refresh_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [userId, tokenHash, expiresAt]
    );

    // Clean up expired tokens periodically
    await pool.query(
      `DELETE FROM ${schema}.refresh_tokens
       WHERE expires_at < NOW() OR revoked_at < NOW() - INTERVAL '7 days'`
    );

    return token;
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  async getUserPermissions(userId: string, schema: string): Promise<string[]> {
    const result = await pool.query(
      `SELECT DISTINCT p.resource || ':' || p.action as permission
       FROM ${schema}.user_roles ur
       JOIN ${schema}.role_permissions rp ON ur.role_id = rp.role_id
       JOIN ${schema}.permissions p ON rp.permission_id = p.id
       WHERE ur.user_id = $1`,
      [userId]
    );

    return result.rows.map((r) => r.permission);
  }

  async cacheUserPermissions(userId: string, tenantSlug: string, permissions: string[]): Promise<void> {
    const key = `permissions:${tenantSlug}:${userId}`;
    await redis.setex(key, 300, JSON.stringify(permissions)); // 5 min cache
  }

  async getCachedPermissions(userId: string, tenantSlug: string): Promise<string[] | null> {
    const key = `permissions:${tenantSlug}:${userId}`;
    const cached = await redis.get(key);
    return cached ? JSON.parse(cached) : null;
  }

  async requestPasswordReset(tenantSlug: string, email: string): Promise<void> {
    const tenant = await tenantService.findBySlug(tenantSlug);
    if (!tenant) {
      // Silently return to prevent tenant enumeration
      logger.debug({ tenantSlug }, 'Password reset requested for non-existent tenant');
      return;
    }

    const schema = tenantService.getSchemaName(tenantSlug);

    // Check if user exists
    const userResult = await pool.query(
      `SELECT id, email, name FROM ${schema}.users WHERE email = $1 AND status = 'active'`,
      [email]
    );

    if (userResult.rows.length === 0) {
      // Silently return to prevent email enumeration
      logger.debug({ email }, 'Password reset requested for non-existent user');
      return;
    }

    const user = userResult.rows[0];

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(resetToken);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Store reset token in Redis
    const key = `password_reset:${tenantSlug}:${tokenHash}`;
    await redis.setex(key, 3600, JSON.stringify({
      userId: user.id,
      email: user.email,
    }));

    // Send password reset email
    await emailService.sendPasswordResetEmail(user.email, user.name, resetToken, tenantSlug);

    logger.info({
      userId: user.id,
      email: user.email,
      expiresAt,
    }, 'Password reset email sent');
  }

  async resetPassword(tenantSlug: string, token: string, newPassword: string): Promise<void> {
    const tenant = await tenantService.findBySlug(tenantSlug);
    if (!tenant) {
      throw new BadRequestError('Invalid or expired reset token');
    }

    const tokenHash = this.hashToken(token);
    const key = `password_reset:${tenantSlug}:${tokenHash}`;

    // Get token data from Redis
    const tokenData = await redis.get(key);
    if (!tokenData) {
      throw new BadRequestError('Invalid or expired reset token');
    }

    const { userId, email } = JSON.parse(tokenData);
    const schema = tenantService.getSchemaName(tenantSlug);

    // Update password
    const newHash = await bcrypt.hash(newPassword, 12);
    await pool.query(
      `UPDATE ${schema}.users SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
      [newHash, userId]
    );

    // Delete used token
    await redis.del(key);

    // Revoke all refresh tokens
    await this.revokeAllUserTokens(userId, schema);

    logger.info({ userId, email }, 'Password reset completed');
  }

  async createEmailVerificationToken(userId: string, schema: string): Promise<string> {
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(token);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Delete any existing tokens for this user
    await pool.query(
      `DELETE FROM ${schema}.email_verification_tokens WHERE user_id = $1`,
      [userId]
    );

    // Create new token
    await pool.query(
      `INSERT INTO ${schema}.email_verification_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [userId, tokenHash, expiresAt]
    );

    return token;
  }

  async verifyEmail(tenantSlug: string, token: string): Promise<{ email: string }> {
    const tenant = await tenantService.findBySlug(tenantSlug);
    if (!tenant) {
      throw new BadRequestError('Invalid or expired verification token');
    }

    const schema = tenantService.getSchemaName(tenantSlug);
    const tokenHash = this.hashToken(token);

    // Find and validate token
    const tokenResult = await pool.query(
      `SELECT evt.*, u.email, u.email_verified
       FROM ${schema}.email_verification_tokens evt
       JOIN ${schema}.users u ON evt.user_id = u.id
       WHERE evt.token_hash = $1
         AND evt.expires_at > NOW()
         AND evt.used_at IS NULL`,
      [tokenHash]
    );

    if (tokenResult.rows.length === 0) {
      throw new BadRequestError('Invalid or expired verification token');
    }

    const tokenData = tokenResult.rows[0];

    if (tokenData.email_verified) {
      throw new BadRequestError('Email is already verified');
    }

    // Mark email as verified
    await pool.query(
      `UPDATE ${schema}.users
       SET email_verified = true, email_verified_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [tokenData.user_id]
    );

    // Mark token as used
    await pool.query(
      `UPDATE ${schema}.email_verification_tokens SET used_at = NOW() WHERE id = $1`,
      [tokenData.id]
    );

    logger.info({ userId: tokenData.user_id, email: tokenData.email }, 'Email verified');

    return { email: tokenData.email };
  }

  async resendVerificationEmail(tenantSlug: string, email: string): Promise<void> {
    const tenant = await tenantService.findBySlug(tenantSlug);
    if (!tenant) {
      // Silently return to prevent tenant enumeration
      logger.debug({ tenantSlug }, 'Resend verification requested for non-existent tenant');
      return;
    }

    const schema = tenantService.getSchemaName(tenantSlug);

    // Check if user exists and is not yet verified
    const userResult = await pool.query(
      `SELECT id, email, name, email_verified FROM ${schema}.users WHERE email = $1`,
      [email]
    );

    if (userResult.rows.length === 0) {
      // Silently return to prevent email enumeration
      logger.debug({ email }, 'Resend verification requested for non-existent user');
      return;
    }

    const user = userResult.rows[0];

    if (user.email_verified) {
      throw new BadRequestError('Email is already verified');
    }

    // Generate new verification token
    const verificationToken = await this.createEmailVerificationToken(user.id, schema);

    // Send verification email
    await emailService.sendVerificationEmail(user.email, user.name, verificationToken, tenantSlug);

    logger.info({
      userId: user.id,
      email: user.email,
    }, 'Verification email resent');
  }

  async sendVerificationEmailForNewUser(userId: string, email: string, name: string, tenantSlug: string, schema: string): Promise<void> {
    const verificationToken = await this.createEmailVerificationToken(userId, schema);

    // Send verification email
    await emailService.sendVerificationEmail(email, name, verificationToken, tenantSlug);

    logger.info({
      userId,
      email,
    }, 'Verification email sent for new user');
  }
}

export const authService = new AuthService();
