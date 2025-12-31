import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestEnvironment, teardownTestEnvironment, TestEnvironment } from '../helpers/test-utils.js';
import { createTestUser, createTestTenant } from '../helpers/auth.js';
import { workflowService } from '../../src/services/workflow.js';

describe('Workflow Approval Chain Integration Tests', () => {
  let env: TestEnvironment;
  let tenantSlug: string;
  let authToken: string;

  beforeAll(async () => {
    env = await setupTestEnvironment();
    const tenant = await createTestTenant(env.db);
    tenantSlug = tenant.slug;
    const user = await createTestUser(env.db, tenantSlug, ['workflow:manage']);
    authToken = user.token;
  });

  afterAll(async () => {
    await teardownTestEnvironment(env);
  });

  it('should create workflow with approval chain', async () => {
    const workflowData = {
      name: 'Test Approval Workflow',
      description: 'Workflow with approval chain',
      approvalChain: [
        { 
          step: 1, 
          approvers: [{ type: 'user', id: 'test-user-1' }] 
        },
        { 
          step: 2, 
          approvers: [{ type: 'group', id: 'test-group-1' }] 
        }
      ]
    };

    const response = await env.client.post('/api/v1/workflows', {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'x-tenant-slug': tenantSlug
      },
      body: workflowData
    });

    expect(response.statusCode).toBe(201);
    const workflow = response.json();
    expect(workflow.approvalChain).toHaveLength(2);
    expect(workflow.approvalChain[0].step).toBe(1);
    expect(workflow.approvalChain[1].step).toBe(2);
  });

  it('should retrieve workflow with approval chain', async () => {
    // Create a workflow with approval chain first
    const workflow = await workflowService.create(tenantSlug, {
      name: 'Retrieval Test Workflow',
      description: 'For retrieval test',
      approvalChain: [
        { step: 1, approvers: [{ type: 'user', id: 'test-user-1' }] }
      ]
    });

    const response = await env.client.get(`/api/v1/workflows/${workflow.id}`, {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'x-tenant-slug': tenantSlug
      }
    });

    expect(response.statusCode).toBe(200);
    const retrievedWorkflow = response.json();
    expect(retrievedWorkflow.approvalChain).toBeDefined();
    expect(retrievedWorkflow.approvalChain[0].approvers[0].id).toBe('test-user-1');
  });
});