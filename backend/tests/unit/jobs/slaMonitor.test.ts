import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the database pool
const mockQuery = vi.fn();
vi.mock('../../../src/config/database.js', () => ({
  pool: {
    query: (...args: unknown[]) => mockQuery(...args),
  },
}));

// Mock logger
vi.mock('../../../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { monitorSLABreaches, startSLAMonitor, stopSLAMonitor } from '../../../src/jobs/slaMonitor.js';
import { logger } from '../../../src/utils/logger.js';

describe('SLA Monitor Job', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    stopSLAMonitor();
    vi.useRealTimers();
  });

  describe('monitorSLABreaches', () => {
    it('should query all active tenants', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await monitorSLABreaches();

      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT slug FROM tenants WHERE status = $1',
        ['active']
      );
    });

    it('should update SLA breaches for each tenant', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ slug: 'test-tenant' }, { slug: 'another-tenant' }],
      });
      mockQuery.mockResolvedValueOnce({ rowCount: 0 });
      mockQuery.mockResolvedValueOnce({ rowCount: 0 });

      await monitorSLABreaches();

      // Should have called query 3 times: 1 for tenants, 2 for updates
      expect(mockQuery).toHaveBeenCalledTimes(3);
    });

    it('should update issues with breached response SLA', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ slug: 'test-tenant' }] });
      mockQuery.mockResolvedValueOnce({ rowCount: 5 });

      await monitorSLABreaches();

      expect(mockQuery).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('UPDATE tenant_test_tenant.issues'),
        expect.arrayContaining([expect.any(Date)])
      );
    });

    it('should log warning when breaches are found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ slug: 'test-tenant' }] });
      mockQuery.mockResolvedValueOnce({ rowCount: 3 });

      await monitorSLABreaches();

      expect(logger.warn).toHaveBeenCalledWith(
        { tenant: 'test-tenant', count: 3 },
        'Updated issues with SLA breaches'
      );
    });

    it('should not log when no breaches are found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ slug: 'test-tenant' }] });
      mockQuery.mockResolvedValueOnce({ rowCount: 0 });

      await monitorSLABreaches();

      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('should continue processing other tenants after error', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ slug: 'failing-tenant' }, { slug: 'working-tenant' }],
      });
      mockQuery.mockRejectedValueOnce(new Error('DB error'));
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      await monitorSLABreaches();

      // Should log error for failing tenant
      expect(logger.error).toHaveBeenCalledWith(
        { tenant: 'failing-tenant', error: expect.any(Error) },
        'Error monitoring SLA breaches for tenant'
      );

      // Should still process working tenant
      expect(logger.warn).toHaveBeenCalledWith(
        { tenant: 'working-tenant', count: 1 },
        'Updated issues with SLA breaches'
      );
    });

    it('should log error when tenant query fails', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Connection error'));

      await monitorSLABreaches();

      expect(logger.error).toHaveBeenCalledWith(
        { error: expect.any(Error) },
        'Error in SLA breach monitoring job'
      );
    });

    it('should sanitize tenant slug for schema name', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ slug: 'test-tenant-123' }] });
      mockQuery.mockResolvedValueOnce({ rowCount: 0 });

      await monitorSLABreaches();

      expect(mockQuery).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('tenant_test_tenant_123'),
        expect.any(Array)
      );
    });

    it('should set sla_breached to true and response_met to false', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ slug: 'tenant' }] });
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      await monitorSLABreaches();

      const updateQuery = mockQuery.mock.calls[1][0];
      expect(updateQuery).toContain('SET sla_breached = true');
      expect(updateQuery).toContain('response_met = CASE');
      expect(updateQuery).toContain('resolution_met = CASE');
    });

    it('should exclude closed and resolved issues', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ slug: 'tenant' }] });
      mockQuery.mockResolvedValueOnce({ rowCount: 0 });

      await monitorSLABreaches();

      const updateQuery = mockQuery.mock.calls[1][0];
      expect(updateQuery).toContain("status NOT IN ('closed', 'resolved')");
    });

    it('should only update issues not already marked as breached', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ slug: 'tenant' }] });
      mockQuery.mockResolvedValueOnce({ rowCount: 0 });

      await monitorSLABreaches();

      const updateQuery = mockQuery.mock.calls[1][0];
      expect(updateQuery).toContain('sla_breached = false');
    });
  });

  describe('startSLAMonitor', () => {
    it('should log start message', () => {
      mockQuery.mockResolvedValue({ rows: [] });

      startSLAMonitor();

      expect(logger.info).toHaveBeenCalledWith('Starting SLA breach monitor');
    });

    it('should run monitor immediately on start', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      startSLAMonitor();

      // Allow promises to resolve
      await Promise.resolve();
      await Promise.resolve();

      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT slug FROM tenants WHERE status = $1',
        ['active']
      );
    });

    it('should run monitor every minute', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      startSLAMonitor();

      // Clear initial run
      vi.clearAllMocks();

      // Advance 60 seconds
      await vi.advanceTimersByTimeAsync(60000);

      expect(mockQuery).toHaveBeenCalled();
    });

    it('should warn if already running', () => {
      mockQuery.mockResolvedValue({ rows: [] });

      startSLAMonitor();
      startSLAMonitor();

      expect(logger.warn).toHaveBeenCalledWith('SLA monitor already running');
    });

    it('should log error if initial run fails', async () => {
      mockQuery.mockRejectedValue(new Error('Start error'));

      startSLAMonitor();

      // Allow promises to resolve
      await Promise.resolve();
      await Promise.resolve();

      expect(logger.error).toHaveBeenCalledWith(
        { error: expect.any(Error) },
        expect.stringContaining('SLA')
      );
    });
  });

  describe('stopSLAMonitor', () => {
    it('should stop the monitor', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      startSLAMonitor();
      stopSLAMonitor();

      expect(logger.info).toHaveBeenCalledWith('SLA breach monitor stopped');
    });

    it('should not run after being stopped', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      startSLAMonitor();

      // Allow initial run to complete
      await Promise.resolve();
      await Promise.resolve();

      vi.clearAllMocks();
      stopSLAMonitor();

      // Advance 60 seconds - should not trigger another run
      vi.advanceTimersByTime(60000);

      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('should do nothing if not running', () => {
      stopSLAMonitor();

      // Should not log stop message if not running
      expect(logger.info).not.toHaveBeenCalledWith('SLA breach monitor stopped');
    });

    it('should allow restart after stop', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      startSLAMonitor();
      stopSLAMonitor();
      vi.clearAllMocks();

      startSLAMonitor();

      expect(logger.info).toHaveBeenCalledWith('Starting SLA breach monitor');
    });
  });
});
