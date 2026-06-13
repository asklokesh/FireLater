import { pool } from '../config/database.js';
import { tenantService } from './tenant.js';
import { logger } from '../utils/logger.js';
import { cacheService } from '../utils/cache.js';
import { NotFoundError, BadRequestError } from '../utils/errors.js';

// ============================================
// TYPES
// ============================================

export interface Campaign {
  id: string;
  name: string;
  description: string | null;
  scope_type: 'all_users' | 'role' | 'group' | 'resource';
  scope_value: string | null;
  owner_id: string;
  owner_email: string | null;
  due_date: Date;
  status: 'draft' | 'active' | 'completed' | 'cancelled';
  total_items: number;
  reviewed_items: number;
  created_at: Date;
  updated_at: Date;
}

export interface RecertItem {
  id: string;
  campaign_id: string;
  user_id: string;
  user_email: string | null;
  user_name: string | null;
  resource_type: string;
  resource_id: string;
  resource_name: string | null;
  reviewer_id: string | null;
  reviewer_email: string | null;
  decision: 'approved' | 'revoked' | 'delegated' | null;
  decision_comment: string | null;
  decided_at: Date | null;
  status: 'pending' | 'decided' | 'escalated';
  created_at: Date;
  updated_at: Date;
}

export interface CreateCampaignData {
  name: string;
  description?: string;
  scopeType: 'all_users' | 'role' | 'group' | 'resource';
  scopeValue?: string;
  ownerId: string;
  ownerEmail?: string;
  dueDate: Date | string;
}

export interface StatusSummary {
  total: number;
  reviewed: number;
  revoked: number;
  approved: number;
}

// ============================================
// RECERTIFICATION SERVICE
// ============================================

class RecertificationService {
  // ----------------------------------------
  // Campaign lifecycle
  // ----------------------------------------

  async createCampaign(tenantSlug: string, data: CreateCampaignData): Promise<Campaign> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(
      `INSERT INTO ${schema}.recertification_campaigns
         (name, description, scope_type, scope_value, owner_id, owner_email, due_date, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'draft')
       RETURNING *`,
      [
        data.name,
        data.description || null,
        data.scopeType,
        data.scopeValue || null,
        data.ownerId,
        data.ownerEmail || null,
        data.dueDate,
      ]
    );

    await cacheService.invalidateTenant(tenantSlug, 'recertification');

    logger.info({ tenantSlug, campaignId: result.rows[0].id }, 'Recertification campaign created');

