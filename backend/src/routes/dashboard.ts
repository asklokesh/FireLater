import { FastifyInstance } from 'fastify';
import { dashboardService } from '../services/dashboard.js';
import { requirePermission } from '../middleware/auth.js';

export default async function dashboardRoutes(app: FastifyInstance) {
  // ============================================
  // DASHBOARD OVERVIEW
  // ============================================

  // Get main dashboard overview
  app.get('/', {
    preHandler: [requirePermission('dashboard:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const overview = await dashboardService.getOverview(tenantSlug);
    reply.send(overview);
  });

  // Get mobile-optimized summary
  app.get('/mobile', {
    preHandler: [requirePermission('dashboard:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const summary = await dashboardService.getMobileSummary(tenantSlug);
    reply.send(summary);
  });

  // ============================================
  // CHARTS AND TRENDS
  // ============================================

  // Get issue trends
  app.get<{ Querystring: { days?: string } }>('/trends/issues', {
    preHandler: [requirePermission('dashboard:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const days = request.query.days ? parseInt(request.query.days, 10) : 30;
    const trends = await dashboardService.getIssueTrends(tenantSlug, days);
    reply.send({ trends });
  });

  // Get issues by priority
  app.get('/issues/by-priority', {
    preHandler: [requirePermission('dashboard:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const data = await dashboardService.getIssuesByPriority(tenantSlug);
    reply.send({ data });
  });

  // Get issues by status
  app.get('/issues/by-status', {
    preHandler: [requirePermission('dashboard:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const data = await dashboardService.getIssuesByStatus(tenantSlug);
    reply.send({ data });
  });

  // Get change success rate
  app.get<{ Querystring: { days?: string } }>('/trends/changes', {
    preHandler: [requirePermission('dashboard:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const days = request.query.days ? parseInt(request.query.days, 10) : 30;
    const data = await dashboardService.getChangeSuccessRate(tenantSlug, days);
    reply.send({ data });
  });

  // ============================================
  // HEALTH
  // ============================================

  // Get health distribution
  app.get('/health/distribution', {
    preHandler: [requirePermission('dashboard:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const distribution = await dashboardService.getHealthDistribution(tenantSlug);
    reply.send({ distribution });
  });

  // Get health by tier
  app.get('/health/by-tier', {
    preHandler: [requirePermission('dashboard:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const data = await dashboardService.getHealthByTier(tenantSlug);
    reply.send({ data });
  });

  // Get critical applications
  app.get<{ Querystring: { limit?: string } }>('/health/critical', {
    preHandler: [requirePermission('dashboard:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const limit = request.query.limit ? parseInt(request.query.limit, 10) : 5;
    const applications = await dashboardService.getCriticalApplications(tenantSlug, limit);
    reply.send({ applications });
  });

  // ============================================
  // ACTIVITY
  // ============================================

  // Get recent activity feed
  app.get<{ Querystring: { limit?: string } }>('/activity', {
    preHandler: [requirePermission('dashboard:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const limit = request.query.limit ? parseInt(request.query.limit, 10) : 20;
    const activity = await dashboardService.getRecentActivity(tenantSlug, limit);
    reply.send({ activity });
  });

  // Get upcoming changes
  app.get<{ Querystring: { days?: string } }>('/changes/upcoming', {
    preHandler: [requirePermission('dashboard:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const days = request.query.days ? parseInt(request.query.days, 10) : 7;
    const changes = await dashboardService.getUpcomingChanges(tenantSlug, days);
    reply.send({ changes });
  });

  // ============================================
  // REQUESTS AND SLA
  // ============================================

  // Get requests by item
  app.get<{ Querystring: { limit?: string } }>('/requests/by-item', {
    preHandler: [requirePermission('dashboard:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const limit = request.query.limit ? parseInt(request.query.limit, 10) : 10;
    const data = await dashboardService.getRequestsByItem(tenantSlug, limit);
    reply.send({ data });
  });

  // Get SLA compliance
  app.get('/sla/compliance', {
    preHandler: [requirePermission('dashboard:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const data = await dashboardService.getSlaCompliance(tenantSlug);
    reply.send({ data });
  });

  // ============================================
  // CLOUD COSTS
  // ============================================

  // Get cloud cost trends
  app.get<{ Querystring: { months?: string } }>('/cloud/costs', {
    preHandler: [requirePermission('dashboard:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const months = request.query.months ? parseInt(request.query.months, 10) : 6;
    const data = await dashboardService.getCloudCostTrends(tenantSlug, months);
    reply.send({ data });
  });
}
