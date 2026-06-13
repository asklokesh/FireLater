import { FastifyPluginAsync } from 'fastify';
import { requirePermission, authenticate } from '../middleware/auth.js';
import { recertificationService } from '../services/recertification.js';

// ============================================
// RECERTIFICATION ROUTES
// ============================================

const recertificationRoutes: FastifyPluginAsync = async (app) => {
  // POST /recertification/campaigns — create campaign (admin:write)
  app.post<{
    Body: {
      name: string;
      description?: string;
      scopeType: 'all_users' | 'role' | 'group' | 'resource';
      scopeValue?: string;
      ownerId: string;
      ownerEmail?: string;
      dueDate: string;
    };
  }>(
    '/campaigns',
    {
      preHandler: [requirePermission('admin:write')],
    },
    async (request, _reply) => {
      const { tenantSlug } = request.user;
      const { name, description, scopeType, scopeValue, ownerId, ownerEmail, dueDate } =
        request.body;

      if (!name || !scopeType || !ownerId || !dueDate) {
        return _reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'name, scopeType, ownerId, and dueDate are required',
        });
      }

      const campaign = await recertificationService.createCampaign(tenantSlug, {
        name,
        description,
        scopeType,
        scopeValue,
        ownerId,
        ownerEmail,
        dueDate: new Date(dueDate),
      });

      return _reply.status(201).send({ campaign });
    }
  );

  // GET /recertification/campaigns — list with optional status filter
  app.get<{
    Querystring: { status?: string };
  }>(
    '/campaigns',
    {
      preHandler: [requirePermission('admin:read')],
    },
    async (request, _reply) => {
      const { tenantSlug } = request.user;
      const { status } = request.query;

      const campaigns = await recertificationService.listCampaigns(tenantSlug, {
        status,
      });

      return { campaigns };
    }
  );

  // GET /recertification/campaigns/:id — campaign detail with progress
  app.get<{
    Params: { id: string };
  }>(
    '/campaigns/:id',
    {
      preHandler: [requirePermission('admin:read')],
    },
    async (request, _reply) => {
      const { tenantSlug } = request.user;
      const { id } = request.params;

      const campaign = await recertificationService.getCampaign(tenantSlug, id);

      return { campaign };
    }
  );

  // POST /recertification/campaigns/:id/launch — launch campaign
  app.post<{
    Params: { id: string };
  }>(
    '/campaigns/:id/launch',
    {
      preHandler: [requirePermission('admin:write')],
    },
    async (request, _reply) => {
      const { tenantSlug } = request.user;
      const { id } = request.params;

      await recertificationService.launchCampaign(tenantSlug, id);

      const campaign = await recertificationService.getCampaign(tenantSlug, id);

      return { campaign };
    }
  );

  // POST /recertification/campaigns/:id/complete — mark complete
  app.post<{
    Params: { id: string };
  }>(
    '/campaigns/:id/complete',
    {
      preHandler: [requirePermission('admin:write')],
    },
    async (request, _reply) => {
      const { tenantSlug } = request.user;
      const { id } = request.params;

      await recertificationService.completeCampaign(tenantSlug, id);

      const campaign = await recertificationService.getCampaign(tenantSlug, id);

      return { campaign };
    }
  );

  // GET /recertification/campaigns/:id/items — list all items for a campaign
  app.get<{
    Params: { id: string };
  }>(
    '/campaigns/:id/items',
    {
      preHandler: [requirePermission('admin:read')],
    },
    async (request, _reply) => {
      const { tenantSlug } = request.user;
      const { id } = request.params;

      const items = await recertificationService.listItems(tenantSlug, id);

      return { items };
    }
  );

  // GET /recertification/my-items — items assigned to the current user
  app.get<{
    Querystring: { campaignId?: string };
  }>(
    '/my-items',
    {
      preHandler: [authenticate],
    },
    async (request, _reply) => {
      const { tenantSlug, userId } = request.user;
      const { campaignId } = request.query;

      const items = await recertificationService.getItemsForReviewer(
        tenantSlug,
        userId,
        campaignId
      );

      return { items };
    }
  );

  // POST /recertification/items/:id/decide — submit a decision on an item
  app.post<{
    Params: { id: string };
    Body: {
      decision: 'approved' | 'revoked' | 'delegated';
      comment?: string;
    };
  }>(
    '/items/:id/decide',
    {
      preHandler: [authenticate],
    },
    async (request, _reply) => {
      const { tenantSlug, userId, email } = request.user;
      const { id } = request.params;
      const { decision, comment } = request.body;

      if (!decision || !['approved', 'revoked', 'delegated'].includes(decision)) {
        return _reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: "decision must be one of 'approved', 'revoked', 'delegated'",
        });
      }

      await recertificationService.decideItem(
        tenantSlug,
        id,
        userId,
        email || '',
        decision,
        comment
      );

      return { success: true };
    }
  );

  // GET /recertification/summary — status summary for compliance reporting
  app.get<{
    Querystring: { from?: string; to?: string };
  }>(
    '/summary',
    {
      preHandler: [requirePermission('admin:read')],
    },
    async (request, _reply) => {
      const { tenantSlug } = request.user;
      const { from, to } = request.query;

      const summary = await recertificationService.getStatusSummary(
        tenantSlug,
        from ? new Date(from) : undefined,
        to ? new Date(to) : undefined
      );

      return { summary };
    }
  );
};

export default recertificationRoutes;
