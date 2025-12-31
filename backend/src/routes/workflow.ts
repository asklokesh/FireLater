// Add approval chain validation schemas
const createApprovalChainSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  steps: z.array(z.object({
    stepNumber: z.number().int().min(1),
    approverType: z.enum(['user', 'group', 'role']),
    approverId: z.string().uuid(),
    required: z.boolean().optional(),
  })).min(1),
  isActive: z.boolean().optional(),
});

const updateApprovalChainSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).optional(),
  steps: z.array(z.object({
    id: z.string().uuid().optional(),
    stepNumber: z.number().int().min(1),
    approverType: z.enum(['user', 'group', 'role']),
    approverId: z.string().uuid(),
    required: z.boolean().optional(),
  })).optional(),
  isActive: z.boolean().optional(),
});

// Add approval chain routes
fastify.post('/approval-chains', {
  schema: {
    tags: ['Workflows'],
    body: {
      type: 'object',
      required: ['name', 'steps'],
      properties: {
        name: { type: 'string', minLength: 1, maxLength: 255 },
        description: { type: 'string', maxLength: 1000 },
        steps: {
          type: 'array',
          items: {
            type: 'object',
            required: ['stepNumber', 'approverType', 'approverId'],
            properties: {
              stepNumber: { type: 'integer', minimum: 1 },
              approverType: { type: 'string', enum: ['user', 'group', 'role'] },
              approverId: { type: 'string', pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' },
              required: { type: 'boolean' }
            }
          },
          minItems: 1
        },
        isActive: { type: 'boolean' }
      }
    }
  },
  preHandler: [fastify.authenticate, validate({
    body: createApprovalChainSchema
  })]
}, async (request, reply) => {
  const { name, description, steps, isActive } = request.body as { 
    name: string; 
    description?: string; 
    steps: Array<{ stepNumber: number; approverType: string; approverId: string; required?: boolean }>;
    isActive?: boolean;
  };
  
  try {
    const approvalChain = await workflowService.createApprovalChain(
      request.user.tenant.slug,
      { name, description, steps, isActive }
    );
    
    return reply.code(201).send(approvalChain);
  } catch (error: any) {
    request.log.error({ err: error, tenant: request.user.tenant.slug }, 'Failed to create approval chain');
    return reply.code(500).send({ message: 'Failed to create approval chain' });
  }
});

fastify.get('/approval-chains', {
  schema: {
    tags: ['Workflows'],
    querystring: {
      type: 'object',
      properties: {
        page: { type: 'integer', minimum: 1, default: 1 },
        perPage: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        activeOnly: { type: 'boolean' }
      }
    }
  },
  preHandler: [fastify.authenticate]
}, async (request, reply) => {
  const { page = 1, perPage = 20, activeOnly } = request.query as { 
    page?: number; 
    perPage?: number; 
    activeOnly?: boolean;
  };
  
  try {
    const result = await workflowService.listApprovalChains(
      request.user.tenant.slug,
      { page, perPage, activeOnly }
    );
    
    return reply.code(200).send(result);
  } catch (error: any) {
    request.log.error({ err: error, tenant: request.user.tenant.slug }, 'Failed to list approval chains');
    return reply.code(500).send({ message: 'Failed to list approval chains' });
  }
});

fastify.get('/approval-chains/:id', {
  schema: {
    tags: ['Workflows'],
    params: {
      type: 'object',
      properties: {
        id: { type: 'string', pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' }
      },
      required: ['id']
    }
  },
  preHandler: [fastify.authenticate, validate({
    params: {
      type: 'object',
      properties: {
        id: { type: 'string', pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' }
      },
      required: ['id']
    }
  })]
}, async (request, reply) => {
  const { id } = request.params as { id: string };
  
  try {
    const approvalChain = await workflowService.getApprovalChain(
      request.user.tenant.slug,
      id
    );
    
    if (!approvalChain) {
      return reply.code(404).send({ message: 'Approval chain not found' });
    }
    
    return reply.code(200).send(approvalChain);
  } catch (error: any) {
    request.log.error({ err: error, tenant: request.user.tenant.slug, id }, 'Failed to get approval chain');
    return reply.code(500).send({ message: 'Failed to get approval chain' });
  }
});

fastify.put('/approval-chains/:id', {
  schema: {
    tags: ['Workflows'],
    params: {
      type: 'object',
      properties: {
        id: { type: 'string', pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' }
      },
      required: ['id']
    },
    body: {
      type: 'object',
      properties: {
        name: { type: 'string', minLength: 1, maxLength: 255 },
        description: { type: 'string', maxLength: 1000 },
        steps: {
          type: 'array',
          items: {
            type: 'object',
            required: ['stepNumber', 'approverType', 'approverId'],
            properties: {
              id: { type: 'string', pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' },
              stepNumber: { type: 'integer', minimum: 1 },
              approverType: { type: 'string', enum: ['user', 'group', 'role'] },
              approverId: { type: 'string', pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' },
              required: { type: 'boolean' }
            }
          }
        },
        isActive: { type: 'boolean' }
      }
    }
  },
  preHandler: [fastify.authenticate, validate({
    params: {
      type: 'object',
      properties: {
        id: { type: 'string', pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' }
      },
      required: ['id']
    },
    body: updateApprovalChainSchema
  })]
}, async (request, reply) => {
  const { id } = request.params as { id: string };
  const updateData = request.body as Partial<{
    name: string;
    description: string;
    steps: Array<{ id?: string; stepNumber: number; approverType: string; approverId: string; required?: boolean }>;
    isActive: boolean;
  }>;
  
  try {
    const approvalChain = await workflowService.updateApprovalChain(
      request.user.tenant.slug,
      id,
      updateData
    );
    
    return reply.code(200).send(approvalChain);
  } catch (error: any) {
    request.log.error({ err: error, tenant: request.user.tenant.slug, id }, 'Failed to update approval chain');
    return reply.code(500).send({ message: 'Failed to update approval chain' });
  }
});

fastify.delete('/approval-chains/:id', {
  schema: {
    tags: ['Workflows'],
    params: {
      type: 'object',
      properties: {
        id: { type: 'string', pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' }
      },
      required: ['id']
    }
  },
  preHandler: [fastify.authenticate, validate({
    params: {
      type: 'object',
      properties: {
        id: { type: 'string', pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' }
      },
      required: ['id']
    }
  })]
}, async (request, reply) => {
  const { id } = request.params as { id: string };
  
  try {
    await workflowService.deleteApprovalChain(
      request.user.tenant.slug,
      id
    );
    
    return reply.code(204).send();
  } catch (error: any) {
    request.log.error({ err: error, tenant: request.user.tenant.slug, id }, 'Failed to delete approval chain');
    return reply.code(500).send({ message: 'Failed to delete approval chain' });
  }
});