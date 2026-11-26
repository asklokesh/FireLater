import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';

// Authentication/permission checks are not under test: let every request through as an admin.
vi.mock('../../src/middleware/auth.js', () => {
  const pass = async (request: { user?: unknown }) => {
    request.user = { userId: '11111111-1111-4111-8111-111111111111', tenantId: 't1', tenantSlug: 'acme', email: 'a@acme.test', roles: ['admin'] };
  };
  return { authenticate: pass, optionalAuth: pass, requirePermission: () => pass, requireRole: () => pass };
});

// Queues/redis are not reachable in unit tests.
vi.mock('../../src/config/redis.js', () => ({
  redis: { get: vi.fn(), set: vi.fn(), setex: vi.fn(), del: vi.fn(), keys: vi.fn().mockResolvedValue([]), on: vi.fn(), duplicate: vi.fn() },
  redisConnection: {},
  testRedisConnection: vi.fn(),
  closeRedis: vi.fn(),
}));
vi.mock('bullmq', () => {
  class Stub { constructor(..._a: unknown[]) {} on() { return this; } add = vi.fn(); getJob = vi.fn(); close = vi.fn(); }
  return { Queue: Stub, Worker: Stub, QueueEvents: Stub, QueueScheduler: Stub, FlowProducer: Stub };
});

import { validationPlugin } from '../../src/middleware/validation.js';
import * as r_auth from '../../src/routes/auth.js';
import * as r_users from '../../src/routes/users.js';
import * as r_groups from '../../src/routes/groups.js';
import * as r_roles from '../../src/routes/roles.js';
import * as r_applications from '../../src/routes/applications.js';
import * as r_issues from '../../src/routes/issues.js';
import * as r_catalog from '../../src/routes/catalog.js';
import * as r_requests from '../../src/routes/requests.js';
import * as r_notifications from '../../src/routes/notifications.js';
import * as r_oncall from '../../src/routes/oncall.js';
import * as r_changes from '../../src/routes/changes.js';
import * as r_health from '../../src/routes/health.js';
import * as r_cloud from '../../src/routes/cloud.js';
import * as r_reporting from '../../src/routes/reporting.js';
import * as r_jobs from '../../src/routes/jobs.js';
import * as r_attachments from '../../src/routes/attachments.js';
import * as r_audit from '../../src/routes/audit.js';
import * as r_dashboard from '../../src/routes/dashboard.js';
import * as r_settings from '../../src/routes/settings.js';
import * as r_problems from '../../src/routes/problems.js';
import * as r_knowledge from '../../src/routes/knowledge.js';
import * as r_sla from '../../src/routes/sla.js';
import * as r_workflow from '../../src/routes/workflow.js';
import * as r_assets from '../../src/routes/assets.js';
import * as r_email from '../../src/routes/email.js';
import * as r_integrations from '../../src/routes/integrations.js';
import * as r_migration from '../../src/routes/migration.js';
import * as r_sso from '../../src/routes/sso.js';
import * as r_sod from '../../src/routes/sod.js';
import * as r_data_security from '../../src/routes/data-security.js';
import * as r_maker_checker from '../../src/routes/maker-checker.js';
import * as r_pam from '../../src/routes/pam.js';
import * as r_compliance_reports from '../../src/routes/compliance-reports.js';
import * as r_recertification from '../../src/routes/recertification.js';
import * as r_regulatory_sla from '../../src/routes/regulatory-sla.js';
import * as r_emergency_change from '../../src/routes/emergency-change.js';
import * as r_vendor_risk from '../../src/routes/vendor-risk.js';
import * as r_search from '../../src/routes/search.js';
import * as r_bulk from '../../src/routes/bulk.js';

