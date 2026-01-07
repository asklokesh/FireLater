import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import crypto from 'crypto';
import { emailInboundService, InboundEmail } from '../services/email-inbound.js';
import { logger } from '../utils/logger.js';

// ============================================
// EMAIL WEBHOOK & CONFIGURATION ROUTES
// ============================================

// Schemas
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

// SendGrid inbound parse webhook format
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

// Mailgun inbound webhook format
const mailgunInboundSchema = z.object({
  sender: z.string(),
  recipient: z.string(),
  subject: z.string().optional(),
  'body-plain': z.string().optional(),
  'body-html': z.string().optional(),
  'Message-Id': z.string().optional(),
  'In-Reply-To': z.string().optional(),
  References: z.string().optional(),
  // Signature fields for verification
  timestamp: z.string().optional(),
  token: z.string().optional(),
  signature: z.string().optional(),
});

// Generic inbound email format (for testing or custom integrations)
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

// ============================================
// WEBHOOK SIGNATURE VERIFICATION
// ============================================

/**
 * Verify Mailgun webhook signature
 * Mailgun sends: timestamp, token, signature in the request body
 * Signature = HMAC-SHA256(timestamp + token, signingKey)
 */
function verifyMailgunSignature(
  timestamp: string,
  token: string,
  signature: string,
  signingKey: string | undefined
): boolean {
  if (!signingKey) {
    // If no signing key configured, log warning but allow request (backward compatibility)
    logger.warn('Mailgun webhook signature verification skipped - no signing key configured');
    return true;
  }

  const encodedToken = crypto
    .createHmac('sha256', signingKey)
    .update(timestamp + token)
    .digest('hex');

  return encodedToken === signature;
}

/**
 * Verify SendGrid Event Webhook signature using a shared secret
 * SendGrid inbound parse doesn't have built-in signature verification,
 * but we implement basic verification using a configured webhook secret header
 */
function verifySendGridSecret(
  headers: Record<string, string | string[] | undefined>,
  webhookSecret: string | undefined
): boolean {
  if (!webhookSecret) {
    // If no secret configured, allow request (backward compatibility)
    logger.warn('SendGrid webhook secret verification skipped - no secret configured');
    return true;
  }

  // Check for custom verification header that can be configured in SendGrid
  const providedSecret = headers['x-sendgrid-webhook-secret'] as string | undefined;
  return providedSecret === webhookSecret;
}

