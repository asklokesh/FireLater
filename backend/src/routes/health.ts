import { FastifyInstance } from 'fastify';
// import { z } from 'zod';
import { healthScoreConfigService, healthScoreService } from '../services/health.js';
import { requirePermission } from '../middleware/auth.js';
import { parsePagination, createPaginatedResponse } from '../utils/pagination.js';

export default async function healthRoutes(app: FastifyInstance) {
  // ============================================
  // HEALTH SCORE CONFIG
  // ============================================

  // List health score configs
  app.get('/config', {
    preHandler: [requirePermission('health_scores:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const configs = await healthScoreConfigService.list(tenantSlug);
    reply.send({ configs });
  });

  // Get config by tier
  app.get<{ Params: { tier: string } }>('/config/:tier', {
    preHandler: [requirePermission('health_scores:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const config = await healthScoreConfigService.findByTier(tenantSlug, request.params.tier);

    if (!config) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: `Config for tier '${request.params.tier}' not found`,
      });
    }

    reply.send({ config });
  });

  // Update config by tier
  app.put<{ Params: { tier: string } }>('/config/:tier', {
    preHandler: [requirePermission('health_scores:manage')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const data = request.body as Record<string, number>;
    const config = await healthScoreConfigService.update(tenantSlug, request.params.tier, data);
    reply.send({ config });
  });

  // ============================================
  // HEALTH SCORES
  // ============================================

  // List all application health scores
  app.get('/scores', {
    preHandler: [requirePermission('health_scores:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const query = request.query as Record<string, string>;
    const pagination = parsePagination(query);

    const { scores, total } = await healthScoreService.listAllScores(tenantSlug, pagination);
    reply.send(createPaginatedResponse(scores, total, pagination));
  });

  // Get health summary
  app.get('/summary', {
    preHandler: [requirePermission('health_scores:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const summary = await healthScoreService.getSummary(tenantSlug);
    reply.send({ summary });
  });

  // Get health score for application
  app.get<{ Params: { applicationId: string } }>('/applications/:applicationId', {
    preHandler: [requirePermission('health_scores:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const score = await healthScoreService.getLatestForApplication(
      tenantSlug,
      request.params.applicationId
    );
    reply.send({ score });
  });

  // Get health score history for application
  app.get<{ Params: { applicationId: string }; Querystring: { days?: string } }>('/applications/:applicationId/history', {
    preHandler: [requirePermission('health_scores:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const days = request.query.days ? parseInt(request.query.days, 10) : 30;

    const history = await healthScoreService.getHistoryForApplication(
      tenantSlug,
      request.params.applicationId,
      days
    );
    reply.send({ history });
  });

  // Calculate/recalculate health score for application
  app.post<{ Params: { applicationId: string } }>('/applications/:applicationId/calculate', {
    preHandler: [requirePermission('health_scores:manage')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;

    const score = await healthScoreService.calculateForApplication(
      tenantSlug,
      request.params.applicationId,
      userId
    );
    reply.status(201).send({ score });
  });
}
