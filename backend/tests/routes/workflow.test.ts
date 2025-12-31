import { test } from 'tap';
import { build } from '../helper.js';

test('approval workflow edge cases', async (t) => {
  const app = await build(t);

  // Test invalid approval action
  t.test('should reject invalid approval action', async (t) => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/workflows/approval-action',
      payload: {
        workflowId: 'invalid-uuid',
        action: 'invalid_action',
        userId: 'invalid-uuid'
      }
    });
    t.equal(response.statusCode, 400);
  });

  // Test unauthorized approval attempt
  t.test('should reject approval from unauthorized user', async (t) => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/workflows/approval-action',
      payload: {
        workflowId: '550e8400-e29b-41d4-a716-446655440000',
        action: 'approve',
        userId: 'unauthorized-user-id'
      }
    });
    t.equal(response.statusCode, 403);
  });

  // Test approval chain validation
  t.test('should validate approval chain order', async (t) => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/workflows/approval-action',
      payload: {
        workflowId: '550e8400-e29b-41d4-a716-446655440000',
        action: 'approve',
        userId: '550e8400-e29b-41d4-a716-446655440001',
        step: -1 // Invalid step
      }
    });
    t.equal(response.statusCode, 400);
  });
});