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


export type UpdateApiKeyInput = z.infer<typeof updateApiKeySchema>;
export type UpdateWebhookInput = z.infer<typeof updateWebhookSchema>;
export type CreateIntegrationInput = z.infer<typeof createIntegrationSchema>;
export type UpdateIntegrationInput = z.infer<typeof updateIntegrationSchema>;

export const validateApiKeySchema = z.object({ key: z.string().min(1).max(512) }).passthrough();

// API Key Schemas
export const createApiKeySchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  permissions: z.array(z.string()).optional(),
  rateLimit: z.number().int().min(1).max(100000).optional(),
  expiresAt: z.string().datetime().optional(),
  ipWhitelist: z.array(z.string()).optional(),
});


// Webhook Schemas
export const createWebhookSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  url: z.string().url().max(2048),
  secret: z.string().max(255).optional(),
  events: z.array(z.string()).min(1),
  filters: z.record(z.any()).optional(),
  retryCount: z.number().int().min(0).max(10).optional(),
  retryDelay: z.number().int().min(1).max(3600).optional(),
  timeout: z.number().int().min(1).max(120).optional(),
  customHeaders: z.record(z.string()).optional(),
});

export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;
export type CreateWebhookInput = z.infer<typeof createWebhookSchema>;
