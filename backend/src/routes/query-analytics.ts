import { FastifyPluginAsync } from 'fastify';
import { requirePermission } from '../middleware/auth.js';
import { pool } from '../config/database.js';
import { queryStats } from '../services/queryStats.js';
import { explainQuery, getRecommendations, getStoredPlans } from '../services/indexAdvisor.js';
import { BadRequestError } from '../utils/errors.js';

// ============================================
// QUERY PERFORMANCE ANALYTICS (admin only)
// ============================================

function parseLimit(v: string | undefined, def: number): number {
  const n = parseInt(v ?? '', 10);
  if (!Number.isFinite(n) || n < 1) return def;
  return Math.min(n, 200);
}

const queryAnalyticsRoutes: FastifyPluginAsync = async (app) => {
  const guard = { preHandler: [requirePermission('admin:read')] };

  // Overview: summary + most frequent + slowest + recent slow queries
  app.get<{ Querystring: { limit?: string } }>('/', guard, async (request) => {
    const limit = parseLimit(request.query.limit, 10);
    return {
      summary: queryStats.summary(),
      mostFrequent: queryStats.topFrequent(limit),
      slowest: queryStats.topSlowest(limit),
      recentSlow: queryStats.recentSlow(limit),
      recommendations: getRecommendations(),
    };
  });

  app.get<{ Querystring: { limit?: string } }>('/slow', guard, async (request) => ({
    threshold: queryStats.summary().slowThresholdMs,
    queries: queryStats.recentSlow(parseLimit(request.query.limit, 50)),
  }));

  app.get('/recommendations', guard, async () => ({
    recommendations: getRecommendations(),
    plans: getStoredPlans(),
  }));

  // On-demand EXPLAIN [ANALYZE] of a read-only query
  app.post<{ Body: { query?: string; params?: unknown[]; analyze?: boolean } }>(
    '/explain',
    guard,
    async (request) => {
      const { query, params, analyze } = request.body ?? {};
      if (!query || typeof query !== 'string') {
        throw new BadRequestError('query is required');
      }
      try {
        return await explainQuery(pool as never, query, Array.isArray(params) ? params : [], {
          analyze: analyze === true,
        });
      } catch (err) {
        throw new BadRequestError(err instanceof Error ? err.message : 'Could not explain query');
      }
    }
  );

  // Prometheus text exposition
  app.get('/metrics', guard, async (_request, reply) => {
    reply.header('content-type', 'text/plain; version=0.0.4');
    return queryStats.prometheus();
  });

  app.post('/reset', { preHandler: [requirePermission('admin:write')] }, async () => {
    queryStats.reset();
    return { success: true };
  });
};

export default queryAnalyticsRoutes;
