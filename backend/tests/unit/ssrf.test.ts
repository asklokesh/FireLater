import { describe, it, expect } from 'vitest';
import { validateUrlForSSRF, validateUrlForSSRFSync } from '../../src/utils/ssrf.js';
import { BadRequestError } from '../../src/utils/errors.js';

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

    // Note: DNS resolution tests are more complex and may require mocking
    // or network access, so we keep them minimal here
  });
});
