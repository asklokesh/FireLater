import sgMail from '@sendgrid/mail';
import Handlebars from 'handlebars';
import { config } from '../../config/index.js';
import { logger } from '../../utils/logger.js';
import { pool } from '../../config/database.js';
import { tenantService } from '../tenant.js';

// Initialize SendGrid if API key is provided
if (config.email.sendgridApiKey) {
  sgMail.setApiKey(config.email.sendgridApiKey);
}

// ============================================
// EMAIL TEMPLATES
// ============================================

interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

// Cache compiled templates
const templateCache: Map<string, Handlebars.TemplateDelegate> = new Map();

// Base HTML template (inline to avoid file system issues)
const baseTemplateHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{subject}}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f5f5f5; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: #1a56db; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
    .header h1 { margin: 0; font-size: 24px; }
    .content { background-color: white; padding: 30px; border-radius: 0 0 8px 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .alert-critical { background-color: #fef2f2; border-left: 4px solid #dc2626; padding: 15px; margin: 15px 0; }
    .alert-warning { background-color: #fffbeb; border-left: 4px solid #d97706; padding: 15px; margin: 15px 0; }
    .alert-info { background-color: #eff6ff; border-left: 4px solid #2563eb; padding: 15px; margin: 15px 0; }
    .alert-success { background-color: #f0fdf4; border-left: 4px solid #16a34a; padding: 15px; margin: 15px 0; }
    .button { display: inline-block; background-color: #1a56db; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 15px 0; }
    .details { background-color: #f9fafb; padding: 15px; border-radius: 6px; margin: 15px 0; }
    .details table { width: 100%; border-collapse: collapse; }
    .details td { padding: 8px 0; border-bottom: 1px solid #e5e7eb; }
    .details td:first-child { font-weight: 600; width: 40%; }
    .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 12px; }
    .footer a { color: #1a56db; text-decoration: none; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header"><h1>FireLater</h1></div>
    <div class="content">{{{body}}}</div>
    <div class="footer">
      <p>This email was sent by FireLater IT Service Management</p>
      <p><a href="{{baseUrl}}">Visit Dashboard</a> | <a href="{{baseUrl}}/settings/notifications">Notification Settings</a></p>
    </div>
  </div>
</body>
</html>`;

// Load and compile base template
function loadBaseTemplate(): Handlebars.TemplateDelegate {
  const cached = templateCache.get('base');
  if (cached) return cached;

  const compiled = Handlebars.compile(baseTemplateHtml);
  templateCache.set('base', compiled);
  return compiled;
}

// Register Handlebars helpers
Handlebars.registerHelper('eq', (a, b) => a === b);
Handlebars.registerHelper('formatDate', (date) => {
  return new Date(date).toLocaleString();
});
Handlebars.registerHelper('uppercase', (str) => str?.toUpperCase());

// Inline templates for different notification types
const inlineTemplates: Record<string, { subject: string; body: string; text: string }> = {
  sla_breach: {
    subject: '[ALERT] SLA Breach - {{issueNumber}} ({{priority}})',
    body: `
      <div class="alert-critical">
        <h2>SLA Breach Alert</h2>
        <p>Issue <strong>{{issueNumber}}</strong> has breached its {{breachType}} SLA.</p>
      </div>
      <div class="details">
        <table>
          <tr><td>Issue ID</td><td>{{issueNumber}}</td></tr>
          <tr><td>Priority</td><td>{{uppercase priority}}</td></tr>
          <tr><td>Breach Type</td><td>{{breachType}} Time</td></tr>
          <tr><td>Breached At</td><td>{{formatDate breachedAt}}</td></tr>
        </table>
      </div>
      <p>Please take immediate action to address this issue.</p>
      <a href="{{baseUrl}}/issues/{{issueId}}" class="button">View Issue</a>
    `,
    text: 'SLA Breach Alert: Issue {{issueNumber}} ({{priority}}) has breached its {{breachType}} SLA. Please take immediate action.',
  },

  issue_assigned: {
    subject: 'Issue Assigned - {{issueNumber}}',
    body: `
      <div class="alert-info">
        <h2>Issue Assigned to You</h2>
        <p>Issue <strong>{{issueNumber}}</strong> has been assigned to you.</p>
      </div>
      <div class="details">
        <table>
          <tr><td>Issue ID</td><td>{{issueNumber}}</td></tr>
          <tr><td>Title</td><td>{{title}}</td></tr>
          <tr><td>Priority</td><td>{{uppercase priority}}</td></tr>
          <tr><td>Application</td><td>{{applicationName}}</td></tr>
        </table>
      </div>
      <a href="{{baseUrl}}/issues/{{issueId}}" class="button">View Issue</a>
    `,
    text: 'Issue {{issueNumber}} ({{title}}) has been assigned to you. Priority: {{priority}}',
  },

  issue_updated: {
    subject: 'Issue Updated - {{issueNumber}}',
    body: `
      <div class="alert-info">
        <h2>Issue Updated</h2>
        <p>Issue <strong>{{issueNumber}}</strong> has been updated.</p>
      </div>
      <div class="details">
        <table>
          <tr><td>Issue ID</td><td>{{issueNumber}}</td></tr>
          <tr><td>Title</td><td>{{title}}</td></tr>
          <tr><td>Status</td><td>{{status}}</td></tr>
          <tr><td>Updated By</td><td>{{updatedBy}}</td></tr>
        </table>
      </div>
      {{#if comment}}
      <div class="details">
        <p><strong>Comment:</strong></p>
        <p>{{comment}}</p>
      </div>
      {{/if}}
      <a href="{{baseUrl}}/issues/{{issueId}}" class="button">View Issue</a>
    `,
    text: 'Issue {{issueNumber}} has been updated. Status: {{status}}',
  },

  change_approval_required: {
    subject: 'Change Approval Required - {{changeId}}',
    body: `
      <div class="alert-warning">
        <h2>Change Approval Required</h2>
        <p>Change request <strong>{{changeId}}</strong> requires your approval.</p>
      </div>
      <div class="details">
        <table>
          <tr><td>Change ID</td><td>{{changeId}}</td></tr>
          <tr><td>Title</td><td>{{title}}</td></tr>
          <tr><td>Risk Level</td><td>{{uppercase riskLevel}}</td></tr>
          <tr><td>Scheduled Start</td><td>{{formatDate scheduledStart}}</td></tr>
          <tr><td>Scheduled End</td><td>{{formatDate scheduledEnd}}</td></tr>
          <tr><td>Requested By</td><td>{{requestedBy}}</td></tr>
        </table>
      </div>
      <a href="{{baseUrl}}/changes/{{changeUuid}}/approve" class="button">Review Change</a>
    `,
    text: 'Change {{changeId}} ({{title}}) requires your approval. Risk: {{riskLevel}}. Scheduled: {{scheduledStart}}',
  },

  change_approved: {
    subject: 'Change Approved - {{changeId}}',
    body: `
      <div class="alert-success">
        <h2>Change Request Approved</h2>
        <p>Your change request <strong>{{changeId}}</strong> has been approved.</p>
      </div>
      <div class="details">
        <table>
          <tr><td>Change ID</td><td>{{changeId}}</td></tr>
          <tr><td>Approved By</td><td>{{approvedBy}}</td></tr>
          <tr><td>Scheduled Start</td><td>{{formatDate scheduledStart}}</td></tr>
        </table>
      </div>
      <a href="{{baseUrl}}/changes/{{changeUuid}}" class="button">View Change</a>
    `,
    text: 'Change {{changeId}} has been approved by {{approvedBy}}. Scheduled: {{scheduledStart}}',
  },

  change_rejected: {
    subject: 'Change Rejected - {{changeId}}',
    body: `
      <div class="alert-critical">
        <h2>Change Request Rejected</h2>
        <p>Your change request <strong>{{changeId}}</strong> has been rejected.</p>
      </div>
      <div class="details">
        <table>
          <tr><td>Change ID</td><td>{{changeId}}</td></tr>
          <tr><td>Rejected By</td><td>{{rejectedBy}}</td></tr>
          <tr><td>Reason</td><td>{{reason}}</td></tr>
        </table>
      </div>
      <a href="{{baseUrl}}/changes/{{changeUuid}}" class="button">View Change</a>
    `,
    text: 'Change {{changeId}} has been rejected by {{rejectedBy}}. Reason: {{reason}}',
  },

  request_status_update: {
    subject: 'Request Update - {{requestId}}',
    body: `
      <div class="alert-info">
        <h2>Service Request Update</h2>
        <p>Your service request <strong>{{requestId}}</strong> has been updated.</p>
      </div>
      <div class="details">
        <table>
          <tr><td>Request ID</td><td>{{requestId}}</td></tr>
          <tr><td>New Status</td><td>{{status}}</td></tr>
          {{#if message}}
          <tr><td>Message</td><td>{{message}}</td></tr>
          {{/if}}
        </table>
      </div>
      <a href="{{baseUrl}}/requests/{{requestUuid}}" class="button">View Request</a>
    `,
    text: 'Request {{requestId}} status updated to: {{status}}',
  },

  health_score_critical: {
    subject: '[CRITICAL] Health Score Alert - {{appName}}',
    body: `
      <div class="alert-critical">
        <h2>Critical Health Score Alert</h2>
        <p>Application <strong>{{appName}}</strong> has a critical health score.</p>
      </div>
      <div class="details">
        <table>
          <tr><td>Application</td><td>{{appName}}</td></tr>
          <tr><td>Current Score</td><td>{{score}}/100</td></tr>
          <tr><td>Trend</td><td>{{trend}}</td></tr>
          <tr><td>Tier</td><td>{{tier}}</td></tr>
        </table>
      </div>
      <p>Immediate attention is required to address the issues affecting this application.</p>
      <a href="{{baseUrl}}/applications/{{appId}}" class="button">View Application</a>
    `,
    text: 'CRITICAL: {{appName}} health score is {{score}}. Trend: {{trend}}. Immediate attention required.',
  },

  report_ready: {
    subject: 'Report Ready - {{reportName}}',
    body: `
      <div class="alert-success">
        <h2>Your Report is Ready</h2>
        <p>Report <strong>{{reportName}}</strong> has been generated successfully.</p>
      </div>
      <div class="details">
        <table>
          <tr><td>Report Name</td><td>{{reportName}}</td></tr>
          <tr><td>Generated At</td><td>{{formatDate generatedAt}}</td></tr>
          <tr><td>Format</td><td>{{format}}</td></tr>
        </table>
      </div>
      <a href="{{baseUrl}}/reports/{{reportId}}/download" class="button">Download Report</a>
    `,
    text: 'Report "{{reportName}}" is ready for download.',
  },

  welcome: {
    subject: 'Welcome to FireLater - {{tenantName}}',
    body: `
      <h2>Welcome to FireLater!</h2>
      <p>Hello {{userName}},</p>
      <p>Your account has been created for <strong>{{tenantName}}</strong>.</p>
      <div class="details">
        <table>
          <tr><td>Email</td><td>{{email}}</td></tr>
          <tr><td>Role</td><td>{{role}}</td></tr>
        </table>
      </div>
      <p>Get started by exploring your dashboard and setting up your preferences.</p>
      <a href="{{baseUrl}}/login" class="button">Login to Dashboard</a>
    `,
    text: 'Welcome to FireLater, {{userName}}! Your account has been created for {{tenantName}}.',
  },

  password_reset: {
    subject: 'Password Reset Request - FireLater',
    body: `
      <h2>Password Reset Request</h2>
      <p>We received a request to reset your password for your FireLater account.</p>
      <p>Click the button below to reset your password. This link will expire in 1 hour.</p>
      <a href="{{resetUrl}}" class="button">Reset Password</a>
      <p>If you didn't request this, you can safely ignore this email.</p>
    `,
    text: 'Password reset requested. Click here to reset: {{resetUrl}}. Link expires in 1 hour.',
  },
};

function compileTemplate(type: string, data: Record<string, unknown>): EmailTemplate {
  const template = inlineTemplates[type] || {
    subject: data.subject as string || 'FireLater Notification',
    body: `<p>${data.message || 'You have a new notification.'}</p>`,
    text: (data.message as string) || 'You have a new notification.',
  };

  // Compile subject
  const subjectTemplate = Handlebars.compile(template.subject);
  const subject = subjectTemplate(data);

  // Compile body content
  const bodyTemplate = Handlebars.compile(template.body);
  const bodyContent = bodyTemplate(data);

  // Wrap in base template
  const baseTemplate = loadBaseTemplate();
  const html = baseTemplate({ subject, body: bodyContent, ...data });

  // Compile plain text
  const textTemplate = Handlebars.compile(template.text);
  const text = textTemplate(data);

  return { subject, html, text };
}

// ============================================
// EMAIL SERVICE
// ============================================

export interface SendEmailOptions {
  to: string | string[];
  type: string;
  data: Record<string, unknown>;
  tenantSlug?: string;
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

class EmailService {
  private isConfigured: boolean;

  constructor() {
    this.isConfigured = !!config.email.sendgridApiKey && !!config.email.from;
  }

  async send(options: SendEmailOptions): Promise<SendEmailResult> {
    const { to, type, data, tenantSlug } = options;

    // Add base URL to data - use environment variable or sensible default
    const baseUrl = process.env.APP_BASE_URL || (config.isDev ? 'http://localhost:3000' : 'https://app.firelater.io');
    const templateData = { ...data, baseUrl };

    // Compile template
    const { subject, html, text } = compileTemplate(type, templateData);

    if (!this.isConfigured) {
      logger.warn({ to, subject, type }, 'Email not sent - SendGrid not configured');
      return {
        success: false,
        error: 'Email service not configured. Set SENDGRID_API_KEY environment variable.',
      };
    }

    try {
      const recipients = Array.isArray(to) ? to : [to];

      const msg = {
        to: recipients,
        from: {
          email: config.email.from!,
          name: config.email.fromName,
        },
        subject,
        html,
        text,
      };

      const [response] = await sgMail.send(msg);

      logger.info(
        { to, subject, statusCode: response.statusCode },
        'Email sent successfully'
      );

      // Track delivery if tenant provided
      if (tenantSlug) {
        await this.trackDelivery(tenantSlug, recipients, type, 'sent');
      }

      return {
        success: true,
        messageId: response.headers['x-message-id'] as string,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error({ err: error, to, subject }, 'Failed to send email');

      // Track failure if tenant provided
      if (tenantSlug) {
        const recipients = Array.isArray(to) ? to : [to];
        await this.trackDelivery(tenantSlug, recipients, type, 'failed', errorMessage);
      }

      return { success: false, error: errorMessage };
    }
  }

  async sendBatch(
    recipients: Array<{ email: string; data: Record<string, unknown> }>,
    type: string,
    commonData: Record<string, unknown>,
    tenantSlug?: string
  ): Promise<{ sent: number; failed: number }> {
    let sent = 0;
    let failed = 0;

    for (const recipient of recipients) {
      const result = await this.send({
        to: recipient.email,
        type,
        data: { ...commonData, ...recipient.data },
        tenantSlug,
      });

      if (result.success) {
        sent++;
      } else {
        failed++;
      }
    }

    return { sent, failed };
  }

  private async trackDelivery(
    tenantSlug: string,
    recipients: string[],
    type: string,
    status: 'sent' | 'failed' | 'delivered' | 'bounced',
    errorMessage?: string
  ): Promise<void> {
    try {
      const schema = tenantService.getSchemaName(tenantSlug);

      // Check if notification_deliveries table exists
      const tableExists = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_schema = $1
          AND table_name = 'notification_deliveries'
        )
      `, [schema.replace(/"/g, '')]);

      if (!tableExists.rows[0].exists) {
        return; // Table doesn't exist yet, skip tracking
      }

      for (const email of recipients) {
        await pool.query(`
          INSERT INTO ${schema}.notification_deliveries (
            channel, recipient, notification_type, status, error_message
          ) VALUES ('email', $1, $2, $3, $4)
        `, [email, type, status, errorMessage || null]);
      }
    } catch (error) {
      logger.debug({ err: error }, 'Failed to track email delivery');
    }
  }

  isReady(): boolean {
    return this.isConfigured;
  }
}

export const emailService = new EmailService();
