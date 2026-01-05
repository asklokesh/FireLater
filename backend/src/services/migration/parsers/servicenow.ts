/**
 * ServiceNow Parser
 * Handles XML and JSON exports from ServiceNow
 */

import { parseStringPromise } from 'xml2js';
import type { ParsedRecord, EntityType, MigrationError } from '../types.js';
import { logger } from '../../../utils/logger.js';

export interface ServiceNowParseOptions {
  format?: 'xml' | 'json';
  encoding?: string;
}

export interface ServiceNowParseResult {
  records: ParsedRecord[];
  errors: MigrationError[];
  totalRows: number;
  skippedRows: number;
}

export class ServiceNowParser {
  /**
   * Parse ServiceNow export (XML or JSON)
   */
  async parse(
    buffer: Buffer,
    entityType: EntityType,
    options: ServiceNowParseOptions = {}
  ): Promise<ServiceNowParseResult> {
    const format = options.format || this.detectFormat(buffer);

    if (format === 'json') {
      return this.parseJSON(buffer, entityType);
    } else {
      return this.parseXML(buffer, entityType);
    }
  }

  /**
   * Detect format from buffer content
   */
  private detectFormat(buffer: Buffer): 'xml' | 'json' {
    const content = buffer.toString('utf-8', 0, Math.min(1000, buffer.length));

    if (content.trim().startsWith('<?xml') || content.trim().startsWith('<')) {
      return 'xml';
    }

    if (content.trim().startsWith('{') || content.trim().startsWith('[')) {
      return 'json';
    }

    // Default to XML for ServiceNow
    return 'xml';
  }

