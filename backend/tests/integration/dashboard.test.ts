import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { createTestApp, generateTestToken, createAuthHeader } from '../helpers.js';

describe('Dashboard Routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp();

    // GET /v1/dashboard - Dashboard overview
    app.get('/v1/dashboard', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      return {
        issues: { total: 150, open: 42, critical: 5 },
        changes: { pending: 12, approved: 8, completed_today: 3 },
        requests: { open: 25, awaiting_approval: 7 },
        sla: { compliance_rate: 94.5 },
      };
    });

    // GET /v1/dashboard/mobile - Mobile summary
    app.get('/v1/dashboard/mobile', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      return {
        open_issues: 42,
        my_issues: 8,
        pending_approvals: 7,
        critical_alerts: 3,
      };
    });

    // GET /v1/dashboard/trends/issues - Issue trends
    app.get('/v1/dashboard/trends/issues', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const query = request.query as { days?: string };
      const days = query.days ? parseInt(query.days, 10) : 30;

      if (days <= 0 || days > 365) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Validation Error',
          message: 'Days must be between 1 and 365',
        });
      }

      const trends = Array.from({ length: Math.min(days, 7) }, (_, i) => ({
        date: new Date(Date.now() - i * 86400000).toISOString().split('T')[0],
        opened: Math.floor(Math.random() * 20) + 5,
        resolved: Math.floor(Math.random() * 18) + 3,
      })).reverse();

      return { trends };
    });

    // GET /v1/dashboard/issues/by-priority - Issues by priority
    app.get('/v1/dashboard/issues/by-priority', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      return {
        data: [
          { priority: 'critical', count: 5 },
          { priority: 'high', count: 18 },
          { priority: 'medium', count: 32 },
          { priority: 'low', count: 45 },
        ],
      };
    });

    // GET /v1/dashboard/issues/by-status - Issues by status
    app.get('/v1/dashboard/issues/by-status', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      return {
        data: [
          { status: 'open', count: 42 },
          { status: 'in_progress', count: 28 },
          { status: 'pending', count: 15 },
          { status: 'resolved', count: 65 },
        ],
      };
    });

    // GET /v1/dashboard/trends/changes - Change success rate
    app.get('/v1/dashboard/trends/changes', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const query = request.query as { days?: string };
      const days = query.days ? parseInt(query.days, 10) : 30;

      if (days <= 0) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Validation Error',
          message: 'Days must be positive',
        });
      }

      return {
        data: {
          total: 45,
          successful: 42,
          failed: 3,
          success_rate: 93.3,
          period_days: days,
        },
      };
    });

    // GET /v1/dashboard/health/distribution - Health distribution
    app.get('/v1/dashboard/health/distribution', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      return {
        distribution: [
          { health: 'healthy', count: 85 },
          { health: 'degraded', count: 12 },
          { health: 'unhealthy', count: 3 },
        ],
      };
    });

    // GET /v1/dashboard/health/by-tier - Health by tier
    app.get('/v1/dashboard/health/by-tier', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      return {
        data: [
          { tier: 'tier-1', healthy: 15, degraded: 2, unhealthy: 0 },
          { tier: 'tier-2', healthy: 35, degraded: 5, unhealthy: 1 },
          { tier: 'tier-3', healthy: 35, degraded: 5, unhealthy: 2 },
        ],
      };
    });

    // GET /v1/dashboard/health/critical - Critical applications
    app.get('/v1/dashboard/health/critical', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const query = request.query as { limit?: string };
      const limit = query.limit ? parseInt(query.limit, 10) : 5;

      if (limit <= 0) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Validation Error',
          message: 'Limit must be positive',
        });
      }

      return {
        applications: [
          { id: 'app-1', name: 'Payment Gateway', health: 'unhealthy', tier: 'tier-1' },
          { id: 'app-2', name: 'Auth Service', health: 'degraded', tier: 'tier-1' },
        ].slice(0, limit),
      };
    });

    // GET /v1/dashboard/activity - Recent activity
    app.get('/v1/dashboard/activity', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const query = request.query as { limit?: string };
      const limit = query.limit ? parseInt(query.limit, 10) : 20;

      if (limit <= 0) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Validation Error',
          message: 'Limit must be positive',
        });
      }

      return {
        activity: [
          { id: 'act-1', type: 'issue_created', entity_id: 'issue-1', timestamp: new Date().toISOString() },
          { id: 'act-2', type: 'change_approved', entity_id: 'change-1', timestamp: new Date().toISOString() },
        ].slice(0, limit),
      };
    });

    // GET /v1/dashboard/changes/upcoming - Upcoming changes
    app.get('/v1/dashboard/changes/upcoming', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const query = request.query as { days?: string };
      const days = query.days ? parseInt(query.days, 10) : 7;

      if (days <= 0) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Validation Error',
          message: 'Days must be positive',
        });
      }

      return {
        changes: [
          { id: 'chg-1', title: 'Database Upgrade', scheduled_date: new Date(Date.now() + 86400000).toISOString(), risk: 'high' },
          { id: 'chg-2', title: 'Security Patch', scheduled_date: new Date(Date.now() + 172800000).toISOString(), risk: 'low' },
        ],
      };
    });

    // GET /v1/dashboard/requests/by-item - Requests by item
    app.get('/v1/dashboard/requests/by-item', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const query = request.query as { limit?: string };
      const limit = query.limit ? parseInt(query.limit, 10) : 10;

      if (limit <= 0) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Validation Error',
          message: 'Limit must be positive',
        });
      }

      return {
        data: [
          { item_id: 'item-1', item_name: 'Laptop Request', count: 45 },
          { item_id: 'item-2', item_name: 'Software License', count: 32 },
          { item_id: 'item-3', item_name: 'VPN Access', count: 28 },
        ].slice(0, limit),
      };
    });

    // GET /v1/dashboard/sla/compliance - SLA compliance
    app.get('/v1/dashboard/sla/compliance', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      return {
        data: {
          overall: 94.5,
          response_time: 96.2,
          resolution_time: 92.8,
          by_priority: {
            critical: 98.0,
            high: 95.5,
            medium: 93.0,
            low: 91.0,
          },
        },
      };
    });

    // GET /v1/dashboard/cloud/costs - Cloud cost trends
    app.get('/v1/dashboard/cloud/costs', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const query = request.query as { months?: string };
      const months = query.months ? parseInt(query.months, 10) : 6;

      if (months <= 0 || months > 24) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Validation Error',
          message: 'Months must be between 1 and 24',
        });
      }

      return {
        data: {
          current_month: 12500.00,
          previous_month: 11800.00,
          change_percent: 5.9,
          trends: Array.from({ length: months }, (_, i) => ({
            month: new Date(Date.now() - i * 30 * 86400000).toISOString().slice(0, 7),
            cost: 10000 + Math.floor(Math.random() * 5000),
          })).reverse(),
        },
      };
    });

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /v1/dashboard', () => {
    it('should return dashboard overview', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/dashboard',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.issues).toBeDefined();
      expect(body.changes).toBeDefined();
      expect(body.requests).toBeDefined();
      expect(body.sla).toBeDefined();
    });

    it('should return 401 without auth', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/dashboard',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /v1/dashboard/mobile', () => {
    it('should return mobile summary', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/dashboard/mobile',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.open_issues).toBeDefined();
      expect(body.my_issues).toBeDefined();
      expect(body.pending_approvals).toBeDefined();
      expect(body.critical_alerts).toBeDefined();
    });

    it('should return 401 without auth', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/dashboard/mobile',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /v1/dashboard/trends/issues', () => {
    it('should return issue trends with default days', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/dashboard/trends/issues',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.trends).toBeDefined();
      expect(Array.isArray(body.trends)).toBe(true);
    });

    it('should return issue trends with custom days', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/dashboard/trends/issues?days=14',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.trends).toBeDefined();
    });

    it('should return 400 for invalid days', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/dashboard/trends/issues?days=0',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 401 without auth', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/dashboard/trends/issues',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /v1/dashboard/issues/by-priority', () => {
    it('should return issues by priority', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/dashboard/issues/by-priority',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toBeDefined();
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.some((d: { priority: string }) => d.priority === 'critical')).toBe(true);
    });

    it('should return 401 without auth', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/dashboard/issues/by-priority',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /v1/dashboard/issues/by-status', () => {
    it('should return issues by status', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/dashboard/issues/by-status',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toBeDefined();
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.some((d: { status: string }) => d.status === 'open')).toBe(true);
    });

    it('should return 401 without auth', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/dashboard/issues/by-status',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /v1/dashboard/trends/changes', () => {
    it('should return change success rate with default days', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/dashboard/trends/changes',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toBeDefined();
      expect(body.data.success_rate).toBeDefined();
    });

    it('should return change success rate with custom days', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/dashboard/trends/changes?days=60',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.period_days).toBe(60);
    });

    it('should return 400 for invalid days', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/dashboard/trends/changes?days=0',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 401 without auth', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/dashboard/trends/changes',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /v1/dashboard/health/distribution', () => {
    it('should return health distribution', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/dashboard/health/distribution',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.distribution).toBeDefined();
      expect(Array.isArray(body.distribution)).toBe(true);
    });

    it('should return 401 without auth', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/dashboard/health/distribution',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /v1/dashboard/health/by-tier', () => {
    it('should return health by tier', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/dashboard/health/by-tier',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toBeDefined();
      expect(Array.isArray(body.data)).toBe(true);
    });

    it('should return 401 without auth', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/dashboard/health/by-tier',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /v1/dashboard/health/critical', () => {
    it('should return critical applications with default limit', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/dashboard/health/critical',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.applications).toBeDefined();
      expect(Array.isArray(body.applications)).toBe(true);
    });

    it('should return critical applications with custom limit', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/dashboard/health/critical?limit=10',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.applications).toBeDefined();
    });

    it('should return 400 for invalid limit', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/dashboard/health/critical?limit=0',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 401 without auth', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/dashboard/health/critical',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /v1/dashboard/activity', () => {
    it('should return recent activity with default limit', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/dashboard/activity',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.activity).toBeDefined();
      expect(Array.isArray(body.activity)).toBe(true);
    });

    it('should return recent activity with custom limit', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/dashboard/activity?limit=50',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.activity).toBeDefined();
    });

    it('should return 400 for invalid limit', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/dashboard/activity?limit=0',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 401 without auth', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/dashboard/activity',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /v1/dashboard/changes/upcoming', () => {
    it('should return upcoming changes with default days', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/dashboard/changes/upcoming',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.changes).toBeDefined();
      expect(Array.isArray(body.changes)).toBe(true);
    });

    it('should return upcoming changes with custom days', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/dashboard/changes/upcoming?days=14',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.changes).toBeDefined();
    });

    it('should return 400 for invalid days', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/dashboard/changes/upcoming?days=0',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 401 without auth', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/dashboard/changes/upcoming',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /v1/dashboard/requests/by-item', () => {
    it('should return requests by item with default limit', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/dashboard/requests/by-item',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toBeDefined();
      expect(Array.isArray(body.data)).toBe(true);
    });

    it('should return requests by item with custom limit', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/dashboard/requests/by-item?limit=5',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toBeDefined();
    });

    it('should return 400 for invalid limit', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/dashboard/requests/by-item?limit=0',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 401 without auth', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/dashboard/requests/by-item',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /v1/dashboard/sla/compliance', () => {
    it('should return SLA compliance data', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/dashboard/sla/compliance',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toBeDefined();
      expect(body.data.overall).toBeDefined();
      expect(body.data.response_time).toBeDefined();
      expect(body.data.resolution_time).toBeDefined();
      expect(body.data.by_priority).toBeDefined();
    });

    it('should return 401 without auth', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/dashboard/sla/compliance',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /v1/dashboard/cloud/costs', () => {
    it('should return cloud cost trends with default months', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/dashboard/cloud/costs',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toBeDefined();
      expect(body.data.current_month).toBeDefined();
      expect(body.data.previous_month).toBeDefined();
      expect(body.data.trends).toBeDefined();
    });

    it('should return cloud cost trends with custom months', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/dashboard/cloud/costs?months=12',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.trends.length).toBe(12);
    });

    it('should return 400 for invalid months', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/dashboard/cloud/costs?months=0',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 for months exceeding maximum', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/dashboard/cloud/costs?months=25',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 401 without auth', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/dashboard/cloud/costs',
      });

      expect(response.statusCode).toBe(401);
    });
  });
});
