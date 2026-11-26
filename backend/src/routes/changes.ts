import { FastifyInstance } from 'fastify';
import {
  changeWindowService,
  changeTemplateService,
  changeRequestService,
} from '../services/changes.js';
import { cabMeetingService } from '../services/cabMeetings.js';
import { requirePermission } from '../middleware/auth.js';
import { parsePagination, createPaginatedResponse } from '../utils/pagination.js';
import { validate } from '../middleware/validation.js';
import {
  addActionItemSchema,
  addAttendeeSchema,
  addMeetingChangeSchema,
  commentSchema,
  createCabMeetingSchema,
  createChangeSchema,
  createTaskSchema,
  createTemplateSchema,
  createWindowSchema,
  idChangeParamSchema,
  idParamSchema,
  idTaskParamSchema,
  idUserParamSchema,
  recordDecisionSchema,
  saveMinutesSchema,
  updateAttendeeSchema,
  updateCabMeetingSchema,
  updateChangeSchema,
  updateMeetingChangeSchema,
  updateTaskSchema,
  updateTemplateSchema,
  updateWindowSchema,
  type AddActionItemInput,
  type AddAttendeeInput,
  type AddMeetingChangeInput,
  type CommentInput,
  type CreateCabMeetingInput,
  type CreateChangeInput,
  type CreateTaskInput,
  type CreateTemplateInput,
  type CreateWindowInput,
  type IdChangeParamInput,
  type IdParamInput,
  type IdTaskParamInput,
  type IdUserParamInput,
  type RecordDecisionInput,
  type SaveMinutesInput,
  type UpdateAttendeeInput,
  type UpdateCabMeetingInput,
  type UpdateChangeInput,
  type UpdateMeetingChangeInput,
  type UpdateTaskInput,
  type UpdateTemplateInput,
  type UpdateWindowInput,
  cancelChangeSchema,
  approveChangeSchema,
  rejectChangeSchema,
  scheduleChangeSchema,
  completeChangeSchema,
  failChangeSchema,
  rollbackChangeSchema,
  completeTaskSchema,
  type CancelChangeInput,
  type ApproveChangeInput,
  type RejectChangeInput,
  type ScheduleChangeInput,
  type CompleteChangeInput,
  type FailChangeInput,
  type RollbackChangeInput,
  type CompleteTaskInput,
} from '../schemas/changes.js';

// ============================================
// CHANGE WINDOW SCHEMAS
// ============================================



// ============================================
// CHANGE TEMPLATE SCHEMAS
// ============================================



// ============================================
// CHANGE REQUEST SCHEMAS
// ============================================






// ============================================
// CAB MEETING SCHEMAS
// ============================================










// Parameter validation schemas




// Query validation schemas (for future use with stricter validation)




