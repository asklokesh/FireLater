import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WorkflowService } from '../../src/services/workflow.js';
import { ApprovalChain, ApprovalChainStep, WorkflowStepType } from '../../src/types/workflow.js';

describe('WorkflowService - Approval Chain Logic', () => {
  let workflowService: WorkflowService;
  let mockDb: any;

  beforeEach(() => {
    mockDb = {
      query: vi.fn(),
      one: vi.fn(),
      many: vi.fn(),
    };
    workflowService = new WorkflowService(mockDb as any);
  });

  describe('getNextApprovalStep', () => {
    it('should return null for empty approval chain', async () => {
      const chain: ApprovalChain = {
        id: 'test-chain',
        name: 'Test Chain',
        steps: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await workflowService.getNextApprovalStep(chain, []);
      expect(result).toBeNull();
    });

    it('should return first step for new approval chain', async () => {
      const step1: ApprovalChainStep = {
        id: 'step1',
        type: WorkflowStepType.USER,
        userId: 'user1',
        order: 1,
      };
      
      const step2: ApprovalChainStep = {
        id: 'step2',
        type: WorkflowStepType.USER,
        userId: 'user2',
        order: 2,
      };

      const chain: ApprovalChain = {
        id: 'test-chain',
        name: 'Test Chain',
        steps: [step1, step2],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await workflowService.getNextApprovalStep(chain, []);
      expect(result).toEqual(step1);
    });

    it('should return next unapproved step', async () => {
      const step1: ApprovalChainStep = {
        id: 'step1',
        type: WorkflowStepType.USER,
        userId: 'user1',
        order: 1,
      };
      
      const step2: ApprovalChainStep = {
        id: 'step2',
        type: WorkflowStepType.USER,
        userId: 'user2',
        order: 2,
      };

      const chain: ApprovalChain = {
        id: 'test-chain',
        name: 'Test Chain',
        steps: [step1, step2],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const completedSteps = [{ stepId: 'step1', approved: true, userId: 'user1' }];

      const result = await workflowService.getNextApprovalStep(chain, completedSteps);
      expect(result).toEqual(step2);
    });

    it('should skip already approved steps', async () => {
      const step1: ApprovalChainStep = {
        id: 'step1',
        type: WorkflowStepType.USER,
        userId: 'user1',
        order: 1,
      };
      
      const step2: ApprovalChainStep = {
        id: 'step2',
        type: WorkflowStepType.USER,
        userId: 'user2',
        order: 2,
      };
      
      const step3: ApprovalChainStep = {
        id: 'step3',
        type: WorkflowStepType.USER,
        userId: 'user3',
        order: 3,
      };

      const chain: ApprovalChain = {
        id: 'test-chain',
        name: 'Test Chain',
        steps: [step1, step2, step3],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const completedSteps = [
        { stepId: 'step1', approved: true, userId: 'user1' },
        { stepId: 'step2', approved: true, userId: 'user2' }
      ];

      const result = await workflowService.getNextApprovalStep(chain, completedSteps);
      expect(result).toEqual(step3);
    });

    it('should return null when all steps are approved', async () => {
      const step1: ApprovalChainStep = {
        id: 'step1',
        type: WorkflowStepType.USER,
        userId: 'user1',
        order: 1,
      };
      
      const step2: ApprovalChainStep = {
        id: 'step2',
        type: WorkflowStepType.USER,
        userId: 'user2',
        order: 2,
      };

      const chain: ApprovalChain = {
        id: 'test-chain',
        name: 'Test Chain',
        steps: [step1, step2],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const completedSteps = [
        { stepId: 'step1', approved: true, userId: 'user1' },
        { stepId: 'step2', approved: true, userId: 'user2' }
      ];

      const result = await workflowService.getNextApprovalStep(chain, completedSteps);
      expect(result).toBeNull();
    });

    it('should handle rejected approval chain', async () => {
      const step1: ApprovalChainStep = {
        id: 'step1',
        type: WorkflowStepType.USER,
        userId: 'user1',
        order: 1,
      };
      
      const step2: ApprovalChainStep = {
        id: 'step2',
        type: WorkflowStepType.USER,
        userId: 'user2',
        order: 2,
      };

      const chain: ApprovalChain = {
        id: 'test-chain',
        name: 'Test Chain',
        steps: [step1, step2],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const completedSteps = [
        { stepId: 'step1', approved: false, userId: 'user1', reason: 'Not approved' }
      ];

      const result = await workflowService.getNextApprovalStep(chain, completedSteps);
      expect(result).toBeNull();
    });

    it('should handle parallel approval steps', async () => {
      const step1: ApprovalChainStep = {
        id: 'step1',
        type: WorkflowStepType.USER,
        userId: 'user1',
        order: 1,
      };
      
      const step2a: ApprovalChainStep = {
        id: 'step2a',
        type: WorkflowStepType.USER,
        userId: 'user2a',
        order: 2,
      };
      
      const step2b: ApprovalChainStep = {
        id: 'step2b',
        type: WorkflowStepType.USER,
        userId: 'user2b',
        order: 2, // Same order as step2a - parallel
      };

      const chain: ApprovalChain = {
        id: 'test-chain',
        name: 'Test Chain',
        steps: [step1, step2a, step2b],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const completedSteps = [
        { stepId: 'step1', approved: true, userId: 'user1' }
      ];

      const result = await workflowService.getNextApprovalStep(chain, completedSteps);
      expect([step2a, step2b]).toContainEqual(result);
    });

    it('should handle group-based approval steps', async () => {
      const step1: ApprovalChainStep = {
        id: 'step1',
        type: WorkflowStepType.USER,
        userId: 'user1',
        order: 1,
      };
      
      const step2: ApprovalChainStep = {
        id: 'step2',
        type: WorkflowStepType.GROUP,
        groupId: 'group1',
        order: 2,
      };

      const chain: ApprovalChain = {
        id: 'test-chain',
        name: 'Test Chain',
        steps: [step1, step2],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const completedSteps = [
        { stepId: 'step1', approved: true, userId: 'user1' }
      ];

      const result = await workflowService.getNextApprovalStep(chain, completedSteps);
      expect(result).toEqual(step2);
      expect(result?.type).toBe(WorkflowStepType.GROUP);
    });

    it('should handle mixed user and group approvals', async () => {
      const step1: ApprovalChainStep = {
        id: 'step1',
        type: WorkflowStepType.USER,
        userId: 'user1',
        order: 1,
      };
      
      const step2: ApprovalChainStep = {
        id: 'step2',
        type: WorkflowStepType.GROUP,
        groupId: 'group1',
        order: 2,
      };
      
      const step3: ApprovalChainStep = {
        id: 'step3',
        type: WorkflowStepType.USER,
        userId: 'user3',
        order: 3,
      };

      const chain: ApprovalChain = {
        id: 'test-chain',
        name: 'Test Chain',
        steps: [step1, step2, step3],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const completedSteps = [
        { stepId: 'step1', approved: true, userId: 'user1' },
        { stepId: 'step2', approved: true, userId: 'user2' } // Group approval represented by user2
      ];

      const result = await workflowService.getNextApprovalStep(chain, completedSteps);
      expect(result).toEqual(step3);
    });

    it('should handle approval chain with conditions', async () => {
      const step1: ApprovalChainStep = {
        id: 'step1',
        type: WorkflowStepType.USER,
        userId: 'user1',
        order: 1,
      };
      
      const step2: ApprovalChainStep = {
        id: 'step2',
        type: WorkflowStepType.CONDITIONAL,
        condition: 'request.amount > 1000',
        order: 2,
        nextStepId: 'step3',
        elseStepId: 'step4',
      };
      
      const step3: ApprovalChainStep = {
        id: 'step3',
        type: WorkflowStepType.USER,
        userId: 'user3',
        order: 3,
      };
      
      const step4: ApprovalChainStep = {
        id: 'step4',
        type: WorkflowStepType.USER,
        userId: 'user4',
        order: 3,
      };

      const chain: ApprovalChain = {
        id: 'test-chain',
        name: 'Test Chain',
        steps: [step1, step2, step3, step4],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const completedSteps = [
        { stepId: 'step1', approved: true, userId: 'user1' }
      ];

      // Mock condition evaluation
      vi.spyOn(workflowService as any, 'evaluateCondition').mockResolvedValue(true);

      const result = await workflowService.getNextApprovalStep(chain, completedSteps);
      expect(result).toEqual(step2);
    });

    it('should handle circular approval chain references', async () => {
      const step1: ApprovalChainStep = {
        id: 'step1',
        type: WorkflowStepType.USER,
        userId: 'user1',
        order: 1,
        nextStepId: 'step2',
      };
      
      const step2: ApprovalChainStep = {
        id: 'step2',
        type: WorkflowStepType.USER,
        userId: 'user2',
        order: 2,
        nextStepId: 'step1', // Circular reference
      };

      const chain: ApprovalChain = {
        id: 'test-chain',
        name: 'Test Chain',
        steps: [step1, step2],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const completedSteps = [
        { stepId: 'step1', approved: true, userId: 'user1' }
      ];

      const result = await workflowService.getNextApprovalStep(chain, completedSteps);
      expect(result).toEqual(step2);
    });

    it('should handle malformed approval chain steps', async () => {
      const chain: ApprovalChain = {
        id: 'test-chain',
        name: 'Test Chain',
        steps: [null as any, undefined as any], // Malformed steps
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await workflowService.getNextApprovalStep(chain, []);
      expect(result).toBeNull();
    });

    it('should handle approval chain with duplicate step IDs', async () => {
      const step1: ApprovalChainStep = {
        id: 'step1',
        type: WorkflowStepType.USER,
        userId: 'user1',
        order: 1,
      };
      
      const step2: ApprovalChainStep = {
        id: 'step1', // Duplicate ID
        type: WorkflowStepType.USER,
        userId: 'user2',
        order: 2,
      };

      const chain: ApprovalChain = {
        id: 'test-chain',
        name: 'Test Chain',
        steps: [step1, step2],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await workflowService.getNextApprovalStep(chain, []);
      expect(result).toEqual(step1);
    });
  });
});