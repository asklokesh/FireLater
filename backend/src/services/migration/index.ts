/**
 * Migration Service
 * Main service for managing ITSM data migration jobs
 */

import { pool } from '../../config/database.js';
import { tenantService } from '../tenant.js';
import { storageService } from '../storage.js';
import { genericCSVParser } from './parsers/generic-csv.js';
import { serviceNowParser } from './parsers/servicenow.js';
import { fieldMapper } from './mappers/field-mapper.js';
import { incidentImporter } from './importers/incident-importer.js';
import { requestImporter } from './importers/request-importer.js';
import { NotFoundError, BadRequestError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import type {
  MigrationJob,
  MigrationUploadRequest,
  MigrationExecuteRequest,
  MigrationPreview,
  MigrationReport,
  MigrationStatus,
  FieldMappingConfig,
  ParsedRecord,
  SourceSystem,
  EntityType,
} from './types.js';

export class MigrationService {
  /**
   * Create a new migration job from uploaded file
   */
  async createMigrationJob(request: MigrationUploadRequest, userId: string): Promise<{
    job: MigrationJob;
    preview?: MigrationPreview;
  }> {
    const tenant = await tenantService.findBySlug(request.tenantSlug);
    if (!tenant) {
      throw new NotFoundError('Tenant', request.tenantSlug);
    }

    // Parse the uploaded file based on source system
    let parseResult;

    if (request.sourceSystem === 'servicenow') {
      parseResult = await serviceNowParser.parse(
        request.file,
        request.entityType
      );
    } else {
      parseResult = await genericCSVParser.parseCSV(
        request.file,
        request.entityType
      );
    }

    if (parseResult.errors.length > 0 && parseResult.records.length === 0) {
      throw new BadRequestError('Failed to parse file: no valid records found');
    }

    // Get or create field mapping configuration
    let mappingConfig: FieldMappingConfig;

    if (request.mappingTemplateId) {
      mappingConfig = await this.getMappingTemplate(request.mappingTemplateId);
    } else {
      // Use default mappings for the source system
      const defaultMappings = fieldMapper.getDefaultMappings(
        request.sourceSystem,
        request.entityType
      );

      mappingConfig = {
        entityType: request.entityType,
        sourceSystem: request.sourceSystem,
        fieldMappings: defaultMappings,
      };
    }

    // Upload file to storage
    const storageKey = await storageService.uploadMigrationFile(
      request.tenantSlug,
      request.filename,
      request.file,
      {
        sourceSystem: request.sourceSystem,
        entityType: request.entityType,
        recordCount: String(parseResult.records.length),
      }
    );

    // Create migration job
    const result = await pool.query(
      `INSERT INTO public.migration_jobs (
        tenant_id, source_system, entity_type, file_name, file_size, file_path,
        status, total_records, mapping_config, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *`,
      [
        tenant.id,
        request.sourceSystem,
        request.entityType,
        request.filename,
        request.file.length,
        storageKey,
        request.dryRun ? 'preview' : 'pending',
        parseResult.records.length,
        JSON.stringify(mappingConfig),
        userId,
      ]
    );

    const job = result.rows[0] as MigrationJob;

    // Generate preview
    const preview = await this.generatePreview(job, parseResult.records);

    logger.info({ jobId: job.id, records: parseResult.records.length }, 'Migration job created');

    return { job, preview };
  }

  /**
   * Generate preview of migration with mapped data samples
   */
  private async generatePreview(
    job: MigrationJob,
    records: ParsedRecord[]
  ): Promise<MigrationPreview> {
    const sampleSize = Math.min(10, records.length);
    const sampleRecords = records.slice(0, sampleSize);

    const mappingConfig: FieldMappingConfig = job.mappingConfig as any;
    const unmappedFields = new Set<string>();
    const missingRequiredFields: string[] = [];

    // Analyze mappings
    for (const record of sampleRecords) {
      for (const key of Object.keys(record.data)) {
        const isMapped = mappingConfig.fieldMappings.some(
          m => m.sourceField === key
        );
        if (!isMapped) {
          unmappedFields.add(key);
        }
      }
    }

    // Check for missing required fields
    const requiredTargetFields = mappingConfig.fieldMappings
      .filter(m => m.required)
      .map(m => m.targetField);

    for (const field of requiredTargetFields) {
      const hasMapping = mappingConfig.fieldMappings.some(
        m => m.targetField === field && m.sourceField
      );
      if (!hasMapping) {
        missingRequiredFields.push(field);
      }
    }

    // Generate recommendations
    const recommendations: string[] = [];

    if (unmappedFields.size > 0) {
      recommendations.push(
        `${unmappedFields.size} source fields are not mapped and will be ignored`
      );
    }

    if (missingRequiredFields.length > 0) {
      recommendations.push(
        `Missing mappings for required fields: ${missingRequiredFields.join(', ')}`
      );
    }

    return {
      jobId: job.id,
      totalRecords: records.length,
      sampleRecords,
      fieldMappings: mappingConfig.fieldMappings,
      unmappedFields: Array.from(unmappedFields),
      missingRequiredFields,
      recommendations,
    };
  }

  /**
   * Execute migration job
   */
  async executeMigration(request: MigrationExecuteRequest): Promise<MigrationReport> {
    const job = await this.getJobById(request.jobId);

    if (job.status !== 'pending' && job.status !== 'preview') {
      throw new BadRequestError(`Cannot execute migration in status: ${job.status}`);
    }

    const startTime = Date.now();

    // Update job status to processing
    await this.updateJobStatus(job.id, 'processing');

    try {
      // Get tenant information
      const tenantResult = await pool.query(
        'SELECT id, slug, schema_name FROM public.tenants WHERE id = $1',
        [job.tenantId]
      );

      if (tenantResult.rows.length === 0) {
        throw new NotFoundError('Tenant', job.tenantId);
      }

      const tenant = tenantResult.rows[0];

      // Download file from storage
      if (!job.filePath) {
        throw new BadRequestError('Migration job has no file path');
      }

      const fileBuffer = await storageService.downloadMigrationFile(job.filePath);

      // Parse the file based on source system
      const entityType = (job.mappingConfig as FieldMappingConfig).entityType;
      let parseResult;

      if (job.sourceSystem === 'servicenow') {
        parseResult = await serviceNowParser.parse(fileBuffer, entityType);
      } else {
        parseResult = await genericCSVParser.parseCSV(fileBuffer, entityType);
      }

      if (parseResult.errors.length > 0 && parseResult.records.length === 0) {
        throw new BadRequestError('Failed to parse file: no valid records found');
      }

      const records = parseResult.records;
      const mappingConfig = job.mappingConfig as FieldMappingConfig;

      let importResult;

      // Execute import based on entity type
      switch (entityType) {
        case 'incident':
          importResult = await incidentImporter.import(records, mappingConfig, {
            tenantId: tenant.id,
            tenantSchema: `tenant_${tenant.slug}`,
            jobId: job.id,
            skipDuplicates: true,
            updateExisting: request.continueOnError || false,
          });
          break;

        case 'request':
          importResult = await requestImporter.import(records, mappingConfig, {
            tenantId: tenant.id,
            tenantSchema: `tenant_${tenant.slug}`,
            jobId: job.id,
            skipDuplicates: true,
            updateExisting: request.continueOnError || false,
          });
          break;

        default:
          throw new BadRequestError(`Entity type ${entityType} not yet supported for import`);
      }

      const duration = Date.now() - startTime;

      const report: MigrationReport = {
        jobId: job.id,
        status: 'completed',
        totalRecords: importResult.totalRecords,
        processedRecords: importResult.totalRecords,
        successfulRecords: importResult.successfulRecords,
        failedRecords: importResult.failedRecords,
        skippedRecords: importResult.skippedRecords,
        startedAt: new Date(startTime),
        completedAt: new Date(),
        duration,
        errors: importResult.errors,
        warnings: [],
        summary: {
          usersCreated: 0,
          usersSkipped: 0,
          incidentsImported: entityType === 'incident' ? importResult.successfulRecords : 0,
          requestsImported: entityType === 'request' ? importResult.successfulRecords : 0,
          changesImported: 0, // Change imports not yet implemented
        },
      };

      await this.updateJobStatus(job.id, 'completed', report);

      logger.info(
        { jobId: job.id, successful: importResult.successfulRecords, failed: importResult.failedRecords },
        'Migration executed successfully'
      );

      // Clean up migration file after successful completion
      try {
        await storageService.deleteMigrationFile(job.filePath);
        logger.info({ jobId: job.id, storageKey: job.filePath }, 'Migration file cleaned up');
      } catch (error) {
        logger.warn({ err: error, jobId: job.id }, 'Failed to clean up migration file');
      }

      return report;
    } catch (error) {
      await this.updateJobStatus(job.id, 'failed');
      throw error;
    }
  }

  /**
   * Get migration job by ID
   */
  async getJobById(jobId: string): Promise<MigrationJob> {
    const result = await pool.query(
      'SELECT * FROM public.migration_jobs WHERE id = $1',
      [jobId]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Migration job', jobId);
    }

    return result.rows[0] as MigrationJob;
  }

  /**
   * List migration jobs for tenant
   */
  async listJobs(tenantSlug: string, limit: number = 50): Promise<MigrationJob[]> {
    const tenant = await tenantService.findBySlug(tenantSlug);
    if (!tenant) {
      throw new NotFoundError('Tenant', tenantSlug);
    }

    const result = await pool.query(
      `SELECT * FROM public.migration_jobs
       WHERE tenant_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [tenant.id, limit]
    );

    return result.rows as MigrationJob[];
  }

  /**
   * Update job status
   */
  private async updateJobStatus(
    jobId: string,
    status: MigrationStatus,
    report?: Partial<MigrationReport>
  ): Promise<void> {
    const updates: string[] = ['status = $2'];
    const values: any[] = [jobId, status];
    let paramIndex = 3;

    if (status === 'processing') {
      updates.push(`started_at = NOW()`);
    }

    if (status === 'completed' || status === 'failed') {
      updates.push(`completed_at = NOW()`);
    }

    if (report) {
      updates.push(`processed_records = $${paramIndex++}`);
      values.push(report.processedRecords || 0);

      updates.push(`successful_records = $${paramIndex++}`);
      values.push(report.successfulRecords || 0);

      updates.push(`failed_records = $${paramIndex++}`);
      values.push(report.failedRecords || 0);

      updates.push(`summary = $${paramIndex++}`);
      values.push(JSON.stringify(report.summary || {}));
    }

    await pool.query(
      `UPDATE public.migration_jobs SET ${updates.join(', ')} WHERE id = $1`,
      values
    );
  }

  /**
   * Get mapping template
   */
  private async getMappingTemplate(templateId: string): Promise<FieldMappingConfig> {
    const result = await pool.query(
      'SELECT * FROM public.migration_mappings WHERE id = $1',
      [templateId]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Mapping template', templateId);
    }

    const template = result.rows[0];
    return {
      entityType: template.target_entity,
      sourceSystem: template.source_system,
      fieldMappings: template.field_mappings,
      userMappings: template.user_mappings,
      statusMappings: template.status_mappings,
      priorityMappings: template.priority_mappings,
    };
  }

  /**
   * Save mapping template
   */
  async saveMappingTemplate(
    tenantSlug: string,
    name: string,
    config: FieldMappingConfig,
    userId: string
  ): Promise<string> {
    const tenant = await tenantService.findBySlug(tenantSlug);
    if (!tenant) {
      throw new NotFoundError('Tenant', tenantSlug);
    }

    const result = await pool.query(
      `INSERT INTO public.migration_mappings (
        tenant_id, name, source_system, target_entity,
        field_mappings, user_mappings, status_mappings, priority_mappings,
        created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id`,
      [
        tenant.id,
        name,
        config.sourceSystem,
        config.entityType,
        JSON.stringify(config.fieldMappings),
        JSON.stringify(config.userMappings || []),
        JSON.stringify(config.statusMappings || []),
        JSON.stringify(config.priorityMappings || []),
        userId,
      ]
    );

    return result.rows[0].id;
  }
}

export const migrationService = new MigrationService();
