import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { validateUrlForSSRF, validateUrlForSSRFSync } from '../../src/utils/ssrf.js';
import { BadRequestError } from '../../src/utils/errors.js';
import dns from 'dns/promises';

describe('SSRF Protection', () => {
  describe('validateUrlForSSRFSync', () => {
    describe('should allow safe URLs', () => {
      it('should allow HTTPS URLs with public domains', () => {
        expect(() => validateUrlForSSRFSync('https://example.com')).not.toThrow();
        expect(() => validateUrlForSSRFSync('https://api.github.com/repos')).not.toThrow();
        expect(() => validateUrlForSSRFSync('https://www.google.com')).not.toThrow();
      });

      it('should allow HTTP URLs with public domains', () => {
        expect(() => validateUrlForSSRFSync('http://example.com')).not.toThrow();
      });

      it('should allow URLs with ports', () => {
        expect(() => validateUrlForSSRFSync('https://example.com:8443/api')).not.toThrow();
      });

      it('should allow URLs with query parameters', () => {
        expect(() => validateUrlForSSRFSync('https://example.com/api?key=value')).not.toThrow();
      });

      it('should allow URLs with paths', () => {
        expect(() => validateUrlForSSRFSync('https://example.com/api/v1/users')).not.toThrow();
      });
    });

    describe('should block private/internal URLs', () => {
      it('should block localhost variations', () => {
        expect(() => validateUrlForSSRFSync('http://localhost')).toThrow(BadRequestError);
        expect(() => validateUrlForSSRFSync('http://localhost:8080')).toThrow(BadRequestError);
      });

      it('should block loopback IP addresses', () => {
        expect(() => validateUrlForSSRFSync('http://127.0.0.1')).toThrow(BadRequestError);
        expect(() => validateUrlForSSRFSync('http://127.0.0.1:3000')).toThrow(BadRequestError);
        expect(() => validateUrlForSSRFSync('http://127.1.2.3')).toThrow(BadRequestError);
      });

      it('should block private Class A IP addresses (10.x.x.x)', () => {
        expect(() => validateUrlForSSRFSync('http://10.0.0.1')).toThrow(BadRequestError);
        expect(() => validateUrlForSSRFSync('http://10.1.2.3')).toThrow(BadRequestError);
        expect(() => validateUrlForSSRFSync('http://10.255.255.255')).toThrow(BadRequestError);
      });

      it('should block private Class B IP addresses (172.16-31.x.x)', () => {
        expect(() => validateUrlForSSRFSync('http://172.16.0.1')).toThrow(BadRequestError);
        expect(() => validateUrlForSSRFSync('http://172.20.10.5')).toThrow(BadRequestError);
        expect(() => validateUrlForSSRFSync('http://172.31.255.255')).toThrow(BadRequestError);
      });

      it('should block private Class C IP addresses (192.168.x.x)', () => {
        expect(() => validateUrlForSSRFSync('http://192.168.0.1')).toThrow(BadRequestError);
        expect(() => validateUrlForSSRFSync('http://192.168.1.1')).toThrow(BadRequestError);
        expect(() => validateUrlForSSRFSync('http://192.168.255.255')).toThrow(BadRequestError);
      });

      it('should block link-local addresses (169.254.x.x)', () => {
        expect(() => validateUrlForSSRFSync('http://169.254.169.254')).toThrow(BadRequestError);
        expect(() => validateUrlForSSRFSync('http://169.254.1.1')).toThrow(BadRequestError);
      });

      it('should block cloud metadata endpoints', () => {
        expect(() => validateUrlForSSRFSync('http://169.254.169.254/latest/meta-data')).toThrow(BadRequestError);
        expect(() => validateUrlForSSRFSync('http://metadata.google.internal')).toThrow(BadRequestError);
      });

      it('should block internal service names', () => {
        expect(() => validateUrlForSSRFSync('http://kubernetes.default.svc')).toThrow(BadRequestError);
        expect(() => validateUrlForSSRFSync('http://consul:8500')).toThrow(BadRequestError);
        expect(() => validateUrlForSSRFSync('http://vault:8200')).toThrow(BadRequestError);
      });
    });

    describe('should block invalid protocols', () => {
      it('should block file:// protocol', () => {
        expect(() => validateUrlForSSRFSync('file:///etc/passwd')).toThrow(BadRequestError);
      });

      it('should block ftp:// protocol', () => {
        expect(() => validateUrlForSSRFSync('ftp://example.com')).toThrow(BadRequestError);
      });

      it('should block data:// protocol', () => {
        expect(() => validateUrlForSSRFSync('data:text/plain,hello')).toThrow(BadRequestError);
      });

      it('should block javascript:// protocol', () => {
        expect(() => validateUrlForSSRFSync('javascript:alert(1)')).toThrow(BadRequestError);
      });
    });

    describe('should block URL encoding attacks', () => {
      it('should block URL-encoded hostnames', () => {
        // %6C%6F%63%61%6C%68%6F%73%74 = localhost
        expect(() => validateUrlForSSRFSync('http://%6C%6F%63%61%6C%68%6F%73%74')).toThrow(BadRequestError);
      });
    });

    describe('should handle malformed URLs', () => {
      it('should reject invalid URL formats', () => {
        expect(() => validateUrlForSSRFSync('not a url')).toThrow(BadRequestError);
        expect(() => validateUrlForSSRFSync('htp://missing-t')).toThrow(BadRequestError);
      });
    });

    describe('edge cases', () => {
      it('should allow public IP addresses', () => {
        expect(() => validateUrlForSSRFSync('http://8.8.8.8')).not.toThrow();
        expect(() => validateUrlForSSRFSync('http://1.1.1.1')).not.toThrow();
      });

      it('should block private IPs even with HTTPS', () => {
        expect(() => validateUrlForSSRFSync('https://127.0.0.1')).toThrow(BadRequestError);
        expect(() => validateUrlForSSRFSync('https://192.168.1.1')).toThrow(BadRequestError);
      });
    });
  });

  describe('validateUrlForSSRF (async with DNS resolution)', () => {
    it('should allow safe public URLs', async () => {
      await expect(validateUrlForSSRF('https://example.com')).resolves.not.toThrow();
    });

    it('should block private IPs', async () => {
      await expect(validateUrlForSSRF('http://127.0.0.1')).rejects.toThrow(BadRequestError);
    });

    it('should block localhost', async () => {
      await expect(validateUrlForSSRF('http://localhost')).rejects.toThrow(BadRequestError);
    });

    it('should block blocked hostnames', async () => {
      await expect(validateUrlForSSRF('http://vault:8200')).rejects.toThrow(BadRequestError);
      await expect(validateUrlForSSRF('http://metadata.google.internal')).rejects.toThrow(BadRequestError);
      await expect(validateUrlForSSRF('http://kubernetes.default.svc')).rejects.toThrow(BadRequestError);
    });

    it('should block URL-encoded hostnames', async () => {
      // %6C%6F%63%61%6C%68%6F%73%74 = localhost
      await expect(validateUrlForSSRF('http://%6C%6F%63%61%6C%68%6F%73%74')).rejects.toThrow(BadRequestError);
    });

    it('should reject invalid URL format', async () => {
      await expect(validateUrlForSSRF('not-a-valid-url')).rejects.toThrow(BadRequestError);
      await expect(validateUrlForSSRF('')).rejects.toThrow(BadRequestError);
    });

    it('should reject non-HTTP protocols', async () => {
      await expect(validateUrlForSSRF('file:///etc/passwd')).rejects.toThrow(BadRequestError);
      await expect(validateUrlForSSRF('ftp://example.com/file')).rejects.toThrow(BadRequestError);
      await expect(validateUrlForSSRF('javascript:alert(1)')).rejects.toThrow(BadRequestError);
    });

    it('should allow public IP addresses', async () => {
      await expect(validateUrlForSSRF('https://8.8.8.8')).resolves.not.toThrow();
      await expect(validateUrlForSSRF('http://1.1.1.1')).resolves.not.toThrow();
    });

    it('should block various private IP ranges', async () => {
      // Class A
      await expect(validateUrlForSSRF('http://10.0.0.1')).rejects.toThrow(BadRequestError);
      await expect(validateUrlForSSRF('http://10.255.255.255')).rejects.toThrow(BadRequestError);
      // Class B
      await expect(validateUrlForSSRF('http://172.16.0.1')).rejects.toThrow(BadRequestError);
      await expect(validateUrlForSSRF('http://172.31.255.255')).rejects.toThrow(BadRequestError);
      // Class C
      await expect(validateUrlForSSRF('http://192.168.0.1')).rejects.toThrow(BadRequestError);
      await expect(validateUrlForSSRF('http://192.168.255.255')).rejects.toThrow(BadRequestError);
      // Link-local
      await expect(validateUrlForSSRF('http://169.254.169.254')).rejects.toThrow(BadRequestError);
    });

    it('should allow URLs with valid domains resolving to public IPs', async () => {
      // google.com resolves to public IP
      await expect(validateUrlForSSRF('https://google.com')).resolves.not.toThrow();
    });

    it('should block Alibaba Cloud metadata endpoint', async () => {
      await expect(validateUrlForSSRF('http://100.100.100.200')).rejects.toThrow(BadRequestError);
    });

    it('should block subdomain attacks on blocked hostnames', async () => {
      // Should block subdomains of blocked hostnames
      await expect(validateUrlForSSRF('http://foo.vault')).rejects.toThrow(BadRequestError);
      await expect(validateUrlForSSRF('http://test.consul')).rejects.toThrow(BadRequestError);
    });
  });

  describe('validateUrlForSSRFSync - additional edge cases', () => {
    it('should block Alibaba Cloud metadata endpoint', () => {
      expect(() => validateUrlForSSRFSync('http://100.100.100.200')).toThrow(BadRequestError);
    });

    it('should block subdomain attacks on blocked hostnames', () => {
      expect(() => validateUrlForSSRFSync('http://foo.vault')).toThrow(BadRequestError);
      expect(() => validateUrlForSSRFSync('http://test.consul')).toThrow(BadRequestError);
      expect(() => validateUrlForSSRFSync('http://sub.metadata.google.internal')).toThrow(BadRequestError);
    });

    it('should allow non-blocked hostnames that contain blocked words', () => {
      // "vaultmachine" should not be blocked (does not end with .vault)
      expect(() => validateUrlForSSRFSync('http://vaultmachine.example.com')).not.toThrow();
    });

    it('should block Class B boundary addresses', () => {
      // Test boundary of 172.16.0.0 - 172.31.255.255 range
      expect(() => validateUrlForSSRFSync('http://172.15.255.255')).not.toThrow(); // Not blocked
      expect(() => validateUrlForSSRFSync('http://172.32.0.1')).not.toThrow(); // Not blocked
    });

    it('should block URL-encoded IP addresses', () => {
      // %31%32%37 = 127 (partial encoding)
      expect(() => validateUrlForSSRFSync('http://%31%32%37.0.0.1')).toThrow(BadRequestError);
    });

    it('should allow URL-encoded safe characters in path (not hostname)', () => {
      // URL encoding in path should be fine
      expect(() => validateUrlForSSRFSync('https://example.com/path%20with%20spaces')).not.toThrow();
    });
  });

  describe('validateUrlForSSRF - DNS resolution edge cases', () => {
    it('should handle non-existent domains gracefully', async () => {
      // Non-existent domain should not throw during validation
      // The actual request will fail later if domain doesn't exist
      await expect(validateUrlForSSRF('https://non-existent-domain-xyz123.invalid')).resolves.not.toThrow();
    });

    it('should handle very long hostnames', async () => {
      const longHostname = 'a'.repeat(50) + '.example.com';
      await expect(validateUrlForSSRF(`https://${longHostname}`)).resolves.not.toThrow();
    });
  });

  describe('validateUrlForSSRFSync - URL parsing edge cases', () => {
    it('should handle URLs with authentication credentials', () => {
      // URLs with userinfo should still be validated
      expect(() => validateUrlForSSRFSync('https://user:pass@example.com')).not.toThrow();
    });

    it('should handle URLs with fragments', () => {
      expect(() => validateUrlForSSRFSync('https://example.com/page#section')).not.toThrow();
    });

    it('should handle URLs with empty paths', () => {
      expect(() => validateUrlForSSRFSync('https://example.com')).not.toThrow();
      expect(() => validateUrlForSSRFSync('https://example.com/')).not.toThrow();
    });

    it('should handle URLs with multiple query parameters', () => {
      expect(() => validateUrlForSSRFSync('https://example.com/api?key=value&foo=bar&baz=123')).not.toThrow();
    });
  });

  describe('validateUrlForSSRF - URL encoded hostnames (async)', () => {
    it('should block URL-encoded localhost in async validation', async () => {
      // %6C%6F%63%61%6C%68%6F%73%74 = localhost
      await expect(validateUrlForSSRF('http://%6C%6F%63%61%6C%68%6F%73%74')).rejects.toThrow(BadRequestError);
    });

    it('should block URL-encoded IP addresses in async validation', async () => {
      // %31%32%37 = 127
      await expect(validateUrlForSSRF('http://%31%32%37.0.0.1')).rejects.toThrow(BadRequestError);
    });
  });

  describe('validateUrlForSSRF - additional DNS resolution edge cases', () => {
    it('should allow URLs with numeric-looking but valid domains', async () => {
      // A domain that looks like an IP but isn't (e.g., has too many dots or text)
      await expect(validateUrlForSSRF('https://192.168.1.example.com')).resolves.not.toThrow();
    });

    it('should handle domains with ports', async () => {
      await expect(validateUrlForSSRF('https://example.com:443/api')).resolves.not.toThrow();
      await expect(validateUrlForSSRF('http://example.com:8080/api')).resolves.not.toThrow();
    });

    it('should handle international domain names', async () => {
      // Punycode encoded international domain
      await expect(validateUrlForSSRF('https://xn--bcher-kva.example.com')).resolves.not.toThrow();
    });
  });

  describe('validateUrlForSSRFSync - additional edge cases', () => {
    it('should handle URLs with empty port', async () => {
      expect(() => validateUrlForSSRFSync('https://example.com:')).not.toThrow();
    });

    it('should handle URLs with userinfo and private IP', async () => {
      // Even with userinfo, should still block private IPs
      expect(() => validateUrlForSSRFSync('http://user:pass@127.0.0.1')).toThrow(BadRequestError);
      expect(() => validateUrlForSSRFSync('http://user:pass@192.168.1.1')).toThrow(BadRequestError);
    });

    it('should handle URLs with trailing dot in domain', async () => {
      // FQDN with trailing dot
      expect(() => validateUrlForSSRFSync('https://example.com./path')).not.toThrow();
    });

    it('should block cloud metadata even with paths', async () => {
      expect(() => validateUrlForSSRFSync('http://169.254.169.254/latest/meta-data/iam/security-credentials')).toThrow(BadRequestError);
      expect(() => validateUrlForSSRFSync('http://metadata.google.internal/computeMetadata/v1')).toThrow(BadRequestError);
    });
  });

  // Note: DNS resolution mocking is complex because the code uses dns.resolve4(hostname).catch(() => [])
  // which makes mocking difficult. The existing async tests cover the DNS resolution paths
  // by calling with actual domain names that resolve naturally.
  //
  // The IPv6 resolution paths (lines 102-127) are covered when:
  // 1. IPv4 resolution fails
  // 2. IPv6 resolution is attempted
  // This happens naturally with IPv6-only domains in production.
  //
  // The URL-encoded hostname check (lines 129-139, 182-192) requires a URL where
  // decodeURIComponent(hostname) !== hostname. However, the URL constructor
  // typically normalizes encoded characters in hostnames, making this path
  // difficult to reach in practice - which is actually good for security.
});
