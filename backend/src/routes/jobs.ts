import { FastifyPluginAsync } from 'fastify';
import { requirePermission } from '../middleware/auth.js';
import {
  getAllQueuesStatus,
  getSchedulerStatus,
  triggerTask,
} from '../jobs/index.js';
import {
  scheduledReportsQueue,
  healthScoreQueue,
  slaBreachQueue,
  notificationQueue,
  cloudSyncQueue,
  cleanupQueue,
} from '../jobs/queues.js';

// ============================================
// JOBS ROUTES (Admin only)
// ============================================

const jobsRoutes: FastifyPluginAsync = async (app) => {
  // Get all queue statuses
  app.get(
    '/queues',
    {
      preHandler: [requirePermission('admin:read')],
    },
    async (_request, _reply) => {
      const statuses = await getAllQueuesStatus();
      return { queues: statuses };
    }
  );

  // Get scheduler status
  app.get(
    '/scheduler',
    {
      preHandler: [requirePermission('admin:read')],
    },
    async (_request, _reply) => {
      const status = getSchedulerStatus();
      return { tasks: status };
    }
  );

  // Get specific queue details
  app.get<{ Params: { queueName: string } }>(
    '/queues/:queueName',
    {
      preHandler: [requirePermission('admin:read')],
    },
    async (request, reply) => {
      const { queueName } = request.params;

      const queueMap: Record<string, typeof scheduledReportsQueue> = {
        'scheduled-reports': scheduledReportsQueue,
        'health-scores': healthScoreQueue,
        'sla-breaches': slaBreachQueue,
        notifications: notificationQueue,
        'cloud-sync': cloudSyncQueue,
        cleanup: cleanupQueue,
      };

      const queue = queueMap[queueName];
      if (!queue) {
        return reply.status(404).send({ error: 'Queue not found' });
      }

      const [waiting, active, completed, failed, delayed, paused] = await Promise.all([
        queue.getWaiting(0, 10),
        queue.getActive(0, 10),
        queue.getCompleted(0, 10),
        queue.getFailed(0, 10),
        queue.getDelayed(0, 10),
        queue.isPaused(),
      ]);

      return {
        name: queueName,
        paused,
        jobs: {
          waiting: waiting.map((j) => ({ id: j.id, name: j.name, data: j.data, timestamp: j.timestamp })),
          active: active.map((j) => ({ id: j.id, name: j.name, data: j.data, timestamp: j.timestamp })),
          completed: completed.map((j) => ({ id: j.id, name: j.name, timestamp: j.timestamp })),
          failed: failed.map((j) => ({
            id: j.id,
            name: j.name,
            failedReason: j.failedReason,
            timestamp: j.timestamp,
          })),
          delayed: delayed.map((j) => ({ id: j.id, name: j.name, delay: j.delay, timestamp: j.timestamp })),
        },
      };
    }
  );

  // Trigger a scheduled task manually
  app.post<{ Params: { taskName: string } }>(
    '/scheduler/:taskName/trigger',
    {
      preHandler: [requirePermission('admin:write')],
    },
    async (request, reply) => {
      const { taskName } = request.params;

      try {
        const result = await triggerTask(taskName);
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return reply.status(400).send({ error: message });
      }
    }
  );

  // Pause a queue
  app.post<{ Params: { queueName: string } }>(
    '/queues/:queueName/pause',
    {
      preHandler: [requirePermission('admin:write')],
    },
    async (request, reply) => {
      const { queueName } = request.params;

      const queueMap: Record<string, typeof scheduledReportsQueue> = {
        'scheduled-reports': scheduledReportsQueue,
        'health-scores': healthScoreQueue,
        'sla-breaches': slaBreachQueue,
        notifications: notificationQueue,
        'cloud-sync': cloudSyncQueue,
        cleanup: cleanupQueue,
      };

      const queue = queueMap[queueName];
      if (!queue) {
        return reply.status(404).send({ error: 'Queue not found' });
      }

      await queue.pause();
      return { success: true, queue: queueName, paused: true };
    }
  );

  // Resume a queue
  app.post<{ Params: { queueName: string } }>(
    '/queues/:queueName/resume',
    {
      preHandler: [requirePermission('admin:write')],
    },
    async (request, reply) => {
      const { queueName } = request.params;

      const queueMap: Record<string, typeof scheduledReportsQueue> = {
        'scheduled-reports': scheduledReportsQueue,
        'health-scores': healthScoreQueue,
        'sla-breaches': slaBreachQueue,
        notifications: notificationQueue,
        'cloud-sync': cloudSyncQueue,
        cleanup: cleanupQueue,
      };

      const queue = queueMap[queueName];
      if (!queue) {
        return reply.status(404).send({ error: 'Queue not found' });
      }

      await queue.resume();
      return { success: true, queue: queueName, paused: false };
    }
  );

  // Clean failed jobs from a queue
  app.delete<{ Params: { queueName: string } }>(
    '/queues/:queueName/failed',
    {
      preHandler: [requirePermission('admin:write')],
    },
    async (request, reply) => {
      const { queueName } = request.params;

      const queueMap: Record<string, typeof scheduledReportsQueue> = {
        'scheduled-reports': scheduledReportsQueue,
        'health-scores': healthScoreQueue,
        'sla-breaches': slaBreachQueue,
        notifications: notificationQueue,
        'cloud-sync': cloudSyncQueue,
        cleanup: cleanupQueue,
      };

      const queue = queueMap[queueName];
      if (!queue) {
        return reply.status(404).send({ error: 'Queue not found' });
      }

      const failed = await queue.getFailed();
      await Promise.all(failed.map((job) => job.remove()));

      return { success: true, queue: queueName, removedCount: failed.length };
    }
  );

  // Retry all failed jobs in a queue
  app.post<{ Params: { queueName: string } }>(
    '/queues/:queueName/retry-failed',
    {
      preHandler: [requirePermission('admin:write')],
    },
    async (request, reply) => {
      const { queueName } = request.params;

      const queueMap: Record<string, typeof scheduledReportsQueue> = {
        'scheduled-reports': scheduledReportsQueue,
        'health-scores': healthScoreQueue,
        'sla-breaches': slaBreachQueue,
        notifications: notificationQueue,
        'cloud-sync': cloudSyncQueue,
        cleanup: cleanupQueue,
      };

      const queue = queueMap[queueName];
      if (!queue) {
        return reply.status(404).send({ error: 'Queue not found' });
      }

      const failed = await queue.getFailed();
      await Promise.all(failed.map((job) => job.retry()));

      return { success: true, queue: queueName, retriedCount: failed.length };
    }
  );
};

export default jobsRoutes;
