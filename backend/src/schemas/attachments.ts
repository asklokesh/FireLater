import { z } from 'zod';

export const entityTypeEnum = z.enum(['issue', 'change', 'request', 'application', 'comment']);

export const uploadUrlRequestSchema = z.object({
  entityType: entityTypeEnum,
  entityId: z.string().uuid(),
  filename: z.string().min(1).max(500),
  mimeType: z.string().min(1).max(255),
  fileSize: z.number().int().positive().max(52428800, 'File size cannot exceed 50MB'),
});

export const confirmUploadRequestSchema = z.object({
  entityType: entityTypeEnum,
  entityId: z.string().uuid(),
  storageKey: z.string().min(1),
  filename: z.string().min(1).max(500),
  mimeType: z.string().min(1).max(255),
  fileSize: z.number().int().positive().max(52428800, 'File size cannot exceed 50MB'),
  checksum: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type UploadUrlRequestInput = z.infer<typeof uploadUrlRequestSchema>;
export type ConfirmUploadRequestInput = z.infer<typeof confirmUploadRequestSchema>;
