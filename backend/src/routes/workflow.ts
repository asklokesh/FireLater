import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { workflowService } from '../services/workflow.js';
import { requirePermission } from '../middleware/auth.js';
import { BadRequestError } from '../utils/errors.js';

// Add approval chain validation schema
const approvalChainSchema = z.object({
  approvers: z.array(z.object({
    userId: z.string().uuid().optional(),
    groupId: z.string().uuid().optional(),
    role: z.string().optional(),
    order: z.number().int().min(1)
  })).min(1),
  approvalType: z.enum(['sequential', 'parallel']).default('sequential'),
  requiresAll: z.boolean().default(false)
}).refine((data) => {
  // Validate that each approver has at least one of userId, groupId, or role
  return data.approvers.every(approver => 
    approver.userId || approver.groupId || approver.role
  );
}, {
  message: "Each approver must have at least one of userId, groupId, or role"
});

// In the workflow creation route, add approval chain validation:
fastify.post('/', {
  preHandler: [requirePermission('workflow:create')],
  schema: {
    body: {
      type: 'object',
      required: ['name', 'type'],
      properties: {
        name: { type: 'string' },
        type: { type: 'string' },
        description: { type: 'string' },
        approvalChain: {
          type: 'object',
          properties: {
            approvers: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  userId: { type: 'string', format: 'uuid' },
                  groupId: { type: 'string', format: 'uuid' },
                  role: { type: 'string' },
                  order: { type: 'number', minimum: 1 }
                },
                required: ['order']
              }
            },
            approvalType: { type: 'string', enum: ['sequential', 'parallel'] },
            requiresAll: { type: 'boolean' }
          }
        }
      }
    }
  }
}, async (request, reply) => {
  const { tenantSlug } = request.user;
  const { name, type, description, approvalChain } = request.body as {
    name: string;
    type: string;
    description?: string;
    approvalChain?: any;
  };

  // Validate approval chain if provided
  if (approvalChain) {
    try {
      approvalChainSchema.parse(approvalChain);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        throw new BadRequestError(`Invalid approval chain: ${error.errors.map(e => e.message).join(', ')}`);
      }
      throw new BadRequestError('Invalid approval chain format');
    }
  }

  const result = await workflowService.createWorkflow(tenantSlug, {
    name,
    type,
    description,
    approvalChain
  });

  return reply.code(201).send(result);
});