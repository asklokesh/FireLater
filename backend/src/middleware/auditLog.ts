import { FastifyRequest, FastifyReply } from 'fastify';
import { auditService, AuditAction } from '../services/audit.js';
import { logger } from '../utils/logger.js';

// ============================================
// AUDIT LOG MIDDLEWARE
// ============================================

interface AuditOptions {
  action: AuditAction;
  entityType: string;
  getEntityId?: (request: FastifyRequest) => string | undefined;
  getEntityName?: (request: FastifyRequest) => string | undefined;
  getOldValues?: (request: FastifyRequest) => Record<string, unknown> | undefined;
  getNewValues?: (request: FastifyRequest) => Record<string, unknown> | undefined;
  getMetadata?: (request: FastifyRequest) => Record<string, unknown> | undefined;
}

export function auditLog(options: AuditOptions) {
  return async (request: FastifyRequest, _reply: FastifyReply) => {
    // Store options for use in response hook
    (request as unknown as { _auditOptions: AuditOptions })._auditOptions = options;
  };
}

export async function logAuditEvent(
  request: FastifyRequest,
  options: AuditOptions,
  extra?: {
    oldValues?: Record<string, unknown>;
    newValues?: Record<string, unknown>;
    entityId?: string;
    entityName?: string;
  }
): Promise<void> {
  if (!request.user?.tenantSlug) {
    return;
  }

  try {
    const entityId = extra?.entityId || options.getEntityId?.(request);
    const entityName = extra?.entityName || options.getEntityName?.(request);
    const oldValues = extra?.oldValues || options.getOldValues?.(request);
    const newValues = extra?.newValues || options.getNewValues?.(request);
    const metadata = options.getMetadata?.(request);

    await auditService.log(request.user.tenantSlug, {
      userId: request.user.userId,
      userEmail: request.user.email,
      action: options.action,
      entityType: options.entityType,
      entityId,
      entityName,
      oldValues,
      newValues,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
      requestId: request.id,
      metadata,
    });
  } catch (error) {
    logger.error({ err: error }, 'Failed to log audit event');
  }
}

// Helper for common CRUD operations
export const auditCreate = (entityType: string) =>
  auditLog({
    action: 'create',
    entityType,
    getEntityId: (req) => (req.params as { id?: string }).id,
    getNewValues: (req) => req.body as Record<string, unknown>,
  });

export const auditUpdate = (entityType: string) =>
  auditLog({
    action: 'update',
    entityType,
    getEntityId: (req) => (req.params as { id?: string }).id,
    getNewValues: (req) => req.body as Record<string, unknown>,
  });

export const auditDelete = (entityType: string) =>
  auditLog({
    action: 'delete',
    entityType,
    getEntityId: (req) => (req.params as { id?: string }).id,
  });

export const auditView = (entityType: string) =>
  auditLog({
    action: 'view',
    entityType,
    getEntityId: (req) => (req.params as { id?: string }).id,
  });

// Direct audit logging function for use in route handlers
export async function createAuditLog(
  request: FastifyRequest,
  action: AuditAction,
  entityType: string,
  options: {
    entityId?: string;
    entityName?: string;
    oldValues?: Record<string, unknown>;
    newValues?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  } = {}
): Promise<void> {
  if (!request.user?.tenantSlug) {
    return;
  }

  try {
    await auditService.log(request.user.tenantSlug, {
      userId: request.user.userId,
      userEmail: request.user.email,
      action,
      entityType,
      entityId: options.entityId,
      entityName: options.entityName,
      oldValues: options.oldValues,
      newValues: options.newValues,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
      requestId: request.id,
      metadata: options.metadata,
    });
  } catch (error) {
    logger.error({ err: error }, 'Failed to create audit log');
  }
}
