import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { oncallScheduleService, escalationPolicyService, icalExportService } from '../services/oncall.js';
import { shiftSwapService } from '../services/shiftSwaps.js';
import { requirePermission, optionalAuth } from '../middleware/auth.js';
import { parsePagination, createPaginatedResponse } from '../utils/pagination.js';
import { tenantService } from '../services/tenant.js';

// ============================================
// SCHEDULE SCHEMAS
// ============================================

const createScheduleSchema = z.object({
  name: z.string().min(2).max(255),
  description: z.string().max(1000).optional(),
  timezone: z.string().max(100).optional(),
  groupId: z.string().uuid().optional(),
  rotationType: z.enum(['daily', 'weekly', 'bi_weekly', 'custom']).optional(),
  rotationLength: z.number().int().min(1).max(52).optional(),
  handoffTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  handoffDay: z.number().int().min(0).max(6).optional(),
  color: z.string().max(20).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const updateScheduleSchema = z.object({
  name: z.string().min(2).max(255).optional(),
  description: z.string().max(1000).optional(),
  timezone: z.string().max(100).optional(),
  groupId: z.string().uuid().optional().nullable(),
  rotationType: z.enum(['daily', 'weekly', 'bi_weekly', 'custom']).optional(),
  rotationLength: z.number().int().min(1).max(52).optional(),
  handoffTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  handoffDay: z.number().int().min(0).max(6).optional(),
  isActive: z.boolean().optional(),
  color: z.string().max(20).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const addToRotationSchema = z.object({
  userId: z.string().uuid(),
  position: z.number().int().min(1).optional(),
});

const createShiftSchema = z.object({
  userId: z.string().uuid(),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  shiftType: z.enum(['primary', 'secondary']).optional(),
  layer: z.number().int().min(1).max(10).optional(),
});

const createOverrideSchema = z.object({
  userId: z.string().uuid(),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  reason: z.string().max(500).optional(),
  originalUserId: z.string().uuid().optional(),
});

// ============================================
// ESCALATION POLICY SCHEMAS
// ============================================

const createPolicySchema = z.object({
  name: z.string().min(2).max(255),
  description: z.string().max(1000).optional(),
  repeatCount: z.number().int().min(1).max(10).optional(),
  repeatDelayMinutes: z.number().int().min(1).max(60).optional(),
  isDefault: z.boolean().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const updatePolicySchema = z.object({
  name: z.string().min(2).max(255).optional(),
  description: z.string().max(1000).optional(),
  repeatCount: z.number().int().min(1).max(10).optional(),
  repeatDelayMinutes: z.number().int().min(1).max(60).optional(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const addStepSchema = z.object({
  stepNumber: z.number().int().min(1).optional(),
  delayMinutes: z.number().int().min(0).max(120).optional(),
  notifyType: z.enum(['schedule', 'user', 'group']),
  scheduleId: z.string().uuid().optional(),
  userId: z.string().uuid().optional(),
  groupId: z.string().uuid().optional(),
  notificationChannels: z.array(z.enum(['email', 'sms', 'slack', 'phone'])).optional(),
});

// ============================================
// SHIFT SWAP SCHEMAS
// ============================================

const createShiftSwapSchema = z.object({
  scheduleId: z.string().uuid(),
  originalStart: z.string().datetime(),
  originalEnd: z.string().datetime(),
  offeredToUserId: z.string().uuid().optional(),
  originalShiftId: z.string().uuid().optional(),
  reason: z.string().max(500).optional(),
  expiresAt: z.string().datetime().optional(),
});

const updateShiftSwapSchema = z.object({
  reason: z.string().max(500).optional(),
  offeredToUserId: z.string().uuid().nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
});

const swapResponseSchema = z.object({
  message: z.string().max(500).optional(),
});

const adminApproveSchema = z.object({
  accepterUserId: z.string().uuid().optional(),
});

export default async function oncallRoutes(app: FastifyInstance) {
  // ========================================
  // SCHEDULES
  // ========================================

  // List schedules
  app.get('/schedules', {
    preHandler: [requirePermission('oncall:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const query = request.query as Record<string, string>;
    const pagination = parsePagination(query);

    const filters = {
      groupId: query.group_id,
      isActive: query.is_active === 'true' ? true : query.is_active === 'false' ? false : undefined,
    };

    const { schedules, total } = await oncallScheduleService.list(tenantSlug, pagination, filters);
    reply.send(createPaginatedResponse(schedules, total, pagination));
  });

  // Get schedule by ID
  app.get<{ Params: { id: string } }>('/schedules/:id', {
    preHandler: [requirePermission('oncall:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const schedule = await oncallScheduleService.findById(tenantSlug, request.params.id);

    if (!schedule) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: `Schedule with id '${request.params.id}' not found`,
      });
    }

    reply.send(schedule);
  });

  // Create schedule
  app.post('/schedules', {
    preHandler: [requirePermission('oncall:manage')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const body = createScheduleSchema.parse(request.body);

    const schedule = await oncallScheduleService.create(tenantSlug, body, userId);
    reply.status(201).send(schedule);
  });

  // Update schedule
  app.put<{ Params: { id: string } }>('/schedules/:id', {
    preHandler: [requirePermission('oncall:manage')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const body = updateScheduleSchema.parse(request.body);

    const schedule = await oncallScheduleService.update(tenantSlug, request.params.id, body, userId);
    reply.send(schedule);
  });

  // Delete schedule
  app.delete<{ Params: { id: string } }>('/schedules/:id', {
    preHandler: [requirePermission('oncall:manage')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;

    await oncallScheduleService.delete(tenantSlug, request.params.id, userId);
    reply.status(204).send();
  });

  // Get schedule rotations
  app.get<{ Params: { id: string } }>('/schedules/:id/rotations', {
    preHandler: [requirePermission('oncall:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;

    const rotations = await oncallScheduleService.getRotations(tenantSlug, request.params.id);
    reply.send({ data: rotations });
  });

  // Add user to rotation
  app.post<{ Params: { id: string } }>('/schedules/:id/rotations', {
    preHandler: [requirePermission('oncall:manage')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const body = addToRotationSchema.parse(request.body);

    const rotation = await oncallScheduleService.addToRotation(
      tenantSlug,
      request.params.id,
      body.userId,
      body.position
    );
    reply.status(201).send(rotation);
  });

  // Update rotation position
  app.put<{ Params: { id: string; rotationId: string } }>('/schedules/:id/rotations/:rotationId', {
    preHandler: [requirePermission('oncall:manage')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const body = z.object({ position: z.number().int().min(1) }).parse(request.body);

    const rotation = await oncallScheduleService.updateRotationPosition(
      tenantSlug,
      request.params.id,
      request.params.rotationId,
      body.position
    );
    reply.send(rotation);
  });

  // Remove from rotation
  app.delete<{ Params: { id: string; rotationId: string } }>('/schedules/:id/rotations/:rotationId', {
    preHandler: [requirePermission('oncall:manage')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;

    await oncallScheduleService.removeFromRotation(tenantSlug, request.params.id, request.params.rotationId);
    reply.status(204).send();
  });

  // Get schedule shifts
  app.get<{ Params: { id: string } }>('/schedules/:id/shifts', {
    preHandler: [requirePermission('oncall:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const query = request.query as Record<string, string>;

    const startDate = query.start_date ? new Date(query.start_date) : new Date();
    const endDate = query.end_date ? new Date(query.end_date) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const shifts = await oncallScheduleService.getShifts(tenantSlug, request.params.id, startDate, endDate);
    reply.send({ data: shifts });
  });

  // Create shift
  app.post<{ Params: { id: string } }>('/schedules/:id/shifts', {
    preHandler: [requirePermission('oncall:manage')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const body = createShiftSchema.parse(request.body);

    const shift = await oncallScheduleService.createShift(
      tenantSlug,
      {
        scheduleId: request.params.id,
        userId: body.userId,
        startTime: new Date(body.startTime),
        endTime: new Date(body.endTime),
        shiftType: body.shiftType,
        layer: body.layer,
      },
      userId
    );
    reply.status(201).send(shift);
  });

  // Create override
  app.post<{ Params: { id: string } }>('/schedules/:id/override', {
    preHandler: [requirePermission('oncall:update')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const body = createOverrideSchema.parse(request.body);

    const override = await oncallScheduleService.createOverride(
      tenantSlug,
      {
        scheduleId: request.params.id,
        userId: body.userId,
        startTime: new Date(body.startTime),
        endTime: new Date(body.endTime),
        reason: body.reason,
        originalUserId: body.originalUserId,
      },
      userId
    );
    reply.status(201).send(override);
  });

  // Delete shift
  app.delete<{ Params: { id: string; shiftId: string } }>('/schedules/:id/shifts/:shiftId', {
    preHandler: [requirePermission('oncall:manage')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;

    await oncallScheduleService.deleteShift(tenantSlug, request.params.id, request.params.shiftId);
    reply.status(204).send();
  });

  // Get linked applications
  app.get<{ Params: { id: string } }>('/schedules/:id/applications', {
    preHandler: [requirePermission('oncall:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;

    const applications = await oncallScheduleService.getLinkedApplications(tenantSlug, request.params.id);
    reply.send({ data: applications });
  });

  // Link schedule to application
  app.post<{ Params: { id: string } }>('/schedules/:id/applications', {
    preHandler: [requirePermission('oncall:manage')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const body = z.object({ applicationId: z.string().uuid() }).parse(request.body);

    await oncallScheduleService.linkToApplication(tenantSlug, request.params.id, body.applicationId);
    reply.status(204).send();
  });

  // Unlink schedule from application
  app.delete<{ Params: { id: string; applicationId: string } }>('/schedules/:id/applications/:applicationId', {
    preHandler: [requirePermission('oncall:manage')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;

    await oncallScheduleService.unlinkFromApplication(tenantSlug, request.params.id, request.params.applicationId);
    reply.status(204).send();
  });

  // ========================================
  // WHO IS ON CALL
  // ========================================

  // Get who is on call now
  app.get('/who-is-on-call', {
    preHandler: [requirePermission('oncall:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const query = request.query as Record<string, string>;

    const onCall = await oncallScheduleService.whoIsOnCall(
      tenantSlug,
      query.schedule_id,
      query.application_id
    );
    reply.send({ data: onCall });
  });

  // ========================================
  // ESCALATION POLICIES
  // ========================================

  // List policies
  app.get('/escalation-policies', {
    preHandler: [requirePermission('oncall:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const query = request.query as Record<string, string>;
    const pagination = parsePagination(query);

    const { policies, total } = await escalationPolicyService.list(tenantSlug, pagination);
    reply.send(createPaginatedResponse(policies, total, pagination));
  });

  // Get policy by ID
  app.get<{ Params: { id: string } }>('/escalation-policies/:id', {
    preHandler: [requirePermission('oncall:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const policy = await escalationPolicyService.findById(tenantSlug, request.params.id);

    if (!policy) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: `Escalation policy with id '${request.params.id}' not found`,
      });
    }

    // Include steps
    const steps = await escalationPolicyService.getSteps(tenantSlug, request.params.id);
    reply.send({ ...policy, steps });
  });

  // Create policy
  app.post('/escalation-policies', {
    preHandler: [requirePermission('oncall:manage')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const body = createPolicySchema.parse(request.body);

    const policy = await escalationPolicyService.create(tenantSlug, body, userId);
    reply.status(201).send(policy);
  });

  // Update policy
  app.put<{ Params: { id: string } }>('/escalation-policies/:id', {
    preHandler: [requirePermission('oncall:manage')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const body = updatePolicySchema.parse(request.body);

    const policy = await escalationPolicyService.update(tenantSlug, request.params.id, body, userId);
    reply.send(policy);
  });

  // Delete policy
  app.delete<{ Params: { id: string } }>('/escalation-policies/:id', {
    preHandler: [requirePermission('oncall:manage')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;

    await escalationPolicyService.delete(tenantSlug, request.params.id, userId);
    reply.status(204).send();
  });

  // Get policy steps
  app.get<{ Params: { id: string } }>('/escalation-policies/:id/steps', {
    preHandler: [requirePermission('oncall:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;

    const steps = await escalationPolicyService.getSteps(tenantSlug, request.params.id);
    reply.send({ data: steps });
  });

  // Add step
  app.post<{ Params: { id: string } }>('/escalation-policies/:id/steps', {
    preHandler: [requirePermission('oncall:manage')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const body = addStepSchema.parse(request.body);

    const step = await escalationPolicyService.addStep(tenantSlug, request.params.id, body);
    reply.status(201).send(step);
  });

  // Update step
  app.put<{ Params: { id: string; stepId: string } }>('/escalation-policies/:id/steps/:stepId', {
    preHandler: [requirePermission('oncall:manage')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const body = addStepSchema.partial().parse(request.body);

    const step = await escalationPolicyService.updateStep(
      tenantSlug,
      request.params.id,
      request.params.stepId,
      body
    );
    reply.send(step);
  });

  // Delete step
  app.delete<{ Params: { id: string; stepId: string } }>('/escalation-policies/:id/steps/:stepId', {
    preHandler: [requirePermission('oncall:manage')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;

    await escalationPolicyService.deleteStep(tenantSlug, request.params.id, request.params.stepId);
    reply.status(204).send();
  });

  // ========================================
  // SHIFT SWAPS
  // ========================================

  // List all shift swap requests with pagination and filters
  app.get('/shift-swaps', {
    preHandler: [requirePermission('oncall:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const query = request.query as Record<string, string>;
    const pagination = parsePagination(query);

    const filters = {
      scheduleId: query.schedule_id,
      status: query.status,
      requesterId: query.requester_id,
      offeredToUserId: query.offered_to_user_id,
      fromDate: query.from_date,
      toDate: query.to_date,
    };

    const { swaps, total } = await shiftSwapService.list(tenantSlug, pagination, filters);
    reply.send(createPaginatedResponse(swaps, total, pagination));
  });

  // Get current user's outgoing swap requests
  app.get('/shift-swaps/my-requests', {
    preHandler: [requirePermission('oncall:read')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;

    const swaps = await shiftSwapService.getMyRequests(tenantSlug, userId);
    reply.send({ data: swaps });
  });

  // Get swaps available for current user to accept
  app.get('/shift-swaps/available', {
    preHandler: [requirePermission('oncall:read')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;

    const swaps = await shiftSwapService.getAvailableToAccept(tenantSlug, userId);
    reply.send({ data: swaps });
  });

  // Get shift swap by ID
  app.get<{ Params: { id: string } }>('/shift-swaps/:id', {
    preHandler: [requirePermission('oncall:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;

    const swap = await shiftSwapService.getById(tenantSlug, request.params.id);
    reply.send(swap);
  });

  // Create new shift swap request
  app.post('/shift-swaps', {
    preHandler: [requirePermission('oncall:update')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const body = createShiftSwapSchema.parse(request.body);

    const swap = await shiftSwapService.create(tenantSlug, userId, body);
    reply.status(201).send(swap);
  });

  // Update swap request (reason, offeredToUserId, expiresAt)
  app.put<{ Params: { id: string } }>('/shift-swaps/:id', {
    preHandler: [requirePermission('oncall:update')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const body = updateShiftSwapSchema.parse(request.body);

    const swap = await shiftSwapService.update(tenantSlug, request.params.id, userId, body);
    reply.send(swap);
  });

  // Cancel own swap request
  app.post<{ Params: { id: string } }>('/shift-swaps/:id/cancel', {
    preHandler: [requirePermission('oncall:update')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;

    const swap = await shiftSwapService.cancel(tenantSlug, request.params.id, userId);
    reply.send(swap);
  });

  // Accept a swap offer
  app.post<{ Params: { id: string } }>('/shift-swaps/:id/accept', {
    preHandler: [requirePermission('oncall:update')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const body = swapResponseSchema.parse(request.body || {});

    const swap = await shiftSwapService.accept(tenantSlug, request.params.id, userId, body.message);
    reply.send(swap);
  });

  // Reject a swap offer (if specifically offered)
  app.post<{ Params: { id: string } }>('/shift-swaps/:id/reject', {
    preHandler: [requirePermission('oncall:update')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const body = swapResponseSchema.parse(request.body || {});

    const swap = await shiftSwapService.reject(tenantSlug, request.params.id, userId, body.message);
    reply.send(swap);
  });

  // Admin force-approve a swap
  app.post<{ Params: { id: string } }>('/shift-swaps/:id/admin-approve', {
    preHandler: [requirePermission('oncall:manage')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const body = adminApproveSchema.parse(request.body || {});

    const swap = await shiftSwapService.adminApprove(
      tenantSlug,
      request.params.id,
      userId,
      body.accepterUserId
    );
    reply.send(swap);
  });

  // Get swap statistics for a schedule
  app.get<{ Params: { scheduleId: string } }>('/shift-swaps/schedule/:scheduleId/stats', {
    preHandler: [requirePermission('oncall:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const query = request.query as Record<string, string>;

    const stats = await shiftSwapService.getScheduleStats(
      tenantSlug,
      request.params.scheduleId,
      query.from_date,
      query.to_date
    );
    reply.send(stats);
  });

  // ============================================
  // ICAL EXPORT ROUTES
  // ============================================

  // Get iCal export for a schedule (authenticated)
  app.get<{ Params: { scheduleId: string } }>('/schedules/:scheduleId/ical', {
    preHandler: [requirePermission('oncall:read')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const query = request.query as Record<string, string>;

    const from = query.from ? new Date(query.from) : undefined;
    const to = query.to ? new Date(query.to) : undefined;

    const icalContent = await icalExportService.generateICalendar(tenantSlug, {
      scheduleId: request.params.scheduleId,
      from,
      to,
      userId: query.user_id || userId,
    });

    reply
      .header('Content-Type', 'text/calendar; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="oncall-schedule.ics"`)
      .send(icalContent);
  });

  // Create a calendar subscription token
  app.post<{ Params: { scheduleId: string } }>('/schedules/:scheduleId/ical/subscribe', {
    preHandler: [requirePermission('oncall:read')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;

    const { token, url } = await icalExportService.createSubscriptionToken(
      tenantSlug,
      request.params.scheduleId,
      userId
    );

    reply.send({ token, url });
  });

  // Public iCal subscription endpoint (token-based auth)
  app.get<{ Params: { scheduleId: string; token: string } }>('/schedules/:scheduleId/ical/subscribe/:token', {
    preHandler: [optionalAuth],
  }, async (request, reply) => {
    const query = request.query as Record<string, string>;

    // Look up tenant from schedule and validate token (searches all tenant schemas)
    const subscription = await icalExportService.validatePublicSubscriptionToken(
      request.params.scheduleId,
      request.params.token
    );

    if (!subscription) {
      reply.code(401).send({ error: 'Invalid or expired subscription token' });
      return;
    }

    const from = query.from ? new Date(query.from) : undefined;
    const to = query.to ? new Date(query.to) : undefined;

    const icalContent = await icalExportService.generateICalendar(subscription.tenantSlug, {
      scheduleId: request.params.scheduleId,
      from,
      to,
      userId: subscription.filterUserId || subscription.userId,
    });

    reply
      .header('Content-Type', 'text/calendar; charset=utf-8')
      .header('Cache-Control', 'no-cache, no-store, must-revalidate')
      .send(icalContent);
  });

  // Revoke a calendar subscription
  app.delete<{ Params: { scheduleId: string } }>('/schedules/:scheduleId/ical/subscribe', {
    preHandler: [requirePermission('oncall:read')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;

    await icalExportService.revokeSubscriptionToken(
      tenantSlug,
      request.params.scheduleId,
      userId
    );

    reply.send({ message: 'Subscription revoked' });
  });
}
