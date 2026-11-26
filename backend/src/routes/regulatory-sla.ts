import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { regulatorySlaService } from '../services/regulatory-sla.js';
import { requirePermission } from '../middleware/auth.js';
import { classifyIncidentSchema, recordNotificationSchema, summaryQuerySchema, createFrameworkSchema, createDeadlineSchema } from '../schemas/regulatory-sla.js';

// ============================================
// VALIDATION SCHEMAS
// ============================================

// ============================================
// ROUTES
// ============================================

export default async function regulatorySlaRoutes(app: FastifyInstance) {
  /**
   * POST /regulatory-sla/incidents/:incidentId/classify
   * Classify an incident as reportable and start regulatory clocks.
   */
  app.post<{ Params: { incidentId: string } }>(
    '/incidents/:incidentId/classify',
    { preHandler: [requirePermission('issues:write')] },
    async (request, reply) => {
      const { tenantSlug } = request.user;
      const { incidentId } = request.params;
      const body = request.body as z.infer<typeof classifyIncidentSchema>;

      const detectedAt = body.detectedAt ? new Date(body.detectedAt) : new Date();

      const clocks = await regulatorySlaService.startClocks(
        tenantSlug,
        incidentId,
        body.classification,
        detectedAt
      );

      reply.status(201).send({ clocks });
    }
  );

  /**
   * GET /regulatory-sla/incidents/:incidentId/clocks
   * List all regulatory clocks for an incident.
   */
  app.get<{ Params: { incidentId: string } }>(
    '/incidents/:incidentId/clocks',
    { preHandler: [requirePermission('issues:read')] },
    async (request, reply) => {
      const { tenantSlug } = request.user;
      const { incidentId } = request.params;

      const clocks = await regulatorySlaService.getClocksForIncident(tenantSlug, incidentId);

      reply.send({ clocks });
    }
  );

  /**
   * POST /regulatory-sla/clocks/:clockId/notify
   * Record that a regulatory notification was filed.
   */
  app.post<{ Params: { clockId: string } }>(
    '/clocks/:clockId/notify',
    { preHandler: [requirePermission('issues:write')] },
    async (request, reply) => {
      const { tenantSlug, userId } = request.user;
      const { clockId } = request.params;
      const body = request.body as z.infer<typeof recordNotificationSchema>;

      await regulatorySlaService.recordNotification(
        tenantSlug,
        clockId,
        body.actorId || userId,
        body.recipient,
        body.evidence
      );

      reply.send({ success: true, clockId });
    }
  );

  /**
   * GET /regulatory-sla/summary
   * Adherence summary for a date range (compliance reporting).
   */
  app.get(
    '/summary',
    { preHandler: [requirePermission('reports:read')] },
    async (request, reply) => {
      const { tenantSlug } = request.user;
      const query = summaryQuerySchema.parse(request.query);

      const summary = await regulatorySlaService.getAdherenceSummary(
        tenantSlug,
        new Date(query.from),
        new Date(query.to)
      );

      reply.send(summary);
    }
  );

  /**
   * GET /regulatory-sla/frameworks
   * List all regulatory frameworks.
   */
  app.get(
    '/frameworks',
    { preHandler: [requirePermission('issues:read')] },
    async (request, reply) => {
      const { tenantSlug } = request.user;
      const frameworks = await regulatorySlaService.listFrameworks(tenantSlug);
      reply.send({ frameworks });
    }
  );

  /**
   * POST /regulatory-sla/frameworks
   * Create a new regulatory framework (admin only).
   */
  app.post(
    '/frameworks',
    { preHandler: [requirePermission('admin:write')] },
    async (request, reply) => {
      const { tenantSlug } = request.user;
      const body = request.body as z.infer<typeof createFrameworkSchema>;

      const framework = await regulatorySlaService.createFramework(tenantSlug, body);
      reply.status(201).send(framework);
    }
  );

  /**
   * GET /regulatory-sla/frameworks/:id/deadlines
   * List deadlines for a specific framework.
   */
  app.get<{ Params: { id: string } }>(
    '/frameworks/:id/deadlines',
    { preHandler: [requirePermission('issues:read')] },
    async (request, reply) => {
      const { tenantSlug } = request.user;
      const { id } = request.params;

      const deadlines = await regulatorySlaService.listDeadlines(tenantSlug, id);
      reply.send({ deadlines });
    }
  );

  /**
   * POST /regulatory-sla/frameworks/:id/deadlines
   * Add a deadline to a framework (admin only).
   */
  app.post<{ Params: { id: string } }>(
    '/frameworks/:id/deadlines',
    { preHandler: [requirePermission('admin:write')] },
    async (request, reply) => {
      const { tenantSlug } = request.user;
      const { id: frameworkId } = request.params;
      const body = request.body as z.infer<typeof createDeadlineSchema>;

      const deadline = await regulatorySlaService.createDeadline(tenantSlug, {
        frameworkId,
        deadlineType: body.deadlineType,
        incidentClassification: body.incidentClassification,
        hoursFromDetection: body.hoursFromDetection,
        description: body.description,
      });

      reply.status(201).send(deadline);
    }
  );
}
