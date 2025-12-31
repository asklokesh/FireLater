import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { reportTemplateService } from '../services/reporting.js';
import { BadRequestError, NotFoundError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

// GET /api/v1/reporting/templates
export async function listReportTemplates(
  request: FastifyRequest<{
    Params: { tenantSlug: string };
    Querystring: {
      page?: string;
      perPage?: string;
      reportType?: string;
      isPublic?: string;
    };
  }>,
  reply: FastifyReply
) {
  try {
    const { tenantSlug } = request.params;
    const {
      page = '1',
      perPage = '20',
      reportType,
      isPublic
    } = request.query;

    const pagination = {
      page: parseInt(page, 10),
      perPage: parseInt(perPage, 10)
    };

    if (isNaN(pagination.page) || pagination.page < 1) {
      throw new BadRequestError('Invalid page parameter');
    }
    if (isNaN(pagination.perPage) || pagination.perPage < 1 || pagination.perPage > 100) {
      throw new BadRequestError('Invalid perPage parameter (must be between 1 and 100)');
    }

    const filters = {
      reportType,
      isPublic: isPublic === 'true' ? true : isPublic === 'false' ? false : undefined
    };

    const result = await reportTemplateService.list(tenantSlug, pagination, filters);
    return reply.send(result);
  } catch (error) {
    logger.error({ error, params: request.params, query: request.query }, 'Failed to list report templates');
    if (error instanceof BadRequestError || error instanceof NotFoundError) {
      return reply.code(400).send({ error: error.message });
    }
    return reply.code(500).send({ error: 'Internal server error' });
  }
}

// GET /api/v1/reporting/templates/:id
export async function getReportTemplate(
  request: FastifyRequest<{
    Params: { tenantSlug: string; id: string };
  }>,
  reply: FastifyReply
) {
  try {
    const { tenantSlug, id } = request.params;

    if (!id) {
      throw new BadRequestError('Template ID is required');
    }

    const template = await reportTemplateService.findById(tenantSlug, id);
    if (!template) {
      throw new NotFoundError('Report template', id);
    }

    return reply.send(template);
  } catch (error) {
    logger.error({ error, params: request.params }, 'Failed to get report template');
    if (error instanceof BadRequestError || error instanceof NotFoundError) {
      return reply.code(400).send({ error: error.message });
    }
    return reply.code(500).send({ error: 'Internal server error' });
  }
}

// POST /api/v1/reporting/templates
export async function createReportTemplate(
  request: FastifyRequest<{
    Params: { tenantSlug: string };
    Body: any;
  }>,
  reply: FastifyReply
) {
  try {
    const { tenantSlug } = request.params;
    const userId = request.user?.id;

    if (!userId) {
      throw new BadRequestError('User ID is required');
    }

    const template = await reportTemplateService.create(tenantSlug, userId, request.body);
    return reply.code(201).send(template);
  } catch (error) {
    logger.error({ error, params: request.params, body: request.body }, 'Failed to create report template');
    if (error instanceof BadRequestError) {
      return reply.code(400).send({ error: error.message });
    }
    return reply.code(500).send({ error: 'Internal server error' });
  }
}

// PUT /api/v1/reporting/templates/:id
export async function updateReportTemplate(
  request: FastifyRequest<{
    Params: { tenantSlug: string; id: string };
    Body: any;
  }>,
  reply: FastifyReply
) {
  try {
    const { tenantSlug, id } = request.params;

    if (!id) {
      throw new BadRequestError('Template ID is required');
    }

    const template = await reportTemplateService.update(tenantSlug, id, request.body);
    return reply.send(template);
  } catch (error) {
    logger.error({ error, params: request.params, body: request.body }, 'Failed to update report template');
    if (error instanceof BadRequestError || error instanceof NotFoundError) {
      return reply.code(400).send({ error: error.message });
    }
    return reply.code(500).send({ error: 'Internal server error' });
  }
}

// DELETE /api/v1/reporting/templates/:id
export async function deleteReportTemplate(
  request: FastifyRequest<{
    Params: { tenantSlug: string; id: string };
  }>,
  reply: FastifyReply
) {
  try {
    const { tenantSlug, id } = request.params;

    if (!id) {
      throw new BadRequestError('Template ID is required');
    }

    await reportTemplateService.delete(tenantSlug, id);
    return reply.code(204).send();
  } catch (error) {
    logger.error({ error, params: request.params }, 'Failed to delete report template');
    if (error instanceof BadRequestError || error instanceof NotFoundError) {
      return reply.code(400).send({ error: error.message });
    }
    return reply.code(500).send({ error: 'Internal server error' });
  }
}