import { test, describe, expect, beforeEach, afterEach } from 'vitest';
import { buildApp } from '../app.js';
import { validateCIDR } from '../middleware/auth.js';

describe('Auth Routes', () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(async () => {
    app = buildApp();
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('validateCIDR integration', () => {
    test('should validate valid IPv4 CIDR', () => {
      expect(validateCIDR('192.168.1.0/24')).toBe(true);
      expect(validateCIDR('10.0.0.0/8')).toBe(true);
    });

    test('should validate valid IPv6 CIDR', () => {
      expect(validateCIDR('2001:db8::/32')).toBe(true);
      expect(validateCIDR('fe80::/10')).toBe(true);
    });

    test('should reject invalid IPv4 CIDR', () => {
      expect(validateCIDR('256.1.1.1/24')).toBe(false);
      expect(validateCIDR('192.168.1.0/33')).toBe(false);
      expect(validateCIDR('192.168.1.0')).toBe(false);
    });

    test('should reject invalid IPv6 CIDR', () => {
      expect(validateCIDR('gggg::/32')).toBe(false);
      expect(validateCIDR('2001:db8::/129')).toBe(false);
      expect(validateCIDR('2001:db8::')).toBe(false);
    });

    test('should reject malformed CIDR strings', () => {
      expect(validateCIDR('')).toBe(false);
      expect(validateCIDR('invalid')).toBe(false);
      expect(validateCIDR('/24')).toBe(false);
      expect(validateCIDR('192.168.1.0/')).toBe(false);
    });
  });
});