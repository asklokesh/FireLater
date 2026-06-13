import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { emergencyChangeService } from '../services/emergency-change.js';
import { requirePermission } from '../middleware/auth.js';

// ============================================
// SCHEMAS
// ============================================

const createEmergencyChangeSchema = z.object({
  title: z.string().min(5).max(500),
  description: z.string().min(1).max(10000),
  emergencyJustification: z.string().min(10).max(5000),
  linkedIncidentId: z.string().min(1).max(255),
  implementerId: z.string().uuid().optional(),
  applicationId: z.string().uuid().optional(),
});

const postHocReviewSchema = z.object({
  decision: z.enum(['approved', 'rejected']),
  comment: z.string().max(5000).optional(),
});

const listQuerySchema = z.object({
  post_review_status: z.enum(['pending', 'approved', 'rejected']).optional(),
});

const idParamSchema = z.object({
  id: z.string().uuid(),
});

// ============================================
// ROUTES
// ============================================

export default async function emergencyChangeRoutes(app: FastifyInstance) {
  // ----------------------------------------
  // GET /emergency-changes/cab-queue
  // Must be registered BEFORE /:id to avoid route conflict
  // ----------------------------------------
  app.get('/cab-queue', {
    preHandler: [requirePermission('changes:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;

    const items = await emergencyChangeService.getPendingCabQueue(tenantSlug);
    reply.send({ data: items });
  });

  // ----------------------------------------
  // POST /emergency-changes
  // ----------------------------------------
  app.post('/', {
    preHandler: [requirePermission('changes:create')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const body = createEmergencyChangeSchema.parse(request.body);

    const result = await emergencyChangeService.createEmergencyChange(tenantSlug, userId, {
      title: body.title,
      description: body.description,
      emergencyJustification: body.emergencyJustification,
      linkedIncidentId: body.linkedIncidentId,
      implementerId: body.implementerId,
      applicationId: body.applicationId,
    });

    reply.status(201).send(result);
  });

  // ----------------------------------------
  // GET /emergency-changes
  // ----------------------------------------
  app.get('/', {
    preHandler: [requirePermission('changes:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const query = request.query as Record<string, string>;
    const parsed = listQuerySchema.parse({ post_review_status: query.post_review_status });

    const changes = await emergencyChangeService.listEmergencyChanges(tenantSlug, {
      postReviewStatus: parsed.post_review_status,
    });

    reply.send({ data: changes });
  });

  // ----------------------------------------
  // GET /emergency-changes/:id
  // ----------------------------------------
  app.get<{ Params: { id: string } }>('/:id', {
    preHandler: [requirePermission('changes:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { id } = idParamSchema.parse(request.params);

    const change = await emergencyChangeService.getEmergencyChangeById(tenantSlug, id);

    if (!change) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: `Emergency change with id '${id}' not found`,
      });
    }

    reply.send(change);
  });

  // ----------------------------------------
  // POST /emergency-changes/:id/review
  // ----------------------------------------
  app.post<{ Params: { id: string } }>('/:id/review', {
    preHandler: [requirePermission('changes:approve')],
  }, async (request, reply) => {
    const { tenantSlug, userId, email } = request.user;
    const { id } = idParamSchema.parse(request.params);
    const body = postHocReviewSchema.parse(request.body);

    await emergencyChangeService.submitPostHocReview(
      tenantSlug,
      id,
      userId,
      email || '',
      body.decision,
      body.comment
    );

    reply.send({ success: true, changeId: id, decision: body.decision });
  });
}
