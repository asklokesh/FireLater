/**
 * Incident Importer
 * Imports incidents from parsed migration data
 */

import { pool } from '../../../config/database.js';
import { fieldMapper } from '../mappers/field-mapper.js';
import { logger } from '../../../utils/logger.js';
import type {
  ParsedRecord,
  FieldMappingConfig,
  MigrationError,
  ImportResult,
} from '../types.js';

export interface IncidentImportOptions {
  tenantId: string;
  tenantSchema: string;
  jobId: string;
  skipDuplicates?: boolean;
  updateExisting?: boolean;
}

export class IncidentImporter {
  /**
   * Import incidents into tenant schema
   */
  async import(
    records: ParsedRecord[],
    mappingConfig: FieldMappingConfig,
    options: IncidentImportOptions
  ): Promise<ImportResult> {
    const errors: MigrationError[] = [];
    let successCount = 0;
    let skippedCount = 0;
    let updatedCount = 0;

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      for (let i = 0; i < records.length; i++) {
        try {
          const record = records[i];

          // Map the record using field mapper
          const mapped = fieldMapper.mapRecord(record, mappingConfig, i);

          if (mapped.errors.length > 0) {
            errors.push(...mapped.errors);
            skippedCount++;
            continue;
          }

          // Validate mapped data
          const validation = fieldMapper.validateMappedData(mapped.targetData, 'incident');
          if (!validation.valid) {
            errors.push({
              recordIndex: i,
              recordId: record.sourceId,
              errorType: 'validation',
              errorMessage: validation.errors.join('; '),
              timestamp: new Date(),
            });
            skippedCount++;
            continue;
          }

          // Check for duplicates if configured
          if (options.skipDuplicates || options.updateExisting) {
            const existing = await this.findExistingIncident(
              client,
              options.tenantSchema,
              mapped.targetData.external_id
            );

            if (existing) {
              if (options.updateExisting) {
                await this.updateIncident(
                  client,
                  options.tenantSchema,
                  existing.id,
                  mapped.targetData
                );
                updatedCount++;

                // Track the update
                await this.trackImportedRecord(
                  client,
                  options.jobId,
                  options.tenantId,
                  record.sourceId,
                  existing.id,
                  options.tenantSchema,
                  'incidents',
                  mapped.targetData
                );

                continue;
              } else {
                skippedCount++;
                continue;
              }
            }
          }

          // Insert new incident
          const incidentId = await this.insertIncident(
            client,
            options.tenantSchema,
            mapped.targetData,
            record.metadata
          );

          // Track the imported record for rollback capability
          await this.trackImportedRecord(
            client,
            options.jobId,
            options.tenantId,
            record.sourceId,
            incidentId,
            options.tenantSchema,
            'incidents',
            mapped.targetData
          );

          successCount++;
        } catch (error) {
          logger.error({ err: error, recordIndex: i }, 'Failed to import incident');
          errors.push({
            recordIndex: i,
            recordId: records[i]?.sourceId,
            errorType: 'import',
            errorMessage: error instanceof Error ? error.message : 'Unknown import error',
            timestamp: new Date(),
          });
          skippedCount++;
        }
      }

      await client.query('COMMIT');

      logger.info({
        jobId: options.jobId,
        total: records.length,
        success: successCount,
        updated: updatedCount,
        skipped: skippedCount,
        errors: errors.length,
      }, 'Incident import completed');

      return {
        totalRecords: records.length,
        successfulRecords: successCount,
        updatedRecords: updatedCount,
        skippedRecords: skippedCount,
        failedRecords: errors.length,
        errors,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error({ err: error, jobId: options.jobId }, 'Incident import failed');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Find existing incident by external ID
   */
  private async findExistingIncident(
    client: any,
    schema: string,
    externalId: string
  ): Promise<{ id: string } | null> {
    if (!externalId) return null;

    const result = await client.query(
      `SELECT id FROM ${schema}.incidents WHERE external_id = $1 LIMIT 1`,
      [externalId]
    );

    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Insert new incident
   */
  private async insertIncident(
    client: any,
    schema: string,
    data: Record<string, any>,
    metadata?: {
      createdAt?: Date;
      updatedAt?: Date;
      createdBy?: string;
      updatedBy?: string;
    }
  ): Promise<string> {
    const fields: string[] = [];
    const values: any[] = [];
    const placeholders: string[] = [];
    let paramIndex = 1;

    // Required fields
    fields.push('title', 'priority', 'status');
    values.push(data.title, data.priority || 3, data.status || 'open');
    placeholders.push(`$${paramIndex++}`, `$${paramIndex++}`, `$${paramIndex++}`);

    // Optional fields
    const optionalFields = [
      'description', 'external_id', 'impact', 'urgency',
      'assigned_to_email', 'assigned_group', 'reporter_email',
      'category', 'subcategory', 'resolution_notes',
    ];

    for (const field of optionalFields) {
      if (data[field] !== undefined && data[field] !== null) {
        fields.push(field);
        values.push(data[field]);
        placeholders.push(`$${paramIndex++}`);
      }
    }

    // Handle dates
    if (metadata?.createdAt) {
      fields.push('created_at');
      values.push(metadata.createdAt);
      placeholders.push(`$${paramIndex++}`);
    }

    if (data.closed_at) {
      fields.push('closed_at');
      values.push(new Date(data.closed_at));
      placeholders.push(`$${paramIndex++}`);
    }

    const query = `
      INSERT INTO ${schema}.incidents (${fields.join(', ')})
      VALUES (${placeholders.join(', ')})
      RETURNING id
    `;

    const result = await client.query(query, values);
    return result.rows[0].id;
  }

  /**
   * Update existing incident
   */
  private async updateIncident(
    client: any,
    schema: string,
    incidentId: string,
    data: Record<string, any>
  ): Promise<void> {
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    const updatableFields = [
      'title', 'description', 'priority', 'status', 'impact', 'urgency',
      'assigned_to_email', 'assigned_group', 'category', 'subcategory',
      'resolution_notes', 'closed_at',
    ];

    for (const field of updatableFields) {
      if (data[field] !== undefined && data[field] !== null) {
        updates.push(`${field} = $${paramIndex++}`);
        values.push(data[field]);
      }
    }

    if (updates.length === 0) {
      return;
    }

    // Always update updated_at
    updates.push(`updated_at = NOW()`);

    values.push(incidentId);

    const query = `
      UPDATE ${schema}.incidents
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
    `;

    await client.query(query, values);
  }

  /**
   * Track imported record for rollback capability
   */
  private async trackImportedRecord(
    client: any,
    jobId: string,
    tenantId: string,
    sourceId: string,
    targetId: string,
    targetSchema: string,
    targetTable: string,
    recordData: Record<string, any>
  ): Promise<void> {
    await client.query(
      `INSERT INTO public.migration_imported_records (
        migration_job_id, tenant_id, entity_type, source_id, target_id,
        target_schema, target_table, record_data
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (migration_job_id, source_id) DO UPDATE
      SET target_id = EXCLUDED.target_id,
          record_data = EXCLUDED.record_data,
          imported_at = NOW()`,
      [jobId, tenantId, 'incident', sourceId, targetId, targetSchema, targetTable, JSON.stringify(recordData)]
    );
  }

  /**
   * Rollback imported incidents for a migration job
   */
  async rollback(jobId: string): Promise<number> {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Get all imported records for this job
      const records = await client.query(
        `SELECT target_id, target_schema, target_table
         FROM public.migration_imported_records
         WHERE migration_job_id = $1 AND entity_type = 'incident'`,
        [jobId]
      );

      let deletedCount = 0;

      for (const record of records.rows) {
        await client.query(
          `DELETE FROM ${record.target_schema}.${record.target_table}
           WHERE id = $1`,
          [record.target_id]
        );
        deletedCount++;
      }

      // Remove tracking records
      await client.query(
        `DELETE FROM public.migration_imported_records
         WHERE migration_job_id = $1 AND entity_type = 'incident'`,
        [jobId]
      );

      await client.query('COMMIT');

      logger.info({ jobId, deletedCount }, 'Incident rollback completed');

      return deletedCount;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error({ err: error, jobId }, 'Incident rollback failed');
      throw error;
    } finally {
      client.release();
    }
  }
}

export const incidentImporter = new IncidentImporter();