    return result.rows[0] as Campaign;
  }

  async launchCampaign(tenantSlug: string, campaignId: string): Promise<void> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const campaign = await this.getCampaign(tenantSlug, campaignId);

    if (campaign.status !== 'draft') {
      throw new BadRequestError(
        `Campaign cannot be launched from status '${campaign.status}'. Must be 'draft'.`
      );
    }

    // Populate items based on scope
    const items = await this._buildCampaignItems(tenantSlug, campaign);

    // Insert items in bulk if any
    let totalItems = 0;
    if (items.length > 0) {
      const values = items
        .map(
          (_, i) =>
            `($${i * 8 + 1}, $${i * 8 + 2}, $${i * 8 + 3}, $${i * 8 + 4}, $${i * 8 + 5}, $${i * 8 + 6}, $${i * 8 + 7}, $${i * 8 + 8})`
        )
        .join(', ');

      const params: unknown[] = [];
      for (const item of items) {
        params.push(
          campaignId,
          item.user_id,
          item.user_email,
          item.user_name,
          item.resource_type,
          item.resource_id,
          item.resource_name,
          item.reviewer_id
        );
      }

      await pool.query(
        `INSERT INTO ${schema}.recertification_items
           (campaign_id, user_id, user_email, user_name, resource_type, resource_id, resource_name, reviewer_id)
         VALUES ${values}`,
        params
      );

      totalItems = items.length;
    }

    // Update campaign to active
    await pool.query(
      `UPDATE ${schema}.recertification_campaigns
       SET status = 'active', total_items = $1, updated_at = NOW()
       WHERE id = $2`,
      [totalItems, campaignId]
    );

    await cacheService.invalidateTenant(tenantSlug, 'recertification');

    logger.info(
      { tenantSlug, campaignId, totalItems },
      'Recertification campaign launched'
    );
  }

  async completeCampaign(tenantSlug: string, campaignId: string): Promise<void> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const campaign = await this.getCampaign(tenantSlug, campaignId);

    if (campaign.status !== 'active') {
      throw new BadRequestError(
        `Campaign cannot be completed from status '${campaign.status}'. Must be 'active'.`
      );
    }

    await pool.query(
      `UPDATE ${schema}.recertification_campaigns
       SET status = 'completed', updated_at = NOW()
       WHERE id = $1`,
      [campaignId]
    );

    await cacheService.invalidateTenant(tenantSlug, 'recertification');

    logger.info({ tenantSlug, campaignId }, 'Recertification campaign completed');
  }

  async getCampaign(tenantSlug: string, id: string): Promise<Campaign> {
    const cacheKey = `${tenantSlug}:recertification:campaign:${id}`;

    const cached = await cacheService.getOrSet(
      cacheKey,
      async () => {
        const schema = tenantService.getSchemaName(tenantSlug);
        const result = await pool.query(
          `SELECT * FROM ${schema}.recertification_campaigns WHERE id = $1`,
          [id]
        );
        return result.rows[0] || null;
      },
      { ttl: 300 }
    );

    if (!cached) {
      throw new NotFoundError('RecertificationCampaign', id);
    }

    return cached as Campaign;
  }

  async listCampaigns(
    tenantSlug: string,
    filters?: { status?: string }
  ): Promise<Campaign[]> {
    const cacheKey = `${tenantSlug}:recertification:campaigns:${JSON.stringify(filters || {})}`;

    return cacheService.getOrSet(
      cacheKey,
      async () => {
        const schema = tenantService.getSchemaName(tenantSlug);
        const conditions: string[] = [];
        const params: unknown[] = [];

        if (filters?.status) {
          conditions.push(`status = $${params.length + 1}`);
          params.push(filters.status);
        }

        const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        const result = await pool.query(
          `SELECT * FROM ${schema}.recertification_campaigns ${where} ORDER BY created_at DESC`,
          params
        );

        return result.rows as Campaign[];
      },
      { ttl: 300 }
    );
  }

  // ----------------------------------------
  // Item decisions
  // ----------------------------------------

  async decideItem(
    tenantSlug: string,
    itemId: string,
    reviewerId: string,
    reviewerEmail: string,
    decision: 'approved' | 'revoked' | 'delegated',
    comment?: string
  ): Promise<void> {
    const schema = tenantService.getSchemaName(tenantSlug);

    // Get the item first
    const itemResult = await pool.query(
      `SELECT * FROM ${schema}.recertification_items WHERE id = $1`,
      [itemId]
    );

    if (itemResult.rows.length === 0) {
      throw new NotFoundError('RecertificationItem', itemId);
    }

    const item = itemResult.rows[0] as RecertItem;

    if (item.status === 'decided') {
      throw new BadRequestError('Item has already been decided.');
    }

    // Record the decision
    await pool.query(
      `UPDATE ${schema}.recertification_items
       SET decision = $1,
           decision_comment = $2,
           decided_at = NOW(),
           reviewer_id = $3,
           reviewer_email = $4,
           status = 'decided',
           updated_at = NOW()
       WHERE id = $5`,
      [decision, comment || null, reviewerId, reviewerEmail, itemId]
    );

    // Update campaign reviewed_items count
    await pool.query(
      `UPDATE ${schema}.recertification_campaigns
       SET reviewed_items = (
         SELECT COUNT(*) FROM ${schema}.recertification_items
         WHERE campaign_id = $1 AND status = 'decided'
       ),
       updated_at = NOW()
       WHERE id = $1`,
      [item.campaign_id]
    );

    // If revoked, create audit log entry as 'permission_revoked'
    if (decision === 'revoked') {
      await pool.query(
        `INSERT INTO ${schema}.audit_logs
           (user_id, user_email, action, entity_type, entity_id, entity_name, metadata)
         VALUES ($1, $2, 'permission_revoked', $3, $4, $5, $6)`,
        [
          reviewerId,
          reviewerEmail,
          item.resource_type,
          item.resource_id,
          item.resource_name,
          JSON.stringify({
            recertification_item_id: itemId,
            campaign_id: item.campaign_id,
            target_user_id: item.user_id,
            target_user_email: item.user_email,
            comment: comment || null,
          }),
        ]
      );

      logger.info(
        { tenantSlug, itemId, resourceId: item.resource_id, userId: item.user_id },
        'Permission revoked via recertification'
      );
    }

    await cacheService.invalidateTenant(tenantSlug, 'recertification');
  }

  async getItemsForReviewer(
    tenantSlug: string,
    reviewerId: string,
    campaignId?: string
  ): Promise<RecertItem[]> {
    const cacheKey = `${tenantSlug}:recertification:reviewer:${reviewerId}:${campaignId || 'all'}`;

    return cacheService.getOrSet(
      cacheKey,
      async () => {
        const schema = tenantService.getSchemaName(tenantSlug);
        const conditions: string[] = ['reviewer_id = $1'];
        const params: unknown[] = [reviewerId];

        if (campaignId) {
          conditions.push(`campaign_id = $${params.length + 1}`);
          params.push(campaignId);
        }

        const result = await pool.query(
          `SELECT i.*, c.name as campaign_name, c.due_date as campaign_due_date
           FROM ${schema}.recertification_items i
           JOIN ${schema}.recertification_campaigns c ON i.campaign_id = c.id
           WHERE ${conditions.join(' AND ')}
           ORDER BY c.due_date ASC, i.created_at ASC`,
          params
        );

        return result.rows as RecertItem[];
      },
      { ttl: 120 }
    );
  }

  async listItems(tenantSlug: string, campaignId: string): Promise<RecertItem[]> {
    const cacheKey = `${tenantSlug}:recertification:items:${campaignId}`;

    return cacheService.getOrSet(
      cacheKey,
      async () => {
        const schema = tenantService.getSchemaName(tenantSlug);

        const result = await pool.query(
          `SELECT * FROM ${schema}.recertification_items
           WHERE campaign_id = $1
           ORDER BY status ASC, created_at ASC`,
          [campaignId]
        );

        return result.rows as RecertItem[];
      },
      { ttl: 120 }
    );
  }

  // ----------------------------------------
  // Reminders and escalation
  // ----------------------------------------

  async sendReminders(tenantSlug: string): Promise<number> {
    const schema = tenantService.getSchemaName(tenantSlug);

    // Find active campaigns due within 7 days
    const campaignResult = await pool.query(
      `SELECT * FROM ${schema}.recertification_campaigns
       WHERE status = 'active'
         AND due_date BETWEEN NOW() AND NOW() + INTERVAL '7 days'`,
      []
    );

    let reminderCount = 0;

    for (const campaign of campaignResult.rows as Campaign[]) {
      // Find reviewers with pending items for this campaign
      const reviewerResult = await pool.query(
        `SELECT DISTINCT reviewer_id, reviewer_email
         FROM ${schema}.recertification_items
         WHERE campaign_id = $1 AND status = 'pending' AND reviewer_id IS NOT NULL`,
        [campaign.id]
      );

      for (const reviewer of reviewerResult.rows) {
        // Check if reminder already sent in last 24h
        const recentReminder = await pool.query(
          `SELECT id FROM ${schema}.recertification_reminders
           WHERE campaign_id = $1 AND sent_to = $2
             AND sent_at > NOW() - INTERVAL '24 hours'
           LIMIT 1`,
          [campaign.id, reviewer.reviewer_id]
        );

        if (recentReminder.rows.length === 0) {
          await pool.query(
            `INSERT INTO ${schema}.recertification_reminders
               (campaign_id, sent_to, reminder_type)
             VALUES ($1, $2, 'due_soon')`,
            [campaign.id, reviewer.reviewer_id]
          );

          logger.info(
            { tenantSlug, campaignId: campaign.id, reviewerId: reviewer.reviewer_id },
            'Recertification reminder recorded'
          );

          reminderCount++;
        }
      }
    }

    return reminderCount;
  }

  async escalateOverdue(tenantSlug: string): Promise<number> {
    const schema = tenantService.getSchemaName(tenantSlug);

    // Find active campaigns past due_date with pending items
    const result = await pool.query(
      `UPDATE ${schema}.recertification_items ri
       SET status = 'escalated', updated_at = NOW()
       FROM ${schema}.recertification_campaigns rc
       WHERE ri.campaign_id = rc.id
         AND rc.status = 'active'
         AND rc.due_date < NOW()
         AND ri.status = 'pending'
       RETURNING ri.id, ri.campaign_id`,
      []
    );

    const escalatedCount = result.rowCount || 0;

    if (escalatedCount > 0) {
      logger.warn({ tenantSlug, escalatedCount }, 'Escalated overdue recertification items');

      // Record reminder entries for campaign owners
      const campaignIds = [...new Set(result.rows.map((r) => r.campaign_id as string))];

      for (const campaignId of campaignIds) {
        const campaign = await pool.query(
          `SELECT owner_id FROM ${schema}.recertification_campaigns WHERE id = $1`,
          [campaignId]
        );

        if (campaign.rows.length > 0) {
          await pool.query(
            `INSERT INTO ${schema}.recertification_reminders
               (campaign_id, sent_to, reminder_type)
             VALUES ($1, $2, 'overdue_escalation')`,
            [campaignId, campaign.rows[0].owner_id]
          );
        }
      }
    }

    return escalatedCount;
  }

  // ----------------------------------------
  // Compliance reporting
  // ----------------------------------------

  async getStatusSummary(
    tenantSlug: string,
    from?: Date,
    to?: Date
  ): Promise<StatusSummary> {
    const cacheKey = `${tenantSlug}:recertification:summary:${from?.toISOString() || ''}:${to?.toISOString() || ''}`;

    return cacheService.getOrSet(
      cacheKey,
      async () => {
        const schema = tenantService.getSchemaName(tenantSlug);
        const conditions: string[] = [];
        const params: unknown[] = [];

        if (from) {
          conditions.push(`c.created_at >= $${params.length + 1}`);
          params.push(from);
        }

        if (to) {
          conditions.push(`c.created_at <= $${params.length + 1}`);
          params.push(to);
        }

        const where =
          conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        const result = await pool.query(
          `SELECT
             COUNT(*) AS total,
             COUNT(*) FILTER (WHERE i.status = 'decided') AS reviewed,
             COUNT(*) FILTER (WHERE i.decision = 'revoked') AS revoked,
             COUNT(*) FILTER (WHERE i.decision = 'approved') AS approved
           FROM ${schema}.recertification_items i
           JOIN ${schema}.recertification_campaigns c ON i.campaign_id = c.id
           ${where}`,
          params
        );

        const row = result.rows[0];

        return {
          total: parseInt(row.total, 10),
          reviewed: parseInt(row.reviewed, 10),
          revoked: parseInt(row.revoked, 10),
          approved: parseInt(row.approved, 10),
        } as StatusSummary;
      },
      { ttl: 600 }
    );
  }

  // ----------------------------------------
  // Private helpers
  // ----------------------------------------

  private async _buildCampaignItems(
    tenantSlug: string,
    campaign: Campaign
  ): Promise<
    Array<{
      user_id: string;
      user_email: string | null;
      user_name: string | null;
      resource_type: string;
      resource_id: string;
      resource_name: string | null;
      reviewer_id: string | null;
    }>
  > {
    const schema = tenantService.getSchemaName(tenantSlug);
    const items: Array<{
      user_id: string;
      user_email: string | null;
      user_name: string | null;
      resource_type: string;
      resource_id: string;
      resource_name: string | null;
      reviewer_id: string | null;
    }> = [];

    if (campaign.scope_type === 'all_users') {
      // Create one item per user representing their role assignment
      const usersResult = await pool.query(
        `SELECT id, email, name, role, manager_id FROM ${schema}.users WHERE status = 'active'`,
        []
      );

      for (const user of usersResult.rows) {
        items.push({
          user_id: user.id,
          user_email: user.email || null,
          user_name: user.name || null,
          resource_type: 'role',
          resource_id: user.role || 'unknown',
          resource_name: user.role || null,
          reviewer_id: user.manager_id || null,
        });
      }
    } else if (campaign.scope_type === 'role') {
      // Users with a specific role
      const usersResult = await pool.query(
        `SELECT id, email, name, role, manager_id FROM ${schema}.users
         WHERE status = 'active' AND role = $1`,
        [campaign.scope_value]
      );

      for (const user of usersResult.rows) {
        items.push({
          user_id: user.id,
          user_email: user.email || null,
          user_name: user.name || null,
          resource_type: 'role',
          resource_id: user.role,
          resource_name: user.role,
          reviewer_id: user.manager_id || null,
        });
      }
    } else if (campaign.scope_type === 'group') {
      // Users in a specific group
      const membersResult = await pool.query(
        `SELECT u.id, u.email, u.name, u.manager_id, g.id as group_id, g.name as group_name
         FROM ${schema}.users u
         JOIN ${schema}.group_members gm ON u.id = gm.user_id
         JOIN ${schema}.groups g ON gm.group_id = g.id
         WHERE u.status = 'active' AND g.id = $1`,
        [campaign.scope_value]
      );

      for (const member of membersResult.rows) {
        items.push({
          user_id: member.id,
          user_email: member.email || null,
          user_name: member.name || null,
          resource_type: 'group',
          resource_id: member.group_id,
          resource_name: member.group_name || null,
          reviewer_id: member.manager_id || null,
        });
      }
    } else if (campaign.scope_type === 'resource') {
      // All users with access to a specific resource (look up by applications or permissions)
      const usersResult = await pool.query(
        `SELECT DISTINCT u.id, u.email, u.name, u.manager_id
         FROM ${schema}.users u
         WHERE u.status = 'active'`,
        []
      );

      for (const user of usersResult.rows) {
        items.push({
          user_id: user.id,
          user_email: user.email || null,
          user_name: user.name || null,
          resource_type: 'resource',
          resource_id: campaign.scope_value || 'unknown',
          resource_name: campaign.scope_value || null,
          reviewer_id: user.manager_id || null,
        });
      }
    }

    return items;
  }
}

export const recertificationService = new RecertificationService();
