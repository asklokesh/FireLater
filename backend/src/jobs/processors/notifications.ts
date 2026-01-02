import { Job, Worker } from 'bullmq';
import { config } from '../../config/index.js';
import { pool } from '../../config/database.js';
import { logger } from '../../utils/logger.js';
import { tenantService } from '../../services/tenant.js';
import { emailService } from '../../services/email/index.js';
import { slackService } from '../../services/slack/index.js';

// Redis connection for worker
const connection = {
  host: new URL(config.redis.url).hostname || 'localhost',
  port: parseInt(new URL(config.redis.url).port || '6379', 10),
};

// ============================================
// JOB DATA TYPES
// ============================================

export interface NotificationJobData {
  tenantSlug: string;
  type: string;
  recipientIds?: string[];
  recipientEmails?: string[];
  channel?: 'email' | 'slack' | 'in_app' | 'all';
  subject?: string;
  message?: string;
  data?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface EmailDeliveryJobData {
  to: string;
  subject: string;
  html: string;
  text?: string;
  tenantSlug: string;
  notificationId?: string;
}

export interface SlackDeliveryJobData {
  webhookUrl: string;
  message: {
    text: string;
    blocks?: unknown[];
  };
  tenantSlug: string;
  notificationId?: string;
}

// ============================================
// NOTIFICATION TEMPLATES
// ============================================

interface NotificationTemplate {
  subject: string;
  html: string;
  text: string;
  slackText: string;
}

function getNotificationTemplate(type: string, data: Record<string, unknown>): NotificationTemplate {
  const templates: Record<string, () => NotificationTemplate> = {
    sla_breach: () => ({
      subject: `[ALERT] SLA Breach - ${data.issueNumber} (${data.priority})`,
      html: `
        <h2>SLA Breach Alert</h2>
        <p>Issue <strong>${data.issueNumber}</strong> has breached its ${data.breachType} SLA.</p>
        <ul>
          <li><strong>Priority:</strong> ${data.priority}</li>
          <li><strong>Breach Type:</strong> ${data.breachType}</li>
          <li><strong>Breached At:</strong> ${data.breachedAt}</li>
        </ul>
        <p>Please take immediate action.</p>
      `,
      text: `SLA Breach Alert: Issue ${data.issueNumber} (${data.priority}) has breached its ${data.breachType} SLA. Please take immediate action.`,
      slackText: `:warning: *SLA Breach*: Issue \`${data.issueNumber}\` (${data.priority}) has breached its ${data.breachType} SLA.`,
    }),

    sla_warning: () => ({
      subject: `[WARNING] SLA Approaching - ${data.issueNumber} (${data.priority})`,
      html: `
        <h2>SLA Warning</h2>
        <p>Issue <strong>${data.issueNumber}</strong> is approaching its ${data.warningType} SLA deadline.</p>
        <ul>
          <li><strong>Priority:</strong> ${data.priority}</li>
          <li><strong>Time Remaining:</strong> ${data.timeRemaining} minutes</li>
        </ul>
        <p>Please prioritize this issue to avoid SLA breach.</p>
      `,
      text: `SLA Warning: Issue ${data.issueNumber} (${data.priority}) has ${data.timeRemaining} minutes remaining before ${data.warningType} SLA breach.`,
      slackText: `:clock1: *SLA Warning*: Issue \`${data.issueNumber}\` (${data.priority}) has ${data.timeRemaining} minutes until SLA breach.`,
    }),

    issue_assigned: () => ({
      subject: `Issue Assigned - ${data.issueNumber}`,
      html: `
        <h2>Issue Assigned to You</h2>
        <p>Issue <strong>${data.issueNumber}</strong> has been assigned to you.</p>
        <ul>
          <li><strong>Title:</strong> ${data.title}</li>
          <li><strong>Priority:</strong> ${data.priority}</li>
        </ul>
      `,
      text: `Issue ${data.issueNumber} (${data.title}) has been assigned to you. Priority: ${data.priority}`,
      slackText: `:ticket: Issue \`${data.issueNumber}\` has been assigned to you: ${data.title}`,
    }),

    change_approval_required: () => ({
      subject: `Change Approval Required - ${data.changeId}`,
      html: `
        <h2>Change Approval Required</h2>
        <p>Change request <strong>${data.changeId}</strong> requires your approval.</p>
        <ul>
          <li><strong>Title:</strong> ${data.title}</li>
          <li><strong>Risk Level:</strong> ${data.riskLevel}</li>
          <li><strong>Scheduled:</strong> ${data.scheduledStart}</li>
        </ul>
      `,
      text: `Change ${data.changeId} (${data.title}) requires your approval. Risk: ${data.riskLevel}`,
      slackText: `:clipboard: Change \`${data.changeId}\` requires your approval: ${data.title} (Risk: ${data.riskLevel})`,
    }),

    change_approved: () => ({
      subject: `Change Approved - ${data.changeId}`,
      html: `
        <h2>Change Request Approved</h2>
        <p>Your change request <strong>${data.changeId}</strong> has been approved.</p>
        <ul>
          <li><strong>Approved By:</strong> ${data.approvedBy}</li>
          <li><strong>Scheduled Start:</strong> ${data.scheduledStart}</li>
        </ul>
      `,
      text: `Change ${data.changeId} has been approved by ${data.approvedBy}. Scheduled: ${data.scheduledStart}`,
      slackText: `:white_check_mark: Change \`${data.changeId}\` has been approved by ${data.approvedBy}`,
    }),

    change_rejected: () => ({
      subject: `Change Rejected - ${data.changeId}`,
      html: `
        <h2>Change Request Rejected</h2>
        <p>Your change request <strong>${data.changeId}</strong> has been rejected.</p>
        <ul>
          <li><strong>Rejected By:</strong> ${data.rejectedBy}</li>
          <li><strong>Reason:</strong> ${data.reason || 'Not specified'}</li>
        </ul>
      `,
      text: `Change ${data.changeId} has been rejected by ${data.rejectedBy}. Reason: ${data.reason || 'Not specified'}`,
      slackText: `:x: Change \`${data.changeId}\` has been rejected by ${data.rejectedBy}`,
    }),

    request_status_update: () => ({
      subject: `Request Update - ${data.requestId}`,
      html: `
        <h2>Service Request Update</h2>
        <p>Your service request <strong>${data.requestId}</strong> has been updated.</p>
        <ul>
          <li><strong>New Status:</strong> ${data.status}</li>
          <li><strong>Message:</strong> ${data.message || 'No additional message'}</li>
        </ul>
      `,
      text: `Request ${data.requestId} status updated to: ${data.status}`,
      slackText: `:package: Request \`${data.requestId}\` status updated: ${data.status}`,
    }),

    health_score_critical: () => ({
      subject: `[CRITICAL] Health Score Alert - ${data.appName}`,
      html: `
        <h2>Critical Health Score Alert</h2>
        <p>Application <strong>${data.appName}</strong> has a critical health score.</p>
        <ul>
          <li><strong>Current Score:</strong> ${data.score}</li>
          <li><strong>Trend:</strong> ${data.trend}</li>
        </ul>
        <p>Immediate attention required.</p>
      `,
      text: `CRITICAL: ${data.appName} health score is ${data.score}. Trend: ${data.trend}. Immediate attention required.`,
      slackText: `:rotating_light: *CRITICAL*: ${data.appName} health score dropped to ${data.score}`,
    }),

    report_ready: () => ({
      subject: `Report Ready - ${data.reportName}`,
      html: `
        <h2>Your Report is Ready</h2>
        <p>Report <strong>${data.reportName}</strong> has been generated.</p>
        <p>You can download it from the reports section.</p>
      `,
      text: `Report "${data.reportName}" is ready for download.`,
      slackText: `:bar_chart: Report "${data.reportName}" is ready`,
    }),

    default: () => ({
      subject: data.subject as string || 'FireLater Notification',
      html: `<p>${data.message || 'You have a new notification.'}</p>`,
      text: (data.message as string) || 'You have a new notification.',
      slackText: (data.message as string) || 'You have a new notification.',
    }),
  };

  const templateFn = templates[type] || templates.default;
  return templateFn();
}

// ============================================
// DELIVERY FUNCTIONS
// ============================================

async function sendEmail(data: EmailDeliveryJobData): Promise<boolean> {
  const result = await emailService.send({
    to: data.to,
    type: 'default',
    data: {
      subject: data.subject,
      message: data.text || data.html,
    },
    tenantSlug: data.tenantSlug,
  });

  return result.success;
}

async function sendSlackMessage(data: SlackDeliveryJobData): Promise<boolean> {
  const result = await slackService.send({
    webhookUrl: data.webhookUrl,
    type: 'default',
    data: {
      message: data.message.text,
    },
    tenantSlug: data.tenantSlug,
  });

  return result.success;
}

async function createInAppNotification(
  tenantSlug: string,
  userId: string,
  type: string,
  title: string,
  message: string,
  data?: Record<string, unknown>
): Promise<void> {
  const schema = tenantService.getSchemaName(tenantSlug);

  await pool.query(`
    INSERT INTO ${schema}.notifications (user_id, type, title, message, data)
    VALUES ($1, $2, $3, $4, $5)
  `, [userId, type, title, message, JSON.stringify(data || {})]);
}

// ============================================
// JOB PROCESSORS
// ============================================

async function processNotification(job: Job<NotificationJobData>): Promise<unknown> {
  const { tenantSlug, type, recipientIds, recipientEmails, channel = 'all', data = {} } = job.data;
  const schema = tenantService.getSchemaName(tenantSlug);

  logger.info({ jobId: job.id, type, channel, attemptNumber: job.attemptsMade }, 'Processing notification');

  // Get notification template
  const template = getNotificationTemplate(type, { ...data, ...job.data });

  const results = {
    inApp: 0,
    email: 0,
    slack: 0,
    errors: [] as string[],
  };

  // Get recipients
  let recipients: Array<{ id: string; email: string; notification_preferences?: unknown }> = [];

  try {
    if (recipientIds && recipientIds.length > 0) {
      const userResult = await pool.query(`
        SELECT id, email, notification_preferences
        FROM ${schema}.users
        WHERE id = ANY($1) AND status = 'active'
      `, [recipientIds]);
      recipients = userResult.rows;
    } else if (recipientEmails && recipientEmails.length > 0) {
      const userResult = await pool.query(`
        SELECT id, email, notification_preferences
        FROM ${schema}.users
        WHERE email = ANY($1) AND status = 'active'
      `, [recipientEmails]);
      recipients = userResult.rows;
    }
  } catch (error) {
    logger.error({ err: error, tenantSlug }, 'Failed to fetch recipients from database');
    throw new Error(`Database error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  // Process each recipient
  for (const recipient of recipients) {
    const prefs = (recipient.notification_preferences as Record<string, unknown>) || {};

    try {
      // In-app notification
      if (channel === 'all' || channel === 'in_app') {
        if (prefs.in_app !== false) {
          await createInAppNotification(
            tenantSlug,
            recipient.id,
            type,
            template.subject,
            template.text,
            data
          );
          results.inApp++;
        }
      }

      // Email notification
      if (channel === 'all' || channel === 'email') {
        if (prefs.email !== false) {
          try {
            const emailResult = await emailService.send({
              to: recipient.email,
              type,
              data: { ...data, ...job.data },
              tenantSlug,
            });
            if (emailResult.success) {
              results.email++;
            } else {
              results.errors.push(`${recipient.email}: Email delivery failed`);
            }
          } catch (emailError) {
            const errMsg = emailError instanceof Error ? emailError.message : 'Unknown email error';
            results.errors.push(`${recipient.email}: ${errMsg}`);
            logger.error({ err: emailError, recipientId: recipient.id }, 'Email delivery error');
          }
        }
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Unknown error';
      results.errors.push(`${recipient.email}: ${errMsg}`);
      logger.error({ err: error, recipientId: recipient.id }, 'Failed to send notification');
    }
  }

  // Slack notification (typically to a channel, not per-user)
  if (channel === 'all' || channel === 'slack') {
    const slackWebhook = (data as { slackWebhook?: string }).slackWebhook;
    if (slackWebhook) {
      try {
        const slackResult = await slackService.send({
          webhookUrl: slackWebhook,
          type,
          data: { ...data, ...job.data },
          tenantSlug,
        });
        if (slackResult.success) {
          results.slack++;
        } else {
          results.errors.push('Slack: Delivery failed');
        }
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        results.errors.push(`Slack: ${errMsg}`);
        logger.error({ err: error }, 'Slack delivery error');
      }
    }
  }

  // If all deliveries failed and we have recipients, throw error to trigger retry
  const totalSent = results.inApp + results.email + results.slack;
  const totalExpected = recipients.length * (channel === 'all' ? 2 : 1); // Rough estimate

  if (totalSent === 0 && recipients.length > 0 && results.errors.length > 0) {
    logger.error({ jobId: job.id, results }, 'All notification deliveries failed, will retry');
    throw new Error(`All deliveries failed: ${results.errors.slice(0, 3).join('; ')}`);
  }

  logger.info(
    { jobId: job.id, type, results },
    'Notification processing completed'
  );

  return results;
}

async function processEmailDelivery(job: Job<EmailDeliveryJobData>): Promise<boolean> {
  logger.info({ jobId: job.id, to: job.data.to, attemptNumber: job.attemptsMade }, 'Processing email delivery');

  try {
    const result = await sendEmail(job.data);

    if (!result) {
      throw new Error('Email delivery failed - will retry');
    }

    return result;
  } catch (error) {
    logger.error({ err: error, jobId: job.id, to: job.data.to }, 'Email delivery error');
    throw error; // Re-throw to trigger BullMQ retry
  }
}

async function processSlackDelivery(job: Job<SlackDeliveryJobData>): Promise<boolean> {
  logger.info({ jobId: job.id, attemptNumber: job.attemptsMade }, 'Processing Slack delivery');

  try {
    const result = await sendSlackMessage(job.data);

    if (!result) {
      throw new Error('Slack delivery failed - will retry');
    }

    return result;
  } catch (error) {
    logger.error({ err: error, jobId: job.id }, 'Slack delivery error');
    throw error; // Re-throw to trigger BullMQ retry
  }
}

// ============================================
// WORKER
// ============================================

export const notificationWorker = new Worker<NotificationJobData | EmailDeliveryJobData | SlackDeliveryJobData>(
  'notifications',
  async (job) => {
    switch (job.name) {
      case 'send-notification':
      case 'sla-breach':
      case 'sla-warning':
      case 'issue-assigned':
      case 'change-approval':
      case 'request-update':
      case 'health-alert':
      case 'report-ready':
        return processNotification(job as Job<NotificationJobData>);
      case 'email-delivery':
        return processEmailDelivery(job as Job<EmailDeliveryJobData>);
      case 'slack-delivery':
        return processSlackDelivery(job as Job<SlackDeliveryJobData>);
      default:
        // Default to notification processing
        return processNotification(job as Job<NotificationJobData>);
    }
  },
  {
    connection,
    concurrency: 5,
    limiter: {
      max: 50,
      duration: 60000, // 50 per minute
    },
  }
);

notificationWorker.on('completed', (job) => {
  logger.debug({ jobId: job.id, jobName: job.name }, 'Notification job completed');
});

notificationWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, jobName: job?.name, err }, 'Notification job failed');
});

// ============================================
// HELPER FUNCTIONS
// ============================================

export async function queueNotification(
  tenantSlug: string,
  type: string,
  options: {
    recipientIds?: string[];
    recipientEmails?: string[];
    channel?: 'email' | 'slack' | 'in_app' | 'all';
    data?: Record<string, unknown>;
    priority?: number;
  }
): Promise<string> {
  const { notificationQueue } = await import('../queues.js');

  const job = await notificationQueue.add(
    'send-notification',
    {
      tenantSlug,
      type,
      ...options,
    },
    {
      priority: options.priority || 2,
      attempts: 5,
      backoff: {
        type: 'exponential',
        delay: 2000, // Start with 2 seconds, doubles each retry
      },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 500 },
    }
  );

  return job.id || '';
}
