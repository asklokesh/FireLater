import { describe, it, expect } from 'vitest';
import { createApiKeySchema, createWebhookSchema } from '../../../src/routes/integrations.js';

describe('Integrations Service', () => {
  describe('API Key Validation', () => {
    it('should validate API key creation data', () => {
      const validData = {
        name: 'Test API Key',
        description: 'Key for testing',
        permissions: ['read', 'write'],
        rateLimit: 1000
      };
      
      expect(() => createApiKeySchema.parse(validData)).not.toThrow();
    });

    it('should reject invalid API key data', () => {
      const invalidData = {
        name: '', // invalid - empty string
        rateLimit: 1000000 // invalid - too high
      };
      
      expect(() => createApiKeySchema.parse(invalidData)).toThrow();
    });
  });

  describe('Webhook Validation', () => {
    it('should validate webhook creation data', () => {
      const validData = {
        name: 'Test Webhook',
        url: 'https://example.com/webhook',
        events: ['incident.created', 'incident.updated']
      };
      
      expect(() => createWebhookSchema.parse(validData)).not.toThrow();
    });

    it('should reject invalid webhook data', () => {
      const invalidData = {
        name: 'Test Webhook',
        url: 'invalid-url', // invalid URL
        events: [] // invalid - empty array
      };
      
      expect(() => createWebhookSchema.parse(invalidData)).toThrow();
    });
  });
});