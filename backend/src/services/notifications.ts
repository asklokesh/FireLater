import { pool } from '../config/database.js';
import { tenantService } from './tenant.js';
import { NotFoundError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import type { PaginationParams } from '../types/index.js';
import { getOffset } from '../utils/pagination.js';

interface CreateNotificationParams {
  userId: string;
  channelId?: string;
  eventType: string;
  title: string;
  body?: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}

interface Notification {
  id: string;
  user_id: string;
  channel_id: string | null;
  event_type: string;
  title: string;
  body: string | null;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  status: string;
  sent_at: Date | null;
  read_at: Date | null;
  error: string | null;
  created_at: Date;
}

interface NotificationChannel {
  id: string;
  name: string;
  type: string;
  integration_id: string | null;
  config: Record<string, unknown>;
  is_default: boolean;
  is_active: boolean;
  created_at: Date;
}

interface NotificationTemplate {
  id: string;
  event_type: string;
  channel_type: string;
  subject: string | null;
  body_template: string;
  is_active: boolean;
  created_at: Date;
}

export class NotificationService {
  // Notifications
  async list(tenantSlug: string, userId: string, params: PaginationParams, filters?: {
    unreadOnly?: boolean;
    eventType?: string;
  }): Promise<{ notifications: Notification[]; total: number }> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const offset = getOffset(params);

    let whereClause = 'WHERE n.user_id = $1';
    const values: unknown[] = [userId];
    let paramIndex = 2;

    if (filters?.unreadOnly) {
      whereClause += ' AND n.read_at IS NULL';
    }
    if (filters?.eventType) {
      whereClause += ` AND n.event_type = $${paramIndex++}`;
      values.push(filters.eventType);
    }

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM ${schema}.notifications n ${whereClause}`,
      values
    );
    const total = parseInt(countResult.rows[0].count, 10);

    const result = await pool.query(
      `SELECT n.*
       FROM ${schema}.notifications n
       ${whereClause}
       ORDER BY n.created_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      [...values, params.perPage, offset]
    );

    return { notifications: result.rows, total };
  }

  async getUnreadCount(tenantSlug: string, userId: string): Promise<number> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(
      `SELECT COUNT(*) FROM ${schema}.notifications WHERE user_id = $1 AND read_at IS NULL`,
      [userId]
    );

    return parseInt(result.rows[0].count, 10);
  }

  async create(tenantSlug: string, params: CreateNotificationParams): Promise<Notification> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(
      `INSERT INTO ${schema}.notifications
       (user_id, channel_id, event_type, title, body, entity_type, entity_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        params.userId,
        params.channelId || null,
        params.eventType,
        params.title,
        params.body || null,
        params.entityType || null,
        params.entityId || null,
        JSON.stringify(params.metadata || {}),
      ]
    );

    logger.info({ notificationId: result.rows[0].id }, 'Notification created');
    return result.rows[0];
  }

  async markAsRead(tenantSlug: string, notificationId: string, userId: string): Promise<Notification | null> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(
      `UPDATE ${schema}.notifications
       SET read_at = NOW()
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [notificationId, userId]
    );

    return result.rows[0] || null;
  }

  async markAllAsRead(tenantSlug: string, userId: string): Promise<number> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(
      `UPDATE ${schema}.notifications
       SET read_at = NOW()
       WHERE user_id = $1 AND read_at IS NULL`,
      [userId]
    );

    return result.rowCount || 0;
  }

  async delete(tenantSlug: string, notificationId: string, userId: string): Promise<void> {
    const schema = tenantService.getSchemaName(tenantSlug);

    await pool.query(
      `DELETE FROM ${schema}.notifications WHERE id = $1 AND user_id = $2`,
      [notificationId, userId]
    );
  }

  // Notification Channels
  async listChannels(tenantSlug: string): Promise<NotificationChannel[]> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(
      `SELECT * FROM ${schema}.notification_channels WHERE is_active = true ORDER BY name`
    );

    return result.rows;
  }

  async createChannel(tenantSlug: string, params: {
    name: string;
    type: string;
    integrationId?: string;
    config?: Record<string, unknown>;
    isDefault?: boolean;
  }): Promise<NotificationChannel> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(
      `INSERT INTO ${schema}.notification_channels
       (name, type, integration_id, config, is_default)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        params.name,
        params.type,
        params.integrationId || null,
        JSON.stringify(params.config || {}),
        params.isDefault || false,
      ]
    );

    return result.rows[0];
  }

  async updateChannel(tenantSlug: string, channelId: string, params: {
    name?: string;
    config?: Record<string, unknown>;
    isDefault?: boolean;
    isActive?: boolean;
  }): Promise<NotificationChannel> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (params.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(params.name);
    }
    if (params.config !== undefined) {
      updates.push(`config = $${paramIndex++}`);
      values.push(JSON.stringify(params.config));
    }
    if (params.isDefault !== undefined) {
      updates.push(`is_default = $${paramIndex++}`);
      values.push(params.isDefault);
    }
    if (params.isActive !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      values.push(params.isActive);
    }

    if (updates.length === 0) {
      const current = await pool.query(
        `SELECT * FROM ${schema}.notification_channels WHERE id = $1`,
        [channelId]
      );
      return current.rows[0];
    }

    values.push(channelId);

    const result = await pool.query(
      `UPDATE ${schema}.notification_channels SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Notification channel', channelId);
    }

    return result.rows[0];
  }

  // User Preferences
  async getUserPreferences(tenantSlug: string, userId: string): Promise<unknown[]> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(
      `SELECT np.*, nc.name as channel_name, nc.type as channel_type
       FROM ${schema}.notification_preferences np
       JOIN ${schema}.notification_channels nc ON np.channel_id = nc.id
       WHERE np.user_id = $1
       ORDER BY np.event_type, nc.name`,
      [userId]
    );

    return result.rows;
  }

  async updateUserPreference(tenantSlug: string, userId: string, eventType: string, channelId: string, enabled: boolean): Promise<void> {
    const schema = tenantService.getSchemaName(tenantSlug);

    await pool.query(
      `INSERT INTO ${schema}.notification_preferences (user_id, event_type, channel_id, enabled)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, event_type, channel_id)
       DO UPDATE SET enabled = $4`,
      [userId, eventType, channelId, enabled]
    );
  }

  // Templates
  async listTemplates(tenantSlug: string): Promise<NotificationTemplate[]> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(
      `SELECT * FROM ${schema}.notification_templates ORDER BY event_type, channel_type`
    );

    return result.rows;
  }

  async getTemplate(tenantSlug: string, eventType: string, channelType: string): Promise<NotificationTemplate | null> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(
      `SELECT * FROM ${schema}.notification_templates
       WHERE event_type = $1 AND channel_type = $2 AND is_active = true`,
      [eventType, channelType]
    );

    return result.rows[0] || null;
  }

  async updateTemplate(tenantSlug: string, eventType: string, channelType: string, params: {
    subject?: string;
    bodyTemplate?: string;
    isActive?: boolean;
  }): Promise<NotificationTemplate> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (params.subject !== undefined) {
      updates.push(`subject = $${paramIndex++}`);
      values.push(params.subject);
    }
    if (params.bodyTemplate !== undefined) {
      updates.push(`body_template = $${paramIndex++}`);
      values.push(params.bodyTemplate);
    }
    if (params.isActive !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      values.push(params.isActive);
    }

    if (updates.length === 0) {
      const current = await pool.query(
        `SELECT * FROM ${schema}.notification_templates WHERE event_type = $1 AND channel_type = $2`,
        [eventType, channelType]
      );
      return current.rows[0];
    }

    values.push(eventType, channelType);

    const result = await pool.query(
      `UPDATE ${schema}.notification_templates SET ${updates.join(', ')}
       WHERE event_type = $${paramIndex++} AND channel_type = $${paramIndex}
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Notification template', `${eventType}:${channelType}`);
    }

    return result.rows[0];
  }

  // Send notification helper (renders template and creates notification)
  async sendNotification(tenantSlug: string, params: {
    userId: string;
    eventType: string;
    entityType?: string;
    entityId?: string;
    data: Record<string, unknown>;
  }): Promise<Notification | null> {
    const schema = tenantService.getSchemaName(tenantSlug);

    // Get user's enabled channels for this event
    const prefsResult = await pool.query(
      `SELECT np.channel_id, nc.type as channel_type
       FROM ${schema}.notification_preferences np
       JOIN ${schema}.notification_channels nc ON np.channel_id = nc.id
       WHERE np.user_id = $1 AND np.event_type = $2 AND np.enabled = true AND nc.is_active = true`,
      [params.userId, params.eventType]
    );

    // If no preferences, use default channels
    let channels = prefsResult.rows;
    if (channels.length === 0) {
      const defaultResult = await pool.query(
        `SELECT id as channel_id, type as channel_type
         FROM ${schema}.notification_channels
         WHERE is_default = true AND is_active = true`
      );
      channels = defaultResult.rows;
    }

    // Get template for in-app notification
    const template = await this.getTemplate(tenantSlug, params.eventType, 'in_app');

    if (!template && channels.length === 0) {
      logger.warn({ eventType: params.eventType }, 'No template or channels for notification');
      return null;
    }

    // Render template
    let title = params.eventType;
    let body = '';

    if (template) {
      title = this.renderTemplate(template.subject || params.eventType, params.data);
      body = this.renderTemplate(template.body_template, params.data);
    }

    // Create notification
    const notification = await this.create(tenantSlug, {
      userId: params.userId,
      eventType: params.eventType,
      title,
      body,
      entityType: params.entityType,
      entityId: params.entityId,
      metadata: params.data,
    });

    // Mark as sent
    await pool.query(
      `UPDATE ${schema}.notifications SET status = 'sent', sent_at = NOW() WHERE id = $1`,
      [notification.id]
    );

    logger.info({ notificationId: notification.id, eventType: params.eventType }, 'Notification sent');
    return notification;
  }

  private renderTemplate(template: string, data: Record<string, unknown>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
      return String(data[key] ?? '');
    });
  }
}

export const notificationService = new NotificationService();
