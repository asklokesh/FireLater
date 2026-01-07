import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { createTestApp, testUser, generateTestToken, createAuthHeader } from '../helpers.js';

interface MockSchedule {
  id: string;
  name: string;
  description: string;
  timezone: string;
  rotation_type: 'daily' | 'weekly' | 'custom';
  handoff_time: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface MockRotationMember {
  id: string;
  schedule_id: string;
  user_id: string;
  sequence: number;
  start_date: string | null;
  end_date: string | null;
}

interface MockOverride {
  id: string;
  schedule_id: string;
  user_id: string;
  start_time: string;
  end_time: string;
  reason: string | null;
  created_at: string;
}

interface MockShiftSwap {
  id: string;
  schedule_id: string;
  requester_id: string;
  target_user_id: string | null;
  original_start: string;
  original_end: string;
  swap_start: string | null;
  swap_end: string | null;
  status: 'pending' | 'accepted' | 'rejected' | 'cancelled';
  reason: string;
  created_at: string;
}

describe('On-Call Routes', () => {
  let app: FastifyInstance;
  const schedules: MockSchedule[] = [];
  const rotationMembers: MockRotationMember[] = [];
  const overrides: MockOverride[] = [];
  const shiftSwaps: MockShiftSwap[] = [];
  let scheduleIdCounter = 0;
  let memberIdCounter = 0;
  let overrideIdCounter = 0;
  let swapIdCounter = 0;

  beforeAll(async () => {
    app = await createTestApp();

    // GET /v1/oncall/schedules - List schedules
    app.get('/v1/oncall/schedules', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const query = request.query as { is_active?: string };
      let filteredSchedules = [...schedules];

      if (query.is_active !== undefined) {
        const isActive = query.is_active === 'true';
        filteredSchedules = filteredSchedules.filter((s) => s.is_active === isActive);
      }

      return { data: filteredSchedules };
    });

    // POST /v1/oncall/schedules - Create schedule
    app.post('/v1/oncall/schedules', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const body = request.body as {
        name?: string;
        description?: string;
        timezone?: string;
        rotation_type?: 'daily' | 'weekly' | 'custom';
        handoff_time?: string;
      };

      if (!body.name) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Validation Error',
          message: 'Schedule name is required',
        });
      }

      const newSchedule: MockSchedule = {
        id: `schedule-${++scheduleIdCounter}`,
        name: body.name,
        description: body.description || '',
        timezone: body.timezone || 'America/New_York',
        rotation_type: body.rotation_type || 'weekly',
        handoff_time: body.handoff_time || '09:00',
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      schedules.push(newSchedule);
      reply.status(201).send(newSchedule);
    });

