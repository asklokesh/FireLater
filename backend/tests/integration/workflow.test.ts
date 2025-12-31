import { describe, it, beforeEach, afterEach } from 'vitest';
import { buildTestApp } from '../utils/test-helpers.js';
import { createTestTenant, createTestUser } from '../utils/test-data.js';
import { workflowService } from '../../src/services/workflow.js';
import { db } from '../../src/utils/db.js';

describe('Workflow Engine Integration Tests', () => {
  let app: any;
  let tenant: any;
  let user: any;

  beforeEach(async () => {
    app = await buildTestApp();
    tenant = await createTestTenant();
    user = await createTestUser(tenant.slug);
  });

  afterEach(async () => {
    await app.close();
  });

  describe('Approval Chains', () => {
    it('should process sequential approval chain correctly', async () => {
      // Create workflow with sequential approval steps
      const workflow = await workflowService.createWorkflow(tenant.slug, {
        name: 'Test Approval Workflow',
        description: 'Test sequential approvals',
        steps: [
          {
            id: 'step1',
            type: 'approval',
            name: 'Manager Approval',
            config: {
              approvers: [user.id],
              approvalType: 'sequential'
            }
          },
          {
            id: 'step2',
            type: 'approval',
            name: 'Director Approval',
            config: {
              approvers: [user.id],
              approvalType: 'sequential'
            }
          }
        ],
        startStepId: 'step1'
      });

      // Create workflow instance
      const instance = await workflowService.createInstance(
        tenant.slug,
        workflow.id,
        { requesterId: user.id }
      );

      // Verify initial state
      expect(instance.currentStepId).toBe('step1');
      expect(instance.status).toBe('pending');

      // Approve first step
      await workflowService.approveStep(tenant.slug, instance.id, 'step1', user.id, 'Approved');

      // Verify transition to next step
      const updatedInstance = await workflowService.getInstance(tenant.slug, instance.id);
      expect(updatedInstance.currentStepId).toBe('step2');
      expect(updatedInstance.status).toBe('pending');

      // Approve second step
      await workflowService.approveStep(tenant.slug, instance.id, 'step2', user.id, 'Approved');

      // Verify workflow completion
      const finalInstance = await workflowService.getInstance(tenant.slug, instance.id);
      expect(finalInstance.status).toBe('completed');
    });

    it('should handle parallel approval chain', async () => {
      // Create workflow with parallel approval steps
      const workflow = await workflowService.createWorkflow(tenant.slug, {
        name: 'Parallel Approval Workflow',
        description: 'Test parallel approvals',
        steps: [
          {
            id: 'parallel1',
            type: 'approval',
            name: 'Team Lead Approval',
            config: {
              approvers: [user.id],
              approvalType: 'parallel'
            }
          }
        ],
        startStepId: 'parallel1'
      });

      const instance = await workflowService.createInstance(
        tenant.slug,
        workflow.id,
        { requesterId: user.id }
      );

      // Approve parallel step
      await workflowService.approveStep(tenant.slug, instance.id, 'parallel1', user.id, 'Approved');

      // Verify workflow completion
      const updatedInstance = await workflowService.getInstance(tenant.slug, instance.id);
      expect(updatedInstance.status).toBe('completed');
    });
  });

  describe('State Transitions', () => {
    it('should handle workflow state transitions correctly', async () => {
      const workflow = await workflowService.createWorkflow(tenant.slug, {
        name: 'State Transition Workflow',
        description: 'Test state transitions',
        steps: [
          {
            id: 'initial',
            type: 'task',
            name: 'Initial Task'
          },
          {
            id: 'review',
            type: 'approval',
            name: 'Review Task',
            config: {
              approvers: [user.id]
            }
          }
        ],
        startStepId: 'initial'
      });

      const instance = await workflowService.createInstance(
        tenant.slug,
        workflow.id,
        { requesterId: user.id }
      );

      // Complete initial task
      await workflowService.completeStep(tenant.slug, instance.id, 'initial');

      // Verify transition to approval step
      const updatedInstance = await workflowService.getInstance(tenant.slug, instance.id);
      expect(updatedInstance.currentStepId).toBe('review');
      expect(updatedInstance.status).toBe('pending');

      // Reject approval
      await workflowService.rejectStep(tenant.slug, instance.id, 'review', user.id, 'Needs changes');

      // Verify rejection state
      const rejectedInstance = await workflowService.getInstance(tenant.slug, instance.id);
      expect(rejectedInstance.status).toBe('rejected');
    });

    it('should handle workflow cancellation', async () => {
      const workflow = await workflowService.createWorkflow(tenant.slug, {
        name: 'Cancellable Workflow',
        description: 'Test workflow cancellation',
        steps: [
          {
            id: 'step1',
            type: 'approval',
            name: 'Approval Step'
          }
        ],
        startStepId: 'step1'
      });

      const instance = await workflowService.createInstance(
        tenant.slug,
        workflow.id,
        { requesterId: user.id }
      );

      // Cancel workflow
      await workflowService.cancelInstance(tenant.slug, instance.id, user.id, 'No longer needed');

      // Verify cancellation
      const cancelledInstance = await workflowService.getInstance(tenant.slug, instance.id);
      expect(cancelledInstance.status).toBe('cancelled');
      expect(cancelledInstance.cancelledAt).toBeDefined();
      expect(cancelledInstance.cancelledBy).toBe(user.id);
    });
  });
});