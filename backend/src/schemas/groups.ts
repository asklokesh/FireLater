import { z } from 'zod';

export const createGroupSchema = z.object({
  name: z.string().min(2).max(255),
  description: z.string().max(1000).optional(),
  type: z.enum(['team', 'department', 'distribution']).optional(),
  parentId: z.string().uuid().optional(),
  managerId: z.string().uuid().optional(),
  email: z.string().email().optional(),
  settings: z.record(z.unknown()).optional(),
});

export const updateGroupSchema = z.object({
  name: z.string().min(2).max(255).optional(),
  description: z.string().max(1000).optional(),
  type: z.enum(['team', 'department', 'distribution']).optional(),
  parentId: z.string().uuid().optional(),
  managerId: z.string().uuid().optional(),
  email: z.string().email().optional(),
  settings: z.record(z.unknown()).optional(),
});

export const addMemberSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(['member', 'lead']).optional(),
});

export const groupIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const groupMemberParamSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
});

export const listGroupsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  per_page: z.coerce.number().int().min(1).max(100).optional(),
  type: z.enum(['team', 'department', 'distribution']).optional(),
  search: z.string().max(200).optional(),
  q: z.string().max(200).optional(),
});
