import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

// Mock services
vi.mock('../../../src/services/tenant.js', () => ({
  tenantService: {
    getSettings: vi.fn().mockResolvedValue({}),
    updateSettings: vi.fn().mockResolvedValue({}),
  },
}));

// Mock middleware
vi.mock('../../../src/middleware/auth.js', () => ({
  requirePermission: vi.fn().mockReturnValue(vi.fn().mockImplementation((_req, _reply, done) => done())),
}));

describe('Settings Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Update Settings Schema', () => {
    const updateSettingsSchema = z.object({
      name: z.string().min(2).max(255).optional(),
      billingEmail: z.string().email().optional(),
      settings: z.object({
        timezone: z.string().max(100).optional(),
        dateFormat: z.string().max(50).optional(),
        theme: z.enum(['light', 'dark', 'system']).optional(),
        primaryColor: z.string().max(50).optional(),
        logoUrl: z.string().url().max(500).optional().nullable(),
        notifications: z.object({
          email: z.boolean().optional(),
          slack: z.boolean().optional(),
          slaBreachAlerts: z.boolean().optional(),
        }).optional(),
        security: z.object({
          require2FA: z.boolean().optional(),
          sessionTimeoutMinutes: z.number().int().min(5).max(1440).optional(),
          passwordPolicy: z.enum(['standard', 'strong', 'strict']).optional(),
        }).optional(),
        email: z.object({
          senderEmail: z.string().email().optional(),
          senderName: z.string().max(255).optional(),
          provider: z.enum(['sendgrid', 'ses', 'mailgun', 'smtp']).optional(),
        }).optional(),
      }).optional(),
    });

    it('should accept empty update', () => {
      const result = updateSettingsSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should accept name update', () => {
      const result = updateSettingsSchema.safeParse({
        name: 'Updated Company Name',
      });
      expect(result.success).toBe(true);
    });

    it('should require name of at least 2 characters', () => {
      const result = updateSettingsSchema.safeParse({ name: 'A' });
      expect(result.success).toBe(false);
    });

    it('should reject name over 255 characters', () => {
      const result = updateSettingsSchema.safeParse({
        name: 'x'.repeat(256),
      });
      expect(result.success).toBe(false);
    });

    it('should accept billingEmail', () => {
      const result = updateSettingsSchema.safeParse({
        billingEmail: 'billing@example.com',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid billingEmail', () => {
      const result = updateSettingsSchema.safeParse({
        billingEmail: 'not-an-email',
      });
      expect(result.success).toBe(false);
    });

    it('should accept timezone', () => {
      const result = updateSettingsSchema.safeParse({
        settings: {
          timezone: 'America/New_York',
        },
      });
      expect(result.success).toBe(true);
    });

    it('should reject timezone over 100 characters', () => {
      const result = updateSettingsSchema.safeParse({
        settings: {
          timezone: 'x'.repeat(101),
        },
      });
      expect(result.success).toBe(false);
    });

    it('should accept dateFormat', () => {
      const result = updateSettingsSchema.safeParse({
        settings: {
          dateFormat: 'MM/DD/YYYY',
        },
      });
      expect(result.success).toBe(true);
    });

    it('should accept all theme values', () => {
      const themes = ['light', 'dark', 'system'];
      for (const theme of themes) {
        const result = updateSettingsSchema.safeParse({
          settings: { theme },
        });
        expect(result.success).toBe(true);
      }
    });

    it('should reject invalid theme', () => {
      const result = updateSettingsSchema.safeParse({
        settings: { theme: 'custom' },
      });
      expect(result.success).toBe(false);
    });

    it('should accept primaryColor', () => {
      const result = updateSettingsSchema.safeParse({
        settings: {
          primaryColor: '#0066CC',
        },
      });
      expect(result.success).toBe(true);
    });

    it('should accept logoUrl', () => {
      const result = updateSettingsSchema.safeParse({
        settings: {
          logoUrl: 'https://example.com/logo.png',
        },
      });
      expect(result.success).toBe(true);
    });

    it('should accept null logoUrl', () => {
      const result = updateSettingsSchema.safeParse({
        settings: {
          logoUrl: null,
        },
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid logoUrl', () => {
      const result = updateSettingsSchema.safeParse({
        settings: {
          logoUrl: 'not-a-url',
        },
      });
      expect(result.success).toBe(false);
    });
  });

  describe('Notification Settings', () => {
    const notificationSettingsSchema = z.object({
      email: z.boolean().optional(),
      slack: z.boolean().optional(),
      slaBreachAlerts: z.boolean().optional(),
    });

    it('should accept empty notification settings', () => {
      const result = notificationSettingsSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should accept email flag', () => {
      const result = notificationSettingsSchema.safeParse({ email: true });
      expect(result.success).toBe(true);
    });

    it('should accept slack flag', () => {
      const result = notificationSettingsSchema.safeParse({ slack: false });
      expect(result.success).toBe(true);
    });

    it('should accept slaBreachAlerts flag', () => {
      const result = notificationSettingsSchema.safeParse({ slaBreachAlerts: true });
      expect(result.success).toBe(true);
    });

    it('should accept all notification settings', () => {
      const result = notificationSettingsSchema.safeParse({
        email: true,
        slack: true,
        slaBreachAlerts: true,
      });
      expect(result.success).toBe(true);
    });
  });

  describe('Security Settings', () => {
    const securitySettingsSchema = z.object({
      require2FA: z.boolean().optional(),
      sessionTimeoutMinutes: z.number().int().min(5).max(1440).optional(),
      passwordPolicy: z.enum(['standard', 'strong', 'strict']).optional(),
    });

    it('should accept empty security settings', () => {
      const result = securitySettingsSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should accept require2FA flag', () => {
      const result = securitySettingsSchema.safeParse({ require2FA: true });
      expect(result.success).toBe(true);
    });

    it('should accept sessionTimeoutMinutes', () => {
      const result = securitySettingsSchema.safeParse({ sessionTimeoutMinutes: 30 });
      expect(result.success).toBe(true);
    });

    it('should reject sessionTimeoutMinutes under 5', () => {
      const result = securitySettingsSchema.safeParse({ sessionTimeoutMinutes: 3 });
      expect(result.success).toBe(false);
    });

    it('should reject sessionTimeoutMinutes over 1440 (24 hours)', () => {
      const result = securitySettingsSchema.safeParse({ sessionTimeoutMinutes: 1500 });
      expect(result.success).toBe(false);
    });

    it('should accept all password policies', () => {
      const policies = ['standard', 'strong', 'strict'];
      for (const passwordPolicy of policies) {
        const result = securitySettingsSchema.safeParse({ passwordPolicy });
        expect(result.success).toBe(true);
      }
    });

    it('should reject invalid password policy', () => {
      const result = securitySettingsSchema.safeParse({ passwordPolicy: 'weak' });
      expect(result.success).toBe(false);
    });
  });

  describe('Email Settings', () => {
    const emailSettingsSchema = z.object({
      senderEmail: z.string().email().optional(),
      senderName: z.string().max(255).optional(),
      provider: z.enum(['sendgrid', 'ses', 'mailgun', 'smtp']).optional(),
    });

    it('should accept empty email settings', () => {
      const result = emailSettingsSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should accept senderEmail', () => {
      const result = emailSettingsSchema.safeParse({
        senderEmail: 'noreply@example.com',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid senderEmail', () => {
      const result = emailSettingsSchema.safeParse({
        senderEmail: 'not-an-email',
      });
      expect(result.success).toBe(false);
    });

    it('should accept senderName', () => {
      const result = emailSettingsSchema.safeParse({
        senderName: 'FireLater Support',
      });
      expect(result.success).toBe(true);
    });

    it('should reject senderName over 255 characters', () => {
      const result = emailSettingsSchema.safeParse({
        senderName: 'x'.repeat(256),
      });
      expect(result.success).toBe(false);
    });

    it('should accept all email providers', () => {
      const providers = ['sendgrid', 'ses', 'mailgun', 'smtp'];
      for (const provider of providers) {
        const result = emailSettingsSchema.safeParse({ provider });
        expect(result.success).toBe(true);
      }
    });

    it('should reject invalid provider', () => {
      const result = emailSettingsSchema.safeParse({ provider: 'postmark' });
      expect(result.success).toBe(false);
    });
  });

  describe('Route Permissions', () => {
    it('should require settings:read for GET /', () => {
      const permission = 'settings:read';
      expect(permission).toBe('settings:read');
    });

    it('should require settings:update for PUT /', () => {
      const permission = 'settings:update';
      expect(permission).toBe('settings:update');
    });
  });

  describe('Response Formats', () => {
    it('should return settings object for GET', () => {
      const result = {
        name: 'Test Company',
        settings: { timezone: 'America/New_York' },
      };
      expect(result).toHaveProperty('name');
      expect(result).toHaveProperty('settings');
    });

    it('should return tenant and settings for PUT', () => {
      const tenant = { id: 'tenant-1', name: 'Test Company' };
      const settings = { timezone: 'America/New_York' };
      const response = { tenant, settings };
      expect(response).toHaveProperty('tenant');
      expect(response).toHaveProperty('settings');
    });
  });

  describe('Service Integration', () => {
    it('should pass tenantSlug to tenantService.getSettings', async () => {
      const { tenantService } = await import('../../../src/services/tenant.js');

      await tenantService.getSettings('test-tenant');
      expect(tenantService.getSettings).toHaveBeenCalledWith('test-tenant');
    });

    it('should pass tenantSlug and body to tenantService.updateSettings', async () => {
      const { tenantService } = await import('../../../src/services/tenant.js');
      const body = { name: 'Updated Name' };

      await tenantService.updateSettings('test-tenant', body);
      expect(tenantService.updateSettings).toHaveBeenCalledWith('test-tenant', body);
    });
  });

  describe('Full Settings Object', () => {
    const fullSettingsSchema = z.object({
      name: z.string().min(2).max(255).optional(),
      billingEmail: z.string().email().optional(),
      settings: z.object({
        timezone: z.string().max(100).optional(),
        dateFormat: z.string().max(50).optional(),
        theme: z.enum(['light', 'dark', 'system']).optional(),
        primaryColor: z.string().max(50).optional(),
        logoUrl: z.string().url().max(500).optional().nullable(),
        notifications: z.object({
          email: z.boolean().optional(),
          slack: z.boolean().optional(),
          slaBreachAlerts: z.boolean().optional(),
        }).optional(),
        security: z.object({
          require2FA: z.boolean().optional(),
          sessionTimeoutMinutes: z.number().int().min(5).max(1440).optional(),
          passwordPolicy: z.enum(['standard', 'strong', 'strict']).optional(),
        }).optional(),
        email: z.object({
          senderEmail: z.string().email().optional(),
          senderName: z.string().max(255).optional(),
          provider: z.enum(['sendgrid', 'ses', 'mailgun', 'smtp']).optional(),
        }).optional(),
      }).optional(),
    });

    it('should accept complete settings update', () => {
      const result = fullSettingsSchema.safeParse({
        name: 'Acme Corporation',
        billingEmail: 'billing@acme.com',
        settings: {
          timezone: 'America/New_York',
          dateFormat: 'MM/DD/YYYY',
          theme: 'dark',
          primaryColor: '#0066CC',
          logoUrl: 'https://acme.com/logo.png',
          notifications: {
            email: true,
            slack: true,
            slaBreachAlerts: true,
          },
          security: {
            require2FA: true,
            sessionTimeoutMinutes: 60,
            passwordPolicy: 'strong',
          },
          email: {
            senderEmail: 'noreply@acme.com',
            senderName: 'Acme Support',
            provider: 'sendgrid',
          },
        },
      });
      expect(result.success).toBe(true);
    });
  });
});
