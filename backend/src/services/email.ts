import sgMail from '@sendgrid/mail';
import Handlebars from 'handlebars';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

// ============================================
// EMAIL SENDING SERVICE
// ============================================
// Handles outbound emails using SendGrid

// Initialize SendGrid if API key is available
if (config.email.sendgridApiKey) {
  sgMail.setApiKey(config.email.sendgridApiKey);
}

// Email templates
const templates = {
  passwordReset: Handlebars.compile(`
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Your Password</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #2563eb; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; }
    .button { display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
    .footer { padding: 20px; text-align: center; font-size: 12px; color: #6b7280; }
    .code { background: #e5e7eb; padding: 10px 20px; font-family: monospace; font-size: 18px; border-radius: 4px; display: inline-block; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>{{appName}}</h1>
    </div>
    <div class="content">
      <h2>Reset Your Password</h2>
      <p>Hello {{name}},</p>
      <p>We received a request to reset your password. Click the button below to create a new password:</p>
      <p style="text-align: center;">
        <a href="{{resetUrl}}" class="button">Reset Password</a>
      </p>
      <p>Or copy and paste this link into your browser:</p>
      <p style="word-break: break-all;"><a href="{{resetUrl}}">{{resetUrl}}</a></p>
      <p>This link will expire in <strong>1 hour</strong>.</p>
      <p>If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.</p>
    </div>
    <div class="footer">
      <p>This email was sent by {{appName}}. If you have questions, contact your administrator.</p>
    </div>
  </div>
</body>
</html>
`),

  emailVerification: Handlebars.compile(`
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify Your Email</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #059669; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; }
    .button { display: inline-block; background: #059669; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
    .footer { padding: 20px; text-align: center; font-size: 12px; color: #6b7280; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>{{appName}}</h1>
    </div>
    <div class="content">
      <h2>Verify Your Email Address</h2>
      <p>Hello {{name}},</p>
      <p>Welcome to {{appName}}! Please verify your email address by clicking the button below:</p>
      <p style="text-align: center;">
        <a href="{{verifyUrl}}" class="button">Verify Email</a>
      </p>
      <p>Or copy and paste this link into your browser:</p>
      <p style="word-break: break-all;"><a href="{{verifyUrl}}">{{verifyUrl}}</a></p>
      <p>This link will expire in <strong>24 hours</strong>.</p>
      <p>If you didn't create an account, you can safely ignore this email.</p>
    </div>
    <div class="footer">
      <p>This email was sent by {{appName}}. If you have questions, contact your administrator.</p>
    </div>
  </div>
</body>
</html>
`),

  issueCreated: Handlebars.compile(`
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Issue Created</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #7c3aed; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; }
    .button { display: inline-block; background: #7c3aed; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
    .footer { padding: 20px; text-align: center; font-size: 12px; color: #6b7280; }
    .issue-info { background: white; padding: 15px; border-radius: 6px; margin: 15px 0; border-left: 4px solid #7c3aed; }
    .label { color: #6b7280; font-size: 12px; text-transform: uppercase; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>{{appName}}</h1>
    </div>
    <div class="content">
      <h2>Issue Created: {{issueNumber}}</h2>
      <div class="issue-info">
        <p class="label">Title</p>
        <p><strong>{{title}}</strong></p>
        <p class="label">Priority</p>
        <p>{{priority}}</p>
        <p class="label">Status</p>
        <p>{{status}}</p>
      </div>
      <p style="text-align: center;">
        <a href="{{issueUrl}}" class="button">View Issue</a>
      </p>
    </div>
    <div class="footer">
      <p>Reply to this email to add a comment to the issue.</p>
    </div>
  </div>
</body>
</html>
`),

  issueUpdated: Handlebars.compile(`
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Issue Updated</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #0891b2; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; }
    .button { display: inline-block; background: #0891b2; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
    .footer { padding: 20px; text-align: center; font-size: 12px; color: #6b7280; }
    .changes { background: white; padding: 15px; border-radius: 6px; margin: 15px 0; }
    .change-item { padding: 8px 0; border-bottom: 1px solid #e5e7eb; }
    .change-item:last-child { border-bottom: none; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>{{appName}}</h1>
    </div>
    <div class="content">
      <h2>Issue Updated: {{issueNumber}}</h2>
      <p><strong>{{title}}</strong></p>
      <div class="changes">
        <h3>Changes Made</h3>
        {{#each changes}}
        <div class="change-item">
          <strong>{{field}}</strong>: {{from}} → {{to}}
        </div>
        {{/each}}
      </div>
      {{#if comment}}
      <div class="changes">
        <h3>Comment Added</h3>
        <p>{{comment}}</p>
      </div>
      {{/if}}
      <p style="text-align: center;">
        <a href="{{issueUrl}}" class="button">View Issue</a>
      </p>
    </div>
    <div class="footer">
      <p>Reply to this email to add a comment to the issue.</p>
    </div>
  </div>
</body>
</html>
`),

  changeApprovalRequired: Handlebars.compile(`
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Change Approval Required</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #dc2626; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; }
    .button { display: inline-block; background: #dc2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 10px 5px; }
    .button-approve { background: #059669; }
    .footer { padding: 20px; text-align: center; font-size: 12px; color: #6b7280; }
    .change-info { background: white; padding: 15px; border-radius: 6px; margin: 15px 0; border-left: 4px solid #dc2626; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>{{appName}}</h1>
    </div>
    <div class="content">
      <h2>Approval Required: {{changeNumber}}</h2>
      <div class="change-info">
        <p><strong>{{title}}</strong></p>
        <p><strong>Type:</strong> {{changeType}}</p>
        <p><strong>Risk:</strong> {{riskLevel}}</p>
        <p><strong>Scheduled:</strong> {{scheduledAt}}</p>
        <p><strong>Requested by:</strong> {{requestedBy}}</p>
      </div>
      <p>{{summary}}</p>
      <p style="text-align: center;">
        <a href="{{changeUrl}}" class="button">Review Change</a>
      </p>
    </div>
    <div class="footer">
      <p>This change requires your approval before it can proceed.</p>
    </div>
  </div>
</body>
</html>
`),

  onCallNotification: Handlebars.compile(`
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>On-Call Alert</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #ea580c; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; }
    .button { display: inline-block; background: #ea580c; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
    .footer { padding: 20px; text-align: center; font-size: 12px; color: #6b7280; }
    .alert { background: #fef2f2; border: 1px solid #fecaca; padding: 15px; border-radius: 6px; margin: 15px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>ON-CALL ALERT</h1>
    </div>
    <div class="content">
      <div class="alert">
        <h2>{{alertType}}</h2>
        <p><strong>{{message}}</strong></p>
      </div>
      <p><strong>Application:</strong> {{applicationName}}</p>
      <p><strong>Severity:</strong> {{severity}}</p>
      <p><strong>Time:</strong> {{timestamp}}</p>
      <p style="text-align: center;">
        <a href="{{issueUrl}}" class="button">Respond Now</a>
      </p>
    </div>
    <div class="footer">
      <p>You are receiving this because you are on-call for {{scheduleName}}.</p>
    </div>
  </div>
</body>
</html>
`),
};

