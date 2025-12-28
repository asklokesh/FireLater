import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { slaService } from '../services/sla.js';

// ============================================
// SCHEMAS
// ============================================

const slaPolicySchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  entityType: z.enum(['issue', 'problem', 'change']),
  isDefault: z.boolean().optional(),
  targets: z.array(z.object({
    metricType: z.enum(['response_time', 'resolution_time']),
    priority: z.enum(['critical', 'high', 'medium', 'low']),
    targetMinutes: z.number().int().positive(),
    warningThresholdPercent: z.number().int().min(1).max(100).optional(),
  })).optional(),
});

const updateSlaPolicySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

const slaTargetSchema = z.object({
  metricType: z.enum(['response_time', 'resolution_time']),
  priority: z.enum(['critical', 'high', 'medium', 'low']),
  targetMinutes: z.number().int().positive(),
  warningThresholdPercent: z.number().int().min(1).max(100).optional(),
});

const updateSlaTargetSchema = z.object({
  targetMinutes: z.number().int().positive().optional(),
  warningThresholdPercent: z.number().int().min(1).max(100).optional(),
});

// ============================================
// ROUTES
// ============================================

export default async function slaRoutes(fastify: FastifyInstance) {
  // Require authentication for all routes
  fastify.addHook('onRequest', async (request, reply) => {
    const tenant = (request as any).tenant;
    if (!tenant) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
  });

  // ----------------------------------------
  // LIST SLA POLICIES
  // ----------------------------------------
  fastify.get('/policies', async (request, _reply) => {
    const tenant = (request as any).tenant;
    const query = request.query as { entityType?: string; isActive?: string };

    const policies = await slaService.listSlaPolicies(tenant.slug, {
      entityType: query.entityType,
      isActive: query.isActive === 'true' ? true : query.isActive === 'false' ? false : undefined,
    });

    return { data: policies };
  });

  // ----------------------------------------
  // GET SLA POLICY BY ID
  // ----------------------------------------
  fastify.get('/policies/:id', async (request, reply) => {
    const tenant = (request as any).tenant;
    const { id } = request.params as { id: string };

    const policy = await slaService.getSlaPolicy(tenant.slug, id);

    if (!policy) {
      return reply.code(404).send({ error: 'SLA policy not found' });
    }

    return { data: policy };
  });

  // ----------------------------------------
  // CREATE SLA POLICY
  // ----------------------------------------
  fastify.post('/policies', async (request, reply) => {
    const tenant = (request as any).tenant;
    const body = slaPolicySchema.parse(request.body);

    try {
      const policy = await slaService.createSlaPolicy(tenant.slug, body);
      return reply.code(201).send({ data: policy });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create policy';
      return reply.code(400).send({ error: message });
    }
  });

  // ----------------------------------------
  // UPDATE SLA POLICY
  // ----------------------------------------
  fastify.patch('/policies/:id', async (request, reply) => {
    const tenant = (request as any).tenant;
    const { id } = request.params as { id: string };
    const body = updateSlaPolicySchema.parse(request.body);

    try {
      const policy = await slaService.updateSlaPolicy(tenant.slug, id, body);

      if (!policy) {
        return reply.code(404).send({ error: 'SLA policy not found' });
      }

      return { data: policy };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update policy';
      return reply.code(400).send({ error: message });
    }
  });

  // ----------------------------------------
  // DELETE SLA POLICY
  // ----------------------------------------
  fastify.delete('/policies/:id', async (request, reply) => {
    const tenant = (request as any).tenant;
    const { id } = request.params as { id: string };

    try {
      const deleted = await slaService.deleteSlaPolicy(tenant.slug, id);

      if (!deleted) {
        return reply.code(404).send({ error: 'SLA policy not found or is default' });
      }

      return reply.code(204).send();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete policy';
      return reply.code(400).send({ error: message });
    }
  });

  // ----------------------------------------
  // CREATE SLA TARGET
  // ----------------------------------------
  fastify.post('/policies/:policyId/targets', async (request, reply) => {
    const tenant = (request as any).tenant;
    const { policyId } = request.params as { policyId: string };
    const body = slaTargetSchema.parse(request.body);

    try {
      const target = await slaService.createSlaTarget(tenant.slug, policyId, body);
      return reply.code(201).send({ data: target });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create target';
      return reply.code(400).send({ error: message });
    }
  });

  // ----------------------------------------
  // UPDATE SLA TARGET
  // ----------------------------------------
  fastify.patch('/targets/:id', async (request, reply) => {
    const tenant = (request as any).tenant;
    const { id } = request.params as { id: string };
    const body = updateSlaTargetSchema.parse(request.body);

    const target = await slaService.updateSlaTarget(tenant.slug, id, body);

    if (!target) {
      return reply.code(404).send({ error: 'SLA target not found' });
    }

    return { data: target };
  });

  // ----------------------------------------
  // DELETE SLA TARGET
  // ----------------------------------------
  fastify.delete('/targets/:id', async (request, reply) => {
    const tenant = (request as any).tenant;
    const { id } = request.params as { id: string };

    const deleted = await slaService.deleteSlaTarget(tenant.slug, id);

    if (!deleted) {
      return reply.code(404).send({ error: 'SLA target not found' });
    }

    return reply.code(204).send();
  });

  // ----------------------------------------
  // GET SLA STATISTICS
  // ----------------------------------------
  fastify.get('/stats', async (request, _reply) => {
    const tenant = (request as any).tenant;
    const query = request.query as {
      entityType?: 'issue' | 'problem';
      startDate?: string;
      endDate?: string;
    };

    let dateRange: { start: Date; end: Date } | undefined;
    if (query.startDate && query.endDate) {
      dateRange = {
        start: new Date(query.startDate),
        end: new Date(query.endDate),
      };
    }

    const stats = await slaService.getSlaStats(
      tenant.slug,
      query.entityType || 'issue',
      dateRange
    );

    return { data: stats };
  });

  // ----------------------------------------
  // GET DEFAULT SLA CONFIG (for display)
  // ----------------------------------------
  fastify.get('/config', async (request, _reply) => {
    const tenant = (request as any).tenant;
    const query = request.query as { entityType?: 'issue' | 'problem' };

    const config = await slaService.getSlaConfigFromDb(
      tenant.slug,
      query.entityType || 'issue'
    );

    return { data: config };
  });
}
