import { describe, it, expect, beforeEach, vi } from 'vitest';
import { workflowService } from '../../src/services/workflow.js';
import { db } from '../../src/utils/db.js';

// Mock database
vi.mock('../../src/utils/db.js', () => ({
  db: {
    query: vi.fn(),
  },
}));

describe('Workflow Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('executeWorkflow', () => {
    it('should handle approval chain failure when approver is unavailable', async () => {
      const workflowId = 'test-workflow';
      const requestId = 'test-request';
      
      // Mock database responses for unavailable approver
      (db.query as vi.Mock).mockResolvedValueOnce({
        rows: [{
          id: 'step-1',
          type: 'approval',
          config: { approverId: 'unavailable-user' },
          nextStepId: 'step-2'
        }]
      });
      
      (db.query as vi.Mock).mockResolvedValueOnce({
        rows: []
      }); // No available approver

      await expect(workflowService.executeWorkflow(workflowId, requestId))
        .rejects.toThrow('No approver available for approval step');
    });

    it('should handle workflow completion with all steps successful', async () => {
      const workflowId = 'test-workflow';
      const requestId = 'test-request';
      
      // Mock successful workflow steps
      (db.query as vi.Mock).mockResolvedValueOnce({
        rows: [
          { id: 'step-1', type: 'notification', nextStepId: 'step-2' },
          { id: 'step-2', type: 'approval', nextStepId: null }
        ]
      });
      
      (db.query as vi.Mock).mockResolvedValueOnce({
        rows: [{ id: 'step-1', status: 'completed' }]
      });
      
      (db.query as vi.Mock).mockResolvedValueOnce({
        rows: [{ id: 'step-2', status: 'completed' }]
      });

      const result = await workflowService.executeWorkflow(workflowId, requestId);
      expect(result.status).toBe('completed');
    });
  });
});