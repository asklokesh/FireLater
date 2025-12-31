// Add comprehensive tests for workflow execution logic
import { describe, it, beforeEach, afterEach } from 'node:test';
import { deepEqual, ok, rejects } from 'node:assert';
import { buildTestServer } from '../test/helpers.js';
import { workflowService } from '../services/workflow.js';

describe('Workflow Routes', () => {
  let app: any;
  
  beforeEach(async () => {
    app = await buildTestServer();
  });
  
  afterEach(async () => {
    await app.close();
  });
  
  describe('POST /api/v1/workflows/:workflowId/execute', () => {
    it('should execute workflow successfully', async () => {
      const mockResult = { 
        executionId: 'exec-123', 
        status: 'completed',
        outputs: { result: 'success' }
      };
      
      const executeStub = sinon.stub(workflowService, 'execute').resolves(mockResult);
      
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/workflows/wf-123/execute',
        headers: {
          authorization: 'Bearer test-token'
        },
        payload: {
          requestId: 'req-456',
          action: 'approve',
          userId: 'user-789'
        }
      });
      
      deepEqual(response.json(), mockResult);
      ok(executeStub.calledOnce);
      
      executeStub.restore();
    });
    
    it('should return 400 for invalid request payload', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/workflows/wf-123/execute',
        headers: {
          authorization: 'Bearer test-token'
        },
        payload: {
          // Missing required fields
        }
      });
      
      deepEqual(response.statusCode, 400);
    });
    
    it('should handle workflow execution errors', async () => {
      const executeStub = sinon.stub(workflowService, 'execute').rejects(
        new Error('Workflow execution failed')
      );
      
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/workflows/wf-123/execute',
        headers: {
          authorization: 'Bearer test-token'
        },
        payload: {
          requestId: 'req-456',
          action: 'approve',
          userId: 'user-789'
        }
      });
      
      deepEqual(response.statusCode, 500);
      executeStub.restore();
    });
    
    it('should handle validation errors', async () => {
      const executeStub = sinon.stub(workflowService, 'execute').rejects({
        code: 'VALIDATION_ERROR',
        message: 'Invalid workflow state'
      });
      
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/workflows/wf-123/execute',
        headers: {
          authorization: 'Bearer test-token'
        },
        payload: {
          requestId: 'req-456',
          action: 'approve',
          userId: 'user-789'
        }
      });
      
      deepEqual(response.statusCode, 400);
      executeStub.restore();
    });
  });
});