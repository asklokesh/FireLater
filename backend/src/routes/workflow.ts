import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { validate } from '../middleware/validation.js';

// Validation schemas for workflow approval chains
const approvalChainSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  steps: z.array(z.object({
    stepNumber: z.number().int().min(1),
    approverType: z.enum(['user', 'group', 'role']),
    approverId: z.string().uuid(),
    required: z.boolean().optional(),
    timeoutHours: z.number().int().min(1).max(720).optional(), // 30 days max
  })).min(1),
  isActive: z.boolean().optional(),
});

const updateApprovalChainSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).optional(),
  steps: z.array(z.object({
    stepNumber: z.number().int().min(1),
    approverType: z.enum(['user', 'group', 'role']),
    approverId: z.string().uuid(),
    required: z.boolean().optional(),
    timeoutHours: z.number().int().min(1).max(720).optional(),
  })).min(1).optional(),
  isActive: z.boolean().optional(),
});

const workflowExecutionSchema = z.object({
  workflowId: z.string().uuid(),
  requestId: z.string().uuid().optional(),
  action: z.string().min(1).max(50),
  userId: z.string().uuid().optional(),
  payload: z.record(z.any()).optional(),
});

const approvalActionSchema = z.object({
  approvalChainId: z.string().uuid(),
  stepId: z.string().uuid(),
  action: z.enum(['approve', 'reject', 'delegate']),
  comments: z.string().max(1000).optional(),
  delegateToUserId: z.string().uuid().optional(),
});