import { z } from 'zod';

export const assetTypeEnum = z.enum(['hardware', 'software', 'network', 'cloud', 'virtual', 'other']);
export const assetCategoryEnum = z.enum([
  'server', 'workstation', 'laptop', 'mobile', 'printer', 'network_device',
  'storage', 'software_license', 'saas_subscription', 'virtual_machine',
  'container', 'database', 'application', 'other',
]);
export const assetStatusEnum = z.enum(['active', 'inactive', 'maintenance', 'retired', 'disposed', 'ordered', 'in_storage']);

export const listAssetsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  per_page: z.coerce.number().int().min(1).max(100).optional(),
  asset_type: assetTypeEnum.optional(),
  category: assetCategoryEnum.optional(),
  status: assetStatusEnum.optional(),
  search: z.string().max(200).optional(),
  q: z.string().max(200).optional(),
  owner_id: z.string().uuid().optional(),
  assigned_to_id: z.string().uuid().optional(),
  department: z.string().max(100).optional(),
});

export const assetIdSchema = z.object({
  id: z.string().uuid(),
});

export type ListAssetsQuery = z.infer<typeof listAssetsQuerySchema>;
export type AssetIdParam = z.infer<typeof assetIdSchema>;
