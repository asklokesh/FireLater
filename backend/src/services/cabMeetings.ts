import { pool } from '../config/database.js';
import { tenantService } from './tenant.js';
import { NotFoundError, BadRequestError } from '../utils/errors.js';
import { getOffset } from '../utils/pagination.js';
import type { PaginationParams } from '../types/index.js';
import { cacheService } from '../utils/cache.js';

interface CabMeetingFilters {
  status?: string;
  organizerId?: string;
  fromDate?: string;
  toDate?: string;
}

interface ActionItem {
  id: string;
  description: string;
  assigneeId?: string;
  dueDate?: string;
  status: string;
}

interface Decision {
  changeId: string;
  decision: string;
  notes?: string;
}

class CabMeetingService {
  // ==================
  // MEETINGS
  // ==================

  async list(
    tenantSlug: string,
    pagination: PaginationParams,
    filters: CabMeetingFilters = {}
  ): Promise<{ meetings: unknown[]; total: number }> {
    const cacheKey = `${tenantSlug}:cab:meetings:list:${JSON.stringify({ pagination, filters })}`;

    return cacheService.getOrSet(
      cacheKey,
      async () => {
        const schema = tenantService.getSchemaName(tenantSlug);
        const offset = getOffset(pagination);

        let whereClause = 'WHERE 1=1';
        const params: unknown[] = [];
        let paramIndex = 1;

        if (filters.status) {
          whereClause += ` AND m.status = $${paramIndex++}`;
          params.push(filters.status);
        }

        if (filters.organizerId) {
          whereClause += ` AND m.organizer_id = $${paramIndex++}`;
          params.push(filters.organizerId);
        }

        if (filters.fromDate) {
          whereClause += ` AND m.meeting_date >= $${paramIndex++}`;
          params.push(filters.fromDate);
        }

        if (filters.toDate) {
          whereClause += ` AND m.meeting_date <= $${paramIndex++}`;
          params.push(filters.toDate);
        }

        const countQuery = `SELECT COUNT(*) FROM ${schema}.cab_meetings m ${whereClause}`;
        const countResult = await pool.query(countQuery, params);
        const total = parseInt(countResult.rows[0].count, 10);

        const query = `
          SELECT m.*,
                 u.name as organizer_name,
                 u.email as organizer_email,
                 (SELECT COUNT(*) FROM ${schema}.cab_meeting_attendees WHERE meeting_id = m.id) as attendee_count,
                 (SELECT COUNT(*) FROM ${schema}.cab_meeting_changes WHERE meeting_id = m.id) as change_count
          FROM ${schema}.cab_meetings m
          LEFT JOIN ${schema}.users u ON m.organizer_id = u.id
          ${whereClause}
          ORDER BY m.meeting_date DESC
          LIMIT $${paramIndex++} OFFSET $${paramIndex++}
        `;
        params.push(pagination.perPage, offset);

        const result = await pool.query(query, params);
        return { meetings: result.rows, total };
      },
      { ttl: 600 } // 10 minutes - meetings queried frequently, changed moderately
    );
  }

