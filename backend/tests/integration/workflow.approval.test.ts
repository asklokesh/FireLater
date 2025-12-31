import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestServer, TestServer } from '../helpers/setup.js';
import { workflowService } from '../../src/services/workflow.js';
import { db } from '../../src/database/db.js';

describe('Workflow Approval Chain Integration Tests', () => {
  let server: TestServer;
  let tenantSlug: string;
  let userId: string;

  beforeAll(async () => {
    server = await setupTestServer();
    tenantSlug = server.tenantSlug;
    userId = server.user.id;
  });

  afterAll(async () => {
    await server.close();
  });

  describe('Approval Chain Creation', () => {
    it('should create workflow with approval chain', async () => {
      const workflowData = {
        name: 'Test Approval Workflow',
        description: 'Workflow with approval steps',
        type: 'change_request',
        approvalChain: [
          {
            stepNumber: 1,
            approverType: 'user',
            approverId: userId,
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

      const response = await server.inject({
        method: 'POST',
        url: '/api/workflows',
        payload: workflowData
      });

      expect(response.statusCode).toBe(201);
      const workflow = response.json();
      expect(workflow.approvalChain).toHaveLength(2);
      expect(workflow.approvalChain[0].stepNumber).toBe(1);
      expect(workflow.approvalChain[1].stepNumber).toBe(2);
    });
  });

  describe('Approval Chain Execution', () => {
    let workflowId: string;

    beforeAll(async () => {
      // Create a workflow with approval chain for testing
      const workflow = await workflowService.create(tenantSlug, userId, {
        name: 'Execution Test Workflow',
        type: 'change_request',
        approvalChain: [
          {
            stepNumber: 1,
            approverType: 'user',
            approverId: userId,
            required: true
          }
        ]
      });
      workflowId = workflow.id;
    });

    it('should execute approval action', async () => {
      const response = await server.inject({
        method: 'POST',
        url: `/api/workflows/${workflowId}/approve`,
        payload: {
          action: 'approve',
          userId: userId,
          comments: 'Approved by test user'
        }
      });

      expect(response.statusCode).toBe(200);
      const result = response.json();
      expect(result.status).toBe('approved');
    });
  });
});