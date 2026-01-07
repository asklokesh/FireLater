import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { createTestApp, generateTestToken, createAuthHeader } from '../helpers.js';

interface MockTenantSettings {
  timezone: string;
  dateFormat: string;
  theme: 'light' | 'dark' | 'system';
  primaryColor: string;
  logoUrl: string | null;
  notifications: {
    email: boolean;
    slack: boolean;
    slaBreachAlerts: boolean;
  };
  security: {
    require2FA: boolean;
    sessionTimeoutMinutes: number;
    passwordPolicy: 'standard' | 'strong' | 'strict';
  };
  email: {
    senderEmail: string;
    senderName: string;
    provider: 'sendgrid' | 'ses' | 'mailgun' | 'smtp';
  };
}

interface MockTenant {
  id: string;
  name: string;
  slug: string;
  billingEmail: string;
  settings: MockTenantSettings;
  created_at: string;
  updated_at: string;
}

describe('Settings Routes', () => {
  let app: FastifyInstance;
  let tenant: MockTenant;

  beforeAll(async () => {
    app = await createTestApp();

    // Initialize mock tenant
    tenant = {
      id: 'tenant-1',
      name: 'Test Company',
      slug: 'test-company',
      billingEmail: 'billing@testcompany.com',
      settings: {
        timezone: 'America/New_York',
        dateFormat: 'MM/DD/YYYY',
        theme: 'light',
        primaryColor: '#3B82F6',
        logoUrl: null,
        notifications: {
          email: true,
          slack: false,
          slaBreachAlerts: true,
        },
        security: {
          require2FA: false,
          sessionTimeoutMinutes: 60,
          passwordPolicy: 'standard',
        },
        email: {
          senderEmail: 'no-reply@testcompany.com',
          senderName: 'Test Company',
          provider: 'sendgrid',
        },
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // GET /v1/settings - Get tenant settings
    app.get('/v1/settings', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      return {
        tenant: {
          id: tenant.id,
          name: tenant.name,
          slug: tenant.slug,
          billingEmail: tenant.billingEmail,
        },
        settings: tenant.settings,
      };
    });

    // PUT /v1/settings - Update tenant settings
    app.put('/v1/settings', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const body = request.body as Partial<{
        name: string;
        billingEmail: string;
        settings: Partial<MockTenantSettings>;
      }>;

      // Validate name
      if (body.name !== undefined) {
        if (body.name.length < 2) {
          return reply.status(400).send({
            statusCode: 400,
            error: 'Validation Error',
            message: 'Name must be at least 2 characters',
          });
        }
        if (body.name.length > 255) {
          return reply.status(400).send({
            statusCode: 400,
            error: 'Validation Error',
            message: 'Name must be at most 255 characters',
          });
        }
        tenant.name = body.name;
      }

      // Validate billingEmail
      if (body.billingEmail !== undefined) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(body.billingEmail)) {
          return reply.status(400).send({
            statusCode: 400,
            error: 'Validation Error',
            message: 'Invalid email format',
          });
        }
        tenant.billingEmail = body.billingEmail;
      }

      // Update settings
      if (body.settings) {
        // Theme validation
        if (body.settings.theme !== undefined) {
          if (!['light', 'dark', 'system'].includes(body.settings.theme)) {
            return reply.status(400).send({
              statusCode: 400,
              error: 'Validation Error',
              message: 'Invalid theme value',
            });
          }
          tenant.settings.theme = body.settings.theme;
        }

        // Timezone
        if (body.settings.timezone !== undefined) {
          tenant.settings.timezone = body.settings.timezone;
        }

        // Date format
        if (body.settings.dateFormat !== undefined) {
          tenant.settings.dateFormat = body.settings.dateFormat;
        }

        // Primary color
        if (body.settings.primaryColor !== undefined) {
          tenant.settings.primaryColor = body.settings.primaryColor;
        }

        // Logo URL
        if (body.settings.logoUrl !== undefined) {
          if (body.settings.logoUrl !== null) {
            try {
              new URL(body.settings.logoUrl);
            } catch {
              return reply.status(400).send({
                statusCode: 400,
                error: 'Validation Error',
                message: 'Invalid logo URL',
              });
            }
          }
          tenant.settings.logoUrl = body.settings.logoUrl;
        }

        // Notifications
        if (body.settings.notifications) {
          tenant.settings.notifications = {
            ...tenant.settings.notifications,
            ...body.settings.notifications,
          };
        }

        // Security
        if (body.settings.security) {
          if (body.settings.security.sessionTimeoutMinutes !== undefined) {
            if (body.settings.security.sessionTimeoutMinutes < 5 ||
                body.settings.security.sessionTimeoutMinutes > 1440) {
              return reply.status(400).send({
                statusCode: 400,
                error: 'Validation Error',
                message: 'Session timeout must be between 5 and 1440 minutes',
              });
            }
          }

          if (body.settings.security.passwordPolicy !== undefined) {
            if (!['standard', 'strong', 'strict'].includes(body.settings.security.passwordPolicy)) {
              return reply.status(400).send({
                statusCode: 400,
                error: 'Validation Error',
                message: 'Invalid password policy',
              });
            }
          }

          tenant.settings.security = {
            ...tenant.settings.security,
            ...body.settings.security,
          };
        }

        // Email
        if (body.settings.email) {
          if (body.settings.email.senderEmail !== undefined) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(body.settings.email.senderEmail)) {
              return reply.status(400).send({
                statusCode: 400,
                error: 'Validation Error',
                message: 'Invalid sender email format',
              });
            }
          }

          if (body.settings.email.provider !== undefined) {
            if (!['sendgrid', 'ses', 'mailgun', 'smtp'].includes(body.settings.email.provider)) {
              return reply.status(400).send({
                statusCode: 400,
                error: 'Validation Error',
                message: 'Invalid email provider',
              });
            }
          }

          tenant.settings.email = {
            ...tenant.settings.email,
            ...body.settings.email,
          };
        }
      }

      tenant.updated_at = new Date().toISOString();

      return {
        tenant: {
          id: tenant.id,
          name: tenant.name,
          slug: tenant.slug,
          billingEmail: tenant.billingEmail,
        },
        settings: tenant.settings,
      };
    });

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /v1/settings', () => {
    it('should return tenant settings', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/settings',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.tenant).toBeDefined();
      expect(body.settings).toBeDefined();
      expect(body.settings.timezone).toBeDefined();
      expect(body.settings.theme).toBeDefined();
    });

    it('should return tenant info', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/settings',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.tenant.name).toBe('Test Company');
      expect(body.tenant.slug).toBe('test-company');
      expect(body.tenant.billingEmail).toBeDefined();
    });

    it('should return notification settings', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/settings',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.settings.notifications).toBeDefined();
      expect(body.settings.notifications.email).toBeDefined();
      expect(body.settings.notifications.slack).toBeDefined();
      expect(body.settings.notifications.slaBreachAlerts).toBeDefined();
    });

    it('should return security settings', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/settings',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.settings.security).toBeDefined();
      expect(body.settings.security.require2FA).toBeDefined();
      expect(body.settings.security.sessionTimeoutMinutes).toBeDefined();
      expect(body.settings.security.passwordPolicy).toBeDefined();
    });

    it('should return email settings', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/settings',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.settings.email).toBeDefined();
      expect(body.settings.email.senderEmail).toBeDefined();
      expect(body.settings.email.provider).toBeDefined();
    });

    it('should return 401 without auth', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/settings',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('PUT /v1/settings - Tenant Info', () => {
    it('should update tenant name', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'PUT',
        url: '/v1/settings',
        headers: createAuthHeader(token),
        payload: {
          name: 'Updated Company Name',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.tenant.name).toBe('Updated Company Name');
    });

    it('should return 400 for name too short', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'PUT',
        url: '/v1/settings',
        headers: createAuthHeader(token),
        payload: {
          name: 'A',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 for name too long', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'PUT',
        url: '/v1/settings',
        headers: createAuthHeader(token),
        payload: {
          name: 'x'.repeat(256),
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should update billing email', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'PUT',
        url: '/v1/settings',
        headers: createAuthHeader(token),
        payload: {
          billingEmail: 'new-billing@example.com',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.tenant.billingEmail).toBe('new-billing@example.com');
    });

    it('should return 400 for invalid billing email', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'PUT',
        url: '/v1/settings',
        headers: createAuthHeader(token),
        payload: {
          billingEmail: 'not-an-email',
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('PUT /v1/settings - Theme Settings', () => {
    it('should update theme to dark', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'PUT',
        url: '/v1/settings',
        headers: createAuthHeader(token),
        payload: {
          settings: { theme: 'dark' },
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.settings.theme).toBe('dark');
    });

    it('should update theme to system', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'PUT',
        url: '/v1/settings',
        headers: createAuthHeader(token),
        payload: {
          settings: { theme: 'system' },
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.settings.theme).toBe('system');
    });

    it('should return 400 for invalid theme', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'PUT',
        url: '/v1/settings',
        headers: createAuthHeader(token),
        payload: {
          settings: { theme: 'invalid' },
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should update primary color', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'PUT',
        url: '/v1/settings',
        headers: createAuthHeader(token),
        payload: {
          settings: { primaryColor: '#FF5733' },
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.settings.primaryColor).toBe('#FF5733');
    });

    it('should update timezone', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'PUT',
        url: '/v1/settings',
        headers: createAuthHeader(token),
        payload: {
          settings: { timezone: 'Europe/London' },
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.settings.timezone).toBe('Europe/London');
    });

    it('should update date format', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'PUT',
        url: '/v1/settings',
        headers: createAuthHeader(token),
        payload: {
          settings: { dateFormat: 'DD/MM/YYYY' },
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.settings.dateFormat).toBe('DD/MM/YYYY');
    });

    it('should update logo URL', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'PUT',
        url: '/v1/settings',
        headers: createAuthHeader(token),
        payload: {
          settings: { logoUrl: 'https://example.com/logo.png' },
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.settings.logoUrl).toBe('https://example.com/logo.png');
    });

    it('should clear logo URL with null', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'PUT',
        url: '/v1/settings',
        headers: createAuthHeader(token),
        payload: {
          settings: { logoUrl: null },
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.settings.logoUrl).toBe(null);
    });

    it('should return 400 for invalid logo URL', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'PUT',
        url: '/v1/settings',
        headers: createAuthHeader(token),
        payload: {
          settings: { logoUrl: 'not-a-url' },
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('PUT /v1/settings - Notification Settings', () => {
    it('should update email notifications', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'PUT',
        url: '/v1/settings',
        headers: createAuthHeader(token),
        payload: {
          settings: {
            notifications: { email: false },
          },
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.settings.notifications.email).toBe(false);
    });

    it('should update slack notifications', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'PUT',
        url: '/v1/settings',
        headers: createAuthHeader(token),
        payload: {
          settings: {
            notifications: { slack: true },
          },
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.settings.notifications.slack).toBe(true);
    });

    it('should update SLA breach alerts', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'PUT',
        url: '/v1/settings',
        headers: createAuthHeader(token),
        payload: {
          settings: {
            notifications: { slaBreachAlerts: false },
          },
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.settings.notifications.slaBreachAlerts).toBe(false);
    });
  });

  describe('PUT /v1/settings - Security Settings', () => {
    it('should enable 2FA requirement', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'PUT',
        url: '/v1/settings',
        headers: createAuthHeader(token),
        payload: {
          settings: {
            security: { require2FA: true },
          },
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.settings.security.require2FA).toBe(true);
    });

    it('should update session timeout', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'PUT',
        url: '/v1/settings',
        headers: createAuthHeader(token),
        payload: {
          settings: {
            security: { sessionTimeoutMinutes: 120 },
          },
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.settings.security.sessionTimeoutMinutes).toBe(120);
    });

    it('should return 400 for session timeout below minimum', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'PUT',
        url: '/v1/settings',
        headers: createAuthHeader(token),
        payload: {
          settings: {
            security: { sessionTimeoutMinutes: 4 },
          },
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 for session timeout above maximum', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'PUT',
        url: '/v1/settings',
        headers: createAuthHeader(token),
        payload: {
          settings: {
            security: { sessionTimeoutMinutes: 1441 },
          },
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should update password policy to strong', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'PUT',
        url: '/v1/settings',
        headers: createAuthHeader(token),
        payload: {
          settings: {
            security: { passwordPolicy: 'strong' },
          },
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.settings.security.passwordPolicy).toBe('strong');
    });

    it('should update password policy to strict', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'PUT',
        url: '/v1/settings',
        headers: createAuthHeader(token),
        payload: {
          settings: {
            security: { passwordPolicy: 'strict' },
          },
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.settings.security.passwordPolicy).toBe('strict');
    });

    it('should return 400 for invalid password policy', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'PUT',
        url: '/v1/settings',
        headers: createAuthHeader(token),
        payload: {
          settings: {
            security: { passwordPolicy: 'invalid' },
          },
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('PUT /v1/settings - Email Settings', () => {
    it('should update sender email', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'PUT',
        url: '/v1/settings',
        headers: createAuthHeader(token),
        payload: {
          settings: {
            email: { senderEmail: 'support@example.com' },
          },
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.settings.email.senderEmail).toBe('support@example.com');
    });

    it('should return 400 for invalid sender email', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'PUT',
        url: '/v1/settings',
        headers: createAuthHeader(token),
        payload: {
          settings: {
            email: { senderEmail: 'invalid-email' },
          },
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should update sender name', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'PUT',
        url: '/v1/settings',
        headers: createAuthHeader(token),
        payload: {
          settings: {
            email: { senderName: 'Support Team' },
          },
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.settings.email.senderName).toBe('Support Team');
    });

    it('should update email provider to ses', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'PUT',
        url: '/v1/settings',
        headers: createAuthHeader(token),
        payload: {
          settings: {
            email: { provider: 'ses' },
          },
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.settings.email.provider).toBe('ses');
    });

    it('should update email provider to mailgun', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'PUT',
        url: '/v1/settings',
        headers: createAuthHeader(token),
        payload: {
          settings: {
            email: { provider: 'mailgun' },
          },
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.settings.email.provider).toBe('mailgun');
    });

    it('should update email provider to smtp', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'PUT',
        url: '/v1/settings',
        headers: createAuthHeader(token),
        payload: {
          settings: {
            email: { provider: 'smtp' },
          },
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.settings.email.provider).toBe('smtp');
    });

    it('should return 400 for invalid email provider', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'PUT',
        url: '/v1/settings',
        headers: createAuthHeader(token),
        payload: {
          settings: {
            email: { provider: 'invalid' },
          },
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('PUT /v1/settings - Multiple Updates', () => {
    it('should update multiple settings at once', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'PUT',
        url: '/v1/settings',
        headers: createAuthHeader(token),
        payload: {
          name: 'Multi Update Company',
          settings: {
            theme: 'light',
            timezone: 'UTC',
            notifications: {
              email: true,
              slack: true,
            },
            security: {
              require2FA: false,
              sessionTimeoutMinutes: 30,
            },
          },
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.tenant.name).toBe('Multi Update Company');
      expect(body.settings.theme).toBe('light');
      expect(body.settings.timezone).toBe('UTC');
      expect(body.settings.notifications.email).toBe(true);
      expect(body.settings.notifications.slack).toBe(true);
      expect(body.settings.security.require2FA).toBe(false);
      expect(body.settings.security.sessionTimeoutMinutes).toBe(30);
    });

    it('should return 401 without auth', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/v1/settings',
        payload: { name: 'Test' },
      });

      expect(response.statusCode).toBe(401);
    });
  });
});
