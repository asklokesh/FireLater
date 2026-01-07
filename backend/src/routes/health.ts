import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { healthScoreConfigService, healthScoreService } from '../services/health.js';
import { requirePermission } from '../middleware/auth.js';
import { parsePagination, createPaginatedResponse } from '../utils/pagination.js';

// Parameter validation schemas
const tierParamSchema = z.object({
  tier: z.enum(['P1', 'P2', 'P3', 'P4']),
});

const applicationIdParamSchema = z.object({
  applicationId: z.string().uuid(),
});

// Query validation schemas
const listScoresQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  per_page: z.coerce.number().int().min(1).max(100).optional(),
});

const historyQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).optional(),
});

// Update config schema
const updateConfigSchema = z.object({
  slaWeight: z.number().min(0).max(100).optional(),
  issueWeight: z.number().min(0).max(100).optional(),
  changeWeight: z.number().min(0).max(100).optional(),
  incidentWeight: z.number().min(0).max(100).optional(),
});

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
    const { tier } = tierParamSchema.parse(request.params);

    const config = await healthScoreConfigService.findByTier(tenantSlug, tier);

    if (!config) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: `Config for tier '${tier}' not found`,
      });
    }

    reply.send({ config });
  });

  // Update config by tier
  app.put<{ Params: { tier: string } }>('/config/:tier', {
    preHandler: [requirePermission('health_scores:manage')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { tier } = tierParamSchema.parse(request.params);
    const data = updateConfigSchema.parse(request.body);

    const config = await healthScoreConfigService.update(tenantSlug, tier, data);
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
    const { applicationId } = applicationIdParamSchema.parse(request.params);

    const score = await healthScoreService.getLatestForApplication(
      tenantSlug,
      applicationId
    );
    reply.send({ score });
  });

  // Get health score history for application
  app.get<{ Params: { applicationId: string }; Querystring: { days?: string } }>('/applications/:applicationId/history', {
    preHandler: [requirePermission('health_scores:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { applicationId } = applicationIdParamSchema.parse(request.params);
    const { days } = historyQuerySchema.parse(request.query);

    const history = await healthScoreService.getHistoryForApplication(
      tenantSlug,
      applicationId,
      days ?? 30
    );
    reply.send({ history });
  });

  // Calculate/recalculate health score for application
  app.post<{ Params: { applicationId: string } }>('/applications/:applicationId/calculate', {
    preHandler: [requirePermission('health_scores:manage')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { applicationId } = applicationIdParamSchema.parse(request.params);

    const score = await healthScoreService.calculateForApplication(
      tenantSlug,
      applicationId,
      userId
    );
    reply.status(201).send({ score });
  });
}
