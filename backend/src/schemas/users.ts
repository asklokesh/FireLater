import { z } from 'zod';

export const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2).max(255),
  password: z.string().min(8).optional(),
  phone: z.string().max(50).optional(),
  timezone: z.string().max(100).optional(),
  status: z.enum(['active', 'inactive', 'pending']).optional(),
  roleIds: z.array(z.string().uuid()).optional(),
});

export const updateUserSchema = z.object({
  name: z.string().min(2).max(255).optional(),
  phone: z.string().max(50).optional(),
  timezone: z.string().max(100).optional(),
  status: z.enum(['active', 'inactive', 'pending']).optional(),
  avatarUrl: z.string().url().optional(),
  settings: z.record(z.unknown()).optional(),
});

export const assignRolesSchema = z.object({
  roleIds: z.array(z.string().uuid()),
});

export const userIdParamSchema = z.object({
  id: z.string().uuid(),
});


export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type AssignRolesInput = z.infer<typeof assignRolesSchema>;
export type UserIdParamInput = z.infer<typeof userIdParamSchema>;
