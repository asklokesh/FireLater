import { test, describe, beforeEach, afterEach } from 'node:test';
import { mock, restore, capture } from 'sinon';
import { build } from '../helper.js';
import { validateCIDR } from '../middleware/auth.js';
import assert from 'node:assert';

describe('Auth Routes', () => {
  let app: any;

  beforeEach(async () => {
    app = await build();
  });

  afterEach(() => {
    restore();
  });

  describe('POST /api/v1/auth/login', () => {
    test('should reject invalid IPv4 CIDR ranges', async (t) => {
      // Test cases for invalid IPv4 CIDR
      const invalidIPv4Cases = [
        '192.168.1.1',        // Missing range
        '192.168.1.1/33',     // Invalid range (>32)
        '192.168.1.1/-1',     // Negative range
        '192.168.1.1/abc',    // Non-numeric range
        '256.168.1.1/24',     // Invalid IP octet
        '192.168.1.1/24/8',   // Too many parts
      ];

      for (const cidr of invalidIPv4Cases) {
        assert.strictEqual(validateCIDR(cidr), false, `Should reject invalid IPv4 CIDR: ${cidr}`);
      }
    });

    test('should reject invalid IPv6 CIDR ranges', async (t) => {
      // Test cases for invalid IPv6 CIDR
      const invalidIPv6Cases = [
        '2001:db8::1',             // Missing range
        '2001:db8::1/129',         // Invalid range (>128)
        '2001:db8::1/-1',          // Negative range
        '2001:db8::1/abc',         // Non-numeric range
        '2001:db8::1/64/8',        // Too many parts
        '2001:db8::::1/64',        // Invalid IPv6 format
      ];

      for (const cidr of invalidIPv6Cases) {
        assert.strictEqual(validateCIDR(cidr), false, `Should reject invalid IPv6 CIDR: ${cidr}`);
      }
    });

    test('should accept valid IPv4 CIDR ranges', async (t) => {
      // Test cases for valid IPv4 CIDR
      const validIPv4Cases = [
        '192.168.1.1/24',
        '10.0.0.0/8',
        '172.16.0.0/12',
        '192.168.1.1/32',
        '0.0.0.0/0',
      ];

      for (const cidr of validIPv4Cases) {
        assert.strictEqual(validateCIDR(cidr), true, `Should accept valid IPv4 CIDR: ${cidr}`);
      }
    });

    test('should accept valid IPv6 CIDR ranges', async (t) => {
      // Test cases for valid IPv6 CIDR
      const validIPv6Cases = [
        '2001:db8::1/64',
        '2001:db8::/32',
        'fe80::/10',
        '::1/128',
        '::/0',
      ];

      for (const cidr of validIPv6Cases) {
        assert.strictEqual(validateCIDR(cidr), true, `Should accept valid IPv6 CIDR: ${cidr}`);
      }
    });

    test('should handle edge cases in CIDR validation', async (t) => {
      // Edge cases
      const edgeCases = [
        ['', false],              // Empty string
        ['   ', false],           // Whitespace only
        ['192.168.1.1/24 ', true], // Trailing space (should be trimmed)
        [' 192.168.1.1/24', true], // Leading space (should be trimmed)
      ];

      for (const [cidr, expected] of edgeCases) {
        assert.strictEqual(validateCIDR(cidr as string), expected as boolean, `Should handle edge case: "${cidr}"`);
      }
    });
  });
});