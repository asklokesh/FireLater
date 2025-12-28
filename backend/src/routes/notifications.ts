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

export default async function notificationRoutes(app: FastifyInstance) {
  // Get current user's notifications
  app.get('/', {
    preHandler: [requirePermission('requests:read')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const query = request.query as Record<string, string>;
    const pagination = parsePagination(query);

    const filters = {
      unreadOnly: query.unread === 'true',
      eventType: query.event_type,
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

    const notification = await notificationService.markAsRead(tenantSlug, request.params.id, userId);
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

    await notificationService.delete(tenantSlug, request.params.id, userId);
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
    const body = updateChannelSchema.parse(request.body);

    const channel = await notificationService.updateChannel(tenantSlug, request.params.id, body);
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
    const body = updateTemplateSchema.parse(request.body);

    const template = await notificationService.updateTemplate(
      tenantSlug,
      request.params.eventType,
      request.params.channelType,
      body
    );
    reply.send(template);
  });
}
