import { config } from '../../config/index.js';
import { logger } from '../../utils/logger.js';
import { pool } from '../../config/database.js';
import { tenantService } from '../tenant.js';

// ============================================
// MICROSOFT TEAMS ADAPTIVE CARDS
// ============================================

interface AdaptiveCardElement {
  type: string;
  text?: string;
  size?: string;
  weight?: string;
  color?: string;
  wrap?: boolean;
  spacing?: string;
  columns?: AdaptiveCardElement[];
  width?: string;
  items?: AdaptiveCardElement[];
  facts?: Array<{ title: string; value: string }>;
  actions?: AdaptiveCardAction[];
  separator?: boolean;
  isSubtle?: boolean;
}

interface AdaptiveCardAction {
  type: string;
  title: string;
  url?: string;
  data?: Record<string, unknown>;
  style?: string;
}

interface AdaptiveCard {
  type: 'message';
  attachments: Array<{
    contentType: 'application/vnd.microsoft.card.adaptive';
    contentUrl: null;
    content: {
      $schema: 'http://adaptivecards.io/schemas/adaptive-card.json';
      type: 'AdaptiveCard';
      version: '1.4';
      body: AdaptiveCardElement[];
      actions?: AdaptiveCardAction[];
      msteams?: {
        width: 'Full';
      };
    };
  }>;
}

// Priority/Severity color mapping for Teams
const _priorityColors: Record<string, string> = {
  critical: 'attention',
  high: 'warning',
  medium: 'accent',
  low: 'good',
};

