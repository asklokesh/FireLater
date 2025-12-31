import { FastifyInstance, FastifyRequest } from 'fastify';
import { reportTemplateService } from '../services/reporting.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validatePagination } from '../middleware/pagination.js';
import type { PaginationParams } from '../types/index.js';

interface ReportTemplateQuery {
  reportType?: string;
  isPublic?: string;
}

interface ReportTemplateParams {
  id: string;
}

interface ReportRunQuery {
  templateId?: string;
  fromDate?: string;
  toDate?: string;
}

export default async function reportingRoutes(fastify: FastifyInstance) {
  // List report templates
  fastify.get(
    '/templates',
    {
      preHandler: [authenticate, authorize('read:reports'), validatePagination],
      schema: {
        querystring: {
          type: 'object',
          properties: {
            reportType: { type: 'string' },
            isPublic: { type: 'string', enum: ['true', 'false'] },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Querystring: ReportTemplateQuery; Params: PaginationParams }>) => {
      const { tenantSlug } = request.user!;
      const { page, perPage } = request.query;
      const pagination: PaginationParams = {
        page: page ? parseInt(page, 10) : 1,
        perPage: perPage ? parseInt(perPage, 10) : 20,
      };

      const filters = {
        reportType: request.query.reportType,
        isPublic: request.query.isPublic ? request.query.isPublic === 'true' : undefined,
      };

      return reportTemplateService.list(tenantSlug, pagination, filters);
    }
  );

  // Get report template by ID
  fastify.get(
    '/templates/:id',
    {
      preHandler: [authenticate, authorize('read:reports')],
    },
    async (request: FastifyRequest<{ Params: ReportTemplateParams }>) => {
      const { tenantSlug } = request.user!;
      const { id } = request.params;

      const template = await reportTemplateService.findById(tenantSlug, id);
      if (!template) {
        throw fastify.httpErrors.notFound('Report template not found');
      }

      return template;
    }
  );

  // Create report template
  fastify.post(
    '/templates',
    {
      preHandler: [authenticate, authorize('write:reports')],
      schema: {
        body: {
          type: 'object',
          required: ['name', 'reportType'],
          properties: {
            name: { type: 'string' },
            description: { type: 'string' },
            reportType: { type: 'string' },
            queryConfig: { type: 'object' },
            filters: { type: 'object' },
            groupings: { type: 'array', items: { type: 'string' } },
            metrics: { type: 'array', items: { type: 'string' } },
            chartConfig: { type: 'object' },
            outputFormat: { type: 'string' },
            includeCharts: { type: 'boolean' },
            isPublic: { type: 'boolean' },
          },
        },
      },
    },
    async (request) => {
      const { tenantSlug, userId } = request.user!;
      const data = request.body as any;

      return reportTemplateService.create(tenantSlug, userId, data);
    }
  );

  // Update report template
  fastify.put(
    '/templates/:id',
    {
      preHandler: [authenticate, authorize('write:reports')],
      schema: {
        body: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            description: { type: 'string' },
            reportType: { type: 'string' },
            queryConfig: { type: 'object' },
            filters: { type: 'object' },
            groupings: { type: 'array', items: { type: 'string' } },
            metrics: { type: 'array', items: { type: 'string' } },
            chartConfig: { type: 'object' },
            outputFormat: { type: 'string' },
            includeCharts: { type: 'boolean' },
            isPublic: { type: 'boolean' },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Params: ReportTemplateParams }>) => {
      const { tenantSlug } = request.user!;
      const { id } = request.params;
      const data = request.body as Partial<any>;

      return reportTemplateService.update(tenantSlug, id, data);
    }
  );

  // Delete report template
  fastify.delete(
    '/templates/:id',
    {
      preHandler: [authenticate, authorize('delete:reports')],
    },
    async (request: FastifyRequest<{ Params: ReportTemplateParams }>) => {
      const { tenantSlug } = request.user!;
      const { id } = request.params;

      await reportTemplateService.delete(tenantSlug, id);
      return { message: 'Report template deleted successfully' };
    }
  );

  // Run a report
  fastify.post(
    '/run',
    {
      preHandler: [authenticate, authorize('read:reports')],
      schema: {
        body: {
          type: 'object',
          required: ['templateId'],
          properties: {
            templateId: { type: 'string' },
            filters: { type: 'object' },
            fromDate: { type: 'string', format: 'date-time' },
            toDate: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
    async (request) => {
      const { tenantSlug } = request.user!;
      const { templateId, filters, fromDate, toDate } = request.body as any;

      return reportTemplateService.runReport(tenantSlug, templateId, {
        filters,
        fromDate,
        toDate,
      });
    }
  );

  // List report runs
  fastify.get(
    '/runs',
    {
      preHandler: [authenticate, authorize('read:reports'), validatePagination],
      schema: {
        querystring: {
          type: 'object',
          properties: {
            templateId: { type: 'string' },
            fromDate: { type: 'string', format: 'date-time' },
            toDate: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Querystring: ReportRunQuery; Params: PaginationParams }>) => {
      const { tenantSlug } = request.user!;
      const { page, perPage } = request.query;
      const pagination: PaginationParams = {
        page: page ? parseInt(page, 10) : 1,
        perPage: perPage ? parseInt(perPage, 10) : 20,
      };

      const filters = {
        templateId: request.query.templateId,
        fromDate: request.query.fromDate,
        toDate: request.query.toDate,
      };

      return reportTemplateService.listRuns(tenantSlug, pagination, filters);
    }
  );
}