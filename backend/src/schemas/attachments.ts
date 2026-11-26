import { z } from 'zod';

const entityType = z.string().min(1).max(100);

export const uploadUrlSchema = z.object({
  entityType,
  entityId: z.string().min(1).max(100),
  filename: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(255),
  fileSize: z.number().int().min(0),
}).passthrough();

export const confirmUploadSchema = uploadUrlSchema.extend({
  storageKey: z.string().min(1).max(1024),
  checksum: z.string().max(256).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type UploadUrlInput = z.infer<typeof uploadUrlSchema>;
export type ConfirmUploadInput = z.infer<typeof confirmUploadSchema>;
