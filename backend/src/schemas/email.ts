import { z } from 'zod';

export const emailConfigSchema = z.object({
  name: z.string().min(1).max(100),
  emailAddress: z.string().email(),
  provider: z.enum(['sendgrid', 'mailgun', 'postmark', 'smtp']),
  defaultPriority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  defaultApplicationId: z.string().uuid().optional(),
  defaultAssignedGroup: z.string().uuid().optional(),
  autoReplyEnabled: z.boolean().optional(),
  autoReplyTemplate: z.string().max(5000).optional(),
  spamFilterEnabled: z.boolean().optional(),
  allowedDomains: z.array(z.string()).optional(),
  blockedDomains: z.array(z.string()).optional(),
});

export const updateEmailConfigSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  isActive: z.boolean().optional(),
  defaultPriority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  defaultApplicationId: z.string().uuid().optional().nullable(),
  defaultAssignedGroup: z.string().uuid().optional().nullable(),
  autoReplyEnabled: z.boolean().optional(),
  autoReplyTemplate: z.string().max(5000).optional().nullable(),
  spamFilterEnabled: z.boolean().optional(),
  allowedDomains: z.array(z.string()).optional(),
  blockedDomains: z.array(z.string()).optional(),
});

export const sendgridInboundSchema = z.object({
  from: z.string(),
  to: z.string(),
  subject: z.string().optional(),
  text: z.string().optional(),
  html: z.string().optional(),
  sender_ip: z.string().optional(),
  envelope: z.string().optional(),
  headers: z.string().optional(),
  attachments: z.string().optional(),
});

export const mailgunInboundSchema = z.object({
  sender: z.string(),
  recipient: z.string(),
  subject: z.string().optional(),
  'body-plain': z.string().optional(),
  'body-html': z.string().optional(),
  'Message-Id': z.string().optional(),
  'In-Reply-To': z.string().optional(),
  References: z.string().optional(),
  // Signature fields for verification
  timestamp: z.string().optional(),
  token: z.string().optional(),
  signature: z.string().optional(),
});

export const genericInboundSchema = z.object({
  from: z.string(),
  fromName: z.string().optional(),
  to: z.string(),
  subject: z.string(),
  textBody: z.string().optional(),
  htmlBody: z.string().optional(),
  messageId: z.string().optional(),
  inReplyTo: z.string().optional(),
  references: z.array(z.string()).optional(),
});
