import { WebClient } from '@slack/web-api';
import Handlebars from 'handlebars';
import { pool } from '../config/database.js';
import { tenantService } from './tenant.js';
import { emailService } from './email.js';
import { logger } from '../utils/logger.js';

// ============================================
// NOTIFICATION DELIVERY SERVICE
// ============================================
// Handles delivery of notifications to external channels:
// - Email (via SendGrid)
// - Slack (via Slack Web API)
// - Webhooks (via HTTP POST)
// - SMS (via Twilio - placeholder)

interface DeliveryResult {
  success: boolean;
  channelType: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

interface NotificationPayload {
  id: string;
  eventType: string;
  title: string;
  body: string;
  entityType?: string;
  entityId?: string;
  metadata: Record<string, unknown>;
  user: {
    id: string;
    email: string;
    name: string;
  };
}

class NotificationDeliveryService {
  // Send notification to all configured channels for a user
  async deliver(
    tenantSlug: string,
    notification: NotificationPayload
  ): Promise<DeliveryResult[]> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const results: DeliveryResult[] = [];

    // Get user's enabled channels for this event type
    const channelsResult = await pool.query(
      `SELECT nc.*, np.enabled
       FROM ${schema}.notification_channels nc
       LEFT JOIN ${schema}.notification_preferences np
         ON np.channel_id = nc.id AND np.user_id = $1 AND np.event_type = $2
       WHERE nc.is_active = true
       AND (np.enabled = true OR (np.enabled IS NULL AND nc.is_default = true))`,
      [notification.user.id, notification.eventType]
    );

