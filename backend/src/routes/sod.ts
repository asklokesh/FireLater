import { FastifyPluginAsync } from 'fastify';
import { requirePermission } from '../middleware/auth.js';
import { authenticate } from '../middleware/auth.js';
import { sodService } from '../services/sod.js';

// ============================================
// SEGREGATION OF DUTIES (SOD) ROUTES
// ============================================

const sodRoutes: FastifyPluginAsync = async (app) => {
  // ------------------------------------------
  // GET /sod/policies — list all policies
  // ------------------------------------------
  app.get(
    '/policies',
    {
      preHandler: [requirePermission('admin:read')],
    },
    async (request, _reply) => {
      const { tenantSlug } = request.user;
      const policies = await sodService.listPolicies(tenantSlug);
      return { policies };
    }
  );

  // ------------------------------------------
  // POST /sod/policies — create a new policy
  // ------------------------------------------
  app.post<{
    Body: {
      name: string;
      description?: string;
      conflicting_role_a: string;
      conflicting_role_b: string;
      entity_type: string;
      is_active?: boolean;
    };
  }>(
    '/policies',
    {
      preHandler: [requirePermission('admin:write')],
    },
    async (request, reply) => {
      const { tenantSlug } = request.user;
      const policy = await sodService.createPolicy(tenantSlug, request.body);
      reply.code(201);
      return { policy };
    }
  );

  // ------------------------------------------
  // PUT /sod/policies/:id — update a policy
  // ------------------------------------------
  app.put<{
    Params: { id: string };
    Body: {
      name?: string;
      description?: string;
      conflicting_role_a?: string;
      conflicting_role_b?: string;
      entity_type?: string;
      is_active?: boolean;
    };
  }>(
    '/policies/:id',
    {
      preHandler: [requirePermission('admin:write')],
    },
    async (request, _reply) => {
      const { tenantSlug } = request.user;
      const { id } = request.params;
      const policy = await sodService.updatePolicy(tenantSlug, id, request.body);
      return { policy };
    }
  );

  // ------------------------------------------
  // DELETE /sod/policies/:id — remove a policy
  // ------------------------------------------
  app.delete<{
    Params: { id: string };
  }>(
    '/policies/:id',
    {
      preHandler: [requirePermission('admin:write')],
    },
    async (request, reply) => {
      const { tenantSlug } = request.user;
      const { id } = request.params;
      await sodService.deletePolicy(tenantSlug, id);
      reply.code(204);
    }
  );

  // ------------------------------------------
  // POST /sod/evaluate — run an SoD check
  // ------------------------------------------
  app.post<{
    Body: {
      actorId: string;
      actorRoles: string[];
      attemptedRole: string;
      entityType: string;
      entityId: string;
      action: string;
    };
  }>(
    '/evaluate',
    {
      preHandler: [authenticate],
    },
    async (request, _reply) => {
      const { tenantSlug } = request.user;
      const result = await sodService.evaluate(tenantSlug, request.body);
      return result;
    }
  );
};

export default sodRoutes;
