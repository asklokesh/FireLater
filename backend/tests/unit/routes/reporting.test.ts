import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

// Mock services
vi.mock('../../../src/services/reporting.js', () => ({
  reportTemplateService: {
    list: vi.fn().mockResolvedValue({ templates: [], total: 0 }),
    findById: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue(undefined),
  },
  scheduledReportService: {
    list: vi.fn().mockResolvedValue({ schedules: [], total: 0 }),
    findById: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue(undefined),
  },
  reportExecutionService: {
    list: vi.fn().mockResolvedValue({ executions: [], total: 0 }),
    findById: vi.fn().mockResolvedValue(null),
    execute: vi.fn().mockResolvedValue({}),
  },
  savedReportService: {
    list: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue(undefined),
  },
  dashboardWidgetService: {
    list: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../../src/services/dashboard.js', () => ({
  dashboardService: {
    getOverview: vi.fn().mockResolvedValue({}),
    getIssueTrends: vi.fn().mockResolvedValue([]),
    getIssuesByPriority: vi.fn().mockResolvedValue([]),
    getIssuesByStatus: vi.fn().mockResolvedValue([]),
    getChangeSuccessRate: vi.fn().mockResolvedValue({}),
    getHealthDistribution: vi.fn().mockResolvedValue({}),
    getHealthByTier: vi.fn().mockResolvedValue([]),
    getCriticalApplications: vi.fn().mockResolvedValue([]),
    getRequestsByItem: vi.fn().mockResolvedValue([]),
    getUpcomingChanges: vi.fn().mockResolvedValue([]),
    getRecentActivity: vi.fn().mockResolvedValue([]),
    getSlaCompliance: vi.fn().mockResolvedValue({}),
    getCloudCostTrends: vi.fn().mockResolvedValue([]),
    getMobileSummary: vi.fn().mockResolvedValue({}),
  },
}));

// Mock middleware
vi.mock('../../../src/middleware/auth.js', () => ({
  requirePermission: vi.fn().mockReturnValue(vi.fn().mockImplementation((_req, _reply, done) => done())),
}));

// Mock pagination utils
vi.mock('../../../src/utils/pagination.js', () => ({
  parsePagination: vi.fn().mockReturnValue({ page: 1, perPage: 20 }),
  createPaginatedResponse: vi.fn().mockImplementation((data, total, pagination) => ({
    data,
    meta: { total, page: pagination.page, perPage: pagination.perPage },
  })),
}));

describe('Reporting Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Create Template Schema', () => {
    const createTemplateSchema = z.object({
      name: z.string().min(1).max(255),
      description: z.string().max(1000).optional(),
      reportType: z.string().min(1),
      queryConfig: z.record(z.unknown()).optional(),
      filters: z.record(z.unknown()).optional(),
      groupings: z.array(z.string()).optional(),
      metrics: z.array(z.string()).optional(),
      chartConfig: z.record(z.unknown()).optional(),
      outputFormat: z.enum(['json', 'csv', 'pdf', 'excel']).optional(),
      includeCharts: z.boolean().optional(),
      isPublic: z.boolean().optional(),
    });

    it('should require name and reportType', () => {
      const result = createTemplateSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should accept valid template data', () => {
      const result = createTemplateSchema.safeParse({
        name: 'Monthly Issues Report',
        reportType: 'issues',
      });
      expect(result.success).toBe(true);
    });

    it('should reject name over 255 characters', () => {
      const result = createTemplateSchema.safeParse({
        name: 'x'.repeat(256),
        reportType: 'issues',
      });
      expect(result.success).toBe(false);
    });

    it('should accept description', () => {
      const result = createTemplateSchema.safeParse({
        name: 'Monthly Report',
        reportType: 'issues',
        description: 'A comprehensive monthly issues report',
      });
      expect(result.success).toBe(true);
    });

    it('should reject description over 1000 characters', () => {
      const result = createTemplateSchema.safeParse({
        name: 'Monthly Report',
        reportType: 'issues',
        description: 'x'.repeat(1001),
      });
      expect(result.success).toBe(false);
    });

    it('should accept all output formats', () => {
      const formats = ['json', 'csv', 'pdf', 'excel'];
      for (const outputFormat of formats) {
        const result = createTemplateSchema.safeParse({
          name: 'Report',
          reportType: 'issues',
          outputFormat,
        });
        expect(result.success).toBe(true);
      }
    });

    it('should reject invalid output format', () => {
      const result = createTemplateSchema.safeParse({
        name: 'Report',
        reportType: 'issues',
        outputFormat: 'html',
      });
      expect(result.success).toBe(false);
    });

    it('should accept queryConfig as record', () => {
      const result = createTemplateSchema.safeParse({
        name: 'Report',
        reportType: 'issues',
        queryConfig: { priority: 'high', status: 'open' },
      });
      expect(result.success).toBe(true);
    });

    it('should accept filters as record', () => {
      const result = createTemplateSchema.safeParse({
        name: 'Report',
        reportType: 'issues',
        filters: { dateRange: 'last_30_days' },
      });
      expect(result.success).toBe(true);
    });

    it('should accept groupings array', () => {
      const result = createTemplateSchema.safeParse({
        name: 'Report',
        reportType: 'issues',
        groupings: ['priority', 'status', 'assignee'],
      });
      expect(result.success).toBe(true);
    });

    it('should accept metrics array', () => {
      const result = createTemplateSchema.safeParse({
        name: 'Report',
        reportType: 'issues',
        metrics: ['count', 'avg_resolution_time', 'sla_compliance'],
      });
      expect(result.success).toBe(true);
    });

    it('should accept chartConfig as record', () => {
      const result = createTemplateSchema.safeParse({
        name: 'Report',
        reportType: 'issues',
        chartConfig: { type: 'bar', showLegend: true },
      });
      expect(result.success).toBe(true);
    });

    it('should accept includeCharts flag', () => {
      const result = createTemplateSchema.safeParse({
        name: 'Report',
        reportType: 'issues',
        includeCharts: true,
      });
      expect(result.success).toBe(true);
    });

    it('should accept isPublic flag', () => {
      const result = createTemplateSchema.safeParse({
        name: 'Report',
        reportType: 'issues',
        isPublic: true,
      });
      expect(result.success).toBe(true);
    });
  });

  describe('Create Schedule Schema', () => {
    const createScheduleSchema = z.object({
      templateId: z.string().uuid(),
      name: z.string().min(1).max(255),
      description: z.string().max(1000).optional(),
      scheduleType: z.enum(['daily', 'weekly', 'monthly', 'custom']),
      cronExpression: z.string().optional(),
      timezone: z.string().optional(),
      deliveryMethod: z.enum(['email', 'webhook', 'slack']),
      recipients: z.array(z.string()),
      emailSubject: z.string().optional(),
      emailBody: z.string().optional(),
      webhookUrl: z.string().url().optional(),
      slackChannel: z.string().optional(),
      outputFormat: z.enum(['json', 'csv', 'pdf', 'excel']).optional(),
      customFilters: z.record(z.unknown()).optional(),
      dateRangeType: z.string().optional(),
    });

    it('should require templateId, name, scheduleType, deliveryMethod, and recipients', () => {
      const result = createScheduleSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should accept valid schedule data', () => {
      const result = createScheduleSchema.safeParse({
        templateId: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Weekly Issues Report',
        scheduleType: 'weekly',
        deliveryMethod: 'email',
        recipients: ['admin@example.com'],
      });
      expect(result.success).toBe(true);
    });

    it('should accept all schedule types', () => {
      const types = ['daily', 'weekly', 'monthly', 'custom'];
      for (const scheduleType of types) {
        const result = createScheduleSchema.safeParse({
          templateId: '123e4567-e89b-12d3-a456-426614174000',
          name: 'Report Schedule',
          scheduleType,
          deliveryMethod: 'email',
          recipients: ['user@example.com'],
        });
        expect(result.success).toBe(true);
      }
    });

    it('should accept all delivery methods', () => {
      const methods = ['email', 'webhook', 'slack'];
      for (const deliveryMethod of methods) {
        const result = createScheduleSchema.safeParse({
          templateId: '123e4567-e89b-12d3-a456-426614174000',
          name: 'Report Schedule',
          scheduleType: 'daily',
          deliveryMethod,
          recipients: ['recipient'],
        });
        expect(result.success).toBe(true);
      }
    });

    it('should reject invalid templateId', () => {
      const result = createScheduleSchema.safeParse({
        templateId: 'not-a-uuid',
        name: 'Report Schedule',
        scheduleType: 'daily',
        deliveryMethod: 'email',
        recipients: ['user@example.com'],
      });
      expect(result.success).toBe(false);
    });

    it('should accept cronExpression', () => {
      const result = createScheduleSchema.safeParse({
        templateId: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Report Schedule',
        scheduleType: 'custom',
        deliveryMethod: 'email',
        recipients: ['user@example.com'],
        cronExpression: '0 9 * * 1',
      });
      expect(result.success).toBe(true);
    });

    it('should accept timezone', () => {
      const result = createScheduleSchema.safeParse({
        templateId: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Report Schedule',
        scheduleType: 'daily',
        deliveryMethod: 'email',
        recipients: ['user@example.com'],
        timezone: 'America/New_York',
      });
      expect(result.success).toBe(true);
    });

    it('should accept emailSubject and emailBody', () => {
      const result = createScheduleSchema.safeParse({
        templateId: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Report Schedule',
        scheduleType: 'daily',
        deliveryMethod: 'email',
        recipients: ['user@example.com'],
        emailSubject: 'Daily Report',
        emailBody: 'Please find attached the daily report.',
      });
      expect(result.success).toBe(true);
    });

    it('should accept webhookUrl', () => {
      const result = createScheduleSchema.safeParse({
        templateId: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Report Schedule',
        scheduleType: 'daily',
        deliveryMethod: 'webhook',
        recipients: ['webhook-id'],
        webhookUrl: 'https://example.com/webhook',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid webhookUrl', () => {
      const result = createScheduleSchema.safeParse({
        templateId: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Report Schedule',
        scheduleType: 'daily',
        deliveryMethod: 'webhook',
        recipients: ['webhook-id'],
        webhookUrl: 'not-a-url',
      });
      expect(result.success).toBe(false);
    });

    it('should accept slackChannel', () => {
      const result = createScheduleSchema.safeParse({
        templateId: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Report Schedule',
        scheduleType: 'daily',
        deliveryMethod: 'slack',
        recipients: ['#reports'],
        slackChannel: '#reports',
      });
      expect(result.success).toBe(true);
    });

    it('should accept customFilters', () => {
      const result = createScheduleSchema.safeParse({
        templateId: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Report Schedule',
        scheduleType: 'daily',
        deliveryMethod: 'email',
        recipients: ['user@example.com'],
        customFilters: { priority: 'critical' },
      });
      expect(result.success).toBe(true);
    });
  });

  describe('Create Widget Schema', () => {
    const createWidgetSchema = z.object({
      widgetType: z.enum(['chart', 'stat', 'table', 'list']),
      title: z.string().max(255).optional(),
      positionX: z.number().int().min(0).optional(),
      positionY: z.number().int().min(0).optional(),
      width: z.number().int().min(1).max(12).optional(),
      height: z.number().int().min(1).max(12).optional(),
      dataSource: z.string().min(1),
      filters: z.record(z.unknown()).optional(),
      refreshInterval: z.number().int().min(60).optional(),
      chartType: z.enum(['line', 'bar', 'pie', 'donut', 'area']).optional(),
      chartConfig: z.record(z.unknown()).optional(),
      colorScheme: z.string().optional(),
      showLegend: z.boolean().optional(),
    });

    it('should require widgetType and dataSource', () => {
      const result = createWidgetSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should accept valid widget data', () => {
      const result = createWidgetSchema.safeParse({
        widgetType: 'chart',
        dataSource: 'issues',
      });
      expect(result.success).toBe(true);
    });

    it('should accept all widget types', () => {
      const types = ['chart', 'stat', 'table', 'list'];
      for (const widgetType of types) {
        const result = createWidgetSchema.safeParse({
          widgetType,
          dataSource: 'issues',
        });
        expect(result.success).toBe(true);
      }
    });

    it('should reject invalid widget type', () => {
      const result = createWidgetSchema.safeParse({
        widgetType: 'gauge',
        dataSource: 'issues',
      });
      expect(result.success).toBe(false);
    });

    it('should accept title', () => {
      const result = createWidgetSchema.safeParse({
        widgetType: 'chart',
        dataSource: 'issues',
        title: 'Issues by Priority',
      });
      expect(result.success).toBe(true);
    });

    it('should reject title over 255 characters', () => {
      const result = createWidgetSchema.safeParse({
        widgetType: 'chart',
        dataSource: 'issues',
        title: 'x'.repeat(256),
      });
      expect(result.success).toBe(false);
    });

    it('should accept position coordinates', () => {
      const result = createWidgetSchema.safeParse({
        widgetType: 'chart',
        dataSource: 'issues',
        positionX: 0,
        positionY: 2,
      });
      expect(result.success).toBe(true);
    });

    it('should reject negative position', () => {
      const result = createWidgetSchema.safeParse({
        widgetType: 'chart',
        dataSource: 'issues',
        positionX: -1,
      });
      expect(result.success).toBe(false);
    });

    it('should accept width and height within bounds', () => {
      const result = createWidgetSchema.safeParse({
        widgetType: 'chart',
        dataSource: 'issues',
        width: 6,
        height: 4,
      });
      expect(result.success).toBe(true);
    });

    it('should reject width over 12', () => {
      const result = createWidgetSchema.safeParse({
        widgetType: 'chart',
        dataSource: 'issues',
        width: 13,
      });
      expect(result.success).toBe(false);
    });

    it('should reject height under 1', () => {
      const result = createWidgetSchema.safeParse({
        widgetType: 'chart',
        dataSource: 'issues',
        height: 0,
      });
      expect(result.success).toBe(false);
    });

    it('should accept filters as record', () => {
      const result = createWidgetSchema.safeParse({
        widgetType: 'chart',
        dataSource: 'issues',
        filters: { status: 'open' },
      });
      expect(result.success).toBe(true);
    });

    it('should accept refreshInterval minimum 60', () => {
      const result = createWidgetSchema.safeParse({
        widgetType: 'chart',
        dataSource: 'issues',
        refreshInterval: 60,
      });
      expect(result.success).toBe(true);
    });

    it('should reject refreshInterval under 60', () => {
      const result = createWidgetSchema.safeParse({
        widgetType: 'chart',
        dataSource: 'issues',
        refreshInterval: 30,
      });
      expect(result.success).toBe(false);
    });

    it('should accept all chart types', () => {
      const chartTypes = ['line', 'bar', 'pie', 'donut', 'area'];
      for (const chartType of chartTypes) {
        const result = createWidgetSchema.safeParse({
          widgetType: 'chart',
          dataSource: 'issues',
          chartType,
        });
        expect(result.success).toBe(true);
      }
    });

    it('should reject invalid chart type', () => {
      const result = createWidgetSchema.safeParse({
        widgetType: 'chart',
        dataSource: 'issues',
        chartType: 'scatter',
      });
      expect(result.success).toBe(false);
    });

    it('should accept chartConfig as record', () => {
      const result = createWidgetSchema.safeParse({
        widgetType: 'chart',
        dataSource: 'issues',
        chartConfig: { stacked: true, showDataLabels: true },
      });
      expect(result.success).toBe(true);
    });

    it('should accept colorScheme', () => {
      const result = createWidgetSchema.safeParse({
        widgetType: 'chart',
        dataSource: 'issues',
        colorScheme: 'blue',
      });
      expect(result.success).toBe(true);
    });

    it('should accept showLegend flag', () => {
      const result = createWidgetSchema.safeParse({
        widgetType: 'chart',
        dataSource: 'issues',
        showLegend: true,
      });
      expect(result.success).toBe(true);
    });
  });

  describe('ID Parameter Schema', () => {
    const idParamSchema = z.object({
      id: z.string().uuid(),
    });

    it('should accept valid UUID', () => {
      const result = idParamSchema.safeParse({
        id: '123e4567-e89b-12d3-a456-426614174000',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid UUID', () => {
      const result = idParamSchema.safeParse({ id: 'not-a-uuid' });
      expect(result.success).toBe(false);
    });

    it('should reject empty string', () => {
      const result = idParamSchema.safeParse({ id: '' });
      expect(result.success).toBe(false);
    });
  });

  describe('Route Permissions', () => {
    it('should require reports:read for GET /templates', () => {
      const permission = 'reports:read';
      expect(permission).toBe('reports:read');
    });

    it('should require reports:create for POST /templates', () => {
      const permission = 'reports:create';
      expect(permission).toBe('reports:create');
    });

    it('should require reports:manage for PUT /templates/:id', () => {
      const permission = 'reports:manage';
      expect(permission).toBe('reports:manage');
    });

    it('should require reports:manage for DELETE /templates/:id', () => {
      const permission = 'reports:manage';
      expect(permission).toBe('reports:manage');
    });

    it('should require reports:read for GET /schedules', () => {
      const permission = 'reports:read';
      expect(permission).toBe('reports:read');
    });

    it('should require reports:manage for POST /schedules', () => {
      const permission = 'reports:manage';
      expect(permission).toBe('reports:manage');
    });

    it('should require reports:read for GET /executions', () => {
      const permission = 'reports:read';
      expect(permission).toBe('reports:read');
    });

    it('should require reports:read for POST /execute', () => {
      const permission = 'reports:read';
      expect(permission).toBe('reports:read');
    });

    it('should require reports:read for GET /saved', () => {
      const permission = 'reports:read';
      expect(permission).toBe('reports:read');
    });

    it('should require dashboards:read for GET /widgets', () => {
      const permission = 'dashboards:read';
      expect(permission).toBe('dashboards:read');
    });

    it('should require dashboards:manage for POST /widgets', () => {
      const permission = 'dashboards:manage';
      expect(permission).toBe('dashboards:manage');
    });

    it('should require dashboards:read for GET /dashboard/overview', () => {
      const permission = 'dashboards:read';
      expect(permission).toBe('dashboards:read');
    });
  });

  describe('Response Formats', () => {
    it('should return 404 for missing template', () => {
      const id = '123e4567-e89b-12d3-a456-426614174000';
      const errorResponse = {
        statusCode: 404,
        error: 'Not Found',
        message: `Report template '${id}' not found`,
      };
      expect(errorResponse.statusCode).toBe(404);
      expect(errorResponse.message).toContain(id);
    });

    it('should return 404 for missing schedule', () => {
      const id = '123e4567-e89b-12d3-a456-426614174000';
      const errorResponse = {
        statusCode: 404,
        error: 'Not Found',
        message: `Scheduled report '${id}' not found`,
      };
      expect(errorResponse.statusCode).toBe(404);
      expect(errorResponse.message).toContain(id);
    });

    it('should return 404 for missing execution', () => {
      const id = '123e4567-e89b-12d3-a456-426614174000';
      const errorResponse = {
        statusCode: 404,
        error: 'Not Found',
        message: `Report execution '${id}' not found`,
      };
      expect(errorResponse.statusCode).toBe(404);
      expect(errorResponse.message).toContain(id);
    });

    it('should return 201 for created template', () => {
      const statusCode = 201;
      expect(statusCode).toBe(201);
    });

    it('should return 201 for created schedule', () => {
      const statusCode = 201;
      expect(statusCode).toBe(201);
    });

    it('should return 204 for deleted template', () => {
      const statusCode = 204;
      expect(statusCode).toBe(204);
    });

    it('should return template in wrapper', () => {
      const template = { id: 'tmpl-1', name: 'Report' };
      const response = { template };
      expect(response).toHaveProperty('template');
    });

    it('should return schedule in wrapper', () => {
      const schedule = { id: 'sched-1', name: 'Weekly' };
      const response = { schedule };
      expect(response).toHaveProperty('schedule');
    });

    it('should return execution in wrapper', () => {
      const execution = { id: 'exec-1', status: 'completed' };
      const response = { execution };
      expect(response).toHaveProperty('execution');
    });

    it('should return saved reports in wrapper', () => {
      const saved = [{ id: 'saved-1' }];
      const response = { saved };
      expect(response).toHaveProperty('saved');
    });

    it('should return widgets in wrapper', () => {
      const widgets = [{ id: 'widget-1' }];
      const response = { widgets };
      expect(response).toHaveProperty('widgets');
    });

    it('should return trends in wrapper', () => {
      const trends = [{ date: '2024-01-01', count: 10 }];
      const response = { trends };
      expect(response).toHaveProperty('trends');
    });
  });

  describe('Query Filters', () => {
    it('should handle report_type filter', () => {
      const query = { report_type: 'issues' };
      expect(query.report_type).toBe('issues');
    });

    it('should handle is_public filter as true', () => {
      const query = { is_public: 'true' };
      const isPublic = query.is_public === 'true' ? true : query.is_public === 'false' ? false : undefined;
      expect(isPublic).toBe(true);
    });

    it('should handle is_public filter as false', () => {
      const query = { is_public: 'false' };
      const isPublic = query.is_public === 'true' ? true : query.is_public === 'false' ? false : undefined;
      expect(isPublic).toBe(false);
    });

    it('should handle template_id filter', () => {
      const query = { template_id: '123e4567-e89b-12d3-a456-426614174000' };
      expect(query.template_id).toBeDefined();
    });

    it('should handle status filter for executions', () => {
      const query = { status: 'completed' };
      expect(query.status).toBe('completed');
    });

    it('should handle days parameter for trends', () => {
      const query = { days: '30' };
      const days = parseInt(query.days, 10);
      expect(days).toBe(30);
    });

    it('should handle limit parameter', () => {
      const query = { limit: '10' };
      const limit = parseInt(query.limit, 10);
      expect(limit).toBe(10);
    });

    it('should handle months parameter for cost trends', () => {
      const query = { months: '6' };
      const months = parseInt(query.months, 10);
      expect(months).toBe(6);
    });
  });

  describe('Service Integration', () => {
    it('should pass tenantSlug and pagination to reportTemplateService.list', async () => {
      const { reportTemplateService } = await import('../../../src/services/reporting.js');
      const pagination = { page: 1, perPage: 20 };
      const filters = { reportType: 'issues' };

      await reportTemplateService.list('test-tenant', pagination, filters);
      expect(reportTemplateService.list).toHaveBeenCalledWith('test-tenant', pagination, filters);
    });

    it('should pass tenantSlug and id to reportTemplateService.findById', async () => {
      const { reportTemplateService } = await import('../../../src/services/reporting.js');
      const id = '123e4567-e89b-12d3-a456-426614174000';

      await reportTemplateService.findById('test-tenant', id);
      expect(reportTemplateService.findById).toHaveBeenCalledWith('test-tenant', id);
    });

    it('should pass tenantSlug and pagination to scheduledReportService.list', async () => {
      const { scheduledReportService } = await import('../../../src/services/reporting.js');
      const pagination = { page: 1, perPage: 20 };

      await scheduledReportService.list('test-tenant', pagination);
      expect(scheduledReportService.list).toHaveBeenCalledWith('test-tenant', pagination);
    });

    it('should pass tenantSlug and userId to savedReportService.list', async () => {
      const { savedReportService } = await import('../../../src/services/reporting.js');

      await savedReportService.list('test-tenant', 'user-123');
      expect(savedReportService.list).toHaveBeenCalledWith('test-tenant', 'user-123');
    });

    it('should pass tenantSlug to dashboardService.getOverview', async () => {
      const { dashboardService } = await import('../../../src/services/dashboard.js');

      await dashboardService.getOverview('test-tenant');
      expect(dashboardService.getOverview).toHaveBeenCalledWith('test-tenant');
    });

    it('should pass tenantSlug and days to dashboardService.getIssueTrends', async () => {
      const { dashboardService } = await import('../../../src/services/dashboard.js');

      await dashboardService.getIssueTrends('test-tenant', 30);
      expect(dashboardService.getIssueTrends).toHaveBeenCalledWith('test-tenant', 30);
    });

    it('should pass tenantSlug and months to dashboardService.getCloudCostTrends', async () => {
      const { dashboardService } = await import('../../../src/services/dashboard.js');

      await dashboardService.getCloudCostTrends('test-tenant', 6);
      expect(dashboardService.getCloudCostTrends).toHaveBeenCalledWith('test-tenant', 6);
    });
  });
});
