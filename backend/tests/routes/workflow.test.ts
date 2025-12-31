import { test, expect, beforeEach, afterEach } from 'vitest';
import { buildApp } from '../../src/app.js';
import { createTestTenant, createTestUser, cleanupTestTenant } from '../test-utils.js';
import { workflowService } from '../../src/services/workflow.js';

let app: any;
let tenant: any;
let user: any;
let authToken: string;

beforeEach(async () => {
  app = await buildApp();
  tenant = await createTestTenant();
  user = await createTestUser(tenant.slug, { permissions: ['workflow:approve'] });
  
  // Login to get auth token
  const loginResponse = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: {
      email: user.email,
      password: 'testpassword123'
    }
  });
  
  authToken = loginResponse.json().token;
});

afterEach(async () => {
  await cleanupTestTenant(tenant.slug);
  await app.close();
});

test('should approve workflow step when user has permission', async () => {
  // Create a test workflow with pending approval
  const workflow = await workflowService.create(tenant.slug, {
    name: 'Test Workflow',
    description: 'Test workflow for approval',
    steps: [
      {
        id: 'step1',
        type: 'approval',
        name: 'Manager Approval',
        config: {
          approvers: [user.id]
        }
      }
    ],
    startStepId: 'step1'
  });

  const response = await app.inject({
    method: 'POST',
    url: `/workflows/${workflow.id}/approve`,
    headers: {
      authorization: `Bearer ${authToken}`,
      'x-tenant-slug': tenant.slug
    },
    payload: {
      stepId: 'step1',
      approved: true,
      comment: 'Approved by manager'
    }
  });

  expect(response.statusCode).toBe(200);
  const result = response.json();
  expect(result.success).toBe(true);
  expect(result.step.status).toBe('approved');
});

test('should reject workflow step with comment', async () => {
  const workflow = await workflowService.create(tenant.slug, {
    name: 'Test Workflow',
    description: 'Test workflow for approval',
    steps: [
      {
        id: 'step1',
        type: 'approval',
        name: 'Manager Approval',
        config: {
          approvers: [user.id]
        }
      }
    ],
    startStepId: 'step1'
  });

  const response = await app.inject({
    method: 'POST',
    url: `/workflows/${workflow.id}/approve`,
    headers: {
      authorization: `Bearer ${authToken}`,
      'x-tenant-slug': tenant.slug
    },
    payload: {
      stepId: 'step1',
      approved: false,
      comment: 'More information needed'
    }
  });

  expect(response.statusCode).toBe(200);
  const result = response.json();
  expect(result.success).toBe(true);
  expect(result.step.status).toBe('rejected');
  expect(result.step.comment).toBe('More information needed');
});

test('should fail to approve workflow step when user lacks permission', async () => {
  // Create user without approval permissions
  const regularUser = await createTestUser(tenant.slug, { permissions: ['workflow:read'] });
  
  const loginResponse = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: {
      email: regularUser.email,
      password: 'testpassword123'
    }
  });
  
  const regularUserToken = loginResponse.json().token;

  const workflow = await workflowService.create(tenant.slug, {
    name: 'Test Workflow',
    description: 'Test workflow for approval',
    steps: [
      {
        id: 'step1',
        type: 'approval',
        name: 'Manager Approval',
        config: {
          approvers: [user.id]
        }
      }
    ],
    startStepId: 'step1'
  });

  const response = await app.inject({
    method: 'POST',
    url: `/workflows/${workflow.id}/approve`,
    headers: {
      authorization: `Bearer ${regularUserToken}`,
      'x-tenant-slug': tenant.slug
    },
    payload: {
      stepId: 'step1',
      approved: true
    }
  });

  expect(response.statusCode).toBe(403);
});

test('should fail to approve non-existent workflow', async () => {
  const response = await app.inject({
    method: 'POST',
    url: '/workflows/non-existent-id/approve',
    headers: {
      authorization: `Bearer ${authToken}`,
      'x-tenant-slug': tenant.slug
    },
    payload: {
      stepId: 'step1',
      approved: true
    }
  });

  expect(response.statusCode).toBe(404);
});