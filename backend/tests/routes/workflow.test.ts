import { test } from 'tap';
import { build } from '../helper.js';
import { workflowService } from '../../src/services/workflow.js';

// Mock the workflow service
const mockWorkflowService = {
  executeWorkflow: async () => ({ status: 'success', result: {} }),
  getWorkflowStatus: async () => ({ status: 'completed' }),
};

test('POST /api/v1/workflows/:workflowId/execute should execute workflow', async (t) => {
  const app = await build(t);
  
  // Mock the service method
  const executeWorkflowStub = t.stub(workflowService, 'executeWorkflow').resolves({
    status: 'success',
    result: { id: 'test-result' }
  });
  
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/workflows/123e4567-e89b-12d3-a456-426614174000/execute',
    headers: {
      authorization: 'Bearer valid-token'
    },
    payload: {
      requestId: '123e4567-e89b-12d3-a456-426614174001',
      action: 'approve',
      userId: '123e4567-e89b-12d3-a456-426614174002',
      payload: { comment: 'Approved by manager' }
    }
  });

  t.equal(response.statusCode, 200);
  t.same(JSON.parse(response.payload), {
    status: 'success',
    result: { id: 'test-result' }
  });
  
  // Verify service was called with correct parameters
  t.ok(executeWorkflowStub.calledOnce);
  t.equal(executeWorkflowStub.firstCall.args[0], 'test-tenant');
  t.equal(executeWorkflowStub.firstCall.args[1], '123e4567-e89b-12d3-a456-426614174000');
  t.same(executeWorkflowStub.firstCall.args[2], {
    requestId: '123e4567-e89b-12d3-a456-426614174001',
    action: 'approve',
    userId: '123e4567-e89b-12d3-a456-426614174002',
    payload: { comment: 'Approved by manager' }
  });
});

test('GET /api/v1/workflows/:workflowId/status should return workflow status', async (t) => {
  const app = await build(t);
  
  // Mock the service method
  const getWorkflowStatusStub = t.stub(workflowService, 'getWorkflowStatus').resolves({
    status: 'completed',
    completedAt: '2023-01-01T00:00:00Z'
  });
  
  const response = await app.inject({
    method: 'GET',
    url: '/api/v1/workflows/123e4567-e89b-12d3-a456-426614174000/status',
    headers: {
      authorization: 'Bearer valid-token'
    }
  });

  t.equal(response.statusCode, 200);
  t.same(JSON.parse(response.payload), {
    status: 'completed',
    completedAt: '2023-01-01T00:00:00Z'
  });
  
  // Verify service was called with correct parameters
  t.ok(getWorkflowStatusStub.calledOnce);
  t.equal(getWorkflowStatusStub.firstCall.args[0], 'test-tenant');
  t.equal(getWorkflowStatusStub.firstCall.args[1], '123e4567-e89b-12d3-a456-426614174000');
});