// Teams message templates using Adaptive Cards
const teamsTemplates: Record<string, (data: Record<string, unknown>) => AdaptiveCard> = {
  sla_breach: (data) => ({
    type: 'message',
    attachments: [{
      contentType: 'application/vnd.microsoft.card.adaptive',
      contentUrl: null,
      content: {
        $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
        type: 'AdaptiveCard',
        version: '1.4',
        msteams: { width: 'Full' },
        body: [
          {
            type: 'TextBlock',
            text: 'SLA Breach Alert',
            size: 'Large',
            weight: 'Bolder',
            color: 'Attention',
          },
          {
            type: 'TextBlock',
            text: `Issue **${data.issueNumber}** has breached its **${data.breachType}** SLA.`,
            wrap: true,
          },
          {
            type: 'FactSet',
            facts: [
              { title: 'Priority', value: (data.priority as string).toUpperCase() },
              { title: 'Breach Type', value: `${data.breachType} Time` },
              { title: 'Breached At', value: data.breachedAt as string },
            ],
          },
        ],
        actions: [
          {
            type: 'Action.OpenUrl',
            title: 'View Issue',
            url: `${data.baseUrl}/issues/${data.issueId}`,
          },
        ],
      },
    }],
  }),

  issue_assigned: (data) => ({
    type: 'message',
    attachments: [{
      contentType: 'application/vnd.microsoft.card.adaptive',
      contentUrl: null,
      content: {
        $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
        type: 'AdaptiveCard',
        version: '1.4',
        msteams: { width: 'Full' },
        body: [
          {
            type: 'TextBlock',
            text: 'Issue Assigned',
            size: 'Large',
            weight: 'Bolder',
          },
          {
            type: 'TextBlock',
            text: `Issue **${data.issueNumber}** has been assigned to **${data.assigneeName}**.`,
            wrap: true,
          },
          {
            type: 'FactSet',
            facts: [
              { title: 'Title', value: data.title as string },
              { title: 'Priority', value: (data.priority as string).toUpperCase() },
            ],
          },
        ],
        actions: [
          {
            type: 'Action.OpenUrl',
            title: 'View Issue',
            url: `${data.baseUrl}/issues/${data.issueId}`,
          },
        ],
      },
    }],
  }),

  change_approval_required: (data) => ({
    type: 'message',
    attachments: [{
      contentType: 'application/vnd.microsoft.card.adaptive',
      contentUrl: null,
      content: {
        $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
        type: 'AdaptiveCard',
        version: '1.4',
        msteams: { width: 'Full' },
        body: [
          {
            type: 'TextBlock',
            text: 'Change Approval Required',
            size: 'Large',
            weight: 'Bolder',
            color: 'Warning',
          },
          {
            type: 'TextBlock',
            text: `Change request **${data.changeId}** requires your approval.`,
            wrap: true,
          },
          {
            type: 'FactSet',
            facts: [
              { title: 'Title', value: data.title as string },
              { title: 'Risk Level', value: (data.riskLevel as string).toUpperCase() },
              { title: 'Scheduled', value: data.scheduledStart as string },
              { title: 'Requested By', value: data.requestedBy as string },
            ],
          },
        ],
        actions: [
          {
            type: 'Action.OpenUrl',
            title: 'Review Change',
            url: `${data.baseUrl}/changes/${data.changeUuid}/approve`,
            style: 'positive',
          },
        ],
      },
    }],
  }),

  change_approved: (data) => ({
    type: 'message',
    attachments: [{
      contentType: 'application/vnd.microsoft.card.adaptive',
      contentUrl: null,
      content: {
        $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
        type: 'AdaptiveCard',
        version: '1.4',
        msteams: { width: 'Full' },
        body: [
          {
            type: 'TextBlock',
            text: 'Change Approved',
            size: 'Large',
            weight: 'Bolder',
            color: 'Good',
          },
          {
            type: 'TextBlock',
            text: `Change **${data.changeId}** has been approved by **${data.approvedBy}**.`,
            wrap: true,
          },
          {
            type: 'FactSet',
            facts: [
              { title: 'Scheduled Start', value: data.scheduledStart as string },
            ],
          },
        ],
        actions: [
          {
            type: 'Action.OpenUrl',
            title: 'View Change',
            url: `${data.baseUrl}/changes/${data.changeUuid}`,
          },
        ],
      },
    }],
  }),

  change_rejected: (data) => ({
    type: 'message',
    attachments: [{
      contentType: 'application/vnd.microsoft.card.adaptive',
      contentUrl: null,
      content: {
        $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
        type: 'AdaptiveCard',
        version: '1.4',
        msteams: { width: 'Full' },
        body: [
          {
            type: 'TextBlock',
            text: 'Change Rejected',
            size: 'Large',
            weight: 'Bolder',
            color: 'Attention',
          },
          {
            type: 'TextBlock',
            text: `Change **${data.changeId}** has been rejected by **${data.rejectedBy}**.`,
            wrap: true,
          },
          {
            type: 'FactSet',
            facts: [
              { title: 'Reason', value: (data.reason as string) || 'No reason provided' },
            ],
          },
        ],
        actions: [
          {
            type: 'Action.OpenUrl',
            title: 'View Change',
            url: `${data.baseUrl}/changes/${data.changeUuid}`,
          },
        ],
      },
    }],
  }),

  health_score_critical: (data) => ({
    type: 'message',
    attachments: [{
      contentType: 'application/vnd.microsoft.card.adaptive',
      contentUrl: null,
      content: {
        $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
        type: 'AdaptiveCard',
        version: '1.4',
        msteams: { width: 'Full' },
        body: [
          {
            type: 'TextBlock',
            text: 'Critical Health Score Alert',
            size: 'Large',
            weight: 'Bolder',
            color: 'Attention',
          },
          {
            type: 'TextBlock',
            text: `Application **${data.appName}** has a critical health score of **${data.score}/100**.`,
            wrap: true,
          },
          {
            type: 'FactSet',
            facts: [
              { title: 'Trend', value: data.trend as string },
              { title: 'Tier', value: data.tier as string },
            ],
          },
        ],
        actions: [
          {
            type: 'Action.OpenUrl',
            title: 'View Application',
            url: `${data.baseUrl}/applications/${data.appId}`,
          },
        ],
      },
    }],
  }),

  oncall_shift_reminder: (data) => ({
    type: 'message',
    attachments: [{
      contentType: 'application/vnd.microsoft.card.adaptive',
      contentUrl: null,
      content: {
        $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
        type: 'AdaptiveCard',
        version: '1.4',
        msteams: { width: 'Full' },
        body: [
          {
            type: 'TextBlock',
            text: 'On-Call Shift Reminder',
            size: 'Large',
            weight: 'Bolder',
            color: 'Accent',
          },
          {
            type: 'TextBlock',
            text: `Your on-call shift for **${data.scheduleName}** starts in **${data.timeUntil}**.`,
            wrap: true,
          },
          {
            type: 'FactSet',
            facts: [
              { title: 'Shift Starts', value: data.shiftStart as string },
              { title: 'Shift Ends', value: data.shiftEnd as string },
            ],
          },
        ],
        actions: [
          {
            type: 'Action.OpenUrl',
            title: 'View Schedule',
            url: `${data.baseUrl}/oncall`,
          },
          {
            type: 'Action.OpenUrl',
            title: 'Request Swap',
            url: `${data.baseUrl}/oncall?tab=swaps`,
          },
        ],
      },
    }],
  }),

  shift_swap_request: (data) => ({
    type: 'message',
    attachments: [{
      contentType: 'application/vnd.microsoft.card.adaptive',
      contentUrl: null,
      content: {
        $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
        type: 'AdaptiveCard',
        version: '1.4',
        msteams: { width: 'Full' },
        body: [
          {
            type: 'TextBlock',
            text: 'Shift Swap Request',
            size: 'Large',
            weight: 'Bolder',
            color: 'Warning',
          },
          {
            type: 'TextBlock',
            text: `**${data.requesterName}** is requesting a shift swap for **${data.scheduleName}**.`,
            wrap: true,
          },
          {
            type: 'FactSet',
            facts: [
              { title: 'Original Shift', value: `${data.originalStart} - ${data.originalEnd}` },
              { title: 'Reason', value: (data.reason as string) || 'Not specified' },
            ],
          },
        ],
        actions: [
          {
            type: 'Action.OpenUrl',
            title: 'Accept Swap',
            url: `${data.baseUrl}/oncall?tab=swaps&action=accept&id=${data.swapId}`,
            style: 'positive',
          },
          {
            type: 'Action.OpenUrl',
            title: 'View Details',
            url: `${data.baseUrl}/oncall?tab=swaps`,
          },
        ],
      },
    }],
  }),

  cab_meeting_reminder: (data) => ({
    type: 'message',
    attachments: [{
      contentType: 'application/vnd.microsoft.card.adaptive',
      contentUrl: null,
      content: {
        $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
        type: 'AdaptiveCard',
        version: '1.4',
        msteams: { width: 'Full' },
        body: [
          {
            type: 'TextBlock',
            text: 'CAB Meeting Reminder',
            size: 'Large',
            weight: 'Bolder',
            color: 'Accent',
          },
          {
            type: 'TextBlock',
            text: `A CAB meeting is scheduled for **${data.meetingDate}**.`,
            wrap: true,
          },
          {
            type: 'FactSet',
            facts: [
              { title: 'Changes to Review', value: String(data.changeCount) },
              { title: 'Location', value: (data.location as string) || 'Virtual' },
            ],
          },
        ],
        actions: [
          {
            type: 'Action.OpenUrl',
            title: 'View Agenda',
            url: `${data.baseUrl}/changes/cab/${data.meetingId}`,
          },
          {
            type: 'Action.OpenUrl',
            title: 'Join Meeting',
            url: (data.meetingLink as string) || `${data.baseUrl}/changes/cab/${data.meetingId}`,
          },
        ],
      },
    }],
  }),

  issue_escalated: (data) => ({
    type: 'message',
    attachments: [{
      contentType: 'application/vnd.microsoft.card.adaptive',
      contentUrl: null,
      content: {
        $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
        type: 'AdaptiveCard',
        version: '1.4',
        msteams: { width: 'Full' },
        body: [
          {
            type: 'TextBlock',
            text: 'Issue Escalated',
            size: 'Large',
            weight: 'Bolder',
            color: 'Attention',
          },
          {
            type: 'TextBlock',
            text: `Issue **${data.issueNumber}** has been escalated to **${data.escalationLevel}**.`,
            wrap: true,
          },
          {
            type: 'FactSet',
            facts: [
              { title: 'Title', value: data.title as string },
              { title: 'Priority', value: (data.priority as string).toUpperCase() },
              { title: 'Reason', value: (data.reason as string) || 'SLA approaching breach' },
            ],
          },
        ],
        actions: [
          {
            type: 'Action.OpenUrl',
            title: 'Take Action',
            url: `${data.baseUrl}/issues/${data.issueId}`,
            style: 'destructive',
          },
          {
            type: 'Action.OpenUrl',
            title: 'Acknowledge',
            url: `${data.baseUrl}/issues/${data.issueId}?action=acknowledge`,
          },
        ],
      },
    }],
  }),

  daily_summary: (data) => ({
    type: 'message',
    attachments: [{
      contentType: 'application/vnd.microsoft.card.adaptive',
      contentUrl: null,
      content: {
        $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
        type: 'AdaptiveCard',
        version: '1.4',
        msteams: { width: 'Full' },
        body: [
          {
            type: 'TextBlock',
            text: 'Daily ITSM Summary',
            size: 'Large',
            weight: 'Bolder',
          },
          {
            type: 'TextBlock',
            text: `**${data.date}** summary`,
            wrap: true,
            isSubtle: true,
          },
          {
            type: 'ColumnSet',
            columns: [
              {
                type: 'Column',
                width: 'stretch',
                items: [
                  { type: 'TextBlock', text: 'Open Issues', weight: 'Bolder' },
                  { type: 'TextBlock', text: String(data.openIssues), size: 'ExtraLarge', color: 'Attention' },
                ],
              },
              {
                type: 'Column',
                width: 'stretch',
                items: [
                  { type: 'TextBlock', text: 'Resolved Today', weight: 'Bolder' },
                  { type: 'TextBlock', text: String(data.resolvedToday), size: 'ExtraLarge', color: 'Good' },
                ],
              },
              {
                type: 'Column',
                width: 'stretch',
                items: [
                  { type: 'TextBlock', text: 'Pending Changes', weight: 'Bolder' },
                  { type: 'TextBlock', text: String(data.pendingChanges), size: 'ExtraLarge', color: 'Warning' },
                ],
              },
              {
                type: 'Column',
                width: 'stretch',
                items: [
                  { type: 'TextBlock', text: 'SLA Breaches', weight: 'Bolder' },
                  { type: 'TextBlock', text: String(data.slaBreaches), size: 'ExtraLarge', color: 'Attention' },
                ],
              },
            ],
          },
        ],
        actions: [
          {
            type: 'Action.OpenUrl',
            title: 'View Dashboard',
            url: `${data.baseUrl}/dashboard`,
          },
        ],
      },
    }],
  }),

  default: (data) => ({
    type: 'message',
    attachments: [{
      contentType: 'application/vnd.microsoft.card.adaptive',
      contentUrl: null,
      content: {
        $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
        type: 'AdaptiveCard',
        version: '1.4',
        msteams: { width: 'Full' },
        body: [
          {
            type: 'TextBlock',
            text: 'FireLater Notification',
            size: 'Large',
            weight: 'Bolder',
          },
          {
            type: 'TextBlock',
            text: (data.message as string) || 'You have a new notification.',
            wrap: true,
          },
        ],
      },
    }],
  }),
};

