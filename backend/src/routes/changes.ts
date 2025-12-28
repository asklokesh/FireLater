import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  changeWindowService,
  changeTemplateService,
  changeRequestService,
} from '../services/changes.js';
import { requirePermission } from '../middleware/auth.js';
import { parsePagination, createPaginatedResponse } from '../utils/pagination.js';

// ============================================
// CHANGE WINDOW SCHEMAS
// ============================================

const createWindowSchema = z.object({
  name: z.string().min(2).max(255),
  description: z.string().max(2000).optional(),
  type: z.enum(['maintenance', 'freeze', 'emergency_only', 'blackout']),
  recurrence: z.enum(['one_time', 'weekly', 'monthly', 'custom']).optional(),
  recurrenceRule: z.string().max(500).optional(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  startDate: z.string().date().optional(),
  endDate: z.string().date().optional(),
  dayOfWeek: z.array(z.number().int().min(0).max(6)).optional(),
  timezone: z.string().max(100).optional(),
  applications: z.array(z.string().uuid()).optional(),
  tiers: z.array(z.enum(['P1', 'P2', 'P3', 'P4'])).optional(),
  notifyBeforeMinutes: z.number().int().min(0).max(1440).optional(),
});

const updateWindowSchema = createWindowSchema.partial().extend({
  status: z.enum(['active', 'inactive']).optional(),
});

// ============================================
// CHANGE TEMPLATE SCHEMAS
// ============================================

const createTemplateSchema = z.object({
  name: z.string().min(2).max(255),
  description: z.string().max(2000).optional(),
  type: z.enum(['standard', 'normal']).optional(),
  category: z.string().max(100).optional(),
  defaultRiskLevel: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  implementationPlanTemplate: z.string().max(10000).optional(),
  rollbackPlanTemplate: z.string().max(10000).optional(),
  testPlanTemplate: z.string().max(10000).optional(),
  defaultTasks: z.array(z.object({
    title: z.string(),
    description: z.string().optional(),
    taskType: z.string().optional(),
    sortOrder: z.number().optional(),
  })).optional(),
  approvalRequired: z.boolean().optional(),
  approvalGroups: z.array(z.string().uuid()).optional(),
});

const updateTemplateSchema = createTemplateSchema.partial().extend({
  isActive: z.boolean().optional(),
});

// ============================================
// CHANGE REQUEST SCHEMAS
// ============================================

const createChangeSchema = z.object({
  title: z.string().min(5).max(500),
  description: z.string().max(10000).optional(),
  justification: z.string().max(5000).optional(),
  type: z.enum(['standard', 'normal', 'emergency']).optional(),
  category: z.string().max(100).optional(),
  riskLevel: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  impact: z.enum(['none', 'minor', 'moderate', 'significant', 'major']).optional(),
  urgency: z.enum(['low', 'medium', 'high']).optional(),
  templateId: z.string().uuid().optional(),
  applicationId: z.string().uuid().optional(),
  environmentId: z.string().uuid().optional(),
  assignedGroup: z.string().uuid().optional(),
  plannedStart: z.string().datetime().optional(),
  plannedEnd: z.string().datetime().optional(),
  downtimeMinutes: z.number().int().min(0).optional(),
  changeWindowId: z.string().uuid().optional(),
  implementationPlan: z.string().max(20000).optional(),
  rollbackPlan: z.string().max(20000).optional(),
  testPlan: z.string().max(20000).optional(),
  communicationPlan: z.string().max(10000).optional(),
  riskAssessment: z.record(z.unknown()).optional(),
  cabRequired: z.boolean().optional(),
  cabDate: z.string().datetime().optional(),
  relatedIssueId: z.string().uuid().optional(),
});

const updateChangeSchema = createChangeSchema.partial().extend({
  implementerId: z.string().uuid().optional(),
  cabNotes: z.string().max(5000).optional(),
});

const createTaskSchema = z.object({
  title: z.string().min(2).max(500),
  description: z.string().max(5000).optional(),
  taskType: z.enum(['pre_check', 'implementation', 'validation', 'rollback']).optional(),
  sortOrder: z.number().int().min(0).optional(),
  assignedTo: z.string().uuid().optional(),
  plannedStart: z.string().datetime().optional(),
  plannedEnd: z.string().datetime().optional(),
  durationMinutes: z.number().int().min(0).optional(),
  isBlocking: z.boolean().optional(),
});

const updateTaskSchema = createTaskSchema.partial().extend({
  status: z.enum(['pending', 'in_progress', 'completed', 'skipped', 'failed']).optional(),
  actualStart: z.string().datetime().optional(),
  actualEnd: z.string().datetime().optional(),
  notes: z.string().max(5000).optional(),
});

const commentSchema = z.object({
  content: z.string().min(1).max(5000),
  isInternal: z.boolean().optional(),
});

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
    preHandler: [requirePermission('changes:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const window = await changeWindowService.findById(tenantSlug, request.params.id);

    if (!window) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: `Change window with id '${request.params.id}' not found`,
      });
    }

    reply.send(window);
  });

  // Create change window
  app.post('/change-windows', {
    preHandler: [requirePermission('change_windows:manage')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const body = createWindowSchema.parse(request.body);

    const window = await changeWindowService.create(tenantSlug, body);
    reply.status(201).send(window);
  });

  // Update change window
  app.put<{ Params: { id: string } }>('/change-windows/:id', {
    preHandler: [requirePermission('change_windows:manage')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const body = updateWindowSchema.parse(request.body);

    const window = await changeWindowService.update(tenantSlug, request.params.id, body);
    reply.send(window);
  });

  // Delete change window
  app.delete<{ Params: { id: string } }>('/change-windows/:id', {
    preHandler: [requirePermission('change_windows:manage')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;

    await changeWindowService.delete(tenantSlug, request.params.id);
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
    preHandler: [requirePermission('changes:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const template = await changeTemplateService.findById(tenantSlug, request.params.id);

    if (!template) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: `Change template with id '${request.params.id}' not found`,
      });
    }

    reply.send(template);
  });

  // Create change template
  app.post('/change-templates', {
    preHandler: [requirePermission('change_templates:manage')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const body = createTemplateSchema.parse(request.body);

    const template = await changeTemplateService.create(tenantSlug, body);
    reply.status(201).send(template);
  });

  // Update change template
  app.put<{ Params: { id: string } }>('/change-templates/:id', {
    preHandler: [requirePermission('change_templates:manage')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const body = updateTemplateSchema.parse(request.body);

    const template = await changeTemplateService.update(tenantSlug, request.params.id, body);
    reply.send(template);
  });

  // Delete change template
  app.delete<{ Params: { id: string } }>('/change-templates/:id', {
    preHandler: [requirePermission('change_templates:manage')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;

    await changeTemplateService.delete(tenantSlug, request.params.id);
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
    preHandler: [requirePermission('changes:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const change = await changeRequestService.findById(tenantSlug, request.params.id);

    if (!change) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: `Change request with id '${request.params.id}' not found`,
      });
    }

    reply.send(change);
  });

  // Create change request
  app.post('/', {
    preHandler: [requirePermission('changes:create')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const body = createChangeSchema.parse(request.body);

    const change = await changeRequestService.create(tenantSlug, body, userId);
    reply.status(201).send(change);
  });

  // Update change request
  app.put<{ Params: { id: string } }>('/:id', {
    preHandler: [requirePermission('changes:update')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const body = updateChangeSchema.parse(request.body);

    const change = await changeRequestService.update(tenantSlug, request.params.id, body, userId);
    reply.send(change);
  });

  // Cancel change request
  app.delete<{ Params: { id: string } }>('/:id', {
    preHandler: [requirePermission('changes:delete')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const body = request.body as { reason?: string } | undefined;

    await changeRequestService.cancel(tenantSlug, request.params.id, userId, body?.reason);
    reply.status(204).send();
  });

  // ========================================
  // CHANGE REQUEST WORKFLOW
  // ========================================

  // Submit for approval
  app.post<{ Params: { id: string } }>('/:id/submit', {
    preHandler: [requirePermission('changes:update')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;

    const change = await changeRequestService.submit(tenantSlug, request.params.id, userId);
    reply.send(change);
  });

  // Approve change
  app.post<{ Params: { id: string } }>('/:id/approve', {
    preHandler: [requirePermission('changes:approve')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const body = request.body as { comments?: string } | undefined;

    const change = await changeRequestService.approve(
      tenantSlug,
      request.params.id,
      userId,
      body?.comments
    );
    reply.send(change);
  });

  // Reject change
  app.post<{ Params: { id: string } }>('/:id/reject', {
    preHandler: [requirePermission('changes:approve')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const body = z.object({ reason: z.string().min(1).max(2000) }).parse(request.body);

    const change = await changeRequestService.reject(tenantSlug, request.params.id, userId, body.reason);
    reply.send(change);
  });

  // Schedule change
  app.post<{ Params: { id: string } }>('/:id/schedule', {
    preHandler: [requirePermission('changes:update')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const body = request.body as { plannedStart?: string; plannedEnd?: string } | undefined;

    const change = await changeRequestService.schedule(
      tenantSlug,
      request.params.id,
      userId,
      body?.plannedStart,
      body?.plannedEnd
    );
    reply.send(change);
  });

  // Start implementation
  app.post<{ Params: { id: string } }>('/:id/start', {
    preHandler: [requirePermission('changes:implement')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;

    const change = await changeRequestService.start(tenantSlug, request.params.id, userId);
    reply.send(change);
  });

  // Complete change
  app.post<{ Params: { id: string } }>('/:id/complete', {
    preHandler: [requirePermission('changes:implement')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const body = request.body as { outcomeNotes?: string } | undefined;

    const change = await changeRequestService.complete(
      tenantSlug,
      request.params.id,
      userId,
      body?.outcomeNotes
    );
    reply.send(change);
  });

  // Mark as failed
  app.post<{ Params: { id: string } }>('/:id/fail', {
    preHandler: [requirePermission('changes:implement')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const body = z.object({ outcomeNotes: z.string().min(1).max(5000) }).parse(request.body);

    const change = await changeRequestService.fail(
      tenantSlug,
      request.params.id,
      userId,
      body.outcomeNotes
    );
    reply.send(change);
  });

  // Rollback
  app.post<{ Params: { id: string } }>('/:id/rollback', {
    preHandler: [requirePermission('changes:implement')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const body = z.object({ outcomeNotes: z.string().min(1).max(5000) }).parse(request.body);

    const change = await changeRequestService.rollback(
      tenantSlug,
      request.params.id,
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
    preHandler: [requirePermission('changes:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;

    const approvals = await changeRequestService.getApprovals(tenantSlug, request.params.id);
    reply.send({ data: approvals });
  });

  // ========================================
  // STATUS HISTORY
  // ========================================

  // Get status history
  app.get<{ Params: { id: string } }>('/:id/history', {
    preHandler: [requirePermission('changes:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;

    const history = await changeRequestService.getStatusHistory(tenantSlug, request.params.id);
    reply.send({ data: history });
  });

  // ========================================
  // TASKS
  // ========================================

  // Get tasks
  app.get<{ Params: { id: string } }>('/:id/tasks', {
    preHandler: [requirePermission('changes:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;

    const tasks = await changeRequestService.getTasks(tenantSlug, request.params.id);
    reply.send({ data: tasks });
  });

  // Create task
  app.post<{ Params: { id: string } }>('/:id/tasks', {
    preHandler: [requirePermission('changes:update')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const body = createTaskSchema.parse(request.body);

    const task = await changeRequestService.createTask(tenantSlug, request.params.id, body);
    reply.status(201).send(task);
  });

  // Update task
  app.put<{ Params: { id: string; taskId: string } }>('/:id/tasks/:taskId', {
    preHandler: [requirePermission('changes:update')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const body = updateTaskSchema.parse(request.body);

    const task = await changeRequestService.updateTask(
      tenantSlug,
      request.params.id,
      request.params.taskId,
      body
    );
    reply.send(task);
  });

  // Start task
  app.post<{ Params: { id: string; taskId: string } }>('/:id/tasks/:taskId/start', {
    preHandler: [requirePermission('changes:implement')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;

    const task = await changeRequestService.startTask(
      tenantSlug,
      request.params.id,
      request.params.taskId
    );
    reply.send(task);
  });

  // Complete task
  app.post<{ Params: { id: string; taskId: string } }>('/:id/tasks/:taskId/complete', {
    preHandler: [requirePermission('changes:implement')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const body = request.body as { notes?: string } | undefined;

    const task = await changeRequestService.completeTask(
      tenantSlug,
      request.params.id,
      request.params.taskId,
      body?.notes
    );
    reply.send(task);
  });

  // Delete task
  app.delete<{ Params: { id: string; taskId: string } }>('/:id/tasks/:taskId', {
    preHandler: [requirePermission('changes:update')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;

    await changeRequestService.deleteTask(tenantSlug, request.params.id, request.params.taskId);
    reply.status(204).send();
  });

  // ========================================
  // COMMENTS
  // ========================================

  // Get comments
  app.get<{ Params: { id: string } }>('/:id/comments', {
    preHandler: [requirePermission('changes:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;

    const comments = await changeRequestService.getComments(tenantSlug, request.params.id);
    reply.send({ data: comments });
  });

  // Add comment
  app.post<{ Params: { id: string } }>('/:id/comments', {
    preHandler: [requirePermission('changes:read')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const body = commentSchema.parse(request.body);

    const comment = await changeRequestService.addComment(
      tenantSlug,
      request.params.id,
      userId,
      body.content,
      body.isInternal
    );
    reply.status(201).send(comment);
  });
}
