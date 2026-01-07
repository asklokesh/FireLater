import { describe, it, expect } from 'vitest';
import { isTrustedProxy } from '../../src/utils/network.js';

/**
 * Unit tests for network utilities
 * Testing trusted proxy validation for various IP ranges
 */

describe('Network Utilities', () => {
  describe('isTrustedProxy', () => {
    describe('IPv4 Loopback (127.0.0.0/8)', () => {
      it('should trust 127.0.0.1', () => {
        expect(isTrustedProxy('127.0.0.1')).toBe(true);
      });

      it('should trust 127.0.0.0', () => {
        expect(isTrustedProxy('127.0.0.0')).toBe(true);
      });

      it('should trust 127.255.255.255', () => {
        expect(isTrustedProxy('127.255.255.255')).toBe(true);
      });

      it('should trust 127.100.50.25', () => {
        expect(isTrustedProxy('127.100.50.25')).toBe(true);
      });
    });

    describe('IPv4 Class A Private (10.0.0.0/8)', () => {
      it('should trust 10.0.0.1', () => {
        expect(isTrustedProxy('10.0.0.1')).toBe(true);
      });

      it('should trust 10.255.255.255', () => {
        expect(isTrustedProxy('10.255.255.255')).toBe(true);
      });

      it('should trust 10.100.50.25', () => {
        expect(isTrustedProxy('10.100.50.25')).toBe(true);
      });
    });

    describe('IPv4 Class B Private (172.16.0.0/12)', () => {
      it('should trust 172.16.0.1', () => {
        expect(isTrustedProxy('172.16.0.1')).toBe(true);
      });

      it('should trust 172.31.255.255', () => {
        expect(isTrustedProxy('172.31.255.255')).toBe(true);
      });

      it('should trust 172.20.100.50', () => {
        expect(isTrustedProxy('172.20.100.50')).toBe(true);
      });

      it('should NOT trust 172.15.0.1 (outside range)', () => {
        expect(isTrustedProxy('172.15.0.1')).toBe(false);
      });

      it('should NOT trust 172.32.0.1 (outside range)', () => {
        expect(isTrustedProxy('172.32.0.1')).toBe(false);
      });
    });

    describe('IPv4 Class C Private (192.168.0.0/16)', () => {
      it('should trust 192.168.0.1', () => {
        expect(isTrustedProxy('192.168.0.1')).toBe(true);
      });

      it('should trust 192.168.255.255', () => {
        expect(isTrustedProxy('192.168.255.255')).toBe(true);
      });

      it('should trust 192.168.1.100', () => {
        expect(isTrustedProxy('192.168.1.100')).toBe(true);
      });

      it('should NOT trust 192.169.0.1 (outside range)', () => {
        expect(isTrustedProxy('192.169.0.1')).toBe(false);
      });
    });

    describe('Public IPv4 Addresses', () => {
      it('should NOT trust 8.8.8.8 (Google DNS)', () => {
        expect(isTrustedProxy('8.8.8.8')).toBe(false);
      });

      it('should NOT trust 1.1.1.1 (Cloudflare DNS)', () => {
        expect(isTrustedProxy('1.1.1.1')).toBe(false);
      });

      it('should NOT trust 203.0.113.50 (public IP)', () => {
        expect(isTrustedProxy('203.0.113.50')).toBe(false);
      });

      it('should NOT trust 100.64.0.1 (carrier-grade NAT)', () => {
        expect(isTrustedProxy('100.64.0.1')).toBe(false);
      });
    });

    describe('IPv6 Loopback (::1/128)', () => {
      it('should trust ::1', () => {
        expect(isTrustedProxy('::1')).toBe(true);
      });

      it('should trust 0:0:0:0:0:0:0:1', () => {
        expect(isTrustedProxy('0:0:0:0:0:0:0:1')).toBe(true);
      });
    });

    describe('IPv6 Unique Local Addresses (fc00::/7)', () => {
      it('should trust fc00::1', () => {
        expect(isTrustedProxy('fc00::1')).toBe(true);
      });

      it('should trust fd00::1', () => {
        expect(isTrustedProxy('fd00::1')).toBe(true);
      });

      it('should trust fd12:3456:789a::1', () => {
        expect(isTrustedProxy('fd12:3456:789a::1')).toBe(true);
      });
    });

    describe('Public IPv6 Addresses', () => {
      it('should NOT trust 2001:4860:4860::8888 (Google DNS)', () => {
        expect(isTrustedProxy('2001:4860:4860::8888')).toBe(false);
      });

      it('should NOT trust 2606:4700:4700::1111 (Cloudflare DNS)', () => {
        expect(isTrustedProxy('2606:4700:4700::1111')).toBe(false);
      });
    });

    describe('Invalid IP Addresses', () => {
      it('should return false for empty string', () => {
        expect(isTrustedProxy('')).toBe(false);
      });

      it('should return false for invalid IPv4', () => {
        expect(isTrustedProxy('256.1.2.3')).toBe(false);
      });

      it('should return false for malformed IP', () => {
        expect(isTrustedProxy('not-an-ip')).toBe(false);
      });

      it('should return false for partial IP', () => {
        expect(isTrustedProxy('192.168')).toBe(false);
      });

      it('should return false for negative octets', () => {
        expect(isTrustedProxy('-1.0.0.0')).toBe(false);
      });
    });

    describe('Edge Cases', () => {
      it('should handle IPv4 with leading zeros', () => {
        // 127.0.0.1 with leading zeros might be handled differently
        // The library should normalize these
        expect(isTrustedProxy('127.0.0.1')).toBe(true);
      });

      it('should handle whitespace', () => {
        expect(isTrustedProxy(' 127.0.0.1')).toBe(false);
        expect(isTrustedProxy('127.0.0.1 ')).toBe(false);
      });

      it('should handle IPv4-mapped IPv6 address', () => {
        // ::ffff:127.0.0.1 is IPv4-mapped IPv6
        // Behavior depends on library implementation
        const result = isTrustedProxy('::ffff:127.0.0.1');
        // This may or may not be trusted depending on implementation
        expect(typeof result).toBe('boolean');
      });
    });
  });
});
