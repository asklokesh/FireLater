import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildTestServer } from '../helpers/server.js';
import { workflowService } from '../../src/services/workflow.js';
import { setupTestDatabase, teardownTestDatabase } from '../helpers/database.js';

describe('Workflow Routes - Approval State Transitions', () => {
  let app: FastifyInstance;
  
  beforeEach(async () => {
    await setupTestDatabase();
    app = buildTestServer();
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    await teardownTestDatabase();
    vi.clearAllMocks();
  });

  describe('POST /api/v1/workflows/:id/approve', () => {
    it('should transition workflow to approved state', async () => {
      const mockWorkflow = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        status: 'pending_approval',
        tenantSlug: 'test-tenant'
      };
      
      vi.spyOn(workflowService, 'approveWorkflow').mockResolvedValue({
        ...mockWorkflow,
        status: 'approved'
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/workflows/123e4567-e89b-12d3-a456-426614174000/approve',
        headers: {
          authorization: 'Bearer valid-token',
          'x-tenant-slug': 'test-tenant'
        },
        payload: {
          approverId: 'approver-123',
          comments: 'Looks good'
        }
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.body);
      expect(result.status).toBe('approved');
      expect(workflowService.approveWorkflow).toHaveBeenCalledWith(
        'test-tenant',
        '123e4567-e89b-12d3-a456-426614174000',
        {
          approverId: 'approver-123',
          comments: 'Looks good'
        }
      );
    });

    it('should reject approval when workflow is not in pending state', async () => {
      vi.spyOn(workflowService, 'approveWorkflow').mockRejectedValue(
        new Error('Workflow is not pending approval')
      );

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/workflows/123e4567-e89b-12d3-a456-426614174000/approve',
        headers: {
          authorization: 'Bearer valid-token',
          'x-tenant-slug': 'test-tenant'
        },
        payload: {
          approverId: 'approver-123'
        }
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /api/v1/workflows/:id/reject', () => {
    it('should transition workflow to rejected state', async () => {
      const mockWorkflow = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        status: 'pending_approval',
        tenantSlug: 'test-tenant'
      };
      
      vi.spyOn(workflowService, 'rejectWorkflow').mockResolvedValue({
        ...mockWorkflow,
        status: 'rejected'
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/workflows/123e4567-e89b-12d3-a456-426614174000/reject',
        headers: {
          authorization: 'Bearer valid-token',
          'x-tenant-slug': 'test-tenant'
        },
        payload: {
          rejectorId: 'rejector-123',
          reason: 'Does not meet requirements'
        }
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.body);
      expect(result.status).toBe('rejected');
      expect(workflowService.rejectWorkflow).toHaveBeenCalledWith(
        'test-tenant',
        '123e4567-e89b-12d3-a456-426614174000',
        {
          rejectorId: 'rejector-123',
          reason: 'Does not meet requirements'
        }
      );
    });
  });

  describe('POST /api/v1/workflows/:id/cancel', () => {
    it('should transition workflow to cancelled state', async () => {
      const mockWorkflow = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        status: 'pending_approval',
        tenantSlug: 'test-tenant'
      };
      
      vi.spyOn(workflowService, 'cancelWorkflow').mockResolvedValue({
        ...mockWorkflow,
        status: 'cancelled'
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/workflows/123e4567-e89b-12d3-a456-426614174000/cancel',
        headers: {
          authorization: 'Bearer valid-token',
          'x-tenant-slug': 'test-tenant'
        },
        payload: {
          requesterId: 'requester-123',
          reason: 'No longer needed'
        }
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.body);
      expect(result.status).toBe('cancelled');
      expect(workflowService.cancelWorkflow).toHaveBeenCalledWith(
        'test-tenant',
        '123e4567-e89b-12d3-a456-426614174000',
        {
          requesterId: 'requester-123',
          reason: 'No longer needed'
        }
      );
    });
  });
});