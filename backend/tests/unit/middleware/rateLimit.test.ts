import { describe, it, expect, vi } from 'vitest';
import { loginRateLimit, registerRateLimit, resetPasswordRateLimit } from '../../../src/middleware/rateLimit.js';

/**
 * Unit tests for rate limiting middleware
 * Testing rate limit configuration and key generation
 */

describe('Rate Limiting Middleware', () => {
  describe('loginRateLimit', () => {
    it('should have correct max attempts', () => {
      expect(loginRateLimit.max).toBe(5);
    });

    it('should have 60 second time window', () => {
      expect(loginRateLimit.timeWindow).toBe(60000);
    });

    it('should generate key with tenant and IP', () => {
      const mockRequest = {
        body: { tenantSlug: 'acme-corp' },
        socket: { remoteAddress: '192.168.1.100' },
      } as any;

      const key = loginRateLimit.keyGenerator(mockRequest);

      expect(key).toBe('login_acme-corp_192.168.1.100');
    });

    it('should use default tenant for missing tenantSlug', () => {
      const mockRequest = {
        body: {},
        socket: { remoteAddress: '10.0.0.1' },
      } as any;

      const key = loginRateLimit.keyGenerator(mockRequest);

      expect(key).toBe('login_default_10.0.0.1');
    });

    it('should handle IPv6 addresses', () => {
      const mockRequest = {
        body: { tenantSlug: 'test-tenant' },
        socket: { remoteAddress: '::1' },
      } as any;

      const key = loginRateLimit.keyGenerator(mockRequest);

      expect(key).toBe('login_test-tenant_::1');
    });
  });

  describe('registerRateLimit', () => {
    it('should have stricter max attempts than login', () => {
      expect(registerRateLimit.max).toBe(3);
      expect(registerRateLimit.max).toBeLessThan(loginRateLimit.max);
    });

    it('should have 1 hour time window', () => {
      expect(registerRateLimit.timeWindow).toBe(3600000);
    });

    it('should generate key with tenant and IP', () => {
      const mockRequest = {
        body: { tenantSlug: 'new-company' },
        socket: { remoteAddress: '172.16.0.50' },
      } as any;

      const key = registerRateLimit.keyGenerator(mockRequest);

      expect(key).toBe('register_new-company_172.16.0.50');
    });
  });

  describe('resetPasswordRateLimit', () => {
    it('should have same max as register', () => {
      expect(resetPasswordRateLimit.max).toBe(3);
    });

    it('should have 1 hour time window', () => {
      expect(resetPasswordRateLimit.timeWindow).toBe(3600000);
    });

    it('should generate key with email and IP', () => {
      const mockRequest = {
        body: { email: 'user@example.com' },
        socket: { remoteAddress: '192.168.1.1' },
      } as any;

      const key = resetPasswordRateLimit.keyGenerator(mockRequest);

      expect(key).toBe('reset_user@example.com_192.168.1.1');
    });

    it('should handle different email formats', () => {
      const mockRequest = {
        body: { email: 'admin+test@company.co.uk' },
        socket: { remoteAddress: '10.10.10.10' },
      } as any;

      const key = resetPasswordRateLimit.keyGenerator(mockRequest);

      expect(key).toBe('reset_admin+test@company.co.uk_10.10.10.10');
    });
  });

  describe('Rate Limit Security Properties', () => {
    it('login limit should prevent brute force attacks', () => {
      // 5 attempts per minute is reasonable protection
      const attemptsPerMinute = loginRateLimit.max;
      const windowSeconds = loginRateLimit.timeWindow / 1000;

      expect(attemptsPerMinute).toBeLessThanOrEqual(10);
      expect(windowSeconds).toBeGreaterThanOrEqual(30);
    });

    it('register limit should prevent spam registrations', () => {
      // 3 registrations per hour is strict
      const attemptsPerHour = registerRateLimit.max;
      const windowHours = registerRateLimit.timeWindow / 3600000;

      expect(attemptsPerHour).toBeLessThanOrEqual(5);
      expect(windowHours).toBeGreaterThanOrEqual(1);
    });

    it('reset password limit should prevent email enumeration', () => {
      // Limited reset attempts prevents discovering valid emails
      const attemptsPerHour = resetPasswordRateLimit.max;

      expect(attemptsPerHour).toBeLessThanOrEqual(5);
    });

    it('all limits should use IP-based tracking', () => {
      const mockRequest = {
        body: { tenantSlug: 'test', email: 'test@test.com' },
        socket: { remoteAddress: '1.2.3.4' },
      } as any;

      const loginKey = loginRateLimit.keyGenerator(mockRequest);
      const registerKey = registerRateLimit.keyGenerator(mockRequest);
      const resetKey = resetPasswordRateLimit.keyGenerator(mockRequest);

      // All keys should include IP address
      expect(loginKey).toContain('1.2.3.4');
      expect(registerKey).toContain('1.2.3.4');
      expect(resetKey).toContain('1.2.3.4');
    });
  });

  describe('Key Generation Edge Cases', () => {
    it('should throw for null body in login', () => {
      const mockRequest = {
        body: null as any,
        socket: { remoteAddress: '127.0.0.1' },
      } as any;

      // Null body throws because of destructuring - this is expected
      // The middleware framework ensures body is never null
      expect(() => {
        loginRateLimit.keyGenerator(mockRequest);
      }).toThrow();
    });

    it('should handle undefined remoteAddress', () => {
      const mockRequest = {
        body: { tenantSlug: 'test' },
        socket: { remoteAddress: undefined },
      } as any;

      const key = loginRateLimit.keyGenerator(mockRequest);

      expect(key).toContain('test');
      expect(key).toContain('undefined');
    });

    it('should handle special characters in tenant slug', () => {
      const mockRequest = {
        body: { tenantSlug: 'company-name_123' },
        socket: { remoteAddress: '192.168.1.1' },
      } as any;

      const key = loginRateLimit.keyGenerator(mockRequest);

      expect(key).toBe('login_company-name_123_192.168.1.1');
    });
  });

  describe('Rate Limit Configuration Validation', () => {
    it('login window should be shorter than register window', () => {
      expect(loginRateLimit.timeWindow).toBeLessThan(registerRateLimit.timeWindow);
    });

    it('register and reset should have same window', () => {
      expect(registerRateLimit.timeWindow).toBe(resetPasswordRateLimit.timeWindow);
    });

    it('all max values should be positive', () => {
      expect(loginRateLimit.max).toBeGreaterThan(0);
      expect(registerRateLimit.max).toBeGreaterThan(0);
      expect(resetPasswordRateLimit.max).toBeGreaterThan(0);
    });

    it('all time windows should be positive', () => {
      expect(loginRateLimit.timeWindow).toBeGreaterThan(0);
      expect(registerRateLimit.timeWindow).toBeGreaterThan(0);
      expect(resetPasswordRateLimit.timeWindow).toBeGreaterThan(0);
    });
  });
});
