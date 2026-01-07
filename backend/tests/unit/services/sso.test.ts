import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
vi.mock('../../../src/config/database.js', () => ({
  pool: {
    query: vi.fn(),
  },
}));

vi.mock('../../../src/services/tenant.js', () => ({
  tenantService: {
    findBySlug: vi.fn(),
    getSchemaName: vi.fn((slug: string) => `tenant_${slug.replace(/-/g, '_')}`),
  },
}));

vi.mock('../../../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('SSOService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('extractUserAttributes', () => {
    it('should extract email from flat attributes', async () => {
      const { ssoService } = await import('../../../src/services/sso/index.js');

      const attributes = {
        email: 'john@example.com',
      };

      const mappings = {
        email: 'email',
      };

      const result = ssoService.extractUserAttributes(attributes, mappings);

      expect(result.email).toBe('john@example.com');
    });

    it('should extract first and last name', async () => {
      const { ssoService } = await import('../../../src/services/sso/index.js');

      const attributes = {
        firstName: 'John',
        lastName: 'Doe',
      };

      const mappings = {
        firstName: 'firstName',
        lastName: 'lastName',
      };

      const result = ssoService.extractUserAttributes(attributes, mappings);

      expect(result.firstName).toBe('John');
      expect(result.lastName).toBe('Doe');
    });

    it('should extract display name', async () => {
      const { ssoService } = await import('../../../src/services/sso/index.js');

      const attributes = {
        name: 'John Doe',
      };

      const mappings = {
        displayName: 'name',
      };

      const result = ssoService.extractUserAttributes(attributes, mappings);

      expect(result.displayName).toBe('John Doe');
    });

    it('should extract nested attributes with dot notation', async () => {
      const { ssoService } = await import('../../../src/services/sso/index.js');

      const attributes = {
        user: {
          profile: {
            email: 'john@example.com',
          },
        },
      };

      const mappings = {
        email: 'user.profile.email',
      };

      const result = ssoService.extractUserAttributes(attributes, mappings);

      expect(result.email).toBe('john@example.com');
    });

    it('should handle deeply nested paths', async () => {
      const { ssoService } = await import('../../../src/services/sso/index.js');

      const attributes = {
        claims: {
          identity: {
            user: {
              name: {
                first: 'John',
              },
            },
          },
        },
      };

      const mappings = {
        firstName: 'claims.identity.user.name.first',
      };

      const result = ssoService.extractUserAttributes(attributes, mappings);

      expect(result.firstName).toBe('John');
    });

    it('should return undefined for missing nested paths', async () => {
      const { ssoService } = await import('../../../src/services/sso/index.js');

      const attributes = {
        user: {},
      };

      const mappings = {
        email: 'user.profile.email',
      };

      const result = ssoService.extractUserAttributes(attributes, mappings);

      expect(result.email).toBeUndefined();
    });

    it('should handle null in nested path', async () => {
      const { ssoService } = await import('../../../src/services/sso/index.js');

      const attributes = {
        user: null,
      };

      const mappings = {
        email: 'user.email',
      };

      const result = ssoService.extractUserAttributes(attributes, mappings);

      expect(result.email).toBeUndefined();
    });

    it('should extract groups as array', async () => {
      const { ssoService } = await import('../../../src/services/sso/index.js');

      const attributes = {
        memberOf: ['IT Support', 'Admins', 'Developers'],
      };

      const mappings = {
        groups: 'memberOf',
      };

      const result = ssoService.extractUserAttributes(attributes, mappings);

      expect(result.groups).toEqual(['IT Support', 'Admins', 'Developers']);
    });

    it('should convert single group to array', async () => {
      const { ssoService } = await import('../../../src/services/sso/index.js');

      const attributes = {
        group: 'IT Support',
      };

      const mappings = {
        groups: 'group',
      };

      const result = ssoService.extractUserAttributes(attributes, mappings);

      expect(result.groups).toEqual(['IT Support']);
    });

    it('should extract roles as array', async () => {
      const { ssoService } = await import('../../../src/services/sso/index.js');

      const attributes = {
        userRoles: ['admin', 'editor'],
      };

      const mappings = {
        roles: 'userRoles',
      };

      const result = ssoService.extractUserAttributes(attributes, mappings);

      expect(result.roles).toEqual(['admin', 'editor']);
    });

    it('should convert single role to array', async () => {
      const { ssoService } = await import('../../../src/services/sso/index.js');

      const attributes = {
        role: 'admin',
      };

      const mappings = {
        roles: 'role',
      };

      const result = ssoService.extractUserAttributes(attributes, mappings);

      expect(result.roles).toEqual(['admin']);
    });

    it('should filter out falsy values from groups', async () => {
      const { ssoService } = await import('../../../src/services/sso/index.js');

      const attributes = {
        group: null,
      };

      const mappings = {
        groups: 'group',
      };

      const result = ssoService.extractUserAttributes(attributes, mappings);

      expect(result.groups).toEqual([]);
    });

    it('should extract multiple attributes at once', async () => {
      const { ssoService } = await import('../../../src/services/sso/index.js');

      const attributes = {
        emailAddress: 'john@example.com',
        givenName: 'John',
        surname: 'Doe',
        displayName: 'John Doe',
        groups: ['IT', 'Support'],
        roles: ['admin'],
      };

      const mappings = {
        email: 'emailAddress',
        firstName: 'givenName',
        lastName: 'surname',
        displayName: 'displayName',
        groups: 'groups',
        roles: 'roles',
      };

      const result = ssoService.extractUserAttributes(attributes, mappings);

      expect(result).toEqual({
        email: 'john@example.com',
        firstName: 'John',
        lastName: 'Doe',
        displayName: 'John Doe',
        groups: ['IT', 'Support'],
        roles: ['admin'],
      });
    });

    it('should handle simplified SAML-style attribute keys', async () => {
      const { ssoService } = await import('../../../src/services/sso/index.js');

      // SAML attributes often need pre-processing to simplified keys
      // because the implementation uses dot-notation for nested access
      const attributes = {
        emailaddress: 'john@example.com',
        givenname: 'John',
        surname: 'Doe',
      };

      const mappings = {
        email: 'emailaddress',
        firstName: 'givenname',
        lastName: 'surname',
      };

      const result = ssoService.extractUserAttributes(attributes, mappings);

      expect(result.email).toBe('john@example.com');
      expect(result.firstName).toBe('John');
      expect(result.lastName).toBe('Doe');
    });

    it('should handle empty mappings', async () => {
      const { ssoService } = await import('../../../src/services/sso/index.js');

      const attributes = {
        email: 'john@example.com',
      };

      const mappings = {};

      const result = ssoService.extractUserAttributes(attributes, mappings);

      expect(result).toEqual({});
    });

    it('should handle empty attributes', async () => {
      const { ssoService } = await import('../../../src/services/sso/index.js');

      const attributes = {};

      const mappings = {
        email: 'email',
        firstName: 'firstName',
      };

      const result = ssoService.extractUserAttributes(attributes, mappings);

      expect(result.email).toBeUndefined();
      expect(result.firstName).toBeUndefined();
    });
  });

  describe('getProviderById', () => {
    it('should return provider when found', async () => {
      const { pool } = await import('../../../src/config/database.js');
      const { tenantService } = await import('../../../src/services/tenant.js');
      const { ssoService } = await import('../../../src/services/sso/index.js');

      vi.mocked(tenantService.findBySlug).mockResolvedValue({
        id: 'tenant-1',
        slug: 'test-company',
        name: 'Test Company',
        schemaName: 'tenant_test-company',
      });

      vi.mocked(pool.query).mockResolvedValue({
        rows: [{
          id: 'provider-1',
          name: 'Okta',
          provider_type: 'oidc',
          provider_name: 'okta',
          enabled: true,
          is_default: true,
          configuration: { clientId: 'xxx' },
          attribute_mappings: { email: 'email' },
          jit_provisioning: true,
          auto_create_users: true,
          default_role: 'requester',
          require_verified_email: true,
          created_at: new Date(),
          updated_at: new Date(),
        }],
        rowCount: 1,
      } as any);

      const result = await ssoService.getProviderById('test-company', 'provider-1');

      expect(result).not.toBeNull();
      expect(result?.id).toBe('provider-1');
      expect(result?.name).toBe('Okta');
      expect(result?.providerType).toBe('oidc');
    });

    it('should return null when provider not found', async () => {
      const { pool } = await import('../../../src/config/database.js');
      const { tenantService } = await import('../../../src/services/tenant.js');
      const { ssoService } = await import('../../../src/services/sso/index.js');

      vi.mocked(tenantService.findBySlug).mockResolvedValue({
        id: 'tenant-1',
        slug: 'test-company',
        name: 'Test Company',
        schemaName: 'tenant_test-company',
      });

      vi.mocked(pool.query).mockResolvedValue({
        rows: [],
        rowCount: 0,
      } as any);

      const result = await ssoService.getProviderById('test-company', 'nonexistent');

      expect(result).toBeNull();
    });

    it('should throw NotFoundError when tenant not found', async () => {
      const { tenantService } = await import('../../../src/services/tenant.js');
      const { ssoService } = await import('../../../src/services/sso/index.js');

      vi.mocked(tenantService.findBySlug).mockResolvedValue(null);

      await expect(ssoService.getProviderById('nonexistent', 'provider-1'))
        .rejects.toThrow('Tenant');
    });
  });

  describe('listProviders', () => {
    it('should return all providers for tenant', async () => {
      const { pool } = await import('../../../src/config/database.js');
      const { tenantService } = await import('../../../src/services/tenant.js');
      const { ssoService } = await import('../../../src/services/sso/index.js');

      vi.mocked(tenantService.findBySlug).mockResolvedValue({
        id: 'tenant-1',
        slug: 'test-company',
        name: 'Test Company',
        schemaName: 'tenant_test-company',
      });

      vi.mocked(pool.query).mockResolvedValue({
        rows: [
          {
            id: 'provider-1',
            name: 'Okta',
            provider_type: 'oidc',
            provider_name: 'okta',
            enabled: true,
            is_default: true,
            configuration: {},
            attribute_mappings: {},
            jit_provisioning: true,
            auto_create_users: true,
            default_role: 'requester',
            require_verified_email: true,
          },
          {
            id: 'provider-2',
            name: 'Azure AD',
            provider_type: 'saml',
            provider_name: 'azure',
            enabled: true,
            is_default: false,
            configuration: {},
            attribute_mappings: {},
            jit_provisioning: true,
            auto_create_users: true,
            default_role: 'agent',
            require_verified_email: true,
          },
        ],
        rowCount: 2,
      } as any);

      const result = await ssoService.listProviders('test-company');

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Okta');
      expect(result[1].name).toBe('Azure AD');
    });

    it('should return empty array when no providers', async () => {
      const { pool } = await import('../../../src/config/database.js');
      const { tenantService } = await import('../../../src/services/tenant.js');
      const { ssoService } = await import('../../../src/services/sso/index.js');

      vi.mocked(tenantService.findBySlug).mockResolvedValue({
        id: 'tenant-1',
        slug: 'test-company',
        name: 'Test Company',
        schemaName: 'tenant_test-company',
      });

      vi.mocked(pool.query).mockResolvedValue({
        rows: [],
        rowCount: 0,
      } as any);

      const result = await ssoService.listProviders('test-company');

      expect(result).toEqual([]);
    });
  });

  describe('getDefaultProvider', () => {
    it('should return default provider when found', async () => {
      const { pool } = await import('../../../src/config/database.js');
      const { tenantService } = await import('../../../src/services/tenant.js');
      const { ssoService } = await import('../../../src/services/sso/index.js');

      vi.mocked(tenantService.findBySlug).mockResolvedValue({
        id: 'tenant-1',
        slug: 'test-company',
        name: 'Test Company',
        schemaName: 'tenant_test-company',
      });

      vi.mocked(pool.query).mockResolvedValue({
        rows: [{
          id: 'provider-1',
          name: 'Okta',
          provider_type: 'oidc',
          provider_name: 'okta',
          enabled: true,
          is_default: true,
          configuration: { clientId: 'xxx' },
          attribute_mappings: { email: 'email' },
          jit_provisioning: true,
          auto_create_users: true,
          default_role: 'requester',
          require_verified_email: true,
          created_at: new Date(),
          updated_at: new Date(),
        }],
        rowCount: 1,
      } as any);

      const result = await ssoService.getDefaultProvider('test-company');

      expect(result).not.toBeNull();
      expect(result?.id).toBe('provider-1');
      expect(result?.isDefault).toBe(true);
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('enabled = true AND is_default = true'),
      );
    });

    it('should return null when no default provider exists', async () => {
      const { pool } = await import('../../../src/config/database.js');
      const { tenantService } = await import('../../../src/services/tenant.js');
      const { ssoService } = await import('../../../src/services/sso/index.js');

      vi.mocked(tenantService.findBySlug).mockResolvedValue({
        id: 'tenant-1',
        slug: 'test-company',
        name: 'Test Company',
        schemaName: 'tenant_test-company',
      });

      vi.mocked(pool.query).mockResolvedValue({
        rows: [],
        rowCount: 0,
      } as any);

      const result = await ssoService.getDefaultProvider('test-company');

      expect(result).toBeNull();
    });

    it('should throw NotFoundError when tenant not found', async () => {
      const { tenantService } = await import('../../../src/services/tenant.js');
      const { ssoService } = await import('../../../src/services/sso/index.js');

      vi.mocked(tenantService.findBySlug).mockResolvedValue(null);

      await expect(ssoService.getDefaultProvider('nonexistent'))
        .rejects.toThrow('Tenant');
    });
  });

  describe('createProvider', () => {
    it('should create provider with all fields', async () => {
      const { pool } = await import('../../../src/config/database.js');
      const { tenantService } = await import('../../../src/services/tenant.js');
      const { ssoService } = await import('../../../src/services/sso/index.js');

      vi.mocked(tenantService.findBySlug).mockResolvedValue({
        id: 'tenant-1',
        slug: 'test-company',
        name: 'Test Company',
        schemaName: 'tenant_test-company',
      });

      const createdAt = new Date();
      vi.mocked(pool.query).mockResolvedValue({
        rows: [{
          id: 'provider-1',
          name: 'Okta',
          provider_type: 'oidc',
          provider_name: 'okta',
          enabled: true,
          is_default: false,
          configuration: { clientId: 'client-123', clientSecret: 'secret' },
          attribute_mappings: { email: 'email', firstName: 'given_name' },
          jit_provisioning: true,
          auto_create_users: true,
          default_role: 'agent',
          require_verified_email: true,
          created_at: createdAt,
          updated_at: createdAt,
        }],
        rowCount: 1,
      } as any);

      const result = await ssoService.createProvider(
        'test-company',
        {
          name: 'Okta',
          providerType: 'oidc',
          providerName: 'okta',
          enabled: true,
          isDefault: false,
          configuration: { clientId: 'client-123', clientSecret: 'secret' },
          attributeMappings: { email: 'email', firstName: 'given_name' },
          jitProvisioning: true,
          autoCreateUsers: true,
          defaultRole: 'agent',
          requireVerifiedEmail: true,
        },
        'user-1'
      );

      expect(result.id).toBe('provider-1');
      expect(result.name).toBe('Okta');
      expect(result.providerType).toBe('oidc');
      expect(result.defaultRole).toBe('agent');
    });

    it('should use default values for optional fields', async () => {
      const { pool } = await import('../../../src/config/database.js');
      const { tenantService } = await import('../../../src/services/tenant.js');
      const { ssoService } = await import('../../../src/services/sso/index.js');

      vi.mocked(tenantService.findBySlug).mockResolvedValue({
        id: 'tenant-1',
        slug: 'test-company',
        name: 'Test Company',
        schemaName: 'tenant_test-company',
      });

      vi.mocked(pool.query).mockResolvedValue({
        rows: [{
          id: 'provider-1',
          name: 'Azure AD',
          provider_type: 'saml',
          provider_name: 'azure',
          enabled: true,
          is_default: false,
          configuration: {},
          attribute_mappings: {},
          jit_provisioning: true,
          auto_create_users: true,
          default_role: 'requester',
          require_verified_email: true,
          created_at: new Date(),
          updated_at: new Date(),
        }],
        rowCount: 1,
      } as any);

      await ssoService.createProvider(
        'test-company',
        {
          name: 'Azure AD',
          providerType: 'saml',
          providerName: 'azure',
          configuration: {},
          attributeMappings: {},
        },
        'user-1'
      );

      // Verify defaults were passed
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO'),
        expect.arrayContaining([
          'Azure AD',           // name
          'saml',               // provider_type
          'azure',              // provider_name
          true,                 // enabled (default)
          false,                // is_default (default)
          expect.any(String),   // configuration JSON
          expect.any(String),   // attribute_mappings JSON
          true,                 // jit_provisioning (default)
          true,                 // auto_create_users (default)
          'requester',          // default_role (default)
          true,                 // require_verified_email (default)
          'user-1',             // created_by
        ])
      );
    });

    it('should throw NotFoundError when tenant not found', async () => {
      const { tenantService } = await import('../../../src/services/tenant.js');
      const { ssoService } = await import('../../../src/services/sso/index.js');

      vi.mocked(tenantService.findBySlug).mockResolvedValue(null);

      await expect(ssoService.createProvider(
        'nonexistent',
        { name: 'Test', providerType: 'oidc', providerName: 'test' },
        'user-1'
      )).rejects.toThrow('Tenant');
    });
  });

  describe('updateProvider', () => {
    it('should update provider name', async () => {
      const { pool } = await import('../../../src/config/database.js');
      const { tenantService } = await import('../../../src/services/tenant.js');
      const { ssoService } = await import('../../../src/services/sso/index.js');

      vi.mocked(tenantService.findBySlug).mockResolvedValue({
        id: 'tenant-1',
        slug: 'test-company',
        name: 'Test Company',
        schemaName: 'tenant_test-company',
      });

      vi.mocked(pool.query).mockResolvedValue({
        rows: [{
          id: 'provider-1',
          name: 'Updated Okta',
          provider_type: 'oidc',
          provider_name: 'okta',
          enabled: true,
          is_default: true,
          configuration: {},
          attribute_mappings: {},
          jit_provisioning: true,
          auto_create_users: true,
          default_role: 'requester',
          require_verified_email: true,
          created_at: new Date(),
          updated_at: new Date(),
        }],
        rowCount: 1,
      } as any);

      const result = await ssoService.updateProvider(
        'test-company',
        'provider-1',
        { name: 'Updated Okta' }
      );

      expect(result.name).toBe('Updated Okta');
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('name = $1'),
        expect.arrayContaining(['Updated Okta', 'provider-1'])
      );
    });

    it('should update enabled status', async () => {
      const { pool } = await import('../../../src/config/database.js');
      const { tenantService } = await import('../../../src/services/tenant.js');
      const { ssoService } = await import('../../../src/services/sso/index.js');

      vi.mocked(tenantService.findBySlug).mockResolvedValue({
        id: 'tenant-1',
        slug: 'test-company',
        name: 'Test Company',
        schemaName: 'tenant_test-company',
      });

      vi.mocked(pool.query).mockResolvedValue({
        rows: [{
          id: 'provider-1',
          name: 'Okta',
          provider_type: 'oidc',
          provider_name: 'okta',
          enabled: false,
          is_default: true,
          configuration: {},
          attribute_mappings: {},
          jit_provisioning: true,
          auto_create_users: true,
          default_role: 'requester',
          require_verified_email: true,
          created_at: new Date(),
          updated_at: new Date(),
        }],
        rowCount: 1,
      } as any);

      const result = await ssoService.updateProvider(
        'test-company',
        'provider-1',
        { enabled: false }
      );

      expect(result.enabled).toBe(false);
    });

    it('should update isDefault status', async () => {
      const { pool } = await import('../../../src/config/database.js');
      const { tenantService } = await import('../../../src/services/tenant.js');
      const { ssoService } = await import('../../../src/services/sso/index.js');

      vi.mocked(tenantService.findBySlug).mockResolvedValue({
        id: 'tenant-1',
        slug: 'test-company',
        name: 'Test Company',
        schemaName: 'tenant_test-company',
      });

      vi.mocked(pool.query).mockResolvedValue({
        rows: [{
          id: 'provider-1',
          name: 'Okta',
          provider_type: 'oidc',
          provider_name: 'okta',
          enabled: true,
          is_default: true,
          configuration: {},
          attribute_mappings: {},
          jit_provisioning: true,
          auto_create_users: true,
          default_role: 'requester',
          require_verified_email: true,
          created_at: new Date(),
          updated_at: new Date(),
        }],
        rowCount: 1,
      } as any);

      const result = await ssoService.updateProvider(
        'test-company',
        'provider-1',
        { isDefault: true }
      );

      expect(result.isDefault).toBe(true);
    });

    it('should update configuration', async () => {
      const { pool } = await import('../../../src/config/database.js');
      const { tenantService } = await import('../../../src/services/tenant.js');
      const { ssoService } = await import('../../../src/services/sso/index.js');

      vi.mocked(tenantService.findBySlug).mockResolvedValue({
        id: 'tenant-1',
        slug: 'test-company',
        name: 'Test Company',
        schemaName: 'tenant_test-company',
      });

      vi.mocked(pool.query).mockResolvedValue({
        rows: [{
          id: 'provider-1',
          name: 'Okta',
          provider_type: 'oidc',
          provider_name: 'okta',
          enabled: true,
          is_default: true,
          configuration: { clientId: 'new-client', clientSecret: 'new-secret' },
          attribute_mappings: {},
          jit_provisioning: true,
          auto_create_users: true,
          default_role: 'requester',
          require_verified_email: true,
          created_at: new Date(),
          updated_at: new Date(),
        }],
        rowCount: 1,
      } as any);

      await ssoService.updateProvider(
        'test-company',
        'provider-1',
        { configuration: { clientId: 'new-client', clientSecret: 'new-secret' } }
      );

      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('configuration = $1'),
        expect.arrayContaining([
          JSON.stringify({ clientId: 'new-client', clientSecret: 'new-secret' }),
          'provider-1',
        ])
      );
    });

    it('should update attribute mappings', async () => {
      const { pool } = await import('../../../src/config/database.js');
      const { tenantService } = await import('../../../src/services/tenant.js');
      const { ssoService } = await import('../../../src/services/sso/index.js');

      vi.mocked(tenantService.findBySlug).mockResolvedValue({
        id: 'tenant-1',
        slug: 'test-company',
        name: 'Test Company',
        schemaName: 'tenant_test-company',
      });

      vi.mocked(pool.query).mockResolvedValue({
        rows: [{
          id: 'provider-1',
          name: 'Okta',
          provider_type: 'oidc',
          provider_name: 'okta',
          enabled: true,
          is_default: true,
          configuration: {},
          attribute_mappings: { email: 'user.email', firstName: 'user.firstName' },
          jit_provisioning: true,
          auto_create_users: true,
          default_role: 'requester',
          require_verified_email: true,
          created_at: new Date(),
          updated_at: new Date(),
        }],
        rowCount: 1,
      } as any);

      await ssoService.updateProvider(
        'test-company',
        'provider-1',
        { attributeMappings: { email: 'user.email', firstName: 'user.firstName' } }
      );

      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('attribute_mappings = $1'),
        expect.any(Array)
      );
    });

    it('should update jitProvisioning', async () => {
      const { pool } = await import('../../../src/config/database.js');
      const { tenantService } = await import('../../../src/services/tenant.js');
      const { ssoService } = await import('../../../src/services/sso/index.js');

      vi.mocked(tenantService.findBySlug).mockResolvedValue({
        id: 'tenant-1',
        slug: 'test-company',
        name: 'Test Company',
        schemaName: 'tenant_test-company',
      });

      vi.mocked(pool.query).mockResolvedValue({
        rows: [{
          id: 'provider-1',
          name: 'Okta',
          provider_type: 'oidc',
          provider_name: 'okta',
          enabled: true,
          is_default: true,
          configuration: {},
          attribute_mappings: {},
          jit_provisioning: false,
          auto_create_users: true,
          default_role: 'requester',
          require_verified_email: true,
          created_at: new Date(),
          updated_at: new Date(),
        }],
        rowCount: 1,
      } as any);

      const result = await ssoService.updateProvider(
        'test-company',
        'provider-1',
        { jitProvisioning: false }
      );

      expect(result.jitProvisioning).toBe(false);
    });

    it('should update autoCreateUsers', async () => {
      const { pool } = await import('../../../src/config/database.js');
      const { tenantService } = await import('../../../src/services/tenant.js');
      const { ssoService } = await import('../../../src/services/sso/index.js');

      vi.mocked(tenantService.findBySlug).mockResolvedValue({
        id: 'tenant-1',
        slug: 'test-company',
        name: 'Test Company',
        schemaName: 'tenant_test-company',
      });

      vi.mocked(pool.query).mockResolvedValue({
        rows: [{
          id: 'provider-1',
          name: 'Okta',
          provider_type: 'oidc',
          provider_name: 'okta',
          enabled: true,
          is_default: true,
          configuration: {},
          attribute_mappings: {},
          jit_provisioning: true,
          auto_create_users: false,
          default_role: 'requester',
          require_verified_email: true,
          created_at: new Date(),
          updated_at: new Date(),
        }],
        rowCount: 1,
      } as any);

      const result = await ssoService.updateProvider(
        'test-company',
        'provider-1',
        { autoCreateUsers: false }
      );

      expect(result.autoCreateUsers).toBe(false);
    });

    it('should update multiple fields at once', async () => {
      const { pool } = await import('../../../src/config/database.js');
      const { tenantService } = await import('../../../src/services/tenant.js');
      const { ssoService } = await import('../../../src/services/sso/index.js');

      vi.mocked(tenantService.findBySlug).mockResolvedValue({
        id: 'tenant-1',
        slug: 'test-company',
        name: 'Test Company',
        schemaName: 'tenant_test-company',
      });

      vi.mocked(pool.query).mockResolvedValue({
        rows: [{
          id: 'provider-1',
          name: 'New Name',
          provider_type: 'oidc',
          provider_name: 'okta',
          enabled: false,
          is_default: true,
          configuration: { newConfig: true },
          attribute_mappings: {},
          jit_provisioning: false,
          auto_create_users: false,
          default_role: 'requester',
          require_verified_email: true,
          created_at: new Date(),
          updated_at: new Date(),
        }],
        rowCount: 1,
      } as any);

      const result = await ssoService.updateProvider(
        'test-company',
        'provider-1',
        {
          name: 'New Name',
          enabled: false,
          isDefault: true,
          configuration: { newConfig: true },
          jitProvisioning: false,
          autoCreateUsers: false,
        }
      );

      expect(result.name).toBe('New Name');
      expect(result.enabled).toBe(false);
      expect(result.isDefault).toBe(true);
      expect(result.jitProvisioning).toBe(false);
      expect(result.autoCreateUsers).toBe(false);
    });

    it('should throw BadRequestError when no fields to update', async () => {
      const { tenantService } = await import('../../../src/services/tenant.js');
      const { ssoService } = await import('../../../src/services/sso/index.js');

      vi.mocked(tenantService.findBySlug).mockResolvedValue({
        id: 'tenant-1',
        slug: 'test-company',
        name: 'Test Company',
        schemaName: 'tenant_test-company',
      });

      await expect(ssoService.updateProvider(
        'test-company',
        'provider-1',
        {}
      )).rejects.toThrow('No fields to update');
    });

    it('should throw NotFoundError when provider not found', async () => {
      const { pool } = await import('../../../src/config/database.js');
      const { tenantService } = await import('../../../src/services/tenant.js');
      const { ssoService } = await import('../../../src/services/sso/index.js');

      vi.mocked(tenantService.findBySlug).mockResolvedValue({
        id: 'tenant-1',
        slug: 'test-company',
        name: 'Test Company',
        schemaName: 'tenant_test-company',
      });

      vi.mocked(pool.query).mockResolvedValue({
        rows: [],
        rowCount: 0,
      } as any);

      await expect(ssoService.updateProvider(
        'test-company',
        'nonexistent',
        { name: 'New Name' }
      )).rejects.toThrow('SSO Provider');
    });

    it('should throw NotFoundError when tenant not found', async () => {
      const { tenantService } = await import('../../../src/services/tenant.js');
      const { ssoService } = await import('../../../src/services/sso/index.js');

      vi.mocked(tenantService.findBySlug).mockResolvedValue(null);

      await expect(ssoService.updateProvider(
        'nonexistent',
        'provider-1',
        { name: 'New Name' }
      )).rejects.toThrow('Tenant');
    });
  });

  describe('deleteProvider', () => {
    it('should delete provider successfully', async () => {
      const { pool } = await import('../../../src/config/database.js');
      const { tenantService } = await import('../../../src/services/tenant.js');
      const { ssoService } = await import('../../../src/services/sso/index.js');

      vi.mocked(tenantService.findBySlug).mockResolvedValue({
        id: 'tenant-1',
        slug: 'test-company',
        name: 'Test Company',
        schemaName: 'tenant_test-company',
      });

      vi.mocked(pool.query).mockResolvedValue({
        rows: [],
        rowCount: 1,
      } as any);

      await expect(ssoService.deleteProvider('test-company', 'provider-1'))
        .resolves.not.toThrow();
    });

    it('should throw NotFoundError when provider not found', async () => {
      const { pool } = await import('../../../src/config/database.js');
      const { tenantService } = await import('../../../src/services/tenant.js');
      const { ssoService } = await import('../../../src/services/sso/index.js');

      vi.mocked(tenantService.findBySlug).mockResolvedValue({
        id: 'tenant-1',
        slug: 'test-company',
        name: 'Test Company',
        schemaName: 'tenant_test-company',
      });

      vi.mocked(pool.query).mockResolvedValue({
        rows: [],
        rowCount: 0,
      } as any);

      await expect(ssoService.deleteProvider('test-company', 'nonexistent'))
        .rejects.toThrow('SSO Provider');
    });
  });
});
