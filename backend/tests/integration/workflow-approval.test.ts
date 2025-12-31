import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestServer, createTestUser, createTestTenant } from '../helpers/setup.js';
import { workflowService } from '../../src/services/workflow.js';

describe('Workflow Approval Chains', () => {
  const { server, client } = setupTestServer();
  let tenant: any;
  let user: any;

  beforeAll(async () => {
    tenant = await createTestTenant();
    user = await createTestUser(tenant.id, { permissions: ['workflow:manage'] });
  });

  describe('POST /workflows/:id/approval-chains', () => {
    it('should create a new approval chain for a workflow', async () => {
      // Create a test workflow first
      const workflow = await workflowService.create(tenant.slug, {
        name: 'Test Approval Workflow',
        description: 'Workflow with approval chain',
        type: 'change_request',
        steps: []
      });

      const approvalChainData = {
        name: 'Standard Approval Chain',
        description: 'Multi-level approval process',
        steps: [
          {
            stepNumber: 1,
            approverType: 'user',
            approverId: user.id,
            required: true
          },
          {
            stepNumber: 2,
            approverType: 'group',
            approverId: 'test-group-id',
            required: false
          }
        ]
      };

      const response = await client.post(`/workflows/${workflow.id}/approval-chains`, {
        headers: {
          authorization: `Bearer ${user.token}`
        },
        body: approvalChainData
      });

      expect(response.statusCode).toBe(201);
      expect(response.json()).toMatchObject({
        id: expect.any(String),
        name: 'Standard Approval Chain',
        workflowId: workflow.id
      });
    });

    it('should reject invalid approval chain data', async () => {
      const workflow = await workflowService.create(tenant.slug, {
        name: 'Test Workflow 2',
        description: 'Another test workflow',
        type: 'change_request',
        steps: []
      });

      const invalidData = {
        name: '', // Invalid: empty name
        steps: [
          {
            stepNumber: 1,
            approverType: 'invalid-type', // Invalid approver type
            approverId: null
          }
        ]
      };

      const response = await client.post(`/workflows/${workflow.id}/approval-chains`, {
        headers: {
          authorization: `Bearer ${user.token}`
        },
        body: invalidData
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /workflows/:id/approval-chains', () => {
    it('should retrieve all approval chains for a workflow', async () => {
      // Create workflow with approval chain
      const workflow = await workflowService.create(tenant.slug, {
        name: 'Retrieval Test Workflow',
        description: 'Workflow for retrieval testing',
        type: 'change_request',
        steps: []
      });

      // Create approval chain
      await client.post(`/workflows/${workflow.id}/approval-chains`, {
        headers: {
          authorization: `Bearer ${user.token}`
        },
        body: {
          name: 'Test Chain',
          steps: [
            {
              stepNumber: 1,
              approverType: 'user',
              approverId: user.id,
              required: true
            }
          ]
        }
      });

      const response = await client.get(`/workflows/${workflow.id}/approval-chains`, {
        headers: {
          authorization: `Bearer ${user.token}`
        }
      });

      expect(response.statusCode).toBe(200);
      const chains = response.json();
      expect(chains).toBeInstanceOf(Array);
      expect(chains).toHaveLength(1);
      expect(chains[0]).toMatchObject({
        name: 'Test Chain',
        workflowId: workflow.id
      });
    });
  });

  describe('Approval Chain Processing', () => {
    it('should process approval steps in order', async () => {
      // Create workflow
      const workflow = await workflowService.create(tenant.slug, {
        name: 'Processing Test Workflow',
        description: 'Workflow for processing testing',
        type: 'change_request',
        steps: []
      });

      // Create multi-step approval chain
      const chainResponse = await client.post(`/workflows/${workflow.id}/approval-chains`, {
        headers: {
          authorization: `Bearer ${user.token}`
        },
        body: {
          name: 'Sequential Approval Chain',
          steps: [
            {
              stepNumber: 1,
              approverType: 'user',
              approverId: user.id,
              required: true
            },
            {
              stepNumber: 2,
              approverType: 'user',
              approverId: user.id,
              required: true
            }
          ]
        }
      });

      const chain = chainResponse.json();

      // Start approval process
      const processResponse = await client.post(`/approval-chains/${chain.id}/process`, {
        headers: {
          authorization: `Bearer ${user.token}`
        },
        body: {
          requestId: 'test-request-id',
          context: {
            requesterId: user.id
          }
        }
      });

      expect(processResponse.statusCode).toBe(200);
      const processResult = processResponse.json();
      expect(processResult).toMatchObject({
        status: 'pending',
        currentStep: 1
      });
    });
  });
});