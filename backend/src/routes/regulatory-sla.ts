import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { regulatorySlaService } from '../services/regulatory-sla.js';
import { requirePermission } from '../middleware/auth.js';

// ============================================
// VALIDATION SCHEMAS
// ============================================

const classifyIncidentSchema = z.object({
  classification: z.string().min(1).max(50),
  detectedAt: z.string().datetime().optional(),
});

const recordNotificationSchema = z.object({
  actorId: z.string().min(1).max(255),
  recipient: z.string().min(1).max(255),
  evidence: z.string().min(1).max(5000),
});

const summaryQuerySchema = z.object({
  from: z.string().datetime(),
  to: z.string().datetime(),
});

const createFrameworkSchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
});

const createDeadlineSchema = z.object({
  deadlineType: z.string().min(1).max(50),
  incidentClassification: z.string().max(50).optional(),
  hoursFromDetection: z.number().int().positive(),
  description: z.string().max(2000).optional(),
});

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
      const body = classifyIncidentSchema.parse(request.body);

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
      const body = recordNotificationSchema.parse(request.body);

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
      const body = createFrameworkSchema.parse(request.body);

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
      const body = createDeadlineSchema.parse(request.body);

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
