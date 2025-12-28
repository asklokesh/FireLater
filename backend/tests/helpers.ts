import Fastify, { FastifyInstance } from 'fastify';
import jwt from '@fastify/jwt';
import cookie from '@fastify/cookie';

export interface TestUser {
  userId: string;
  email: string;
  tenantSlug: string;
  roles: string[];
}

export const testTenant = {
  id: 'test-tenant-id',
  slug: 'test-org',
  name: 'Test Organization',
  schemaName: 'tenant_test_org',
};

export const testUser: TestUser = {
  userId: 'test-user-id',
  email: 'test@example.com',
  tenantSlug: 'test-org',
  roles: ['admin'],
};

export async function createTestApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  await app.register(cookie, {
    secret: 'test-cookie-secret',
  });

  await app.register(jwt, {
    secret: 'test-jwt-secret-for-testing-only-at-least-32-chars',
    sign: { expiresIn: '1h' },
  });

  return app;
}

export function generateTestToken(app: FastifyInstance, user: TestUser = testUser): string {
  return app.jwt.sign({
    userId: user.userId,
    email: user.email,
    tenantSlug: user.tenantSlug,
    roles: user.roles,
  });
}

export function createAuthHeader(token: string): { authorization: string } {
  return { authorization: `Bearer ${token}` };
}

export const mockIssue = {
  id: 'issue-123',
  number: 'INC0000001',
  title: 'Test Issue',
  description: 'This is a test issue',
  status: 'new',
  priority: 3,
  urgency: 3,
  impact: 3,
  type: 'incident',
  reporter_id: testUser.userId,
  assignee_id: null,
  application_id: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

export const mockChange = {
  id: 'change-123',
  number: 'CHG0000001',
  title: 'Test Change Request',
  description: 'This is a test change request',
  status: 'draft',
  type: 'normal',
  risk: 'medium',
  impact: 'medium',
  requester_id: testUser.userId,
  owner_id: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

export const mockApplication = {
  id: 'app-123',
  name: 'Test Application',
  slug: 'test-app',
  description: 'Test application for testing',
  criticality: 'medium',
  status: 'active',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};
