import { describe, it, expect, vi, afterEach } from 'vitest';

/**
 * Unit tests for Tenant Service
 * Testing multi-tenant schema management and tenant CRUD operations
 *
 * Key coverage areas:
 * - Tenant lookup by slug and ID with caching
 * - Tenant creation with schema cloning
 * - Tenant deletion with schema cleanup
 * - Schema name generation and sanitization
 * - Tenant settings management
 * - Schema validation for security
 */

// Mock dependencies
const mockQuery = vi.fn();
const mockClientQuery = vi.fn();
const mockRelease = vi.fn();
const mockConnect = vi.fn().mockResolvedValue({
  query: mockClientQuery,
  release: mockRelease,
});

vi.mock('../../../src/config/database.js', () => ({
  pool: {
    query: (...args: unknown[]) => mockQuery(...args),
    connect: () => mockConnect(),
  },
}));

// Mock cache service - bypass caching entirely
vi.mock('../../../src/utils/cache.js', () => ({
  cacheService: {
    getOrSet: vi.fn(async (_key: string, fetcher: () => Promise<unknown>) => fetcher()),
    invalidate: vi.fn().mockResolvedValue(undefined),
    invalidateTenant: vi.fn().mockResolvedValue(undefined),
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

vi.mock('pg-format', () => ({
  default: vi.fn((template: string, ...args: string[]) => {
    // Simple mock format implementation
    let result = template;
    args.forEach((arg, index) => {
      result = result.replace('%I', arg);
    });
    return result;
  }),
}));

vi.mock('bcrypt', () => ({
  hash: vi.fn().mockResolvedValue('hashed_password_123'),
}));

// Import after mocks
import { tenantService } from '../../../src/services/tenant.js';
import { cacheService } from '../../../src/utils/cache.js';
import { logger } from '../../../src/utils/logger.js';

const tenantSlug = 'acme-corp';
const tenantId = 'tenant-123';

describe('Tenant Service', () => {
  afterEach(() => {
    vi.clearAllMocks();
    mockQuery.mockReset();
    mockClientQuery.mockReset();
  });

  // ============================================
  // FIND BY SLUG
  // ============================================
  describe('findBySlug', () => {
    it('should find tenant by slug with caching', async () => {
      const tenant = {
        id: tenantId,
        name: 'Acme Corp',
        slug: tenantSlug,
        status: 'active',
        settings: {},
      };
      mockQuery.mockResolvedValueOnce({ rows: [tenant] });

      const result = await tenantService.findBySlug(tenantSlug);

      expect(result).toEqual(tenant);
      expect(cacheService.getOrSet).toHaveBeenCalledWith(
        `global:tenants:slug:${tenantSlug}`,
        expect.any(Function),
        { ttl: 600 }
      );
      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT * FROM tenants WHERE slug = $1',
        [tenantSlug]
      );
    });

    it('should return null when tenant not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await tenantService.findBySlug('nonexistent');

      expect(result).toBeNull();
    });
  });

  // ============================================
  // FIND BY ID
  // ============================================
  describe('findById', () => {
    it('should find tenant by ID with caching', async () => {
      const tenant = {
        id: tenantId,
        name: 'Acme Corp',
        slug: tenantSlug,
        status: 'active',
      };
      mockQuery.mockResolvedValueOnce({ rows: [tenant] });

      const result = await tenantService.findById(tenantId);

      expect(result).toEqual(tenant);
      expect(cacheService.getOrSet).toHaveBeenCalledWith(
        `global:tenants:id:${tenantId}`,
        expect.any(Function),
        { ttl: 600 }
      );
      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT * FROM tenants WHERE id = $1',
        [tenantId]
      );
    });

    it('should return null when tenant not found by ID', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await tenantService.findById('nonexistent');

      expect(result).toBeNull();
    });
  });

  // ============================================
  // CREATE TENANT
  // ============================================
  describe('create', () => {
    it('should create a tenant with schema and admin user', async () => {
      const newTenant = {
        id: tenantId,
        name: 'New Company',
        slug: 'new-company',
        status: 'active',
        plan_id: 'plan-123',
      };

      // Transaction sequence
      mockClientQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // Check existing slug
        .mockResolvedValueOnce({ rows: [{ id: 'starter-plan-id' }] }) // Default plan
        .mockResolvedValueOnce({ rows: [newTenant] }) // INSERT tenant
        .mockResolvedValueOnce({}) // CREATE SCHEMA
        .mockResolvedValueOnce({ rows: [{ tablename: 'users' }, { tablename: 'roles' }] }) // List tables
        .mockResolvedValueOnce({}) // CREATE TABLE users
        .mockResolvedValueOnce({}) // CREATE TABLE roles
        .mockResolvedValueOnce({}) // INSERT data users
        .mockResolvedValueOnce({}) // INSERT data roles
        .mockResolvedValueOnce({}) // CREATE FUNCTION next_id
        .mockResolvedValueOnce({}) // INSERT admin user
        .mockResolvedValueOnce({}) // INSERT user_roles
        .mockResolvedValueOnce({}); // COMMIT

      const result = await tenantService.create({
        name: 'New Company',
        slug: 'new-company',
        adminEmail: 'admin@newcompany.com',
        adminName: 'Admin User',
        adminPassword: 'SecurePass123!',
      });

      expect(result).toEqual(newTenant);
      expect(mockClientQuery).toHaveBeenCalledWith('BEGIN');
      expect(mockClientQuery).toHaveBeenCalledWith('COMMIT');
      expect(cacheService.invalidate).toHaveBeenCalledWith('cache:global:tenants:*');
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId, slug: 'new-company' }),
        'Tenant created'
      );
    });

    it('should throw ConflictError when slug already exists', async () => {
      mockClientQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 'existing-tenant' }] }); // Existing slug

      // Mock ROLLBACK
      mockClientQuery.mockResolvedValueOnce({});

      await expect(
        tenantService.create({
          name: 'Duplicate',
          slug: tenantSlug,
          adminEmail: 'admin@test.com',
          adminName: 'Admin',
          adminPassword: 'password',
        })
      ).rejects.toThrow(`Tenant with slug '${tenantSlug}' already exists`);

      expect(mockClientQuery).toHaveBeenCalledWith('ROLLBACK');
    });

    it('should use provided plan ID when specified', async () => {
      const customPlanId = 'custom-plan-123';

      mockClientQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // Check existing slug
        // No plan lookup when planId provided
        .mockResolvedValueOnce({ rows: [{ id: tenantId, plan_id: customPlanId }] }) // INSERT
        .mockResolvedValueOnce({}) // CREATE SCHEMA
        .mockResolvedValueOnce({ rows: [] }) // List tables - empty
        .mockResolvedValueOnce({}) // CREATE FUNCTION
        .mockResolvedValueOnce({}) // INSERT admin user
        .mockResolvedValueOnce({}) // INSERT user_roles
        .mockResolvedValueOnce({}); // COMMIT

      const result = await tenantService.create({
        name: 'Enterprise Corp',
        slug: 'enterprise-corp',
        planId: customPlanId,
        adminEmail: 'admin@enterprise.com',
        adminName: 'Enterprise Admin',
        adminPassword: 'EnterprisePass!',
      });

      // Result should have the custom plan ID
      expect(result.plan_id).toBe(customPlanId);
    });

    it('should rollback on error', async () => {
      mockClientQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // Check existing slug
        .mockRejectedValueOnce(new Error('Database error')); // Error on plan query

      mockClientQuery.mockResolvedValueOnce({}); // ROLLBACK

      await expect(
        tenantService.create({
          name: 'Failing Company',
          slug: 'failing-company',
          adminEmail: 'admin@fail.com',
          adminName: 'Admin',
          adminPassword: 'password',
        })
      ).rejects.toThrow('Database error');

      expect(mockClientQuery).toHaveBeenCalledWith('ROLLBACK');
      expect(mockRelease).toHaveBeenCalled();
    });
  });

  // ============================================
  // DELETE TENANT
  // ============================================
  describe('delete', () => {
    it('should delete tenant and schema', async () => {
      // findBySlug mock via pool.query
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: tenantId, slug: tenantSlug, name: 'Acme Corp' }],
      });

      mockClientQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({}) // DROP SCHEMA
        .mockResolvedValueOnce({}) // DELETE FROM tenants
        .mockResolvedValueOnce({}); // COMMIT

      await tenantService.delete(tenantSlug);

      expect(mockClientQuery).toHaveBeenCalledWith('BEGIN');
      expect(mockClientQuery).toHaveBeenCalledWith(
        expect.stringContaining('DROP SCHEMA IF EXISTS')
      );
      expect(mockClientQuery).toHaveBeenCalledWith(
        'DELETE FROM tenants WHERE slug = $1',
        [tenantSlug]
      );
      expect(mockClientQuery).toHaveBeenCalledWith('COMMIT');
      expect(cacheService.invalidate).toHaveBeenCalledWith('cache:global:tenants:*');
      expect(cacheService.invalidateTenant).toHaveBeenCalledWith(tenantSlug);
      expect(logger.info).toHaveBeenCalledWith({ slug: tenantSlug }, 'Tenant deleted');
    });

    it('should throw NotFoundError when tenant does not exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      mockClientQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({}); // ROLLBACK

      await expect(tenantService.delete('nonexistent')).rejects.toThrow('Tenant');
    });

    it('should rollback on deletion error', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: tenantId, slug: tenantSlug }],
      });

      mockClientQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockRejectedValueOnce(new Error('Schema drop failed')); // Error on DROP SCHEMA

      mockClientQuery.mockResolvedValueOnce({}); // ROLLBACK

      await expect(tenantService.delete(tenantSlug)).rejects.toThrow('Schema drop failed');

      expect(mockClientQuery).toHaveBeenCalledWith('ROLLBACK');
      expect(mockRelease).toHaveBeenCalled();
    });
  });

  // ============================================
  // SCHEMA NAME GENERATION
  // ============================================
  describe('getSchemaName', () => {
    it('should generate schema name from slug', () => {
      expect(tenantService.getSchemaName('acme-corp')).toBe('tenant_acme_corp');
    });

    it('should replace hyphens with underscores', () => {
      expect(tenantService.getSchemaName('my-cool-company')).toBe('tenant_my_cool_company');
    });

    it('should sanitize non-alphanumeric characters', () => {
      expect(tenantService.getSchemaName("test@company!#$%")).toBe('tenant_testcompany');
    });

    it('should handle mixed case', () => {
      expect(tenantService.getSchemaName('AcMe-CoRp')).toBe('tenant_AcMe_CoRp');
    });

    it('should handle slug with numbers', () => {
      expect(tenantService.getSchemaName('company-123')).toBe('tenant_company_123');
    });
  });

  // ============================================
  // VALIDATE AND GET SCHEMA
  // ============================================
  describe('validateAndGetSchema', () => {
    it('should return schema name when tenant and schema exist', async () => {
      // findBySlug
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: tenantId, slug: tenantSlug }],
      });
      // Schema exists check
      mockQuery.mockResolvedValueOnce({ rows: [{ exists: true }] });

      const schema = await tenantService.validateAndGetSchema(tenantSlug);

      expect(schema).toBe('tenant_acme_corp');
      expect(mockQuery).toHaveBeenNthCalledWith(
        2,
        'SELECT 1 FROM pg_namespace WHERE nspname = $1',
        ['tenant_acme_corp']
      );
    });

    it('should throw NotFoundError when tenant does not exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        tenantService.validateAndGetSchema('nonexistent')
      ).rejects.toThrow('Tenant');
    });

    it('should throw NotFoundError when schema does not exist', async () => {
      // findBySlug returns tenant
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: tenantId, slug: 'orphaned' }],
      });
      // Schema does not exist
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        tenantService.validateAndGetSchema('orphaned')
      ).rejects.toThrow('Tenant schema');

      expect(logger.error).toHaveBeenCalledWith(
        { slug: 'orphaned', schemaName: 'tenant_orphaned' },
        'Tenant exists in database but schema does not exist'
      );
    });
  });

  // ============================================
  // GET SETTINGS
  // ============================================
  describe('getSettings', () => {
    it('should return tenant and settings', async () => {
      const tenant = {
        id: tenantId,
        name: 'Acme Corp',
        slug: tenantSlug,
        plan_id: 'plan-123',
        status: 'active',
        settings: { theme: 'dark', language: 'en' },
        billing_email: 'billing@acme.com',
        trial_ends_at: new Date('2024-12-31'),
        created_at: new Date('2024-01-01'),
        updated_at: new Date('2024-06-01'),
      };

      mockQuery.mockResolvedValueOnce({ rows: [tenant] });

      const result = await tenantService.getSettings(tenantSlug);

      expect(result.tenant).toEqual(tenant);
      expect(result.settings).toEqual({ theme: 'dark', language: 'en' });
    });

    it('should return empty settings when null', async () => {
      const tenant = {
        id: tenantId,
        name: 'Acme Corp',
        slug: tenantSlug,
        settings: null,
      };

      mockQuery.mockResolvedValueOnce({ rows: [tenant] });

      const result = await tenantService.getSettings(tenantSlug);

      expect(result.settings).toEqual({});
    });

    it('should throw NotFoundError when tenant does not exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        tenantService.getSettings('nonexistent')
      ).rejects.toThrow('Tenant');
    });
  });

  // ============================================
  // UPDATE SETTINGS
  // ============================================
  describe('updateSettings', () => {
    it('should update tenant name', async () => {
      const existingTenant = {
        id: tenantId,
        name: 'Old Name',
        slug: tenantSlug,
        settings: {},
      };
      const updatedTenant = { ...existingTenant, name: 'New Name' };

      // findBySlug
      mockQuery.mockResolvedValueOnce({ rows: [existingTenant] });
      // UPDATE
      mockQuery.mockResolvedValueOnce({ rows: [updatedTenant] });

      const result = await tenantService.updateSettings(tenantSlug, { name: 'New Name' });

      expect(result.name).toBe('New Name');
      expect(mockQuery).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('UPDATE tenants SET'),
        expect.arrayContaining(['New Name', tenantSlug])
      );
      expect(cacheService.invalidate).toHaveBeenCalledWith('cache:global:tenants:*');
    });

    it('should update billing email', async () => {
      const existingTenant = {
        id: tenantId,
        slug: tenantSlug,
        billing_email: 'old@acme.com',
      };
      const updatedTenant = { ...existingTenant, billing_email: 'new@acme.com' };

      mockQuery.mockResolvedValueOnce({ rows: [existingTenant] });
      mockQuery.mockResolvedValueOnce({ rows: [updatedTenant] });

      const result = await tenantService.updateSettings(tenantSlug, {
        billingEmail: 'new@acme.com',
      });

      expect(result.billing_email).toBe('new@acme.com');
    });

    it('should merge settings with existing settings', async () => {
      const existingTenant = {
        id: tenantId,
        slug: tenantSlug,
        settings: { theme: 'light', language: 'en' },
      };
      const updatedTenant = {
        ...existingTenant,
        settings: { theme: 'dark', language: 'en' },
      };

      mockQuery.mockResolvedValueOnce({ rows: [existingTenant] });
      mockQuery.mockResolvedValueOnce({ rows: [updatedTenant] });

      await tenantService.updateSettings(tenantSlug, {
        settings: { theme: 'dark' },
      });

      // Verify merged settings were passed
      expect(mockQuery).toHaveBeenNthCalledWith(
        2,
        expect.any(String),
        expect.arrayContaining([JSON.stringify({ theme: 'dark', language: 'en' })])
      );
    });

    it('should update multiple fields at once', async () => {
      const existingTenant = {
        id: tenantId,
        name: 'Old Name',
        slug: tenantSlug,
        billing_email: 'old@acme.com',
        settings: {},
      };

      mockQuery.mockResolvedValueOnce({ rows: [existingTenant] });
      mockQuery.mockResolvedValueOnce({
        rows: [{
          ...existingTenant,
          name: 'New Name',
          billing_email: 'new@acme.com',
        }],
      });

      const result = await tenantService.updateSettings(tenantSlug, {
        name: 'New Name',
        billingEmail: 'new@acme.com',
      });

      expect(result.name).toBe('New Name');
      expect(result.billing_email).toBe('new@acme.com');
      expect(logger.info).toHaveBeenCalledWith({ slug: tenantSlug }, 'Tenant settings updated');
    });

    it('should throw NotFoundError when tenant does not exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        tenantService.updateSettings('nonexistent', { name: 'Test' })
      ).rejects.toThrow('Tenant');
    });
  });

  // ============================================
  // SQL INJECTION PREVENTION
  // ============================================
  describe('SQL injection prevention', () => {
    it('should use parameterized queries for findBySlug', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await tenantService.findBySlug("'; DROP TABLE tenants; --");

      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT * FROM tenants WHERE slug = $1',
        ["'; DROP TABLE tenants; --"]
      );
    });

    it('should sanitize schema names to prevent injection', () => {
      // SQL injection attempt in slug
      const maliciousSlug = "'; DROP SCHEMA public CASCADE; --";
      const sanitized = tenantService.getSchemaName(maliciousSlug);

      // Should only contain alphanumeric and underscores - special chars are stripped
      expect(sanitized).not.toContain(';');
      expect(sanitized).not.toContain("'");
      expect(sanitized).not.toContain('--');
      expect(sanitized).toMatch(/^tenant_[a-zA-Z0-9_]+$/);
    });
  });

  // ============================================
  // CACHE INVALIDATION
  // ============================================
  describe('cache invalidation', () => {
    it('should invalidate global tenant cache on create', async () => {
      mockClientQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // Check slug
        .mockResolvedValueOnce({ rows: [{ id: 'plan-id' }] }) // Plan
        .mockResolvedValueOnce({ rows: [{ id: tenantId }] }) // INSERT
        .mockResolvedValueOnce({}) // CREATE SCHEMA
        .mockResolvedValueOnce({ rows: [] }) // Tables
        .mockResolvedValueOnce({}) // Function
        .mockResolvedValueOnce({}) // Admin user
        .mockResolvedValueOnce({}) // User role
        .mockResolvedValueOnce({}); // COMMIT

      await tenantService.create({
        name: 'Test',
        slug: 'test-tenant',
        adminEmail: 'admin@test.com',
        adminName: 'Admin',
        adminPassword: 'password',
      });

      expect(cacheService.invalidate).toHaveBeenCalledWith('cache:global:tenants:*');
    });

    it('should invalidate both global and tenant cache on delete', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: tenantId, slug: tenantSlug }] });

      mockClientQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({}) // DROP SCHEMA
        .mockResolvedValueOnce({}) // DELETE
        .mockResolvedValueOnce({}); // COMMIT

      await tenantService.delete(tenantSlug);

      expect(cacheService.invalidate).toHaveBeenCalledWith('cache:global:tenants:*');
      expect(cacheService.invalidateTenant).toHaveBeenCalledWith(tenantSlug);
    });

    it('should invalidate tenant cache on settings update', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: tenantId, slug: tenantSlug }] })
        .mockResolvedValueOnce({ rows: [{ id: tenantId, name: 'Updated' }] });

      await tenantService.updateSettings(tenantSlug, { name: 'Updated' });

      expect(cacheService.invalidate).toHaveBeenCalledWith('cache:global:tenants:*');
    });
  });
});
