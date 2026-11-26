import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { notificationService } from '../services/notifications.js';
import { requirePermission } from '../middleware/auth.js';
import { parsePagination, createPaginatedResponse } from '../utils/pagination.js';
import { updatePreferenceSchema, createChannelSchema, updateChannelSchema, updateTemplateSchema, notificationIdParamSchema, channelIdParamSchema, templateParamSchema, listNotificationsQuerySchema } from '../schemas/notifications.js';

// Parameter validation schemas

// Query parameter validation schema

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
    const { id } = request.params as z.infer<typeof notificationIdParamSchema>;

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
    const { id } = request.params as z.infer<typeof notificationIdParamSchema>;

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
    const body = request.body as z.infer<typeof updatePreferenceSchema>;

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
    const body = request.body as z.infer<typeof createChannelSchema>;

    const channel = await notificationService.createChannel(tenantSlug, body);
    reply.status(201).send(channel);
  });

  // Admin: Update notification channel
  app.put<{ Params: { id: string } }>('/channels/:id', {
    preHandler: [requirePermission('settings:update')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { id } = request.params as z.infer<typeof channelIdParamSchema>;
    const body = request.body as z.infer<typeof updateChannelSchema>;

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
    const { eventType, channelType } = request.params as z.infer<typeof templateParamSchema>;
    const body = request.body as z.infer<typeof updateTemplateSchema>;

    const template = await notificationService.updateTemplate(
      tenantSlug,
      eventType,
      channelType,
      body
    );
    reply.send(template);
  });
}