  async getById(tenantSlug: string, meetingId: string): Promise<unknown> {
    const cacheKey = `${tenantSlug}:cab:meeting:${meetingId}`;

    return cacheService.getOrSet(
      cacheKey,
      async () => {
        const schema = tenantService.getSchemaName(tenantSlug);

        // Support both UUID and meeting_number
        const idColumn = meetingId.startsWith('CAB-') ? 'meeting_number' : 'id';

        const result = await pool.query(
          `SELECT m.*,
                  u.name as organizer_name,
                  u.email as organizer_email
           FROM ${schema}.cab_meetings m
           LEFT JOIN ${schema}.users u ON m.organizer_id = u.id
           WHERE m.${idColumn} = $1`,
          [meetingId]
        );

        if (!result.rows[0]) {
          throw new NotFoundError('CAB Meeting', meetingId);
        }

        const meeting = result.rows[0];

        // Get attendees
        const attendeesResult = await pool.query(
          `SELECT a.*, u.name as user_name, u.email as user_email
           FROM ${schema}.cab_meeting_attendees a
           LEFT JOIN ${schema}.users u ON a.user_id = u.id
           WHERE a.meeting_id = $1
           ORDER BY a.role, u.name`,
          [meeting.id]
        );

        // Get changes
        const changesResult = await pool.query(
          `SELECT mc.*,
                  c.change_number, c.title as change_title, c.type as change_type,
                  c.risk_level, c.status as change_status,
                  req.name as requester_name
           FROM ${schema}.cab_meeting_changes mc
           LEFT JOIN ${schema}.change_requests c ON mc.change_id = c.id
           LEFT JOIN ${schema}.users req ON c.requester_id = req.id
           WHERE mc.meeting_id = $1
           ORDER BY mc.sort_order`,
          [meeting.id]
        );

        return {
          ...meeting,
          attendees: attendeesResult.rows,
          changes: changesResult.rows,
        };
      },
      { ttl: 600 } // 10 minutes
    );
  }

  async create(
    tenantSlug: string,
    organizerId: string,
    data: {
      title: string;
      description?: string;
      meetingDate: string;
      meetingEnd?: string;
      location?: string;
      meetingLink?: string;
    }
  ): Promise<unknown> {
    const schema = tenantService.getSchemaName(tenantSlug);

    // Generate meeting number
    const meetingNumber = await this.generateMeetingNumber(tenantSlug);

    const result = await pool.query(
      `INSERT INTO ${schema}.cab_meetings (
        meeting_number, title, description, meeting_date, meeting_end,
        location, meeting_link, organizer_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [
        meetingNumber,
        data.title,
        data.description || null,
        data.meetingDate,
        data.meetingEnd || null,
        data.location || null,
        data.meetingLink || null,
        organizerId,
      ]
    );

    // Add organizer as chair
    await pool.query(
      `INSERT INTO ${schema}.cab_meeting_attendees (meeting_id, user_id, role, attendance_status)
       VALUES ($1, $2, 'chair', 'accepted')`,
      [result.rows[0].id, organizerId]
    );

    // Invalidate cache
    await cacheService.invalidateTenant(tenantSlug, 'cab');

    return result.rows[0];
  }

  private async generateMeetingNumber(tenantSlug: string): Promise<string> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const result = await pool.query(`SELECT ${schema}.next_id('cab_meeting') as id`);
    if (!result.rows[0]) {
      throw new Error('Failed to generate CAB meeting number - ID sequence not found');
    }
    return result.rows[0].id;
  }

  async update(
    tenantSlug: string,
    meetingId: string,
    data: Partial<{
      title: string;
      description: string;
      meetingDate: string;
      meetingEnd: string;
      location: string;
      meetingLink: string;
      status: string;
      agenda: string;
    }>
  ): Promise<unknown> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const meeting = await this.getMeetingById(tenantSlug, meetingId);

    // Cannot update completed or cancelled meetings
    if (['completed', 'cancelled'].includes(meeting.status)) {
      throw new BadRequestError(`Cannot update meeting in status: ${meeting.status}`);
    }

    const fields: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    const fieldMap: Record<string, string> = {
      title: 'title',
      description: 'description',
      meetingDate: 'meeting_date',
      meetingEnd: 'meeting_end',
      location: 'location',
      meetingLink: 'meeting_link',
      status: 'status',
      agenda: 'agenda',
    };

    for (const [key, column] of Object.entries(fieldMap)) {
      if (data[key as keyof typeof data] !== undefined) {
        fields.push(`${column} = $${paramIndex++}`);
        values.push(data[key as keyof typeof data]);
      }
    }

    if (fields.length === 0) {
      return meeting;
    }

    fields.push(`updated_at = NOW()`);
    values.push(meeting.id);

    const result = await pool.query(
      `UPDATE ${schema}.cab_meetings SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    // Invalidate cache
    await cacheService.invalidateTenant(tenantSlug, 'cab');

    return result.rows[0];
  }

  async delete(tenantSlug: string, meetingId: string): Promise<void> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const meeting = await this.getMeetingById(tenantSlug, meetingId);

    // Cannot delete completed meetings
    if (meeting.status === 'completed') {
      throw new BadRequestError('Cannot delete completed meetings');
    }

    await pool.query(`DELETE FROM ${schema}.cab_meetings WHERE id = $1`, [meeting.id]);

    // Invalidate cache
    await cacheService.invalidateTenant(tenantSlug, 'cab');
  }

