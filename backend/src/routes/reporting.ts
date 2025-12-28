import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  reportTemplateService,
  scheduledReportService,
  reportExecutionService,
  savedReportService,
  dashboardWidgetService,
} from '../services/reporting.js';
import { dashboardService } from '../services/dashboard.js';
import { requirePermission } from '../middleware/auth.js';
import { parsePagination, createPaginatedResponse } from '../utils/pagination.js';

// ============================================
// SCHEMAS
// ============================================

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

export default async function reportingRoutes(app: FastifyInstance) {
  // ============================================
  // REPORT TEMPLATES
  // ============================================

  // List report templates
  app.get('/templates', {
    preHandler: [requirePermission('reports:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const query = request.query as Record<string, string>;
    const pagination = parsePagination(query);

    const { templates, total } = await reportTemplateService.list(tenantSlug, pagination, {
      reportType: query.report_type,
      isPublic: query.is_public === 'true' ? true : query.is_public === 'false' ? false : undefined,
    });
    reply.send(createPaginatedResponse(templates, total, pagination));
  });

  // Get report template
  app.get<{ Params: { id: string } }>('/templates/:id', {
    preHandler: [requirePermission('reports:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const template = await reportTemplateService.findById(tenantSlug, request.params.id);

    if (!template) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: `Report template '${request.params.id}' not found`,
      });
    }

    reply.send({ template });
  });

  // Create report template
  app.post('/templates', {
    preHandler: [requirePermission('reports:create')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const data = request.body as z.infer<typeof createTemplateSchema>;
    const template = await reportTemplateService.create(tenantSlug, userId, data);
    reply.status(201).send({ template });
  });

  // Update report template
  app.put<{ Params: { id: string } }>('/templates/:id', {
    preHandler: [requirePermission('reports:manage')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const data = request.body as Partial<z.infer<typeof createTemplateSchema>>;
    const template = await reportTemplateService.update(tenantSlug, request.params.id, data);
    reply.send({ template });
  });

  // Delete report template
  app.delete<{ Params: { id: string } }>('/templates/:id', {
    preHandler: [requirePermission('reports:manage')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    await reportTemplateService.delete(tenantSlug, request.params.id);
    reply.status(204).send();
  });

  // ============================================
  // SCHEDULED REPORTS
  // ============================================

  // List scheduled reports
  app.get('/schedules', {
    preHandler: [requirePermission('reports:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const query = request.query as Record<string, string>;
    const pagination = parsePagination(query);

    const { schedules, total } = await scheduledReportService.list(tenantSlug, pagination);
    reply.send(createPaginatedResponse(schedules, total, pagination));
  });

  // Get scheduled report
  app.get<{ Params: { id: string } }>('/schedules/:id', {
    preHandler: [requirePermission('reports:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const schedule = await scheduledReportService.findById(tenantSlug, request.params.id);

    if (!schedule) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: `Scheduled report '${request.params.id}' not found`,
      });
    }

    reply.send({ schedule });
  });

  // Create scheduled report
  app.post('/schedules', {
    preHandler: [requirePermission('reports:manage')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const data = request.body as z.infer<typeof createScheduleSchema>;
    const schedule = await scheduledReportService.create(tenantSlug, userId, data);
    reply.status(201).send({ schedule });
  });

  // Update scheduled report
  app.put<{ Params: { id: string } }>('/schedules/:id', {
    preHandler: [requirePermission('reports:manage')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const data = request.body as Partial<z.infer<typeof createScheduleSchema>>;
    const schedule = await scheduledReportService.update(tenantSlug, request.params.id, data);
    reply.send({ schedule });
  });

  // Delete scheduled report
  app.delete<{ Params: { id: string } }>('/schedules/:id', {
    preHandler: [requirePermission('reports:manage')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    await scheduledReportService.delete(tenantSlug, request.params.id);
    reply.status(204).send();
  });

  // ============================================
  // REPORT EXECUTIONS
  // ============================================

  // List report executions
  app.get('/executions', {
    preHandler: [requirePermission('reports:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const query = request.query as Record<string, string>;
    const pagination = parsePagination(query);

    const { executions, total } = await reportExecutionService.list(tenantSlug, pagination, {
      templateId: query.template_id,
      status: query.status,
    });
    reply.send(createPaginatedResponse(executions, total, pagination));
  });

  // Get report execution
  app.get<{ Params: { id: string } }>('/executions/:id', {
    preHandler: [requirePermission('reports:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const execution = await reportExecutionService.findById(tenantSlug, request.params.id);

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
  app.post('/execute', {
    preHandler: [requirePermission('reports:read')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const body = request.body as {
      templateId: string;
      outputFormat?: string;
      dateRangeStart?: string;
      dateRangeEnd?: string;
      filters?: Record<string, unknown>;
    };

    const result = await reportExecutionService.execute(tenantSlug, userId, body.templateId, {
      outputFormat: body.outputFormat,
      dateRangeStart: body.dateRangeStart ? new Date(body.dateRangeStart) : undefined,
      dateRangeEnd: body.dateRangeEnd ? new Date(body.dateRangeEnd) : undefined,
      filters: body.filters,
    });

    reply.status(201).send(result);
  });

  // ============================================
  // SAVED REPORTS (User bookmarks)
  // ============================================

  // List saved reports
  app.get('/saved', {
    preHandler: [requirePermission('reports:read')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const saved = await savedReportService.list(tenantSlug, userId);
    reply.send({ saved });
  });

  // Create saved report
  app.post('/saved', {
    preHandler: [requirePermission('reports:read')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const data = request.body as {
      name: string;
      description?: string;
      reportType: string;
      filters?: Record<string, unknown>;
      groupings?: string[];
      dateRangeType?: string;
      chartType?: string;
      sortBy?: string;
      sortOrder?: string;
    };

    const saved = await savedReportService.create(tenantSlug, userId, data);
    reply.status(201).send({ saved });
  });

  // Delete saved report
  app.delete<{ Params: { id: string } }>('/saved/:id', {
    preHandler: [requirePermission('reports:read')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    await savedReportService.delete(tenantSlug, userId, request.params.id);
    reply.status(204).send();
  });

  // ============================================
  // DASHBOARD WIDGETS
  // ============================================

  // List dashboard widgets
  app.get('/widgets', {
    preHandler: [requirePermission('dashboards:read')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const widgets = await dashboardWidgetService.list(tenantSlug, userId);
    reply.send({ widgets });
  });

  // Create dashboard widget
  app.post('/widgets', {
    preHandler: [requirePermission('dashboards:manage')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const data = request.body as z.infer<typeof createWidgetSchema>;
    const widget = await dashboardWidgetService.create(tenantSlug, userId, data);
    reply.status(201).send({ widget });
  });

  // Update dashboard widget
  app.put<{ Params: { id: string } }>('/widgets/:id', {
    preHandler: [requirePermission('dashboards:manage')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const data = request.body as Partial<z.infer<typeof createWidgetSchema>>;
    const widget = await dashboardWidgetService.update(tenantSlug, userId, request.params.id, data);
    reply.send({ widget });
  });

  // Delete dashboard widget
  app.delete<{ Params: { id: string } }>('/widgets/:id', {
    preHandler: [requirePermission('dashboards:manage')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    await dashboardWidgetService.delete(tenantSlug, userId, request.params.id);
    reply.status(204).send();
  });

  // ============================================
  // DASHBOARD DATA ENDPOINTS
  // ============================================

  // Get dashboard overview
  app.get('/dashboard/overview', {
    preHandler: [requirePermission('dashboards:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const overview = await dashboardService.getOverview(tenantSlug);
    reply.send(overview);
  });

  // Get issue trends
  app.get<{ Querystring: { days?: string } }>('/dashboard/issues/trends', {
    preHandler: [requirePermission('dashboards:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const days = request.query.days ? parseInt(request.query.days, 10) : 30;
    const trends = await dashboardService.getIssueTrends(tenantSlug, days);
    reply.send({ trends });
  });

  // Get issues by priority
  app.get('/dashboard/issues/by-priority', {
    preHandler: [requirePermission('dashboards:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const data = await dashboardService.getIssuesByPriority(tenantSlug);
    reply.send({ data });
  });

  // Get issues by status
  app.get('/dashboard/issues/by-status', {
    preHandler: [requirePermission('dashboards:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const data = await dashboardService.getIssuesByStatus(tenantSlug);
    reply.send({ data });
  });

  // Get change success rate
  app.get<{ Querystring: { days?: string } }>('/dashboard/changes/success-rate', {
    preHandler: [requirePermission('dashboards:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const days = request.query.days ? parseInt(request.query.days, 10) : 30;
    const data = await dashboardService.getChangeSuccessRate(tenantSlug, days);
    reply.send({ data });
  });

  // Get health distribution
  app.get('/dashboard/health/distribution', {
    preHandler: [requirePermission('dashboards:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const distribution = await dashboardService.getHealthDistribution(tenantSlug);
    reply.send({ distribution });
  });

  // Get health by tier
  app.get('/dashboard/health/by-tier', {
    preHandler: [requirePermission('dashboards:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const data = await dashboardService.getHealthByTier(tenantSlug);
    reply.send({ data });
  });

  // Get critical applications
  app.get<{ Querystring: { limit?: string } }>('/dashboard/health/critical', {
    preHandler: [requirePermission('dashboards:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const limit = request.query.limit ? parseInt(request.query.limit, 10) : 5;
    const apps = await dashboardService.getCriticalApplications(tenantSlug, limit);
    reply.send({ apps });
  });

  // Get requests by item
  app.get<{ Querystring: { limit?: string } }>('/dashboard/requests/by-item', {
    preHandler: [requirePermission('dashboards:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const limit = request.query.limit ? parseInt(request.query.limit, 10) : 10;
    const data = await dashboardService.getRequestsByItem(tenantSlug, limit);
    reply.send({ data });
  });

  // Get upcoming changes
  app.get<{ Querystring: { days?: string } }>('/dashboard/changes/upcoming', {
    preHandler: [requirePermission('dashboards:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const days = request.query.days ? parseInt(request.query.days, 10) : 7;
    const changes = await dashboardService.getUpcomingChanges(tenantSlug, days);
    reply.send({ changes });
  });

  // Get recent activity
  app.get<{ Querystring: { limit?: string } }>('/dashboard/activity', {
    preHandler: [requirePermission('dashboards:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const limit = request.query.limit ? parseInt(request.query.limit, 10) : 20;
    const activity = await dashboardService.getRecentActivity(tenantSlug, limit);
    reply.send({ activity });
  });

  // Get SLA compliance
  app.get('/dashboard/sla', {
    preHandler: [requirePermission('dashboards:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const data = await dashboardService.getSlaCompliance(tenantSlug);
    reply.send({ data });
  });

  // Get cloud cost trends
  app.get<{ Querystring: { months?: string } }>('/dashboard/costs/trends', {
    preHandler: [requirePermission('dashboards:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const months = request.query.months ? parseInt(request.query.months, 10) : 6;
    const trends = await dashboardService.getCloudCostTrends(tenantSlug, months);
    reply.send({ trends });
  });

  // Get mobile summary
  app.get('/dashboard/mobile', {
    preHandler: [requirePermission('dashboards:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const summary = await dashboardService.getMobileSummary(tenantSlug);
    reply.send(summary);
  });
}
