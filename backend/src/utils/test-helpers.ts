/**
 * Test helper functions
 */

export async function createTestTenant(): Promise<string> {
  return 'test-tenant';
}

export async function destroyTestTenant(_tenantSlug: string): Promise<void> {
  // Cleanup logic here
}
