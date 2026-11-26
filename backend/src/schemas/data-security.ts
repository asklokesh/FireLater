import { z } from 'zod';

export const updateSettingsSchema = z.object({
  data_residency_region: z.string().max(50).optional(),
  encryption_key_id: z.string().max(255).nullable().optional(),
  pii_masking_enabled: z.boolean().optional(),
  pci_tokenization_enabled: z.boolean().optional(),
});

export const addClassificationSchema = z.object({
  table_name: z.string().max(100),
  field_name: z.string().max(100),
  classification: z.enum(['PII', 'PCI', 'NPI', 'SENSITIVE']),
  masking_strategy: z.enum(['full', 'partial', 'tokenize', 'hash']),
  unmask_permission: z.string().max(100).optional(),
});

export const unmaskSchema = z.object({
  table_name: z.string().max(100),
  field_name: z.string().max(100),
  entity_id: z.string().max(255),
  raw_value: z.string(),
  reason: z.string().max(1000).optional(),
});
