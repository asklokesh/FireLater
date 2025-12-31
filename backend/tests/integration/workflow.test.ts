import { test } from 'tap';
import { build } from '../../src/app.js';
import { createTestTenant, destroyTestTenant } from '../helpers/tenant.js';
import { createTestUser, destroyTestUser } from '../helpers/auth.js';
import { workflowService } from '../../src/services/workflow.js';

test('workflow route state transitions', async (t) => {
  const tenant = await createTestTenant();
  const user = await createTestUser(tenant.slug, ['workflow:manage']);
  
  const app = build();
  
  t.teardown(async () => {
    await destroyTestUser(user.id);
    await destroyTestTenant(tenant.slug);
    await app.close();
  });
  
  // Create a test workflow
  const workflow = await workflowService.createWorkflow(tenant.slug, {
    name: 'Test Workflow',
    description: 'Test workflow for state transitions',
    initialState: 'draft',
    states: ['draft', 'active', 'archived'],
    transitions: [
      { from: 'draft', to: 'active' },
      { from: 'active', to: 'archived' }
    ]
  });
  
  t.test('should transition workflow state from draft to active', async (t) => {
    const response = await app.inject({
      method: 'POST',
      url: `/workflows/${workflow.id}/transition`,
      headers: {
        authorization: `Bearer ${user.token}`,
        'x-tenant-slug': tenant.slug
      },
      body: {
        newState: 'active'
      }
    });
    
    t.equal(response.statusCode, 200);
    const result = JSON.parse(response.body);
    t.equal(result.state, 'active');
  });
  
  t.test('should transition workflow state from active to archived', async (t) => {
    const response = await app.inject({
      method: 'POST',
      url: `/workflows/${workflow.id}/transition`,
      headers: {
        authorization: `Bearer ${user.token}`,
        'x-tenant-slug': tenant.slug
      },
      body: {
        newState: 'archived'
      }
    });
    
    t.equal(response.statusCode, 200);
    const result = JSON.parse(response.body);
    t.equal(result.state, 'archived');
  });
  
  t.test('should reject invalid state transition', async (t) => {
    const response = await app.inject({
      method: 'POST',
      url: `/workflows/${workflow.id}/transition`,
      headers: {
        authorization: `Bearer ${user.token}`,
        'x-tenant-slug': tenant.slug
      },
      body: {
        newState: 'draft' // Cannot transition from archived to draft
      }
    });
    
    t.equal(response.statusCode, 400);
  });
  
  t.test('should reject transition for non-existent workflow', async (t) => {
    const response = await app.inject({
      method: 'POST',
      url: '/workflows/00000000-0000-0000-0000-000000000000/transition',
      headers: {
        authorization: `Bearer ${user.token}`,
        'x-tenant-slug': tenant.slug
      },
      body: {
        newState: 'active'
      }
    });
    
    t.equal(response.statusCode, 404);
  });
});