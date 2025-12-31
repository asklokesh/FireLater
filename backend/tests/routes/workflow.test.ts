import { test } from 'tap';
import { build } from '../../src/app.js';
import { createTestTenant, createTestUser, createTestRequest } from '../helpers/test-data.js';
import { workflowService } from '../../src/services/workflow.js';

test('workflow approval routes', async (t) => {
  const app = await build();
  const tenant = await createTestTenant();
  const user = await createTestUser(tenant.id, ['change:approve']);
  const token = app.jwt.sign({ 
    userId: user.id, 
    tenantId: tenant.id,
    permissions: user.permissions 
  });

  t.afterEach(async () => {
    // Cleanup test data
    await app.pg.query('DELETE FROM workflow_approvals WHERE tenant_id = $1', [tenant.id]);
    await app.pg.query('DELETE FROM change_requests WHERE tenant_id = $1', [tenant.id]);
  });

  t.test('POST /workflow/approvals/:id/approve - approve workflow step', async (t) => {
    // Create test request with approval workflow
    const request = await createTestRequest(tenant.id, user.id, {
      type: 'change',
      title: 'Test Change Request',
      workflow: {
        steps: [
          { type: 'approval', approvers: [user.id], requiredApprovals: 1 }
        ]
      }
    });

    const approval = await workflowService.getPendingApprovals(request.id);
    const response = await app.inject({
      method: 'POST',
      url: `/workflow/approvals/${approval[0].id}/approve`,
      headers: { authorization: `Bearer ${token}` },
      payload: { 
        comment: 'Approved for testing' 
      }
    });

    t.equal(response.statusCode, 200);
    const result = JSON.parse(response.payload);
    t.equal(result.status, 'approved');
    t.equal(result.comment, 'Approved for testing');
  });

  t.test('POST /workflow/approvals/:id/reject - reject workflow step', async (t) => {
    const request = await createTestRequest(tenant.id, user.id, {
      type: 'change',
      title: 'Test Change Request',
      workflow: {
        steps: [
          { type: 'approval', approvers: [user.id], requiredApprovals: 1 }
        ]
      }
    });

    const approval = await workflowService.getPendingApprovals(request.id);
    const response = await app.inject({
      method: 'POST',
      url: `/workflow/approvals/${approval[0].id}/reject`,
      headers: { authorization: `Bearer ${token}` },
      payload: { 
        comment: 'Needs more information' 
      }
    });

    t.equal(response.statusCode, 200);
    const result = JSON.parse(response.payload);
    t.equal(result.status, 'rejected');
    t.equal(result.comment, 'Needs more information');
  });

  t.test('GET /workflow/approvals/pending - list pending approvals', async (t) => {
    // Create request with pending approval
    await createTestRequest(tenant.id, user.id, {
      type: 'change',
      title: 'Test Change Request',
      workflow: {
        steps: [
          { type: 'approval', approvers: [user.id], requiredApprovals: 1 }
        ]
      }
    });

    const response = await app.inject({
      method: 'GET',
      url: '/workflow/approvals/pending',
      headers: { authorization: `Bearer ${token}` },
      query: { page: '1', perPage: '10' }
    });

    t.equal(response.statusCode, 200);
    const result = JSON.parse(response.payload);
    t.equal(result.items.length, 1);
    t.equal(result.items[0].status, 'pending');
    t.equal(result.items[0].request.title, 'Test Change Request');
  });

  t.test('POST /workflow/approvals/:id/approve - unauthorized user', async (t) => {
    const otherUser = await createTestUser(tenant.id, []);
    const otherToken = app.jwt.sign({ 
      userId: otherUser.id, 
      tenantId: tenant.id,
      permissions: otherUser.permissions 
    });

    const request = await createTestRequest(tenant.id, user.id, {
      type: 'change',
      title: 'Test Change Request',
      workflow: {
        steps: [
          { type: 'approval', approvers: [user.id], requiredApprovals: 1 }
        ]
      }
    });

    const approval = await workflowService.getPendingApprovals(request.id);
    const response = await app.inject({
      method: 'POST',
      url: `/workflow/approvals/${approval[0].id}/approve`,
      headers: { authorization: `Bearer ${otherToken}` },
      payload: { comment: 'Should be rejected' }
    });

    t.equal(response.statusCode, 403);
  });
});