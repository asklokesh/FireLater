import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { createTestApp, generateTestToken, createAuthHeader } from '../helpers.js';

// Mock data stores
interface MockReportTemplate {
  id: string;
  name: string;
  description?: string;
  reportType: string;
  queryConfig?: Record<string, unknown>;
  filters?: Record<string, unknown>;
  groupings?: string[];
  metrics?: string[];
  chartConfig?: Record<string, unknown>;
  outputFormat?: string;
  includeCharts?: boolean;
  isPublic?: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

interface MockScheduledReport {
  id: string;
  templateId: string;
  name: string;
  description?: string;
  scheduleType: string;
  cronExpression?: string;
  timezone?: string;
  deliveryMethod: string;
  recipients: string[];
  emailSubject?: string;
  emailBody?: string;
  webhookUrl?: string;
  slackChannel?: string;
  outputFormat?: string;
  customFilters?: Record<string, unknown>;
  dateRangeType?: string;
  isActive: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

interface MockReportExecution {
  id: string;
  templateId: string;
  status: string;
  startedAt: Date;
  completedAt?: Date;
  resultUrl?: string;
  errorMessage?: string;
  executedBy: string;
}

interface MockSavedReport {
  id: string;
  userId: string;
  name: string;
  description?: string;
  reportType: string;
  filters?: Record<string, unknown>;
  groupings?: string[];
  dateRangeType?: string;
  chartType?: string;
  sortBy?: string;
  sortOrder?: string;
  createdAt: Date;
}

interface MockDashboardWidget {
  id: string;
  userId: string;
  widgetType: string;
  title?: string;
  positionX: number;
  positionY: number;
  width: number;
  height: number;
  dataSource: string;
  filters?: Record<string, unknown>;
  refreshInterval?: number;
  chartType?: string;
  chartConfig?: Record<string, unknown>;
  colorScheme?: string;
  showLegend?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const templates: MockReportTemplate[] = [];
const schedules: MockScheduledReport[] = [];
const executions: MockReportExecution[] = [];
const savedReports: MockSavedReport[] = [];
const widgets: MockDashboardWidget[] = [];

function resetMockData() {
  templates.length = 0;
  schedules.length = 0;
  executions.length = 0;
  savedReports.length = 0;
  widgets.length = 0;
}

describe('Reporting Routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp();

    // ============================================
    // REPORT TEMPLATES
    // ============================================

    // List templates
    app.get('/v1/reporting/templates', async (request, reply) => {
      const query = request.query as Record<string, string>;
      const page = parseInt(query.page || '1', 10);
      const limit = parseInt(query.limit || '20', 10);

      let filtered = [...templates];

      if (query.report_type) {
        filtered = filtered.filter(t => t.reportType === query.report_type);
      }
      if (query.is_public === 'true') {
        filtered = filtered.filter(t => t.isPublic === true);
      } else if (query.is_public === 'false') {
        filtered = filtered.filter(t => t.isPublic === false);
      }

      const total = filtered.length;
      const start = (page - 1) * limit;
      const data = filtered.slice(start, start + limit);

      reply.send({
        data,
        meta: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      });
    });

    // Get template by ID
    app.get<{ Params: { id: string } }>('/v1/reporting/templates/:id', async (request, reply) => {
      const template = templates.find(t => t.id === request.params.id);
      if (!template) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Report template '${request.params.id}' not found`,
        });
      }
      reply.send({ template });
    });

    // Create template
    app.post('/v1/reporting/templates', async (request, reply) => {
      const body = request.body as Partial<MockReportTemplate>;

      if (!body.name || body.name.length === 0) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Name is required',
        });
      }

      if (!body.reportType || body.reportType.length === 0) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Report type is required',
        });
      }

      const template: MockReportTemplate = {
        id: `tpl-${Date.now()}`,
        name: body.name,
        description: body.description,
        reportType: body.reportType,
        queryConfig: body.queryConfig,
        filters: body.filters,
        groupings: body.groupings,
        metrics: body.metrics,
        chartConfig: body.chartConfig,
        outputFormat: body.outputFormat || 'json',
        includeCharts: body.includeCharts || false,
        isPublic: body.isPublic || false,
        createdBy: 'user-123',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      templates.push(template);
      reply.status(201).send({ template });
    });

    // Update template
    app.put<{ Params: { id: string } }>('/v1/reporting/templates/:id', async (request, reply) => {
      const index = templates.findIndex(t => t.id === request.params.id);
      if (index === -1) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Report template '${request.params.id}' not found`,
        });
      }

      const body = request.body as Partial<MockReportTemplate>;
      templates[index] = {
        ...templates[index],
        ...body,
        updatedAt: new Date(),
      };

      reply.send({ template: templates[index] });
    });