export default async function changeRoutes(app: FastifyInstance) {
  // ========================================
  // CHANGE WINDOWS
  // ========================================

  // List change windows
  app.get('/change-windows', {
    preHandler: [requirePermission('changes:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const query = request.query as Record<string, string>;
    const pagination = parsePagination(query);

    const filters = {
      type: query.type,
      status: query.status,
    };

    const { windows, total } = await changeWindowService.list(tenantSlug, pagination, filters);
    reply.send(createPaginatedResponse(windows, total, pagination));
  });

  // Get upcoming change windows
  app.get('/change-windows/upcoming', {
    preHandler: [requirePermission('changes:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const query = request.query as Record<string, string>;
    const days = query.days ? parseInt(query.days, 10) : 30;

    const windows = await changeWindowService.getUpcoming(tenantSlug, days);
    reply.send({ data: windows });
  });

  // Get change window by ID
  app.get<{ Params: { id: string } }>('/change-windows/:id', {
    preHandler: [requirePermission('changes:read'), validate({ params: idParamSchema })],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { id } = request.params as IdParamInput;

    const window = await changeWindowService.findById(tenantSlug, id);

    if (!window) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: `Change window with id '${id}' not found`,
      });
    }

    reply.send(window);
  });

  // Create change window
  app.post('/change-windows', {
    preHandler: [requirePermission('change_windows:manage'), validate({ body: createWindowSchema })],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const body = request.body as CreateWindowInput;

    const window = await changeWindowService.create(tenantSlug, body);
    reply.status(201).send(window);
  });

  // Update change window
  app.put<{ Params: { id: string } }>('/change-windows/:id', {
    preHandler: [requirePermission('change_windows:manage'), validate({ params: idParamSchema, body: updateWindowSchema })],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { id } = request.params as IdParamInput;
    const body = request.body as UpdateWindowInput;

    const window = await changeWindowService.update(tenantSlug, id, body);
    reply.send(window);
  });

  // Delete change window
  app.delete<{ Params: { id: string } }>('/change-windows/:id', {
    preHandler: [requirePermission('change_windows:manage'), validate({ params: idParamSchema })],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { id } = request.params as IdParamInput;

    await changeWindowService.delete(tenantSlug, id);
    reply.status(204).send();
  });

  // ========================================
  // CHANGE TEMPLATES
  // ========================================

  // List change templates
  app.get('/change-templates', {
    preHandler: [requirePermission('changes:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const query = request.query as Record<string, string>;
    const pagination = parsePagination(query);

    const { templates, total } = await changeTemplateService.list(tenantSlug, pagination);
    reply.send(createPaginatedResponse(templates, total, pagination));
  });

  // Get change template by ID
  app.get<{ Params: { id: string } }>('/change-templates/:id', {
    preHandler: [requirePermission('changes:read'), validate({ params: idParamSchema })],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { id } = request.params as IdParamInput;

    const template = await changeTemplateService.findById(tenantSlug, id);

    if (!template) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: `Change template with id '${id}' not found`,
      });
    }

    reply.send(template);
  });

  // Create change template
  app.post('/change-templates', {
    preHandler: [requirePermission('change_templates:manage'), validate({ body: createTemplateSchema })],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const body = request.body as CreateTemplateInput;

    const template = await changeTemplateService.create(tenantSlug, body);
    reply.status(201).send(template);
  });

  // Update change template
  app.put<{ Params: { id: string } }>('/change-templates/:id', {
    preHandler: [requirePermission('change_templates:manage'), validate({ params: idParamSchema, body: updateTemplateSchema })],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { id } = request.params as IdParamInput;
    const body = request.body as UpdateTemplateInput;

    const template = await changeTemplateService.update(tenantSlug, id, body);
    reply.send(template);
  });

  // Delete change template
  app.delete<{ Params: { id: string } }>('/change-templates/:id', {
    preHandler: [requirePermission('change_templates:manage'), validate({ params: idParamSchema })],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { id } = request.params as IdParamInput;

    await changeTemplateService.delete(tenantSlug, id);
    reply.status(204).send();
  });

  // ========================================
  // CHANGE REQUESTS
  // ========================================

  // List change requests
  app.get('/', {
    preHandler: [requirePermission('changes:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const query = request.query as Record<string, string>;
    const pagination = parsePagination(query);

    const filters = {
      status: query.status,
      type: query.type,
      applicationId: query.application_id,
      requesterId: query.requester_id,
      implementerId: query.implementer_id,
      riskLevel: query.risk_level,
    };

    const { changes, total } = await changeRequestService.list(tenantSlug, pagination, filters);
    reply.send(createPaginatedResponse(changes, total, pagination));
  });

  // Get change request by ID
  app.get<{ Params: { id: string } }>('/:id', {
    preHandler: [requirePermission('changes:read'), validate({ params: idParamSchema })],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { id } = request.params as IdParamInput;

    const change = await changeRequestService.findById(tenantSlug, id);

    if (!change) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: `Change request with id '${id}' not found`,
      });
    }

    reply.send(change);
  });

  // Create change request
  app.post('/', {
    preHandler: [requirePermission('changes:create'), validate({ body: createChangeSchema })],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const body = request.body as CreateChangeInput;

    const change = await changeRequestService.create(tenantSlug, body, userId);
    reply.status(201).send(change);
  });

  // Update change request
  app.put<{ Params: { id: string } }>('/:id', {
    preHandler: [requirePermission('changes:update'), validate({ params: idParamSchema, body: updateChangeSchema })],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { id } = request.params as IdParamInput;
    const body = request.body as UpdateChangeInput;

    const change = await changeRequestService.update(tenantSlug, id, body, userId);
    reply.send(change);
  });

  // Cancel change request
  app.delete<{ Params: { id: string } }>('/:id', {
    preHandler: [requirePermission('changes:delete'), validate({ body: cancelChangeSchema, params: idParamSchema })],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { id } = request.params as IdParamInput;
    const body = request.body as CancelChangeInput;

    await changeRequestService.cancel(tenantSlug, id, userId, body?.reason);
    reply.status(204).send();
  });

  // ========================================
  // CHANGE REQUEST WORKFLOW
  // ========================================

  // Submit for approval
  app.post<{ Params: { id: string } }>('/:id/submit', {
    preHandler: [requirePermission('changes:update'), validate({ params: idParamSchema })],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { id } = request.params as IdParamInput;

    const change = await changeRequestService.submit(tenantSlug, id, userId);
    reply.send(change);
  });

  // Approve change
  app.post<{ Params: { id: string } }>('/:id/approve', {
    preHandler: [requirePermission('changes:approve'), validate({ body: approveChangeSchema, params: idParamSchema })],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { id } = request.params as IdParamInput;
    const body = request.body as ApproveChangeInput;

    const change = await changeRequestService.approve(
      tenantSlug,
      id,
      userId,
      body?.comments
    );
    reply.send(change);
  });

  // Reject change
  app.post<{ Params: { id: string } }>('/:id/reject', {
    preHandler: [requirePermission('changes:approve'), validate({ body: rejectChangeSchema, params: idParamSchema })],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { id } = request.params as IdParamInput;
    const body = request.body as RejectChangeInput;

    const change = await changeRequestService.reject(tenantSlug, id, userId, body.reason);
    reply.send(change);
  });

  // Schedule change
  app.post<{ Params: { id: string } }>('/:id/schedule', {
    preHandler: [requirePermission('changes:update'), validate({ body: scheduleChangeSchema, params: idParamSchema })],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { id } = request.params as IdParamInput;
    const body = request.body as ScheduleChangeInput;

    const change = await changeRequestService.schedule(
      tenantSlug,
      id,
      userId,
      body?.plannedStart,
      body?.plannedEnd
    );
    reply.send(change);
  });

  // Start implementation
  app.post<{ Params: { id: string } }>('/:id/start', {
    preHandler: [requirePermission('changes:implement'), validate({ params: idParamSchema })],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { id } = request.params as IdParamInput;

    const change = await changeRequestService.start(tenantSlug, id, userId);
    reply.send(change);
  });

  // Complete change
  app.post<{ Params: { id: string } }>('/:id/complete', {
    preHandler: [requirePermission('changes:implement'), validate({ body: completeChangeSchema, params: idParamSchema })],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { id } = request.params as IdParamInput;
    const body = request.body as CompleteChangeInput;

    const change = await changeRequestService.complete(
      tenantSlug,
      id,
      userId,
      body?.outcomeNotes
    );
    reply.send(change);
  });

  // Mark as failed
  app.post<{ Params: { id: string } }>('/:id/fail', {
    preHandler: [requirePermission('changes:implement'), validate({ body: failChangeSchema, params: idParamSchema })],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { id } = request.params as IdParamInput;
    const body = request.body as FailChangeInput;

    const change = await changeRequestService.fail(
      tenantSlug,
      id,
      userId,
      body.outcomeNotes
    );
    reply.send(change);
  });

  // Rollback
  app.post<{ Params: { id: string } }>('/:id/rollback', {
    preHandler: [requirePermission('changes:implement'), validate({ body: rollbackChangeSchema, params: idParamSchema })],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { id } = request.params as IdParamInput;
    const body = request.body as RollbackChangeInput;

    const change = await changeRequestService.rollback(
      tenantSlug,
      id,
      userId,
      body.outcomeNotes
    );
    reply.send(change);
  });

  // ========================================
  // APPROVALS
  // ========================================

  // Get approvals
  app.get<{ Params: { id: string } }>('/:id/approvals', {
    preHandler: [requirePermission('changes:read'), validate({ params: idParamSchema })],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { id } = request.params as IdParamInput;

    const approvals = await changeRequestService.getApprovals(tenantSlug, id);
    reply.send({ data: approvals });
  });

  // ========================================
  // STATUS HISTORY
  // ========================================

  // Get status history
  app.get<{ Params: { id: string } }>('/:id/history', {
    preHandler: [requirePermission('changes:read'), validate({ params: idParamSchema })],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { id } = request.params as IdParamInput;

    const history = await changeRequestService.getStatusHistory(tenantSlug, id);
    reply.send({ data: history });
  });

  // ========================================
  // TASKS
  // ========================================

  // Get tasks
  app.get<{ Params: { id: string } }>('/:id/tasks', {
    preHandler: [requirePermission('changes:read'), validate({ params: idParamSchema })],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { id } = request.params as IdParamInput;

    const tasks = await changeRequestService.getTasks(tenantSlug, id);
    reply.send({ data: tasks });
  });

  // Create task
  app.post<{ Params: { id: string } }>('/:id/tasks', {
    preHandler: [requirePermission('changes:update'), validate({ params: idParamSchema, body: createTaskSchema })],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { id } = request.params as IdParamInput;
    const body = request.body as CreateTaskInput;

    const task = await changeRequestService.createTask(tenantSlug, id, body);
    reply.status(201).send(task);
  });

  // Update task
  app.put<{ Params: { id: string; taskId: string } }>('/:id/tasks/:taskId', {
    preHandler: [requirePermission('changes:update'), validate({ params: idTaskParamSchema, body: updateTaskSchema })],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { id, taskId } = request.params as IdTaskParamInput;
    const body = request.body as UpdateTaskInput;

    const task = await changeRequestService.updateTask(
      tenantSlug,
      id,
      taskId,
      body
    );
    reply.send(task);
  });

  // Start task
  app.post<{ Params: { id: string; taskId: string } }>('/:id/tasks/:taskId/start', {
    preHandler: [requirePermission('changes:implement'), validate({ params: idTaskParamSchema })],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { id, taskId } = request.params as IdTaskParamInput;

    const task = await changeRequestService.startTask(
      tenantSlug,
      id,
      taskId
    );
    reply.send(task);
  });

  // Complete task
  app.post<{ Params: { id: string; taskId: string } }>('/:id/tasks/:taskId/complete', {
    preHandler: [requirePermission('changes:implement'), validate({ body: completeTaskSchema, params: idTaskParamSchema })],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { id, taskId } = request.params as IdTaskParamInput;
    const body = request.body as CompleteTaskInput;

    const task = await changeRequestService.completeTask(
      tenantSlug,
      id,
      taskId,
      body?.notes
    );
    reply.send(task);
  });

  // Delete task
  app.delete<{ Params: { id: string; taskId: string } }>('/:id/tasks/:taskId', {
    preHandler: [requirePermission('changes:update'), validate({ params: idTaskParamSchema })],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { id, taskId } = request.params as IdTaskParamInput;

    await changeRequestService.deleteTask(tenantSlug, id, taskId);
    reply.status(204).send();
  });

  // ========================================
  // COMMENTS
  // ========================================

  // Get comments
  app.get<{ Params: { id: string } }>('/:id/comments', {
    preHandler: [requirePermission('changes:read'), validate({ params: idParamSchema })],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { id } = request.params as IdParamInput;

    const comments = await changeRequestService.getComments(tenantSlug, id);
    reply.send({ data: comments });
  });

  // Add comment
  app.post<{ Params: { id: string } }>('/:id/comments', {
    preHandler: [requirePermission('changes:read'), validate({ params: idParamSchema, body: commentSchema })],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { id } = request.params as IdParamInput;
    const body = request.body as CommentInput;

    const comment = await changeRequestService.addComment(
      tenantSlug,
      id,
      userId,
      body.content,
      body.isInternal
    );
    reply.status(201).send(comment);
  });

  // ========================================
  // CAB MEETINGS
  // ========================================

  // List CAB meetings
  app.get('/cab-meetings', {
    preHandler: [requirePermission('changes:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const query = request.query as Record<string, string>;
    const pagination = parsePagination(query);

    const filters = {
      status: query.status,
      organizerId: query.organizer_id,
      fromDate: query.from_date,
      toDate: query.to_date,
    };

    const { meetings, total } = await cabMeetingService.list(tenantSlug, pagination, filters);
    reply.send(createPaginatedResponse(meetings, total, pagination));
  });

  // Get upcoming CAB meetings
  app.get('/cab-meetings/upcoming', {
    preHandler: [requirePermission('changes:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const query = request.query as Record<string, string>;
    const days = query.days ? parseInt(query.days, 10) : 14;

    const meetings = await cabMeetingService.getUpcoming(tenantSlug, days);
    reply.send({ data: meetings });
  });

  // Get pending changes for CAB review
  app.get('/cab-meetings/pending-changes', {
    preHandler: [requirePermission('changes:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;

    const changes = await cabMeetingService.getPendingChanges(tenantSlug);
    reply.send({ data: changes });
  });

  // Get CAB meeting by ID
  app.get<{ Params: { id: string } }>('/cab-meetings/:id', {
    preHandler: [requirePermission('changes:read'), validate({ params: idParamSchema })],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { id } = request.params as IdParamInput;

    const meeting = await cabMeetingService.getById(tenantSlug, id);
    reply.send(meeting);
  });

  // Create CAB meeting
  app.post('/cab-meetings', {
    preHandler: [requirePermission('changes:approve'), validate({ body: createCabMeetingSchema })],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const body = request.body as CreateCabMeetingInput;

    const meeting = await cabMeetingService.create(tenantSlug, userId, body);
    reply.status(201).send(meeting);
  });

  // Update CAB meeting
  app.put<{ Params: { id: string } }>('/cab-meetings/:id', {
    preHandler: [requirePermission('changes:approve'), validate({ params: idParamSchema, body: updateCabMeetingSchema })],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { id } = request.params as IdParamInput;
    const body = request.body as UpdateCabMeetingInput;

    const meeting = await cabMeetingService.update(tenantSlug, id, body);
    reply.send(meeting);
  });

  // Delete CAB meeting
  app.delete<{ Params: { id: string } }>('/cab-meetings/:id', {
    preHandler: [requirePermission('changes:approve'), validate({ params: idParamSchema })],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { id } = request.params as IdParamInput;

    await cabMeetingService.delete(tenantSlug, id);
    reply.status(204).send();
  });

  // ========================================
  // CAB MEETING ATTENDEES
  // ========================================

  // List attendees
  app.get<{ Params: { id: string } }>('/cab-meetings/:id/attendees', {
    preHandler: [requirePermission('changes:read'), validate({ params: idParamSchema })],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { id } = request.params as IdParamInput;

    const attendees = await cabMeetingService.getAttendees(tenantSlug, id);
    reply.send({ data: attendees });
  });

  // Add attendee
  app.post<{ Params: { id: string } }>('/cab-meetings/:id/attendees', {
    preHandler: [requirePermission('changes:approve'), validate({ params: idParamSchema, body: addAttendeeSchema })],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { id } = request.params as IdParamInput;
    const body = request.body as AddAttendeeInput;

    const attendee = await cabMeetingService.addAttendee(
      tenantSlug,
      id,
      body.userId,
      body.role
    );
    reply.status(201).send(attendee);
  });

  // Remove attendee
  app.delete<{ Params: { id: string; userId: string } }>('/cab-meetings/:id/attendees/:userId', {
    preHandler: [requirePermission('changes:approve'), validate({ params: idUserParamSchema })],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { id, userId } = request.params as IdUserParamInput;

    await cabMeetingService.removeAttendee(
      tenantSlug,
      id,
      userId
    );
    reply.status(204).send();
  });

  // Update attendee status (RSVP)
  app.put<{ Params: { id: string; userId: string } }>('/cab-meetings/:id/attendees/:userId', {
    preHandler: [requirePermission('changes:read'), validate({ params: idUserParamSchema, body: updateAttendeeSchema })],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { id, userId } = request.params as IdUserParamInput;
    const body = request.body as UpdateAttendeeInput;

    const attendee = await cabMeetingService.updateAttendeeStatus(
      tenantSlug,
      id,
      userId,
      body.status,
      body.notes
    );
    reply.send(attendee);
  });

  // ========================================
  // CAB MEETING CHANGES (AGENDA)
  // ========================================

  // List changes for meeting
  app.get<{ Params: { id: string } }>('/cab-meetings/:id/changes', {
    preHandler: [requirePermission('changes:read'), validate({ params: idParamSchema })],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { id } = request.params as IdParamInput;

    const changes = await cabMeetingService.getChanges(tenantSlug, id);
    reply.send({ data: changes });
  });

  // Add change to meeting
  app.post<{ Params: { id: string } }>('/cab-meetings/:id/changes', {
    preHandler: [requirePermission('changes:approve'), validate({ params: idParamSchema, body: addMeetingChangeSchema })],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { id } = request.params as IdParamInput;
    const body = request.body as AddMeetingChangeInput;

    const change = await cabMeetingService.addChange(
      tenantSlug,
      id,
      body.changeId,
      body.timeAllocatedMinutes,
      body.sortOrder
    );
    reply.status(201).send(change);
  });

  // Remove change from meeting
  app.delete<{ Params: { id: string; changeId: string } }>('/cab-meetings/:id/changes/:changeId', {
    preHandler: [requirePermission('changes:approve'), validate({ params: idChangeParamSchema })],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { id, changeId } = request.params as IdChangeParamInput;

    await cabMeetingService.removeChange(
      tenantSlug,
      id,
      changeId
    );
    reply.status(204).send();
  });

  // Update change in meeting (notes, time, order)
  app.put<{ Params: { id: string; changeId: string } }>('/cab-meetings/:id/changes/:changeId', {
    preHandler: [requirePermission('changes:approve'), validate({ params: idChangeParamSchema, body: updateMeetingChangeSchema })],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { id, changeId } = request.params as IdChangeParamInput;
    const body = request.body as UpdateMeetingChangeInput;

    const change = await cabMeetingService.updateChange(
      tenantSlug,
      id,
      changeId,
      body
    );
    reply.send(change);
  });

  // ========================================
  // CAB MEETING ACTIONS
  // ========================================

  // Start meeting
  app.post<{ Params: { id: string } }>('/cab-meetings/:id/start', {
    preHandler: [requirePermission('changes:approve'), validate({ params: idParamSchema })],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { id } = request.params as IdParamInput;

    const meeting = await cabMeetingService.startMeeting(tenantSlug, id, userId);
    reply.send(meeting);
  });

  // Complete meeting
  app.post<{ Params: { id: string } }>('/cab-meetings/:id/complete', {
    preHandler: [requirePermission('changes:approve'), validate({ params: idParamSchema })],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { id } = request.params as IdParamInput;

    const meeting = await cabMeetingService.completeMeeting(tenantSlug, id, userId);
    reply.send(meeting);
  });

  // Cancel meeting
  app.post<{ Params: { id: string } }>('/cab-meetings/:id/cancel', {
    preHandler: [requirePermission('changes:approve'), validate({ params: idParamSchema })],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { id } = request.params as IdParamInput;

    const meeting = await cabMeetingService.cancelMeeting(tenantSlug, id, userId);
    reply.send(meeting);
  });

  // Generate agenda
  app.post<{ Params: { id: string } }>('/cab-meetings/:id/generate-agenda', {
    preHandler: [requirePermission('changes:approve'), validate({ params: idParamSchema })],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { id } = request.params as IdParamInput;

    const agenda = await cabMeetingService.generateAgenda(tenantSlug, id);
    reply.send({ agenda });
  });

  // Save minutes
  app.post<{ Params: { id: string } }>('/cab-meetings/:id/minutes', {
    preHandler: [requirePermission('changes:approve'), validate({ params: idParamSchema, body: saveMinutesSchema })],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { id } = request.params as IdParamInput;
    const body = request.body as SaveMinutesInput;

    const meeting = await cabMeetingService.saveMinutes(
      tenantSlug,
      id,
      body.minutes
    );
    reply.send(meeting);
  });

  // Record decision for a change
  app.post<{ Params: { id: string } }>('/cab-meetings/:id/decisions', {
    preHandler: [requirePermission('changes:approve'), validate({ params: idParamSchema, body: recordDecisionSchema })],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { id } = request.params as IdParamInput;
    const body = request.body as RecordDecisionInput;

    const meeting = await cabMeetingService.recordDecision(
      tenantSlug,
      id,
      body.changeId,
      body.decision,
      body.notes
    );
    reply.send(meeting);
  });

  // Add action item
  app.post<{ Params: { id: string } }>('/cab-meetings/:id/action-items', {
    preHandler: [requirePermission('changes:approve'), validate({ params: idParamSchema, body: addActionItemSchema })],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { id } = request.params as IdParamInput;
    const body = request.body as AddActionItemInput;

    const result = await cabMeetingService.addActionItem(
      tenantSlug,
      id,
      body
    );
    reply.status(201).send(result);
  });
}
