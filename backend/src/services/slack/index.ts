import { config } from '../../config/index.js';
import { logger } from '../../utils/logger.js';
import { pool } from '../../config/database.js';
import { tenantService } from '../tenant.js';

// ============================================
// SLACK MESSAGE BLOCKS
// ============================================

interface SlackBlock {
  type: string;
  text?: { type: string; text: string; emoji?: boolean };
  elements?: Array<{ type: string; text?: { type: string; text: string; emoji?: boolean }; url?: string; action_id?: string }>;
  fields?: Array<{ type: string; text: string }>;
  accessory?: unknown;
}

interface SlackMessage {
  text: string;
  blocks?: SlackBlock[];
  attachments?: Array<{ color: string; blocks?: SlackBlock[] }>;
}

// Slack message templates
const slackTemplates: Record<string, (data: Record<string, unknown>) => SlackMessage> = {
  sla_breach: (data) => ({
    text: `SLA Breach: Issue ${data.issueNumber} has breached its ${data.breachType} SLA`,
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: 'SLA Breach Alert', emoji: true },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `Issue *${data.issueNumber}* has breached its *${data.breachType}* SLA.`,
        },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Priority:*\n${(data.priority as string).toUpperCase()}` },
          { type: 'mrkdwn', text: `*Breach Type:*\n${data.breachType} Time` },
          { type: 'mrkdwn', text: `*Breached At:*\n${data.breachedAt}` },
        ],
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: 'View Issue', emoji: true },
            url: `${data.baseUrl}/issues/${data.issueId}`,
            action_id: 'view_issue',
          },
        ],
      },
    ],
    attachments: [{ color: '#dc2626', blocks: [] }],
  }),

  issue_assigned: (data) => ({
    text: `Issue ${data.issueNumber} has been assigned`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `Issue *${data.issueNumber}* has been assigned to <@${data.slackUserId || 'user'}>.`,
        },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Title:*\n${data.title}` },
          { type: 'mrkdwn', text: `*Priority:*\n${(data.priority as string).toUpperCase()}` },
        ],
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: 'View Issue', emoji: true },
            url: `${data.baseUrl}/issues/${data.issueId}`,
            action_id: 'view_issue',
          },
        ],
      },
    ],
  }),

  change_approval_required: (data) => ({
    text: `Change ${data.changeId} requires approval`,
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: 'Change Approval Required', emoji: true },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `Change request *${data.changeId}* requires approval.`,
        },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Title:*\n${data.title}` },
          { type: 'mrkdwn', text: `*Risk Level:*\n${(data.riskLevel as string).toUpperCase()}` },
          { type: 'mrkdwn', text: `*Scheduled:*\n${data.scheduledStart}` },
          { type: 'mrkdwn', text: `*Requested By:*\n${data.requestedBy}` },
        ],
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: 'Review Change', emoji: true },
            url: `${data.baseUrl}/changes/${data.changeUuid}/approve`,
            action_id: 'review_change',
          },
        ],
      },
    ],
    attachments: [{ color: '#d97706', blocks: [] }],
  }),

  change_approved: (data) => ({
    text: `Change ${data.changeId} has been approved`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `Change *${data.changeId}* has been approved by ${data.approvedBy}.`,
        },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Scheduled Start:*\n${data.scheduledStart}` },
        ],
      },
    ],
    attachments: [{ color: '#16a34a', blocks: [] }],
  }),

  change_rejected: (data) => ({
    text: `Change ${data.changeId} has been rejected`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `Change *${data.changeId}* has been rejected by ${data.rejectedBy}.`,
        },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Reason:*\n${data.reason || 'No reason provided'}` },
        ],
      },
    ],
    attachments: [{ color: '#dc2626', blocks: [] }],
  }),

  health_score_critical: (data) => ({
    text: `Critical health score alert for ${data.appName}`,
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: 'Critical Health Score Alert', emoji: true },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `Application *${data.appName}* has a critical health score of *${data.score}/100*.`,
        },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Trend:*\n${data.trend}` },
          { type: 'mrkdwn', text: `*Tier:*\n${data.tier}` },
        ],
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: 'View Application', emoji: true },
            url: `${data.baseUrl}/applications/${data.appId}`,
            action_id: 'view_application',
          },
        ],
      },
    ],
    attachments: [{ color: '#dc2626', blocks: [] }],
  }),

  report_ready: (data) => ({
    text: `Report "${data.reportName}" is ready`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `Report *${data.reportName}* has been generated and is ready for download.`,
        },
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: 'Download Report', emoji: true },
            url: `${data.baseUrl}/reports/${data.reportId}/download`,
            action_id: 'download_report',
          },
        ],
      },
    ],
    attachments: [{ color: '#2563eb', blocks: [] }],
  }),

  default: (data) => ({
    text: (data.message as string) || 'New notification from FireLater',
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: (data.message as string) || 'You have a new notification.',
        },
      },
    ],
  }),
};

