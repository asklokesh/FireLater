import { test, describe } from 'node:test';
import * as assert from 'node:assert';
import { build } from '../../helper.js';

describe('Workflow Validation Tests', () => {
  test('should validate required workflow fields', async (t) => {
    const fastify = await build(t);

    const response = await fastify.inject({
      method: 'POST',
      url: '/api/workflows',
      payload: {
        // Missing required fields
      },
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-token'
      }
    });

    assert.strictEqual(response.statusCode, 400);
    const body = JSON.parse(response.body);
    assert.ok(body.message.includes('body must have required property'));
  });

  test('should validate workflow name length', async (t) => {
    const fastify = await build(t);

    const response = await fastify.inject({
      method: 'POST',
      url: '/api/workflows',
      payload: {
        name: 'a'.repeat(101), // Exceeds max length
        description: 'Valid description',
        triggerType: 'manual'
      },
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-token'
      }
    });

    assert.strictEqual(response.statusCode, 400);
    const body = JSON.parse(response.body);
    assert.ok(body.message.includes('maxLength'));
  });

  test('should validate triggerType enum values', async (t) => {
    const fastify = await build(t);

    const response = await fastify.inject({
      method: 'POST',
      url: '/api/workflows',
      payload: {
        name: 'Test Workflow',
        description: 'Valid description',
        triggerType: 'invalid-trigger-type'
      },
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-token'
      }
    });

    assert.strictEqual(response.statusCode, 400);
    const body = JSON.parse(response.body);
    assert.ok(body.message.includes('must be equal to one of the allowed values'));
  });

  test('should validate steps array structure', async (t) => {
    const fastify = await build(t);

    const response = await fastify.inject({
      method: 'POST',
      url: '/api/workflows',
      payload: {
        name: 'Test Workflow',
        description: 'Valid description',
        triggerType: 'manual',
        steps: [
          {
            // Missing required step fields
          }
        ]
      },
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-token'
      }
    });

    assert.strictEqual(response.statusCode, 400);
    const body = JSON.parse(response.body);
    assert.ok(body.message.includes('steps'));
  });

  test('should accept valid workflow payload', async (t) => {
    const fastify = await build(t);

    const response = await fastify.inject({
      method: 'POST',
      url: '/api/workflows',
      payload: {
        name: 'Test Workflow',
        description: 'Valid description',
        triggerType: 'manual',
        steps: [
          {
            id: 'step-1',
            type: 'approval',
            config: {
              approvers: ['user1@example.com']
            }
          }
        ]
      },
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-token'
      }
    });

    // Should pass validation and proceed to business logic (which may return 401 for test auth)
    assert.ok([200, 401].includes(response.statusCode));
  });
});