import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requirePermission } from '../middleware/auth.js';
import { ForbiddenError, NotFoundError } from '../utils/errors.js';
import { validateBulkWebhookUrl } from '../utils/bulkWebhook.js';
import {
  ENTITY_DEFS,
  executeBulk,
  getBulkSchema,
  isBulkEntity,
  isBulkOperation,
  shouldRunAsync,
  countRecords,
  BULK_ASYNC_THRESHOLD,
  type BulkOperation,
  type BulkPayload,
} from '../services/bulk.js';
import { bulkQueue, type BulkJobProgress } from '../jobs/bulkQueue.js';
import { jobIdParamSchema } from '../schemas/bulk.js';

// Permission action required for each operation
const OPERATION_PERMISSION: Record<BulkOperation, string> = {
  update: 'update',
  delete: 'delete',
  status: 'update',
  assign: 'assign',
};

// 50,000 uuids is roughly 2 MB of JSON
const BULK_BODY_LIMIT = 4 * 1024 * 1024;

function authorize(operation: BulkOperation) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const { entity } = request.params as { entity: string };
    if (!isBulkEntity(entity)) {
      throw new NotFoundError('Bulk entity', entity);
    }
    const def = ENTITY_DEFS[entity];
    const action = operation === 'assign' ? def.assignAction : OPERATION_PERMISSION[operation];
    const permission = `${def.permission}:${action}`;
    await requirePermission(permission)(request, reply);
  };
}

export default async function bulkRoutes(app: FastifyInstance) {
  for (const operation of ['update', 'delete', 'status', 'assign'] as const) {
    app.post<{ Params: { entity: string } }>(`/:entity/${operation}`, {
      bodyLimit: BULK_BODY_LIMIT,
      preHandler: [authorize(operation)],
    }, async (request, reply) => {
      const { entity } = request.params;
      if (!isBulkEntity(entity) || !isBulkOperation(operation)) {
        throw new NotFoundError('Bulk entity', entity);
      }
      const { tenantSlug, userId } = request.user;
      const payload = getBulkSchema(entity, operation).parse(request.body) as BulkPayload;

      if (payload.webhookUrl) {
        await validateBulkWebhookUrl(payload.webhookUrl);
      }

      if (shouldRunAsync(payload)) {
        const job = await bulkQueue.add(`${entity}:${operation}`, {
          tenantSlug,
          userId,
          entity,
          operation,
          payload,
          webhookUrl: payload.webhookUrl,
        });
        return reply.status(202).send({
          jobId: job.id,
          entity,
          operation,
          status: 'queued',
          total: countRecords(payload),
          statusUrl: `/v1/bulk/jobs/${job.id}`,
        });
      }

      const result = await executeBulk({ tenantSlug, userId }, entity, operation, payload);
      return reply.status(200).send({ ...result, mode: 'sync', asyncThreshold: BULK_ASYNC_THRESHOLD });
    });
  }

  // Job status and progress
  app.get<{ Params: { id: string } }>('/jobs/:id', {
    preHandler: [requirePermission('issues:read', 'problems:read', 'changes:read', 'requests:read')],
  }, async (request, reply) => {
    const { id } = request.params as z.infer<typeof jobIdParamSchema>;
    const { tenantSlug, userId, roles } = request.user;

    const job = await bulkQueue.getJob(id);
    if (!job || job.data.tenantSlug !== tenantSlug) {
      throw new NotFoundError('Bulk job', id);
    }
    // the job's own entity must be readable by the caller, not just any bulk entity
    await requirePermission(`${ENTITY_DEFS[job.data.entity].permission}:read`)(request, reply);
    if (job.data.userId !== userId && !roles.includes('admin')) {
      throw new ForbiddenError('You can only view bulk jobs you started');
    }

    const state = await job.getState();
    const progress = (typeof job.progress === 'object' ? job.progress : null) as BulkJobProgress | null;
    const total = progress?.total ?? countRecords(job.data.payload);
    const processed = progress?.processed ?? 0;

    reply.send({
      jobId: job.id,
      entity: job.data.entity,
      operation: job.data.operation,
      status: state === 'completed' ? 'completed' : state === 'failed' ? 'failed' : state === 'active' ? 'running' : 'queued',
      total,
      processed: state === 'completed' ? total : processed,
      percent: total > 0 ? Math.round(((state === 'completed' ? total : processed) / total) * 100) : 0,
      result: state === 'completed' ? job.returnvalue : undefined,
      error: state === 'failed' ? job.failedReason : undefined,
      rolledBack: state === 'failed' ? true : undefined,
      createdAt: new Date(job.timestamp).toISOString(),
      finishedAt: job.finishedOn ? new Date(job.finishedOn).toISOString() : undefined,
    });
  });
}
