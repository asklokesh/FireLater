import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { workflowService } from '../services/workflow.js';
import { requirePermission } from '../middleware/auth.js';
import { validate } from '../middleware/validation.js';

const approvalChainSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  steps: z.array(z.object({
    id: z.string().uuid().optional(),
    stepNumber: z.number().int().min(1),
    approverType: z.enum(['user', 'group', 'role']),
    approverId: z.string().uuid(),
    required: z.boolean().default(true),
    parallel: z.boolean().default(false),
    timeoutHours: z.number().int().min(1).max(168).optional(), // 1 hour to 1 week
  })).min(1),
  isActive: z.boolean().default(true),
});

export async function workflowRoutes(fastify: FastifyInstance) {
  // Create approval chain
  fastify.post('/approval-chains', {
    preHandler: [fastify.authenticate, requirePermission('workflow:manage'), validate({ body: approvalChainSchema })],
    schema: {
      tags: ['Workflows'],
      body: {
        type: 'object',
        required: ['name', 'steps'],
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          steps: {
            type: 'array',
            items: {
              type: 'object',
              required: ['stepNumber', 'approverType', 'approverId'],
              properties: {
                stepNumber: { type: 'integer' },
                approverType: { type: 'string', enum: ['user', 'group', 'role'] },
                approverId: { type: 'string', format: 'uuid' },
                required: { type: 'boolean' },
                parallel: { type: 'boolean' },
                timeoutHours: { type: 'integer', minimum: 1, maximum: 168 }
              }
            }
          },
          isActive: { type: 'boolean' }
        }
      }
    }
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const chainData = request.body as z.infer<typeof approvalChainSchema>;
    
    try {
      const result = await workflowService.createApprovalChain(tenantSlug, chainData);
      return reply.code(201).send(result);
    } catch (error: any) {
      request.log.error({ err: error, tenantSlug }, 'Failed to create approval chain');
      return reply.code(500).send({ message: 'Failed to create approval chain', error: error.message });
    }
  });

  // Get approval chain
  fastify.get('/approval-chains/:chainId', {
    preHandler: [fastify.authenticate, requirePermission('workflow:read')],
    schema: {
      tags: ['Workflows'],
      params: {
        type: 'object',
        required: ['chainId'],
        properties: {
          chainId: { type: 'string', format: 'uuid' }
        }
      }
    }
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { chainId } = request.params as { chainId: string };
    
    try {
      const chain = await workflowService.getApprovalChain(tenantSlug, chainId);
      if (!chain) {
        return reply.code(404).send({ message: 'Approval chain not found' });
      }
      return chain;
    } catch (error: any) {
      request.log.error({ err: error, tenantSlug, chainId }, 'Failed to fetch approval chain');
      return reply.code(500).send({ message: 'Failed to fetch approval chain', error: error.message });
    }
  });

  // List approval chains
  fastify.get('/approval-chains', {
    preHandler: [fastify.authenticate, requirePermission('workflow:read')],
    schema: {
      tags: ['Workflows'],
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'integer', minimum: 1, default: 1 },
          perPage: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          isActive: { type: 'boolean' }
        }
      }
    }
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { page = 1, perPage = 20, isActive } = request.query as { 
      page?: number; 
      perPage?: number; 
      isActive?: boolean;
    };
    
    try {
      const result = await workflowService.listApprovalChains(tenantSlug, {
        page,
        perPage
      }, {
        isActive
      });
      return result;
    } catch (error: any) {
      request.log.error({ err: error, tenantSlug }, 'Failed to list approval chains');
      return reply.code(500).send({ message: 'Failed to list approval chains', error: error.message });
    }
  });

  // Update approval chain
  fastify.put('/approval-chains/:chainId', {
    preHandler: [fastify.authenticate, requirePermission('workflow:manage'), validate({ body: approvalChainSchema })],
    schema: {
      tags: ['Workflows'],
      params: {
        type: 'object',
        required: ['chainId'],
        properties: {
          chainId: { type: 'string', format: 'uuid' }
        }
      },
      body: {
        type: 'object',
        required: ['name', 'steps'],
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          steps: {
            type: 'array',
            items: {
              type: 'object',
              required: ['stepNumber', 'approverType', 'approverId'],
              properties: {
                stepNumber: { type: 'integer' },
                approverType: { type: 'string', enum: ['user', 'group', 'role'] },
                approverId: { type: 'string', format: 'uuid' },
                required: { type: 'boolean' },
                parallel: { type: 'boolean' },
                timeoutHours: { type: 'integer', minimum: 1, maximum: 168 }
              }
            }
          },
          isActive: { type: 'boolean' }
        }
      }
    }
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { chainId } = request.params as { chainId: string };
    const chainData = request.body as z.infer<typeof approvalChainSchema>;
    
    try {
      const result = await workflowService.updateApprovalChain(tenantSlug, chainId, chainData);
      return result;
    } catch (error: any) {
      request.log.error({ err: error, tenantSlug, chainId }, 'Failed to update approval chain');
      if (error.message === 'Approval chain not found') {
        return reply.code(404).send({ message: 'Approval chain not found' });
      }
      return reply.code(500).send({ message: 'Failed to update approval chain', error: error.message });
    }
  });

  // Delete approval chain
  fastify.delete('/approval-chains/:chainId', {
    preHandler: [fastify.authenticate, requirePermission('workflow:manage')],
    schema: {
      tags: ['Workflows'],
      params: {
        type: 'object',
        required: ['chainId'],
        properties: {
          chainId: { type: 'string', format: 'uuid' }
        }
      }
    }
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { chainId } = request.params as { chainId: string };
    
    try {
      await workflowService.deleteApprovalChain(tenantSlug, chainId);
      return reply.code(204).send();
    } catch (error: any) {
      request.log.error({ err: error, tenantSlug, chainId }, 'Failed to delete approval chain');
      if (error.message === 'Approval chain not found') {
        return reply.code(404).send({ message: 'Approval chain not found' });
      }
      return reply.code(500).send({ message: 'Failed to delete approval chain', error: error.message });
    }
  });
}