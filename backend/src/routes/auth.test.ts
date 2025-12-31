import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { validateCIDR } from '../middleware/auth.js';

describe('Auth Route Validation', () => {
  describe('CIDR Validation', () => {
    test('should validate correct IPv4 CIDRs', () => {
      assert.equal(validateCIDR('192.168.1.0/24'), true);
      assert.equal(validateCIDR('10.0.0.0/8'), true);
      assert.equal(validateCIDR('172.16.0.0/12'), true);
    });

    test('should validate correct IPv6 CIDRs', () => {
      assert.equal(validateCIDR('2001:db8::/32'), true);
      assert.equal(validateCIDR('fe80::/10'), true);
      assert.equal(validateCIDR('::1/128'), true);
    });

    test('should reject malformed IPv4 CIDRs', () => {
      assert.equal(validateCIDR('192.168.1.0/33'), false); // Invalid range
      assert.equal(validateCIDR('256.168.1.0/24'), false); // Invalid IP
      assert.equal(validateCIDR('192.168.1.0/'), false); // Missing range
      assert.equal(validateCIDR('192.168.1.0'), false); // Missing range
      assert.equal(validateCIDR('192.168.1.0/-1'), false); // Negative range
    });

    test('should reject malformed IPv6 CIDRs', () => {
      assert.equal(validateCIDR('2001:db8::/129'), false); // Invalid range
      assert.equal(validateCIDR('gggg:db8::/32'), false); // Invalid address
      assert.equal(validateCIDR('2001:db8::/'), false); // Missing range
      assert.equal(validateCIDR('2001:db8::'), false); // Missing range
      assert.equal(validateCIDR('2001:db8::/-1'), false); // Negative range
    });

    test('should handle boundary conditions', () => {
      // Test IPv4 boundary ranges
      assert.equal(validateCIDR('0.0.0.0/0'), true); // Default route
      assert.equal(validateCIDR('0.0.0.0/32'), true); // Host route
      assert.equal(validateCIDR('255.255.255.255/32'), true); // Broadcast
      
      // Test IPv6 boundary ranges
      assert.equal(validateCIDR('::/0'), true); // Default route
      assert.equal(validateCIDR('::/128'), true); // Host route
      assert.equal(validateCIDR('ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff/128'), true); // Max address
    });

    test('should reject non-CIDR strings', () => {
      assert.equal(validateCIDR(''), false);
      assert.equal(validateCIDR('random-string'), false);
      assert.equal(validateCIDR('192.168.1.1, 10.0.0.1'), false);
      assert.equal(validateCIDR(null as any), false);
      assert.equal(validateCIDR(undefined as any), false);
    });
  });
});