function buildTeamsMessage(type: string, data: Record<string, unknown>): AdaptiveCard {
  const baseUrl = config.isDev ? 'http://localhost:3000' : 'https://app.firelater.io';
  const templateData = { ...data, baseUrl };

  const templateFn = teamsTemplates[type] || teamsTemplates.default;
  return templateFn(templateData);
}

// ============================================
// TEAMS SERVICE
// ============================================

export interface SendTeamsOptions {
  webhookUrl?: string;
  type: string;
  data: Record<string, unknown>;
  tenantSlug?: string;
}

export interface SendTeamsResult {
  success: boolean;
  error?: string;
}

class TeamsService {
  private defaultWebhookUrl: string | undefined;

  constructor() {
    this.defaultWebhookUrl = config.teams?.defaultWebhookUrl;
  }

  async send(options: SendTeamsOptions): Promise<SendTeamsResult> {
    const { webhookUrl, type, data, tenantSlug } = options;

    const targetWebhookUrl = webhookUrl || this.defaultWebhookUrl;

    if (!targetWebhookUrl) {
      logger.info({ type }, 'Teams message would be sent (webhook not configured)');
      return { success: true };
    }

    const message = buildTeamsMessage(type, data);

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
        throw new Error(`Teams API error: ${response.status} ${errorText}`);
      }

      logger.info({ type }, 'Teams message sent successfully');

      // Track delivery
      if (tenantSlug) {
        await this.trackDelivery(tenantSlug, type, 'sent');
      }

      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error({ err: error, type }, 'Failed to send Teams message');

      if (tenantSlug) {
        await this.trackDelivery(tenantSlug, type, 'failed', errorMessage);
      }

      return { success: false, error: errorMessage };
    }
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
        ) VALUES ('teams', 'webhook', $1, $2, $3)
      `, [type, status, errorMessage || null]);
    } catch (error) {
      logger.debug({ err: error }, 'Failed to track Teams delivery');
    }
  }

  isReady(): boolean {
    return !!this.defaultWebhookUrl;
  }
}

export const teamsService = new TeamsService();