    // Delete template
    app.delete<{ Params: { id: string } }>('/v1/reporting/templates/:id', async (request, reply) => {
      const index = templates.findIndex(t => t.id === request.params.id);
      if (index === -1) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Report template '${request.params.id}' not found`,
        });
      }

      templates.splice(index, 1);
      reply.status(204).send();
    });

    // ============================================
    // SCHEDULED REPORTS
    // ============================================

    // List schedules
    app.get('/v1/reporting/schedules', async (request, reply) => {
      const query = request.query as Record<string, string>;
      const page = parseInt(query.page || '1', 10);
      const limit = parseInt(query.limit || '20', 10);

      const total = schedules.length;
      const start = (page - 1) * limit;
      const data = schedules.slice(start, start + limit);

      reply.send({
        data,
        meta: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      });
    });

    // Get schedule by ID
    app.get<{ Params: { id: string } }>('/v1/reporting/schedules/:id', async (request, reply) => {
      const schedule = schedules.find(s => s.id === request.params.id);
      if (!schedule) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Scheduled report '${request.params.id}' not found`,
        });
      }
      reply.send({ schedule });
    });

    // Create schedule
    app.post('/v1/reporting/schedules', async (request, reply) => {
      const body = request.body as Partial<MockScheduledReport>;

      if (!body.templateId) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Template ID is required',
        });
      }

      if (!body.name || body.name.length === 0) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Name is required',
        });
      }

      if (!body.scheduleType) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Schedule type is required',
        });
      }

      if (!['daily', 'weekly', 'monthly', 'custom'].includes(body.scheduleType)) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Invalid schedule type',
        });
      }

      if (!body.deliveryMethod) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Delivery method is required',
        });
      }

      if (!['email', 'webhook', 'slack'].includes(body.deliveryMethod)) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Invalid delivery method',
        });
      }

      const schedule: MockScheduledReport = {
        id: `sched-${Date.now()}`,
        templateId: body.templateId,
        name: body.name,
        description: body.description,
        scheduleType: body.scheduleType,
        cronExpression: body.cronExpression,
        timezone: body.timezone || 'UTC',
        deliveryMethod: body.deliveryMethod,
        recipients: body.recipients || [],
        emailSubject: body.emailSubject,
        emailBody: body.emailBody,
        webhookUrl: body.webhookUrl,
        slackChannel: body.slackChannel,
        outputFormat: body.outputFormat || 'pdf',
        customFilters: body.customFilters,
        dateRangeType: body.dateRangeType || 'last_30_days',
        isActive: true,
        createdBy: 'user-123',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      schedules.push(schedule);
      reply.status(201).send({ schedule });
    });

    // Update schedule
    app.put<{ Params: { id: string } }>('/v1/reporting/schedules/:id', async (request, reply) => {
      const index = schedules.findIndex(s => s.id === request.params.id);
      if (index === -1) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Scheduled report '${request.params.id}' not found`,
        });
      }

      const body = request.body as Partial<MockScheduledReport>;
      schedules[index] = {
        ...schedules[index],
        ...body,
        updatedAt: new Date(),
      };

      reply.send({ schedule: schedules[index] });
    });

    // Delete schedule
    app.delete<{ Params: { id: string } }>('/v1/reporting/schedules/:id', async (request, reply) => {
      const index = schedules.findIndex(s => s.id === request.params.id);
      if (index === -1) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Scheduled report '${request.params.id}' not found`,
        });
      }

      schedules.splice(index, 1);
      reply.status(204).send();
    });

    // ============================================
    // REPORT EXECUTIONS
    // ============================================

    // List executions
    app.get('/v1/reporting/executions', async (request, reply) => {
      const query = request.query as Record<string, string>;
      const page = parseInt(query.page || '1', 10);
      const limit = parseInt(query.limit || '20', 10);

      let filtered = [...executions];

      if (query.template_id) {
        filtered = filtered.filter(e => e.templateId === query.template_id);
      }
      if (query.status) {
        filtered = filtered.filter(e => e.status === query.status);
      }

      const total = filtered.length;
      const start = (page - 1) * limit;
      const data = filtered.slice(start, start + limit);

      reply.send({
        data,
        meta: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      });
    });

    // Get execution by ID
    app.get<{ Params: { id: string } }>('/v1/reporting/executions/:id', async (request, reply) => {
      const execution = executions.find(e => e.id === request.params.id);
      if (!execution) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Report execution '${request.params.id}' not found`,
        });
      }
      reply.send({ execution });
    });

    // Execute report
    app.post('/v1/reporting/execute', async (request, reply) => {
      const body = request.body as {
        templateId: string;
        outputFormat?: string;
        dateRangeStart?: string;
        dateRangeEnd?: string;
        filters?: Record<string, unknown>;
      };

      if (!body.templateId) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Template ID is required',
        });
      }

      const template = templates.find(t => t.id === body.templateId);
      if (!template) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Template '${body.templateId}' not found`,
        });
      }

      const execution: MockReportExecution = {
        id: `exec-${Date.now()}`,
        templateId: body.templateId,
        status: 'completed',
        startedAt: new Date(),
        completedAt: new Date(),
        resultUrl: `/reports/downloads/exec-${Date.now()}.${body.outputFormat || 'json'}`,
        executedBy: 'user-123',
      };

      executions.push(execution);
      reply.status(201).send({ execution });
    });

    // ============================================
    // SAVED REPORTS
    // ============================================

    // List saved reports
    app.get('/v1/reporting/saved', async (request, reply) => {
      const userSaved = savedReports.filter(s => s.userId === 'user-123');
      reply.send({ saved: userSaved });
    });

    // Create saved report
    app.post('/v1/reporting/saved', async (request, reply) => {
      const body = request.body as Partial<MockSavedReport>;

      if (!body.name || body.name.length === 0) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Name is required',
        });
      }

      if (!body.reportType || body.reportType.length === 0) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Report type is required',
        });
      }

      const saved: MockSavedReport = {
        id: `saved-${Date.now()}`,
        userId: 'user-123',
        name: body.name,
        description: body.description,
        reportType: body.reportType,
        filters: body.filters,
        groupings: body.groupings,
        dateRangeType: body.dateRangeType || 'last_30_days',
        chartType: body.chartType,
        sortBy: body.sortBy,
        sortOrder: body.sortOrder,
        createdAt: new Date(),
      };

      savedReports.push(saved);
      reply.status(201).send({ saved });
    });

    // Delete saved report
    app.delete<{ Params: { id: string } }>('/v1/reporting/saved/:id', async (request, reply) => {
      const index = savedReports.findIndex(s => s.id === request.params.id && s.userId === 'user-123');
      if (index === -1) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Saved report '${request.params.id}' not found`,
        });
      }

      savedReports.splice(index, 1);
      reply.status(204).send();
    });

    // ============================================
    // DASHBOARD WIDGETS
    // ============================================

    // List widgets
    app.get('/v1/reporting/widgets', async (request, reply) => {
      const userWidgets = widgets.filter(w => w.userId === 'user-123');
      reply.send({ widgets: userWidgets });
    });

    // Create widget
    app.post('/v1/reporting/widgets', async (request, reply) => {
      const body = request.body as Partial<MockDashboardWidget>;

      if (!body.widgetType) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Widget type is required',
        });
      }

      if (!['chart', 'stat', 'table', 'list'].includes(body.widgetType)) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Invalid widget type',
        });
      }

      if (!body.dataSource || body.dataSource.length === 0) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Data source is required',
        });
      }

      const widget: MockDashboardWidget = {
        id: `widget-${Date.now()}`,
        userId: 'user-123',
        widgetType: body.widgetType,
        title: body.title,
        positionX: body.positionX || 0,
        positionY: body.positionY || 0,
        width: body.width || 4,
        height: body.height || 2,
        dataSource: body.dataSource,
        filters: body.filters,
        refreshInterval: body.refreshInterval,
        chartType: body.chartType,
        chartConfig: body.chartConfig,
        colorScheme: body.colorScheme,
        showLegend: body.showLegend,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      widgets.push(widget);
      reply.status(201).send({ widget });
    });

    // Update widget
    app.put<{ Params: { id: string } }>('/v1/reporting/widgets/:id', async (request, reply) => {
      const index = widgets.findIndex(w => w.id === request.params.id && w.userId === 'user-123');
      if (index === -1) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Widget '${request.params.id}' not found`,
        });
      }

      const body = request.body as Partial<MockDashboardWidget>;
      widgets[index] = {
        ...widgets[index],
        ...body,
        updatedAt: new Date(),
      };

      reply.send({ widget: widgets[index] });
    });

    // Delete widget
    app.delete<{ Params: { id: string } }>('/v1/reporting/widgets/:id', async (request, reply) => {
      const index = widgets.findIndex(w => w.id === request.params.id && w.userId === 'user-123');
      if (index === -1) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Widget '${request.params.id}' not found`,
        });
      }

      widgets.splice(index, 1);
      reply.status(204).send();
    });

    // ============================================
    // DASHBOARD DATA ENDPOINTS
    // ============================================

    // Dashboard overview
    app.get('/v1/reporting/dashboard/overview', async (request, reply) => {
      reply.send({
        openIssues: 15,
        openChanges: 8,
        openRequests: 23,
        criticalApps: 2,
        slaBreaches: 1,
        recentActivity: [],
      });
    });

    // Issue trends
    app.get('/v1/reporting/dashboard/issues/trends', async (request, reply) => {
      const query = request.query as Record<string, string>;
      const days = parseInt(query.days || '30', 10);
      reply.send({
        trends: Array.from({ length: days }, (_, i) => ({
          date: new Date(Date.now() - i * 86400000).toISOString().split('T')[0],
          count: Math.floor(Math.random() * 10),
        })),
      });
    });

    // Issues by priority
    app.get('/v1/reporting/dashboard/issues/by-priority', async (request, reply) => {
      reply.send({
        data: [
          { priority: 'critical', count: 2 },
          { priority: 'high', count: 5 },
          { priority: 'medium', count: 8 },
          { priority: 'low', count: 12 },
        ],
      });
    });

    // Issues by status
    app.get('/v1/reporting/dashboard/issues/by-status', async (request, reply) => {
      reply.send({
        data: [
          { status: 'open', count: 15 },
          { status: 'in_progress', count: 8 },
          { status: 'resolved', count: 25 },
          { status: 'closed', count: 50 },
        ],
      });
    });

    // Change success rate
    app.get('/v1/reporting/dashboard/changes/success-rate', async (request, reply) => {
      reply.send({
        data: {
          total: 50,
          successful: 45,
          failed: 3,
          canceled: 2,
          successRate: 90,
        },
      });
    });

    // Health distribution
    app.get('/v1/reporting/dashboard/health/distribution', async (request, reply) => {
      reply.send({
        distribution: [
          { health: 'healthy', count: 80 },
          { health: 'warning', count: 15 },
          { health: 'critical', count: 5 },
        ],
      });
    });

    // Health by tier
    app.get('/v1/reporting/dashboard/health/by-tier', async (request, reply) => {
      reply.send({
        data: [
          { tier: 1, healthy: 20, warning: 2, critical: 1 },
          { tier: 2, healthy: 35, warning: 8, critical: 2 },
          { tier: 3, healthy: 25, warning: 5, critical: 2 },
        ],
      });
    });

    // Critical applications
    app.get('/v1/reporting/dashboard/health/critical', async (request, reply) => {
      const query = request.query as Record<string, string>;
      const limit = parseInt(query.limit || '5', 10);
      reply.send({
        apps: Array.from({ length: Math.min(limit, 3) }, (_, i) => ({
          id: `app-${i}`,
          name: `Critical App ${i + 1}`,
          healthStatus: 'critical',
          lastIncident: new Date().toISOString(),
        })),
      });
    });

    // Requests by item
    app.get('/v1/reporting/dashboard/requests/by-item', async (request, reply) => {
      reply.send({
        data: [
          { itemName: 'Laptop', count: 25 },
          { itemName: 'Software License', count: 18 },
          { itemName: 'Access Request', count: 15 },
        ],
      });
    });

    // Upcoming changes
    app.get('/v1/reporting/dashboard/changes/upcoming', async (request, reply) => {
      reply.send({
        changes: [
          { id: 'chg-1', title: 'Server Maintenance', scheduledDate: new Date().toISOString() },
          { id: 'chg-2', title: 'Database Upgrade', scheduledDate: new Date().toISOString() },
        ],
      });
    });

    // Recent activity
    app.get('/v1/reporting/dashboard/activity', async (request, reply) => {
      reply.send({
        activity: [
          { type: 'issue_created', description: 'New issue created', timestamp: new Date().toISOString() },
          { type: 'change_approved', description: 'Change approved', timestamp: new Date().toISOString() },
        ],
      });
    });

    // SLA compliance
    app.get('/v1/reporting/dashboard/sla', async (request, reply) => {
      reply.send({
        data: {
          overall: 95,
          byPriority: [
            { priority: 'critical', compliance: 92 },
            { priority: 'high', compliance: 95 },
            { priority: 'medium', compliance: 97 },
            { priority: 'low', compliance: 98 },
          ],
        },
      });
    });

    // Cloud cost trends
    app.get('/v1/reporting/dashboard/costs/trends', async (request, reply) => {
      const query = request.query as Record<string, string>;
      const months = parseInt(query.months || '6', 10);
      reply.send({
        trends: Array.from({ length: months }, (_, i) => ({
          month: new Date(Date.now() - i * 30 * 86400000).toISOString().substring(0, 7),
          cost: 5000 + Math.floor(Math.random() * 2000),
        })),
      });
    });

    // Mobile summary
    app.get('/v1/reporting/dashboard/mobile', async (request, reply) => {
      reply.send({
        openIssues: 15,
        criticalIssues: 2,
        pendingApprovals: 5,
        slaBreaches: 1,
      });
    });

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    resetMockData();
  });

  // ============================================
  // REPORT TEMPLATES TESTS
  // ============================================

  describe('Report Templates', () => {
    describe('GET /v1/reporting/templates', () => {
      it('should return empty list when no templates exist', async () => {
        const token = generateTestToken(app);
        const response = await app.inject({
          method: 'GET',
          url: '/v1/reporting/templates',
          headers: createAuthHeader(token),
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.data).toEqual([]);
        expect(body.meta.total).toBe(0);
      });

      it('should return paginated templates', async () => {
        // Create test templates
        templates.push({
          id: 'tpl-1',
          name: 'Monthly Report',
          reportType: 'issues',
          isPublic: true,
          createdBy: 'user-123',
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        templates.push({
          id: 'tpl-2',
          name: 'Weekly Summary',
          reportType: 'changes',
          isPublic: false,
          createdBy: 'user-123',
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        const token = generateTestToken(app);
        const response = await app.inject({
          method: 'GET',
          url: '/v1/reporting/templates?page=1&limit=10',
          headers: createAuthHeader(token),
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.data).toHaveLength(2);
        expect(body.meta.total).toBe(2);
      });

      it('should filter templates by report type', async () => {
        templates.push({
          id: 'tpl-1',
          name: 'Issues Report',
          reportType: 'issues',
          createdBy: 'user-123',
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        templates.push({
          id: 'tpl-2',
          name: 'Changes Report',
          reportType: 'changes',
          createdBy: 'user-123',
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        const token = generateTestToken(app);
        const response = await app.inject({
          method: 'GET',
          url: '/v1/reporting/templates?report_type=issues',
          headers: createAuthHeader(token),
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.data).toHaveLength(1);
        expect(body.data[0].reportType).toBe('issues');
      });

      it('should filter templates by public status', async () => {
        templates.push({
          id: 'tpl-1',
          name: 'Public Report',
          reportType: 'issues',
          isPublic: true,
          createdBy: 'user-123',
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        templates.push({
          id: 'tpl-2',
          name: 'Private Report',
          reportType: 'issues',
          isPublic: false,
          createdBy: 'user-123',
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        const token = generateTestToken(app);
        const response = await app.inject({
          method: 'GET',
          url: '/v1/reporting/templates?is_public=true',
          headers: createAuthHeader(token),
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.data).toHaveLength(1);
        expect(body.data[0].isPublic).toBe(true);
      });
    });

    describe('GET /v1/reporting/templates/:id', () => {
      it('should return template by ID', async () => {
        templates.push({
          id: 'tpl-123',
          name: 'Test Report',
          reportType: 'issues',
          createdBy: 'user-123',
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        const token = generateTestToken(app);
        const response = await app.inject({
          method: 'GET',
          url: '/v1/reporting/templates/tpl-123',
          headers: createAuthHeader(token),
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.template.id).toBe('tpl-123');
        expect(body.template.name).toBe('Test Report');
      });

      it('should return 404 for non-existent template', async () => {
        const token = generateTestToken(app);
        const response = await app.inject({
          method: 'GET',
          url: '/v1/reporting/templates/non-existent',
          headers: createAuthHeader(token),
        });

        expect(response.statusCode).toBe(404);
      });
    });

    describe('POST /v1/reporting/templates', () => {
      it('should create a new template', async () => {
        const token = generateTestToken(app);
        const response = await app.inject({
          method: 'POST',
          url: '/v1/reporting/templates',
          headers: createAuthHeader(token),
          payload: {
            name: 'New Report Template',
            reportType: 'issues',
            description: 'A test template',
            outputFormat: 'pdf',
            isPublic: true,
          },
        });

        expect(response.statusCode).toBe(201);
        const body = JSON.parse(response.body);
        expect(body.template.name).toBe('New Report Template');
        expect(body.template.reportType).toBe('issues');
        expect(body.template.outputFormat).toBe('pdf');
        expect(body.template.isPublic).toBe(true);
      });

      it('should reject template without name', async () => {
        const token = generateTestToken(app);
        const response = await app.inject({
          method: 'POST',
          url: '/v1/reporting/templates',
          headers: createAuthHeader(token),
          payload: {
            reportType: 'issues',
          },
        });

        expect(response.statusCode).toBe(400);
      });

      it('should reject template without report type', async () => {
        const token = generateTestToken(app);
        const response = await app.inject({
          method: 'POST',
          url: '/v1/reporting/templates',
          headers: createAuthHeader(token),
          payload: {
            name: 'Test Template',
          },
        });

        expect(response.statusCode).toBe(400);
      });
    });

    describe('PUT /v1/reporting/templates/:id', () => {
      it('should update an existing template', async () => {
        templates.push({
          id: 'tpl-update',
          name: 'Original Name',
          reportType: 'issues',
          createdBy: 'user-123',
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        const token = generateTestToken(app);
        const response = await app.inject({
          method: 'PUT',
          url: '/v1/reporting/templates/tpl-update',
          headers: createAuthHeader(token),
          payload: {
            name: 'Updated Name',
            description: 'Updated description',
          },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.template.name).toBe('Updated Name');
        expect(body.template.description).toBe('Updated description');
      });

      it('should return 404 for non-existent template', async () => {
        const token = generateTestToken(app);
        const response = await app.inject({
          method: 'PUT',
          url: '/v1/reporting/templates/non-existent',
          headers: createAuthHeader(token),
          payload: {
            name: 'Updated Name',
          },
        });

        expect(response.statusCode).toBe(404);
      });
    });

    describe('DELETE /v1/reporting/templates/:id', () => {
      it('should delete a template', async () => {
        templates.push({
          id: 'tpl-delete',
          name: 'To Delete',
          reportType: 'issues',
          createdBy: 'user-123',
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        const token = generateTestToken(app);
        const response = await app.inject({
          method: 'DELETE',
          url: '/v1/reporting/templates/tpl-delete',
          headers: createAuthHeader(token),
        });

        expect(response.statusCode).toBe(204);
        expect(templates.find(t => t.id === 'tpl-delete')).toBeUndefined();
      });

      it('should return 404 for non-existent template', async () => {
        const token = generateTestToken(app);
        const response = await app.inject({
          method: 'DELETE',
          url: '/v1/reporting/templates/non-existent',
          headers: createAuthHeader(token),
        });

        expect(response.statusCode).toBe(404);
      });
    });
  });

  // ============================================
  // SCHEDULED REPORTS TESTS
  // ============================================

  describe('Scheduled Reports', () => {
    describe('GET /v1/reporting/schedules', () => {
      it('should return empty list when no schedules exist', async () => {
        const token = generateTestToken(app);
        const response = await app.inject({
          method: 'GET',
          url: '/v1/reporting/schedules',
          headers: createAuthHeader(token),
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.data).toEqual([]);
      });

      it('should return paginated schedules', async () => {
        schedules.push({
          id: 'sched-1',
          templateId: 'tpl-1',
          name: 'Daily Report',
          scheduleType: 'daily',
          deliveryMethod: 'email',
          recipients: ['user@example.com'],
          isActive: true,
          createdBy: 'user-123',
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        const token = generateTestToken(app);
        const response = await app.inject({
          method: 'GET',
          url: '/v1/reporting/schedules',
          headers: createAuthHeader(token),
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.data).toHaveLength(1);
      });
    });

    describe('POST /v1/reporting/schedules', () => {
      it('should create a new schedule', async () => {
        const token = generateTestToken(app);
        const response = await app.inject({
          method: 'POST',
          url: '/v1/reporting/schedules',
          headers: createAuthHeader(token),
          payload: {
            templateId: 'tpl-123',
            name: 'Weekly Summary',
            scheduleType: 'weekly',
            deliveryMethod: 'email',
            recipients: ['team@example.com'],
            emailSubject: 'Weekly Report',
          },
        });

        expect(response.statusCode).toBe(201);
        const body = JSON.parse(response.body);
        expect(body.schedule.name).toBe('Weekly Summary');
        expect(body.schedule.scheduleType).toBe('weekly');
        expect(body.schedule.deliveryMethod).toBe('email');
      });

      it('should reject invalid schedule type', async () => {
        const token = generateTestToken(app);
        const response = await app.inject({
          method: 'POST',
          url: '/v1/reporting/schedules',
          headers: createAuthHeader(token),
          payload: {
            templateId: 'tpl-123',
            name: 'Test Schedule',
            scheduleType: 'invalid',
            deliveryMethod: 'email',
            recipients: [],
          },
        });

        expect(response.statusCode).toBe(400);
      });

      it('should reject invalid delivery method', async () => {
        const token = generateTestToken(app);
        const response = await app.inject({
          method: 'POST',
          url: '/v1/reporting/schedules',
          headers: createAuthHeader(token),
          payload: {
            templateId: 'tpl-123',
            name: 'Test Schedule',
            scheduleType: 'daily',
            deliveryMethod: 'carrier_pigeon',
            recipients: [],
          },
        });

        expect(response.statusCode).toBe(400);
      });
    });

    describe('PUT /v1/reporting/schedules/:id', () => {
      it('should update an existing schedule', async () => {
        schedules.push({
          id: 'sched-update',
          templateId: 'tpl-1',
          name: 'Original Schedule',
          scheduleType: 'daily',
          deliveryMethod: 'email',
          recipients: [],
          isActive: true,
          createdBy: 'user-123',
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        const token = generateTestToken(app);
        const response = await app.inject({
          method: 'PUT',
          url: '/v1/reporting/schedules/sched-update',
          headers: createAuthHeader(token),
          payload: {
            name: 'Updated Schedule',
            scheduleType: 'weekly',
          },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.schedule.name).toBe('Updated Schedule');
        expect(body.schedule.scheduleType).toBe('weekly');
      });
    });

    describe('DELETE /v1/reporting/schedules/:id', () => {
      it('should delete a schedule', async () => {
        schedules.push({
          id: 'sched-delete',
          templateId: 'tpl-1',
          name: 'To Delete',
          scheduleType: 'daily',
          deliveryMethod: 'email',
          recipients: [],
          isActive: true,
          createdBy: 'user-123',
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        const token = generateTestToken(app);
        const response = await app.inject({
          method: 'DELETE',
          url: '/v1/reporting/schedules/sched-delete',
          headers: createAuthHeader(token),
        });

        expect(response.statusCode).toBe(204);
      });
    });
  });

  // ============================================
  // REPORT EXECUTIONS TESTS
  // ============================================

  describe('Report Executions', () => {
    describe('GET /v1/reporting/executions', () => {
      it('should return empty list when no executions exist', async () => {
        const token = generateTestToken(app);
        const response = await app.inject({
          method: 'GET',
          url: '/v1/reporting/executions',
          headers: createAuthHeader(token),
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.data).toEqual([]);
      });

      it('should filter executions by template ID', async () => {
        executions.push({
          id: 'exec-1',
          templateId: 'tpl-1',
          status: 'completed',
          startedAt: new Date(),
          completedAt: new Date(),
          executedBy: 'user-123',
        });
        executions.push({
          id: 'exec-2',
          templateId: 'tpl-2',
          status: 'completed',
          startedAt: new Date(),
          completedAt: new Date(),
          executedBy: 'user-123',
        });

        const token = generateTestToken(app);
        const response = await app.inject({
          method: 'GET',
          url: '/v1/reporting/executions?template_id=tpl-1',
          headers: createAuthHeader(token),
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.data).toHaveLength(1);
        expect(body.data[0].templateId).toBe('tpl-1');
      });

      it('should filter executions by status', async () => {
        executions.push({
          id: 'exec-1',
          templateId: 'tpl-1',
          status: 'completed',
          startedAt: new Date(),
          executedBy: 'user-123',
        });
        executions.push({
          id: 'exec-2',
          templateId: 'tpl-1',
          status: 'failed',
          startedAt: new Date(),
          errorMessage: 'Error occurred',
          executedBy: 'user-123',
        });

        const token = generateTestToken(app);
        const response = await app.inject({
          method: 'GET',
          url: '/v1/reporting/executions?status=completed',
          headers: createAuthHeader(token),
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.data).toHaveLength(1);
        expect(body.data[0].status).toBe('completed');
      });
    });

    describe('POST /v1/reporting/execute', () => {
      it('should execute a report', async () => {
        templates.push({
          id: 'tpl-exec',
          name: 'Executable Report',
          reportType: 'issues',
          createdBy: 'user-123',
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        const token = generateTestToken(app);
        const response = await app.inject({
          method: 'POST',
          url: '/v1/reporting/execute',
          headers: createAuthHeader(token),
          payload: {
            templateId: 'tpl-exec',
            outputFormat: 'pdf',
          },
        });

        expect(response.statusCode).toBe(201);
        const body = JSON.parse(response.body);
        expect(body.execution.templateId).toBe('tpl-exec');
        expect(body.execution.status).toBe('completed');
      });

      it('should reject execution without template ID', async () => {
        const token = generateTestToken(app);
        const response = await app.inject({
          method: 'POST',
          url: '/v1/reporting/execute',
          headers: createAuthHeader(token),
          payload: {},
        });

        expect(response.statusCode).toBe(400);
      });

      it('should return 404 for non-existent template', async () => {
        const token = generateTestToken(app);
        const response = await app.inject({
          method: 'POST',
          url: '/v1/reporting/execute',
          headers: createAuthHeader(token),
          payload: {
            templateId: 'non-existent',
          },
        });

        expect(response.statusCode).toBe(404);
      });
    });
  });

  // ============================================
  // SAVED REPORTS TESTS
  // ============================================

  describe('Saved Reports', () => {
    describe('GET /v1/reporting/saved', () => {
      it('should return empty list when no saved reports exist', async () => {
        const token = generateTestToken(app);
        const response = await app.inject({
          method: 'GET',
          url: '/v1/reporting/saved',
          headers: createAuthHeader(token),
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.saved).toEqual([]);
      });
    });

    describe('POST /v1/reporting/saved', () => {
      it('should create a saved report', async () => {
        const token = generateTestToken(app);
        const response = await app.inject({
          method: 'POST',
          url: '/v1/reporting/saved',
          headers: createAuthHeader(token),
          payload: {
            name: 'My Favorite Report',
            reportType: 'issues',
            filters: { status: 'open' },
          },
        });

        expect(response.statusCode).toBe(201);
        const body = JSON.parse(response.body);
        expect(body.saved.name).toBe('My Favorite Report');
        expect(body.saved.reportType).toBe('issues');
      });

      it('should reject saved report without name', async () => {
        const token = generateTestToken(app);
        const response = await app.inject({
          method: 'POST',
          url: '/v1/reporting/saved',
          headers: createAuthHeader(token),
          payload: {
            reportType: 'issues',
          },
        });

        expect(response.statusCode).toBe(400);
      });
    });

    describe('DELETE /v1/reporting/saved/:id', () => {
      it('should delete a saved report', async () => {
        savedReports.push({
          id: 'saved-delete',
          userId: 'user-123',
          name: 'To Delete',
          reportType: 'issues',
          createdAt: new Date(),
        });

        const token = generateTestToken(app);
        const response = await app.inject({
          method: 'DELETE',
          url: '/v1/reporting/saved/saved-delete',
          headers: createAuthHeader(token),
        });

        expect(response.statusCode).toBe(204);
      });
    });
  });

  // ============================================
  // DASHBOARD WIDGETS TESTS
  // ============================================

  describe('Dashboard Widgets', () => {
    describe('GET /v1/reporting/widgets', () => {
      it('should return empty list when no widgets exist', async () => {
        const token = generateTestToken(app);
        const response = await app.inject({
          method: 'GET',
          url: '/v1/reporting/widgets',
          headers: createAuthHeader(token),
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.widgets).toEqual([]);
      });
    });

    describe('POST /v1/reporting/widgets', () => {
      it('should create a new widget', async () => {
        const token = generateTestToken(app);
        const response = await app.inject({
          method: 'POST',
          url: '/v1/reporting/widgets',
          headers: createAuthHeader(token),
          payload: {
            widgetType: 'chart',
            title: 'Issue Trends',
            dataSource: 'issues.trends',
            chartType: 'line',
            width: 6,
            height: 3,
          },
        });

        expect(response.statusCode).toBe(201);
        const body = JSON.parse(response.body);
        expect(body.widget.widgetType).toBe('chart');
        expect(body.widget.title).toBe('Issue Trends');
        expect(body.widget.dataSource).toBe('issues.trends');
      });

      it('should reject invalid widget type', async () => {
        const token = generateTestToken(app);
        const response = await app.inject({
          method: 'POST',
          url: '/v1/reporting/widgets',
          headers: createAuthHeader(token),
          payload: {
            widgetType: 'invalid',
            dataSource: 'issues.trends',
          },
        });

        expect(response.statusCode).toBe(400);
      });

      it('should reject widget without data source', async () => {
        const token = generateTestToken(app);
        const response = await app.inject({
          method: 'POST',
          url: '/v1/reporting/widgets',
          headers: createAuthHeader(token),
          payload: {
            widgetType: 'chart',
          },
        });

        expect(response.statusCode).toBe(400);
      });
    });

    describe('PUT /v1/reporting/widgets/:id', () => {
      it('should update a widget', async () => {
        widgets.push({
          id: 'widget-update',
          userId: 'user-123',
          widgetType: 'chart',
          dataSource: 'issues.trends',
          positionX: 0,
          positionY: 0,
          width: 4,
          height: 2,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        const token = generateTestToken(app);
        const response = await app.inject({
          method: 'PUT',
          url: '/v1/reporting/widgets/widget-update',
          headers: createAuthHeader(token),
          payload: {
            title: 'Updated Title',
            width: 8,
          },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.widget.title).toBe('Updated Title');
        expect(body.widget.width).toBe(8);
      });
    });

    describe('DELETE /v1/reporting/widgets/:id', () => {
      it('should delete a widget', async () => {
        widgets.push({
          id: 'widget-delete',
          userId: 'user-123',
          widgetType: 'stat',
          dataSource: 'issues.count',
          positionX: 0,
          positionY: 0,
          width: 2,
          height: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        const token = generateTestToken(app);
        const response = await app.inject({
          method: 'DELETE',
          url: '/v1/reporting/widgets/widget-delete',
          headers: createAuthHeader(token),
        });

        expect(response.statusCode).toBe(204);
      });
    });
  });

  // ============================================
  // DASHBOARD DATA ENDPOINTS TESTS
  // ============================================

  describe('Dashboard Data Endpoints', () => {
    describe('GET /v1/reporting/dashboard/overview', () => {
      it('should return dashboard overview', async () => {
        const token = generateTestToken(app);
        const response = await app.inject({
          method: 'GET',
          url: '/v1/reporting/dashboard/overview',
          headers: createAuthHeader(token),
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body).toHaveProperty('openIssues');
        expect(body).toHaveProperty('openChanges');
        expect(body).toHaveProperty('openRequests');
      });
    });

    describe('GET /v1/reporting/dashboard/issues/trends', () => {
      it('should return issue trends with default days', async () => {
        const token = generateTestToken(app);
        const response = await app.inject({
          method: 'GET',
          url: '/v1/reporting/dashboard/issues/trends',
          headers: createAuthHeader(token),
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.trends).toHaveLength(30);
      });

      it('should return issue trends with custom days', async () => {
        const token = generateTestToken(app);
        const response = await app.inject({
          method: 'GET',
          url: '/v1/reporting/dashboard/issues/trends?days=7',
          headers: createAuthHeader(token),
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.trends).toHaveLength(7);
      });
    });

    describe('GET /v1/reporting/dashboard/issues/by-priority', () => {
      it('should return issues grouped by priority', async () => {
        const token = generateTestToken(app);
        const response = await app.inject({
          method: 'GET',
          url: '/v1/reporting/dashboard/issues/by-priority',
          headers: createAuthHeader(token),
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.data).toBeInstanceOf(Array);
        expect(body.data.some((d: { priority: string }) => d.priority === 'critical')).toBe(true);
      });
    });

    describe('GET /v1/reporting/dashboard/issues/by-status', () => {
      it('should return issues grouped by status', async () => {
        const token = generateTestToken(app);
        const response = await app.inject({
          method: 'GET',
          url: '/v1/reporting/dashboard/issues/by-status',
          headers: createAuthHeader(token),
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.data).toBeInstanceOf(Array);
        expect(body.data.some((d: { status: string }) => d.status === 'open')).toBe(true);
      });
    });

    describe('GET /v1/reporting/dashboard/changes/success-rate', () => {
      it('should return change success rate', async () => {
        const token = generateTestToken(app);
        const response = await app.inject({
          method: 'GET',
          url: '/v1/reporting/dashboard/changes/success-rate',
          headers: createAuthHeader(token),
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.data).toHaveProperty('total');
        expect(body.data).toHaveProperty('successful');
        expect(body.data).toHaveProperty('successRate');
      });
    });

    describe('GET /v1/reporting/dashboard/health/distribution', () => {
      it('should return health distribution', async () => {
        const token = generateTestToken(app);
        const response = await app.inject({
          method: 'GET',
          url: '/v1/reporting/dashboard/health/distribution',
          headers: createAuthHeader(token),
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.distribution).toBeInstanceOf(Array);
      });
    });

    describe('GET /v1/reporting/dashboard/health/by-tier', () => {
      it('should return health by tier', async () => {
        const token = generateTestToken(app);
        const response = await app.inject({
          method: 'GET',
          url: '/v1/reporting/dashboard/health/by-tier',
          headers: createAuthHeader(token),
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.data).toBeInstanceOf(Array);
      });
    });

    describe('GET /v1/reporting/dashboard/health/critical', () => {
      it('should return critical applications with default limit', async () => {
        const token = generateTestToken(app);
        const response = await app.inject({
          method: 'GET',
          url: '/v1/reporting/dashboard/health/critical',
          headers: createAuthHeader(token),
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.apps).toBeInstanceOf(Array);
      });

      it('should return critical applications with custom limit', async () => {
        const token = generateTestToken(app);
        const response = await app.inject({
          method: 'GET',
          url: '/v1/reporting/dashboard/health/critical?limit=2',
          headers: createAuthHeader(token),
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.apps.length).toBeLessThanOrEqual(2);
      });
    });

    describe('GET /v1/reporting/dashboard/requests/by-item', () => {
      it('should return requests grouped by item', async () => {
        const token = generateTestToken(app);
        const response = await app.inject({
          method: 'GET',
          url: '/v1/reporting/dashboard/requests/by-item',
          headers: createAuthHeader(token),
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.data).toBeInstanceOf(Array);
      });
    });

    describe('GET /v1/reporting/dashboard/changes/upcoming', () => {
      it('should return upcoming changes', async () => {
        const token = generateTestToken(app);
        const response = await app.inject({
          method: 'GET',
          url: '/v1/reporting/dashboard/changes/upcoming',
          headers: createAuthHeader(token),
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.changes).toBeInstanceOf(Array);
      });
    });

    describe('GET /v1/reporting/dashboard/activity', () => {
      it('should return recent activity', async () => {
        const token = generateTestToken(app);
        const response = await app.inject({
          method: 'GET',
          url: '/v1/reporting/dashboard/activity',
          headers: createAuthHeader(token),
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.activity).toBeInstanceOf(Array);
      });
    });

    describe('GET /v1/reporting/dashboard/sla', () => {
      it('should return SLA compliance data', async () => {
        const token = generateTestToken(app);
        const response = await app.inject({
          method: 'GET',
          url: '/v1/reporting/dashboard/sla',
          headers: createAuthHeader(token),
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.data).toHaveProperty('overall');
        expect(body.data).toHaveProperty('byPriority');
      });
    });

    describe('GET /v1/reporting/dashboard/costs/trends', () => {
      it('should return cloud cost trends with default months', async () => {
        const token = generateTestToken(app);
        const response = await app.inject({
          method: 'GET',
          url: '/v1/reporting/dashboard/costs/trends',
          headers: createAuthHeader(token),
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.trends).toHaveLength(6);
      });

      it('should return cloud cost trends with custom months', async () => {
        const token = generateTestToken(app);
        const response = await app.inject({
          method: 'GET',
          url: '/v1/reporting/dashboard/costs/trends?months=3',
          headers: createAuthHeader(token),
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.trends).toHaveLength(3);
      });
    });

    describe('GET /v1/reporting/dashboard/mobile', () => {
      it('should return mobile summary', async () => {
        const token = generateTestToken(app);
        const response = await app.inject({
          method: 'GET',
          url: '/v1/reporting/dashboard/mobile',
          headers: createAuthHeader(token),
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body).toHaveProperty('openIssues');
        expect(body).toHaveProperty('criticalIssues');
        expect(body).toHaveProperty('pendingApprovals');
      });
    });
  });
});