export default async function emailRoutes(fastify: FastifyInstance) {
  // ============================================
  // WEBHOOK ENDPOINTS (Public - no auth required)
  // ============================================

  // SendGrid inbound parse webhook
  fastify.post('/webhook/sendgrid/:tenantSlug', {
    config: { rawBody: true },
  }, async (request, reply) => {
    const { tenantSlug } = request.params as { tenantSlug: string };

    try {
      // Verify webhook signature if configured
      const webhookSecret = process.env.SENDGRID_WEBHOOK_SECRET;
      if (!verifySendGridSecret(request.headers as Record<string, string | string[] | undefined>, webhookSecret)) {
        logger.warn({ tenantSlug }, 'SendGrid webhook signature verification failed');
        return reply.code(401).send({ error: 'Invalid webhook signature' });
      }

      // SendGrid sends form-encoded data
      const body = request.body as Record<string, string>;

      const parsed = sendgridInboundSchema.parse(body);

      // Parse envelope to get actual recipient
      let toAddress = parsed.to;
      if (parsed.envelope) {
        try {
          const envelope = JSON.parse(parsed.envelope);
          toAddress = envelope.to?.[0] || parsed.to;
        } catch {
          // Use parsed.to
        }
      }

      const email: InboundEmail = {
        from: parsed.from,
        to: toAddress,
        subject: parsed.subject || 'No Subject',
        textBody: parsed.text,
        htmlBody: parsed.html,
      };

      const result = await emailInboundService.processInboundEmail(tenantSlug, email, toAddress);

      return reply.send(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to process email';
      return reply.code(400).send({ error: message });
    }
  });

  // Mailgun inbound webhook
  fastify.post('/webhook/mailgun/:tenantSlug', async (request, reply) => {
    const { tenantSlug } = request.params as { tenantSlug: string };

    try {
      const body = request.body as Record<string, string>;
      const parsed = mailgunInboundSchema.parse(body);

      // Verify Mailgun webhook signature if credentials provided
      const signingKey = process.env.MAILGUN_WEBHOOK_SIGNING_KEY;
      if (parsed.timestamp && parsed.token && parsed.signature) {
        if (!verifyMailgunSignature(parsed.timestamp, parsed.token, parsed.signature, signingKey)) {
          logger.warn({ tenantSlug }, 'Mailgun webhook signature verification failed');
          return reply.code(401).send({ error: 'Invalid webhook signature' });
        }
      } else if (signingKey) {
        // If signing key is configured but signature fields are missing, warn
        logger.warn({ tenantSlug }, 'Mailgun webhook missing signature fields but signing key is configured');
      }

      const email: InboundEmail = {
        from: parsed.sender,
        to: parsed.recipient,
        subject: parsed.subject || 'No Subject',
        textBody: parsed['body-plain'],
        htmlBody: parsed['body-html'],
        messageId: parsed['Message-Id'],
        inReplyTo: parsed['In-Reply-To'],
        references: parsed.References ? parsed.References.split(/\s+/) : undefined,
      };

      const result = await emailInboundService.processInboundEmail(tenantSlug, email, parsed.recipient);

      return reply.send(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to process email';
      return reply.code(400).send({ error: message });
    }
  });

  // Generic/test inbound webhook (useful for testing)
  fastify.post('/webhook/inbound/:tenantSlug', async (request, reply) => {
    const { tenantSlug } = request.params as { tenantSlug: string };

    try {
      const parsed = genericInboundSchema.parse(request.body);

      const email: InboundEmail = {
        from: parsed.from,
        fromName: parsed.fromName,
        to: parsed.to,
        subject: parsed.subject,
        textBody: parsed.textBody,
        htmlBody: parsed.htmlBody,
        messageId: parsed.messageId,
        inReplyTo: parsed.inReplyTo,
        references: parsed.references,
      };

      const result = await emailInboundService.processInboundEmail(tenantSlug, email, parsed.to);

      return reply.send(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to process email';
      return reply.code(400).send({ error: message });
    }
  });

  // ============================================
  // CONFIGURATION ENDPOINTS (Authenticated)
  // ============================================

  // Require authentication for config management
  fastify.addHook('onRequest', async (request, reply) => {
    const path = request.url;

    // Skip auth for webhook endpoints
    if (path.includes('/webhook/')) {
      return;
    }

    const tenant = request.tenant!
    if (!tenant) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
  });

  // List email configurations
  fastify.get('/configs', async (request, _reply) => {
    const tenant = request.tenant!

    const configs = await emailInboundService.listEmailConfigs(tenant.slug);

    return { data: configs };
  });

  // Get single email configuration
  fastify.get('/configs/:id', async (request, reply) => {
    const tenant = request.tenant!
    const { id } = request.params as { id: string };

    const config = await emailInboundService.getEmailConfigById(tenant.slug, id);

    if (!config) {
      return reply.code(404).send({ error: 'Email configuration not found' });
    }

    return { data: config };
  });

  // Create email configuration
  fastify.post('/configs', async (request, reply) => {
    const tenant = request.tenant!
    const body = emailConfigSchema.parse(request.body);

    try {
      const config = await emailInboundService.createEmailConfig(tenant.slug, body);
      return reply.code(201).send({ data: config });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create email configuration';
      return reply.code(400).send({ error: message });
    }
  });

  // Update email configuration
  fastify.patch('/configs/:id', async (request, reply) => {
    const tenant = request.tenant!
    const { id } = request.params as { id: string };
    const body = updateEmailConfigSchema.parse(request.body);

    try {
      const config = await emailInboundService.updateEmailConfig(tenant.slug, id, body);

      if (!config) {
        return reply.code(404).send({ error: 'Email configuration not found' });
      }

      return { data: config };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update email configuration';
      return reply.code(400).send({ error: message });
    }
  });

  // Delete email configuration
  fastify.delete('/configs/:id', async (request, reply) => {
    const tenant = request.tenant!
    const { id } = request.params as { id: string };

    try {
      const deleted = await emailInboundService.deleteEmailConfig(tenant.slug, id);

      if (!deleted) {
        return reply.code(404).send({ error: 'Email configuration not found' });
      }

      return reply.code(204).send();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete email configuration';
      return reply.code(400).send({ error: message });
    }
  });

  // Get email logs
  fastify.get('/logs', async (request, _reply) => {
    const tenant = request.tenant!
    const query = request.query as {
      configId?: string;
      action?: string;
      success?: string;
      page?: string;
      limit?: string;
    };

    const result = await emailInboundService.getEmailLogs(tenant.slug, {
      configId: query.configId,
      action: query.action,
      success: query.success ? query.success === 'true' : undefined,
      page: query.page ? parseInt(query.page) : 1,
      limit: query.limit ? parseInt(query.limit) : 50,
    });

    return {
      data: result.logs,
      meta: {
        total: result.total,
        page: query.page ? parseInt(query.page) : 1,
        limit: query.limit ? parseInt(query.limit) : 50,
      },
    };
  });

  // Test webhook endpoint (for verifying setup)
  fastify.post('/test', async (request, reply) => {
    const tenant = request.tenant!
    const body = request.body as { to: string; subject?: string; body?: string };

    if (!body.to) {
      return reply.code(400).send({ error: 'Email address (to) is required' });
    }

    const testEmail: InboundEmail = {
      from: 'test@example.com',
      fromName: 'Test User',
      to: body.to,
      subject: body.subject || 'Test Email',
      textBody: body.body || 'This is a test email to verify the email-to-ticket integration.',
    };

    const result = await emailInboundService.processInboundEmail(tenant.slug, testEmail, body.to);

    return result;
  });

  // Get webhook URLs for setup instructions
  fastify.get('/webhook-urls', async (request, _reply) => {
    const tenant = request.tenant!
    const baseUrl = process.env.API_URL || `${request.protocol}://${request.hostname}`;

    return {
      data: {
        sendgrid: `${baseUrl}/v1/email/webhook/sendgrid/${tenant.slug}`,
        mailgun: `${baseUrl}/v1/email/webhook/mailgun/${tenant.slug}`,
        generic: `${baseUrl}/v1/email/webhook/inbound/${tenant.slug}`,
        instructions: {
          sendgrid: 'Configure SendGrid Inbound Parse to point to the SendGrid webhook URL. Enable text and html body fields.',
          mailgun: 'Configure Mailgun Routes to forward to the Mailgun webhook URL. Set up a receiving route matching your support email.',
          generic: 'Use the generic endpoint for testing or custom email integrations. Send POST requests with JSON body.',
        },
      },
    };
  });
}