export interface EmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  attachments?: Array<{
    filename: string;
    content: string | Buffer;
    contentType?: string;
  }>;
}

class EmailService {
  private isConfigured: boolean;
  private fromEmail: string;
  private fromName: string;
  private frontendUrl: string;
  private appName: string = 'FireLater';

  constructor() {
    this.isConfigured = !!(config.email.sendgridApiKey && config.email.from);
    this.fromEmail = config.email.from || 'noreply@firelater.io';
    this.fromName = config.email.fromName || 'FireLater';
    this.frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  }

  private async send(options: EmailOptions): Promise<boolean> {
    if (!this.isConfigured) {
      // Log email in development instead of sending
      logger.info({
        to: options.to,
        subject: options.subject,
        text: options.text?.substring(0, 200),
        mode: 'development',
      }, 'Email would be sent (SendGrid not configured)');
      return true;
    }

    try {
      await sgMail.send({
        to: options.to,
        from: {
          email: this.fromEmail,
          name: this.fromName,
        },
        subject: options.subject,
        html: options.html,
        text: options.text,
        replyTo: options.replyTo,
        attachments: options.attachments?.map(a => ({
          filename: a.filename,
          content: typeof a.content === 'string' ? a.content : a.content.toString('base64'),
          type: a.contentType,
          disposition: 'attachment',
        })),
      });

      logger.info({ to: options.to, subject: options.subject }, 'Email sent successfully');
      return true;
    } catch (error) {
      logger.error({ error, to: options.to, subject: options.subject }, 'Failed to send email');
      return false;
    }
  }

  async sendPasswordResetEmail(
    email: string,
    name: string,
    token: string,
    tenantSlug: string
  ): Promise<boolean> {
    const resetUrl = `${this.frontendUrl}/reset-password?token=${token}&tenant=${tenantSlug}`;

    const html = templates.passwordReset({
      appName: this.appName,
      name: name || 'User',
      resetUrl,
    });

    return this.send({
      to: email,
      subject: `Reset Your Password - ${this.appName}`,
      html,
      text: `Reset your password by visiting: ${resetUrl}. This link expires in 1 hour.`,
    });
  }

