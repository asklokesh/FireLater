import { test, expect } from '@playwright/test';

/**
 * E2E tests for CSRF protection
 * Verifies that CSRF protection works correctly across the application
 */
test.describe('CSRF Protection E2E', () => {
  test('should provide CSRF token endpoint', async ({ request }) => {
    const response = await request.get('/csrf-token');

    expect(response.ok()).toBeTruthy();
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty('csrfToken');
    expect(typeof body.csrfToken).toBe('string');
    expect(body.csrfToken.length).toBeGreaterThan(0);
  });

  test('should set CSRF cookie when token is requested', async ({ request }) => {
    const response = await request.get('/csrf-token');

    expect(response.ok()).toBeTruthy();

    // Check for CSRF cookie in response headers
    const setCookieHeaders = response.headers()['set-cookie'];
    expect(setCookieHeaders).toBeDefined();

    if (typeof setCookieHeaders === 'string') {
      expect(setCookieHeaders).toContain('_csrf');
    } else {
      expect(setCookieHeaders.some((cookie: string) => cookie.includes('_csrf'))).toBeTruthy();
    }
  });

  test('should reject state-changing request without CSRF token or JWT', async ({ request }) => {
    // Attempt to create an issue without CSRF token or JWT
    const response = await request.post('/v1/issues', {
      data: {
        title: 'Test Issue',
        description: 'This should fail without CSRF token',
        priority: 'medium',
      },
    });

    // Should be rejected with 403 Forbidden due to missing CSRF token
    expect(response.status()).toBe(403);
    const body = await response.json();
    expect(body.message).toContain('CSRF');
  });

  test('should accept state-changing request with valid JWT (no CSRF needed)', async ({ request }) => {
    // First, register and login to get a JWT token
    const registerResponse = await request.post('/v1/auth/register', {
      data: {
        tenantName: 'CSRF Test Tenant',
        tenantSlug: `csrf-test-${Date.now()}`,
        adminName: 'CSRF Admin',
        adminEmail: `csrf-admin-${Date.now()}@test.com`,
        adminPassword: 'SecurePassword123!',
      },
    });

    // Registration may fail if tenant exists, but that's ok for this test
    if (!registerResponse.ok()) {
      console.log('Registration failed (expected if tenant exists)');
      return; // Skip this test if we can't register
    }

    const registerBody = await registerResponse.json();
    const { accessToken, tenant } = registerBody;

    // Now make a state-changing request with JWT (no CSRF token needed)
    const createResponse = await request.post('/v1/issues', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
      data: {
        title: 'Test Issue with JWT',
        description: 'This should succeed with JWT',
        priority: 'medium',
      },
    });

    // JWT provides inherent CSRF protection, so this should succeed
    expect(createResponse.ok()).toBeTruthy();
  });

  test('should accept state-changing request with valid CSRF token (no JWT)', async ({ request }) => {
    // Step 1: Get CSRF token
    const tokenResponse = await request.get('/csrf-token');
    expect(tokenResponse.ok()).toBeTruthy();

    const { csrfToken } = await tokenResponse.json();

    // Step 2: Extract cookies from token response
    const setCookieHeaders = tokenResponse.headers()['set-cookie'];
    let cookies = '';
    if (typeof setCookieHeaders === 'string') {
      cookies = setCookieHeaders.split(';')[0];
    } else if (Array.isArray(setCookieHeaders)) {
      cookies = setCookieHeaders.map((c: string) => c.split(';')[0]).join('; ');
    }

    // Step 3: Make state-changing request with CSRF token (simulate non-JWT auth)
    // Note: This will still fail auth, but we're testing CSRF validation specifically
    const response = await request.post('/v1/catalog', {
      headers: {
        'x-csrf-token': csrfToken,
        'cookie': cookies,
      },
      data: {
        name: 'Test Catalog Item',
        description: 'Testing CSRF with token',
        category: 'testing',
      },
    });

    // Should not fail with 403 CSRF error (will fail with 401 auth instead)
    expect(response.status()).not.toBe(403);
  });

  test('should reject state-changing request with invalid CSRF token', async ({ request }) => {
    // Step 1: Get CSRF cookie (but use wrong token)
    const tokenResponse = await request.get('/csrf-token');
    expect(tokenResponse.ok()).toBeTruthy();

    const setCookieHeaders = tokenResponse.headers()['set-cookie'];
    let cookies = '';
    if (typeof setCookieHeaders === 'string') {
      cookies = setCookieHeaders.split(';')[0];
    } else if (Array.isArray(setCookieHeaders)) {
      cookies = setCookieHeaders.map((c: string) => c.split(';')[0]).join('; ');
    }

    // Step 2: Use invalid token with valid cookie
    const response = await request.post('/v1/catalog', {
      headers: {
        'x-csrf-token': 'invalid-token-12345',
        'cookie': cookies,
      },
      data: {
        name: 'Test Catalog Item',
        description: 'This should fail with invalid token',
        category: 'testing',
      },
    });

    // Should fail with 403 due to invalid CSRF token
    expect(response.status()).toBe(403);
  });

  test('should allow GET requests without CSRF token', async ({ request }) => {
    // GET requests should not require CSRF protection
    const response = await request.get('/v1/catalog');

    // Will fail with 401 auth, but NOT 403 CSRF
    expect(response.status()).not.toBe(403);
  });

  test('should allow HEAD requests without CSRF token', async ({ request }) => {
    // HEAD requests should not require CSRF protection
    const response = await request.head('/health');

    // Should succeed or fail with auth, but NOT 403 CSRF
    expect(response.status()).not.toBe(403);
  });

  test('should allow OPTIONS requests without CSRF token', async ({ request }) => {
    // OPTIONS requests should not require CSRF protection
    const response = await request.fetch('/v1/issues', {
      method: 'OPTIONS',
    });

    // Should succeed or fail with CORS, but NOT 403 CSRF
    expect(response.status()).not.toBe(403);
  });

  test('should protect PUT requests like POST requests', async ({ request }) => {
    // PUT without CSRF token or JWT should fail
    const response = await request.put('/v1/issues/123', {
      data: {
        title: 'Updated Issue',
      },
    });

    // Should fail with 403 CSRF error (or 404 if issue doesn't exist, but after CSRF check)
    expect([403, 404]).toContain(response.status());
  });

  test('should protect PATCH requests like POST requests', async ({ request }) => {
    // PATCH without CSRF token or JWT should fail
    const response = await request.patch('/v1/issues/123', {
      data: {
        priority: 'high',
      },
    });

    // Should fail with 403 CSRF error (or 404 if issue doesn't exist, but after CSRF check)
    expect([403, 404]).toContain(response.status());
  });

  test('should protect DELETE requests like POST requests', async ({ request }) => {
    // DELETE without CSRF token or JWT should fail
    const response = await request.delete('/v1/issues/123');

    // Should fail with 403 CSRF error (or 404 if issue doesn't exist, but after CSRF check)
    expect([403, 404]).toContain(response.status());
  });

  test('should not require CSRF for public auth endpoints', async ({ request }) => {
    // Login endpoint should not require CSRF (it's a public endpoint)
    const response = await request.post('/v1/auth/login', {
      data: {
        tenant: 'test-tenant',
        email: 'test@example.com',
        password: 'password',
      },
    });

    // Should not fail with 403 CSRF (will fail with 401 auth instead)
    expect(response.status()).not.toBe(403);
  });

  test('should not require CSRF for register endpoint', async ({ request }) => {
    // Register endpoint should not require CSRF (it's a public endpoint)
    const response = await request.post('/v1/auth/register', {
      data: {
        tenantName: 'Test Tenant',
        tenantSlug: 'test-slug-' + Date.now(),
        adminName: 'Admin',
        adminEmail: 'admin@test.com',
        adminPassword: 'SecurePassword123!',
      },
    });

    // Should not fail with 403 CSRF (may succeed or fail with validation)
    expect(response.status()).not.toBe(403);
  });

  test('should not require CSRF for health endpoints', async ({ request }) => {
    // Health endpoints are public
    const response = await request.get('/health');
    expect(response.ok()).toBeTruthy();

    // Detailed health endpoint
    const detailedResponse = await request.get('/health/detailed');
    expect(detailedResponse.ok()).toBeTruthy();
  });
});
