import { test, beforeEach, afterEach } from 'node:test';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';
import { createTestTenant, createTestUser, TestContext } from '../helpers/test-helpers.js';

let app: FastifyInstance;
let testContext: TestContext;

beforeEach(async () => {
  app = buildApp();
  await app.ready();
  testContext = await createTestTenant();
});

afterEach(async () => {
  await testContext.cleanup();
  await app.close();
});

test('should create a new workflow', async (t) => {
  const user = await createTestUser(testContext.tenant.slug, ['workflow:create']);
  const token = app.jwt.sign({
    userId: user.id,
    tenantSlug: testContext.tenant.slug
  });

  const workflowData = {
    name: 'Test Workflow',
    description: 'A test workflow',
    triggerType: 'manual',
    steps: [
      {
        name: 'Step 1',
        type: 'approval',
        config: {
          approvers: [user.id]
        }
      }
    ]
  };

  const response = await app.inject({
    method: 'POST',
    url: '/api/workflows',
    headers: {
      authorization: `Bearer ${token}`
    },
    payload: workflowData
  });

  t.assert.strictEqual(response.statusCode, 201);
  const result = JSON.parse(response.body);
  t.assert.ok(result.id);
  t.assert.strictEqual(result.name, workflowData.name);
});

test('should execute a workflow', async (t) => {
  const user = await createTestUser(testContext.tenant.slug, ['workflow:execute']);
  const token = app.jwt.sign({
    userId: user.id,
    tenantSlug: testContext.tenant.slug
  });

  // First create a workflow
  const workflowResponse = await app.inject({
    method: 'POST',
    url: '/api/workflows',
    headers: {
      authorization: `Bearer ${token}`
    },
    payload: {
      name: 'Execution Test Workflow',
      triggerType: 'manual',
      steps: [
        {
          name: 'Test Step',
          type: 'notification',
          config: {
            message: 'Test notification'
          }
        }
      ]
    }
  });

  const workflow = JSON.parse(workflowResponse.body);

  // Then execute it
  const executionResponse = await app.inject({
    method: 'POST',
    url: `/api/workflows/${workflow.id}/execute`,
    headers: {
      authorization: `Bearer ${token}`
    },
    payload: {
      triggerData: {
        test: 'data'
      }
    }
  });

  t.assert.strictEqual(executionResponse.statusCode, 200);
  const result = JSON.parse(executionResponse.body);
  t.assert.ok(result.executionId);
});

test('should get workflow status', async (t) => {
  const user = await createTestUser(testContext.tenant.slug, ['workflow:read']);
  const token = app.jwt.sign({
    userId: user.id,
    tenantSlug: testContext.tenant.slug
  });

  // Create and execute a workflow
  const workflowResponse = await app.inject({
    method: 'POST',
    url: '/api/workflows',
    headers: {
      authorization: `Bearer ${token}`
    },
    payload: {
      name: 'Status Test Workflow',
      triggerType: 'manual',
      steps: [
        {
          name: 'Status Step',
          type: 'task',
          config: {
            assignee: user.id
          }
        }
      ]
    }
  });

  const workflow = JSON.parse(workflowResponse.body);

  const executionResponse = await app.inject({
    method: 'POST',
    url: `/api/workflows/${workflow.id}/execute`,
    headers: {
      authorization: `Bearer ${token}`
    },
    payload: {
      triggerData: {}
    }
  });

  const execution = JSON.parse(executionResponse.body);

  // Get status
  const statusResponse = await app.inject({
    method: 'GET',
    url: `/api/workflows/${workflow.id}/executions/${execution.executionId}`,
    headers: {
      authorization: `Bearer ${token}`
    }
  });

  t.assert.strictEqual(statusResponse.statusCode, 200);
  const result = JSON.parse(statusResponse.body);
  t.assert.strictEqual(result.id, execution.executionId);
  t.assert.strictEqual(result.workflowId, workflow.id);
});