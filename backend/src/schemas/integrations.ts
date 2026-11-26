import { z } from 'zod';

export const updateApiKeySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional().nullable(),
  permissions: z.array(z.string()).optional(),
  rateLimit: z.number().int().min(1).max(100000).optional(),
  isActive: z.boolean().optional(),
  expiresAt: z.string().datetime().optional().nullable(),
  ipWhitelist: z.array(z.string()).optional(),
});

export const updateWebhookSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional().nullable(),
  url: z.string().url().max(2048).optional(),
  secret: z.string().max(255).optional().nullable(),
  events: z.array(z.string()).min(1).optional(),
  filters: z.record(z.any()).optional(),
  isActive: z.boolean().optional(),
  retryCount: z.number().int().min(0).max(10).optional(),
  retryDelay: z.number().int().min(1).max(3600).optional(),
  timeout: z.number().int().min(1).max(120).optional(),
  customHeaders: z.record(z.string()).optional(),
});

export const createIntegrationSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.string().min(1).max(50),
  description: z.string().max(500).optional(),
  config: z.record(z.any()).optional(),
  credentials: z.record(z.any()).optional(),
  syncEnabled: z.boolean().optional(),
  syncInterval: z.number().int().min(1).max(1440).optional(),
  syncDirection: z.enum(['inbound', 'outbound', 'both']).optional(),
  fieldMappings: z.record(z.any()).optional(),
});

export const updateIntegrationSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional().nullable(),
  config: z.record(z.any()).optional(),
  credentials: z.record(z.any()).optional(),
  isActive: z.boolean().optional(),
  syncEnabled: z.boolean().optional(),
  syncInterval: z.number().int().min(1).max(1440).optional(),
  syncDirection: z.enum(['inbound', 'outbound', 'both']).optional(),
  fieldMappings: z.record(z.any()).optional(),
});
