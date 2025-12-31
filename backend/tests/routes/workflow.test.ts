import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildTestServer } from '../helpers/server.js';
import { workflowService } from '../../src/services/workflow.js';

// Mock the workflow service
vi.mock('../../src/services/workflow.js', () => ({
  workflowService: {
    processApproval: vi.fn(),
    getWorkflowById: vi.fn(),
    createWorkflow: vi.fn(),
  }
}));

describe('Workflow Routes - Approval Chain Logic', () => {
  let server: FastifyInstance;

  beforeEach(async () => {
    server = await buildTestServer();
    vi.clearAllMocks();
  });

  describe('Sequential Approvals', () => {
    it('should process sequential approvals in correct order', async () => {
      const mockWorkflow = {
        id: 'workflow-1',
        name: 'Test Sequential Workflow',
        steps: [
          { id: 'step-1', type: 'approval', approver: 'user-1', nextStepId: 'step-2' },
          { id: 'step-2', type: 'approval', approver: 'user-2', nextStepId: 'step-3' },
          { id: 'step-3', type: 'approval', approver: 'user-3', nextStepId: null }
        ]
      };

      vi.mocked(workflowService.getWorkflowById).mockResolvedValue(mockWorkflow);
      
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/workflows/workflow-1/approvals',
        payload: {
          stepId: 'step-1',
          approved: true,
          userId: 'user-1'
        }
      });

      expect(response.statusCode).toBe(200);
      expect(workflowService.processApproval).toHaveBeenCalledWith(
        'test-tenant',
        'workflow-1',
        'step-1',
        'user-1',
        true
      );
    });

    it('should reject approval when user is not the designated approver', async () => {
      const mockWorkflow = {
        id: 'workflow-1',
        name: 'Test Sequential Workflow',
        steps: [
          { id: 'step-1', type: 'approval', approver: 'user-1', nextStepId: 'step-2' }
        ]
      };

      vi.mocked(workflowService.getWorkflowById).mockResolvedValue(mockWorkflow);

      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/workflows/workflow-1/approvals',
        payload: {
          stepId: 'step-1',
          approved: true,
          userId: 'unauthorized-user'
        }
      });

      expect(response.statusCode).toBe(403);
    });
  });

  describe('Parallel Approvals', () => {
    it('should process parallel approvals independently', async () => {
      const mockWorkflow = {
        id: 'workflow-2',
        name: 'Test Parallel Workflow',
        steps: [
          { 
            id: 'parallel-step',
            type: 'parallel_approval',
            approvers: ['user-1', 'user-2', 'user-3'],
            nextStepId: 'step-4'
          }
        ]
      };

      vi.mocked(workflowService.getWorkflowById).mockResolvedValue(mockWorkflow);

      // First approval
      await server.inject({
        method: 'POST',
        url: '/api/v1/workflows/workflow-2/approvals',
        payload: {
          stepId: 'parallel-step',
          approved: true,
          userId: 'user-1'
        }
      });

      // Second approval
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/workflows/workflow-2/approvals',
        payload: {
          stepId: 'parallel-step',
          approved: false,
          userId: 'user-2'
        }
      });

      expect(response.statusCode).toBe(200);
      expect(workflowService.processApproval).toHaveBeenCalledTimes(2);
    });

    it('should complete parallel approval when all approvers respond', async () => {
      const mockWorkflow = {
        id: 'workflow-3',
        name: 'Test Complete Parallel Workflow',
        steps: [
          { 
            id: 'parallel-step',
            type: 'parallel_approval',
            approvers: ['user-1', 'user-2'],
            requiredApprovals: 2,
            nextStepId: 'step-3'
          }
        ]
      };

      vi.mocked(workflowService.getWorkflowById).mockResolvedValue(mockWorkflow);
      vi.mocked(workflowService.processApproval).mockResolvedValue({
        allApproved: true,
        nextStepId: 'step-3'
      });

      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/workflows/workflow-3/approvals',
        payload: {
          stepId: 'parallel-step',
          approved: true,
          userId: 'user-2'
        }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        message: 'All approvals received, moving to next step',
        nextStepId: 'step-3'
      });
    });
  });
});