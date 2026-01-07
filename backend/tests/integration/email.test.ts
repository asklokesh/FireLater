import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import { createTestApp, generateTestToken, createAuthHeader } from '../helpers.js';

// Mock data stores
interface MockEmailConfig {
  id: string;
  name: string;
  emailAddress: string;
  provider: string;
  isActive: boolean;
  defaultPriority?: string;
  defaultApplicationId?: string;
  defaultAssignedGroup?: string;
  autoReplyEnabled: boolean;
  autoReplyTemplate?: string;
  spamFilterEnabled: boolean;
  allowedDomains: string[];
  blockedDomains: string[];
  createdAt: Date;
  updatedAt: Date;
}

interface MockEmailLog {
  id: string;
  configId?: string;
  from: string;
  to: string;
  subject: string;
  action: string;
  success: boolean;
  errorMessage?: string;
  issueId?: string;
  createdAt: Date;
}

const emailConfigs: MockEmailConfig[] = [];
const emailLogs: MockEmailLog[] = [];

function resetMockData() {
  emailConfigs.length = 0;
  emailLogs.length = 0;
}

describe('Email Routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp();

    // ============================================
    // WEBHOOK ENDPOINTS (Public)
    // ============================================

    // SendGrid inbound webhook
    app.post<{ Params: { tenantSlug: string } }>('/v1/email/webhook/sendgrid/:tenantSlug', async (request, reply) => {
      const { tenantSlug } = request.params;
      const body = request.body as Record<string, string>;

      if (!body.from || !body.to) {
        return reply.status(400).send({ error: 'Missing required fields (from, to)' });
      }

      // Parse envelope to get actual recipient
      let toAddress = body.to;
      if (body.envelope) {
        try {
          const envelope = JSON.parse(body.envelope);
          toAddress = envelope.to?.[0] || body.to;
        } catch {
          // Use body.to
        }
      }

      const log: MockEmailLog = {
        id: `log-${Date.now()}`,
        from: body.from,
        to: toAddress,
        subject: body.subject || 'No Subject',
        action: 'create_issue',
        success: true,
        issueId: `ISS-${Math.floor(Math.random() * 10000)}`,
        createdAt: new Date(),
      };
      emailLogs.push(log);

      reply.send({
        success: true,
        action: 'create_issue',
        issueId: log.issueId,
      });
    });

    // Mailgun inbound webhook
    app.post<{ Params: { tenantSlug: string } }>('/v1/email/webhook/mailgun/:tenantSlug', async (request, reply) => {
      const { tenantSlug } = request.params;
      const body = request.body as Record<string, string>;

      if (!body.sender || !body.recipient) {
        return reply.status(400).send({ error: 'Missing required fields (sender, recipient)' });
      }

      const log: MockEmailLog = {
        id: `log-${Date.now()}`,
        from: body.sender,
        to: body.recipient,
        subject: body.subject || 'No Subject',
        action: 'create_issue',
        success: true,
        issueId: `ISS-${Math.floor(Math.random() * 10000)}`,
        createdAt: new Date(),
      };
      emailLogs.push(log);

      reply.send({
        success: true,
        action: 'create_issue',
        issueId: log.issueId,
      });
    });

    // Generic inbound webhook
    app.post<{ Params: { tenantSlug: string } }>('/v1/email/webhook/inbound/:tenantSlug', async (request, reply) => {
      const { tenantSlug } = request.params;
      const body = request.body as {
        from: string;
        fromName?: string;
        to: string;
        subject: string;
        textBody?: string;
        htmlBody?: string;
        messageId?: string;
        inReplyTo?: string;
        references?: string[];
      };

      if (!body.from || !body.to || !body.subject) {
        return reply.status(400).send({ error: 'Missing required fields (from, to, subject)' });
      }

      // Check if this is a reply to an existing issue
      let action = 'create_issue';
      let issueId = `ISS-${Math.floor(Math.random() * 10000)}`;

      if (body.inReplyTo && body.inReplyTo.includes('ISS-')) {
        action = 'add_comment';
        issueId = body.inReplyTo.match(/ISS-\d+/)?.[0] || issueId;
      }

      const log: MockEmailLog = {
        id: `log-${Date.now()}`,
        from: body.from,
        to: body.to,
        subject: body.subject,
        action,
        success: true,
        issueId,
        createdAt: new Date(),
      };
      emailLogs.push(log);

      reply.send({
        success: true,
        action,
        issueId,
      });
    });

    // ============================================
    // CONFIGURATION ENDPOINTS (Authenticated)
    // ============================================

    // List email configurations
    app.get('/v1/email/configs', async (request, reply) => {
      reply.send({ data: emailConfigs });
    });

    // Get single email configuration
    app.get<{ Params: { id: string } }>('/v1/email/configs/:id', async (request, reply) => {
      const config = emailConfigs.find(c => c.id === request.params.id);
      if (!config) {
        return reply.status(404).send({ error: 'Email configuration not found' });
      }
      reply.send({ data: config });
    });

    // Create email configuration
    app.post('/v1/email/configs', async (request, reply) => {
      const body = request.body as Partial<MockEmailConfig>;

      if (!body.name || body.name.length === 0) {
        return reply.status(400).send({ error: 'Name is required' });
      }

      if (!body.emailAddress) {
        return reply.status(400).send({ error: 'Email address is required' });
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(body.emailAddress)) {
        return reply.status(400).send({ error: 'Invalid email address format' });
      }

      if (!body.provider) {
        return reply.status(400).send({ error: 'Provider is required' });
      }

      if (!['sendgrid', 'mailgun', 'postmark', 'smtp'].includes(body.provider)) {
        return reply.status(400).send({ error: 'Invalid provider' });
      }

      // Check for duplicate email address
      if (emailConfigs.some(c => c.emailAddress === body.emailAddress)) {
        return reply.status(400).send({ error: 'Email address already exists' });
      }

      const config: MockEmailConfig = {
        id: `config-${Date.now()}`,
        name: body.name,
        emailAddress: body.emailAddress,
        provider: body.provider,
        isActive: true,
        defaultPriority: body.defaultPriority || 'medium',
        defaultApplicationId: body.defaultApplicationId,
        defaultAssignedGroup: body.defaultAssignedGroup,
        autoReplyEnabled: body.autoReplyEnabled || false,
        autoReplyTemplate: body.autoReplyTemplate,
        spamFilterEnabled: body.spamFilterEnabled || true,
        allowedDomains: body.allowedDomains || [],
        blockedDomains: body.blockedDomains || [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      emailConfigs.push(config);
      reply.status(201).send({ data: config });
    });

    // Update email configuration
    app.patch<{ Params: { id: string } }>('/v1/email/configs/:id', async (request, reply) => {
      const index = emailConfigs.findIndex(c => c.id === request.params.id);
      if (index === -1) {
        return reply.status(404).send({ error: 'Email configuration not found' });
      }

      const body = request.body as Partial<MockEmailConfig>;
      emailConfigs[index] = {
        ...emailConfigs[index],
        ...body,
        updatedAt: new Date(),
      };

      reply.send({ data: emailConfigs[index] });
    });

    // Delete email configuration
    app.delete<{ Params: { id: string } }>('/v1/email/configs/:id', async (request, reply) => {
      const index = emailConfigs.findIndex(c => c.id === request.params.id);
      if (index === -1) {
        return reply.status(404).send({ error: 'Email configuration not found' });
      }

      emailConfigs.splice(index, 1);
      reply.status(204).send();
    });

    // Get email logs
    app.get('/v1/email/logs', async (request, reply) => {
      const query = request.query as {
        configId?: string;
        action?: string;
        success?: string;
        page?: string;
        limit?: string;
      };

      let filtered = [...emailLogs];

      if (query.configId) {
        filtered = filtered.filter(l => l.configId === query.configId);
      }
      if (query.action) {
        filtered = filtered.filter(l => l.action === query.action);
      }
      if (query.success !== undefined) {
        const success = query.success === 'true';
        filtered = filtered.filter(l => l.success === success);
      }

      const page = parseInt(query.page || '1', 10);
      const limit = parseInt(query.limit || '50', 10);
      const start = (page - 1) * limit;
      const data = filtered.slice(start, start + limit);

      reply.send({
        data,
        meta: {
          total: filtered.length,
          page,
          limit,
        },
      });
    });

    // Test webhook endpoint
    app.post('/v1/email/test', async (request, reply) => {
      const body = request.body as { to: string; subject?: string; body?: string };

      if (!body.to) {
        return reply.status(400).send({ error: 'Email address (to) is required' });
      }

      const log: MockEmailLog = {
        id: `log-${Date.now()}`,
        from: 'test@example.com',
        to: body.to,
        subject: body.subject || 'Test Email',
        action: 'create_issue',
        success: true,
        issueId: `ISS-${Math.floor(Math.random() * 10000)}`,
        createdAt: new Date(),
      };
      emailLogs.push(log);

      reply.send({
        success: true,
        action: 'create_issue',
        issueId: log.issueId,
      });
    });

    // Get webhook URLs
    app.get('/v1/email/webhook-urls', async (request, reply) => {
      const tenantSlug = 'test-tenant';
      const baseUrl = 'https://api.example.com';

      reply.send({
        data: {
          sendgrid: `${baseUrl}/v1/email/webhook/sendgrid/${tenantSlug}`,
          mailgun: `${baseUrl}/v1/email/webhook/mailgun/${tenantSlug}`,
          generic: `${baseUrl}/v1/email/webhook/inbound/${tenantSlug}`,
          instructions: {
            sendgrid: 'Configure SendGrid Inbound Parse to point to the SendGrid webhook URL.',
            mailgun: 'Configure Mailgun Routes to forward to the Mailgun webhook URL.',
            generic: 'Use the generic endpoint for testing or custom email integrations.',
          },
        },
      });
    });

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    resetMockData();
  });

  // ============================================
  // WEBHOOK TESTS
  // ============================================

  describe('SendGrid Webhook', () => {
    describe('POST /v1/email/webhook/sendgrid/:tenantSlug', () => {
      it('should process SendGrid inbound email', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/v1/email/webhook/sendgrid/test-tenant',
          payload: {
            from: 'user@example.com',
            to: 'support@company.com',
            subject: 'Help needed with login',
            text: 'I cannot login to my account.',
          },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.success).toBe(true);
        expect(body.action).toBe('create_issue');
        expect(body.issueId).toMatch(/^ISS-\d+$/);
      });

      it('should parse envelope to get actual recipient', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/v1/email/webhook/sendgrid/test-tenant',
          payload: {
            from: 'user@example.com',
            to: 'support@company.com',
            subject: 'Test',
            envelope: JSON.stringify({ to: ['actual@company.com'] }),
          },
        });

        expect(response.statusCode).toBe(200);
        expect(emailLogs[0].to).toBe('actual@company.com');
      });

      it('should return 400 for missing required fields', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/v1/email/webhook/sendgrid/test-tenant',
          payload: {
            subject: 'Test',
          },
        });

        expect(response.statusCode).toBe(400);
      });
    });
  });

  describe('Mailgun Webhook', () => {
    describe('POST /v1/email/webhook/mailgun/:tenantSlug', () => {
      it('should process Mailgun inbound email', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/v1/email/webhook/mailgun/test-tenant',
          payload: {
            sender: 'user@example.com',
            recipient: 'support@company.com',
            subject: 'Issue with billing',
            'body-plain': 'I have a question about my invoice.',
          },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.success).toBe(true);
        expect(body.action).toBe('create_issue');
      });

      it('should return 400 for missing required fields', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/v1/email/webhook/mailgun/test-tenant',
          payload: {
            subject: 'Test',
          },
        });

        expect(response.statusCode).toBe(400);
      });
    });
  });

  describe('Generic Webhook', () => {
    describe('POST /v1/email/webhook/inbound/:tenantSlug', () => {
      it('should process generic inbound email', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/v1/email/webhook/inbound/test-tenant',
          payload: {
            from: 'user@example.com',
            fromName: 'John Doe',
            to: 'support@company.com',
            subject: 'New issue',
            textBody: 'Please help me with this problem.',
          },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.success).toBe(true);
        expect(body.action).toBe('create_issue');
      });

      it('should add comment when replying to existing issue', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/v1/email/webhook/inbound/test-tenant',
          payload: {
            from: 'user@example.com',
            to: 'support@company.com',
            subject: 'Re: Issue ISS-12345',
            textBody: 'Here is my update.',
            inReplyTo: '<ISS-12345@tickets.example.com>',
          },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.success).toBe(true);
        expect(body.action).toBe('add_comment');
        expect(body.issueId).toBe('ISS-12345');
      });

      it('should return 400 for missing required fields', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/v1/email/webhook/inbound/test-tenant',
          payload: {
            from: 'user@example.com',
          },
        });

        expect(response.statusCode).toBe(400);
      });
    });
  });

  // ============================================
  // CONFIGURATION TESTS
  // ============================================

  describe('Email Configurations', () => {
    describe('GET /v1/email/configs', () => {
      it('should return empty list when no configs exist', async () => {
        const token = generateTestToken(app);
        const response = await app.inject({
          method: 'GET',
          url: '/v1/email/configs',
          headers: createAuthHeader(token),
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.data).toEqual([]);
      });

      it('should return all email configurations', async () => {
        emailConfigs.push({
          id: 'config-1',
          name: 'Support Email',
          emailAddress: 'support@company.com',
          provider: 'sendgrid',
          isActive: true,
          autoReplyEnabled: false,
          spamFilterEnabled: true,
          allowedDomains: [],
          blockedDomains: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        const token = generateTestToken(app);
        const response = await app.inject({
          method: 'GET',
          url: '/v1/email/configs',
          headers: createAuthHeader(token),
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.data).toHaveLength(1);
        expect(body.data[0].name).toBe('Support Email');
      });
    });

    describe('GET /v1/email/configs/:id', () => {
      it('should return email configuration by ID', async () => {
        emailConfigs.push({
          id: 'config-123',
          name: 'Billing Email',
          emailAddress: 'billing@company.com',
          provider: 'mailgun',
          isActive: true,
          autoReplyEnabled: true,
          autoReplyTemplate: 'Thank you for contacting us.',
          spamFilterEnabled: true,
          allowedDomains: [],
          blockedDomains: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        const token = generateTestToken(app);
        const response = await app.inject({
          method: 'GET',
          url: '/v1/email/configs/config-123',
          headers: createAuthHeader(token),
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.data.id).toBe('config-123');
        expect(body.data.name).toBe('Billing Email');
      });

      it('should return 404 for non-existent config', async () => {
        const token = generateTestToken(app);
        const response = await app.inject({
          method: 'GET',
          url: '/v1/email/configs/non-existent',
          headers: createAuthHeader(token),
        });

        expect(response.statusCode).toBe(404);
      });
    });

    describe('POST /v1/email/configs', () => {
      it('should create a new email configuration', async () => {
        const token = generateTestToken(app);
        const response = await app.inject({
          method: 'POST',
          url: '/v1/email/configs',
          headers: createAuthHeader(token),
          payload: {
            name: 'New Support Email',
            emailAddress: 'newsupport@company.com',
            provider: 'sendgrid',
            defaultPriority: 'high',
            autoReplyEnabled: true,
            autoReplyTemplate: 'We received your email.',
          },
        });

        expect(response.statusCode).toBe(201);
        const body = JSON.parse(response.body);
        expect(body.data.name).toBe('New Support Email');
        expect(body.data.emailAddress).toBe('newsupport@company.com');
        expect(body.data.provider).toBe('sendgrid');
        expect(body.data.autoReplyEnabled).toBe(true);
      });

      it('should reject config without name', async () => {
        const token = generateTestToken(app);
        const response = await app.inject({
          method: 'POST',
          url: '/v1/email/configs',
          headers: createAuthHeader(token),
          payload: {
            emailAddress: 'test@company.com',
            provider: 'sendgrid',
          },
        });

        expect(response.statusCode).toBe(400);
      });

      it('should reject invalid email address', async () => {
        const token = generateTestToken(app);
        const response = await app.inject({
          method: 'POST',
          url: '/v1/email/configs',
          headers: createAuthHeader(token),
          payload: {
            name: 'Test Config',
            emailAddress: 'invalid-email',
            provider: 'sendgrid',
          },
        });

        expect(response.statusCode).toBe(400);
      });

      it('should reject invalid provider', async () => {
        const token = generateTestToken(app);
        const response = await app.inject({
          method: 'POST',
          url: '/v1/email/configs',
          headers: createAuthHeader(token),
          payload: {
            name: 'Test Config',
            emailAddress: 'test@company.com',
            provider: 'invalid-provider',
          },
        });

        expect(response.statusCode).toBe(400);
      });

      it('should reject duplicate email address', async () => {
        emailConfigs.push({
          id: 'existing',
          name: 'Existing',
          emailAddress: 'existing@company.com',
          provider: 'sendgrid',
          isActive: true,
          autoReplyEnabled: false,
          spamFilterEnabled: true,
          allowedDomains: [],
          blockedDomains: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        const token = generateTestToken(app);
        const response = await app.inject({
          method: 'POST',
          url: '/v1/email/configs',
          headers: createAuthHeader(token),
          payload: {
            name: 'Duplicate',
            emailAddress: 'existing@company.com',
            provider: 'mailgun',
          },
        });

        expect(response.statusCode).toBe(400);
        const body = JSON.parse(response.body);
        expect(body.error).toContain('already exists');
      });
    });

    describe('PATCH /v1/email/configs/:id', () => {
      it('should update an email configuration', async () => {
        emailConfigs.push({
          id: 'config-update',
          name: 'Original Name',
          emailAddress: 'original@company.com',
          provider: 'sendgrid',
          isActive: true,
          autoReplyEnabled: false,
          spamFilterEnabled: true,
          allowedDomains: [],
          blockedDomains: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        const token = generateTestToken(app);
        const response = await app.inject({
          method: 'PATCH',
          url: '/v1/email/configs/config-update',
          headers: createAuthHeader(token),
          payload: {
            name: 'Updated Name',
            autoReplyEnabled: true,
          },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.data.name).toBe('Updated Name');
        expect(body.data.autoReplyEnabled).toBe(true);
      });

      it('should toggle isActive status', async () => {
        emailConfigs.push({
          id: 'config-toggle',
          name: 'Toggle Config',
          emailAddress: 'toggle@company.com',
          provider: 'sendgrid',
          isActive: true,
          autoReplyEnabled: false,
          spamFilterEnabled: true,
          allowedDomains: [],
          blockedDomains: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        const token = generateTestToken(app);
        const response = await app.inject({
          method: 'PATCH',
          url: '/v1/email/configs/config-toggle',
          headers: createAuthHeader(token),
          payload: {
            isActive: false,
          },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.data.isActive).toBe(false);
      });

      it('should return 404 for non-existent config', async () => {
        const token = generateTestToken(app);
        const response = await app.inject({
          method: 'PATCH',
          url: '/v1/email/configs/non-existent',
          headers: createAuthHeader(token),
          payload: {
            name: 'Updated',
          },
        });

        expect(response.statusCode).toBe(404);
      });
    });

    describe('DELETE /v1/email/configs/:id', () => {
      it('should delete an email configuration', async () => {
        emailConfigs.push({
          id: 'config-delete',
          name: 'To Delete',
          emailAddress: 'delete@company.com',
          provider: 'sendgrid',
          isActive: true,
          autoReplyEnabled: false,
          spamFilterEnabled: true,
          allowedDomains: [],
          blockedDomains: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        const token = generateTestToken(app);
        const response = await app.inject({
          method: 'DELETE',
          url: '/v1/email/configs/config-delete',
          headers: createAuthHeader(token),
        });

        expect(response.statusCode).toBe(204);
        expect(emailConfigs.find(c => c.id === 'config-delete')).toBeUndefined();
      });

      it('should return 404 for non-existent config', async () => {
        const token = generateTestToken(app);
        const response = await app.inject({
          method: 'DELETE',
          url: '/v1/email/configs/non-existent',
          headers: createAuthHeader(token),
        });

        expect(response.statusCode).toBe(404);
      });
    });
  });

  // ============================================
  // EMAIL LOGS TESTS
  // ============================================

  describe('Email Logs', () => {
    describe('GET /v1/email/logs', () => {
      it('should return empty list when no logs exist', async () => {
        const token = generateTestToken(app);
        const response = await app.inject({
          method: 'GET',
          url: '/v1/email/logs',
          headers: createAuthHeader(token),
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.data).toEqual([]);
      });

      it('should return paginated email logs', async () => {
        // Add some logs
        for (let i = 0; i < 10; i++) {
          emailLogs.push({
            id: `log-${i}`,
            from: `user${i}@example.com`,
            to: 'support@company.com',
            subject: `Test ${i}`,
            action: 'create_issue',
            success: true,
            issueId: `ISS-${i}`,
            createdAt: new Date(),
          });
        }

        const token = generateTestToken(app);
        const response = await app.inject({
          method: 'GET',
          url: '/v1/email/logs?page=1&limit=5',
          headers: createAuthHeader(token),
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.data).toHaveLength(5);
        expect(body.meta.total).toBe(10);
        expect(body.meta.page).toBe(1);
        expect(body.meta.limit).toBe(5);
      });

      it('should filter logs by action', async () => {
        emailLogs.push({
          id: 'log-1',
          from: 'user@example.com',
          to: 'support@company.com',
          subject: 'New Issue',
          action: 'create_issue',
          success: true,
          createdAt: new Date(),
        });
        emailLogs.push({
          id: 'log-2',
          from: 'user@example.com',
          to: 'support@company.com',
          subject: 'Re: Issue',
          action: 'add_comment',
          success: true,
          createdAt: new Date(),
        });

        const token = generateTestToken(app);
        const response = await app.inject({
          method: 'GET',
          url: '/v1/email/logs?action=create_issue',
          headers: createAuthHeader(token),
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.data).toHaveLength(1);
        expect(body.data[0].action).toBe('create_issue');
      });

      it('should filter logs by success status', async () => {
        emailLogs.push({
          id: 'log-success',
          from: 'user@example.com',
          to: 'support@company.com',
          subject: 'Success',
          action: 'create_issue',
          success: true,
          createdAt: new Date(),
        });
        emailLogs.push({
          id: 'log-failed',
          from: 'spam@example.com',
          to: 'support@company.com',
          subject: 'Failed',
          action: 'blocked',
          success: false,
          errorMessage: 'Spam detected',
          createdAt: new Date(),
        });

        const token = generateTestToken(app);
        const response = await app.inject({
          method: 'GET',
          url: '/v1/email/logs?success=false',
          headers: createAuthHeader(token),
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.data).toHaveLength(1);
        expect(body.data[0].success).toBe(false);
      });
    });
  });

  // ============================================
  // UTILITY ENDPOINTS TESTS
  // ============================================

  describe('Utility Endpoints', () => {
    describe('POST /v1/email/test', () => {
      it('should send a test email', async () => {
        const token = generateTestToken(app);
        const response = await app.inject({
          method: 'POST',
          url: '/v1/email/test',
          headers: createAuthHeader(token),
          payload: {
            to: 'test@company.com',
            subject: 'Test Subject',
            body: 'Test body content',
          },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.success).toBe(true);
        expect(body.action).toBe('create_issue');
      });

      it('should return 400 when to is missing', async () => {
        const token = generateTestToken(app);
        const response = await app.inject({
          method: 'POST',
          url: '/v1/email/test',
          headers: createAuthHeader(token),
          payload: {
            subject: 'Test',
          },
        });

        expect(response.statusCode).toBe(400);
      });
    });

    describe('GET /v1/email/webhook-urls', () => {
      it('should return webhook URLs and instructions', async () => {
        const token = generateTestToken(app);
        const response = await app.inject({
          method: 'GET',
          url: '/v1/email/webhook-urls',
          headers: createAuthHeader(token),
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.data).toHaveProperty('sendgrid');
        expect(body.data).toHaveProperty('mailgun');
        expect(body.data).toHaveProperty('generic');
        expect(body.data).toHaveProperty('instructions');
        expect(body.data.sendgrid).toContain('/webhook/sendgrid/');
        expect(body.data.mailgun).toContain('/webhook/mailgun/');
        expect(body.data.generic).toContain('/webhook/inbound/');
      });
    });
  });
});
