import { test, describe, beforeEach, afterEach } from 'node:test';
import { deepEqual, equal, rejects } from 'node:assert';
import { FastifyInstance } from 'fastify';
import { buildTestServer } from '../helpers/server.js';
import { createTestTenant, removeTestTenant } from '../helpers/tenant.js';
import { workflowService } from '../../src/services/workflow.js';

describe('Workflow Routes', () => {
  let app: FastifyInstance;
  let tenantSlug: string;

  beforeEach(async () => {
    tenantSlug = await createTestTenant();
    app = await buildTestServer();
  });

  afterEach(async () => {
    await removeTestTenant(tenantSlug);
    await app.close();
  });

  describe('POST /api/workflows/:id/approvals', () => {
    test('should validate required approval fields', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/workflows/test-workflow-id/approvals',
        headers: {
          'x-tenant-slug': tenantSlug,
          'authorization': 'Bearer test-token'
        },
        payload: {}
      });

      equal(response.statusCode, 400);
      deepEqual(JSON.parse(response.body).message, 'body must have required property \'action\'');
    });

    test('should validate approval action values', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/workflows/test-workflow-id/approvals',
        headers: {
          'x-tenant-slug': tenantSlug,
          'authorization': 'Bearer test-token'
        },
        payload: {
          action: 'invalid-action'
        }
      });

      equal(response.statusCode, 400);
      deepEqual(JSON.parse(response.body).message, 'body/action must be equal to one of the allowed values');
    });

    test('should validate comment length', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/workflows/test-workflow-id/approvals',
        headers: {
          'x-tenant-slug': tenantSlug,
          'authorization': 'Bearer test-token'
        },
        payload: {
          action: 'approve',
          comment: 'a'.repeat(2001)
        }
      });

      equal(response.statusCode, 400);
      deepEqual(JSON.parse(response.body).message, 'body/comment must NOT have more than 2000 characters');
    });

    test('should process valid approval request', async () => {
      // Mock the service method
      const mockResult = { 
        id: 'approval-123', 
        status: 'approved',
        workflowId: 'test-workflow-id'
      };
      
      const serviceStub = (workflowService as any).processApproval = async () => mockResult;

      const response = await app.inject({
        method: 'POST',
        url: '/api/workflows/test-workflow-id/approvals',
        headers: {
          'x-tenant-slug': tenantSlug,
          'authorization': 'Bearer test-token'
        },
        payload: {
          action: 'approve',
          comment: 'Looks good to me'
        }
      });

      equal(response.statusCode, 200);
      deepEqual(JSON.parse(response.body), mockResult);
      
      // Restore original method
      delete (workflowService as any).processApproval;
    });
  });

  describe('GET /api/workflows/:id/approvals', () => {
    test('should validate pagination parameters', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/workflows/test-workflow-id/approvals?page=-1&perPage=0',
        headers: {
          'x-tenant-slug': tenantSlug,
          'authorization': 'Bearer test-token'
        }
      });

      equal(response.statusCode, 400);
    });

    test('should validate maximum perPage limit', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/workflows/test-workflow-id/approvals?perPage=101',
        headers: {
          'x-tenant-slug': tenantSlug,
          'authorization': 'Bearer test-token'
        }
      });

      equal(response.statusCode, 400);
      deepEqual(JSON.parse(response.body).message, 'perPage must be less than or equal to 100');
    });
  });
});