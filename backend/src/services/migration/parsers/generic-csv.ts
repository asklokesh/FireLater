/**
 * Generic CSV Parser
 * Parses CSV files from various ITSM systems
 */

import { parse } from 'csv-parse/sync';
import type { ParsedRecord, EntityType, MigrationError } from '../types.js';
import { logger } from '../../../utils/logger.js';

export interface CSVParseOptions {
  delimiter?: string;
  columns?: boolean | string[];
  skipEmptyLines?: boolean;
  trim?: boolean;
}

export interface CSVParseResult {
  records: ParsedRecord[];
  errors: MigrationError[];
  totalRows: number;
  skippedRows: number;
}

export class GenericCSVParser {
  /**
   * Parse CSV buffer into structured records
   */
  async parseCSV(
    buffer: Buffer,
    entityType: EntityType,
    options: CSVParseOptions = {}
  ): Promise<CSVParseResult> {
    const errors: MigrationError[] = [];
    const records: ParsedRecord[] = [];
    let skippedRows = 0;

    try {
      const defaultOptions = {
        delimiter: ',',
        columns: true,
        skipEmptyLines: true,
        trim: true,
        ...options,
      };

      // Parse CSV
      const rows = parse(buffer, defaultOptions) as Record<string, any>[];

      logger.info(`Parsed ${rows.length} rows from CSV`);

      // Convert each row to ParsedRecord
      for (let i = 0; i < rows.length; i++) {
        try {
          const row = rows[i];

          // Validate row has some data
          if (!row || Object.keys(row).length === 0) {
            skippedRows++;
            continue;
          }

          // Extract source ID (look for common ID fields)
          const sourceId = this.extractSourceId(row, i);

          // Convert to ParsedRecord
          const record: ParsedRecord = {
            sourceId,
            entityType,
            data: row,
            metadata: {
              createdAt: this.parseDate(row['created_at'] || row['Created Date'] || row['opened_at']),
              updatedAt: this.parseDate(row['updated_at'] || row['Modified Date'] || row['updated']),
              createdBy: row['created_by'] || row['Created By'] || row['reporter'],
              updatedBy: row['updated_by'] || row['Modified By'],
            },
          };

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
      logger.error({ err: error }, 'CSV parsing failed');
      throw new Error(`CSV parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Extract source ID from row data
   * Looks for common ID field names
   */
  private extractSourceId(row: Record<string, any>, index: number): string {
    // Try common ID field names
    const idFields = [
      'id',
      'ID',
      'sys_id',
      'number',
      'Number',
      'Request ID',
      'Incident ID',
      'Change ID',
      'key',
      'Key',
      'ticket_number',
    ];

    for (const field of idFields) {
      if (row[field]) {
        return String(row[field]);
      }
    }

    // Fallback to row index
    return `row_${index}`;
  }

  /**
   * Parse date from various formats
   */
  private parseDate(value: any): Date | undefined {
    if (!value) return undefined;

    try {
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
   * Detect CSV delimiter
   */
  detectDelimiter(sample: string): string {
    const delimiters = [',', ';', '\t', '|'];
    let maxCount = 0;
    let detectedDelimiter = ',';

    for (const delimiter of delimiters) {
      const count = (sample.match(new RegExp(`\\${delimiter}`, 'g')) || []).length;
      if (count > maxCount) {
        maxCount = count;
        detectedDelimiter = delimiter;
      }
    }

    return detectedDelimiter;
  }

  /**
   * Validate CSV structure
   */
  async validateCSV(buffer: Buffer): Promise<{
    valid: boolean;
    errors: string[];
    headers: string[];
    rowCount: number;
  }> {
    const errors: string[] = [];

    try {
      // Parse just headers and first few rows
      const rows = parse(buffer, {
        columns: true,
        toLine: 10,
        skipEmptyLines: true,
        trim: true,
      }) as Record<string, any>[];

      if (rows.length === 0) {
        errors.push('CSV file is empty');
        return { valid: false, errors, headers: [], rowCount: 0 };
      }

      const headers = rows[0] ? Object.keys(rows[0]) : [];

      if (headers.length === 0) {
        errors.push('No columns found in CSV');
      }

      // Check for duplicate headers
      const headerSet = new Set(headers);
      if (headerSet.size !== headers.length) {
        errors.push('Duplicate column headers detected');
      }

      return {
        valid: errors.length === 0,
        errors,
        headers,
        rowCount: rows.length,
      };
    } catch (error) {
      return {
        valid: false,
        errors: [error instanceof Error ? error.message : 'Unknown validation error'],
        headers: [],
        rowCount: 0,
      };
    }
  }

  /**
   * Get sample data from CSV
   */
  async getSample(buffer: Buffer, sampleSize: number = 10): Promise<Record<string, any>[]> {
    try {
      const rows = parse(buffer, {
        columns: true,
        toLine: sampleSize + 1,
        skipEmptyLines: true,
        trim: true,
      }) as Record<string, any>[];

      return rows;
    } catch (error) {
      logger.error({ err: error }, 'Failed to get CSV sample');
      return [];
    }
  }
}

export const genericCSVParser = new GenericCSVParser();
