import { describe, it, expect, vi, afterEach } from 'vitest';

/**
 * Unit tests for VendorRiskService
 * Coverage:
 * - createVendor() creates with correct defaults
 * - getChangeImpactVendors() returns vendors linked to application
 * - getRiskSummary() counts correctly by tier
 */

// Mock dependencies
const mockQuery = vi.fn();

vi.mock('../../../src/config/database.js', () => ({
  pool: {
    query: (...args: unknown[]) => mockQuery(...args),
  },
}));

vi.mock('../../../src/utils/cache.js', () => ({
  cacheService: {
    getOrSet: vi.fn(async (_key: string, fetcher: () => Promise<unknown>) => fetcher()),
    invalidateTenant: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../../src/services/tenant.js', () => ({
  tenantService: {
    getSchemaName: vi.fn().mockReturnValue('tenant_test'),
    findBySlug: vi.fn(),
  },
}));

vi.mock('../../../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Import after mocks
import { vendorRiskService } from '../../../src/services/vendor-risk.js';
import { cacheService } from '../../../src/utils/cache.js';
import { NotFoundError } from '../../../src/utils/errors.js';

describe('VendorRiskService', () => {
  const tenantSlug = 'test-tenant';

  afterEach(() => {
    vi.clearAllMocks();
    mockQuery.mockReset();
  });

  // ============================================
  // createVendor
  // ============================================
  describe('createVendor', () => {
    it('should create vendor with required name and default risk_tier=medium', async () => {
      const mockVendor = {
        id: 'vendor-uuid-1',
        name: 'Acme Corp',
        description: null,
        website: null,
        risk_tier: 'medium',
        criticality: 'standard',
        contract_review_date: null,
        assessment_review_date: null,
        primary_contact_name: null,
        primary_contact_email: null,
        is_active: true,
        notes: null,
        created_by: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      mockQuery.mockResolvedValueOnce({ rows: [mockVendor] });

      const result = await vendorRiskService.createVendor(tenantSlug, { name: 'Acme Corp' });

      expect(result.id).toBe('vendor-uuid-1');
      expect(result.name).toBe('Acme Corp');
      expect(result.risk_tier).toBe('medium');
      expect(result.criticality).toBe('standard');
      expect(result.is_active).toBe(true);

      // Verify the INSERT was called
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO tenant_test.vendors'),
        expect.arrayContaining(['Acme Corp', 'medium', 'standard', true])
      );
    });

    it('should create vendor with explicit risk_tier=critical', async () => {
      const mockVendor = {
        id: 'vendor-uuid-2',
        name: 'Critical Vendor',
        risk_tier: 'critical',
        criticality: 'mission_critical',
        is_active: true,
      };

      mockQuery.mockResolvedValueOnce({ rows: [mockVendor] });

      const result = await vendorRiskService.createVendor(tenantSlug, {
        name: 'Critical Vendor',
        riskTier: 'critical',
        criticality: 'mission_critical',
      });

      expect(result.risk_tier).toBe('critical');
      expect(result.criticality).toBe('mission_critical');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO tenant_test.vendors'),
        expect.arrayContaining(['Critical Vendor', 'critical', 'mission_critical'])
      );
    });

    it('should pass createdBy when provided', async () => {
      const mockVendor = {
        id: 'vendor-uuid-3',
        name: 'Test Vendor',
        created_by: 'admin@example.com',
        risk_tier: 'medium',
        is_active: true,
      };

      mockQuery.mockResolvedValueOnce({ rows: [mockVendor] });

      await vendorRiskService.createVendor(tenantSlug, {
        name: 'Test Vendor',
        createdBy: 'admin@example.com',
      });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO tenant_test.vendors'),
        expect.arrayContaining(['admin@example.com'])
      );
    });

    it('should invalidate cache after creating vendor', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'v-1', name: 'Test', risk_tier: 'low', is_active: true }] });

      await vendorRiskService.createVendor(tenantSlug, { name: 'Test' });

      expect(cacheService.invalidateTenant).toHaveBeenCalledWith(tenantSlug, 'vendors');
    });

    it('should default isActive to true when not specified', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'v-1', name: 'Test', risk_tier: 'medium', is_active: true }] });

      await vendorRiskService.createVendor(tenantSlug, { name: 'Test Vendor' });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([true]) // isActive defaults to true
      );
    });
  });

  // ============================================
  // getChangeImpactVendors
  // ============================================
  describe('getChangeImpactVendors', () => {
    it('should return vendors linked to an application with counts', async () => {
      const mockVendors = [
        {
          id: 'v-1',
          name: 'Cloud Provider',
          risk_tier: 'critical',
          criticality: 'mission_critical',
          dependency_type: 'hosting',
          is_active: true,
        },
        {
          id: 'v-2',
          name: 'Payment Gateway',
          risk_tier: 'high',
          criticality: 'important',
          dependency_type: 'service',
          is_active: true,
        },
        {
          id: 'v-3',
          name: 'Minor Vendor',
          risk_tier: 'low',
          criticality: 'standard',
          dependency_type: 'support',
          is_active: true,
        },
      ];

      mockQuery.mockResolvedValueOnce({ rows: mockVendors });

      const result = await vendorRiskService.getChangeImpactVendors(tenantSlug, 'app-123');

      expect(result.vendors).toHaveLength(3);
      expect(result.criticalCount).toBe(1); // Only mission_critical
      expect(result.highRiskCount).toBe(2); // critical + high risk_tier

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE val.application_id = $1'),
        ['app-123']
      );
    });

    it('should return zero counts when no vendors linked', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await vendorRiskService.getChangeImpactVendors(tenantSlug, 'app-no-vendors');

      expect(result.vendors).toHaveLength(0);
      expect(result.criticalCount).toBe(0);
      expect(result.highRiskCount).toBe(0);
    });

    it('should count only mission_critical for criticalCount', async () => {
      const mockVendors = [
        { id: 'v-1', risk_tier: 'high', criticality: 'mission_critical' },
        { id: 'v-2', risk_tier: 'critical', criticality: 'important' },
        { id: 'v-3', risk_tier: 'medium', criticality: 'mission_critical' },
      ];

      mockQuery.mockResolvedValueOnce({ rows: mockVendors });

      const result = await vendorRiskService.getChangeImpactVendors(tenantSlug, 'app-abc');

      expect(result.criticalCount).toBe(2); // Two mission_critical vendors
      expect(result.highRiskCount).toBe(2); // Two vendors with critical or high risk_tier
    });
  });

  // ============================================
  // getRiskSummary
  // ============================================
  describe('getRiskSummary', () => {
    it('should count vendors by risk tier and criticality', async () => {
      const mockVendors = [
        { risk_tier: 'critical', criticality: 'mission_critical' },
        { risk_tier: 'critical', criticality: 'important' },
        { risk_tier: 'high', criticality: 'important' },
        { risk_tier: 'medium', criticality: 'standard' },
        { risk_tier: 'medium', criticality: 'standard' },
        { risk_tier: 'low', criticality: 'non_critical' },
      ];

      mockQuery
        .mockResolvedValueOnce({ rows: mockVendors })           // vendors query
        .mockResolvedValueOnce({ rows: [{ count: '3' }] });     // overdue reviews query

      const result = await vendorRiskService.getRiskSummary(tenantSlug);

      expect(result.total).toBe(6);
      expect(result.byRiskTier.critical).toBe(2);
      expect(result.byRiskTier.high).toBe(1);
      expect(result.byRiskTier.medium).toBe(2);
      expect(result.byRiskTier.low).toBe(1);
      expect(result.byCriticality.mission_critical).toBe(1);
      expect(result.byCriticality.important).toBe(2);
      expect(result.byCriticality.standard).toBe(2);
      expect(result.byCriticality.non_critical).toBe(1);
      expect(result.overdueReviews).toBe(3);
    });

    it('should return zero counts when no active vendors exist', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      const result = await vendorRiskService.getRiskSummary(tenantSlug);

      expect(result.total).toBe(0);
      expect(result.byRiskTier).toEqual({});
      expect(result.byCriticality).toEqual({});
      expect(result.overdueReviews).toBe(0);
    });

    it('should only count active vendors', async () => {
      // The query filters WHERE is_active = true — service verifies this is in the SQL
      mockQuery
        .mockResolvedValueOnce({ rows: [{ risk_tier: 'medium', criticality: 'standard' }] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      await vendorRiskService.getRiskSummary(tenantSlug);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE is_active = true')
      );
    });

    it('should default null criticality to standard in counts', async () => {
      const mockVendors = [
        { risk_tier: 'medium', criticality: null },
        { risk_tier: 'high', criticality: null },
      ];

      mockQuery
        .mockResolvedValueOnce({ rows: mockVendors })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      const result = await vendorRiskService.getRiskSummary(tenantSlug);

      expect(result.byCriticality.standard).toBe(2);
    });
  });

  // ============================================
  // getVendor — error path
  // ============================================
  describe('getVendor', () => {
    it('should throw NotFoundError for non-existent vendor', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        vendorRiskService.getVendor(tenantSlug, 'non-existent-id')
      ).rejects.toThrow(NotFoundError);
    });

    it('should return vendor when found', async () => {
      const mockVendor = { id: 'v-abc', name: 'Found Vendor', risk_tier: 'low', is_active: true };
      mockQuery.mockResolvedValueOnce({ rows: [mockVendor] });

      const result = await vendorRiskService.getVendor(tenantSlug, 'v-abc');

      expect(result.id).toBe('v-abc');
      expect(result.name).toBe('Found Vendor');
    });
  });

  // ============================================
  // listReviews
  // ============================================
  describe('listReviews', () => {
    it('should list all reviews when no vendorId provided', async () => {
      const mockReviews = [
        { id: 'r-1', vendor_id: 'v-1', review_type: 'contract', status: 'scheduled' },
        { id: 'r-2', vendor_id: 'v-2', review_type: 'annual_review', status: 'completed' },
      ];

      mockQuery.mockResolvedValueOnce({ rows: mockReviews });

      const result = await vendorRiskService.listReviews(tenantSlug);

      expect(result).toHaveLength(2);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.not.stringContaining('WHERE vr.vendor_id'),
        []
      );
    });

    it('should filter reviews by vendorId when provided', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await vendorRiskService.listReviews(tenantSlug, 'v-specific');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE vr.vendor_id = $1'),
        ['v-specific']
      );
    });
  });
});