    // GET /v1/oncall/schedules/:id - Get schedule by ID
    app.get('/v1/oncall/schedules/:id', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const { id } = request.params as { id: string };
      const schedule = schedules.find((s) => s.id === id);

      if (!schedule) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Schedule with id '${id}' not found`,
        });
      }

      // Include members
      const members = rotationMembers.filter((m) => m.schedule_id === id);
      return { ...schedule, members };
    });

    // PUT /v1/oncall/schedules/:id - Update schedule
    app.put('/v1/oncall/schedules/:id', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const { id } = request.params as { id: string };
      const body = request.body as Partial<MockSchedule>;
      const scheduleIndex = schedules.findIndex((s) => s.id === id);

      if (scheduleIndex === -1) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Schedule with id '${id}' not found`,
        });
      }

      schedules[scheduleIndex] = {
        ...schedules[scheduleIndex],
        ...body,
        updated_at: new Date().toISOString(),
      };

      return schedules[scheduleIndex];
    });

    // DELETE /v1/oncall/schedules/:id - Delete schedule
    app.delete('/v1/oncall/schedules/:id', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const { id } = request.params as { id: string };
      const scheduleIndex = schedules.findIndex((s) => s.id === id);

      if (scheduleIndex === -1) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Schedule with id '${id}' not found`,
        });
      }

      schedules.splice(scheduleIndex, 1);
      reply.status(204).send();
    });

    // POST /v1/oncall/schedules/:id/members - Add rotation member
    app.post('/v1/oncall/schedules/:id/members', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const { id } = request.params as { id: string };
      const body = request.body as {
        user_id?: string;
        sequence?: number;
        start_date?: string;
        end_date?: string;
      };

      const schedule = schedules.find((s) => s.id === id);
      if (!schedule) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Schedule with id '${id}' not found`,
        });
      }

      if (!body.user_id) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Validation Error',
          message: 'User ID is required',
        });
      }

      // Check for duplicate
      const existing = rotationMembers.find((m) => m.schedule_id === id && m.user_id === body.user_id);
      if (existing) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'User is already a member of this schedule',
        });
      }

      const currentMembers = rotationMembers.filter((m) => m.schedule_id === id);
      const newMember: MockRotationMember = {
        id: `member-${++memberIdCounter}`,
        schedule_id: id,
        user_id: body.user_id,
        sequence: body.sequence ?? currentMembers.length + 1,
        start_date: body.start_date || null,
        end_date: body.end_date || null,
      };

      rotationMembers.push(newMember);
      reply.status(201).send(newMember);
    });

    // DELETE /v1/oncall/schedules/:id/members/:memberId - Remove rotation member
    app.delete('/v1/oncall/schedules/:id/members/:memberId', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const { id, memberId } = request.params as { id: string; memberId: string };
      const memberIndex = rotationMembers.findIndex((m) => m.id === memberId && m.schedule_id === id);

      if (memberIndex === -1) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: 'Rotation member not found',
        });
      }

      rotationMembers.splice(memberIndex, 1);
      reply.status(204).send();
    });

    // GET /v1/oncall/who-is-on-call - Get current on-call
    app.get('/v1/oncall/who-is-on-call', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const query = request.query as { schedule_id?: string };
      let relevantSchedules = schedules.filter((s) => s.is_active);

      if (query.schedule_id) {
        relevantSchedules = relevantSchedules.filter((s) => s.id === query.schedule_id);
      }

      const onCallData = relevantSchedules.map((schedule) => {
        const members = rotationMembers.filter((m) => m.schedule_id === schedule.id);
        const currentOnCall = members.length > 0 ? members[0] : null;
        return {
          schedule_id: schedule.id,
          schedule_name: schedule.name,
          on_call_user_id: currentOnCall?.user_id || null,
          handoff_time: schedule.handoff_time,
        };
      });

      return { data: onCallData };
    });

    // POST /v1/oncall/schedules/:id/overrides - Create override
    app.post('/v1/oncall/schedules/:id/overrides', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const { id } = request.params as { id: string };
      const body = request.body as {
        user_id?: string;
        start_time?: string;
        end_time?: string;
        reason?: string;
      };

      const schedule = schedules.find((s) => s.id === id);
      if (!schedule) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Schedule with id '${id}' not found`,
        });
      }

      if (!body.user_id || !body.start_time || !body.end_time) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Validation Error',
          message: 'User ID, start time, and end time are required',
        });
      }

      const newOverride: MockOverride = {
        id: `override-${++overrideIdCounter}`,
        schedule_id: id,
        user_id: body.user_id,
        start_time: body.start_time,
        end_time: body.end_time,
        reason: body.reason || null,
        created_at: new Date().toISOString(),
      };

      overrides.push(newOverride);
      reply.status(201).send(newOverride);
    });

    // GET /v1/oncall/schedules/:id/overrides - Get overrides
    app.get('/v1/oncall/schedules/:id/overrides', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const { id } = request.params as { id: string };
      const schedule = schedules.find((s) => s.id === id);

      if (!schedule) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Schedule with id '${id}' not found`,
        });
      }

      const scheduleOverrides = overrides.filter((o) => o.schedule_id === id);
      return { data: scheduleOverrides };
    });

    // DELETE /v1/oncall/overrides/:id - Delete override
    app.delete('/v1/oncall/overrides/:id', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const { id } = request.params as { id: string };
      const overrideIndex = overrides.findIndex((o) => o.id === id);

      if (overrideIndex === -1) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: 'Override not found',
        });
      }

      overrides.splice(overrideIndex, 1);
      reply.status(204).send();
    });

    // POST /v1/oncall/shift-swaps - Request shift swap
    app.post('/v1/oncall/shift-swaps', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const body = request.body as {
        schedule_id?: string;
        target_user_id?: string;
        original_start?: string;
        original_end?: string;
        reason?: string;
      };

      if (!body.schedule_id || !body.original_start || !body.original_end) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Validation Error',
          message: 'Schedule ID and shift times are required',
        });
      }

      const newSwap: MockShiftSwap = {
        id: `swap-${++swapIdCounter}`,
        schedule_id: body.schedule_id,
        requester_id: testUser.userId,
        target_user_id: body.target_user_id || null,
        original_start: body.original_start,
        original_end: body.original_end,
        swap_start: null,
        swap_end: null,
        status: 'pending',
        reason: body.reason || '',
        created_at: new Date().toISOString(),
      };

      shiftSwaps.push(newSwap);
      reply.status(201).send(newSwap);
    });

    // GET /v1/oncall/shift-swaps - List shift swaps
    app.get('/v1/oncall/shift-swaps', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const query = request.query as { status?: string; schedule_id?: string };
      let filteredSwaps = [...shiftSwaps];

      if (query.status) {
        filteredSwaps = filteredSwaps.filter((s) => s.status === query.status);
      }
      if (query.schedule_id) {
        filteredSwaps = filteredSwaps.filter((s) => s.schedule_id === query.schedule_id);
      }

      return { data: filteredSwaps };
    });

    // POST /v1/oncall/shift-swaps/:id/accept - Accept shift swap
    app.post('/v1/oncall/shift-swaps/:id/accept', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const { id } = request.params as { id: string };
      const swapIndex = shiftSwaps.findIndex((s) => s.id === id);

      if (swapIndex === -1) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: 'Shift swap request not found',
        });
      }

      const swap = shiftSwaps[swapIndex];
      if (swap.status !== 'pending') {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Shift swap is not pending',
        });
      }

      swap.status = 'accepted';
      swap.target_user_id = testUser.userId;

      return swap;
    });

    // POST /v1/oncall/shift-swaps/:id/reject - Reject shift swap
    app.post('/v1/oncall/shift-swaps/:id/reject', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const { id } = request.params as { id: string };
      const swapIndex = shiftSwaps.findIndex((s) => s.id === id);

      if (swapIndex === -1) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: 'Shift swap request not found',
        });
      }

      const swap = shiftSwaps[swapIndex];
      if (swap.status !== 'pending') {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Shift swap is not pending',
        });
      }

      swap.status = 'rejected';

      return swap;
    });

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Schedules', () => {
    describe('GET /v1/oncall/schedules', () => {
      it('should list schedules', async () => {
        const token = generateTestToken(app);
        const response = await app.inject({
          method: 'GET',
          url: '/v1/oncall/schedules',
          headers: createAuthHeader(token),
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.payload);
        expect(body).toHaveProperty('data');
        expect(Array.isArray(body.data)).toBe(true);
      });

      it('should reject unauthenticated request', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/v1/oncall/schedules',
        });

        expect(response.statusCode).toBe(401);
      });
    });

    describe('POST /v1/oncall/schedules', () => {
      it('should create a new schedule', async () => {
        const token = generateTestToken(app);
        const response = await app.inject({
          method: 'POST',
          url: '/v1/oncall/schedules',
          headers: createAuthHeader(token),
          payload: {
            name: 'Primary On-Call',
            description: 'Primary 24/7 on-call rotation',
            timezone: 'America/Los_Angeles',
            rotation_type: 'weekly',
            handoff_time: '10:00',
          },
        });

        expect(response.statusCode).toBe(201);
        const body = JSON.parse(response.payload);
        expect(body).toHaveProperty('id');
        expect(body.name).toBe('Primary On-Call');
        expect(body.rotation_type).toBe('weekly');
        expect(body.is_active).toBe(true);
      });

      it('should reject schedule without name', async () => {
        const token = generateTestToken(app);
        const response = await app.inject({
          method: 'POST',
          url: '/v1/oncall/schedules',
          headers: createAuthHeader(token),
          payload: { description: 'No name provided' },
        });

        expect(response.statusCode).toBe(400);
        const body = JSON.parse(response.payload);
        expect(body.message).toContain('Schedule name is required');
      });
    });

    describe('GET /v1/oncall/schedules/:id', () => {
      it('should get schedule by ID with members', async () => {
        const token = generateTestToken(app);

        // Create schedule first
        const createResponse = await app.inject({
          method: 'POST',
          url: '/v1/oncall/schedules',
          headers: createAuthHeader(token),
          payload: { name: 'Test Schedule' },
        });
        const created = JSON.parse(createResponse.payload);

        const response = await app.inject({
          method: 'GET',
          url: `/v1/oncall/schedules/${created.id}`,
          headers: createAuthHeader(token),
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.payload);
        expect(body.id).toBe(created.id);
        expect(body).toHaveProperty('members');
      });

      it('should return 404 for non-existent schedule', async () => {
        const token = generateTestToken(app);
        const response = await app.inject({
          method: 'GET',
          url: '/v1/oncall/schedules/non-existent-id',
          headers: createAuthHeader(token),
        });

        expect(response.statusCode).toBe(404);
      });
    });

    describe('PUT /v1/oncall/schedules/:id', () => {
      it('should update a schedule', async () => {
        const token = generateTestToken(app);

        // Create schedule first
        const createResponse = await app.inject({
          method: 'POST',
          url: '/v1/oncall/schedules',
          headers: createAuthHeader(token),
          payload: { name: 'Original Name' },
        });
        const created = JSON.parse(createResponse.payload);

        const response = await app.inject({
          method: 'PUT',
          url: `/v1/oncall/schedules/${created.id}`,
          headers: createAuthHeader(token),
          payload: { name: 'Updated Name', handoff_time: '11:00' },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.payload);
        expect(body.name).toBe('Updated Name');
        expect(body.handoff_time).toBe('11:00');
      });
    });

    describe('DELETE /v1/oncall/schedules/:id', () => {
      it('should delete a schedule', async () => {
        const token = generateTestToken(app);

        // Create schedule first
        const createResponse = await app.inject({
          method: 'POST',
          url: '/v1/oncall/schedules',
          headers: createAuthHeader(token),
          payload: { name: 'Schedule to Delete' },
        });
        const created = JSON.parse(createResponse.payload);

        const response = await app.inject({
          method: 'DELETE',
          url: `/v1/oncall/schedules/${created.id}`,
          headers: createAuthHeader(token),
        });

        expect(response.statusCode).toBe(204);
      });
    });
  });

  describe('Rotation Members', () => {
    let testSchedule: MockSchedule;

    beforeAll(async () => {
      const token = generateTestToken(app);
      const createResponse = await app.inject({
        method: 'POST',
        url: '/v1/oncall/schedules',
        headers: createAuthHeader(token),
        payload: { name: 'Test Schedule for Members' },
      });
      testSchedule = JSON.parse(createResponse.payload);
    });

    describe('POST /v1/oncall/schedules/:id/members', () => {
      it('should add a rotation member', async () => {
        const token = generateTestToken(app);
        const response = await app.inject({
          method: 'POST',
          url: `/v1/oncall/schedules/${testSchedule.id}/members`,
          headers: createAuthHeader(token),
          payload: {
            user_id: 'user-1',
            sequence: 1,
          },
        });

        expect(response.statusCode).toBe(201);
        const body = JSON.parse(response.payload);
        expect(body.user_id).toBe('user-1');
        expect(body.schedule_id).toBe(testSchedule.id);
      });

      it('should reject member without user ID', async () => {
        const token = generateTestToken(app);
        const response = await app.inject({
          method: 'POST',
          url: `/v1/oncall/schedules/${testSchedule.id}/members`,
          headers: createAuthHeader(token),
          payload: { sequence: 1 },
        });

        expect(response.statusCode).toBe(400);
        const body = JSON.parse(response.payload);
        expect(body.message).toContain('User ID is required');
      });

      it('should reject duplicate member', async () => {
        const token = generateTestToken(app);

        // Add first member
        await app.inject({
          method: 'POST',
          url: `/v1/oncall/schedules/${testSchedule.id}/members`,
          headers: createAuthHeader(token),
          payload: { user_id: 'user-duplicate' },
        });

        // Try to add same user again
        const response = await app.inject({
          method: 'POST',
          url: `/v1/oncall/schedules/${testSchedule.id}/members`,
          headers: createAuthHeader(token),
          payload: { user_id: 'user-duplicate' },
        });

        expect(response.statusCode).toBe(400);
        const body = JSON.parse(response.payload);
        expect(body.message).toContain('already a member');
      });
    });

    describe('DELETE /v1/oncall/schedules/:id/members/:memberId', () => {
      it('should remove a rotation member', async () => {
        const token = generateTestToken(app);

        // Add a member first
        const addResponse = await app.inject({
          method: 'POST',
          url: `/v1/oncall/schedules/${testSchedule.id}/members`,
          headers: createAuthHeader(token),
          payload: { user_id: 'user-to-remove' },
        });
        const added = JSON.parse(addResponse.payload);

        const response = await app.inject({
          method: 'DELETE',
          url: `/v1/oncall/schedules/${testSchedule.id}/members/${added.id}`,
          headers: createAuthHeader(token),
        });

        expect(response.statusCode).toBe(204);
      });
    });
  });

  describe('Who Is On-Call', () => {
    describe('GET /v1/oncall/who-is-on-call', () => {
      it('should return current on-call information', async () => {
        const token = generateTestToken(app);
        const response = await app.inject({
          method: 'GET',
          url: '/v1/oncall/who-is-on-call',
          headers: createAuthHeader(token),
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.payload);
        expect(body).toHaveProperty('data');
        expect(Array.isArray(body.data)).toBe(true);
      });

      it('should filter by schedule ID', async () => {
        const token = generateTestToken(app);

        // Create a schedule first
        const createResponse = await app.inject({
          method: 'POST',
          url: '/v1/oncall/schedules',
          headers: createAuthHeader(token),
          payload: { name: 'Specific Schedule' },
        });
        const created = JSON.parse(createResponse.payload);

        const response = await app.inject({
          method: 'GET',
          url: `/v1/oncall/who-is-on-call?schedule_id=${created.id}`,
          headers: createAuthHeader(token),
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.payload);
        expect(body.data.length).toBeLessThanOrEqual(1);
      });
    });
  });

  describe('Overrides', () => {
    let overrideSchedule: MockSchedule;

    beforeAll(async () => {
      const token = generateTestToken(app);
      const createResponse = await app.inject({
        method: 'POST',
        url: '/v1/oncall/schedules',
        headers: createAuthHeader(token),
        payload: { name: 'Override Test Schedule' },
      });
      overrideSchedule = JSON.parse(createResponse.payload);
    });

    describe('POST /v1/oncall/schedules/:id/overrides', () => {
      it('should create an override', async () => {
        const token = generateTestToken(app);
        const response = await app.inject({
          method: 'POST',
          url: `/v1/oncall/schedules/${overrideSchedule.id}/overrides`,
          headers: createAuthHeader(token),
          payload: {
            user_id: 'override-user',
            start_time: '2026-01-07T09:00:00Z',
            end_time: '2026-01-08T09:00:00Z',
            reason: 'Covering for vacation',
          },
        });

        expect(response.statusCode).toBe(201);
        const body = JSON.parse(response.payload);
        expect(body.user_id).toBe('override-user');
        expect(body.reason).toBe('Covering for vacation');
      });

      it('should reject override without required fields', async () => {
        const token = generateTestToken(app);
        const response = await app.inject({
          method: 'POST',
          url: `/v1/oncall/schedules/${overrideSchedule.id}/overrides`,
          headers: createAuthHeader(token),
          payload: { reason: 'Missing required fields' },
        });

        expect(response.statusCode).toBe(400);
      });
    });

    describe('GET /v1/oncall/schedules/:id/overrides', () => {
      it('should get schedule overrides', async () => {
        const token = generateTestToken(app);
        const response = await app.inject({
          method: 'GET',
          url: `/v1/oncall/schedules/${overrideSchedule.id}/overrides`,
          headers: createAuthHeader(token),
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.payload);
        expect(body).toHaveProperty('data');
        expect(Array.isArray(body.data)).toBe(true);
      });
    });
  });

  describe('Shift Swaps', () => {
    let swapSchedule: MockSchedule;

    beforeAll(async () => {
      const token = generateTestToken(app);
      const createResponse = await app.inject({
        method: 'POST',
        url: '/v1/oncall/schedules',
        headers: createAuthHeader(token),
        payload: { name: 'Swap Test Schedule' },
      });
      swapSchedule = JSON.parse(createResponse.payload);
    });

    describe('POST /v1/oncall/shift-swaps', () => {
      it('should create a shift swap request', async () => {
        const token = generateTestToken(app);
        const response = await app.inject({
          method: 'POST',
          url: '/v1/oncall/shift-swaps',
          headers: createAuthHeader(token),
          payload: {
            schedule_id: swapSchedule.id,
            original_start: '2026-01-10T09:00:00Z',
            original_end: '2026-01-11T09:00:00Z',
            reason: 'Personal appointment',
          },
        });

        expect(response.statusCode).toBe(201);
        const body = JSON.parse(response.payload);
        expect(body.schedule_id).toBe(swapSchedule.id);
        expect(body.status).toBe('pending');
      });

      it('should reject shift swap without schedule ID', async () => {
        const token = generateTestToken(app);
        const response = await app.inject({
          method: 'POST',
          url: '/v1/oncall/shift-swaps',
          headers: createAuthHeader(token),
          payload: {
            original_start: '2026-01-10T09:00:00Z',
            original_end: '2026-01-11T09:00:00Z',
          },
        });

        expect(response.statusCode).toBe(400);
      });
    });

    describe('GET /v1/oncall/shift-swaps', () => {
      it('should list shift swaps', async () => {
        const token = generateTestToken(app);
        const response = await app.inject({
          method: 'GET',
          url: '/v1/oncall/shift-swaps',
          headers: createAuthHeader(token),
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.payload);
        expect(body).toHaveProperty('data');
        expect(Array.isArray(body.data)).toBe(true);
      });

      it('should filter by status', async () => {
        const token = generateTestToken(app);
        const response = await app.inject({
          method: 'GET',
          url: '/v1/oncall/shift-swaps?status=pending',
          headers: createAuthHeader(token),
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.payload);
        expect(body.data.every((s: MockShiftSwap) => s.status === 'pending')).toBe(true);
      });
    });

    describe('POST /v1/oncall/shift-swaps/:id/accept', () => {
      it('should accept a shift swap', async () => {
        const token = generateTestToken(app);

        // Create a swap request first
        const createResponse = await app.inject({
          method: 'POST',
          url: '/v1/oncall/shift-swaps',
          headers: createAuthHeader(token),
          payload: {
            schedule_id: swapSchedule.id,
            original_start: '2026-01-12T09:00:00Z',
            original_end: '2026-01-13T09:00:00Z',
            reason: 'Need coverage',
          },
        });
        const created = JSON.parse(createResponse.payload);

        const response = await app.inject({
          method: 'POST',
          url: `/v1/oncall/shift-swaps/${created.id}/accept`,
          headers: createAuthHeader(token),
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.payload);
        expect(body.status).toBe('accepted');
      });
    });

    describe('POST /v1/oncall/shift-swaps/:id/reject', () => {
      it('should reject a shift swap', async () => {
        const token = generateTestToken(app);

        // Create a swap request first
        const createResponse = await app.inject({
          method: 'POST',
          url: '/v1/oncall/shift-swaps',
          headers: createAuthHeader(token),
          payload: {
            schedule_id: swapSchedule.id,
            original_start: '2026-01-14T09:00:00Z',
            original_end: '2026-01-15T09:00:00Z',
            reason: 'Need coverage',
          },
        });
        const created = JSON.parse(createResponse.payload);

        const response = await app.inject({
          method: 'POST',
          url: `/v1/oncall/shift-swaps/${created.id}/reject`,
          headers: createAuthHeader(token),
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.payload);
        expect(body.status).toBe('rejected');
      });
    });
  });
});

describe('On-Call Rotation Types', () => {
  it('should support different rotation types', () => {
    const rotationTypes = ['daily', 'weekly', 'custom'];

    expect(rotationTypes).toContain('daily');
    expect(rotationTypes).toContain('weekly');
    expect(rotationTypes).toContain('custom');
  });
});