  async sendVerificationEmail(
    email: string,
    name: string,
    token: string,
    tenantSlug: string
  ): Promise<boolean> {
    const verifyUrl = `${this.frontendUrl}/verify-email?token=${token}&tenant=${tenantSlug}`;

    const html = templates.emailVerification({
      appName: this.appName,
      name: name || 'User',
      verifyUrl,
    });

    return this.send({
      to: email,
      subject: `Verify Your Email - ${this.appName}`,
      html,
      text: `Verify your email by visiting: ${verifyUrl}. This link expires in 24 hours.`,
    });
  }

  async sendIssueCreatedEmail(
    email: string,
    data: {
      issueNumber: string;
      title: string;
      priority: string;
      status: string;
      tenantSlug: string;
    }
  ): Promise<boolean> {
    const issueUrl = `${this.frontendUrl}/issues/${data.issueNumber}?tenant=${data.tenantSlug}`;

    const html = templates.issueCreated({
      appName: this.appName,
      issueNumber: data.issueNumber,
      title: data.title,
      priority: data.priority,
      status: data.status,
      issueUrl,
    });

    return this.send({
      to: email,
      subject: `[${data.issueNumber}] ${data.title}`,
      html,
      text: `Issue ${data.issueNumber} created: ${data.title}. Priority: ${data.priority}. View at: ${issueUrl}`,
    });
  }

  async sendIssueUpdatedEmail(
    email: string,
    data: {
      issueNumber: string;
      title: string;
      changes: Array<{ field: string; from: string; to: string }>;
      comment?: string;
      tenantSlug: string;
    }
  ): Promise<boolean> {
    const issueUrl = `${this.frontendUrl}/issues/${data.issueNumber}?tenant=${data.tenantSlug}`;

    const html = templates.issueUpdated({
      appName: this.appName,
      issueNumber: data.issueNumber,
      title: data.title,
      changes: data.changes,
      comment: data.comment,
      issueUrl,
    });

    const changesText = data.changes.map(c => `${c.field}: ${c.from} -> ${c.to}`).join(', ');

    return this.send({
      to: email,
      subject: `[${data.issueNumber}] Updated: ${data.title}`,
      html,
      text: `Issue ${data.issueNumber} updated. Changes: ${changesText}. View at: ${issueUrl}`,
    });
  }

  async sendChangeApprovalEmail(
    email: string,
    data: {
      changeNumber: string;
      title: string;
      changeType: string;
      riskLevel: string;
      scheduledAt: string;
      requestedBy: string;
      summary: string;
      tenantSlug: string;
    }
  ): Promise<boolean> {
    const changeUrl = `${this.frontendUrl}/changes/${data.changeNumber}?tenant=${data.tenantSlug}`;

    const html = templates.changeApprovalRequired({
      appName: this.appName,
      ...data,
      changeUrl,
    });

    return this.send({
      to: email,
      subject: `[APPROVAL REQUIRED] ${data.changeNumber}: ${data.title}`,
      html,
      text: `Change ${data.changeNumber} requires your approval. ${data.title}. Risk: ${data.riskLevel}. Review at: ${changeUrl}`,
    });
  }

  async sendOnCallAlert(
    email: string,
    data: {
      alertType: string;
      message: string;
      applicationName: string;
      severity: string;
      timestamp: string;
      scheduleName: string;
      issueNumber?: string;
      tenantSlug: string;
    }
  ): Promise<boolean> {
    const issueUrl = data.issueNumber
      ? `${this.frontendUrl}/issues/${data.issueNumber}?tenant=${data.tenantSlug}`
      : `${this.frontendUrl}/issues?tenant=${data.tenantSlug}`;

    const html = templates.onCallNotification({
      appName: this.appName,
      ...data,
      issueUrl,
    });

    return this.send({
      to: email,
      subject: `[ON-CALL ALERT] ${data.alertType}: ${data.applicationName}`,
      html,
      text: `ON-CALL ALERT: ${data.alertType}. ${data.message}. Application: ${data.applicationName}. Severity: ${data.severity}. Respond at: ${issueUrl}`,
    });
  }

  async sendBulkEmail(
    recipients: string[],
    subject: string,
    html: string,
    text?: string
  ): Promise<{ success: number; failed: number }> {
    let success = 0;
    let failed = 0;

    // Send in batches of 100 to avoid rate limits
    const batchSize = 100;
    for (let i = 0; i < recipients.length; i += batchSize) {
      const batch = recipients.slice(i, i + batchSize);

      const results = await Promise.allSettled(
        batch.map(email => this.send({ to: email, subject, html, text }))
      );

      for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
          success++;
        } else {
          failed++;
        }
      }
    }

    return { success, failed };
  }

  isReady(): boolean {
    return this.isConfigured;
  }
}

export const emailService = new EmailService();
