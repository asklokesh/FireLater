import { validateCIDR } from '../middleware/auth';

// Add tests for validateCIDR function
test('validateCIDR should return true for valid IPv4 CIDR', async () => {
  expect(validateCIDR('192.168.1.0/24')).toBe(true);
});

test('validateCIDR should return true for valid IPv6 CIDR', async () => {
  expect(validateCIDR('2001:db8::/32')).toBe(true);
});

test('validateCIDR should return false for invalid CIDR', async () => {
  expect(validateCIDR('invalid-cidr')).toBe(false);
  expect(validateCIDR('192.168.1.0/33')).toBe(false); // Invalid IPv4 range
  expect(validateCIDR('2001:db8::/129')).toBe(false); // Invalid IPv6 range
});

// Add tests for error handling paths in auth routes
test('POST /auth/login should fail with invalid IP range', async () => {
  const response = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: {
      email: 'test@example.com',
      password: 'password123',
      ipRange: 'invalid-cidr'
    }
  });
  
  expect(response.statusCode).toBe(400);
  expect(JSON.parse(response.body).message).toBe('Invalid IP range specified');
});

test('POST /auth/login should handle service errors properly', async () => {
  // Mock the authService to throw an error
  const authService = require('../services/authService');
  const originalLogin = authService.login;
  authService.login = jest.fn().mockRejectedValue(new Error('Database connection failed'));
  
  const response = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: {
      email: 'test@example.com',
      password: 'password123'
    }
  });
  
  expect(response.statusCode).toBe(500);
  expect(JSON.parse(response.body).message).toBe('Authentication failed');
  
  // Restore original function
  authService.login = originalLogin;
});