import { describe, it, beforeEach, afterEach } from 'vitest';
import { buildTestServer } from '../../test/helpers/setup.js';
import { createTestTenant } from '../../test/helpers/tenant.js';
import { workflowService } from '../../src/services/workflow.js';
import { requestService } from '../../src/services/requests.js';

describe('Workflow Automation Integration Tests', () => {
  let server: any;
  let tenant: any;
  
  beforeEach(async () => {
    server = await buildTestServer();
    tenant = await createTestTenant();
  });
  
  afterEach(async () => {
    await server.close();
  });
  
  it('should trigger workflow on request creation', async () => {
    // Create a workflow with request creation trigger
    const workflow = await workflowService.create(tenant.slug, {
      name: 'Test Workflow',
      trigger: {
        type: 'request.created',
        conditions: []
      },
      actions: [{
        type: 'notification.email',
        config: {
          to: 'test@example.com',
          subject: 'Request Created',
          body: 'A new request was created'
        }
      }]
    });
    
    // Create a request which should trigger the workflow
    const request = await requestService.create(tenant.slug, {
      title: 'Test Request',
      description: 'Test description'
    });
    
    // Verify workflow was triggered by checking execution history
    const executions = await workflowService.getExecutions(tenant.slug, workflow.id);
    expect(executions).toHaveLength(1);
    expect(executions[0].status).toBe('completed');
  });
  
  it('should handle workflow state transitions', async () => {
    // Create workflow with state transition trigger
    const workflow = await workflowService.create(tenant.slug, {
      name: 'State Transition Workflow',
      trigger: {
        type: 'request.status.changed',
        conditions: [{
          field: 'to',
          operator: 'equals',
          value: 'in_progress'
        }]
      },
      actions: [{
        type: 'assign.user',
        config: {
          userId: 'test-user-id'
        }
      }]
    });
    
    // Create initial request
    const request = await requestService.create(tenant.slug, {
      title: 'Test Request',
      description: 'Test description'
    });
    
    // Update request status to trigger workflow
    await requestService.update(tenant.slug, request.id, {
      status: 'in_progress'
    });
    
    // Verify workflow execution
    const executions = await workflowService.getExecutions(tenant.slug, workflow.id);
    expect(executions).toHaveLength(1);
    expect(executions[0].status).toBe('completed');
  });
});