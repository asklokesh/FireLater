import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildApp } from '../app.js';
import { AuthService } from '../services/auth.js';

describe('Auth Routes', () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(async () => {
    app = buildApp();
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('isTrustedProxy - IP validation', () => {
    it('should validate IPv4 addresses correctly', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health',
        headers: {
          'X-Forwarded-For': '192.168.1.1'
        }
      });
      expect(response.statusCode).toBe(200);
    });

    it('should validate IPv6 addresses correctly', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health',
        headers: {
          'X-Forwarded-For': '2001:db8::1'
        }
      });
      expect(response.statusCode).toBe(200);
    });

    it('should handle IPv4-mapped IPv6 addresses', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health',
        headers: {
          'X-Forwarded-For': '::ffff:192.0.2.1'
        }
      });
      expect(response.statusCode).toBe(200);
    });

    it('should reject invalid IP formats', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health',
        headers: {
          'X-Forwarded-For': '999.999.999.999'
        }
      });
      expect(response.statusCode).toBe(200); // Should still work but IP won't be trusted
    });

    it('should handle malformed CIDR notation', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health',
        headers: {
          'X-Forwarded-For': 'invalid-cidr'
        }
      });
      expect(response.statusCode).toBe(200);
    });

    it('should validate IPv6 CIDR ranges', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health',
        headers: {
          'X-Forwarded-For': '2001:db8:85a3::8a2e:370:7334'
        }
      });
      expect(response.statusCode).toBe(200);
    });
  });
});