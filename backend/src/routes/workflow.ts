// Add test file for workflow routes
// Path: backend/tests/routes/workflow.test.ts

import { test } from 'tap';
import { build } from '../../tests/helpers/app.js';
import { workflowService } from '../../src/services/workflow.js';

test('workflow state transitions', async (t) => {
  const app = await build(t);

  t.test('should execute workflow transition successfully', async (t) => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/workflows/execute',
      headers: {
        authorization: 'Bearer valid-token'
      },
      payload: {
        workflowId: '123e4567-e89b-12d3-a456-426614174000',
        action: 'approve',
        userId: '123e4567-e89b-12d3-a456-426614174001'
      }
    });

    t.equal(response.statusCode, 200);
    const payload = JSON.parse(response.payload);
    t.equal(payload.status, 'success');
  });

  t.test('should reject invalid workflow transitions', async (t) => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/workflows/execute',
      headers: {
        authorization: 'Bearer valid-token'
      },
      payload: {
        workflowId: '123e4567-e89b-12d3-a456-426614174000',
        action: 'invalid_action',
        userId: '123e4567-e89b-12d3-a456-426614174001'
      }
    });

    t.equal(response.statusCode, 400);
  });

  t.test('should validate required fields', async (t) => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/workflows/execute',
      headers: {
        authorization: 'Bearer valid-token'
      },
      payload: {
        workflowId: '123e4567-e89b-12d3-a456-426614174000'
        // missing required action field
      }
    });

    t.equal(response.statusCode, 400);
  });
});