import { pool } from '../config/database.js';
import { tenantService } from './tenant.js';
import { NotFoundError, BadRequestError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

// ============================================
// TYPES
// ============================================

export interface RegulatoryFramework {
  id: string;
  code: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: Date;
}

export interface RegulatoryDeadline {
  id: string;
  framework_id: string;
  deadline_type: string;
  incident_classification: string | null;
  hours_from_detection: number;
  description: string | null;
  created_at: Date;
}

export interface RegulatoryClock {
  id: string;
  incident_id: string;
  framework_id: string;
  deadline_id: string;
  detected_at: Date;
  deadline_at: Date;
  status: 'running' | 'met' | 'breached' | 'cancelled';
  notification_sent_at: Date | null;
  notification_actor_id: string | null;
  notification_recipient: string | null;
  notification_evidence: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface RegulatoryClockEscalation {
  id: string;
  clock_id: string;
  escalation_type: string;
  sent_at: Date;
  sent_to: string | null;
}

export interface AdherenceSummary {
  total: number;
  met: number;
  breached: number;
  running: number;
}

interface CreateFrameworkParams {
  code: string;
  name: string;
  description?: string;
}

interface CreateDeadlineParams {
  frameworkId: string;
  deadlineType: string;
  incidentClassification?: string;
  hoursFromDetection: number;
  description?: string;
}

// ============================================
// SERVICE
// ============================================

export class RegulatorySlaService {
  /**
   * Start regulatory clocks for an incident that has been classified as reportable.
   * Finds all active frameworks with deadlines matching the classification and
   * creates a clock record for each matching deadline.
   */
  async startClocks(
    tenantSlug: string,
    incidentId: string,
    classification: string,
    detectedAt: Date
  ): Promise<RegulatoryClock[]> {
    const schema = tenantService.getSchemaName(tenantSlug);

    // Find all active frameworks and their matching deadlines
    const deadlinesResult = await pool.query(
      `SELECT rd.id AS deadline_id, rd.framework_id, rd.hours_from_detection
       FROM ${schema}.regulatory_deadlines rd
       JOIN ${schema}.regulatory_frameworks rf ON rf.id = rd.framework_id
       WHERE rf.is_active = true
         AND (rd.incident_classification = $1 OR rd.incident_classification = 'all')`,
      [classification]
    );

    if (deadlinesResult.rows.length === 0) {
      logger.info(
        { tenantSlug, incidentId, classification },
        'No regulatory deadlines matched for classification'
      );
      return [];
    }

    const clocks: RegulatoryClock[] = [];

    for (const row of deadlinesResult.rows) {
      const deadlineAt = new Date(
        detectedAt.getTime() + row.hours_from_detection * 60 * 60 * 1000
      );

      const insertResult = await pool.query(
        `INSERT INTO ${schema}.regulatory_clocks
           (incident_id, framework_id, deadline_id, detected_at, deadline_at, status)
         VALUES ($1, $2, $3, $4, $5, 'running')
         RETURNING *`,
        [incidentId, row.framework_id, row.deadline_id, detectedAt, deadlineAt]
      );

      clocks.push(insertResult.rows[0] as RegulatoryClock);
    }

    logger.info(
      { tenantSlug, incidentId, classification, clockCount: clocks.length },
      'Regulatory clocks started for incident'
    );

    return clocks;
  }

  /**
   * Record that a regulatory notification was filed, marking a clock as met.
   */
  async recordNotification(
    tenantSlug: string,
    clockId: string,
    actorId: string,
    recipient: string,
    evidence: string
  ): Promise<void> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(
      `UPDATE ${schema}.regulatory_clocks
       SET status = 'met',
           notification_sent_at = NOW(),
           notification_actor_id = $2,
           notification_recipient = $3,
           notification_evidence = $4,
           updated_at = NOW()
       WHERE id = $1 AND status = 'running'
       RETURNING id`,
      [clockId, actorId, recipient, evidence]
    );

    if (result.rowCount === 0) {
      // Check if clock exists at all
      const check = await pool.query(
        `SELECT id, status FROM ${schema}.regulatory_clocks WHERE id = $1`,
        [clockId]
      );
      if (check.rows.length === 0) {
        throw new NotFoundError('Regulatory clock', clockId);
      }
      throw new BadRequestError(
        `Cannot record notification: clock ${clockId} is in status '${check.rows[0].status}', expected 'running'`
      );
    }

    logger.info(
      { tenantSlug, clockId, actorId, recipient },
      'Regulatory notification recorded, clock marked as met'
    );
  }

  /**
   * Check all running clocks for a tenant and send escalation alerts when
   * thresholds are reached (75%, 90% elapsed, or past deadline).
   * Called by the scheduled job on an hourly basis.
   */
  async checkAndEscalate(
    tenantSlug: string
  ): Promise<{ escalated: number; breached: number }> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const now = new Date();
    let escalated = 0;
    let breached = 0;

    // Fetch all running clocks for this tenant
    const clocksResult = await pool.query(
      `SELECT rc.*
       FROM ${schema}.regulatory_clocks rc
       WHERE rc.status = 'running'`,
    );

    for (const clock of clocksResult.rows as RegulatoryClock[]) {
      const total = clock.deadline_at.getTime() - clock.detected_at.getTime();
      const elapsed = now.getTime() - clock.detected_at.getTime();
      const pctElapsed = total > 0 ? (elapsed / total) * 100 : 100;

      const isPastDeadline = now >= clock.deadline_at;

      if (isPastDeadline) {
        // Mark as breached
        await pool.query(
          `UPDATE ${schema}.regulatory_clocks
           SET status = 'breached', updated_at = NOW()
           WHERE id = $1 AND status = 'running'`,
          [clock.id]
        );

        await this.sendEscalationIfNew(schema, clock.id, 'breach', null);
        breached++;

        logger.warn(
          { tenantSlug, clockId: clock.id, incidentId: clock.incident_id },
          'Regulatory clock breached'
        );
        continue;
      }

      // Check 90% threshold
      if (pctElapsed >= 90) {
        const sent = await this.sendEscalationIfNew(schema, clock.id, '90pct', null);
        if (sent) escalated++;
      } else if (pctElapsed >= 75) {
        // Check 75% threshold
        const sent = await this.sendEscalationIfNew(schema, clock.id, '75pct', null);
        if (sent) escalated++;
      }
    }

    logger.info(
      { tenantSlug, escalated, breached },
      'Regulatory clock check complete'
    );

    return { escalated, breached };
  }

  /**
   * Insert an escalation record if one hasn't been sent yet for this clock + type.
   * Returns true if a new escalation was recorded.
   */
  private async sendEscalationIfNew(
    schema: string,
    clockId: string,
    escalationType: string,
    sentTo: string | null
  ): Promise<boolean> {
    const existing = await pool.query(
      `SELECT id FROM ${schema}.regulatory_clock_escalations
       WHERE clock_id = $1 AND escalation_type = $2`,
      [clockId, escalationType]
    );

    if (existing.rows.length > 0) {
      return false;
    }

    await pool.query(
      `INSERT INTO ${schema}.regulatory_clock_escalations (clock_id, escalation_type, sent_to)
       VALUES ($1, $2, $3)`,
      [clockId, escalationType, sentTo]
    );

    logger.warn(
      { clockId, escalationType },
      'Regulatory clock escalation recorded'
    );

    return true;
  }

  /**
   * List all regulatory clocks for a specific incident.
   */
  async getClocksForIncident(
    tenantSlug: string,
    incidentId: string
  ): Promise<RegulatoryClock[]> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(
      `SELECT rc.*
       FROM ${schema}.regulatory_clocks rc
       WHERE rc.incident_id = $1
       ORDER BY rc.deadline_at ASC`,
      [incidentId]
    );

    return result.rows as RegulatoryClock[];
  }

  // ============================================
  // FRAMEWORK CRUD
  // ============================================

  async listFrameworks(tenantSlug: string): Promise<RegulatoryFramework[]> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(
      `SELECT * FROM ${schema}.regulatory_frameworks ORDER BY code ASC`
    );

    return result.rows as RegulatoryFramework[];
  }

  async createFramework(
    tenantSlug: string,
    data: CreateFrameworkParams
  ): Promise<RegulatoryFramework> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(
      `INSERT INTO ${schema}.regulatory_frameworks (code, name, description)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [data.code, data.name, data.description ?? null]
    );

    return result.rows[0] as RegulatoryFramework;
  }

  // ============================================
  // DEADLINE CRUD
  // ============================================

  async listDeadlines(
    tenantSlug: string,
    frameworkId: string
  ): Promise<RegulatoryDeadline[]> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(
      `SELECT * FROM ${schema}.regulatory_deadlines
       WHERE framework_id = $1
       ORDER BY hours_from_detection ASC`,
      [frameworkId]
    );

    return result.rows as RegulatoryDeadline[];
  }

  async createDeadline(
    tenantSlug: string,
    data: CreateDeadlineParams
  ): Promise<RegulatoryDeadline> {
    const schema = tenantService.getSchemaName(tenantSlug);

    // Verify framework exists
    const fwCheck = await pool.query(
      `SELECT id FROM ${schema}.regulatory_frameworks WHERE id = $1`,
      [data.frameworkId]
    );
    if (fwCheck.rows.length === 0) {
      throw new NotFoundError('Regulatory framework', data.frameworkId);
    }

    if (data.hoursFromDetection <= 0) {
      throw new BadRequestError('hoursFromDetection must be a positive integer');
    }

    const result = await pool.query(
      `INSERT INTO ${schema}.regulatory_deadlines
         (framework_id, deadline_type, incident_classification, hours_from_detection, description)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        data.frameworkId,
        data.deadlineType,
        data.incidentClassification ?? null,
        data.hoursFromDetection,
        data.description ?? null,
      ]
    );

    return result.rows[0] as RegulatoryDeadline;
  }

  // ============================================
  // COMPLIANCE REPORTING
  // ============================================

  /**
   * Return aggregate counts of clock statuses in a date range.
   * Uses created_at of the clock as the anchor point.
   */
  async getAdherenceSummary(
    tenantSlug: string,
    from: Date,
    to: Date
  ): Promise<AdherenceSummary> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(
      `SELECT
         COUNT(*)                                           AS total,
         COUNT(*) FILTER (WHERE status = 'met')           AS met,
         COUNT(*) FILTER (WHERE status = 'breached')      AS breached,
         COUNT(*) FILTER (WHERE status = 'running')       AS running
       FROM ${schema}.regulatory_clocks
       WHERE created_at >= $1 AND created_at <= $2`,
      [from, to]
    );

    const row = result.rows[0];

    return {
      total: parseInt(row.total, 10),
      met: parseInt(row.met, 10),
      breached: parseInt(row.breached, 10),
      running: parseInt(row.running, 10),
    };
  }
}

export const regulatorySlaService = new RegulatorySlaService();
