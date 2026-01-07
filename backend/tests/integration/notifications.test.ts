import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { createTestApp, generateTestToken, createAuthHeader } from '../helpers.js';

interface MockNotification {
  id: string;
  user_id: string;
  event_type: string;
  title: string;
  message: string;
  entity_type: string | null;
  entity_id: string | null;
  is_read: boolean;
  created_at: string;
}

interface MockChannel {
  id: string;
  name: string;
  type: 'email' | 'in_app' | 'slack' | 'webhook';
  integration_id: string | null;
  config: Record<string, unknown>;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
}

interface MockTemplate {
  id: string;
  event_type: string;
  channel_type: 'email' | 'in_app' | 'slack' | 'webhook';
  subject: string;
  body_template: string;
  is_active: boolean;
  created_at: string;
}

interface MockPreference {
  event_type: string;
  channel_id: string;
  enabled: boolean;
}

const validEventTypes = ['issue_created', 'issue_updated', 'issue_assigned', 'change_approved', 'request_submitted', 'sla_breach'];
const validChannelTypes = ['email', 'in_app', 'slack', 'webhook'];

describe('Notifications Routes', () => {
  let app: FastifyInstance;
  const notifications: MockNotification[] = [];
  const channels: MockChannel[] = [];
  const templates: MockTemplate[] = [];
  const preferences: MockPreference[] = [];
  let notificationIdCounter = 0;
  let channelIdCounter = 0;
  let templateIdCounter = 0;
  const userId = 'user-1';

  beforeAll(async () => {
    app = await createTestApp();

    // Initialize test notifications
    notifications.push(
      {
        id: `notif-${++notificationIdCounter}`,
        user_id: userId,
        event_type: 'issue_created',
        title: 'New Issue Created',
        message: 'Issue #123 has been created',
        entity_type: 'issue',
        entity_id: 'issue-123',
        is_read: false,
        created_at: new Date().toISOString(),
      },
      {
        id: `notif-${++notificationIdCounter}`,
        user_id: userId,
        event_type: 'issue_assigned',
        title: 'Issue Assigned',
        message: 'Issue #124 has been assigned to you',
        entity_type: 'issue',
        entity_id: 'issue-124',
        is_read: false,
        created_at: new Date().toISOString(),
      },
      {
        id: `notif-${++notificationIdCounter}`,
        user_id: userId,
        event_type: 'change_approved',
        title: 'Change Approved',
        message: 'Change #50 has been approved',
        entity_type: 'change',
        entity_id: 'change-50',
        is_read: true,
        created_at: new Date().toISOString(),
      }
    );

    // Initialize channels
    channels.push(
      {
        id: `channel-${++channelIdCounter}`,
        name: 'Email Notifications',
        type: 'email',
        integration_id: null,
        config: { smtp_enabled: true },
        is_default: true,
        is_active: true,
        created_at: new Date().toISOString(),
      },
      {
        id: `channel-${++channelIdCounter}`,
        name: 'In-App',
        type: 'in_app',
        integration_id: null,
        config: {},
        is_default: true,
        is_active: true,
        created_at: new Date().toISOString(),
      },
      {
        id: `channel-${++channelIdCounter}`,
        name: 'Slack Integration',
        type: 'slack',
        integration_id: 'int-slack-1',
        config: { channel: '#alerts' },
        is_default: false,
        is_active: true,
        created_at: new Date().toISOString(),
      }
    );

    // Initialize templates
    for (const eventType of validEventTypes) {
      for (const channelType of validChannelTypes) {
        templates.push({
          id: `template-${++templateIdCounter}`,
          event_type: eventType,
          channel_type: channelType as 'email' | 'in_app' | 'slack' | 'webhook',
          subject: `${eventType} - Notification`,
          body_template: `This is a ${eventType} notification`,
          is_active: true,
          created_at: new Date().toISOString(),
        });
      }
    }

    // GET /v1/notifications - List notifications
    app.get('/v1/notifications', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const query = request.query as {
        page?: string;
        per_page?: string;
        unread?: string;
        event_type?: string;
      };

      let filteredNotifications = notifications.filter(n => n.user_id === userId);

      if (query.unread === 'true') {
        filteredNotifications = filteredNotifications.filter(n => !n.is_read);
      }
      if (query.event_type) {
        filteredNotifications = filteredNotifications.filter(n => n.event_type === query.event_type);
      }

      const page = parseInt(query.page || '1');
      const perPage = parseInt(query.per_page || '20');
      const start = (page - 1) * perPage;
      const end = start + perPage;

      return {
        data: filteredNotifications.slice(start, end),
        meta: {
          page,
          per_page: perPage,
          total: filteredNotifications.length,
          total_pages: Math.ceil(filteredNotifications.length / perPage),
        },
      };
    });

    // GET /v1/notifications/unread-count
    app.get('/v1/notifications/unread-count', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const count = notifications.filter(n => n.user_id === userId && !n.is_read).length;
      return { count };
    });

    // POST /v1/notifications/:id/read
    app.post('/v1/notifications/:id/read', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const { id } = request.params as { id: string };

      // Validate UUID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(id) && !id.startsWith('notif-')) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Validation Error',
          message: 'Invalid notification ID format',
        });
      }

      const notification = notifications.find(n => n.id === id && n.user_id === userId);
      if (!notification) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: 'Notification not found',
        });
      }

      notification.is_read = true;
      return notification;
    });

    // POST /v1/notifications/mark-all-read
    app.post('/v1/notifications/mark-all-read', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      let count = 0;
      for (const notification of notifications) {
        if (notification.user_id === userId && !notification.is_read) {
          notification.is_read = true;
          count++;
        }
      }

      return { updated: count };
    });

    // DELETE /v1/notifications/:id
    app.delete('/v1/notifications/:id', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const { id } = request.params as { id: string };
      const index = notifications.findIndex(n => n.id === id && n.user_id === userId);

      if (index === -1) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: 'Notification not found',
        });
      }

      notifications.splice(index, 1);
      reply.status(204).send();
    });

    // GET /v1/notifications/preferences
    app.get('/v1/notifications/preferences', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      return { data: preferences };
    });

    // PUT /v1/notifications/preferences
    app.put('/v1/notifications/preferences', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const body = request.body as {
        eventType?: string;
        channelId?: string;
        enabled?: boolean;
      };

      if (!body.eventType) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Validation Error',
          message: 'eventType is required',
        });
      }

      if (!body.channelId) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Validation Error',
          message: 'channelId is required',
        });
      }

      // Validate UUID format for channelId
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(body.channelId) && !body.channelId.startsWith('channel-')) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Validation Error',
          message: 'Invalid channelId format',
        });
      }

      const existingIndex = preferences.findIndex(
        p => p.event_type === body.eventType && p.channel_id === body.channelId
      );

      if (existingIndex >= 0) {
        preferences[existingIndex].enabled = body.enabled ?? true;
      } else {
        preferences.push({
          event_type: body.eventType,
          channel_id: body.channelId,
          enabled: body.enabled ?? true,
        });
      }

      return { success: true };
    });

    // GET /v1/notifications/channels
    app.get('/v1/notifications/channels', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      return { data: channels };
    });

    // POST /v1/notifications/channels
    app.post('/v1/notifications/channels', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const body = request.body as {
        name?: string;
        type?: string;
        integrationId?: string;
        config?: Record<string, unknown>;
        isDefault?: boolean;
      };

      if (!body.name || body.name.length < 1) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Validation Error',
          message: 'Name is required',
        });
      }

      if (!body.type || !validChannelTypes.includes(body.type)) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Validation Error',
          message: 'Valid type is required',
        });
      }

      const newChannel: MockChannel = {
        id: `channel-${++channelIdCounter}`,
        name: body.name,
        type: body.type as 'email' | 'in_app' | 'slack' | 'webhook',
        integration_id: body.integrationId || null,
        config: body.config || {},
        is_default: body.isDefault || false,
        is_active: true,
        created_at: new Date().toISOString(),
      };

      channels.push(newChannel);
      reply.status(201).send(newChannel);
    });

    // PUT /v1/notifications/channels/:id
    app.put('/v1/notifications/channels/:id', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const { id } = request.params as { id: string };
      const channelIndex = channels.findIndex(c => c.id === id);

      if (channelIndex === -1) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: 'Channel not found',
        });
      }

      const body = request.body as {
        name?: string;
        config?: Record<string, unknown>;
        isDefault?: boolean;
        isActive?: boolean;
      };

      if (body.name !== undefined) {
        channels[channelIndex].name = body.name;
      }
      if (body.config !== undefined) {
        channels[channelIndex].config = body.config;
      }
      if (body.isDefault !== undefined) {
        channels[channelIndex].is_default = body.isDefault;
      }
      if (body.isActive !== undefined) {
        channels[channelIndex].is_active = body.isActive;
      }

      return channels[channelIndex];
    });

    // GET /v1/notifications/templates
    app.get('/v1/notifications/templates', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      return { data: templates };
    });

    // PUT /v1/notifications/templates/:eventType/:channelType
    app.put('/v1/notifications/templates/:eventType/:channelType', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const { eventType, channelType } = request.params as { eventType: string; channelType: string };

      if (!validChannelTypes.includes(channelType)) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Validation Error',
          message: 'Invalid channel type',
        });
      }

      const templateIndex = templates.findIndex(
        t => t.event_type === eventType && t.channel_type === channelType
      );

      if (templateIndex === -1) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: 'Template not found',
        });
      }

      const body = request.body as {
        subject?: string;
        bodyTemplate?: string;
        isActive?: boolean;
      };

      if (body.subject !== undefined) {
        templates[templateIndex].subject = body.subject;
      }
      if (body.bodyTemplate !== undefined) {
        templates[templateIndex].body_template = body.bodyTemplate;
      }
      if (body.isActive !== undefined) {
        templates[templateIndex].is_active = body.isActive;
      }

      return templates[templateIndex];
    });

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /v1/notifications', () => {
    it('should list notifications', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/notifications',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toBeDefined();
      expect(body.meta).toBeDefined();
    });

    it('should filter unread notifications', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/notifications?unread=true',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.every((n: MockNotification) => !n.is_read)).toBe(true);
    });

    it('should filter by event type', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/notifications?event_type=issue_created',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.every((n: MockNotification) => n.event_type === 'issue_created')).toBe(true);
    });

    it('should support pagination', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/notifications?page=1&per_page=10',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.meta.page).toBe(1);
      expect(body.meta.per_page).toBe(10);
    });

    it('should return 401 without auth', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/notifications',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /v1/notifications/unread-count', () => {
    it('should return unread count', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/notifications/unread-count',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.count).toBeDefined();
      expect(typeof body.count).toBe('number');
    });

    it('should return 401 without auth', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/notifications/unread-count',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('POST /v1/notifications/:id/read', () => {
    it('should mark notification as read', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'POST',
        url: '/v1/notifications/notif-1/read',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.is_read).toBe(true);
    });

    it('should return 404 for non-existent notification', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'POST',
        url: '/v1/notifications/notif-999/read',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(404);
    });

    it('should return 401 without auth', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/notifications/notif-1/read',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('POST /v1/notifications/mark-all-read', () => {
    it('should mark all notifications as read', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'POST',
        url: '/v1/notifications/mark-all-read',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.updated).toBeDefined();
      expect(typeof body.updated).toBe('number');
    });

    it('should return 401 without auth', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/notifications/mark-all-read',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('DELETE /v1/notifications/:id', () => {
    it('should delete notification', async () => {
      const token = generateTestToken(app);
      // First add a notification to delete
      notifications.push({
        id: 'notif-to-delete',
        user_id: userId,
        event_type: 'test',
        title: 'Test',
        message: 'Test',
        entity_type: null,
        entity_id: null,
        is_read: false,
        created_at: new Date().toISOString(),
      });

      const response = await app.inject({
        method: 'DELETE',
        url: '/v1/notifications/notif-to-delete',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(204);
    });

    it('should return 404 for non-existent notification', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'DELETE',
        url: '/v1/notifications/notif-999',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(404);
    });

    it('should return 401 without auth', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/v1/notifications/notif-1',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /v1/notifications/preferences', () => {
    it('should list user preferences', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/notifications/preferences',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toBeDefined();
      expect(Array.isArray(body.data)).toBe(true);
    });

    it('should return 401 without auth', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/notifications/preferences',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('PUT /v1/notifications/preferences', () => {
    it('should update preference', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'PUT',
        url: '/v1/notifications/preferences',
        headers: createAuthHeader(token),
        payload: {
          eventType: 'issue_created',
          channelId: 'channel-1',
          enabled: false,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
    });

    it('should return 400 for missing eventType', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'PUT',
        url: '/v1/notifications/preferences',
        headers: createAuthHeader(token),
        payload: {
          channelId: 'channel-1',
          enabled: true,
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 for missing channelId', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'PUT',
        url: '/v1/notifications/preferences',
        headers: createAuthHeader(token),
        payload: {
          eventType: 'issue_created',
          enabled: true,
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 401 without auth', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/v1/notifications/preferences',
        payload: {
          eventType: 'issue_created',
          channelId: 'channel-1',
          enabled: true,
        },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /v1/notifications/channels', () => {
    it('should list channels', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/notifications/channels',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toBeDefined();
      expect(Array.isArray(body.data)).toBe(true);
    });

    it('should return 401 without auth', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/notifications/channels',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('POST /v1/notifications/channels', () => {
    it('should create a channel', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'POST',
        url: '/v1/notifications/channels',
        headers: createAuthHeader(token),
        payload: {
          name: 'Webhook Channel',
          type: 'webhook',
          config: { url: 'https://example.com/webhook' },
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.name).toBe('Webhook Channel');
      expect(body.type).toBe('webhook');
    });

    it('should return 400 for missing name', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'POST',
        url: '/v1/notifications/channels',
        headers: createAuthHeader(token),
        payload: {
          type: 'email',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 for invalid type', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'POST',
        url: '/v1/notifications/channels',
        headers: createAuthHeader(token),
        payload: {
          name: 'Test Channel',
          type: 'invalid',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 401 without auth', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/notifications/channels',
        payload: {
          name: 'Test',
          type: 'email',
        },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('PUT /v1/notifications/channels/:id', () => {
    it('should update channel', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'PUT',
        url: '/v1/notifications/channels/channel-1',
        headers: createAuthHeader(token),
        payload: {
          name: 'Updated Email Channel',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.name).toBe('Updated Email Channel');
    });

    it('should deactivate channel', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'PUT',
        url: '/v1/notifications/channels/channel-1',
        headers: createAuthHeader(token),
        payload: {
          isActive: false,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.is_active).toBe(false);
    });

    it('should return 404 for non-existent channel', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'PUT',
        url: '/v1/notifications/channels/channel-999',
        headers: createAuthHeader(token),
        payload: {
          name: 'Test',
        },
      });

      expect(response.statusCode).toBe(404);
    });

    it('should return 401 without auth', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/v1/notifications/channels/channel-1',
        payload: { name: 'Test' },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /v1/notifications/templates', () => {
    it('should list templates', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/notifications/templates',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toBeDefined();
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBeGreaterThan(0);
    });

    it('should return 401 without auth', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/notifications/templates',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('PUT /v1/notifications/templates/:eventType/:channelType', () => {
    it('should update template', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'PUT',
        url: '/v1/notifications/templates/issue_created/email',
        headers: createAuthHeader(token),
        payload: {
          subject: 'New Issue Alert',
          bodyTemplate: 'A new issue has been created: {{title}}',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.subject).toBe('New Issue Alert');
    });

    it('should deactivate template', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'PUT',
        url: '/v1/notifications/templates/issue_created/slack',
        headers: createAuthHeader(token),
        payload: {
          isActive: false,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.is_active).toBe(false);
    });

    it('should return 404 for non-existent template', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'PUT',
        url: '/v1/notifications/templates/unknown_event/email',
        headers: createAuthHeader(token),
        payload: {
          subject: 'Test',
        },
      });

      expect(response.statusCode).toBe(404);
    });

    it('should return 400 for invalid channel type', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'PUT',
        url: '/v1/notifications/templates/issue_created/invalid',
        headers: createAuthHeader(token),
        payload: {
          subject: 'Test',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 401 without auth', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/v1/notifications/templates/issue_created/email',
        payload: { subject: 'Test' },
      });

      expect(response.statusCode).toBe(401);
    });
  });
});
