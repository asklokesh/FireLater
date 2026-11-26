import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { oncallScheduleService, escalationPolicyService, icalExportService } from '../services/oncall.js';
import { shiftSwapService } from '../services/shiftSwaps.js';
import { requirePermission, optionalAuth } from '../middleware/auth.js';
import { parsePagination, createPaginatedResponse } from '../utils/pagination.js';
import { tenantService as _tenantService } from '../services/tenant.js';
import { validateDate, validateDateRange } from '../utils/validation.js';
import { createScheduleSchema, updateScheduleSchema, addToRotationSchema, createShiftSchema, createOverrideSchema, createPolicySchema, updatePolicySchema, addStepSchema, createShiftSwapSchema, updateShiftSwapSchema, swapResponseSchema, adminApproveSchema, idParamSchema, idRotationParamSchema, idShiftParamSchema, idAppParamSchema, idStepParamSchema, scheduleIdParamSchema, scheduleIdTokenParamSchema } from '../schemas/oncall.js';

// ============================================
// SCHEDULE SCHEMAS
// ============================================

// ============================================
// ESCALATION POLICY SCHEMAS
// ============================================

// ============================================
// SHIFT SWAP SCHEMAS
// ============================================

// Parameter validation schemas

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
    const { id } = request.params as z.infer<typeof idParamSchema>;

    const schedule = await oncallScheduleService.findById(tenantSlug, id);

    if (!schedule) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: `Schedule with id '${id}' not found`,
      });
    }

    reply.send(schedule);
  });

  // Create schedule
  app.post('/schedules', {
    preHandler: [requirePermission('oncall:manage')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const body = request.body as z.infer<typeof createScheduleSchema>;

    const schedule = await oncallScheduleService.create(tenantSlug, body, userId);
    reply.status(201).send(schedule);
  });

  // Update schedule
  app.put<{ Params: { id: string } }>('/schedules/:id', {
    preHandler: [requirePermission('oncall:manage')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { id } = request.params as z.infer<typeof idParamSchema>;
    const body = request.body as z.infer<typeof updateScheduleSchema>;

    const schedule = await oncallScheduleService.update(tenantSlug, id, body, userId);
    reply.send(schedule);
  });

  // Delete schedule
  app.delete<{ Params: { id: string } }>('/schedules/:id', {
    preHandler: [requirePermission('oncall:manage')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { id } = request.params as z.infer<typeof idParamSchema>;

    await oncallScheduleService.delete(tenantSlug, id, userId);
    reply.status(204).send();
  });

  // Get schedule rotations
  app.get<{ Params: { id: string } }>('/schedules/:id/rotations', {
    preHandler: [requirePermission('oncall:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { id } = request.params as z.infer<typeof idParamSchema>;

    const rotations = await oncallScheduleService.getRotations(tenantSlug, id);
    reply.send({ data: rotations });
  });

  // Add user to rotation
  app.post<{ Params: { id: string } }>('/schedules/:id/rotations', {
    preHandler: [requirePermission('oncall:manage')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { id } = request.params as z.infer<typeof idParamSchema>;
    const body = request.body as z.infer<typeof addToRotationSchema>;

    const rotation = await oncallScheduleService.addToRotation(
      tenantSlug,
      id,
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
    const { id, rotationId } = request.params as z.infer<typeof idRotationParamSchema>;
    const body = z.object({ position: z.number().int().min(1) }).parse(request.body);

    const rotation = await oncallScheduleService.updateRotationPosition(
      tenantSlug,
      id,
      rotationId,
      body.position
    );
    reply.send(rotation);
  });

  // Remove from rotation
  app.delete<{ Params: { id: string; rotationId: string } }>('/schedules/:id/rotations/:rotationId', {
    preHandler: [requirePermission('oncall:manage')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { id, rotationId } = request.params as z.infer<typeof idRotationParamSchema>;

    await oncallScheduleService.removeFromRotation(tenantSlug, id, rotationId);
    reply.status(204).send();
  });

  // Get schedule shifts
  app.get<{ Params: { id: string } }>('/schedules/:id/shifts', {
    preHandler: [requirePermission('oncall:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { id } = request.params as z.infer<typeof idParamSchema>;
    const query = request.query as Record<string, string>;

    // Validate and parse date parameters with defaults
    const startDate = query.start_date
      ? validateDate(query.start_date, 'start_date') || new Date()
      : new Date();
    const endDate = query.end_date
      ? validateDate(query.end_date, 'end_date') || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    // Validate date range (max 90 days for schedule queries)
    validateDateRange(startDate, endDate, 90);

    const shifts = await oncallScheduleService.getShifts(tenantSlug, id, startDate, endDate);
    reply.send({ data: shifts });
  });

  // Create shift
  app.post<{ Params: { id: string } }>('/schedules/:id/shifts', {
    preHandler: [requirePermission('oncall:manage')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { id } = request.params as z.infer<typeof idParamSchema>;
    const body = request.body as z.infer<typeof createShiftSchema>;

    const shift = await oncallScheduleService.createShift(
      tenantSlug,
      {
        scheduleId: id,
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
    const { id } = request.params as z.infer<typeof idParamSchema>;
    const body = request.body as z.infer<typeof createOverrideSchema>;

    const override = await oncallScheduleService.createOverride(
      tenantSlug,
      {
        scheduleId: id,
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
    const { id, shiftId } = request.params as z.infer<typeof idShiftParamSchema>;

    await oncallScheduleService.deleteShift(tenantSlug, id, shiftId);
    reply.status(204).send();
  });

  // Get linked applications
  app.get<{ Params: { id: string } }>('/schedules/:id/applications', {
    preHandler: [requirePermission('oncall:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { id } = request.params as z.infer<typeof idParamSchema>;

    const applications = await oncallScheduleService.getLinkedApplications(tenantSlug, id);
    reply.send({ data: applications });
  });

  // Link schedule to application
  app.post<{ Params: { id: string } }>('/schedules/:id/applications', {
    preHandler: [requirePermission('oncall:manage')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { id } = request.params as z.infer<typeof idParamSchema>;
    const body = z.object({ applicationId: z.string().uuid() }).parse(request.body);

    await oncallScheduleService.linkToApplication(tenantSlug, id, body.applicationId);
    reply.status(204).send();
  });

  // Unlink schedule from application
  app.delete<{ Params: { id: string; applicationId: string } }>('/schedules/:id/applications/:applicationId', {
    preHandler: [requirePermission('oncall:manage')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { id, applicationId } = request.params as z.infer<typeof idAppParamSchema>;

    await oncallScheduleService.unlinkFromApplication(tenantSlug, id, applicationId);
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
    const { id } = request.params as z.infer<typeof idParamSchema>;

    const policy = await escalationPolicyService.findById(tenantSlug, id);

    if (!policy) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: `Escalation policy with id '${id}' not found`,
      });
    }

    // Include steps
    const steps = await escalationPolicyService.getSteps(tenantSlug, id);
    reply.send({ ...policy, steps });
  });

  // Create policy
  app.post('/escalation-policies', {
    preHandler: [requirePermission('oncall:manage')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const body = request.body as z.infer<typeof createPolicySchema>;

    const policy = await escalationPolicyService.create(tenantSlug, body, userId);
    reply.status(201).send(policy);
  });

  // Update policy
  app.put<{ Params: { id: string } }>('/escalation-policies/:id', {
    preHandler: [requirePermission('oncall:manage')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { id } = request.params as z.infer<typeof idParamSchema>;
    const body = request.body as z.infer<typeof updatePolicySchema>;

    const policy = await escalationPolicyService.update(tenantSlug, id, body, userId);
    reply.send(policy);
  });

  // Delete policy
  app.delete<{ Params: { id: string } }>('/escalation-policies/:id', {
    preHandler: [requirePermission('oncall:manage')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { id } = request.params as z.infer<typeof idParamSchema>;

    await escalationPolicyService.delete(tenantSlug, id, userId);
    reply.status(204).send();
  });

  // Get policy steps
  app.get<{ Params: { id: string } }>('/escalation-policies/:id/steps', {
    preHandler: [requirePermission('oncall:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { id } = request.params as z.infer<typeof idParamSchema>;

    const steps = await escalationPolicyService.getSteps(tenantSlug, id);
    reply.send({ data: steps });
  });

  // Add step
  app.post<{ Params: { id: string } }>('/escalation-policies/:id/steps', {
    preHandler: [requirePermission('oncall:manage')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { id } = request.params as z.infer<typeof idParamSchema>;
    const body = request.body as z.infer<typeof addStepSchema>;

    const step = await escalationPolicyService.addStep(tenantSlug, id, body);
    reply.status(201).send(step);
  });

  // Update step
  app.put<{ Params: { id: string; stepId: string } }>('/escalation-policies/:id/steps/:stepId', {
    preHandler: [requirePermission('oncall:manage')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { id, stepId } = request.params as z.infer<typeof idStepParamSchema>;
    const body = addStepSchema.partial().parse(request.body);

    const step = await escalationPolicyService.updateStep(
      tenantSlug,
      id,
      stepId,
      body
    );
    reply.send(step);
  });

  // Delete step
  app.delete<{ Params: { id: string; stepId: string } }>('/escalation-policies/:id/steps/:stepId', {
    preHandler: [requirePermission('oncall:manage')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { id, stepId } = request.params as z.infer<typeof idStepParamSchema>;

    await escalationPolicyService.deleteStep(tenantSlug, id, stepId);
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
    const { id } = request.params as z.infer<typeof idParamSchema>;

    const swap = await shiftSwapService.getById(tenantSlug, id);
    reply.send(swap);
  });

  // Create new shift swap request
  app.post('/shift-swaps', {
    preHandler: [requirePermission('oncall:update')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const body = request.body as z.infer<typeof createShiftSwapSchema>;

    const swap = await shiftSwapService.create(tenantSlug, userId, body);
    reply.status(201).send(swap);
  });

  // Update swap request (reason, offeredToUserId, expiresAt)
  app.put<{ Params: { id: string } }>('/shift-swaps/:id', {
    preHandler: [requirePermission('oncall:update')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { id } = request.params as z.infer<typeof idParamSchema>;
    const body = request.body as z.infer<typeof updateShiftSwapSchema>;

    const swap = await shiftSwapService.update(tenantSlug, id, userId, body);
    reply.send(swap);
  });

  // Cancel own swap request
  app.post<{ Params: { id: string } }>('/shift-swaps/:id/cancel', {
    preHandler: [requirePermission('oncall:update')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { id } = request.params as z.infer<typeof idParamSchema>;

    const swap = await shiftSwapService.cancel(tenantSlug, id, userId);
    reply.send(swap);
  });

  // Accept a swap offer
  app.post<{ Params: { id: string } }>('/shift-swaps/:id/accept', {
    preHandler: [requirePermission('oncall:update')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { id } = request.params as z.infer<typeof idParamSchema>;
    const body = swapResponseSchema.parse(request.body || {});

    const swap = await shiftSwapService.accept(tenantSlug, id, userId, body.message);
    reply.send(swap);
  });

  // Reject a swap offer (if specifically offered)
  app.post<{ Params: { id: string } }>('/shift-swaps/:id/reject', {
    preHandler: [requirePermission('oncall:update')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { id } = request.params as z.infer<typeof idParamSchema>;
    const body = swapResponseSchema.parse(request.body || {});

    const swap = await shiftSwapService.reject(tenantSlug, id, userId, body.message);
    reply.send(swap);
  });

  // Admin force-approve a swap
  app.post<{ Params: { id: string } }>('/shift-swaps/:id/admin-approve', {
    preHandler: [requirePermission('oncall:manage')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { id } = request.params as z.infer<typeof idParamSchema>;
    const body = adminApproveSchema.parse(request.body || {});

    const swap = await shiftSwapService.adminApprove(
      tenantSlug,
      id,
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
    const { scheduleId } = request.params as z.infer<typeof scheduleIdParamSchema>;
    const query = request.query as Record<string, string>;

    const stats = await shiftSwapService.getScheduleStats(
      tenantSlug,
      scheduleId,
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
    const { scheduleId } = request.params as z.infer<typeof scheduleIdParamSchema>;
    const query = request.query as Record<string, string>;

    const from = validateDate(query.from, 'from');
    const to = validateDate(query.to, 'to');
    if (from && to) {
      validateDateRange(from, to, 365);
    }

    const icalContent = await icalExportService.generateICalendar(tenantSlug, {
      scheduleId,
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
    const { scheduleId } = request.params as z.infer<typeof scheduleIdParamSchema>;

    const { token, url } = await icalExportService.createSubscriptionToken(
      tenantSlug,
      scheduleId,
      userId
    );

    reply.send({ token, url });
  });

  // Public iCal subscription endpoint (token-based auth)
  app.get<{ Params: { scheduleId: string; token: string } }>('/schedules/:scheduleId/ical/subscribe/:token', {
    preHandler: [optionalAuth],
  }, async (request, reply) => {
    const { scheduleId, token } = request.params as z.infer<typeof scheduleIdTokenParamSchema>;
    const query = request.query as Record<string, string>;

    // Look up tenant from schedule and validate token (searches all tenant schemas)
    const subscription = await icalExportService.validatePublicSubscriptionToken(
      scheduleId,
      token
    );

    if (!subscription) {
      reply.code(401).send({ error: 'Invalid or expired subscription token' });
      return;
    }

    const from = validateDate(query.from, 'from');
    const to = validateDate(query.to, 'to');
    if (from && to) {
      validateDateRange(from, to, 365);
    }

    const icalContent = await icalExportService.generateICalendar(subscription.tenantSlug, {
      scheduleId,
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
    const { scheduleId } = request.params as z.infer<typeof scheduleIdParamSchema>;

    await icalExportService.revokeSubscriptionToken(
      tenantSlug,
      scheduleId,
      userId
    );

    reply.send({ message: 'Subscription revoked' });
  });
}