  private async getMeetingById(tenantSlug: string, meetingId: string): Promise<{ id: string; status: string }> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const idColumn = meetingId.startsWith('CAB-') ? 'meeting_number' : 'id';

    const result = await pool.query(
      `SELECT id, status FROM ${schema}.cab_meetings WHERE ${idColumn} = $1`,
      [meetingId]
    );

    if (!result.rows[0]) {
      throw new NotFoundError('CAB Meeting', meetingId);
    }

    return result.rows[0];
  }

  // ==================
  // ATTENDEES
  // ==================

  async getAttendees(tenantSlug: string, meetingId: string): Promise<unknown[]> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const meeting = await this.getMeetingById(tenantSlug, meetingId);

    const result = await pool.query(
      `SELECT a.*, u.name as user_name, u.email as user_email
       FROM ${schema}.cab_meeting_attendees a
       LEFT JOIN ${schema}.users u ON a.user_id = u.id
       WHERE a.meeting_id = $1
       ORDER BY
         CASE a.role WHEN 'chair' THEN 1 WHEN 'member' THEN 2 ELSE 3 END,
         u.name`,
      [meeting.id]
    );

    return result.rows;
  }

  async addAttendee(
    tenantSlug: string,
    meetingId: string,
    userId: string,
    role: string = 'member'
  ): Promise<unknown> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const meeting = await this.getMeetingById(tenantSlug, meetingId);

    // Validate role
    const validRoles = ['chair', 'member', 'guest'];
    if (!validRoles.includes(role)) {
      throw new BadRequestError(`Invalid role. Must be one of: ${validRoles.join(', ')}`);
    }

    try {
      const result = await pool.query(
        `INSERT INTO ${schema}.cab_meeting_attendees (meeting_id, user_id, role)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [meeting.id, userId, role]
      );

      // Invalidate cache (attendees included in getById)
      await cacheService.invalidateTenant(tenantSlug, 'cab');

      return result.rows[0];
    } catch (error: unknown) {
      if ((error as { code?: string }).code === '23505') {
        throw new BadRequestError('User is already an attendee of this meeting');
      }
      throw error;
    }
  }

  async removeAttendee(tenantSlug: string, meetingId: string, userId: string): Promise<void> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const meeting = await this.getMeetingById(tenantSlug, meetingId);

    const result = await pool.query(
      `DELETE FROM ${schema}.cab_meeting_attendees
       WHERE meeting_id = $1 AND user_id = $2`,
      [meeting.id, userId]
    );

    if (result.rowCount === 0) {
      throw new NotFoundError('Attendee', userId);
    }

    // Invalidate cache (attendees included in getById)
    await cacheService.invalidateTenant(tenantSlug, 'cab');
  }

  async updateAttendeeStatus(
    tenantSlug: string,
    meetingId: string,
    userId: string,
    status: string,
    notes?: string
  ): Promise<unknown> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const meeting = await this.getMeetingById(tenantSlug, meetingId);

    // Validate status
    const validStatuses = ['pending', 'accepted', 'declined', 'attended'];
    if (!validStatuses.includes(status)) {
      throw new BadRequestError(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
    }

    const result = await pool.query(
      `UPDATE ${schema}.cab_meeting_attendees
       SET attendance_status = $1, response_at = NOW(), notes = COALESCE($2, notes)
       WHERE meeting_id = $3 AND user_id = $4
       RETURNING *`,
      [status, notes || null, meeting.id, userId]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Attendee', userId);
    }

    return result.rows[0];
  }

  // ==================
  // CHANGES (AGENDA)
  // ==================

  async getChanges(tenantSlug: string, meetingId: string): Promise<unknown[]> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const meeting = await this.getMeetingById(tenantSlug, meetingId);

    const result = await pool.query(
      `SELECT mc.*,
              c.change_number, c.title as change_title, c.description as change_description,
              c.type as change_type, c.risk_level, c.status as change_status,
              c.planned_start, c.planned_end,
              req.name as requester_name, req.email as requester_email,
              app.name as application_name
       FROM ${schema}.cab_meeting_changes mc
       LEFT JOIN ${schema}.change_requests c ON mc.change_id = c.id
       LEFT JOIN ${schema}.users req ON c.requester_id = req.id
       LEFT JOIN ${schema}.applications app ON c.application_id = app.id
       WHERE mc.meeting_id = $1
       ORDER BY mc.sort_order`,
      [meeting.id]
    );

    return result.rows;
  }

  async addChange(
    tenantSlug: string,
    meetingId: string,
    changeId: string,
    timeAllocated: number = 10,
    sortOrder?: number
  ): Promise<unknown> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const meeting = await this.getMeetingById(tenantSlug, meetingId);

    // Verify change exists
    const changeCheck = await pool.query(
      `SELECT id FROM ${schema}.change_requests WHERE id = $1`,
      [changeId]
    );

    if (changeCheck.rows.length === 0) {
      throw new NotFoundError('Change Request', changeId);
    }

    // Get next sort order if not provided
    if (sortOrder === undefined) {
      const maxOrder = await pool.query(
        `SELECT COALESCE(MAX(sort_order), 0) + 1 as next_order
         FROM ${schema}.cab_meeting_changes WHERE meeting_id = $1`,
        [meeting.id]
      );
      sortOrder = maxOrder.rows[0].next_order;
    }

    try {
      const result = await pool.query(
        `INSERT INTO ${schema}.cab_meeting_changes (meeting_id, change_id, sort_order, time_allocated_minutes)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [meeting.id, changeId, sortOrder, timeAllocated]
      );

      // Invalidate cache (changes included in getById)
      await cacheService.invalidateTenant(tenantSlug, 'cab');

      return result.rows[0];
    } catch (error: unknown) {
      if ((error as { code?: string }).code === '23505') {
        throw new BadRequestError('Change is already on the agenda for this meeting');
      }
      throw error;
    }
  }

  async removeChange(tenantSlug: string, meetingId: string, changeId: string): Promise<void> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const meeting = await this.getMeetingById(tenantSlug, meetingId);

    const result = await pool.query(
      `DELETE FROM ${schema}.cab_meeting_changes
       WHERE meeting_id = $1 AND change_id = $2`,
      [meeting.id, changeId]
    );

    if (result.rowCount === 0) {
      throw new NotFoundError('Change in meeting agenda', changeId);
    }

    // Invalidate cache (changes included in getById)
    await cacheService.invalidateTenant(tenantSlug, 'cab');
  }

  async updateChange(
    tenantSlug: string,
    meetingId: string,
    changeId: string,
    data: {
      discussionNotes?: string;
      timeAllocatedMinutes?: number;
      sortOrder?: number;
    }
  ): Promise<unknown> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const meeting = await this.getMeetingById(tenantSlug, meetingId);

    const fields: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (data.discussionNotes !== undefined) {
      fields.push(`discussion_notes = $${paramIndex++}`);
      values.push(data.discussionNotes);
    }

    if (data.timeAllocatedMinutes !== undefined) {
      fields.push(`time_allocated_minutes = $${paramIndex++}`);
      values.push(data.timeAllocatedMinutes);
    }

    if (data.sortOrder !== undefined) {
      fields.push(`sort_order = $${paramIndex++}`);
      values.push(data.sortOrder);
    }

    if (fields.length === 0) {
      const existing = await pool.query(
        `SELECT * FROM ${schema}.cab_meeting_changes WHERE meeting_id = $1 AND change_id = $2`,
        [meeting.id, changeId]
      );
      return existing.rows[0];
    }

    values.push(meeting.id, changeId);

    const result = await pool.query(
      `UPDATE ${schema}.cab_meeting_changes SET ${fields.join(', ')}
       WHERE meeting_id = $${paramIndex++} AND change_id = $${paramIndex}
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Change in meeting agenda', changeId);
    }

    return result.rows[0];
  }

  // ==================
  // MEETING ACTIONS
  // ==================

  async generateAgenda(tenantSlug: string, meetingId: string): Promise<string> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const meeting = await this.getById(tenantSlug, meetingId) as {
      id: string;
      title: string;
      meeting_date: string;
      changes: Array<{
        sort_order: number;
        change_number: string;
        change_title: string;
        change_type: string;
        risk_level: string;
        requester_name: string;
        time_allocated_minutes: number;
      }>;
    };

    const lines: string[] = [
      `CAB MEETING AGENDA`,
      `==================`,
      ``,
      `Meeting: ${meeting.title}`,
      `Date: ${new Date(meeting.meeting_date).toLocaleString()}`,
      ``,
      `CHANGES FOR REVIEW`,
      `------------------`,
      ``,
    ];

    if (meeting.changes && meeting.changes.length > 0) {
      meeting.changes.forEach((change, index) => {
        lines.push(`${index + 1}. ${change.change_number}: ${change.change_title}`);
        lines.push(`   Type: ${change.change_type} | Risk: ${change.risk_level}`);
        lines.push(`   Requester: ${change.requester_name || 'N/A'}`);
        lines.push(`   Time Allocated: ${change.time_allocated_minutes} minutes`);
        lines.push(``);
      });
    } else {
      lines.push(`No changes scheduled for review.`);
      lines.push(``);
    }

    lines.push(`------------------`);
    lines.push(`End of Agenda`);

    const agenda = lines.join('\n');

    // Save the generated agenda
    await pool.query(
      `UPDATE ${schema}.cab_meetings SET agenda = $1, updated_at = NOW() WHERE id = $2`,
      [agenda, meeting.id]
    );

    return agenda;
  }

  async saveMinutes(tenantSlug: string, meetingId: string, minutes: string): Promise<unknown> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const meeting = await this.getMeetingById(tenantSlug, meetingId);

    const result = await pool.query(
      `UPDATE ${schema}.cab_meetings SET minutes = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [minutes, meeting.id]
    );

    return result.rows[0];
  }

  async recordDecision(
    tenantSlug: string,
    meetingId: string,
    changeId: string,
    decision: string,
    notes?: string
  ): Promise<unknown> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const meeting = await this.getMeetingById(tenantSlug, meetingId);

    // Verify change is on the agenda
    const changeCheck = await pool.query(
      `SELECT id FROM ${schema}.cab_meeting_changes WHERE meeting_id = $1 AND change_id = $2`,
      [meeting.id, changeId]
    );

    if (changeCheck.rows.length === 0) {
      throw new BadRequestError('Change is not on the agenda for this meeting');
    }

    // Get current decisions
    const current = await pool.query(
      `SELECT decisions FROM ${schema}.cab_meetings WHERE id = $1`,
      [meeting.id]
    );

    const decisions: Decision[] = current.rows[0].decisions || [];

    // Remove existing decision for this change if any
    const filteredDecisions = decisions.filter((d: Decision) => d.changeId !== changeId);

    // Add new decision
    filteredDecisions.push({
      changeId,
      decision,
      notes: notes || undefined,
    });

    const result = await pool.query(
      `UPDATE ${schema}.cab_meetings SET decisions = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [JSON.stringify(filteredDecisions), meeting.id]
    );

    return result.rows[0];
  }

  async addActionItem(
    tenantSlug: string,
    meetingId: string,
    item: {
      description: string;
      assigneeId?: string;
      dueDate?: string;
    }
  ): Promise<unknown> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const meeting = await this.getMeetingById(tenantSlug, meetingId);

    // Get current action items
    const current = await pool.query(
      `SELECT action_items FROM ${schema}.cab_meetings WHERE id = $1`,
      [meeting.id]
    );

    const actionItems: ActionItem[] = current.rows[0].action_items || [];

    // Add new action item with generated ID
    const newItem: ActionItem = {
      id: crypto.randomUUID(),
      description: item.description,
      assigneeId: item.assigneeId,
      dueDate: item.dueDate,
      status: 'pending',
    };

    actionItems.push(newItem);

    const result = await pool.query(
      `UPDATE ${schema}.cab_meetings SET action_items = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [JSON.stringify(actionItems), meeting.id]
    );

    return { meeting: result.rows[0], actionItem: newItem };
  }

  async startMeeting(tenantSlug: string, meetingId: string, _userId: string): Promise<unknown> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const meeting = await this.getMeetingById(tenantSlug, meetingId);

    if (meeting.status !== 'scheduled') {
      throw new BadRequestError(`Cannot start meeting in status: ${meeting.status}`);
    }

    const result = await pool.query(
      `UPDATE ${schema}.cab_meetings SET status = 'in_progress', updated_at = NOW() WHERE id = $1 RETURNING *`,
      [meeting.id]
    );

    return result.rows[0];
  }

  async completeMeeting(tenantSlug: string, meetingId: string, _userId: string): Promise<unknown> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const meeting = await this.getMeetingById(tenantSlug, meetingId);

    if (meeting.status !== 'in_progress') {
      throw new BadRequestError(`Cannot complete meeting in status: ${meeting.status}`);
    }

    const result = await pool.query(
      `UPDATE ${schema}.cab_meetings
       SET status = 'completed', meeting_end = NOW(), updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [meeting.id]
    );

    return result.rows[0];
  }

  async cancelMeeting(tenantSlug: string, meetingId: string, _userId: string): Promise<unknown> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const meeting = await this.getMeetingById(tenantSlug, meetingId);

    if (['completed', 'cancelled'].includes(meeting.status)) {
      throw new BadRequestError(`Cannot cancel meeting in status: ${meeting.status}`);
    }

    const result = await pool.query(
      `UPDATE ${schema}.cab_meetings SET status = 'cancelled', updated_at = NOW() WHERE id = $1 RETURNING *`,
      [meeting.id]
    );

    return result.rows[0];
  }

  async getUpcoming(tenantSlug: string, days: number = 14): Promise<unknown[]> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(
      `SELECT m.*,
              u.name as organizer_name,
              (SELECT COUNT(*) FROM ${schema}.cab_meeting_attendees WHERE meeting_id = m.id) as attendee_count,
              (SELECT COUNT(*) FROM ${schema}.cab_meeting_changes WHERE meeting_id = m.id) as change_count
       FROM ${schema}.cab_meetings m
       LEFT JOIN ${schema}.users u ON m.organizer_id = u.id
       WHERE m.status = 'scheduled'
       AND m.meeting_date >= NOW()
       AND m.meeting_date <= NOW() + $1 * INTERVAL '1 day'
       ORDER BY m.meeting_date ASC`,
      [days]
    );

    return result.rows;
  }

  // Get changes pending CAB review (for adding to meetings)
  async getPendingChanges(tenantSlug: string): Promise<unknown[]> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(
      `SELECT c.*,
              req.name as requester_name,
              app.name as application_name
       FROM ${schema}.change_requests c
       LEFT JOIN ${schema}.users req ON c.requester_id = req.id
       LEFT JOIN ${schema}.applications app ON c.application_id = app.id
       WHERE c.cab_required = true
       AND c.status IN ('submitted', 'review')
       AND c.id NOT IN (
         SELECT change_id FROM ${schema}.cab_meeting_changes mc
         JOIN ${schema}.cab_meetings m ON mc.meeting_id = m.id
         WHERE m.status IN ('scheduled', 'in_progress')
       )
       ORDER BY c.created_at`
    );

    return result.rows;
  }
}

export const cabMeetingService = new CabMeetingService();
