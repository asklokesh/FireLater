import { FastifyPluginAsync } from 'fastify';
import { requirePermission } from '../middleware/auth.js';
import { authenticate } from '../middleware/auth.js';
import { makerCheckerService } from '../services/maker-checker.js';

// ============================================
// MAKER-CHECKER ROUTES
// ============================================

const makerCheckerRoutes: FastifyPluginAsync = async (app) => {
  // POST /maker-checker/operations — create a pending operation (maker submits)
  app.post<{
    Body: {
      operationType: string;
      entityType?: string;
      entityId?: string;
      payload: Record<string, unknown>;
      justification?: string;
    };
  }>(
    '/operations',
    { preHandler: [authenticate] },
    async (request, _reply) => {
      const { tenantSlug, userId, email } = request.user;
      const { operationType, entityType, entityId, payload, justification } = request.body;

      const operation = await makerCheckerService.createPendingOperation(tenantSlug, {
        operationType,
        entityType,
        entityId,
        makerId: userId,
        makerEmail: email,
        payload,
        justification,
      });

      return { operation };
    }
  );

  // GET /maker-checker/operations — list operations
  // Admins (admin:read) can see all; regular users see only their own
  app.get<{
    Querystring: {
      status?: string;
      operationType?: string;
      all?: string;
    };
  }>(
    '/operations',
    { preHandler: [authenticate] },
    async (request, _reply) => {
      const { tenantSlug, userId, roles } = request.user;
      const { status, operationType, all } = request.query;

      const isAdmin = roles && roles.includes('admin');
      const showAll = isAdmin && all === 'true';

      const filters: { status?: string; makerId?: string; operationType?: string } = {};
      if (status) filters.status = status;
      if (operationType) filters.operationType = operationType;
      if (!showAll) {
        // Non-admins only see their own operations; admins default to all unless filtered
        if (!isAdmin) filters.makerId = userId;
      }

      const operations = await makerCheckerService.list(tenantSlug, filters);

      return { operations };
    }
  );

  // GET /maker-checker/operations/:id — get detail
  app.get<{
    Params: { id: string };
  }>(
    '/operations/:id',
    { preHandler: [authenticate] },
    async (request, _reply) => {
      const { tenantSlug } = request.user;
      const { id } = request.params;

      const operation = await makerCheckerService.getById(tenantSlug, id);

      return { operation };
    }
  );

  // POST /maker-checker/operations/:id/approve — checker approves
  app.post<{
    Params: { id: string };
    Body: { comment?: string };
  }>(
    '/operations/:id/approve',
    { preHandler: [authenticate] },
    async (request, _reply) => {
      const { tenantSlug, userId, email } = request.user;
      const { id } = request.params;
      const { comment } = request.body ?? {};

      const operation = await makerCheckerService.approve(
        tenantSlug,
        id,
        userId,
        email,
        comment
      );

      return { operation };
    }
  );

  // POST /maker-checker/operations/:id/reject — checker rejects
  app.post<{
    Params: { id: string };
    Body: { comment?: string };
  }>(
    '/operations/:id/reject',
    { preHandler: [authenticate] },
    async (request, _reply) => {
      const { tenantSlug, userId, email } = request.user;
      const { id } = request.params;
      const { comment } = request.body ?? {};

      const operation = await makerCheckerService.reject(
        tenantSlug,
        id,
        userId,
        email,
        comment
      );

      return { operation };
    }
  );

  // GET /maker-checker/config — list config (admin:read)
  app.get(
    '/config',
    { preHandler: [requirePermission('admin:read')] },
    async (request, _reply) => {
      const { tenantSlug } = request.user;

      const config = await makerCheckerService.listConfig(tenantSlug);

      return { config };
    }
  );

  // PUT /maker-checker/config/:operationType — upsert config (admin:write)
  app.put<{
    Params: { operationType: string };
    Body: {
      description?: string;
      expiryHours?: number;
      isActive?: boolean;
    };
  }>(
    '/config/:operationType',
    { preHandler: [requirePermission('admin:write')] },
    async (request, _reply) => {
      const { tenantSlug } = request.user;
      const { operationType } = request.params;
      const { description, expiryHours, isActive } = request.body;

      await makerCheckerService.upsertConfig(tenantSlug, operationType, {
        description,
        expiryHours,
        isActive,
      });

      const config = await makerCheckerService.listConfig(tenantSlug);

      return { config };
    }
  );
};

export default makerCheckerRoutes;