const MODULES: Array<[any, string]> = [
  [((r_auth as any).default ?? (r_auth as any).authRoutes), '/v1/auth'],
  [((r_users as any).default ?? (r_users as any).userRoutes), '/v1/users'],
  [((r_groups as any).default ?? (r_groups as any).groupRoutes), '/v1/groups'],
  [((r_roles as any).default ?? (r_roles as any).roleRoutes), '/v1/roles'],
  [((r_applications as any).default ?? (r_applications as any).applicationRoutes), '/v1/applications'],
  [((r_issues as any).default ?? (r_issues as any).issueRoutes), '/v1/issues'],
  [((r_catalog as any).default ?? (r_catalog as any).catalogRoutes), '/v1/catalog'],
  [((r_requests as any).default ?? (r_requests as any).requestRoutes), '/v1/requests'],
  [((r_notifications as any).default ?? (r_notifications as any).notificationRoutes), '/v1/notifications'],
  [((r_oncall as any).default ?? (r_oncall as any).oncallRoutes), '/v1/oncall'],
  [((r_changes as any).default ?? (r_changes as any).changeRoutes), '/v1/changes'],
  [((r_health as any).default ?? (r_health as any).healthRoutes), '/v1/health'],
  [((r_cloud as any).default ?? (r_cloud as any).cloudRoutes), '/v1/cloud'],
  [((r_reporting as any).default ?? (r_reporting as any).reportingRoutes), '/v1/reports'],
  [((r_jobs as any).default ?? (r_jobs as any).jobsRoutes), '/v1/jobs'],
  [((r_attachments as any).default ?? (r_attachments as any).attachmentsRoutes), '/v1/attachments'],
  [((r_audit as any).default ?? (r_audit as any).auditRoutes), '/v1/audit'],
  [((r_dashboard as any).default ?? (r_dashboard as any).dashboardRoutes), '/v1/dashboard'],
  [((r_settings as any).default ?? (r_settings as any).settingsRoutes), '/v1/settings'],
  [((r_problems as any).default ?? (r_problems as any).problemRoutes), '/v1/problems'],
  [((r_knowledge as any).default ?? (r_knowledge as any).knowledgeRoutes), '/v1/kb'],
  [((r_sla as any).default ?? (r_sla as any).slaRoutes), '/v1/sla'],
  [((r_workflow as any).default ?? (r_workflow as any).workflowRoutes), '/v1/workflows'],
  [((r_assets as any).default ?? (r_assets as any).assetRoutes), '/v1/assets'],
  [((r_email as any).default ?? (r_email as any).emailRoutes), '/v1/email'],
  [((r_integrations as any).default ?? (r_integrations as any).integrationsRoutes), '/v1/integrations'],
  [((r_migration as any).default ?? (r_migration as any).migrationRoutes), '/v1/migration'],
  [((r_sso as any).default ?? (r_sso as any).ssoRoutes), '/v1/sso'],
  [((r_sod as any).default ?? (r_sod as any).sodRoutes), '/v1/sod'],
  [((r_data_security as any).default ?? (r_data_security as any).dataSecurityRoutes), '/v1/data-security'],
  [((r_maker_checker as any).default ?? (r_maker_checker as any).makerCheckerRoutes), '/v1/maker-checker'],
  [((r_pam as any).default ?? (r_pam as any).pamRoutes), '/v1/pam'],
  [((r_compliance_reports as any).default ?? (r_compliance_reports as any).complianceReportRoutes), '/v1/compliance-reports'],
  [((r_recertification as any).default ?? (r_recertification as any).recertificationRoutes), '/v1/recertification'],
  [((r_regulatory_sla as any).default ?? (r_regulatory_sla as any).regulatorySlaRoutes), '/v1/regulatory-sla'],
  [((r_emergency_change as any).default ?? (r_emergency_change as any).emergencyChangeRoutes), '/v1/emergency-changes'],
  [((r_vendor_risk as any).default ?? (r_vendor_risk as any).vendorRiskRoutes), '/v1/vendor-risk'],
  [((r_search as any).default ?? (r_search as any).searchRoutes), '/v1/search'],
  [((r_bulk as any).default ?? (r_bulk as any).bulkRoutes), '/v1/bulk'],
];

const ID = '4f1b3b3e-8f52-4c53-9d0e-0d5c3b1f0a11';
let app: FastifyInstance;

beforeAll(async () => {
  app = Fastify();
  await app.register(validationPlugin);
  for (const [plugin, prefix] of MODULES) await app.register(plugin, { prefix });
  await app.ready();
});
afterAll(async () => { await app.close(); });

async function call(method: string, url: string, payload?: unknown) {
  const res = await app.inject({ method: method as 'GET', url, payload: payload as object | undefined });
  return { status: res.statusCode, body: res.body };
}

