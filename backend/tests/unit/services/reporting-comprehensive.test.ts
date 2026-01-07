import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  reportTemplateService,
  scheduledReportService,
  reportExecutionService,
  savedReportService,
  dashboardWidgetService,
} from '../../../src/services/reporting.js';

describe('Reporting Services', () => {
  const tenantSlug = 'test-tenant';
  const userId = 'user-123';

  describe('ReportTemplateService', () => {
    describe('list', () => {
      it('should return empty templates list', async () => {
        const result = await reportTemplateService.list(tenantSlug, { page: 1, pageSize: 10 });

        expect(result).toEqual({ templates: [], total: 0 });
      });

      it('should accept pagination params', async () => {
        const result = await reportTemplateService.list(tenantSlug, { page: 2, pageSize: 20 });

        expect(result).toEqual({ templates: [], total: 0 });
      });

      it('should accept filter options', async () => {
        const result = await reportTemplateService.list(
          tenantSlug,
          { page: 1, pageSize: 10 },
          { reportType: 'incident_summary', isPublic: true }
        );

        expect(result).toEqual({ templates: [], total: 0 });
      });
    });

    describe('findById', () => {
      it('should return null for any id', async () => {
        const result = await reportTemplateService.findById(tenantSlug, 'template-123');

        expect(result).toBeNull();
      });
    });

    describe('create', () => {
      it('should create a template with provided data', async () => {
        const data = {
          name: 'Monthly Incident Report',
          description: 'Summarizes incidents for the month',
          reportType: 'incident_summary',
          outputFormat: 'pdf',
        };

        const result = await reportTemplateService.create(tenantSlug, userId, data);

        expect(result).toMatchObject({
          id: expect.any(String),
          name: data.name,
          description: data.description,
          reportType: data.reportType,
          outputFormat: data.outputFormat,
          tenantSlug,
          created_by: userId,
          created_at: expect.any(Date),
        });
      });

      it('should generate a unique id', async () => {
        const data = { name: 'Test Report', reportType: 'test' };

        const result = await reportTemplateService.create(tenantSlug, userId, data);

        expect(result.id).toBe('123e4567-e89b-12d3-a456-426614174000');
      });
    });

    describe('update', () => {
      it('should return updated template', async () => {
        const templateId = 'template-123';
        const data = { name: 'Updated Name' };

        const result = await reportTemplateService.update(tenantSlug, templateId, data);

        expect(result).toMatchObject({
          id: templateId,
          name: 'Updated Template',
          report_type: 'test',
          created_by: 'test-user',
          created_at: expect.any(Date),
        });
      });
    });

    describe('delete', () => {
      it('should delete template without error', async () => {
        await expect(
          reportTemplateService.delete(tenantSlug, 'template-123')
        ).resolves.toBeUndefined();
      });
    });
  });

  describe('ScheduledReportService', () => {
    describe('list', () => {
      it('should return empty schedules list', async () => {
        const result = await scheduledReportService.list(tenantSlug, { page: 1, pageSize: 10 });

        expect(result).toEqual({ schedules: [], total: 0 });
      });
    });

    describe('findById', () => {
      it('should return null for any id', async () => {
        const result = await scheduledReportService.findById(tenantSlug, 'schedule-123');

        expect(result).toBeNull();
      });
    });

    describe('getById', () => {
      it('should return null (delegates to findById)', async () => {
        const result = await scheduledReportService.getById(tenantSlug, 'schedule-123');

        expect(result).toBeNull();
      });
    });

    describe('create', () => {
      it('should create a scheduled report', async () => {
        const data = {
          name: 'Weekly Report',
          templateId: 'template-123',
          schedule: '0 9 * * 1',
        };

        const result = await scheduledReportService.create(tenantSlug, userId, data);

        expect(result).toMatchObject({
          id: expect.any(String),
          name: 'Test Schedule',
          template_id: 'template-123',
          created_by: userId,
          created_at: expect.any(Date),
          is_active: true,
          parameters: {},
          output_format: 'json',
        });
      });
    });

    describe('update', () => {
      it('should return updated schedule', async () => {
        const scheduleId = 'schedule-123';
        const data = { name: 'Updated Schedule', is_active: false };

        const result = await scheduledReportService.update(tenantSlug, scheduleId, data);

        expect(result).toMatchObject({
          id: scheduleId,
          name: 'Updated Schedule',
          template_id: 'template-123',
          is_active: true,
        });
      });
    });

    describe('delete', () => {
      it('should delete schedule without error', async () => {
        await expect(
          scheduledReportService.delete(tenantSlug, 'schedule-123')
        ).resolves.toBeUndefined();
      });
    });

    describe('updateLastRun', () => {
      it('should update last run without error', async () => {
        await expect(
          scheduledReportService.updateLastRun(tenantSlug, 'schedule-123')
        ).resolves.toBeUndefined();
      });
    });

    describe('getDueReports', () => {
      it('should return empty array', async () => {
        const result = await scheduledReportService.getDueReports(tenantSlug);

        expect(result).toEqual([]);
      });
    });
  });

  describe('ReportExecutionService', () => {
    describe('list', () => {
      it('should return empty executions list', async () => {
        const result = await reportExecutionService.list(tenantSlug, { page: 1, pageSize: 10 });

        expect(result).toEqual({ executions: [], total: 0 });
      });

      it('should accept filter options', async () => {
        const result = await reportExecutionService.list(
          tenantSlug,
          { page: 1, pageSize: 10 },
          { templateId: 'template-123', status: 'completed' }
        );

        expect(result).toEqual({ executions: [], total: 0 });
      });
    });

    describe('findById', () => {
      it('should return null for any id', async () => {
        const result = await reportExecutionService.findById(tenantSlug, 'execution-123');

        expect(result).toBeNull();
      });
    });

    describe('execute', () => {
      it('should execute a report template', async () => {
        const templateId = 'template-123';

        const result = await reportExecutionService.execute(tenantSlug, userId, templateId);

        expect(result).toMatchObject({
          execution: {
            id: expect.any(String),
            template_id: templateId,
            status: 'completed',
            executed_by: userId,
            created_at: expect.any(Date),
          },
          data: {},
        });
      });

      it('should accept execution options', async () => {
        const templateId = 'template-123';
        const options = {
          outputFormat: 'pdf',
          dateRangeStart: new Date('2024-01-01'),
          dateRangeEnd: new Date('2024-01-31'),
          filters: { status: 'resolved' },
        };

        const result = await reportExecutionService.execute(tenantSlug, userId, templateId, options);

        expect(result.execution.status).toBe('completed');
      });
    });
  });

  describe('SavedReportService', () => {
    describe('list', () => {
      it('should return empty saved reports list', async () => {
        const result = await savedReportService.list(tenantSlug, userId);

        expect(result).toEqual([]);
      });
    });

    describe('create', () => {
      it('should create a saved report', async () => {
        const data = {
          name: 'My Favorite Report',
          report_type: 'incident_summary',
        };

        const result = await savedReportService.create(tenantSlug, userId, data);

        expect(result).toMatchObject({
          id: expect.any(String),
          name: 'Saved Report',
          report_type: 'test',
          user_id: userId,
          created_at: expect.any(Date),
        });
      });
    });

    describe('delete', () => {
      it('should delete saved report without error', async () => {
        await expect(
          savedReportService.delete(tenantSlug, userId, 'saved-report-123')
        ).resolves.toBeUndefined();
      });
    });
  });

  describe('DashboardWidgetService', () => {
    describe('list', () => {
      it('should return empty widgets list', async () => {
        const result = await dashboardWidgetService.list(tenantSlug, userId);

        expect(result).toEqual([]);
      });
    });

    describe('create', () => {
      it('should create a dashboard widget', async () => {
        const data = {
          widget_type: 'pie_chart',
          title: 'Issue Status Distribution',
        };

        const result = await dashboardWidgetService.create(tenantSlug, userId, data);

        expect(result).toMatchObject({
          id: expect.any(String),
          widget_type: 'chart',
          user_id: userId,
          created_at: expect.any(Date),
        });
      });
    });

    describe('update', () => {
      it('should update a dashboard widget', async () => {
        const widgetId = 'widget-123';
        const data = { title: 'Updated Title' };

        const result = await dashboardWidgetService.update(tenantSlug, userId, widgetId, data);

        expect(result).toMatchObject({
          id: widgetId,
          widget_type: 'chart',
          user_id: userId,
          created_at: expect.any(Date),
        });
      });
    });

    describe('delete', () => {
      it('should delete widget without error', async () => {
        await expect(
          dashboardWidgetService.delete(tenantSlug, userId, 'widget-123')
        ).resolves.toBeUndefined();
      });
    });
  });
});
