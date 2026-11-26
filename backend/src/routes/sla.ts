import { FastifyInstance } from 'fastify';
import { slaService } from '../services/sla.js';
import { validateDate, validateDateRange } from '../utils/validation.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validation.js';
import {
  slaPolicySchema,
  slaTargetSchema,
  updateSlaPolicySchema,
  updateSlaTargetSchema,
  type SlaPolicyInput,
  type SlaTargetInput,
  type UpdateSlaPolicyInput,
  type UpdateSlaTargetInput,
} from '../schemas/sla.js';

// ============================================
// SCHEMAS
// ============================================





// ============================================
// ROUTES
// ============================================

export default async function slaRoutes(fastify: FastifyInstance) {
  // ----------------------------------------
  // LIST SLA POLICIES
  // ----------------------------------------
  fastify.get('/policies', {
    preHandler: [authenticate],
  }, async (request, _reply) => {
    const { tenantSlug } = request.user;
    const query = request.query as { entityType?: string; isActive?: string };

    const policies = await slaService.listSlaPolicies(tenantSlug, {
      entityType: query.entityType,
      isActive: query.isActive === 'true' ? true : query.isActive === 'false' ? false : undefined,
    });

    return { data: policies };
  });

  // ----------------------------------------
  // GET SLA POLICY BY ID
  // ----------------------------------------
  fastify.get('/policies/:id', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { id } = request.params as { id: string };

    const policy = await slaService.getSlaPolicy(tenantSlug, id);

    if (!policy) {
      return reply.code(404).send({ error: 'SLA policy not found' });
    }

    return { data: policy };
  });

  // ----------------------------------------
  // CREATE SLA POLICY
  // ----------------------------------------
  fastify.post('/policies', {
    preHandler: [authenticate, validate({ body: slaPolicySchema })],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const body = request.body as SlaPolicyInput;

    try {
      const policy = await slaService.createSlaPolicy(tenantSlug, body);
      return reply.code(201).send({ data: policy });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create policy';
      return reply.code(400).send({ error: message });
    }
  });

  // ----------------------------------------
  // UPDATE SLA POLICY
  // ----------------------------------------
  fastify.patch('/policies/:id', {
    preHandler: [authenticate, validate({ body: updateSlaPolicySchema })],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { id } = request.params as { id: string };
    const body = request.body as UpdateSlaPolicyInput;

    try {
      const policy = await slaService.updateSlaPolicy(tenantSlug, id, body);

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
  fastify.delete('/policies/:id', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { id } = request.params as { id: string };

    try {
      const deleted = await slaService.deleteSlaPolicy(tenantSlug, id);

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
  fastify.post('/policies/:policyId/targets', {
    preHandler: [authenticate, validate({ body: slaTargetSchema })],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { policyId } = request.params as { policyId: string };
    const body = request.body as SlaTargetInput;

    try {
      const target = await slaService.createSlaTarget(tenantSlug, policyId, body);
      return reply.code(201).send({ data: target });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create target';
      return reply.code(400).send({ error: message });
    }
  });

  // ----------------------------------------
  // UPDATE SLA TARGET
  // ----------------------------------------
  fastify.patch('/targets/:id', {
    preHandler: [authenticate, validate({ body: updateSlaTargetSchema })],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { id } = request.params as { id: string };
    const body = request.body as UpdateSlaTargetInput;

    const target = await slaService.updateSlaTarget(tenantSlug, id, body);

    if (!target) {
      return reply.code(404).send({ error: 'SLA target not found' });
    }

    return { data: target };
  });

  // ----------------------------------------
  // DELETE SLA TARGET
  // ----------------------------------------
  fastify.delete('/targets/:id', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { id } = request.params as { id: string };

    const deleted = await slaService.deleteSlaTarget(tenantSlug, id);

    if (!deleted) {
      return reply.code(404).send({ error: 'SLA target not found' });
    }

    return reply.code(204).send();
  });

  // ----------------------------------------
  // GET SLA STATISTICS
  // ----------------------------------------
  fastify.get('/stats', {
    preHandler: [authenticate],
  }, async (request, _reply) => {
    const { tenantSlug } = request.user;
    const query = request.query as {
      entityType?: 'issue' | 'problem';
      startDate?: string;
      endDate?: string;
    };

    let dateRange: { start: Date; end: Date } | undefined;
    if (query.startDate && query.endDate) {
      // Validate date parameters
      const startDate = validateDate(query.startDate, 'startDate');
      const endDate = validateDate(query.endDate, 'endDate');

      if (startDate && endDate) {
        validateDateRange(startDate, endDate, 365);
        dateRange = {
          start: startDate,
          end: endDate,
        };
      }
    }

    const stats = await slaService.getSlaStats(
      tenantSlug,
      query.entityType || 'issue',
      dateRange
    );

    return { data: stats };
  });

  // ----------------------------------------
  // GET DEFAULT SLA CONFIG (for display)
  // ----------------------------------------
  fastify.get('/config', {
    preHandler: [authenticate],
  }, async (request, _reply) => {
    const { tenantSlug } = request.user;
    const query = request.query as { entityType?: 'issue' | 'problem' };

    const config = await slaService.getSlaConfigFromDb(
      tenantSlug,
      query.entityType || 'issue'
    );

    return { data: config };
  });
}
