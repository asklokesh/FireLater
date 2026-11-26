import { z } from 'zod';

export const createRoleSchema = z.object({
  name: z.string().min(2).max(100).regex(/^[a-z_]+$/),
  displayName: z.string().min(2).max(255),
  description: z.string().max(1000).optional(),
  permissionIds: z.array(z.string().uuid()).optional(),
});

export const updateRoleSchema = z.object({
  displayName: z.string().min(2).max(255).optional(),
  description: z.string().max(1000).optional(),
  permissionIds: z.array(z.string().uuid()).optional(),
});

export const roleIdParamSchema = z.object({
  id: z.string().uuid(),
});
