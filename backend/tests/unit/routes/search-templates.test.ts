import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../src/middleware/auth.js', () => ({
  requirePermission: vi.fn((...p: string[]) => ({ perms: p })),
}));
vi.mock('../../../src/services/search/templates.js', () => ({
  listTemplates: vi.fn(),
  createTemplate: vi.fn(),
  updateTemplate: vi.fn(),
  deleteTemplate: vi.fn(),
}));

import {
  createTemplateBodySchema,
  updateTemplateBodySchema,
  templateIdParamsSchema,
  TEMPLATES_PERMISSION,
} from '../../../src/routes/search-templates.js';

describe('search-templates route schemas', () => {
  it('uses issues:read', () => {
    expect(TEMPLATES_PERMISSION).toBe('issues:read');
  });

  it('validates create body', () => {
    expect(createTemplateBodySchema.safeParse({ name: 'a', definition: {} }).success).toBe(true);
    expect(createTemplateBodySchema.safeParse({ name: '', definition: {} }).success).toBe(false);
    expect(createTemplateBodySchema.safeParse({ name: 'a'.repeat(101), definition: {} }).success).toBe(false);
    expect(
      createTemplateBodySchema.safeParse({
        name: 'a',
        definition: { filter: { op: 'and', conditions: [{ field: 'status', operator: 'eq', value: 'new' }] } },
      }).success
    ).toBe(true);
    expect(
      createTemplateBodySchema.safeParse({ name: 'a', definition: { filter: { op: 'bad', conditions: [] } } }).success
    ).toBe(false);
  });

  it('validates update body and ids', () => {
    expect(updateTemplateBodySchema.safeParse({ isShared: true }).success).toBe(true);
    expect(updateTemplateBodySchema.safeParse({ name: 'a'.repeat(101) }).success).toBe(false);
    expect(templateIdParamsSchema.safeParse({ id: 'nope' }).success).toBe(false);
    expect(templateIdParamsSchema.safeParse({ id: '33333333-3333-4333-8333-333333333333' }).success).toBe(true);
  });
});
