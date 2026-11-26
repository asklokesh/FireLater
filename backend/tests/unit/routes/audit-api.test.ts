import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

const m = vi.hoisted(() => ({
  query: vi.fn(),
  exportLogs: vi.fn(),
  logSafe: vi.fn(),
  getSettings: vi.fn(),
  updateSettings: vi.fn(),
  sealPending: vi.fn(),
  verifyChain: vi.fn(),
  applyRetentionPolicy: vi.fn(),
  runForTenant: vi.fn(),
  setLegalHold: vi.fn(),
  getStorageStats: vi.fn(),
  listRules: vi.fn(),
  createRule: vi.fn(),
  updateRule: vi.fn(),
  deleteRule: vi.fn(),
  listAlerts: vi.fn(),
  acknowledge: vi.fn(),
  generateReport: vi.fn(),
  recordRun: vi.fn(),
  exportToCsv: vi.fn(),
}));

vi.mock('../../../src/middleware/auth.js', () => ({
  requirePermission: () => async (request: import('fastify').FastifyRequest) => {
    (request as unknown as { user: unknown }).user = {
      userId: 'u1', email: 'admin@acme.test', tenantSlug: 'acme', roles: ['admin'],
    };
  },
}));
vi.mock('../../../src/services/audit.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/services/audit.js')>()),
  auditService: {
    query: m.query, exportLogs: m.exportLogs, logSafe: m.logSafe, getSettings: m.getSettings,
    updateSettings: m.updateSettings, sealPending: m.sealPending,
    getEntityHistory: vi.fn(), getUserActivity: vi.fn(), getSecurityEvents: vi.fn(),
    getFailedLogins: vi.fn(), getSummaryByUser: vi.fn(), getSummaryByEntity: vi.fn(),
  },
}));
vi.mock('../../../src/services/audit-chain.js', () => ({ auditChainService: { verifyChain: m.verifyChain } }));
vi.mock('../../../src/services/audit-retention.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/services/audit-retention.js')>()),
  auditRetentionService: {
    applyRetentionPolicy: m.applyRetentionPolicy, runForTenant: m.runForTenant,
    setLegalHold: m.setLegalHold, getStorageStats: m.getStorageStats,
  },
}));
vi.mock('../../../src/services/audit-alerts.js', () => ({
  auditAlertService: {
    listRules: m.listRules, createRule: m.createRule, updateRule: m.updateRule,
    deleteRule: m.deleteRule, listAlerts: m.listAlerts, acknowledge: m.acknowledge,
  },
}));
vi.mock('../../../src/services/compliance-reports.js', () => ({
  complianceReportsService: {
    generateReport: m.generateReport, recordRun: m.recordRun, exportToCsv: m.exportToCsv,
  },
}));
vi.mock('../../../src/config/database.js', () => ({ pool: { query: vi.fn() } }));
vi.mock('../../../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import auditRoutes from '../../../src/routes/audit.js';

const UUID = '3f2b8f1e-5c1a-4d63-9a77-0d9f1c1b2a10';
const settings = (over = {}) => ({
  retention_days: 365, archive_after_days: null, log_reads: false, log_exports: true,
  sensitive_fields: [], alerts_enabled: true, ...over,
});

describe('audit API routes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    m.query.mockResolvedValue({ logs: [], total: 0 });
    m.getSettings.mockResolvedValue(settings());
    m.updateSettings.mockResolvedValue(undefined);
    m.applyRetentionPolicy.mockResolvedValue(0);
    m.sealPending.mockResolvedValue(0);
    m.verifyChain.mockResolvedValue({ valid: true, checkedCount: 3 });
    m.logSafe.mockResolvedValue('log');
    m.recordRun.mockResolvedValue(undefined);
    app = Fastify();
    app.setErrorHandler((error, _req, reply) => {
      const status = error.name === 'ZodError' ? 400 : ((error as { statusCode?: number }).statusCode ?? 500);
      reply.code(status).send({ message: error.message });
    });
    await app.register(auditRoutes, { prefix: '/v1/audit' });
  });

  describe('search and export', () => {
    it('search passes validated filters to the service', async () => {
      const res = await app.inject({ method: 'GET', url: '/v1/audit/search?q=printer&severity=high&outcome=denied&source=archive' });
      expect(res.statusCode).toBe(200);
      expect(m.query).toHaveBeenCalledWith('acme', expect.objectContaining({ q: 'printer', severity: 'high', outcome: 'denied', source: 'archive' }));
    });

    it.each([
      ['/v1/audit/search?ipAddress=not-an-ip'],
      ['/v1/audit/search?severity=catastrophic'],
      ['/v1/audit/search?entityId=nope'],
    ])('rejects invalid filter %s', async (url) => {
      expect((await app.inject({ method: 'GET', url })).statusCode).toBe(400);
    });

    it('exports CSV with a download header and audits the export', async () => {
      m.exportLogs.mockResolvedValue({
        rows: [{ created_at: new Date('2026-01-01T00:00:00Z'), action: 'update', entity_name: '=cmd()' }],
        truncated: false,
      });
      const res = await app.inject({ method: 'GET', url: '/v1/audit/export?format=csv&entityType=issue' });
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.headers['content-disposition']).toContain('attachment');
      const lines = res.body.split('\n');
      expect(lines[0].startsWith('created_at,sequence,severity')).toBe(true);
      expect(lines[1]).toContain("'=cmd()");
      expect(m.logSafe).toHaveBeenCalledWith('acme', expect.objectContaining({ action: 'export', entityType: 'audit_log' }));
    });

    it('exports JSON and flags truncation', async () => {
      m.exportLogs.mockResolvedValue({ rows: [{ id: 'a' }], truncated: true });
      const res = await app.inject({ method: 'GET', url: '/v1/audit/export?format=json' });
      expect(res.headers['x-audit-export-truncated']).toBe('true');
      expect(res.json()).toMatchObject({ rowCount: 1, truncated: true });
    });
  });

  describe('compliance reports', () => {
    const range = 'from=2026-01-01T00:00:00Z&to=2026-01-31T00:00:00Z';

    it('lists the SOC 2 and ISO 27001 templates', async () => {
      const res = await app.inject({ method: 'GET', url: '/v1/audit/reports/templates' });
      expect(res.json().templates.map((t: { id: string }) => t.id)).toEqual(['audit_trail_soc2', 'audit_trail_iso27001']);
    });

    it('generates a report and records the run', async () => {
      m.generateReport.mockResolvedValue({ reportType: 'audit_trail_soc2', summary: { totalEvents: 1 }, data: [] });
      const res = await app.inject({ method: 'GET', url: `/v1/audit/reports/audit_trail_soc2?${range}` });
      expect(res.statusCode).toBe(200);
      expect(m.generateReport).toHaveBeenCalledWith('acme', 'audit_trail_soc2', expect.objectContaining({ from: expect.any(Date) }));
      expect(m.recordRun).toHaveBeenCalled();
    });

    it('returns CSV through the report exporter', async () => {
      m.generateReport.mockResolvedValue({ reportType: 'audit_trail_iso27001', summary: {}, data: [] });
      m.exportToCsv.mockReturnValue('control,created_at\n');
      const res = await app.inject({ method: 'GET', url: `/v1/audit/reports/audit_trail_iso27001?${range}&format=csv` });
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.body).toBe('control,created_at\n');
    });

    it('rejects an unknown template and a missing range', async () => {
      expect((await app.inject({ method: 'GET', url: `/v1/audit/reports/other?${range}` })).statusCode).toBe(400);
      expect((await app.inject({ method: 'GET', url: '/v1/audit/reports/audit_trail_soc2' })).statusCode).toBe(400);
    });
  });

  describe('legal hold', () => {
    it('needs at least one scope field', async () => {
      const res = await app.inject({ method: 'POST', url: '/v1/audit/legal-hold', payload: { hold: true } });
      expect(res.statusCode).toBe(400);
      expect(m.setLegalHold).not.toHaveBeenCalled();
    });

    it('places a hold and audits it', async () => {
      m.setLegalHold.mockResolvedValue(4);
      const res = await app.inject({ method: 'POST', url: '/v1/audit/legal-hold', payload: { hold: true, entityType: 'issue', entityId: UUID } });
      expect(res.json()).toEqual({ hold: true, affected: 4 });
      expect(m.setLegalHold).toHaveBeenCalledWith('acme', expect.objectContaining({ entityType: 'issue', entityId: UUID }), true);
      expect(m.logSafe).toHaveBeenCalledWith('acme', expect.objectContaining({ action: 'legal_hold' }));
    });
  });

  describe('alert rules and alerts', () => {
    const rule = { name: 'Burst', actions: ['delete'], threshold: 5, windowMinutes: 10 };

    it('creates a rule (201) and audits the change', async () => {
      m.createRule.mockResolvedValue({ id: UUID, name: 'Burst' });
      const res = await app.inject({ method: 'POST', url: '/v1/audit/alert-rules', payload: rule });
      expect(res.statusCode).toBe(201);
      expect(m.logSafe).toHaveBeenCalledWith('acme', expect.objectContaining({ action: 'config_change', entityType: 'audit_alert_rule' }));
    });

    it('rejects an invalid rule and a duplicate name', async () => {
      expect((await app.inject({ method: 'POST', url: '/v1/audit/alert-rules', payload: { ...rule, threshold: 0 } })).statusCode).toBe(400);
      m.createRule.mockRejectedValue(Object.assign(new Error('dup'), { code: '23505' }));
      expect((await app.inject({ method: 'POST', url: '/v1/audit/alert-rules', payload: rule })).statusCode).toBe(400);
    });

    it('updates, deletes and 404s on unknown rules', async () => {
      m.updateRule.mockResolvedValueOnce({ id: UUID, name: 'Burst' }).mockResolvedValueOnce(null);
      expect((await app.inject({ method: 'PATCH', url: `/v1/audit/alert-rules/${UUID}`, payload: { enabled: false } })).statusCode).toBe(200);
      expect((await app.inject({ method: 'PATCH', url: `/v1/audit/alert-rules/${UUID}`, payload: { enabled: false } })).statusCode).toBe(404);
      m.deleteRule.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
      expect((await app.inject({ method: 'DELETE', url: `/v1/audit/alert-rules/${UUID}` })).statusCode).toBe(204);
      expect((await app.inject({ method: 'DELETE', url: `/v1/audit/alert-rules/${UUID}` })).statusCode).toBe(404);
    });

    it('acknowledges an open alert only', async () => {
      m.acknowledge.mockResolvedValueOnce({ id: UUID, status: 'acknowledged' }).mockResolvedValueOnce(null);
      expect((await app.inject({ method: 'POST', url: `/v1/audit/alerts/${UUID}/acknowledge` })).statusCode).toBe(200);
      expect((await app.inject({ method: 'POST', url: `/v1/audit/alerts/${UUID}/acknowledge` })).statusCode).toBe(404);
      expect((await app.inject({ method: 'POST', url: '/v1/audit/alerts/not-a-uuid/acknowledge' })).statusCode).toBe(400);
    });
  });

  describe('settings', () => {
    it('rejects an archive window longer than the stored retention (partial update)', async () => {
      const res = await app.inject({ method: 'PATCH', url: '/v1/audit/settings', payload: { archive_after_days: 400 } });
      expect(res.statusCode).toBe(400);
      expect(m.updateSettings).not.toHaveBeenCalled();
    });

    it('rejects shortening retention below the stored archive window', async () => {
      m.getSettings.mockResolvedValue(settings({ archive_after_days: 300 }));
      const res = await app.inject({ method: 'PATCH', url: '/v1/audit/settings', payload: { retention_days: 200 } });
      expect(res.statusCode).toBe(400);
    });

    it('rejects out-of-range values', async () => {
      expect((await app.inject({ method: 'PATCH', url: '/v1/audit/settings', payload: { retention_days: 5 } })).statusCode).toBe(400);
    });

    it('re-stamps existing records when retention changes and audits the change', async () => {
      const res = await app.inject({ method: 'PATCH', url: '/v1/audit/settings', payload: { retention_days: 730 } });
      expect(res.statusCode).toBe(200);
      expect(m.applyRetentionPolicy).toHaveBeenCalledWith('acme', 730);
      expect(m.logSafe).toHaveBeenCalledWith('acme', expect.objectContaining({ action: 'config_change', entityType: 'audit_settings' }));
    });

    it('does not re-stamp when retention is unchanged', async () => {
      await app.inject({ method: 'PATCH', url: '/v1/audit/settings', payload: { log_reads: true } });
      expect(m.applyRetentionPolicy).not.toHaveBeenCalled();
    });
  });

  describe('verify, retention and cleanup', () => {
    it('seals unsealed records before verifying', async () => {
      const order: string[] = [];
      m.sealPending.mockImplementation(async () => { order.push('seal'); return 0; });
      m.verifyChain.mockImplementation(async () => { order.push('verify'); return { valid: true, checkedCount: 1 }; });
      const res = await app.inject({ method: 'GET', url: '/v1/audit/verify' });
      expect(res.statusCode).toBe(200);
      expect(order).toEqual(['seal', 'verify']);
    });

    it('runs retention on demand', async () => {
      m.runForTenant.mockResolvedValue({ archived: 2, purgedLive: 0, purgedArchive: 1 });
      const res = await app.inject({ method: 'POST', url: '/v1/audit/retention/run' });
      expect(res.json()).toEqual({ result: { archived: 2, purgedLive: 0, purgedArchive: 1 } });
    });

    it('cleanup purges through the retention service (no archiving) and attributes the run', async () => {
      m.runForTenant.mockResolvedValue({ archived: 0, purgedLive: 2, purgedArchive: 1 });
      const res = await app.inject({ method: 'POST', url: '/v1/audit/cleanup' });
      expect(res.json()).toEqual({ deletedCount: 3 });
      expect(m.runForTenant).toHaveBeenCalledWith('acme', expect.objectContaining({
        archive: false,
        mode: 'cleanup',
        actor: expect.objectContaining({ httpMethod: 'POST', requestPath: '/v1/audit/cleanup' }),
      }));
    });
  });
});
