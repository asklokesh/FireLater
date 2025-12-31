import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestServer, teardownTestServer } from '../helpers/test-server';
import { createTestTenant, createTestUser } from '../helpers/test-data';
import { FastifyInstance } from 'fastify';

describe('Workflow Route Integration Tests', () => {
  let server: FastifyInstance;
  let tenant: any;
  let user: any;
  let authToken: string;

  beforeAll(async () => {
    server = await setupTestServer();
    tenant = await createTestTenant();
    user = await createTestUser(tenant.slug);
    authToken = `Bearer ${user.token}`;
  });

  afterAll(async () => {
    await teardownTestServer(server);
  });

  describe('POST /workflows/:id/transitions', () => {
    it('should successfully transition workflow state', async () => {
      // Create a test workflow
      const workflowResponse = await server.inject({
        method: 'POST',
        url: '/workflows',
        headers: {
          authorization: authToken,
          'x-tenant-slug': tenant.slug
        },
        payload: {
          name: 'Test Workflow',
          description: 'Test workflow for state transitions',
          initialState: 'draft',
          states: ['draft', 'in_review', 'approved', 'rejected'],
          transitions: [
            { from: 'draft', to: 'in_review' },
            { from: 'in_review', to: 'approved' },
            { from: 'in_review', to: 'rejected' }
          ]
        }
      });

      expect(workflowResponse.statusCode).toBe(201);
      const workflow = workflowResponse.json();

      // Test state transition
      const transitionResponse = await server.inject({
        method: 'POST',
        url: `/workflows/${workflow.id}/transitions`,
        headers: {
          authorization: authToken,
          'x-tenant-slug': tenant.slug
        },
        payload: {
          fromState: 'draft',
          toState: 'in_review',
          entityId: 'test-entity-id',
          metadata: {
            changedBy: user.id,
            reason: 'Ready for review'
          }
        }
      });

      expect(transitionResponse.statusCode).toBe(200);
      const result = transitionResponse.json();
      expect(result.success).toBe(true);
      expect(result.currentState).toBe('in_review');
    });

    it('should reject invalid state transitions', async () => {
      // Create a test workflow
      const workflowResponse = await server.inject({
        method: 'POST',
        url: '/workflows',
        headers: {
          authorization: authToken,
          'x-tenant-slug': tenant.slug
        },
        payload: {
          name: 'Test Workflow 2',
          description: 'Test workflow for invalid transitions',
          initialState: 'draft',
          states: ['draft', 'in_review', 'approved', 'rejected'],
          transitions: [
            { from: 'draft', to: 'in_review' },
            { from: 'in_review', to: 'approved' },
            { from: 'in_review', to: 'rejected' }
          ]
        }
      });

      expect(workflowResponse.statusCode).toBe(201);
      const workflow = workflowResponse.json();

      // Try invalid transition
      const transitionResponse = await server.inject({
        method: 'POST',
        url: `/workflows/${workflow.id}/transitions`,
        headers: {
          authorization: authToken,
          'x-tenant-slug': tenant.slug
        },
        payload: {
          fromState: 'draft',
          toState: 'approved', // Not allowed directly from draft
          entityId: 'test-entity-id',
          metadata: {
            changedBy: user.id
          }
        }
      });

      expect(transitionResponse.statusCode).toBe(400);
      const result = transitionResponse.json();
      expect(result.error).toBe('Invalid state transition');
    });
  });
});