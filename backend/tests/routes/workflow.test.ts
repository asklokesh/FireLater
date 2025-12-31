import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildTestServer } from '../utils/server.js';
import { workflowService } from '../../src/services/workflow.js';

// Mock the workflow service
vi.mock('../../src/services/workflow.js', () => ({
  workflowService: {
    approveChangeRequest: vi.fn(),
    rejectChangeRequest: vi.fn(),
    getChangeRequest: vi.fn(),
  }
}));

describe('Workflow Routes - Change Request Approval', () => {
  let server: FastifyInstance;
  
  beforeEach(async () => {
    server = await buildTestServer();
    vi.clearAllMocks();
  });

  describe('POST /workflow/change-requests/:id/approve', () => {
    it('should approve a change request successfully', async () => {
      const changeRequestId = '123e4567-e89b-12d3-a456-426614174000';
      const mockApprovedRequest = {
        id: changeRequestId,
        status: 'approved',
        approvedAt: new Date().toISOString(),
        approvedBy: 'user-123'
      };

      (workflowService.approveChangeRequest as vi.Mock).mockResolvedValue(mockApprovedRequest);

      const response = await server.inject({
        method: 'POST',
        url: `/api/workflow/change-requests/${changeRequestId}/approve`,
        headers: {
          authorization: 'Bearer valid-token'
        },
        payload: {
          approverId: 'user-123',
          comments: 'Looks good to me'
        }
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toEqual({
        success: true,
        changeRequest: mockApprovedRequest
      });
      expect(workflowService.approveChangeRequest).toHaveBeenCalledWith(
        changeRequestId,
        'user-123',
        'Looks good to me'
      );
    });

    it('should return 404 when change request does not exist', async () => {
      const changeRequestId = '123e4567-e89b-12d3-a456-426614174000';
      
      (workflowService.approveChangeRequest as vi.Mock).mockRejectedValue(
        new Error('Change request not found')
      );

      const response = await server.inject({
        method: 'POST',
        url: `/api/workflow/change-requests/${changeRequestId}/approve`,
        headers: {
          authorization: 'Bearer valid-token'
        },
        payload: {
          approverId: 'user-123'
        }
      });

      expect(response.statusCode).toBe(404);
      expect(JSON.parse(response.body)).toEqual({
        error: 'Change request not found'
      });
    });

    it('should return 400 when approver is not authorized', async () => {
      const changeRequestId = '123e4567-e89b-12d3-a456-426614174000';
      
      (workflowService.approveChangeRequest as vi.Mock).mockRejectedValue(
        new Error('Unauthorized approver')
      );

      const response = await server.inject({
        method: 'POST',
        url: `/api/workflow/change-requests/${changeRequestId}/approve`,
        headers: {
          authorization: 'Bearer valid-token'
        },
        payload: {
          approverId: 'unauthorized-user'
        }
      });

      expect(response.statusCode).toBe(403);
      expect(JSON.parse(response.body)).toEqual({
        error: 'Unauthorized approver'
      });
    });

    it('should return 500 when service fails unexpectedly', async () => {
      const changeRequestId = '123e4567-e89b-12d3-a456-426614174000';
      
      (workflowService.approveChangeRequest as vi.Mock).mockRejectedValue(
        new Error('Database connection failed')
      );

      const response = await server.inject({
        method: 'POST',
        url: `/api/workflow/change-requests/${changeRequestId}/approve`,
        headers: {
          authorization: 'Bearer valid-token'
        },
        payload: {
          approverId: 'user-123'
        }
      });

      expect(response.statusCode).toBe(500);
      expect(JSON.parse(response.body)).toEqual({
        error: 'Failed to approve change request'
      });
    });
  });

  describe('POST /workflow/change-requests/:id/reject', () => {
    it('should reject a change request successfully', async () => {
      const changeRequestId = '123e4567-e89b-12d3-a456-426614174000';
      const mockRejectedRequest = {
        id: changeRequestId,
        status: 'rejected',
        rejectedAt: new Date().toISOString(),
        rejectedBy: 'user-123'
      };

      (workflowService.rejectChangeRequest as vi.Mock).mockResolvedValue(mockRejectedRequest);

      const response = await server.inject({
        method: 'POST',
        url: `/api/workflow/change-requests/${changeRequestId}/reject`,
        headers: {
          authorization: 'Bearer valid-token'
        },
        payload: {
          rejectorId: 'user-123',
          reason: 'Does not meet security requirements'
        }
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toEqual({
        success: true,
        changeRequest: mockRejectedRequest
      });
      expect(workflowService.rejectChangeRequest).toHaveBeenCalledWith(
        changeRequestId,
        'user-123',
        'Does not meet security requirements'
      );
    });

    it('should return 404 when change request does not exist', async () => {
      const changeRequestId = '123e4567-e89b-12d3-a456-426614174000';
      
      (workflowService.rejectChangeRequest as vi.Mock).mockRejectedValue(
        new Error('Change request not found')
      );

      const response = await server.inject({
        method: 'POST',
        url: `/api/workflow/change-requests/${changeRequestId}/reject`,
        headers: {
          authorization: 'Bearer valid-token'
        },
        payload: {
          rejectorId: 'user-123'
        }
      });

      expect(response.statusCode).toBe(404);
      expect(JSON.parse(response.body)).toEqual({
        error: 'Change request not found'
      });
    });

    it('should return 400 when rejector is not authorized', async () => {
      const changeRequestId = '123e4567-e89b-12d3-a456-426614174000';
      
      (workflowService.rejectChangeRequest as vi.Mock).mockRejectedValue(
        new Error('Unauthorized rejector')
      );

      const response = await server.inject({
        method: 'POST',
        url: `/api/workflow/change-requests/${changeRequestId}/reject`,
        headers: {
          authorization: 'Bearer valid-token'
        },
        payload: {
          rejectorId: 'unauthorized-user'
        }
      });

      expect(response.statusCode).toBe(403);
      expect(JSON.parse(response.body)).toEqual({
        error: 'Unauthorized rejector'
      });
    });
  });
});