import { z } from 'zod';

export const updateSettingsSchema = z.object({
  name: z.string().min(2).max(255).optional(),
  billingEmail: z.string().email().optional(),
  settings: z.object({
    timezone: z.string().max(100).optional(),
    dateFormat: z.string().max(50).optional(),
    theme: z.enum(['light', 'dark', 'system']).optional(),
    primaryColor: z.string().max(50).optional(),
    logoUrl: z.string().url().max(500).optional().nullable(),
    notifications: z.object({
      email: z.boolean().optional(),
      slack: z.boolean().optional(),
      slaBreachAlerts: z.boolean().optional(),
    }).optional(),
    security: z.object({
      require2FA: z.boolean().optional(),
      sessionTimeoutMinutes: z.number().int().min(5).max(1440).optional(),
      passwordPolicy: z.enum(['standard', 'strong', 'strict']).optional(),
    }).optional(),
    email: z.object({
      senderEmail: z.string().email().optional(),
      senderName: z.string().max(255).optional(),
      provider: z.enum(['sendgrid', 'ses', 'mailgun', 'smtp']).optional(),
    }).optional(),
  }).optional(),
});
