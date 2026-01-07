import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import { createTestApp, generateTestToken, createAuthHeader } from '../helpers.js';

// Mock queue state
interface MockJob {
  id: string;
  name: string;
  data: Record<string, unknown>;
  timestamp: number;
  failedReason?: string;
  delay?: number;
}

interface MockQueue {
  name: string;
  paused: boolean;
  jobs: {
    waiting: MockJob[];
    active: MockJob[];
    completed: MockJob[];
    failed: MockJob[];
    delayed: MockJob[];
  };
}

const mockQueues: Record<string, MockQueue> = {};
const mockSchedulerTasks: Array<{ name: string; cronExpression: string; nextRun: string; isRunning: boolean }> = [];

function resetMockData() {
  // Initialize queues
  const queueNames = ['scheduled-reports', 'health-scores', 'sla-breaches', 'notifications', 'cloud-sync', 'cleanup'];
  queueNames.forEach(name => {
    mockQueues[name] = {
      name,
      paused: false,
      jobs: {
        waiting: [],
        active: [],
        completed: [],
        failed: [],
        delayed: [],
      },
    };
  });

  // Initialize scheduler tasks
  mockSchedulerTasks.length = 0;
  mockSchedulerTasks.push(
    { name: 'healthScoreCalculation', cronExpression: '0 * * * *', nextRun: new Date().toISOString(), isRunning: false },
    { name: 'slaBreachCheck', cronExpression: '*/5 * * * *', nextRun: new Date().toISOString(), isRunning: false },
    { name: 'cleanupOldData', cronExpression: '0 0 * * *', nextRun: new Date().toISOString(), isRunning: false },
    { name: 'cloudResourceSync', cronExpression: '0 */6 * * *', nextRun: new Date().toISOString(), isRunning: false }
  );
}

