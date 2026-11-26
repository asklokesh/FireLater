import { z } from 'zod';

export const updatePreferenceSchema = z.object({
  eventType: z.string(),
  channelId: z.string().uuid(),
  enabled: z.boolean(),
});

export const createChannelSchema = z.object({
  name: z.string().min(1).max(255),
  type: z.enum(['email', 'in_app', 'slack', 'webhook']),
  integrationId: z.string().uuid().optional(),
  config: z.record(z.unknown()).optional(),
  isDefault: z.boolean().optional(),
});

export const updateChannelSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  config: z.record(z.unknown()).optional(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export const updateTemplateSchema = z.object({
  subject: z.string().max(500).optional(),
  bodyTemplate: z.string().optional(),
  isActive: z.boolean().optional(),
});

// Parameter validation schemas
export const notificationIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const channelIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const templateParamSchema = z.object({
  eventType: z.string().min(1).max(100),
  channelType: z.enum(['email', 'in_app', 'slack', 'webhook']),
});

// Query parameter validation schema
export const listNotificationsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  per_page: z.coerce.number().int().min(1).max(100).optional(),
  unread: z.enum(['true', 'false']).optional(),
  event_type: z.string().max(100).optional(),
});
