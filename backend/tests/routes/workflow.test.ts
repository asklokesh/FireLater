import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTestServer } from '../test-utils/server.js';
import { workflowService } from '../../src/services/workflow.js';
import { tenantService } from '../../src/services/tenant.js';

describe('Workflow Routes - Approval Chains', () => {
  let app: any;
  
  beforeEach(async () => {
    app = await createTestServer();
    vi.clearAllMocks();
  });

  describe('POST /api/v1/workflows/:id/approvals', () => {
    it('should handle approval chain with multiple approvers', async () => {
      const mockWorkflow = {
        id: 'workflow-1',
        name: 'Test Workflow',
        approvalChain: [
          { id: 'step-1', type: 'user', userId: 'user-1', status: 'pending' },
          { id: 'step-2', type: 'group', groupId: 'group-1', status: 'pending' }
        ]
      };
      
      vi.spyOn(workflowService, 'getById').mockResolvedValue(mockWorkflow);
      vi.spyOn(workflowService, 'processApproval').mockResolvedValue({
        ...mockWorkflow,
        approvalChain: [
          { id: 'step-1', type: 'user', userId: 'user-1', status: 'approved' },
          { id: 'step-2', type: 'group', groupId: 'group-1', status: 'pending' }
        ]
      });
      
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/workflows/workflow-1/approvals',
        headers: {
          'x-tenant-slug': 'test-tenant',
          'authorization': 'Bearer test-token'
        },
        payload: {
          approverId: 'user-1',
          action: 'approve',
          comment: 'Looks good'
        }
      });
      
      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.body);
      expect(result.approvalChain[0].status).toBe('approved');
      expect(result.approvalChain[1].status).toBe('pending');
    });

    it('should reject request when any approver rejects', async () => {
      const mockWorkflow = {
        id: 'workflow-1',
        name: 'Test Workflow',
        approvalChain: [
          { id: 'step-1', type: 'user', userId: 'user-1', status: 'pending' }
        ]
      };
      
      vi.spyOn(workflowService, 'getById').mockResolvedValue(mockWorkflow);
      vi.spyOn(workflowService, 'processApproval').mockResolvedValue({
        ...mockWorkflow,
        status: 'rejected',
        approvalChain: [
          { id: 'step-1', type: 'user', userId: 'user-1', status: 'rejected' }
        ]
      });
      
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/workflows/workflow-1/approvals',
        headers: {
          'x-tenant-slug': 'test-tenant',
          'authorization': 'Bearer test-token'
        },
        payload: {
          approverId: 'user-1',
          action: 'reject',
          comment: 'Needs more work'
        }
      });
      
      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.body);
      expect(result.status).toBe('rejected');
      expect(result.approvalChain[0].status).toBe('rejected');
    });

    it('should handle parallel approval chains', async () => {
      const mockWorkflow = {
        id: 'workflow-1',
        name: 'Test Workflow',
        approvalChain: [
          { 
            id: 'parallel-step',
            type: 'parallel',
            approvers: [
              { id: 'step-1', type: 'user', userId: 'user-1', status: 'pending' },
              { id: 'step-2', type: 'user', userId: 'user-2', status: 'pending' }
            ]
          }
        ]
      };
      
      vi.spyOn(workflowService, 'getById').mockResolvedValue(mockWorkflow);
      vi.spyOn(workflowService, 'processApproval').mockResolvedValue({
        ...mockWorkflow,
        approvalChain: [
          { 
            id: 'parallel-step',
            type: 'parallel',
            approvers: [
              { id: 'step-1', type: 'user', userId: 'user-1', status: 'approved' },
              { id: 'step-2', type: 'user', userId: 'user-2', status: 'pending' }
            ]
          }
        ]
      });
      
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/workflows/workflow-1/approvals',
        headers: {
          'x-tenant-slug': 'test-tenant',
          'authorization': 'Bearer test-token'
        },
        payload: {
          approverId: 'user-1',
          action: 'approve'
        }
      });
      
      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.body);
      const parallelStep = result.approvalChain[0];
      expect(parallelStep.approvers[0].status).toBe('approved');
      expect(parallelStep.approvers[1].status).toBe('pending');
    });
  });

  describe('Edge Cases', () => {
    it('should return 404 for non-existent workflow', async () => {
      vi.spyOn(workflowService, 'getById').mockResolvedValue(null);
      
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/workflows/non-existent/approvals',
        headers: {
          'x-tenant-slug': 'test-tenant',
          'authorization': 'Bearer test-token'
        },
        payload: {
          approverId: 'user-1',
          action: 'approve'
        }
      });
      
      expect(response.statusCode).toBe(404);
    });

    it('should return 400 for invalid approval action', async () => {
      const mockWorkflow = {
        id: 'workflow-1',
        name: 'Test Workflow',
        approvalChain: [
          { id: 'step-1', type: 'user', userId: 'user-1', status: 'pending' }
        ]
      };
      
      vi.spyOn(workflowService, 'getById').mockResolvedValue(mockWorkflow);
      
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/workflows/workflow-1/approvals',
        headers: {
          'x-tenant-slug': 'test-tenant',
          'authorization': 'Bearer test-token'
        },
        payload: {
          approverId: 'user-1',
          action: 'invalid-action'
        }
      });
      
      expect(response.statusCode).toBe(400);
    });

    it('should handle approval when user is not authorized approver', async () => {
      const mockWorkflow = {
        id: 'workflow-1',
        name: 'Test Workflow',
        approvalChain: [
          { id: 'step-1', type: 'user', userId: 'authorized-user', status: 'pending' }
        ]
      };
      
      vi.spyOn(workflowService, 'getById').mockResolvedValue(mockWorkflow);
      vi.spyOn(workflowService, 'processApproval').mockRejectedValue(
        new Error('User is not authorized to approve this workflow')
      );
      
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/workflows/workflow-1/approvals',
        headers: {
          'x-tenant-slug': 'test-tenant',
          'authorization': 'Bearer test-token'
        },
        payload: {
          approverId: 'unauthorized-user',
          action: 'approve'
        }
      });
      
      expect(response.statusCode).toBe(403);
    });

    it('should handle approval for completed workflow', async () => {
      const mockWorkflow = {
        id: 'workflow-1',
        name: 'Test Workflow',
        status: 'completed',
        approvalChain: [
          { id: 'step-1', type: 'user', userId: 'user-1', status: 'approved' }
        ]
      };
      
      vi.spyOn(workflowService, 'getById').mockResolvedValue(mockWorkflow);
      
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/workflows/workflow-1/approvals',
        headers: {
          'x-tenant-slug': 'test-tenant',
          'authorization': 'Bearer test-token'
        },
        payload: {
          approverId: 'user-1',
          action: 'approve'
        }
      });
      
      expect(response.statusCode).toBe(400);
    });
  });
});