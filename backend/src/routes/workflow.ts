import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requirePermission } from '../middleware/auth.js';

// Add validation schemas for workflow operations
const workflowExecutionSchema = z.object({
  requestId: z.string().uuid(),
  action: z.string().min(1).max(50),
  userId: z.string().uuid().optional(),
  payload: z.record(z.any()).optional(),
});

const workflowListSchema = z.object({
  querystring: z.object({
    page: z.number().int().min(1).default(1),
    perPage: z.number().int().min(1).max(100).default(20),
    status: z.enum(['active', 'inactive', 'draft']).optional(),
    sortBy: z.string().max(50).optional(),
    sortOrder: z.enum(['asc', 'desc']).default('asc'),
  }).strict(),
});

export default async function workflowRoutes(fastify: FastifyInstance) {
  // Get workflow definitions
  fastify.get('/workflows', {
    preHandler: [requirePermission('workflow:read')],
    schema: {
      tags: ['Workflows'],
      querystring: workflowListSchema.shape.querystring,
    }
  }, async (request, reply) => {
    // Implementation would go here
  });

  // Execute workflow
  fastify.post('/workflows/execute', {
    preHandler: [requirePermission('workflow:execute')],
    schema: {
      tags: ['Workflows'],
      body: workflowExecutionSchema,
    }
  }, async (request, reply) => {
    // Implementation would go here
  });
}