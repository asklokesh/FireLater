/**
 * Migration API Routes
 * Endpoints for ITSM data migration
 */

import { FastifyPluginAsync } from 'fastify';
import { migrationService } from '../services/migration/index.js';
import { authenticate } from '../middleware/auth.js';
import { BadRequestError } from '../utils/errors.js';
import type {
  MigrationUploadRequest,
  MigrationExecuteRequest,
  SourceSystem,
  EntityType,
} from '../services/migration/types.js';

const migrationRoutes: FastifyPluginAsync = async (fastify) => {
  // Upload and create migration job
  fastify.post<{
    Body: {
      tenantSlug: string;
      sourceSystem: SourceSystem;
      entityType: EntityType;
      mappingTemplateId?: string;
      dryRun?: boolean;
    };
  }>(
    '/upload',
    {
      onRequest: [authenticate],
      schema: {
        tags: ['migration'],
        summary: 'Upload file and create migration job',
        description: 'Upload CSV/XML/JSON file from ITSM system and create migration job with preview',
        consumes: ['multipart/form-data'],
        body: {
          type: 'object',
          required: ['tenantSlug', 'sourceSystem', 'entityType'],
          properties: {
            tenantSlug: {
              type: 'string',
              description: 'Tenant slug',
            },
            sourceSystem: {
              type: 'string',
              enum: ['servicenow', 'bmc_remedy', 'jira', 'generic_csv'],
              description: 'Source ITSM system',
            },
            entityType: {
              type: 'string',
              enum: ['incident', 'request', 'change', 'user', 'group', 'application', 'problem'],
              description: 'Entity type to import',
            },
            mappingTemplateId: {
              type: 'string',
              description: 'Optional mapping template ID',
            },
            dryRun: {
              type: 'boolean',
              description: 'Preview only, do not execute',
            },
            file: {
              type: 'string',
              format: 'binary',
              description: 'File to upload (CSV, XML, or JSON)',
            },
          },
        },
        response: {
          200: {
            description: 'Migration job created successfully',
            type: 'object',
            properties: {
              job: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  status: { type: 'string' },
                  totalRecords: { type: 'number' },
                  createdAt: { type: 'string' },
                },
              },
              preview: {
                type: 'object',
                properties: {
                  totalRecords: { type: 'number' },
                  sampleRecords: { type: 'array' },
                  fieldMappings: { type: 'array' },
                  unmappedFields: { type: 'array' },
                  recommendations: { type: 'array' },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      // Handle multipart file upload
      const data = await request.file();

      if (!data) {
        throw new BadRequestError('No file uploaded');
      }

      const buffer = await data.toBuffer();

      const uploadRequest: MigrationUploadRequest = {
        tenantSlug: request.body.tenantSlug,
        sourceSystem: request.body.sourceSystem,
        entityType: request.body.entityType,
        file: buffer,
        filename: data.filename,
        mappingTemplateId: request.body.mappingTemplateId,
        dryRun: request.body.dryRun || false,
      };

      const result = await migrationService.createMigrationJob(
        uploadRequest,
        request.user!.userId
      );

      reply.send(result);
    }
  );

  // Execute migration job
  fastify.post<{
    Params: { jobId: string };
    Body: {
      mappingConfig?: any;
      continueOnError?: boolean;
      batchSize?: number;
    };
  }>(
    '/:jobId/execute',
    {
      onRequest: [authenticate],
      schema: {
        tags: ['migration'],
        summary: 'Execute migration job',
        description: 'Execute a pending migration job to import data',
        params: {
          type: 'object',
          properties: {
            jobId: { type: 'string', format: 'uuid' },
          },
        },
        body: {
          type: 'object',
          properties: {
            mappingConfig: {
              type: 'object',
              description: 'Optional custom mapping configuration',
            },
            continueOnError: {
              type: 'boolean',
              description: 'Continue import even if some records fail',
            },
            batchSize: {
              type: 'number',
              description: 'Number of records to process per batch',
            },
          },
        },
        response: {
          200: {
            description: 'Migration executed successfully',
            type: 'object',
            properties: {
              jobId: { type: 'string' },
              status: { type: 'string' },
              totalRecords: { type: 'number' },
              successfulRecords: { type: 'number' },
              failedRecords: { type: 'number' },
              errors: { type: 'array' },
              summary: { type: 'object' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const executeRequest: MigrationExecuteRequest = {
        jobId: request.params.jobId,
        mappingConfig: request.body.mappingConfig,
        continueOnError: request.body.continueOnError,
        batchSize: request.body.batchSize,
      };

      const report = await migrationService.executeMigration(executeRequest);

      reply.send(report);
    }
  );

  // Get migration job status
  fastify.get<{
    Params: { jobId: string };
  }>(
    '/:jobId',
    {
      onRequest: [authenticate],
      schema: {
        tags: ['migration'],
        summary: 'Get migration job status',
        description: 'Get details and status of a migration job',
        params: {
          type: 'object',
          properties: {
            jobId: { type: 'string', format: 'uuid' },
          },
        },
        response: {
          200: {
            description: 'Migration job details',
            type: 'object',
            properties: {
              id: { type: 'string' },
              status: { type: 'string' },
              totalRecords: { type: 'number' },
              processedRecords: { type: 'number' },
              successfulRecords: { type: 'number' },
              failedRecords: { type: 'number' },
              createdAt: { type: 'string' },
              completedAt: { type: 'string' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const job = await migrationService.getJobById(request.params.jobId);
      reply.send(job);
    }
  );

  // List migration jobs for tenant
  fastify.get<{
    Querystring: {
      tenantSlug: string;
      limit?: number;
    };
  }>(
    '/',
    {
      onRequest: [authenticate],
      schema: {
        tags: ['migration'],
        summary: 'List migration jobs',
        description: 'List all migration jobs for a tenant',
        querystring: {
          type: 'object',
          required: ['tenantSlug'],
          properties: {
            tenantSlug: { type: 'string' },
            limit: { type: 'number', minimum: 1, maximum: 100, default: 50 },
          },
        },
        response: {
          200: {
            description: 'List of migration jobs',
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                sourceSystem: { type: 'string' },
                entityType: { type: 'string' },
                status: { type: 'string' },
                totalRecords: { type: 'number' },
                createdAt: { type: 'string' },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const jobs = await migrationService.listJobs(
        request.query.tenantSlug,
        request.query.limit
      );
      reply.send(jobs);
    }
  );

  // Save mapping template
  fastify.post<{
    Body: {
      tenantSlug: string;
      name: string;
      sourceSystem: SourceSystem;
      entityType: EntityType;
      fieldMappings: any[];
      userMappings?: any[];
      statusMappings?: any[];
      priorityMappings?: any[];
    };
  }>(
    '/templates',
    {
      onRequest: [authenticate],
      schema: {
        tags: ['migration'],
        summary: 'Save mapping template',
        description: 'Save a reusable field mapping template',
        body: {
          type: 'object',
          required: ['tenantSlug', 'name', 'sourceSystem', 'entityType', 'fieldMappings'],
          properties: {
            tenantSlug: { type: 'string' },
            name: { type: 'string' },
            sourceSystem: { type: 'string' },
            entityType: { type: 'string' },
            fieldMappings: { type: 'array' },
            userMappings: { type: 'array' },
            statusMappings: { type: 'array' },
            priorityMappings: { type: 'array' },
          },
        },
        response: {
          201: {
            description: 'Mapping template created',
            type: 'object',
            properties: {
              templateId: { type: 'string' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const templateId = await migrationService.saveMappingTemplate(
        request.body.tenantSlug,
        request.body.name,
        {
          entityType: request.body.entityType,
          sourceSystem: request.body.sourceSystem,
          fieldMappings: request.body.fieldMappings,
          userMappings: request.body.userMappings,
          statusMappings: request.body.statusMappings,
          priorityMappings: request.body.priorityMappings,
        },
        request.user!.userId
      );

      reply.status(201).send({ templateId });
    }
  );
};

export default migrationRoutes;