  /**
   * Parse ServiceNow JSON export
   */
  private async parseJSON(
    buffer: Buffer,
    entityType: EntityType
  ): Promise<ServiceNowParseResult> {
    const errors: MigrationError[] = [];
    const records: ParsedRecord[] = [];
    let skippedRows = 0;

    try {
      const content = buffer.toString('utf-8');
      const data = JSON.parse(content);

      // ServiceNow JSON exports are typically wrapped in { "records": [...] }
      const rows = Array.isArray(data) ? data : (data.records || data.result || []);

      logger.info(`Parsed ${rows.length} records from ServiceNow JSON`);

      for (let i = 0; i < rows.length; i++) {
        try {
          const row = rows[i];

          if (!row || typeof row !== 'object') {
            skippedRows++;
            continue;
          }

          const record = this.convertToRecord(row, entityType, i);
          records.push(record);
        } catch (error) {
          errors.push({
            recordIndex: i,
            errorType: 'validation',
            errorMessage: error instanceof Error ? error.message : 'Unknown parsing error',
            timestamp: new Date(),
          });
          skippedRows++;
        }
      }

      return {
        records,
        errors,
        totalRows: rows.length,
        skippedRows,
      };
    } catch (error) {
      logger.error({ err: error }, 'ServiceNow JSON parsing failed');
      throw new Error(`JSON parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Parse ServiceNow XML export
   */
  private async parseXML(
    buffer: Buffer,
    entityType: EntityType
  ): Promise<ServiceNowParseResult> {
    const errors: MigrationError[] = [];
    const records: ParsedRecord[] = [];
    let skippedRows = 0;

    try {
      const content = buffer.toString('utf-8');
      const result = await parseStringPromise(content, {
        explicitArray: false,
        trim: true,
        normalizeTags: true,
        valueProcessors: [this.xmlValueProcessor],
      });

      // ServiceNow XML structure varies, handle common patterns
      let rows: any[] = [];

      if (result.xml) {
        // Format: <xml><table_name>...</table_name></xml>
        const tableName = this.getTableNameFromEntityType(entityType);
        rows = this.extractXMLRecords(result.xml, tableName);
      } else if (result.unload) {
        // Format: <unload unload_date="...">...</unload>
        rows = this.extractXMLRecords(result.unload);
      } else {
        // Try to find any array in the result
        const firstKey = Object.keys(result)[0];
        rows = this.extractXMLRecords(result[firstKey]);
      }

      logger.info(`Parsed ${rows.length} records from ServiceNow XML`);

      for (let i = 0; i < rows.length; i++) {
        try {
          const row = rows[i];

          if (!row || typeof row !== 'object') {
            skippedRows++;
            continue;
          }

          const record = this.convertToRecord(row, entityType, i);
          records.push(record);
        } catch (error) {
          errors.push({
            recordIndex: i,
            errorType: 'validation',
            errorMessage: error instanceof Error ? error.message : 'Unknown parsing error',
            timestamp: new Date(),
          });
          skippedRows++;
        }
      }

      return {
        records,
        errors,
        totalRows: rows.length,
        skippedRows,
      };
    } catch (error) {
      logger.error({ err: error }, 'ServiceNow XML parsing failed');
      throw new Error(`XML parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Extract records from XML structure
   */
  private extractXMLRecords(obj: any, tableName?: string): any[] {
    if (Array.isArray(obj)) {
      return obj;
    }

    if (tableName && obj[tableName]) {
      return Array.isArray(obj[tableName]) ? obj[tableName] : [obj[tableName]];
    }

    // Find the first array property
    for (const key of Object.keys(obj)) {
      if (Array.isArray(obj[key])) {
        return obj[key];
      }
      if (typeof obj[key] === 'object' && obj[key] !== null) {
        const nested = this.extractXMLRecords(obj[key]);
        if (nested.length > 0) {
          return nested;
        }
      }
    }

    return [obj];
  }

  /**
   * XML value processor to handle empty elements
   */
  private xmlValueProcessor(value: any): any {
    if (value === '' || value === null || value === undefined) {
      return null;
    }
    return value;
  }

  /**
   * Get ServiceNow table name from entity type
   */
  private getTableNameFromEntityType(entityType: EntityType): string {
    const tableMap: Record<EntityType, string> = {
      incident: 'incident',
      request: 'sc_request',
      change: 'change_request',
      user: 'sys_user',
      group: 'sys_user_group',
      application: 'cmdb_ci_appl',
      problem: 'problem',
    };

    return tableMap[entityType] || entityType;
  }

  /**
   * Convert ServiceNow record to ParsedRecord
   */
  private convertToRecord(
    data: Record<string, any>,
    entityType: EntityType,
    index: number
  ): ParsedRecord {
    // Extract source ID (sys_id or number)
    const sourceId = data.sys_id || data.number || data.u_number || `record_${index}`;

    // Flatten nested objects (ServiceNow often has nested reference fields)
    const flatData = this.flattenServiceNowData(data);

    // Extract metadata
    const metadata = {
      createdAt: this.parseDate(data.sys_created_on || data.opened_at),
      updatedAt: this.parseDate(data.sys_updated_on || data.updated_at),
      createdBy: this.extractUserReference(data.sys_created_by || data.opened_by),
      updatedBy: this.extractUserReference(data.sys_updated_by),
    };

    return {
      sourceId,
      entityType,
      data: flatData,
      metadata,
    };
  }

  /**
   * Flatten ServiceNow nested data structure
   * ServiceNow exports often have structure like: { assigned_to: { value: "id", display_value: "Name" } }
   */
  private flattenServiceNowData(data: Record<string, any>): Record<string, any> {
    const flattened: Record<string, any> = {};

    for (const [key, value] of Object.entries(data)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        // Handle ServiceNow reference fields
        if (value.value !== undefined) {
          flattened[key] = value.value;
          if (value.display_value) {
            flattened[`${key}_display`] = value.display_value;
          }
        } else if (value.link) {
          // Handle link fields
          flattened[key] = value.link;
        } else {
          // Recursively flatten nested objects
          const nested = this.flattenServiceNowData(value);
          for (const [nestedKey, nestedValue] of Object.entries(nested)) {
            flattened[`${key}.${nestedKey}`] = nestedValue;
          }
        }
      } else {
        flattened[key] = value;
      }
    }

    return flattened;
  }

  /**
   * Extract user reference from ServiceNow data
   */
  private extractUserReference(value: any): string | undefined {
    if (!value) return undefined;

    if (typeof value === 'string') {
      return value;
    }

    if (typeof value === 'object') {
      return value.value || value.user_name || value.email || value.display_value;
    }

    return undefined;
  }

  /**
   * Parse ServiceNow date format
   */
  private parseDate(value: any): Date | undefined {
    if (!value) return undefined;

    try {
      // ServiceNow dates are typically in format: "2024-01-15 10:30:45"
      const date = new Date(value);
      if (!isNaN(date.getTime())) {
        return date;
      }
    } catch {
      // Invalid date
    }

    return undefined;
  }

  /**
   * Validate ServiceNow export structure
   */
  async validate(buffer: Buffer): Promise<{
    valid: boolean;
    errors: string[];
    format: 'xml' | 'json';
    recordCount: number;
  }> {
    const errors: string[] = [];
    const format = this.detectFormat(buffer);

    try {
      if (format === 'json') {
        const content = buffer.toString('utf-8');
        const data = JSON.parse(content);
        const rows = Array.isArray(data) ? data : (data.records || data.result || []);

        if (rows.length === 0) {
          errors.push('No records found in JSON export');
        }

        return {
          valid: errors.length === 0,
          errors,
          format: 'json',
          recordCount: rows.length,
        };
      } else {
        const content = buffer.toString('utf-8');
        const result = await parseStringPromise(content);

        const rows = this.extractXMLRecords(result);

        if (rows.length === 0) {
          errors.push('No records found in XML export');
        }

        return {
          valid: errors.length === 0,
          errors,
          format: 'xml',
          recordCount: rows.length,
        };
      }
    } catch (error) {
      return {
        valid: false,
        errors: [error instanceof Error ? error.message : 'Unknown validation error'],
        format,
        recordCount: 0,
      };
    }
  }
}

export const serviceNowParser = new ServiceNowParser();
