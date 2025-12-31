// Add test file for workflow integration tests
// Path: backend/tests/integration/workflow.test.ts

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestServer, teardownTestServer, testTenant, testUser } from '../helpers/setup.js';
import { workflowService } from '../../src/services/workflow.js';
import { FastifyInstance } from 'fastify';

describe('Workflow Integration Tests', () => {
  let app: FastifyInstance;
  let workflowId: string;
  let authToken: string;

  beforeAll(async () => {
    app = await setupTestServer();
    
    // Create auth token for test user
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        email: testUser.email,
        password: 'test-password'
      }
    });
    
    authToken = response.json().token;
    
    // Create a test workflow
    const workflow = await workflowService.create(
      testTenant.slug,
      testUser.id,
      {
        name: 'Test Workflow',
        description: 'Test workflow for integration tests',
        initialStatus: 'draft',
        statusTransitions: {
          draft: ['submitted', 'closed'],
          submitted: ['in_progress', 'rejected'],
          in_progress: ['resolved', 'blocked'],
          resolved: ['closed'],
          rejected: ['draft'],
          blocked: ['in_progress'],
          closed: []
        }
      }
    );
    
    workflowId = workflow.id;
  });

  afterAll(async () => {
    await teardownTestServer();
  });

  describe('Workflow State Transitions', () => {
    it('should successfully transition workflow state', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/workflows/${workflowId}/transitions`,
        headers: {
          authorization: `Bearer ${authToken}`
        },
        payload: {
          fromStatus: 'draft',
          toStatus: 'submitted',
          userId: testUser.id
        }
      });

      expect(response.statusCode).toBe(200);
      const result = response.json();
      expect(result.success).toBe(true);
      expect(result.transition.fromStatus).toBe('draft');
      expect(result.transition.toStatus).toBe('submitted');
    });

    it('should reject invalid state transitions', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/workflows/${workflowId}/transitions`,
        headers: {
          authorization: `Bearer ${authToken}`
        },
        payload: {
          fromStatus: 'draft',
          toStatus: 'resolved', // Invalid transition
          userId: testUser.id
        }
      });

      expect(response.statusCode).toBe(400);
      const result = response.json();
      expect(result.error).toBe('Invalid state transition');
    });

    it('should reject transitions for non-existent workflows', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/workflows/invalid-id/transitions',
        headers: {
          authorization: `Bearer ${authToken}`
        },
        payload: {
          fromStatus: 'draft',
          toStatus: 'submitted',
          userId: testUser.id
        }
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('Workflow Error Cases', () => {
    it('should reject requests without authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/workflows/${workflowId}/transitions`,
        payload: {
          fromStatus: 'draft',
          toStatus: 'submitted',
          userId: testUser.id
        }
      });

      expect(response.statusCode).toBe(401);
    });

    it('should reject requests with invalid payload', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/workflows/${workflowId}/transitions`,
        headers: {
          authorization: `Bearer ${authToken}`
        },
        payload: {
          fromStatus: '', // Invalid empty status
          toStatus: 'submitted'
        }
      });

      expect(response.statusCode).toBe(400);
    });

    it('should handle database errors gracefully', async () => {
      // Temporarily mock workflowService to throw an error
      const originalTransition = workflowService.executeTransition;
      workflowService.executeTransition = async () => {
        throw new Error('Database connection error');
      };

      const response = await app.inject({
        method: 'POST',
        url: `/api/workflows/${workflowId}/transitions`,
        headers: {
          authorization: `Bearer ${authToken}`
        },
        payload: {
          fromStatus: 'draft',
          toStatus: 'submitted',
          userId: testUser.id
        }
      });

      expect(response.statusCode).toBe(500);
      workflowService.executeTransition = originalTransition;
    });
  });
});