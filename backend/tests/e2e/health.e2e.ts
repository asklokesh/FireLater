import { test, expect } from '@playwright/test';

/**
 * E2E tests for API health endpoints
 * These tests verify the API is running and responding correctly
 */
test.describe('Health API Endpoints', () => {
  test('should return health status', async ({ request }) => {
    const response = await request.get('/health');

    expect(response.ok()).toBeTruthy();
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty('status');
    expect(body.status).toBe('ok');
  });

  test('should return database health status', async ({ request }) => {
    const response = await request.get('/health/db');

    expect(response.ok()).toBeTruthy();
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty('status');
    expect(body).toHaveProperty('database');
  });

  test('should return Redis health status', async ({ request }) => {
    const response = await request.get('/health/redis');

    expect(response.ok()).toBeTruthy();
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty('status');
    expect(body).toHaveProperty('redis');
  });
});