describe('Jobs Routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp();

    // GET /v1/jobs/queues - Get all queue statuses
    app.get('/v1/jobs/queues', async (request, reply) => {
      const statuses = Object.values(mockQueues).map(q => ({
        name: q.name,
        paused: q.paused,
        counts: {
          waiting: q.jobs.waiting.length,
          active: q.jobs.active.length,
          completed: q.jobs.completed.length,
          failed: q.jobs.failed.length,
          delayed: q.jobs.delayed.length,
        },
      }));
      reply.send({ queues: statuses });
    });

    // GET /v1/jobs/scheduler - Get scheduler status
    app.get('/v1/jobs/scheduler', async (request, reply) => {
      reply.send({ tasks: mockSchedulerTasks });
    });

    // GET /v1/jobs/queues/:queueName - Get specific queue details
    app.get<{ Params: { queueName: string } }>('/v1/jobs/queues/:queueName', async (request, reply) => {
      const { queueName } = request.params;
      const queue = mockQueues[queueName];

      if (!queue) {
        return reply.status(404).send({ error: 'Queue not found' });
      }

      reply.send({
        name: queue.name,
        paused: queue.paused,
        jobs: queue.jobs,
      });
    });

    // POST /v1/jobs/scheduler/:taskName/trigger - Trigger a scheduled task
    app.post<{ Params: { taskName: string } }>('/v1/jobs/scheduler/:taskName/trigger', async (request, reply) => {
      const { taskName } = request.params;
      const task = mockSchedulerTasks.find(t => t.name === taskName);

      if (!task) {
        return reply.status(400).send({ error: `Task '${taskName}' not found` });
      }

      if (task.isRunning) {
        return reply.status(400).send({ error: `Task '${taskName}' is already running` });
      }

      // Simulate task execution
      task.isRunning = true;
      setTimeout(() => {
        task.isRunning = false;
      }, 100);

      reply.send({ success: true, task: taskName, triggered: true });
    });

    // POST /v1/jobs/queues/:queueName/pause - Pause a queue
    app.post<{ Params: { queueName: string } }>('/v1/jobs/queues/:queueName/pause', async (request, reply) => {
      const { queueName } = request.params;
      const queue = mockQueues[queueName];

      if (!queue) {
        return reply.status(404).send({ error: 'Queue not found' });
      }

      queue.paused = true;
      reply.send({ success: true, queue: queueName, paused: true });
    });

    // POST /v1/jobs/queues/:queueName/resume - Resume a queue
    app.post<{ Params: { queueName: string } }>('/v1/jobs/queues/:queueName/resume', async (request, reply) => {
      const { queueName } = request.params;
      const queue = mockQueues[queueName];

      if (!queue) {
        return reply.status(404).send({ error: 'Queue not found' });
      }

      queue.paused = false;
      reply.send({ success: true, queue: queueName, paused: false });
    });

    // DELETE /v1/jobs/queues/:queueName/failed - Clean failed jobs
    app.delete<{ Params: { queueName: string } }>('/v1/jobs/queues/:queueName/failed', async (request, reply) => {
      const { queueName } = request.params;
      const queue = mockQueues[queueName];

      if (!queue) {
        return reply.status(404).send({ error: 'Queue not found' });
      }

      const removedCount = queue.jobs.failed.length;
      queue.jobs.failed = [];
      reply.send({ success: true, queue: queueName, removedCount });
    });

    // POST /v1/jobs/queues/:queueName/retry-failed - Retry failed jobs
    app.post<{ Params: { queueName: string } }>('/v1/jobs/queues/:queueName/retry-failed', async (request, reply) => {
      const { queueName } = request.params;
      const queue = mockQueues[queueName];

      if (!queue) {
        return reply.status(404).send({ error: 'Queue not found' });
      }

      const retriedCount = queue.jobs.failed.length;
      // Move failed jobs back to waiting
      queue.jobs.waiting.push(...queue.jobs.failed);
      queue.jobs.failed = [];
      reply.send({ success: true, queue: queueName, retriedCount });
    });

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    resetMockData();
  });

  // ============================================
  // GET /v1/jobs/queues - List all queues
  // ============================================

  describe('GET /v1/jobs/queues', () => {
    it('should return all queue statuses', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/jobs/queues',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.queues).toBeInstanceOf(Array);
      expect(body.queues.length).toBe(6);

      const queueNames = body.queues.map((q: { name: string }) => q.name);
      expect(queueNames).toContain('scheduled-reports');
      expect(queueNames).toContain('health-scores');
      expect(queueNames).toContain('sla-breaches');
      expect(queueNames).toContain('notifications');
      expect(queueNames).toContain('cloud-sync');
      expect(queueNames).toContain('cleanup');
    });

    it('should return queue counts', async () => {
      // Add some jobs to a queue
      mockQueues['notifications'].jobs.waiting.push({
        id: 'job-1',
        name: 'sendEmail',
        data: { to: 'user@example.com' },
        timestamp: Date.now(),
      });
      mockQueues['notifications'].jobs.failed.push({
        id: 'job-2',
        name: 'sendEmail',
        data: { to: 'fail@example.com' },
        timestamp: Date.now(),
        failedReason: 'SMTP error',
      });

      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/jobs/queues',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      const notificationQueue = body.queues.find((q: { name: string }) => q.name === 'notifications');
      expect(notificationQueue.counts.waiting).toBe(1);
      expect(notificationQueue.counts.failed).toBe(1);
    });
  });

  // ============================================
  // GET /v1/jobs/scheduler - Get scheduler status
  // ============================================

  describe('GET /v1/jobs/scheduler', () => {
    it('should return all scheduled tasks', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/jobs/scheduler',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.tasks).toBeInstanceOf(Array);
      expect(body.tasks.length).toBe(4);

      const taskNames = body.tasks.map((t: { name: string }) => t.name);
      expect(taskNames).toContain('healthScoreCalculation');
      expect(taskNames).toContain('slaBreachCheck');
      expect(taskNames).toContain('cleanupOldData');
      expect(taskNames).toContain('cloudResourceSync');
    });

    it('should include cron expression and next run time', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/jobs/scheduler',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      const healthTask = body.tasks.find((t: { name: string }) => t.name === 'healthScoreCalculation');
      expect(healthTask).toHaveProperty('cronExpression');
      expect(healthTask).toHaveProperty('nextRun');
      expect(healthTask).toHaveProperty('isRunning');
      expect(healthTask.cronExpression).toBe('0 * * * *');
    });
  });

  // ============================================
  // GET /v1/jobs/queues/:queueName - Get queue details
  // ============================================

  describe('GET /v1/jobs/queues/:queueName', () => {
    it('should return queue details for valid queue', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/jobs/queues/notifications',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.name).toBe('notifications');
      expect(body.paused).toBe(false);
      expect(body.jobs).toHaveProperty('waiting');
      expect(body.jobs).toHaveProperty('active');
      expect(body.jobs).toHaveProperty('completed');
      expect(body.jobs).toHaveProperty('failed');
      expect(body.jobs).toHaveProperty('delayed');
    });

    it('should return 404 for non-existent queue', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/jobs/queues/non-existent-queue',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Queue not found');
    });

    it('should return job details for each state', async () => {
      // Add jobs to different states
      mockQueues['sla-breaches'].jobs.waiting.push({
        id: 'job-w1',
        name: 'checkSLA',
        data: { tenantSlug: 'test-tenant' },
        timestamp: Date.now(),
      });
      mockQueues['sla-breaches'].jobs.active.push({
        id: 'job-a1',
        name: 'checkSLA',
        data: { tenantSlug: 'active-tenant' },
        timestamp: Date.now(),
      });
      mockQueues['sla-breaches'].jobs.failed.push({
        id: 'job-f1',
        name: 'checkSLA',
        data: { tenantSlug: 'failed-tenant' },
        timestamp: Date.now(),
        failedReason: 'Database connection error',
      });

      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/jobs/queues/sla-breaches',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.jobs.waiting).toHaveLength(1);
      expect(body.jobs.active).toHaveLength(1);
      expect(body.jobs.failed).toHaveLength(1);
      expect(body.jobs.failed[0].failedReason).toBe('Database connection error');
    });

    it('should return all valid queue names', async () => {
      const queueNames = ['scheduled-reports', 'health-scores', 'sla-breaches', 'notifications', 'cloud-sync', 'cleanup'];

      const token = generateTestToken(app);

      for (const queueName of queueNames) {
        const response = await app.inject({
          method: 'GET',
          url: `/v1/jobs/queues/${queueName}`,
          headers: createAuthHeader(token),
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.name).toBe(queueName);
      }
    });
  });

  // ============================================
  // POST /v1/jobs/scheduler/:taskName/trigger - Trigger task
  // ============================================

  describe('POST /v1/jobs/scheduler/:taskName/trigger', () => {
    it('should trigger a valid task', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'POST',
        url: '/v1/jobs/scheduler/healthScoreCalculation/trigger',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.task).toBe('healthScoreCalculation');
      expect(body.triggered).toBe(true);
    });

    it('should return 400 for non-existent task', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'POST',
        url: '/v1/jobs/scheduler/nonExistentTask/trigger',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('not found');
    });

    it('should return 400 if task is already running', async () => {
      // Mark task as running
      const task = mockSchedulerTasks.find(t => t.name === 'slaBreachCheck');
      if (task) task.isRunning = true;

      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'POST',
        url: '/v1/jobs/scheduler/slaBreachCheck/trigger',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('already running');
    });
  });

  // ============================================
  // POST /v1/jobs/queues/:queueName/pause - Pause queue
  // ============================================

  describe('POST /v1/jobs/queues/:queueName/pause', () => {
    it('should pause a queue', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'POST',
        url: '/v1/jobs/queues/notifications/pause',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.queue).toBe('notifications');
      expect(body.paused).toBe(true);

      // Verify queue is paused
      expect(mockQueues['notifications'].paused).toBe(true);
    });

    it('should return 404 for non-existent queue', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'POST',
        url: '/v1/jobs/queues/invalid-queue/pause',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(404);
    });
  });

  // ============================================
  // POST /v1/jobs/queues/:queueName/resume - Resume queue
  // ============================================

  describe('POST /v1/jobs/queues/:queueName/resume', () => {
    it('should resume a paused queue', async () => {
      // First pause the queue
      mockQueues['cloud-sync'].paused = true;

      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'POST',
        url: '/v1/jobs/queues/cloud-sync/resume',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.queue).toBe('cloud-sync');
      expect(body.paused).toBe(false);

      // Verify queue is resumed
      expect(mockQueues['cloud-sync'].paused).toBe(false);
    });

    it('should return 404 for non-existent queue', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'POST',
        url: '/v1/jobs/queues/invalid-queue/resume',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(404);
    });
  });

  // ============================================
  // DELETE /v1/jobs/queues/:queueName/failed - Clean failed jobs
  // ============================================

  describe('DELETE /v1/jobs/queues/:queueName/failed', () => {
    it('should clean all failed jobs from queue', async () => {
      // Add some failed jobs
      mockQueues['health-scores'].jobs.failed.push(
        { id: 'f1', name: 'calcHealth', data: {}, timestamp: Date.now(), failedReason: 'Error 1' },
        { id: 'f2', name: 'calcHealth', data: {}, timestamp: Date.now(), failedReason: 'Error 2' },
        { id: 'f3', name: 'calcHealth', data: {}, timestamp: Date.now(), failedReason: 'Error 3' }
      );

      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'DELETE',
        url: '/v1/jobs/queues/health-scores/failed',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.queue).toBe('health-scores');
      expect(body.removedCount).toBe(3);

      // Verify failed jobs are cleared
      expect(mockQueues['health-scores'].jobs.failed).toHaveLength(0);
    });

    it('should return 0 removed count when no failed jobs', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'DELETE',
        url: '/v1/jobs/queues/cleanup/failed',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.removedCount).toBe(0);
    });

    it('should return 404 for non-existent queue', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'DELETE',
        url: '/v1/jobs/queues/invalid-queue/failed',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(404);
    });
  });

  // ============================================
  // POST /v1/jobs/queues/:queueName/retry-failed - Retry failed jobs
  // ============================================

  describe('POST /v1/jobs/queues/:queueName/retry-failed', () => {
    it('should retry all failed jobs', async () => {
      // Add some failed jobs
      mockQueues['scheduled-reports'].jobs.failed.push(
        { id: 'f1', name: 'generateReport', data: { reportId: '1' }, timestamp: Date.now(), failedReason: 'Timeout' },
        { id: 'f2', name: 'generateReport', data: { reportId: '2' }, timestamp: Date.now(), failedReason: 'Timeout' }
      );

      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'POST',
        url: '/v1/jobs/queues/scheduled-reports/retry-failed',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.queue).toBe('scheduled-reports');
      expect(body.retriedCount).toBe(2);

      // Verify jobs moved from failed to waiting
      expect(mockQueues['scheduled-reports'].jobs.failed).toHaveLength(0);
      expect(mockQueues['scheduled-reports'].jobs.waiting).toHaveLength(2);
    });

    it('should return 0 retried count when no failed jobs', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'POST',
        url: '/v1/jobs/queues/notifications/retry-failed',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.retriedCount).toBe(0);
    });

    it('should return 404 for non-existent queue', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'POST',
        url: '/v1/jobs/queues/invalid-queue/retry-failed',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(404);
    });
  });

  // ============================================
  // Integration scenarios
  // ============================================

  describe('Queue management workflow', () => {
    it('should handle pause, resume, and job operations in sequence', async () => {
      const token = generateTestToken(app);
      const queueName = 'notifications';

      // 1. Initially queue should not be paused
      let response = await app.inject({
        method: 'GET',
        url: `/v1/jobs/queues/${queueName}`,
        headers: createAuthHeader(token),
      });
      expect(JSON.parse(response.body).paused).toBe(false);

      // 2. Pause the queue
      response = await app.inject({
        method: 'POST',
        url: `/v1/jobs/queues/${queueName}/pause`,
        headers: createAuthHeader(token),
      });
      expect(response.statusCode).toBe(200);

      // 3. Verify queue is paused
      response = await app.inject({
        method: 'GET',
        url: `/v1/jobs/queues/${queueName}`,
        headers: createAuthHeader(token),
      });
      expect(JSON.parse(response.body).paused).toBe(true);

      // 4. Resume the queue
      response = await app.inject({
        method: 'POST',
        url: `/v1/jobs/queues/${queueName}/resume`,
        headers: createAuthHeader(token),
      });
      expect(response.statusCode).toBe(200);

      // 5. Verify queue is resumed
      response = await app.inject({
        method: 'GET',
        url: `/v1/jobs/queues/${queueName}`,
        headers: createAuthHeader(token),
      });
      expect(JSON.parse(response.body).paused).toBe(false);
    });
  });

  describe('Failed job management', () => {
    it('should track and manage failed jobs across operations', async () => {
      const token = generateTestToken(app);
      const queueName = 'cloud-sync';

      // 1. Add failed jobs
      mockQueues[queueName].jobs.failed.push(
        { id: 'f1', name: 'syncAWS', data: { provider: 'aws' }, timestamp: Date.now(), failedReason: 'Auth failed' }
      );

      // 2. Get queue status showing failed job
      let response = await app.inject({
        method: 'GET',
        url: `/v1/jobs/queues/${queueName}`,
        headers: createAuthHeader(token),
      });
      expect(JSON.parse(response.body).jobs.failed).toHaveLength(1);

      // 3. Retry failed jobs
      response = await app.inject({
        method: 'POST',
        url: `/v1/jobs/queues/${queueName}/retry-failed`,
        headers: createAuthHeader(token),
      });
      expect(JSON.parse(response.body).retriedCount).toBe(1);

      // 4. Verify jobs moved to waiting
      response = await app.inject({
        method: 'GET',
        url: `/v1/jobs/queues/${queueName}`,
        headers: createAuthHeader(token),
      });
      const body = JSON.parse(response.body);
      expect(body.jobs.failed).toHaveLength(0);
      expect(body.jobs.waiting).toHaveLength(1);
    });
  });
});
