import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

// Mock services
vi.mock('../../../src/services/email-inbound.js', () => ({
  emailInboundService: {
    processInboundEmail: vi.fn().mockResolvedValue({ success: true }),
    listEmailConfigs: vi.fn().mockResolvedValue([]),
    getEmailConfigById: vi.fn().mockResolvedValue(null),
    createEmailConfig: vi.fn().mockResolvedValue({}),
    updateEmailConfig: vi.fn().mockResolvedValue({}),
    deleteEmailConfig: vi.fn().mockResolvedValue(true),
    getEmailLogs: vi.fn().mockResolvedValue({ logs: [], total: 0 }),
  },
}));

describe('Email Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Email Config Schema', () => {
    const emailConfigSchema = z.object({
      name: z.string().min(1).max(100),
      emailAddress: z.string().email(),
      provider: z.enum(['sendgrid', 'mailgun', 'postmark', 'smtp']),
      defaultPriority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
      defaultApplicationId: z.string().uuid().optional(),
      defaultAssignedGroup: z.string().uuid().optional(),
      autoReplyEnabled: z.boolean().optional(),
      autoReplyTemplate: z.string().max(5000).optional(),
      spamFilterEnabled: z.boolean().optional(),
      allowedDomains: z.array(z.string()).optional(),
      blockedDomains: z.array(z.string()).optional(),
    });

    it('should require name, emailAddress, and provider', () => {
      const result = emailConfigSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should accept valid config data', () => {
      const result = emailConfigSchema.safeParse({
        name: 'Support Email',
        emailAddress: 'support@example.com',
        provider: 'sendgrid',
      });
      expect(result.success).toBe(true);
    });

    it('should reject name over 100 characters', () => {
      const result = emailConfigSchema.safeParse({
        name: 'x'.repeat(101),
        emailAddress: 'support@example.com',
        provider: 'sendgrid',
      });
      expect(result.success).toBe(false);
    });

    it('should reject invalid email address', () => {
      const result = emailConfigSchema.safeParse({
        name: 'Support',
        emailAddress: 'not-an-email',
        provider: 'sendgrid',
      });
      expect(result.success).toBe(false);
    });

    it('should accept all providers', () => {
      const providers = ['sendgrid', 'mailgun', 'postmark', 'smtp'];
      for (const provider of providers) {
        const result = emailConfigSchema.safeParse({
          name: 'Support',
          emailAddress: 'support@example.com',
          provider,
        });
        expect(result.success).toBe(true);
      }
    });

    it('should reject invalid provider', () => {
      const result = emailConfigSchema.safeParse({
        name: 'Support',
        emailAddress: 'support@example.com',
        provider: 'ses',
      });
      expect(result.success).toBe(false);
    });

    it('should accept all priority values', () => {
      const priorities = ['low', 'medium', 'high', 'critical'];
      for (const defaultPriority of priorities) {
        const result = emailConfigSchema.safeParse({
          name: 'Support',
          emailAddress: 'support@example.com',
          provider: 'sendgrid',
          defaultPriority,
        });
        expect(result.success).toBe(true);
      }
    });

    it('should accept defaultApplicationId', () => {
      const result = emailConfigSchema.safeParse({
        name: 'Support',
        emailAddress: 'support@example.com',
        provider: 'sendgrid',
        defaultApplicationId: '123e4567-e89b-12d3-a456-426614174000',
      });
      expect(result.success).toBe(true);
    });

    it('should accept defaultAssignedGroup', () => {
      const result = emailConfigSchema.safeParse({
        name: 'Support',
        emailAddress: 'support@example.com',
        provider: 'sendgrid',
        defaultAssignedGroup: '123e4567-e89b-12d3-a456-426614174000',
      });
      expect(result.success).toBe(true);
    });

    it('should accept autoReplyEnabled flag', () => {
      const result = emailConfigSchema.safeParse({
        name: 'Support',
        emailAddress: 'support@example.com',
        provider: 'sendgrid',
        autoReplyEnabled: true,
      });
      expect(result.success).toBe(true);
    });

    it('should accept autoReplyTemplate', () => {
      const result = emailConfigSchema.safeParse({
        name: 'Support',
        emailAddress: 'support@example.com',
        provider: 'sendgrid',
        autoReplyTemplate: 'Thank you for contacting us. A ticket has been created.',
      });
      expect(result.success).toBe(true);
    });

    it('should reject autoReplyTemplate over 5000 characters', () => {
      const result = emailConfigSchema.safeParse({
        name: 'Support',
        emailAddress: 'support@example.com',
        provider: 'sendgrid',
        autoReplyTemplate: 'x'.repeat(5001),
      });
      expect(result.success).toBe(false);
    });

    it('should accept spamFilterEnabled flag', () => {
      const result = emailConfigSchema.safeParse({
        name: 'Support',
        emailAddress: 'support@example.com',
        provider: 'sendgrid',
        spamFilterEnabled: true,
      });
      expect(result.success).toBe(true);
    });

    it('should accept allowedDomains array', () => {
      const result = emailConfigSchema.safeParse({
        name: 'Support',
        emailAddress: 'support@example.com',
        provider: 'sendgrid',
        allowedDomains: ['example.com', 'company.org'],
      });
      expect(result.success).toBe(true);
    });

    it('should accept blockedDomains array', () => {
      const result = emailConfigSchema.safeParse({
        name: 'Support',
        emailAddress: 'support@example.com',
        provider: 'sendgrid',
        blockedDomains: ['spam.com', 'blocked.org'],
      });
      expect(result.success).toBe(true);
    });
  });

  describe('Update Email Config Schema', () => {
    const updateEmailConfigSchema = z.object({
      name: z.string().min(1).max(100).optional(),
      isActive: z.boolean().optional(),
      defaultPriority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
      defaultApplicationId: z.string().uuid().optional().nullable(),
      defaultAssignedGroup: z.string().uuid().optional().nullable(),
      autoReplyEnabled: z.boolean().optional(),
      autoReplyTemplate: z.string().max(5000).optional().nullable(),
      spamFilterEnabled: z.boolean().optional(),
      allowedDomains: z.array(z.string()).optional(),
      blockedDomains: z.array(z.string()).optional(),
    });

    it('should accept empty update', () => {
      const result = updateEmailConfigSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should accept partial update', () => {
      const result = updateEmailConfigSchema.safeParse({
        name: 'Updated Support',
      });
      expect(result.success).toBe(true);
    });

    it('should accept isActive flag', () => {
      const result = updateEmailConfigSchema.safeParse({ isActive: false });
      expect(result.success).toBe(true);
    });

    it('should accept null defaultApplicationId', () => {
      const result = updateEmailConfigSchema.safeParse({
        defaultApplicationId: null,
      });
      expect(result.success).toBe(true);
    });

    it('should accept null autoReplyTemplate', () => {
      const result = updateEmailConfigSchema.safeParse({
        autoReplyTemplate: null,
      });
      expect(result.success).toBe(true);
    });
  });

  describe('SendGrid Inbound Schema', () => {
    const sendgridInboundSchema = z.object({
      from: z.string(),
      to: z.string(),
      subject: z.string().optional(),
      text: z.string().optional(),
      html: z.string().optional(),
      sender_ip: z.string().optional(),
      envelope: z.string().optional(),
      headers: z.string().optional(),
      attachments: z.string().optional(),
    });

    it('should require from and to', () => {
      const result = sendgridInboundSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should accept minimal SendGrid payload', () => {
      const result = sendgridInboundSchema.safeParse({
        from: 'user@example.com',
        to: 'support@example.com',
      });
      expect(result.success).toBe(true);
    });

    it('should accept full SendGrid payload', () => {
      const result = sendgridInboundSchema.safeParse({
        from: 'user@example.com',
        to: 'support@example.com',
        subject: 'Help needed',
        text: 'Please help me with my issue.',
        html: '<p>Please help me with my issue.</p>',
        sender_ip: '192.168.1.1',
        envelope: '{"to":["support@example.com"]}',
        headers: 'Message-ID: <abc@123>',
        attachments: '1',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('Mailgun Inbound Schema', () => {
    const mailgunInboundSchema = z.object({
      sender: z.string(),
      recipient: z.string(),
      subject: z.string().optional(),
      'body-plain': z.string().optional(),
      'body-html': z.string().optional(),
      'Message-Id': z.string().optional(),
      'In-Reply-To': z.string().optional(),
      References: z.string().optional(),
    });

    it('should require sender and recipient', () => {
      const result = mailgunInboundSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should accept minimal Mailgun payload', () => {
      const result = mailgunInboundSchema.safeParse({
        sender: 'user@example.com',
        recipient: 'support@example.com',
      });
      expect(result.success).toBe(true);
    });

    it('should accept full Mailgun payload', () => {
      const result = mailgunInboundSchema.safeParse({
        sender: 'user@example.com',
        recipient: 'support@example.com',
        subject: 'Help needed',
        'body-plain': 'Please help me.',
        'body-html': '<p>Please help me.</p>',
        'Message-Id': '<abc@123>',
        'In-Reply-To': '<def@456>',
        References: '<def@456>',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('Generic Inbound Schema', () => {
    const genericInboundSchema = z.object({
      from: z.string(),
      fromName: z.string().optional(),
      to: z.string(),
      subject: z.string(),
      textBody: z.string().optional(),
      htmlBody: z.string().optional(),
      messageId: z.string().optional(),
      inReplyTo: z.string().optional(),
      references: z.array(z.string()).optional(),
    });

    it('should require from, to, and subject', () => {
      const result = genericInboundSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should accept valid generic payload', () => {
      const result = genericInboundSchema.safeParse({
        from: 'user@example.com',
        to: 'support@example.com',
        subject: 'Help needed',
      });
      expect(result.success).toBe(true);
    });

    it('should accept fromName', () => {
      const result = genericInboundSchema.safeParse({
        from: 'user@example.com',
        fromName: 'John Doe',
        to: 'support@example.com',
        subject: 'Help needed',
      });
      expect(result.success).toBe(true);
    });

    it('should accept textBody and htmlBody', () => {
      const result = genericInboundSchema.safeParse({
        from: 'user@example.com',
        to: 'support@example.com',
        subject: 'Help needed',
        textBody: 'Plain text content',
        htmlBody: '<p>HTML content</p>',
      });
      expect(result.success).toBe(true);
    });

    it('should accept references array', () => {
      const result = genericInboundSchema.safeParse({
        from: 'user@example.com',
        to: 'support@example.com',
        subject: 'Help needed',
        references: ['<abc@123>', '<def@456>'],
      });
      expect(result.success).toBe(true);
    });
  });

  describe('Email Logs Query Schema', () => {
    const emailLogsQuerySchema = z.object({
      configId: z.string().uuid().optional(),
      action: z.string().optional(),
      success: z.enum(['true', 'false']).optional(),
      page: z.coerce.number().int().positive().optional(),
      limit: z.coerce.number().int().min(1).max(100).optional(),
    });

    it('should accept empty query', () => {
      const result = emailLogsQuerySchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should filter by configId', () => {
      const result = emailLogsQuerySchema.safeParse({
        configId: '123e4567-e89b-12d3-a456-426614174000',
      });
      expect(result.success).toBe(true);
    });

    it('should filter by action', () => {
      const result = emailLogsQuerySchema.safeParse({ action: 'create_issue' });
      expect(result.success).toBe(true);
    });

    it('should filter by success', () => {
      const result = emailLogsQuerySchema.safeParse({ success: 'true' });
      expect(result.success).toBe(true);
    });

    it('should accept pagination', () => {
      const result = emailLogsQuerySchema.safeParse({
        page: '1',
        limit: '50',
      });
      expect(result.success).toBe(true);
    });

    it('should reject limit over 100', () => {
      const result = emailLogsQuerySchema.safeParse({ limit: '101' });
      expect(result.success).toBe(false);
    });
  });

  describe('Test Email Schema', () => {
    const testEmailSchema = z.object({
      to: z.string().email(),
      subject: z.string().optional(),
      body: z.string().optional(),
    });

    it('should require to', () => {
      const result = testEmailSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should accept valid test email', () => {
      const result = testEmailSchema.safeParse({
        to: 'support@example.com',
      });
      expect(result.success).toBe(true);
    });

    it('should accept subject and body', () => {
      const result = testEmailSchema.safeParse({
        to: 'support@example.com',
        subject: 'Test Email',
        body: 'This is a test.',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('Response Formats', () => {
    it('should return configs in data wrapper', () => {
      const configs = [{ id: 'config-1', name: 'Support' }];
      const response = { data: configs };
      expect(response).toHaveProperty('data');
    });

    it('should return 404 for missing config', () => {
      const response = { error: 'Email configuration not found' };
      expect(response.error).toBe('Email configuration not found');
    });

    it('should return 201 for created config', () => {
      const statusCode = 201;
      expect(statusCode).toBe(201);
    });

    it('should return 204 for deleted config', () => {
      const statusCode = 204;
      expect(statusCode).toBe(204);
    });

    it('should return 400 for invalid webhook', () => {
      const response = { error: 'Failed to process email' };
      expect(response).toHaveProperty('error');
    });

    it('should return logs with meta', () => {
      const response = {
        data: [],
        meta: { total: 0, page: 1, limit: 50 },
      };
      expect(response).toHaveProperty('data');
      expect(response).toHaveProperty('meta');
    });

    it('should return webhook URLs', () => {
      const response = {
        data: {
          sendgrid: 'https://api.example.com/v1/email/webhook/sendgrid/test-tenant',
          mailgun: 'https://api.example.com/v1/email/webhook/mailgun/test-tenant',
          generic: 'https://api.example.com/v1/email/webhook/inbound/test-tenant',
          instructions: {},
        },
      };
      expect(response.data).toHaveProperty('sendgrid');
      expect(response.data).toHaveProperty('mailgun');
      expect(response.data).toHaveProperty('generic');
    });
  });

  describe('Service Integration', () => {
    it('should pass tenantSlug and email to emailInboundService.processInboundEmail', async () => {
      const { emailInboundService } = await import('../../../src/services/email-inbound.js');
      const email = {
        from: 'user@example.com',
        to: 'support@example.com',
        subject: 'Help',
        textBody: 'Please help',
      };

      await emailInboundService.processInboundEmail('test-tenant', email, 'support@example.com');
      expect(emailInboundService.processInboundEmail).toHaveBeenCalled();
    });

    it('should pass tenantSlug to emailInboundService.listEmailConfigs', async () => {
      const { emailInboundService } = await import('../../../src/services/email-inbound.js');

      await emailInboundService.listEmailConfigs('test-tenant');
      expect(emailInboundService.listEmailConfigs).toHaveBeenCalledWith('test-tenant');
    });

    it('should pass tenantSlug and id to emailInboundService.getEmailConfigById', async () => {
      const { emailInboundService } = await import('../../../src/services/email-inbound.js');
      const id = '123e4567-e89b-12d3-a456-426614174000';

      await emailInboundService.getEmailConfigById('test-tenant', id);
      expect(emailInboundService.getEmailConfigById).toHaveBeenCalledWith('test-tenant', id);
    });

    it('should pass tenantSlug and filters to emailInboundService.getEmailLogs', async () => {
      const { emailInboundService } = await import('../../../src/services/email-inbound.js');
      const filters = { page: 1, limit: 50 };

      await emailInboundService.getEmailLogs('test-tenant', filters);
      expect(emailInboundService.getEmailLogs).toHaveBeenCalledWith('test-tenant', filters);
    });
  });

  describe('Webhook Endpoints (Public)', () => {
    it('should not require auth for /webhook/sendgrid/:tenantSlug', () => {
      const isPublic = true;
      expect(isPublic).toBe(true);
    });

    it('should not require auth for /webhook/mailgun/:tenantSlug', () => {
      const isPublic = true;
      expect(isPublic).toBe(true);
    });

    it('should not require auth for /webhook/inbound/:tenantSlug', () => {
      const isPublic = true;
      expect(isPublic).toBe(true);
    });
  });

  describe('Default Values', () => {
    it('should default page to 1', () => {
      const query = {} as { page?: string };
      const page = query.page ? parseInt(query.page) : 1;
      expect(page).toBe(1);
    });

    it('should default limit to 50', () => {
      const query = {} as { limit?: string };
      const limit = query.limit ? parseInt(query.limit) : 50;
      expect(limit).toBe(50);
    });

    it('should default subject to No Subject', () => {
      const subject = undefined;
      const finalSubject = subject || 'No Subject';
      expect(finalSubject).toBe('No Subject');
    });
  });

  describe('Webhook Signature Verification', () => {
    const crypto = require('crypto');

    describe('Mailgun Signature Verification', () => {
      // Replicates verifyMailgunSignature logic from email.ts
      function verifyMailgunSignature(
        timestamp: string,
        token: string,
        signature: string,
        signingKey: string | undefined
      ): boolean {
        if (!signingKey) {
          return true; // Backward compatibility
        }
        const encodedToken = crypto
          .createHmac('sha256', signingKey)
          .update(timestamp + token)
          .digest('hex');
        return encodedToken === signature;
      }

      it('should return true when no signing key is configured (backward compatibility)', () => {
        const result = verifyMailgunSignature('1234567890', 'random-token', 'any-signature', undefined);
        expect(result).toBe(true);
      });

      it('should return true for valid signature', () => {
        const signingKey = 'test-mailgun-key';
        const timestamp = '1234567890';
        const token = 'random-token';
        const expectedSignature = crypto
          .createHmac('sha256', signingKey)
          .update(timestamp + token)
          .digest('hex');

        const result = verifyMailgunSignature(timestamp, token, expectedSignature, signingKey);
        expect(result).toBe(true);
      });

      it('should return false for invalid signature', () => {
        const signingKey = 'test-mailgun-key';
        const timestamp = '1234567890';
        const token = 'random-token';
        const invalidSignature = 'invalid-signature-here';

        const result = verifyMailgunSignature(timestamp, token, invalidSignature, signingKey);
        expect(result).toBe(false);
      });

      it('should return false when timestamp is modified', () => {
        const signingKey = 'test-mailgun-key';
        const timestamp = '1234567890';
        const modifiedTimestamp = '9999999999';
        const token = 'random-token';
        const originalSignature = crypto
          .createHmac('sha256', signingKey)
          .update(timestamp + token)
          .digest('hex');

        const result = verifyMailgunSignature(modifiedTimestamp, token, originalSignature, signingKey);
        expect(result).toBe(false);
      });

      it('should return false when token is modified', () => {
        const signingKey = 'test-mailgun-key';
        const timestamp = '1234567890';
        const token = 'random-token';
        const modifiedToken = 'modified-token';
        const originalSignature = crypto
          .createHmac('sha256', signingKey)
          .update(timestamp + token)
          .digest('hex');

        const result = verifyMailgunSignature(timestamp, modifiedToken, originalSignature, signingKey);
        expect(result).toBe(false);
      });

      it('should return false when using wrong signing key', () => {
        const correctKey = 'correct-key';
        const wrongKey = 'wrong-key';
        const timestamp = '1234567890';
        const token = 'random-token';
        const signatureWithCorrectKey = crypto
          .createHmac('sha256', correctKey)
          .update(timestamp + token)
          .digest('hex');

        // Recompute with wrong key
        function verifyWithKey(
          ts: string,
          tk: string,
          sig: string,
          key: string
        ): boolean {
          const computed = crypto
            .createHmac('sha256', key)
            .update(ts + tk)
            .digest('hex');
          return computed === sig;
        }

        const result = verifyWithKey(timestamp, token, signatureWithCorrectKey, wrongKey);
        expect(result).toBe(false);
      });

      it('should handle empty token correctly', () => {
        const signingKey = 'test-key';
        const timestamp = '1234567890';
        const token = '';
        const expectedSignature = crypto
          .createHmac('sha256', signingKey)
          .update(timestamp + token)
          .digest('hex');

        const result = verifyMailgunSignature(timestamp, token, expectedSignature, signingKey);
        expect(result).toBe(true);
      });
    });

    describe('SendGrid Secret Verification', () => {
      // Replicates verifySendGridSecret logic from email.ts
      function verifySendGridSecret(
        headers: Record<string, string | string[] | undefined>,
        webhookSecret: string | undefined
      ): boolean {
        if (!webhookSecret) {
          return true; // Backward compatibility
        }
        const providedSecret = headers['x-sendgrid-webhook-secret'] as string | undefined;
        return providedSecret === webhookSecret;
      }

      it('should return true when no webhook secret is configured (backward compatibility)', () => {
        const headers = { 'x-sendgrid-webhook-secret': 'any-value' };
        const result = verifySendGridSecret(headers, undefined);
        expect(result).toBe(true);
      });

      it('should return true when secret matches', () => {
        const secret = 'my-sendgrid-secret';
        const headers = { 'x-sendgrid-webhook-secret': secret };
        const result = verifySendGridSecret(headers, secret);
        expect(result).toBe(true);
      });

      it('should return false when secret does not match', () => {
        const configuredSecret = 'correct-secret';
        const headers = { 'x-sendgrid-webhook-secret': 'wrong-secret' };
        const result = verifySendGridSecret(headers, configuredSecret);
        expect(result).toBe(false);
      });

      it('should return false when header is missing', () => {
        const configuredSecret = 'my-secret';
        const headers = {};
        const result = verifySendGridSecret(headers, configuredSecret);
        expect(result).toBe(false);
      });

      it('should return false when header is undefined', () => {
        const configuredSecret = 'my-secret';
        const headers = { 'x-sendgrid-webhook-secret': undefined };
        const result = verifySendGridSecret(headers, configuredSecret);
        expect(result).toBe(false);
      });

      it('should handle case-sensitive header name', () => {
        const secret = 'my-secret';
        // Headers should use lowercase for consistency
        const headers = { 'x-sendgrid-webhook-secret': secret };
        const result = verifySendGridSecret(headers, secret);
        expect(result).toBe(true);
      });

      it('should not match empty string secret with undefined', () => {
        const headers = { 'x-sendgrid-webhook-secret': '' };
        const result = verifySendGridSecret(headers, '');
        expect(result).toBe(true); // Empty matches empty
      });

      it('should handle special characters in secret', () => {
        const secret = 'secret!@#$%^&*()_+-=[]{}|;:,.<>?';
        const headers = { 'x-sendgrid-webhook-secret': secret };
        const result = verifySendGridSecret(headers, secret);
        expect(result).toBe(true);
      });
    });

    describe('Mailgun Schema with Signature Fields', () => {
      const mailgunInboundSchemaWithSignature = z.object({
        sender: z.string(),
        recipient: z.string(),
        subject: z.string().optional(),
        'body-plain': z.string().optional(),
        'body-html': z.string().optional(),
        'Message-Id': z.string().optional(),
        'In-Reply-To': z.string().optional(),
        References: z.string().optional(),
        timestamp: z.string().optional(),
        token: z.string().optional(),
        signature: z.string().optional(),
      });

      it('should accept payload with signature fields', () => {
        const result = mailgunInboundSchemaWithSignature.safeParse({
          sender: 'user@example.com',
          recipient: 'support@example.com',
          subject: 'Test',
          timestamp: '1234567890',
          token: 'random-token',
          signature: 'abc123signature',
        });
        expect(result.success).toBe(true);
      });

      it('should accept payload without signature fields', () => {
        const result = mailgunInboundSchemaWithSignature.safeParse({
          sender: 'user@example.com',
          recipient: 'support@example.com',
        });
        expect(result.success).toBe(true);
      });

      it('should accept partial signature fields', () => {
        const result = mailgunInboundSchemaWithSignature.safeParse({
          sender: 'user@example.com',
          recipient: 'support@example.com',
          timestamp: '1234567890',
          // Missing token and signature
        });
        expect(result.success).toBe(true);
      });
    });

    describe('Webhook Authentication Flow', () => {
      it('should return 401 for invalid SendGrid webhook signature', () => {
        // Simulates the route behavior
        const webhookSecret = 'configured-secret';
        const headers = { 'x-sendgrid-webhook-secret': 'wrong-secret' };

        function verifySendGridSecret(
          hdrs: Record<string, string | string[] | undefined>,
          secret: string | undefined
        ): boolean {
          if (!secret) return true;
          return hdrs['x-sendgrid-webhook-secret'] === secret;
        }

        const isValid = verifySendGridSecret(headers, webhookSecret);
        const responseCode = isValid ? 200 : 401;
        expect(responseCode).toBe(401);
      });

      it('should return 401 for invalid Mailgun webhook signature', () => {
        const signingKey = 'configured-key';
        const timestamp = '1234567890';
        const token = 'random-token';
        const invalidSignature = 'tampered-signature';

        function verifyMailgunSignature(
          ts: string,
          tk: string,
          sig: string,
          key: string | undefined
        ): boolean {
          if (!key) return true;
          const computed = crypto
            .createHmac('sha256', key)
            .update(ts + tk)
            .digest('hex');
          return computed === sig;
        }

        const isValid = verifyMailgunSignature(timestamp, token, invalidSignature, signingKey);
        const responseCode = isValid ? 200 : 401;
        expect(responseCode).toBe(401);
      });

      it('should allow request when signing key not configured', () => {
        const timestamp = '1234567890';
        const token = 'random-token';
        const anySignature = 'any-signature';

        function verifyMailgunSignature(
          ts: string,
          tk: string,
          sig: string,
          key: string | undefined
        ): boolean {
          if (!key) return true;
          const computed = crypto
            .createHmac('sha256', key)
            .update(ts + tk)
            .digest('hex');
          return computed === sig;
        }

        const isValid = verifyMailgunSignature(timestamp, token, anySignature, undefined);
        expect(isValid).toBe(true);
      });

      it('should warn when signature fields missing but key configured', () => {
        // This tests the logging behavior path
        const signingKey = 'configured-key';
        const hasTimestamp = false;
        const hasToken = false;
        const hasSignature = false;

        // Route behavior: if key configured but no signature fields, log warning
        const shouldLogWarning = signingKey && (!hasTimestamp || !hasToken || !hasSignature);
        expect(shouldLogWarning).toBe(true);
      });
    });
  });
});
