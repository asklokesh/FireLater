import { test } from 'tap';
import { build } from '../../src/app.js';
import { createTestTenant, createTestUser } from '../helpers/test-utils.js';

test('Workflow approval chain integration tests', async (t) => {
  const app = await build();
  const { tenant, cleanup: tenantCleanup } = await createTestTenant();
  const { user, token } = await createTestUser(tenant);

  t.teardown(async () => {
    await tenantCleanup();
  });

  // Test creating workflow with approval chain
  t.test('should create workflow with approval chain', async (t) => {
    const workflowData = {
      name: 'Test Approval Workflow',
      description: 'Workflow with approval steps',
      approvalChain: [
        {
          step: 1,
          approvers: [user.id],
          requiredApprovals: 1,
          timeoutHours: 24
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

    t.equal(response.statusCode, 201);
    const workflow = JSON.parse(response.payload);
    t.equal(workflow.name, workflowData.name);
    t.equal(workflow.approvalChain.length, 1);
    t.equal(workflow.approvalChain[0].step, 1);
  });

  // Test retrieving workflow with approval chain
  t.test('should retrieve workflow with approval chain', async (t) => {
    // First create a workflow
    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/workflows',
      headers: {
        authorization: `Bearer ${token}`
      },
      payload: {
        name: 'Retrieval Test Workflow',
        description: 'For retrieval testing',
        approvalChain: [
          {
            step: 1,
            approvers: [user.id],
            requiredApprovals: 1
          }
        ]
      }
    });

    const createdWorkflow = JSON.parse(createResponse.payload);
    
    // Then retrieve it
    const response = await app.inject({
      method: 'GET',
      url: `/api/workflows/${createdWorkflow.id}`,
      headers: {
        authorization: `Bearer ${token}`
      }
    });

    t.equal(response.statusCode, 200);
    const workflow = JSON.parse(response.payload);
    t.equal(workflow.approvalChain.length, 1);
    t.equal(workflow.approvalChain[0].approvers[0], user.id);
  });

  // Test approval processing
  t.test('should process workflow approvals', async (t) => {
    // Create workflow
    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/workflows',
      headers: {
        authorization: `Bearer ${token}`
      },
      payload: {
        name: 'Approval Processing Workflow',
        description: 'For approval processing testing',
        approvalChain: [
          {
            step: 1,
            approvers: [user.id],
            requiredApprovals: 1
          }
        ]
      }
    });

    const workflow = JSON.parse(createResponse.payload);
    
    // Process approval
    const response = await app.inject({
      method: 'POST',
      url: `/api/workflows/${workflow.id}/approve`,
      headers: {
        authorization: `Bearer ${token}`
      },
      payload: {
        step: 1,
        approved: true,
        comments: 'Approved by test'
      }
    });

    t.equal(response.statusCode, 200);
    const result = JSON.parse(response.payload);
    t.equal(result.status, 'approved');
  });
});