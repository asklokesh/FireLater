import { describe, it, expect, vi, beforeEach } from 'vitest';

const m = vi.hoisted(() => ({
  poolQuery: vi.fn(),
  sealPending: vi.fn(),
  verifyChain: vi.fn(),
  runForTenant: vi.fn(),
}));

vi.mock('../../../src/config/database.js', () => ({ pool: { query: m.poolQuery } }));
vi.mock('../../../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('../../../src/services/audit.js', () => ({ auditService: { sealPending: m.sealPending } }));
vi.mock('../../../src/services/audit-chain.js', () => ({ auditChainService: { verifyChain: m.verifyChain } }));
vi.mock('../../../src/services/audit-retention.js', () => ({ auditRetentionService: { runForTenant: m.runForTenant } }));

import { runAuditIntegrityJob } from '../../../src/jobs/audit-integrity.js';

describe('runAuditIntegrityJob', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.poolQuery.mockResolvedValue({ rows: [{ slug: 'acme' }] });
    m.sealPending.mockResolvedValue(2);
    m.verifyChain.mockResolvedValue({ valid: true, checkedCount: 5 });
    m.runForTenant.mockResolvedValue({ purgedLive: 1, purgedArchive: 2 });
  });

  it('seals, verifies, then applies retention for each tenant', async () => {
    const order: string[] = [];
    m.sealPending.mockImplementation(async () => { order.push('seal'); return 0; });
    m.verifyChain.mockImplementation(async () => { order.push('verify'); return { valid: true, checkedCount: 1 }; });
    m.runForTenant.mockImplementation(async () => { order.push('retention'); return { purgedLive: 0, purgedArchive: 0 }; });
    const results = await runAuditIntegrityJob();
    expect(order).toEqual(['seal', 'verify', 'retention']);
    expect(results).toEqual([expect.objectContaining({ tenantSlug: 'acme', chainValid: true, purgedCount: 0 })]);
  });

  it('reports a broken chain and keeps going with other tenants', async () => {
    m.poolQuery.mockResolvedValue({ rows: [{ slug: 'a' }, { slug: 'b' }] });
    m.verifyChain
      .mockResolvedValueOnce({ valid: false, firstBrokenSequence: 9, checkedCount: 3 })
      .mockResolvedValueOnce({ valid: true, checkedCount: 1 });
    const results = await runAuditIntegrityJob();
    expect(results.map((r) => r.chainValid)).toEqual([false, true]);
    expect(results[0].firstBrokenSequence).toBe(9);
  });

  it('counts purged records from both tables', async () => {
    const results = await runAuditIntegrityJob();
    expect(results[0].purgedCount).toBe(3);
  });
});
