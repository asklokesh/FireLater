import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pamService } from '../services/pam.js';
import { requirePermission } from '../middleware/auth.js';
import { authenticate } from '../middleware/auth.js';

// ============================================
// VALIDATION SCHEMAS
// ============================================

const requestGrantSchema = z.object({
  privilegeType: z.string().min(1).max(100),
  resource: z.string().max(255).optional(),
  reason: z.string().min(5).max(5000),
  durationHours: z.number().int().min(1).max(72),
});

const approveGrantSchema = z.object({
  approverEmail: z.string().email().optional(),
});

const revokeGrantSchema = z.object({
  revokedBy: z.string().min(1).max(255).optional(),
});

const activitySchema = z.object({
  activityType: z.enum(['login', 'query', 'command', 'config_change']),
  activityDetail: z.string().max(5000).optional(),
  ipAddress: z.string().max(45).optional(),
});

const upsertConfigSchema = z.object({
  description: z.string().max(500).optional(),
  maxDurationHours: z.number().int().min(1).max(720).optional(),
  requiresApprover: z.boolean().optional(),
  autoApprove: z.boolean().optional(),
});

const summaryQuerySchema = z.object({
  from: z.string().datetime(),
  to: z.string().datetime(),
});

const listGrantsQuerySchema = z.object({
  status: z.enum(['pending', 'approved', 'active', 'expired', 'revoked']).optional(),
  requesterId: z.string().optional(),
  privilegeType: z.string().optional(),
});

// ============================================
// ROUTES
// ============================================

export default async function pamRoutes(app: FastifyInstance): Promise<void> {
  // POST /pam/grants — request JIT elevation
  app.post<{ Body: z.infer<typeof requestGrantSchema> }>(
    '/grants',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const body = requestGrantSchema.parse(request.body);
      const { tenantSlug, userId, email } = request.user;

      const grant = await pamService.requestGrant(tenantSlug, {
        requesterId: userId,
        requesterEmail: email,
        privilegeType: body.privilegeType,
        resource: body.resource,
        reason: body.reason,
        durationHours: body.durationHours,
      });

      return reply.status(201).send(grant);
    }
  );

  // GET /pam/grants — list grants
  app.get<{ Querystring: z.infer<typeof listGrantsQuerySchema> }>(
    '/grants',
    { preHandler: [authenticate] },
    async (request, _reply) => {
      const { tenantSlug, userId, roles } = request.user;
      const query = listGrantsQuerySchema.parse(request.query);

      // Admin can see all grants; regular users see only their own
      const isAdmin = roles.includes('admin');

      const filters = {
        status: query.status,
        requesterId: isAdmin ? query.requesterId : userId,
        privilegeType: query.privilegeType,
      };

      return pamService.listGrants(tenantSlug, filters);
    }
  );

  // GET /pam/grants/:id — get single grant
  app.get<{ Params: { id: string } }>(
    '/grants/:id',
    { preHandler: [authenticate] },
    async (request, _reply) => {
      const { tenantSlug, userId, roles } = request.user;
      const { id } = request.params;

      const grant = await pamService.getGrant(tenantSlug, id);

      // Non-admins can only view their own grants
      if (!roles.includes('admin') && grant.requester_id !== userId) {
        return _reply.status(403).send({ error: 'Forbidden', message: 'Access denied' });
      }

      return grant;
    }
  );

  // POST /pam/grants/:id/approve — approve a grant
  app.post<{ Params: { id: string }; Body: z.infer<typeof approveGrantSchema> }>(
    '/grants/:id/approve',
    { preHandler: [requirePermission('admin:write')] },
    async (request, _reply) => {
      const { tenantSlug, userId, email } = request.user;
      const { id } = request.params;
      const body = approveGrantSchema.parse(request.body ?? {});

      return pamService.approveGrant(tenantSlug, id, userId, body.approverEmail ?? email);
    }
  );

  // POST /pam/grants/:id/revoke — revoke a grant
  app.post<{ Params: { id: string }; Body: z.infer<typeof revokeGrantSchema> }>(
    '/grants/:id/revoke',
    { preHandler: [requirePermission('admin:write')] },
    async (request, _reply) => {
      const { tenantSlug, userId } = request.user;
      const { id } = request.params;
      const body = revokeGrantSchema.parse(request.body ?? {});

      await pamService.revokeGrant(tenantSlug, id, body.revokedBy ?? userId);
      return { success: true };
    }
  );

  // POST /pam/grants/:id/activity — log session activity
  app.post<{ Params: { id: string }; Body: z.infer<typeof activitySchema> }>(
    '/grants/:id/activity',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { tenantSlug, userId } = request.user;
      const { id } = request.params;
      const body = activitySchema.parse(request.body);

      await pamService.logActivity(
        tenantSlug,
        id,
        userId,
        body.activityType,
        body.activityDetail,
        body.ipAddress
      );

      return reply.status(201).send({ success: true });
    }
  );

  // GET /pam/grants/:id/activity — view session log
  app.get<{ Params: { id: string } }>(
    '/grants/:id/activity',
    { preHandler: [requirePermission('admin:read')] },
    async (request, _reply) => {
      const { tenantSlug } = request.user;
      const { id } = request.params;

      return pamService.getSessionActivity(tenantSlug, id);
    }
  );

  // GET /pam/config — list JIT privilege config
  app.get(
    '/config',
    { preHandler: [requirePermission('admin:read')] },
    async (request, _reply) => {
      const { tenantSlug } = request.user;
      return pamService.listConfig(tenantSlug);
    }
  );

  // PUT /pam/config/:privilegeType — upsert JIT config
  app.put<{ Params: { privilegeType: string }; Body: z.infer<typeof upsertConfigSchema> }>(
    '/config/:privilegeType',
    { preHandler: [requirePermission('admin:write')] },
    async (request, _reply) => {
      const { tenantSlug } = request.user;
      const { privilegeType } = request.params;
      const body = upsertConfigSchema.parse(request.body ?? {});

      await pamService.upsertConfig(tenantSlug, privilegeType, {
        description: body.description,
        maxDurationHours: body.maxDurationHours,
        requiresApprover: body.requiresApprover,
        autoApprove: body.autoApprove,
      });

      return { success: true };
    }
  );

  // GET /pam/summary — compliance summary
  app.get<{ Querystring: z.infer<typeof summaryQuerySchema> }>(
    '/summary',
    { preHandler: [requirePermission('admin:read')] },
    async (request, _reply) => {
      const { tenantSlug } = request.user;
      const { from, to } = summaryQuerySchema.parse(request.query);

      return pamService.getGrantSummary(tenantSlug, new Date(from), new Date(to));
    }
  );
}
