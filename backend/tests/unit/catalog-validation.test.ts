import { describe, it, expect } from 'vitest';
import { z } from 'zod';

// Import the schemas - we'll validate them directly
// These schemas mirror what's in catalog.ts
const fieldValidationSchema = z.object({
  minLength: z.number().int().min(0).max(10000).optional(),
  maxLength: z.number().int().min(0).max(10000).optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  pattern: z.string().max(500).optional(),
  customMessage: z.string().max(500).optional(),
}).strict();

const defaultValueSchema = z.union([
  z.string().max(1000),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(z.string().max(255)).max(100),
]);

const formFieldSchema = z.object({
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
  })).max(500).optional(),
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

const formSchemaSchema = z.object({
  fields: z.array(formFieldSchema).min(1).max(200),
  sections: z.array(z.object({
    name: z.string().min(1).max(255).regex(/^[a-zA-Z0-9_]+$/, 'Section name must be alphanumeric with underscores only'),
    label: z.string().min(1).max(255),
    fields: z.array(z.string().max(255)).min(1).max(50),
  })).max(50).optional(),
}).strict();

const createItemSchema = z.object({
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

describe('Catalog Validation Schemas', () => {
  describe('fieldValidationSchema', () => {
    it('should accept valid validation rules', () => {
      const valid = {
        minLength: 5,
        maxLength: 100,
        pattern: '^[a-zA-Z]+$',
        customMessage: 'Please enter only letters',
      };
      expect(() => fieldValidationSchema.parse(valid)).not.toThrow();
    });

    it('should reject negative minLength', () => {
      const invalid = { minLength: -1 };
      expect(() => fieldValidationSchema.parse(invalid)).toThrow();
    });

    it('should reject minLength > 10000', () => {
      const invalid = { minLength: 10001 };
      expect(() => fieldValidationSchema.parse(invalid)).toThrow();
    });

    it('should reject pattern longer than 500 chars', () => {
      const invalid = { pattern: 'a'.repeat(501) };
      expect(() => fieldValidationSchema.parse(invalid)).toThrow();
    });

    it('should reject extra properties with .strict()', () => {
      const invalid = { minLength: 5, extraField: 'not allowed' };
      expect(() => fieldValidationSchema.parse(invalid)).toThrow();
    });
  });

  describe('defaultValueSchema', () => {
    it('should accept string defaults', () => {
      expect(() => defaultValueSchema.parse('default text')).not.toThrow();
    });

    it('should accept number defaults', () => {
      expect(() => defaultValueSchema.parse(42)).not.toThrow();
    });

    it('should accept boolean defaults', () => {
      expect(() => defaultValueSchema.parse(true)).not.toThrow();
    });

    it('should accept null defaults', () => {
      expect(() => defaultValueSchema.parse(null)).not.toThrow();
    });

    it('should accept array of strings for multi-select', () => {
      expect(() => defaultValueSchema.parse(['option1', 'option2'])).not.toThrow();
    });

    it('should reject string longer than 1000 chars', () => {
      const longString = 'a'.repeat(1001);
      expect(() => defaultValueSchema.parse(longString)).toThrow();
    });

    it('should reject array with more than 100 items', () => {
      const largeArray = Array(101).fill('option');
      expect(() => defaultValueSchema.parse(largeArray)).toThrow();
    });

    it('should reject array items longer than 255 chars', () => {
      const invalidArray = ['a'.repeat(256)];
      expect(() => defaultValueSchema.parse(invalidArray)).toThrow();
    });

    it('should reject objects (XSS prevention)', () => {
      const invalid = { __proto__: { polluted: true } };
      expect(() => defaultValueSchema.parse(invalid)).toThrow();
    });

    it('should reject arrays with non-string items', () => {
      const invalid = [1, 2, 3];
      expect(() => defaultValueSchema.parse(invalid)).toThrow();
    });
  });

  describe('formFieldSchema', () => {
    it('should accept valid field with all properties', () => {
      const valid = {
        name: 'employee_name',
        label: 'Employee Name',
        type: 'text' as const,
        required: true,
        placeholder: 'Enter your name',
        helpText: 'Full legal name',
        defaultValue: 'John Doe',
        validation: {
          minLength: 2,
          maxLength: 100,
        },
      };
      expect(() => formFieldSchema.parse(valid)).not.toThrow();
    });

    it('should reject field name with special characters', () => {
      const invalid = {
        name: 'field-name!',
        label: 'Field',
        type: 'text' as const,
      };
      expect(() => formFieldSchema.parse(invalid)).toThrow(/alphanumeric with underscores only/);
    });

    it('should reject field name with spaces', () => {
      const invalid = {
        name: 'field name',
        label: 'Field',
        type: 'text' as const,
      };
      expect(() => formFieldSchema.parse(invalid)).toThrow();
    });

    it('should accept field with conditional logic', () => {
      const valid = {
        name: 'department',
        label: 'Department',
        type: 'select' as const,
        conditional: {
          field: 'is_employee',
          operator: 'equals' as const,
          value: true,
        },
      };
      expect(() => formFieldSchema.parse(valid)).not.toThrow();
    });

    it('should reject more than 500 options (DoS prevention)', () => {
      const invalid = {
        name: 'country',
        label: 'Country',
        type: 'select' as const,
        options: Array(501).fill({ value: 'US', label: 'United States' }),
      };
      expect(() => formFieldSchema.parse(invalid)).toThrow();
    });

    it('should reject extra properties with .strict()', () => {
      const invalid = {
        name: 'field1',
        label: 'Field 1',
        type: 'text' as const,
        extraProp: 'not allowed',
      };
      expect(() => formFieldSchema.parse(invalid)).toThrow();
    });

    it('should accept all valid field types', () => {
      const types = [
        'text', 'textarea', 'email', 'phone', 'number', 'date', 'datetime',
        'select', 'multi_select', 'radio', 'checkbox', 'file',
        'user_picker', 'group_picker', 'application_picker'
      ];

      types.forEach(type => {
        const valid = {
          name: 'test_field',
          label: 'Test Field',
          type,
        };
        expect(() => formFieldSchema.parse(valid)).not.toThrow();
      });
    });
  });

  describe('formSchemaSchema', () => {
    it('should accept valid form schema', () => {
      const valid = {
        fields: [
          {
            name: 'first_name',
            label: 'First Name',
            type: 'text' as const,
          },
          {
            name: 'last_name',
            label: 'Last Name',
            type: 'text' as const,
          },
        ],
        sections: [
          {
            name: 'personal_info',
            label: 'Personal Information',
            fields: ['first_name', 'last_name'],
          },
        ],
      };
      expect(() => formSchemaSchema.parse(valid)).not.toThrow();
    });

    it('should reject form with no fields', () => {
      const invalid = {
        fields: [],
      };
      expect(() => formSchemaSchema.parse(invalid)).toThrow();
    });

    it('should reject more than 200 fields (DoS prevention)', () => {
      const invalid = {
        fields: Array(201).fill({
          name: 'field',
          label: 'Field',
          type: 'text',
        }),
      };
      expect(() => formSchemaSchema.parse(invalid)).toThrow();
    });

    it('should reject more than 50 sections (DoS prevention)', () => {
      const invalid = {
        fields: [{ name: 'field1', label: 'Field 1', type: 'text' as const }],
        sections: Array(51).fill({
          name: 'section',
          label: 'Section',
          fields: ['field1'],
        }),
      };
      expect(() => formSchemaSchema.parse(invalid)).toThrow();
    });

    it('should reject section with more than 50 fields (DoS prevention)', () => {
      const invalid = {
        fields: [{ name: 'field1', label: 'Field 1', type: 'text' as const }],
        sections: [
          {
            name: 'big_section',
            label: 'Big Section',
            fields: Array(51).fill('field1'),
          },
        ],
      };
      expect(() => formSchemaSchema.parse(invalid)).toThrow();
    });

    it('should reject section name with special characters', () => {
      const invalid = {
        fields: [{ name: 'field1', label: 'Field 1', type: 'text' as const }],
        sections: [
          {
            name: 'section-name!',
            label: 'Section',
            fields: ['field1'],
          },
        ],
      };
      expect(() => formSchemaSchema.parse(invalid)).toThrow(/alphanumeric with underscores only/);
    });

    it('should reject extra properties with .strict()', () => {
      const invalid = {
        fields: [{ name: 'field1', label: 'Field 1', type: 'text' as const }],
        extraProp: 'not allowed',
      };
      expect(() => formSchemaSchema.parse(invalid)).toThrow();
    });
  });

  describe('createItemSchema', () => {
    it('should accept valid catalog item', () => {
      const valid = {
        name: 'Laptop Request',
        shortDescription: 'Request a new laptop',
        description: 'Submit a request for a new laptop with your specifications',
        formSchema: {
          fields: [
            {
              name: 'laptop_model',
              label: 'Laptop Model',
              type: 'select' as const,
              options: [
                { value: 'mbp', label: 'MacBook Pro' },
                { value: 'dell', label: 'Dell XPS' },
              ],
            },
          ],
        },
        approvalRequired: true,
        expectedCompletionDays: 7,
        price: 1500,
        tags: ['hardware', 'it'],
        metadata: {
          department: 'IT',
          priority: 'high',
          autoApproveUnder: 1000,
        },
      };
      expect(() => createItemSchema.parse(valid)).not.toThrow();
    });

    it('should reject invalid UUID for categoryId', () => {
      const invalid = {
        name: 'Test Item',
        formSchema: {
          fields: [{ name: 'field1', label: 'Field 1', type: 'text' as const }],
        },
        categoryId: 'not-a-uuid',
      };
      expect(() => createItemSchema.parse(invalid)).toThrow();
    });

    it('should reject invalid URL for imageUrl', () => {
      const invalid = {
        name: 'Test Item',
        formSchema: {
          fields: [{ name: 'field1', label: 'Field 1', type: 'text' as const }],
        },
        imageUrl: 'not-a-url',
      };
      expect(() => createItemSchema.parse(invalid)).toThrow();
    });

    it('should reject expectedCompletionDays > 365', () => {
      const invalid = {
        name: 'Test Item',
        formSchema: {
          fields: [{ name: 'field1', label: 'Field 1', type: 'text' as const }],
        },
        expectedCompletionDays: 366,
      };
      expect(() => createItemSchema.parse(invalid)).toThrow();
    });

    it('should reject negative price', () => {
      const invalid = {
        name: 'Test Item',
        formSchema: {
          fields: [{ name: 'field1', label: 'Field 1', type: 'text' as const }],
        },
        price: -100,
      };
      expect(() => createItemSchema.parse(invalid)).toThrow();
    });

    it('should reject more than 50 tags (DoS prevention)', () => {
      const invalid = {
        name: 'Test Item',
        formSchema: {
          fields: [{ name: 'field1', label: 'Field 1', type: 'text' as const }],
        },
        tags: Array(51).fill('tag'),
      };
      expect(() => createItemSchema.parse(invalid)).toThrow();
    });

    it('should reject metadata with object values (XSS prevention)', () => {
      const invalid = {
        name: 'Test Item',
        formSchema: {
          fields: [{ name: 'field1', label: 'Field 1', type: 'text' as const }],
        },
        metadata: {
          nested: { object: 'not allowed' },
        },
      };
      expect(() => createItemSchema.parse(invalid)).toThrow();
    });

    it('should accept metadata with primitive values', () => {
      const valid = {
        name: 'Test Item',
        formSchema: {
          fields: [{ name: 'field1', label: 'Field 1', type: 'text' as const }],
        },
        metadata: {
          stringValue: 'text',
          numberValue: 42,
          booleanValue: true,
          nullValue: null,
        },
      };
      expect(() => createItemSchema.parse(valid)).not.toThrow();
    });
  });

  describe('Security Tests', () => {
    it('should prevent prototype pollution via defaultValue', () => {
      const malicious = {
        name: 'malicious_field',
        label: 'Malicious',
        type: 'text' as const,
        defaultValue: { __proto__: { polluted: true } },
      };
      expect(() => formFieldSchema.parse(malicious)).toThrow();
    });

    it('should prevent script injection via field names', () => {
      const malicious = {
        name: '<script>alert("xss")</script>',
        label: 'Field',
        type: 'text' as const,
      };
      expect(() => formFieldSchema.parse(malicious)).toThrow();
    });

    it('should prevent DoS via excessive field count', () => {
      const malicious = {
        fields: Array(201).fill({
          name: 'field',
          label: 'Field',
          type: 'text',
        }),
      };
      expect(() => formSchemaSchema.parse(malicious)).toThrow();
    });

    it('should prevent DoS via excessive options count', () => {
      const malicious = {
        name: 'field',
        label: 'Field',
        type: 'select' as const,
        options: Array(501).fill({ value: 'x', label: 'X' }),
      };
      expect(() => formFieldSchema.parse(malicious)).toThrow();
    });

    it('should prevent SQL injection via field names', () => {
      const malicious = {
        name: "'; DROP TABLE users; --",
        label: 'Field',
        type: 'text' as const,
      };
      expect(() => formFieldSchema.parse(malicious)).toThrow();
    });
  });
});
