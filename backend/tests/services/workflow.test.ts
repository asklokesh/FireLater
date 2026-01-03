import { describe, it, expect, beforeEach, vi } from 'vitest';
import { workflowService } from '../../src/services/workflow.js';

// Mock database pool
vi.mock('../../src/config/database.js', () => ({
  pool: {
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

      const { pool } = await import('../../src/config/database.js');

      // Mock database responses for unavailable approver
      (pool.query as vi.Mock).mockResolvedValueOnce({
        rows: [{
          id: 'step-1',
          type: 'approval',
          config: { approverId: 'unavailable-user' },
          nextStepId: 'step-2'
        }]
      });

      (pool.query as vi.Mock).mockResolvedValueOnce({
        rows: []
      }); // No available approver

      await expect(workflowService.executeWorkflow(workflowId, requestId))
        .rejects.toThrow('No approver available for approval step');
    });

    it('should handle workflow completion with all steps successful', async () => {
      const workflowId = 'test-workflow';
      const requestId = 'test-request';

      const { pool } = await import('../../src/config/database.js');

      // Mock successful workflow steps
      (pool.query as vi.Mock).mockResolvedValueOnce({
        rows: [
          { id: 'step-1', type: 'notification', nextStepId: 'step-2' },
          { id: 'step-2', type: 'approval', nextStepId: null }
        ]
      });

      (pool.query as vi.Mock).mockResolvedValueOnce({
        rows: [{ id: 'approver-1', user_id: 'user-1' }]
      }); // Approvers available

      const result = await workflowService.executeWorkflow(workflowId, requestId);
      expect(result.status).toBe('completed');
    });
  });
});