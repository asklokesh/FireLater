import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import buildServer from '../app.js';

describe('Auth Routes', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;

  before(async () => {
    app = await buildServer();
  });

  after(async () => {
    await app.close();
  });

  describe('POST /login', () => {
    test('should reject login with invalid IPv4 CIDR', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: 'user@example.com',
          password: 'password123',
          ipRestriction: '999.999.999.999/32'
        }
      });
      
      assert.equal(response.statusCode, 400);
      const body = JSON.parse(response.body);
      assert.equal(body.message, 'Invalid IP range specified');
    });

    test('should reject login with invalid IPv6 CIDR', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: 'user@example.com',
          password: 'password123',
          ipRestriction: 'invalid::ipv6::address/128'
        }
      });
      
      assert.equal(response.statusCode, 400);
      const body = JSON.parse(response.body);
      assert.equal(body.message, 'Invalid IP range specified');
    });

    test('should reject login with out-of-range IPv4 prefix', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: 'user@example.com',
          password: 'password123',
          ipRestriction: '192.168.1.0/33'
        }
      });
      
      assert.equal(response.statusCode, 400);
      const body = JSON.parse(response.body);
      assert.equal(body.message, 'Invalid IP range specified');
    });

    test('should reject login with out-of-range IPv6 prefix', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: 'user@example.com',
          password: 'password123',
          ipRestriction: '2001:db8::/129'
        }
      });
      
      assert.equal(response.statusCode, 400);
      const body = JSON.parse(response.body);
      assert.equal(body.message, 'Invalid IP range specified');
    });

    test('should reject login with malformed CIDR (missing slash)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: 'user@example.com',
          password: 'password123',
          ipRestriction: '192.168.1.0'
        }
      });
      
      assert.equal(response.statusCode, 400);
      const body = JSON.parse(response.body);
      assert.equal(body.message, 'Invalid IP range specified');
    });

    test('should reject login with malformed CIDR (non-numeric prefix)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: 'user@example.com',
          password: 'password123',
          ipRestriction: '192.168.1.0/abc'
        }
      });
      
      assert.equal(response.statusCode, 400);
      const body = JSON.parse(response.body);
      assert.equal(body.message, 'Invalid IP range specified');
    });

    test('should accept login with valid IPv4 CIDR', async () => {
      // Mock successful authentication
      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: 'user@example.com',
          password: 'password123',
          ipRestriction: '192.168.1.0/24'
        }
      });
      
      // Should either succeed or fail for authentication reasons, not CIDR validation
      assert.notEqual(response.statusCode, 400);
    });

    test('should accept login with valid IPv6 CIDR', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: 'user@example.com',
          password: 'password123',
          ipRestriction: '2001:db8::/32'
        }
      });
      
      assert.notEqual(response.statusCode, 400);
    });
  });
});