import { describe, it, expect, beforeEach, vi } from 'vitest';
import { buildApp } from '../app';
import { prisma } from '../utils/db';
import bcrypt from 'bcrypt';

describe('Auth Routes - Password Reset', () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(async () => {
    app = buildApp();
    await app.ready();
    // Clear test data
    await prisma.passwordResetToken.deleteMany({});
    await prisma.user.deleteMany({});
  });

  describe('POST /auth/reset-password/request', () => {
    it('should generate reset token for valid email', async () => {
      // Create test user
      const user = await prisma.user.create({
        data: {
          email: 'test@example.com',
          password: await bcrypt.hash('password123', 10),
          name: 'Test User'
        }
      });

      const response = await app.inject({
        method: 'POST',
        url: '/auth/reset-password/request',
        payload: {
          email: 'test@example.com'
        }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        message: 'Password reset email sent'
      });

      // Verify token was created
      const tokenRecord = await prisma.passwordResetToken.findFirst({
        where: {
          userId: user.id
        }
      });
      expect(tokenRecord).toBeDefined();
      expect(tokenRecord?.token).toHaveLength(64);
      expect(tokenRecord?.expiresAt).toBeInstanceOf(Date);
    });

    it('should return 200 even for non-existent email (security)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/reset-password/request',
        payload: {
          email: 'nonexistent@example.com'
        }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        message: 'Password reset email sent'
      });
    });
  });

  describe('POST /auth/reset-password/validate', () => {
    it('should validate valid reset token', async () => {
      // Create user and token
      const user = await prisma.user.create({
        data: {
          email: 'test@example.com',
          password: await bcrypt.hash('password123', 10),
          name: 'Test User'
        }
      });

      const token = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ012345';
      await prisma.passwordResetToken.create({
        data: {
          token,
          userId: user.id,
          expiresAt: new Date(Date.now() + 3600000) // 1 hour from now
        }
      });

      const response = await app.inject({
        method: 'POST',
        url: '/auth/reset-password/validate',
        payload: {
          token
        }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        valid: true
      });
    });

    it('should reject expired token', async () => {
      // Create user and expired token
      const user = await prisma.user.create({
        data: {
          email: 'test@example.com',
          password: await bcrypt.hash('password123', 10),
          name: 'Test User'
        }
      });

      const token = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ012345';
      await prisma.passwordResetToken.create({
        data: {
          token,
          userId: user.id,
          expiresAt: new Date(Date.now() - 3600000) // 1 hour ago
        }
      });

      const response = await app.inject({
        method: 'POST',
        url: '/auth/reset-password/validate',
        payload: {
          token
        }
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({
        error: 'Invalid or expired token'
      });
    });

    it('should reject invalid token', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/reset-password/validate',
        payload: {
          token: 'invalid-token'
        }
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({
        error: 'Invalid or expired token'
      });
    });
  });

  describe('POST /auth/reset-password', () => {
    it('should reset password with valid token', async () => {
      // Create user and token
      const user = await prisma.user.create({
        data: {
          email: 'test@example.com',
          password: await bcrypt.hash('password123', 10),
          name: 'Test User'
        }
      });

      const token = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ012345';
      await prisma.passwordResetToken.create({
        data: {
          token,
          userId: user.id,
          expiresAt: new Date(Date.now() + 3600000) // 1 hour from now
        }
      });

      const response = await app.inject({
        method: 'POST',
        url: '/auth/reset-password',
        payload: {
          token,
          newPassword: 'newpassword123'
        }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        message: 'Password reset successful'
      });

      // Verify password was updated
      const updatedUser = await prisma.user.findUnique({
        where: {
          id: user.id
        }
      });
      const passwordMatches = await bcrypt.compare('newpassword123', updatedUser!.password);
      expect(passwordMatches).toBe(true);

      // Verify token was deleted
      const tokenRecord = await prisma.passwordResetToken.findFirst({
        where: {
          token
        }
      });
      expect(tokenRecord).toBeNull();
    });

    it('should reject reset with expired token', async () => {
      // Create user and expired token
      const user = await prisma.user.create({
        data: {
          email: 'test@example.com',
          password: await bcrypt.hash('password123', 10),
          name: 'Test User'
        }
      });

      const token = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ012345';
      await prisma.passwordResetToken.create({
        data: {
          token,
          userId: user.id,
          expiresAt: new Date(Date.now() - 3600000) // 1 hour ago
        }
      });

      const response = await app.inject({
        method: 'POST',
        url: '/auth/reset-password',
        payload: {
          token,
          newPassword: 'newpassword123'
        }
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({
        error: 'Invalid or expired token'
      });
    });

    it('should reject reset with invalid password', async () => {
      // Create user and token
      const user = await prisma.user.create({
        data: {
          email: 'test@example.com',
          password: await bcrypt.hash('password123', 10),
          name: 'Test User'
        }
      });

      const token = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ012345';
      await prisma.passwordResetToken.create({
        data: {
          token,
          userId: user.id,
          expiresAt: new Date(Date.now() + 3600000)
        }
      });

      const response = await app.inject({
        method: 'POST',
        url: '/auth/reset-password',
        payload: {
          token,
          newPassword: '123' // Too short
        }
      });

      expect(response.statusCode).toBe(400);
    });
  });
});