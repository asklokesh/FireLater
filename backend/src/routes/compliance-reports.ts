import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  complianceReportsService,
  REPORT_TYPE_META,
  type ReportType,
} from '../services/compliance-reports.js';
import { requirePermission } from '../middleware/auth.js';

// ============================================
// SCHEMAS
// ============================================

const reportTypeSchema = z.enum([
  'change_success_rate',
  'unauthorized_changes',
  'sla_breach_evidence',
  'emergency_change_usage',
  'access_recertification_status',
  'sod_violation_attempts',
]);

const generateReportSchema = z.object({
  reportType: reportTypeSchema,
  from: z.string().datetime(),
  to: z.string().datetime(),
  format: z.enum(['json', 'csv']).optional().default('json'),
});

const createScheduleSchema = z.object({
  reportType: reportTypeSchema,
  name: z.string().min(2).max(255),
  description: z.string().max(2000).optional(),
  cadence: z.enum(['daily', 'weekly', 'monthly', 'quarterly']).default('monthly'),
  recipients: z.array(z.string().email()).default([]),
});

const updateScheduleSchema = z.object({
  cadence: z.enum(['daily', 'weekly', 'monthly', 'quarterly']).optional(),
  recipients: z.array(z.string().email()).optional(),
  isActive: z.boolean().optional(),
  description: z.string().max(2000).optional(),
});

const idParamSchema = z.object({
  id: z.string().uuid(),
});

// ============================================
// ROUTES
// ============================================

export default async function complianceReportRoutes(app: FastifyInstance) {
  // --------------------------------------------------
  // GET /compliance-reports/types
  // List all available report types with metadata
  // --------------------------------------------------
  app.get(
    '/compliance-reports/types',
    { preHandler: [requirePermission('admin:read')] },
    async (_request, reply) => {
      const types = (Object.keys(REPORT_TYPE_META) as ReportType[]).map((key) => ({
        type: key,
        ...REPORT_TYPE_META[key],
      }));

      reply.send({ types });
    }
  );

  // --------------------------------------------------
  // POST /compliance-reports/generate
  // Generate a compliance report on-demand
  // --------------------------------------------------
  app.post(
    '/compliance-reports/generate',
    { preHandler: [requirePermission('admin:read')] },
    async (request, reply) => {
      const { tenantSlug } = request.user;
      const body = generateReportSchema.parse(request.body);

      const params = {
        from: new Date(body.from),
        to: new Date(body.to),
        format: body.format,
      };

      const result = await complianceReportsService.generateReport(
        tenantSlug,
        body.reportType as ReportType,
        params
      );

      // Record the ad-hoc run
      await complianceReportsService.recordRun(tenantSlug, null, body.reportType as ReportType, result).catch(() => {
        // Non-fatal: don't fail the response if audit recording fails
      });

      if (body.format === 'csv') {
        const csv = complianceReportsService.exportToCsv(result);
        reply
          .header('Content-Type', 'text/csv')
          .header(
            'Content-Disposition',
            `attachment; filename="compliance-${body.reportType}-${new Date().toISOString().slice(0, 10)}.csv"`
          )
          .send(csv);
        return;
      }

      reply.send({ report: result });
    }
  );

  // --------------------------------------------------
  // GET /compliance-reports/schedules
  // List all report schedules for this tenant
  // --------------------------------------------------
  app.get(
    '/compliance-reports/schedules',
    { preHandler: [requirePermission('admin:read')] },
    async (request, reply) => {
      const { tenantSlug } = request.user;
      const schedules = await complianceReportsService.listSchedules(tenantSlug);
      reply.send({ schedules });
    }
  );

  // --------------------------------------------------
  // POST /compliance-reports/schedules
  // Create a new report schedule
  // --------------------------------------------------
  app.post(
    '/compliance-reports/schedules',
    { preHandler: [requirePermission('admin:write')] },
    async (request, reply) => {
      const { tenantSlug } = request.user;
      const body = createScheduleSchema.parse(request.body);

      const schedule = await complianceReportsService.createSchedule(tenantSlug, {
        reportType: body.reportType as ReportType,
        name: body.name,
        description: body.description,
        cadence: body.cadence,
        recipients: body.recipients,
      });

      reply.code(201).send({ schedule });
    }
  );

  // --------------------------------------------------
  // PUT /compliance-reports/schedules/:id
  // Update an existing report schedule
  // --------------------------------------------------
  app.put(
    '/compliance-reports/schedules/:id',
    { preHandler: [requirePermission('admin:write')] },
    async (request, reply) => {
      const { tenantSlug } = request.user;
      const { id } = idParamSchema.parse(request.params);
      const body = updateScheduleSchema.parse(request.body);

      const schedule = await complianceReportsService.updateSchedule(tenantSlug, id, body);

      if (!schedule) {
        reply.code(404).send({ error: 'Schedule not found' });
        return;
      }

      reply.send({ schedule });
    }
  );

  // --------------------------------------------------
  // GET /compliance-reports/runs
  // List recent report runs
  // --------------------------------------------------
  app.get(
    '/compliance-reports/runs',
    { preHandler: [requirePermission('admin:read')] },
    async (request, reply) => {
      const { tenantSlug } = request.user;
      const query = request.query as Record<string, string>;
      const limit = Math.min(parseInt(query.limit ?? '50', 10), 200);

      const runs = await complianceReportsService.listRuns(tenantSlug, limit);
      reply.send({ runs });
    }
  );
}