describe('real route modules: coverage', () => {
  it('no route is left with sanitization only, and most carry explicit schemas', () => {
    const cov = app.validationCoverage();
    expect(cov.length).toBeGreaterThan(400);
    expect(cov.filter((c) => c.mode === 'baseline')).toEqual([]);
    expect(cov.filter((c) => c.mode === 'explicit').length).toBeGreaterThan(cov.length * 0.6);
  });

  it('routes that call validate() still get default params/body checks (merged validators)', async () => {
    // PATCH routes that declare only a body schema must still reject a non-uuid :id
    for (const url of ['/v1/integrations/nope', '/v1/sla/policies/nope', '/v1/workflows/rules/nope']) {
      const res = await call('PATCH', url, {});
      expect([400, 404]).toContain(res.status);
      if (res.status === 400) expect(res.body).toContain('"location":"params"');
    }
    expect((await call('PATCH', '/v1/integrations/nope', { name: 'x' })).status).toBe(400);
    expect((await call('PUT', `/v1/reports/templates/${ID}`, [1])).status).toBe(400); // params-only validators now check bodies
  });
});

describe('real route modules: input is rejected before reaching services', () => {
  const cases: Array<[string, string, unknown, string]> = [
    ['POST', '/v1/changes/' + ID + '/reject', {}, 'reason'],
    ['POST', '/v1/changes/' + ID + '/fail', {}, 'outcomeNotes'],
    ['POST', '/v1/changes/' + ID + '/schedule', { plannedStart: 5 }, 'plannedStart'],
    ['POST', '/v1/changes/' + ID + '/approve', { comments: 5 }, 'comments'],
    ['PUT', '/v1/oncall/schedules/' + ID + '/rotations/' + ID, { position: 0 }, 'position'],
    ['POST', '/v1/oncall/schedules/' + ID + '/applications', { applicationId: 'x' }, 'applicationId'],
    ['POST', '/v1/oncall/shift-swaps/' + ID + '/accept', { message: 'x'.repeat(600) }, 'message'],
    ['POST', '/v1/integrations/api-keys', {}, 'name'],
    ['POST', '/v1/integrations/webhooks', {}, 'name'],
    ['POST', '/v1/reports/execute', {}, 'templateId'],
    ['POST', '/v1/sod/policies', { name: 'x' }, 'conflicting_role_a'],
    ['POST', '/v1/maker-checker/operations', {}, 'operationType'],
    ['POST', '/v1/recertification/campaigns', { name: 'x' }, 'scopeType'],
    ['POST', '/v1/recertification/items/' + ID + '/decide', { decision: 'maybe' }, 'decision'],
    ['POST', '/v1/attachments/upload-url', {}, 'filename'],
    ['PATCH', '/v1/audit/settings', { retention_days: 'x' }, 'retention_days'],
    ['POST', '/v1/pam/grants/' + ID + '/approve', { approverEmail: 'nope' }, 'approverEmail'],
    ['POST', '/v1/search/query', { page: 'x' }, 'page'],
    ['POST', '/v1/auth/register', { tenantName: 'x' }, 'tenantSlug'],
    ['GET', '/v1/groups?page=abc', undefined, 'page'],
    ['GET', '/v1/groups?limit=abc', undefined, 'limit'], // paging keys are checked next to an explicit query schema
    ['GET', '/v1/applications?page=abc', undefined, 'page'],
    ['GET', '/v1/reports/dashboard/activity?limit=abc', undefined, 'limit'],
    ['GET', '/v1/oncall/schedules?group_id=nope', undefined, 'group_id'],
    ['GET', '/v1/oncall/who-is-on-call?schedule_id=nope', undefined, 'schedule_id'],
    ['GET', '/v1/audit/user/nope', undefined, 'userId'],
  ];
  it.each(cases)('%s %s -> 400 naming the bad field', async (method, url, payload, field) => {
    const res = await call(method, url, payload);
    expect(res.status).toBe(400);
    expect(res.body).toContain(field);
    expect(res.body).toContain('Validation Error');
  });

  it('accepts empty paging parameters on default-schema routes', async () => {
    const res = await call('GET', '/v1/audit/user/' + ID + '?page=&limit=');
    expect(res.body).not.toContain('Validation Error');
  });
});
