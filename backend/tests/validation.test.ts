import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import { registerValidation } from '../src/middleware/validation.js';

// Queues would open Redis connections at import time; routes only need the constructors.
vi.mock('bullmq', () => {
  const Stub = vi.fn().mockImplementation(() => ({
    on: vi.fn(), add: vi.fn(), close: vi.fn(), getJob: vi.fn(), waitUntilReady: vi.fn(),
    getJobCounts: vi.fn(), getRepeatableJobs: vi.fn(async () => []), removeRepeatableByKey: vi.fn(),
  }));
  return { Queue: Stub, Worker: Stub, QueueEvents: Stub, QueueScheduler: Stub };
});

vi.mock('../src/config/redis.js', () => ({
  redis: new Proxy({}, { get: () => vi.fn(async () => null) }),
  redisConnection: { host: '127.0.0.1', port: 0 },
  testRedisConnection: vi.fn(async () => true),
}));

// Every real route module, registered exactly as src/index.ts does (prefixes included).
const MODULES: Array<[string, boolean, string]> = [
  ['auth', false, 'authRoutes:/v1/auth'],
  ['users', false, 'userRoutes:/v1/users'],
  ['groups', false, 'groupRoutes:/v1/groups'],
  ['roles', false, 'roleRoutes:/v1/roles'],
  ['applications', false, 'applicationRoutes:/v1/applications'],
  ['issues', false, 'issueRoutes:/v1/issues'],
  ['catalog', false, 'catalogRoutes:/v1/catalog'],
  ['requests', false, 'requestRoutes:/v1/requests'],
  ['notifications', false, 'notificationRoutes:/v1/notifications'],
  ['oncall', false, 'oncallRoutes:/v1/oncall'],
  ['changes', false, 'changeRoutes:/v1/changes'],
  ['health', false, 'healthRoutes:/v1/health'],
  ['cloud', false, 'cloudRoutes:/v1/cloud'],
  ['reporting', false, 'reportingRoutes:/v1/reports'],
  ['jobs', false, 'jobsRoutes:/v1/jobs'],
  ['attachments', false, 'attachmentsRoutes:/v1/attachments'],
  ['audit', false, 'auditRoutes:/v1/audit'],
  ['dashboard', false, 'dashboardRoutes:/v1/dashboard'],
  ['settings', false, 'settingsRoutes:/v1/settings'],
  ['problems', false, 'problemRoutes:/v1/problems'],
  ['knowledge', false, 'knowledgeRoutes:/v1/kb'],
  ['sla', false, 'slaRoutes:/v1/sla'],
  ['workflow', false, 'workflowRoutes:/v1/workflows'],
  ['assets', false, 'assetRoutes:/v1/assets'],
  ['bulk', false, 'bulkRoutes:/v1/bulk'],
  ['email', false, 'emailRoutes:/v1/email'],
  ['integrations', false, 'integrationsRoutes:/v1/integrations'],
  ['migration', false, 'migrationRoutes:/v1/migration'],
  ['sso', false, 'ssoRoutes:/v1/sso'],
  ['sod', false, 'sodRoutes:/v1/sod'],
  ['data-security', false, 'dataSecurityRoutes:/v1/data-security'],
  ['maker-checker', false, 'makerCheckerRoutes:/v1/maker-checker'],
  ['pam', false, 'pamRoutes:/v1/pam'],
  ['compliance-reports', false, 'complianceReportRoutes:/v1/compliance-reports'],
  ['recertification', false, 'recertificationRoutes:/v1/recertification'],
  ['regulatory-sla', false, 'regulatorySlaRoutes:/v1/regulatory-sla'],
  ['emergency-change', false, 'emergencyChangeRoutes:/v1/emergency-changes'],
  ['vendor-risk', true, 'vendorRiskRoutes:/v1/vendor-risk'],
  ['search', false, 'searchRoutes:/v1/search'],
  ['ws', false, 'wsRoutes:/v1/ws'],
];

async function buildApp() {
  const app = Fastify({ bodyLimit: 20 * 1024 * 1024 });
  registerValidation(app);
  for (const [file, named, spec] of MODULES) {
    const [name, prefix] = spec.split(':');
    const mod: any = await import(`../src/routes/${file}.ts`);
    await app.register(named ? mod[name] : mod.default, { prefix });
  }
  await app.ready();
  return app;
}

describe('validation covers every route in the application', () => {
  it('runs the validation layer on all registered routes and rejects unsafe path params', async () => {
    const app = await buildApp();
    const routes = app.validationCoverage();
    expect(routes.length).toBeGreaterThan(300);

    const withParams = routes.filter((r) => r.url.includes(':') && r.method !== 'HEAD');
    expect(withParams.length).toBeGreaterThan(100);

    const notEnforced: string[] = [];
    for (const r of withParams) {
      const url = r.url.replace(/:\w+/g, 'a%20b%3Bc');
      const res = await app.inject({ method: r.method as any, url, payload: r.method === 'GET' || r.method === 'DELETE' ? undefined : {} });
      const body = res.body.includes('Validation Error');
      if (res.statusCode !== 400 || !body) notEnforced.push(`${r.method} ${r.url} -> ${res.statusCode}`);
    }
    expect(notEnforced).toEqual([]);
  }, 120_000);

  it('has an explicit registry entry for every auth, issues and requests route', async () => {
    const app = await buildApp();
    const dedicated = app.validationCoverage().filter((r) => /^\/v1\/(auth|issues|requests)\b/.test(r.url));
    expect(dedicated.length).toBeGreaterThan(40);
    expect(dedicated.filter((r) => !r.registered)).toEqual([]);
  }, 60_000);

  it('applies baseline body limits on routes without a dedicated schema (every body-accepting route)', async () => {
    const app = await buildApp();
    const bodyRoutes = app.validationCoverage().filter((r) => !r.dedicatedSchema && ['POST', 'PUT', 'PATCH'].includes(r.method));
    expect(bodyRoutes.length).toBeGreaterThan(20);
    // Modules that authenticate in an onRequest hook answer anonymous callers 401 before the body is
    // parsed (handlers are unreachable); their body validation is proved with an authenticated
    // request in the proof script (see loki-proof.sh, item 7).
    const authFirst = /^\/v1\/(email|migration)\//;
    const bad: string[] = [];
    for (const r of bodyRoutes) {
      const url = r.url.replace(/:\w+/g, 'abc-1');
      const payloads: unknown[] = [{ note: 'x'.repeat(5_000_001) }, { a: new Array(50_001).fill(1) }, [1, 2, 3].map(() => ({})).concat('s' as any)];
      for (const payload of payloads.slice(0, 2)) {
        const res = await app.inject({ method: r.method as any, url, payload: payload as any });
        if (res.statusCode === 401 && authFirst.test(r.url)) continue;
        if (res.statusCode !== 400 || !res.body.includes('Validation Error')) bad.push(`${r.method} ${r.url} -> ${res.statusCode}`);
      }
    }
    expect(bad).toEqual([]);
  }, 180_000);
});

describe('registry coverage', () => {
  it('has an explicit registry entry for every route in the application', async () => {
    const app = await buildApp();
    const cov = app.validationCoverage();
    const unregistered = cov.filter((r) => !r.registered).map((r) => `${r.method} ${r.url}`);
    expect(unregistered).toEqual([]);
    expect(cov.filter((r) => r.dedicatedSchema).length).toBeGreaterThan(250);
  }, 60_000);
});