function buildSlackMessage(type: string, data: Record<string, unknown>): SlackMessage {
  const baseUrl = config.isDev ? 'http://localhost:3000' : 'https://app.firelater.io';
  const templateData = { ...data, baseUrl };

  const templateFn = slackTemplates[type] || slackTemplates.default;
  return templateFn(templateData);
}

// ============================================
// SLACK SERVICE
// ============================================

export interface SendSlackOptions {
  webhookUrl?: string;
  channel?: string;
  type: string;
  data: Record<string, unknown>;
  tenantSlug?: string;
}

export interface SendSlackResult {
  success: boolean;
  error?: string;
}

class SlackService {
  private defaultWebhookUrl: string | undefined;

  constructor() {
    this.defaultWebhookUrl = config.slack.defaultWebhookUrl;
  }

  async send(options: SendSlackOptions): Promise<SendSlackResult> {
    const { webhookUrl, type, data, tenantSlug } = options;

    const targetWebhookUrl = webhookUrl || this.defaultWebhookUrl;

    if (!targetWebhookUrl) {
      logger.info({ type }, 'Slack message would be sent (webhook not configured)');
      return { success: true };
    }

    const message = buildSlackMessage(type, data);

    try {
      const response = await fetch(targetWebhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(message),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Slack API error: ${response.status} ${errorText}`);
      }

      logger.info({ type }, 'Slack message sent successfully');

      // Track delivery
      if (tenantSlug) {
        await this.trackDelivery(tenantSlug, type, 'sent');
      }

      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error({ err: error, type }, 'Failed to send Slack message');

      if (tenantSlug) {
        await this.trackDelivery(tenantSlug, type, 'failed', errorMessage);
      }

      return { success: false, error: errorMessage };
    }
  }

  async sendToChannel(
    channel: string,
    type: string,
    data: Record<string, unknown>,
    tenantSlug?: string
  ): Promise<SendSlackResult> {
    // This would use Slack Bot API instead of webhooks
    // For now, fall back to webhook
    return this.send({ type, data, tenantSlug });
  }

  private async trackDelivery(
    tenantSlug: string,
    type: string,
    status: 'sent' | 'failed',
    errorMessage?: string
  ): Promise<void> {
    try {
      const schema = tenantService.getSchemaName(tenantSlug);

      const tableExists = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_schema = $1
          AND table_name = 'notification_deliveries'
        )
      `, [schema.replace(/"/g, '')]);

      if (!tableExists.rows[0].exists) {
        return;
      }

      await pool.query(`
        INSERT INTO ${schema}.notification_deliveries (
          channel, recipient, notification_type, status, error_message
        ) VALUES ('slack', 'webhook', $1, $2, $3)
      `, [type, status, errorMessage || null]);
    } catch (error) {
      logger.debug({ err: error }, 'Failed to track Slack delivery');
    }
  }

  isReady(): boolean {
    return !!this.defaultWebhookUrl;
  }
}

export const slackService = new SlackService();
