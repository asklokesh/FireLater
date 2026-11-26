import { z } from 'zod';

export const createCategorySchema = z.object({
  name: z.string().min(2).max(255),
  description: z.string().max(1000).optional(),
  icon: z.string().max(100).optional(),
  parentId: z.string().uuid().optional(),
  sortOrder: z.number().int().optional(),
  metadata: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
});

export const updateCategorySchema = z.object({
  name: z.string().min(2).max(255).optional(),
  description: z.string().max(1000).optional(),
  icon: z.string().max(100).optional(),
  parentId: z.string().uuid().optional().nullable(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
  metadata: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
});

export const fieldValidationSchema = z.object({
  minLength: z.number().int().min(0).max(10000).optional(),
  maxLength: z.number().int().min(0).max(10000).optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  pattern: z.string().max(500).optional(), // Regex pattern
  customMessage: z.string().max(500).optional(),
}).strict();

export const defaultValueSchema = z.union([
  z.string().max(1000),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(z.string().max(255)).max(100), // For multi-select defaults
]);

export const formFieldSchema = z.object({
  name: z.string().min(1).max(255).regex(/^[a-zA-Z0-9_]+$/, 'Field name must be alphanumeric with underscores only'),
  label: z.string().min(1).max(255),
  type: z.enum([
    'text', 'textarea', 'email', 'phone', 'number', 'date', 'datetime',
    'select', 'multi_select', 'radio', 'checkbox', 'file',
    'user_picker', 'group_picker', 'application_picker'
  ]),
  required: z.boolean().optional(),
  options: z.array(z.object({
    value: z.string().max(500),
    label: z.string().max(500),
  })).max(500).optional(), // Limit to 500 options to prevent DoS
  placeholder: z.string().max(500).optional(),
  helpText: z.string().max(2000).optional(),
  defaultValue: defaultValueSchema.optional(),
  validation: fieldValidationSchema.optional(),
  conditional: z.object({
    field: z.string().min(1).max(255),
    operator: z.enum(['equals', 'not_equals', 'contains', 'not_empty']),
    value: z.union([z.string().max(1000), z.number(), z.boolean(), z.null()]),
  }).optional(),
}).strict();

export const formSchemaSchema = z.object({
  fields: z.array(formFieldSchema).min(1).max(200), // Max 200 fields to prevent DoS
  sections: z.array(z.object({
    name: z.string().min(1).max(255).regex(/^[a-zA-Z0-9_]+$/, 'Section name must be alphanumeric with underscores only'),
    label: z.string().min(1).max(255),
    fields: z.array(z.string().max(255)).min(1).max(50), // Max 50 fields per section
  })).max(50).optional(), // Max 50 sections
}).strict();

export const createItemSchema = z.object({
  name: z.string().min(2).max(255),
  shortDescription: z.string().max(500).optional(),
  description: z.string().max(5000).optional(),
  categoryId: z.string().uuid().optional(),
  icon: z.string().max(100).optional(),
  imageUrl: z.string().url().max(2048).optional(),
  formSchema: formSchemaSchema,
  fulfillmentGroupId: z.string().uuid().optional(),
  approvalRequired: z.boolean().optional(),
  approvalGroupId: z.string().uuid().optional(),
  expectedCompletionDays: z.number().int().min(1).max(365).optional(),
  costCenter: z.string().max(100).optional(),
  price: z.number().min(0).max(999999999).optional(),
  tags: z.array(z.string().max(100)).max(50).optional(),
  metadata: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
});

export const updateItemSchema = z.object({
  name: z.string().min(2).max(255).optional(),
  shortDescription: z.string().max(500).optional(),
  description: z.string().max(5000).optional(),
  categoryId: z.string().uuid().optional().nullable(),
  icon: z.string().max(100).optional(),
  imageUrl: z.string().url().max(2048).optional(),
  formSchema: formSchemaSchema.optional(),
  fulfillmentGroupId: z.string().uuid().optional().nullable(),
  approvalRequired: z.boolean().optional(),
  approvalGroupId: z.string().uuid().optional().nullable(),
  expectedCompletionDays: z.number().int().min(1).max(365).optional(),
  costCenter: z.string().max(100).optional(),
  price: z.number().min(0).max(999999999).optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  tags: z.array(z.string().max(100)).max(50).optional(),
  metadata: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
});

export const categoryIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const itemIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const listCategoriesQuerySchema = z.object({
  include_inactive: z.enum(['true', 'false']).optional(),
});

export const listItemsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  per_page: z.coerce.number().int().min(1).max(100).optional(),
  category_id: z.string().uuid().optional(),
  search: z.string().max(200).optional(),
  q: z.string().max(200).optional(),
  is_active: z.enum(['true', 'false']).optional(),
  tags: z.string().max(1000).optional(), // Comma-separated tags
});


export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type FieldValidationInput = z.infer<typeof fieldValidationSchema>;
export type DefaultValueInput = z.infer<typeof defaultValueSchema>;
export type FormFieldInput = z.infer<typeof formFieldSchema>;
export type FormSchemaInput = z.infer<typeof formSchemaSchema>;
export type CreateItemInput = z.infer<typeof createItemSchema>;
export type UpdateItemInput = z.infer<typeof updateItemSchema>;
export type CategoryIdParamInput = z.infer<typeof categoryIdParamSchema>;
export type ItemIdParamInput = z.infer<typeof itemIdParamSchema>;
export type ListCategoriesQueryInput = z.infer<typeof listCategoriesQuerySchema>;
export type ListItemsQueryInput = z.infer<typeof listItemsQuerySchema>;
