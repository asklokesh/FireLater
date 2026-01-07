import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { notificationService } from '../services/notifications.js';
import { requirePermission } from '../middleware/auth.js';
import { parsePagination, createPaginatedResponse } from '../utils/pagination.js';

const updatePreferenceSchema = z.object({
  eventType: z.string(),
  channelId: z.string().uuid(),
  enabled: z.boolean(),
});

const createChannelSchema = z.object({
  name: z.string().min(1).max(255),
  type: z.enum(['email', 'in_app', 'slack', 'webhook']),
  integrationId: z.string().uuid().optional(),
  config: z.record(z.unknown()).optional(),
  isDefault: z.boolean().optional(),
});

const updateChannelSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  config: z.record(z.unknown()).optional(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

const updateTemplateSchema = z.object({
  subject: z.string().max(500).optional(),
  bodyTemplate: z.string().optional(),
  isActive: z.boolean().optional(),
});

// Parameter validation schemas
const notificationIdParamSchema = z.object({
  id: z.string().uuid(),
});

const channelIdParamSchema = z.object({
  id: z.string().uuid(),
});

const templateParamSchema = z.object({
  eventType: z.string().min(1).max(100),
  channelType: z.enum(['email', 'in_app', 'slack', 'webhook']),
});

// Query parameter validation schema
const listNotificationsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  per_page: z.coerce.number().int().min(1).max(100).optional(),
  unread: z.enum(['true', 'false']).optional(),
  event_type: z.string().max(100).optional(),
});

export default async function notificationRoutes(app: FastifyInstance) {
  // Get current user's notifications
  app.get('/', {
    preHandler: [requirePermission('requests:read')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const query = request.query as Record<string, string>;

    // Validate query parameters
    const validatedQuery = listNotificationsQuerySchema.parse(query);
    const pagination = parsePagination(query);

    const filters = {
      unreadOnly: validatedQuery.unread === 'true',
      eventType: validatedQuery.event_type,
    };

    const { notifications, total } = await notificationService.list(tenantSlug, userId, pagination, filters);
    reply.send(createPaginatedResponse(notifications, total, pagination));
  });

  // Get unread count
  app.get('/unread-count', {
    preHandler: [requirePermission('requests:read')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;

    const count = await notificationService.getUnreadCount(tenantSlug, userId);
    reply.send({ count });
  });

  // Mark notification as read
  app.post<{ Params: { id: string } }>('/:id/read', {
    preHandler: [requirePermission('requests:read')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { id } = notificationIdParamSchema.parse(request.params);

    const notification = await notificationService.markAsRead(tenantSlug, id, userId);
    if (!notification) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: 'Notification not found',
      });
    }

    reply.send(notification);
  });

  // Mark all notifications as read
  app.post('/mark-all-read', {
    preHandler: [requirePermission('requests:read')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;

    const count = await notificationService.markAllAsRead(tenantSlug, userId);
    reply.send({ updated: count });
  });

  // Delete notification
  app.delete<{ Params: { id: string } }>('/:id', {
    preHandler: [requirePermission('requests:read')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { id } = notificationIdParamSchema.parse(request.params);

    await notificationService.delete(tenantSlug, id, userId);
    reply.status(204).send();
  });

  // Get user's notification preferences
  app.get('/preferences', {
    preHandler: [requirePermission('requests:read')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;

    const preferences = await notificationService.getUserPreferences(tenantSlug, userId);
    reply.send({ data: preferences });
  });

  // Update user's notification preference
  app.put('/preferences', {
    preHandler: [requirePermission('requests:read')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const body = updatePreferenceSchema.parse(request.body);

    await notificationService.updateUserPreference(tenantSlug, userId, body.eventType, body.channelId, body.enabled);
    reply.send({ success: true });
  });

  // Admin: List notification channels
  app.get('/channels', {
    preHandler: [requirePermission('settings:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;

    const channels = await notificationService.listChannels(tenantSlug);
    reply.send({ data: channels });
  });

  // Admin: Create notification channel
  app.post('/channels', {
    preHandler: [requirePermission('settings:update')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const body = createChannelSchema.parse(request.body);

    const channel = await notificationService.createChannel(tenantSlug, body);
    reply.status(201).send(channel);
  });

  // Admin: Update notification channel
  app.put<{ Params: { id: string } }>('/channels/:id', {
    preHandler: [requirePermission('settings:update')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { id } = channelIdParamSchema.parse(request.params);
    const body = updateChannelSchema.parse(request.body);

    const channel = await notificationService.updateChannel(tenantSlug, id, body);
    reply.send(channel);
  });

  // Admin: List notification templates
  app.get('/templates', {
    preHandler: [requirePermission('settings:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;

    const templates = await notificationService.listTemplates(tenantSlug);
    reply.send({ data: templates });
  });

  // Admin: Update notification template
  app.put<{ Params: { eventType: string; channelType: string } }>('/templates/:eventType/:channelType', {
    preHandler: [requirePermission('settings:update')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { eventType, channelType } = templateParamSchema.parse(request.params);
    const body = updateTemplateSchema.parse(request.body);

    const template = await notificationService.updateTemplate(
      tenantSlug,
      eventType,
      channelType,
      body
    );
    reply.send(template);
  });
}
