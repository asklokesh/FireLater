import { describe, it, expect, beforeEach, vi } from 'vitest';
import { reportTemplateService } from '../../../src/services/reporting.js';
import { createTemplateSchema } from '../../../src/routes/reporting.js';

describe('Reporting Service', () => {
  describe('reportTemplateService', () => {
    it('should validate report template creation data', () => {
      const validData = {
        name: 'Test Report',
        reportType: 'incident_summary',
        outputFormat: 'pdf'
      };
      
      expect(() => createTemplateSchema.parse(validData)).not.toThrow();
    });

    it('should reject invalid report template data', () => {
      const invalidData = {
        name: '', // invalid - empty string
        reportType: 'incident_summary'
      };
      
      expect(() => createTemplateSchema.parse(invalidData)).toThrow();
    });

    it('should create a report template with valid data', async () => {
      const tenantSlug = 'test-tenant';
      const userId = 'user-123';
      const templateData = {
        name: 'Incident Report',
        description: 'Monthly incident summary',
        reportType: 'incident_summary',
        outputFormat: 'pdf'
      };

      const result = await reportTemplateService.create(tenantSlug, userId, templateData);
      
      expect(result).toMatchObject({
        name: templateData.name,
        description: templateData.description,
        reportType: templateData.reportType
      });
      expect(result.id).toBeDefined();
      expect(result.tenantSlug).toBe(tenantSlug);
    });
  });
});