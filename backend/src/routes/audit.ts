import { FastifyPluginAsync } from 'fastify';
import { requirePermission } from '../middleware/auth.js';
import { auditService, AuditAction } from '../services/audit.js';
import { validateDate, validateDateRange, validateLimit, validateOffset } from '../utils/validation.js';

// ============================================
// AUDIT LOG ROUTES
// ============================================

const auditRoutes: FastifyPluginAsync = async (app) => {
  // Query audit logs
  app.get<{
    Querystring: {
      userId?: string;
      action?: AuditAction;
      entityType?: string;
      entityId?: string;
      ipAddress?: string;
      startDate?: string;
      endDate?: string;
      limit?: string;
      offset?: string;
    };
  }>(
    '/',
    {
      preHandler: [requirePermission('admin:read')],
    },
    async (request, _reply) => {
      const { tenantSlug } = request.user;
      const {
        userId,
        action,
        entityType,
        entityId,
        ipAddress,
        startDate,
        endDate,
        limit,
        offset,
      } = request.query;

      // Validate date parameters to prevent SQL injection
      const validatedStartDate = validateDate(startDate, 'startDate');
      const validatedEndDate = validateDate(endDate, 'endDate');
      validateDateRange(validatedStartDate, validatedEndDate, 365);

      // Validate pagination
      const validatedLimit = validateLimit(limit, 1000);
      const validatedOffset = validateOffset(offset);

      const result = await auditService.query(tenantSlug, {
        userId,
        action,
        entityType,
        entityId,
        ipAddress,
        startDate: validatedStartDate,
        endDate: validatedEndDate,
        limit: validatedLimit,
        offset: validatedOffset,
      });

      return result;
    }
  );

  // Get entity history
  app.get<{
    Params: { entityType: string; entityId: string };
  }>(
    '/entity/:entityType/:entityId',
    {
      preHandler: [requirePermission('admin:read')],
    },
    async (request, _reply) => {
      const { tenantSlug } = request.user;
      const { entityType, entityId } = request.params;

      const logs = await auditService.getEntityHistory(tenantSlug, entityType, entityId);

      return { logs };
    }
  );

  // Get user activity
  app.get<{
    Params: { userId: string };
    Querystring: { days?: string };
  }>(
    '/user/:userId',
    {
      preHandler: [requirePermission('admin:read')],
    },
    async (request, _reply) => {
      const { tenantSlug } = request.user;
      const { userId } = request.params;
      const days = parseInt(request.query.days || '30', 10);

      const logs = await auditService.getUserActivity(tenantSlug, userId, days);

      return { logs };
    }
  );

  // Get security events
  app.get<{
    Querystring: { hours?: string };
  }>(
    '/security',
    {
      preHandler: [requirePermission('admin:read')],
    },
    async (request, _reply) => {
      const { tenantSlug } = request.user;
      const hours = parseInt(request.query.hours || '24', 10);

      const events = await auditService.getSecurityEvents(tenantSlug, hours);

      return { events };
    }
  );

  // Get failed login attempts
  app.get<{
    Querystring: { hours?: string; threshold?: string };
  }>(
    '/security/failed-logins',
    {
      preHandler: [requirePermission('admin:read')],
    },
    async (request, _reply) => {
      const { tenantSlug } = request.user;
      const hours = parseInt(request.query.hours || '24', 10);
      const threshold = parseInt(request.query.threshold || '5', 10);

      const attempts = await auditService.getFailedLogins(tenantSlug, hours, threshold);

      return { attempts };
    }
  );

  // Get summary by user
  app.get(
    '/summary/users',
    {
      preHandler: [requirePermission('admin:read')],
    },
    async (request, _reply) => {
      const { tenantSlug } = request.user;

      const summary = await auditService.getSummaryByUser(tenantSlug);

      return { summary };
    }
  );

  // Get summary by entity
  app.get(
    '/summary/entities',
    {
      preHandler: [requirePermission('admin:read')],
    },
    async (request, _reply) => {
      const { tenantSlug } = request.user;

      const summary = await auditService.getSummaryByEntity(tenantSlug);

      return { summary };
    }
  );

  // Get audit settings
  app.get(
    '/settings',
    {
      preHandler: [requirePermission('admin:read')],
    },
    async (request, _reply) => {
      const { tenantSlug } = request.user;

      const settings = await auditService.getSettings(tenantSlug);

      return { settings };
    }
  );

  // Update audit settings
  app.patch<{
    Body: {
      retention_days?: number;
      log_reads?: boolean;
      log_exports?: boolean;
      sensitive_fields?: string[];
    };
  }>(
    '/settings',
    {
      preHandler: [requirePermission('admin:write')],
    },
    async (request, _reply) => {
      const { tenantSlug, userId } = request.user;
      const settings = request.body;

      await auditService.updateSettings(tenantSlug, settings, userId);

      const updated = await auditService.getSettings(tenantSlug);

      return { settings: updated };
    }
  );

  // Manual cleanup (admin only)
  app.post(
    '/cleanup',
    {
      preHandler: [requirePermission('admin:write')],
    },
    async (request, _reply) => {
      const { tenantSlug } = request.user;

      const deletedCount = await auditService.cleanupOldLogs(tenantSlug);

      return { deletedCount };
    }
  );
};

export default auditRoutes;