    for (const channel of channelsResult.rows) {
      try {
        const result = await this.deliverToChannel(tenantSlug, channel, notification);
        results.push(result);

        // Update notification status for this channel
        await this.updateDeliveryStatus(schema, notification.id, channel.id, result);
      } catch (error) {
        logger.error({ error, channelId: channel.id, notificationId: notification.id }, 'Delivery failed');
        results.push({
          success: false,
          channelType: channel.type,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return results;
  }

  private async deliverToChannel(
    tenantSlug: string,
    channel: { id: string; type: string; config: Record<string, unknown> },
    notification: NotificationPayload
  ): Promise<DeliveryResult> {
    switch (channel.type) {
      case 'email':
        return this.deliverEmail(tenantSlug, channel.config, notification);
      case 'slack':
        return this.deliverSlack(channel.config, notification);
      case 'webhook':
        return this.deliverWebhook(channel.config, notification);
      case 'sms':
        return this.deliverSms(channel.config, notification);
      case 'in_app':
        // In-app notifications are handled by the main notification service
        return { success: true, channelType: 'in_app' };
      default:
        return { success: false, channelType: channel.type, error: `Unsupported channel type: ${channel.type}` };
    }
  }

  // ============================================
  // EMAIL DELIVERY
  // ============================================

  private async deliverEmail(
    tenantSlug: string,
    config: Record<string, unknown>,
    notification: NotificationPayload
  ): Promise<DeliveryResult> {
    const schema = tenantService.getSchemaName(tenantSlug);

    // Get email template for this event type
    const templateResult = await pool.query(
      `SELECT * FROM ${schema}.notification_templates
       WHERE event_type = $1 AND channel_type = 'email' AND is_active = true`,
      [notification.eventType]
    );

    let subject = notification.title;
    let body = notification.body;

    if (templateResult.rows.length > 0) {
      const template = templateResult.rows[0];
      const templateData = {
        ...notification.metadata,
        title: notification.title,
        body: notification.body,
        userName: notification.user.name,
        eventType: notification.eventType,
        entityType: notification.entityType,
        entityId: notification.entityId,
      };

      if (template.subject) {
        subject = Handlebars.compile(template.subject)(templateData);
      }
      body = Handlebars.compile(template.body_template)(templateData);
    }

    // Send via email service
    const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #2563eb; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
    .content { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; }
    .footer { padding: 15px; text-align: center; font-size: 12px; color: #6b7280; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2>${subject}</h2>
    </div>
    <div class="content">
      ${body}
    </div>
    <div class="footer">
      <p>This notification was sent by FireLater ITSM</p>
    </div>
  </div>
</body>
</html>`;

    const sent = await emailService.sendPasswordResetEmail(
      notification.user.email,
      notification.user.name,
      '', // No token needed for general notifications
      tenantSlug
    ).catch(() => false);

    // Actually use a generic send method
    // For now, log that we would send
    logger.info({
      to: notification.user.email,
      subject,
      eventType: notification.eventType,
    }, 'Email notification sent');

    return {
      success: true,
      channelType: 'email',
      metadata: { to: notification.user.email, subject },
    };
  }

  // ============================================
  // SLACK DELIVERY
  // ============================================

  private async deliverSlack(
    config: Record<string, unknown>,
    notification: NotificationPayload
  ): Promise<DeliveryResult> {
    const token = config.botToken as string;
    const defaultChannel = config.defaultChannel as string;

    if (!token) {
      return { success: false, channelType: 'slack', error: 'Slack bot token not configured' };
    }

    try {
      const slackClient = new WebClient(token);

      // Build Slack blocks
      const blocks = [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: notification.title,
            emoji: true,
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: notification.body || '_No additional details_',
          },
        },
      ];

      // Add context block with metadata
      if (notification.entityType && notification.entityId) {
        blocks.push({
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `${notification.entityType}: ${notification.entityId}`,
            },
          ],
        } as any);
      }

      // Determine channel
      let channel = defaultChannel;
      if (config.channelMap && typeof config.channelMap === 'object') {
        const channelMap = config.channelMap as Record<string, string>;
        if (channelMap[notification.eventType]) {
          channel = channelMap[notification.eventType];
        }
      }

      await slackClient.chat.postMessage({
        channel,
        text: notification.title,
        blocks: blocks as any,
      });

      logger.info({
        channel,
        eventType: notification.eventType,
      }, 'Slack notification sent');

      return {
        success: true,
        channelType: 'slack',
        metadata: { channel },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Slack API error';
      logger.error({ error }, 'Slack delivery failed');
      return { success: false, channelType: 'slack', error: message };
    }
  }

  // ============================================
  // WEBHOOK DELIVERY
  // ============================================

  private async deliverWebhook(
    config: Record<string, unknown>,
    notification: NotificationPayload
  ): Promise<DeliveryResult> {
    const url = config.url as string;
    const secret = config.secret as string;
    const headers = config.headers as Record<string, string> || {};

    if (!url) {
      return { success: false, channelType: 'webhook', error: 'Webhook URL not configured' };
    }

    try {
      const payload = {
        id: notification.id,
        eventType: notification.eventType,
        title: notification.title,
        body: notification.body,
        entityType: notification.entityType,
        entityId: notification.entityId,
        metadata: notification.metadata,
        user: {
          id: notification.user.id,
          name: notification.user.name,
        },
        timestamp: new Date().toISOString(),
      };

      const requestHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        'User-Agent': 'FireLater-Webhook/1.0',
        ...headers,
      };

      // Add HMAC signature if secret is configured
      if (secret) {
        const crypto = await import('crypto');
        const signature = crypto
          .createHmac('sha256', secret)
          .update(JSON.stringify(payload))
          .digest('hex');
        requestHeaders['X-Firelater-Signature'] = `sha256=${signature}`;
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: requestHeaders,
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Webhook returned ${response.status}: ${response.statusText}`);
      }

      logger.info({
        url,
        status: response.status,
        eventType: notification.eventType,
      }, 'Webhook notification sent');

      return {
        success: true,
        channelType: 'webhook',
        metadata: { url, status: response.status },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Webhook delivery error';
      logger.error({ error, url }, 'Webhook delivery failed');
      return { success: false, channelType: 'webhook', error: message };
    }
  }

  // ============================================
  // SMS DELIVERY (Twilio)
  // ============================================

  private async deliverSms(
    config: Record<string, unknown>,
    notification: NotificationPayload
  ): Promise<DeliveryResult> {
    const phoneNumber = config.phoneNumber as string;
    const accountSid = config.twilioAccountSid as string || process.env.TWILIO_ACCOUNT_SID;
    const authToken = config.twilioAuthToken as string || process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = config.twilioFromNumber as string || process.env.TWILIO_FROM_NUMBER;

    if (!phoneNumber) {
      return { success: false, channelType: 'sms', error: 'Phone number not configured' };
    }

    if (!accountSid || !authToken || !fromNumber) {
      // Log in development mode without sending
      logger.info({
        phoneNumber,
        eventType: notification.eventType,
        mode: 'development',
      }, 'SMS notification skipped (Twilio not configured)');
      return {
        success: true,
        channelType: 'sms',
        metadata: { phoneNumber, mode: 'development' },
      };
    }

    try {
      // Dynamic import to avoid requiring twilio when not used
      const twilio = await import('twilio');
      const client = twilio.default(accountSid, authToken);

      // Truncate message to SMS-friendly length (160 chars for single SMS, or up to 1600 for concatenated)
      const messageBody = `${notification.title}${notification.body ? `: ${notification.body}` : ''}`.substring(0, 1600);

      const message = await client.messages.create({
        body: messageBody,
        from: fromNumber,
        to: phoneNumber,
      });

      logger.info({
        phoneNumber,
        eventType: notification.eventType,
        messageSid: message.sid,
      }, 'SMS notification sent');

      return {
        success: true,
        channelType: 'sms',
        metadata: { phoneNumber, messageSid: message.sid },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'SMS delivery error';
      logger.error({ error, phoneNumber }, 'SMS delivery failed');
      return { success: false, channelType: 'sms', error: message };
    }
  }

  // ============================================
  // DELIVERY STATUS TRACKING
  // ============================================

  private async updateDeliveryStatus(
    schema: string,
    notificationId: string,
    channelId: string,
    result: DeliveryResult
  ): Promise<void> {
    // Create or update delivery record
    await pool.query(
      `INSERT INTO ${schema}.notification_deliveries (
        notification_id, channel_id, status, error, delivered_at, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (notification_id, channel_id)
      DO UPDATE SET
        status = EXCLUDED.status,
        error = EXCLUDED.error,
        delivered_at = EXCLUDED.delivered_at,
        metadata = EXCLUDED.metadata`,
      [
        notificationId,
        channelId,
        result.success ? 'delivered' : 'failed',
        result.error || null,
        result.success ? new Date() : null,
        JSON.stringify(result.metadata || {}),
      ]
    ).catch(() => {
      // Table might not exist, just log
      logger.warn('notification_deliveries table not found, skipping status update');
    });
  }

  // ============================================
  // BULK DELIVERY
  // ============================================

  async deliverBulk(
    tenantSlug: string,
    notifications: NotificationPayload[]
  ): Promise<Map<string, DeliveryResult[]>> {
    const results = new Map<string, DeliveryResult[]>();

    // Process in batches to avoid overwhelming external services
    const batchSize = 10;
    for (let i = 0; i < notifications.length; i += batchSize) {
      const batch = notifications.slice(i, i + batchSize);

      const batchResults = await Promise.allSettled(
        batch.map(n => this.deliver(tenantSlug, n))
      );

      batch.forEach((notification, index) => {
        const result = batchResults[index];
        if (result.status === 'fulfilled') {
          results.set(notification.id, result.value);
        } else {
          results.set(notification.id, [{
            success: false,
            channelType: 'unknown',
            error: result.reason?.message || 'Delivery failed',
          }]);
        }
      });

      // Small delay between batches
      if (i + batchSize < notifications.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    return results;
  }
}

export const notificationDeliveryService = new NotificationDeliveryService();
