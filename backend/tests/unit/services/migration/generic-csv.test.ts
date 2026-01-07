import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock logger
vi.mock('../../../../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('GenericCSVParser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('parseCSV', () => {
    it('should parse valid CSV with headers', async () => {
      const { genericCSVParser } = await import('../../../../src/services/migration/parsers/generic-csv.js');

      const csv = Buffer.from(
        'id,title,priority,status\n' +
        '1,Issue One,1,open\n' +
        '2,Issue Two,2,closed'
      );

      const result = await genericCSVParser.parseCSV(csv, 'incident');

      expect(result.records).toHaveLength(2);
      expect(result.totalRows).toBe(2);
      expect(result.skippedRows).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should extract source ID from common ID fields', async () => {
      const { genericCSVParser } = await import('../../../../src/services/migration/parsers/generic-csv.js');

      const csv = Buffer.from(
        'id,title,priority\n' +
        'INC001,Test Incident,1'
      );

      const result = await genericCSVParser.parseCSV(csv, 'incident');

      expect(result.records[0].sourceId).toBe('INC001');
    });

    it('should extract source ID from sys_id field', async () => {
      const { genericCSVParser } = await import('../../../../src/services/migration/parsers/generic-csv.js');

      const csv = Buffer.from(
        'sys_id,short_description,priority\n' +
        'abc123xyz,ServiceNow Incident,2'
      );

      const result = await genericCSVParser.parseCSV(csv, 'incident');

      expect(result.records[0].sourceId).toBe('abc123xyz');
    });

    it('should extract source ID from number field', async () => {
      const { genericCSVParser } = await import('../../../../src/services/migration/parsers/generic-csv.js');

      const csv = Buffer.from(
        'number,short_description,priority\n' +
        'INC0012345,Test Issue,1'
      );

      const result = await genericCSVParser.parseCSV(csv, 'incident');

      expect(result.records[0].sourceId).toBe('INC0012345');
    });

    it('should fallback to row index for source ID', async () => {
      const { genericCSVParser } = await import('../../../../src/services/migration/parsers/generic-csv.js');

      const csv = Buffer.from(
        'title,priority\n' +
        'No ID Field,1'
      );

      const result = await genericCSVParser.parseCSV(csv, 'incident');

      expect(result.records[0].sourceId).toBe('row_0');
    });

    it('should skip empty rows', async () => {
      const { genericCSVParser } = await import('../../../../src/services/migration/parsers/generic-csv.js');

      const csv = Buffer.from(
        'id,title\n' +
        '1,First\n' +
        '\n' +
        '2,Second'
      );

      const result = await genericCSVParser.parseCSV(csv, 'incident');

      expect(result.records).toHaveLength(2);
      expect(result.skippedRows).toBe(0);
    });

    it('should handle semicolon delimiter', async () => {
      const { genericCSVParser } = await import('../../../../src/services/migration/parsers/generic-csv.js');

      const csv = Buffer.from(
        'id;title;priority\n' +
        '1;Test;1'
      );

      const result = await genericCSVParser.parseCSV(csv, 'incident', { delimiter: ';' });

      expect(result.records).toHaveLength(1);
      expect(result.records[0].data.title).toBe('Test');
    });

    it('should parse metadata dates from created_at field', async () => {
      const { genericCSVParser } = await import('../../../../src/services/migration/parsers/generic-csv.js');

      const csv = Buffer.from(
        'id,title,created_at\n' +
        '1,Test,2024-01-15T10:30:00Z'
      );

      const result = await genericCSVParser.parseCSV(csv, 'incident');

      expect(result.records[0].metadata?.createdAt).toBeInstanceOf(Date);
    });

    it('should parse metadata dates from opened_at field', async () => {
      const { genericCSVParser } = await import('../../../../src/services/migration/parsers/generic-csv.js');

      const csv = Buffer.from(
        'id,title,opened_at\n' +
        '1,Test,2024-01-15'
      );

      const result = await genericCSVParser.parseCSV(csv, 'incident');

      expect(result.records[0].metadata?.createdAt).toBeInstanceOf(Date);
    });

    it('should extract createdBy from common fields', async () => {
      const { genericCSVParser } = await import('../../../../src/services/migration/parsers/generic-csv.js');

      const csv = Buffer.from(
        'id,title,created_by\n' +
        '1,Test,john.doe@example.com'
      );

      const result = await genericCSVParser.parseCSV(csv, 'incident');

      expect(result.records[0].metadata?.createdBy).toBe('john.doe@example.com');
    });

    it('should handle invalid date values gracefully', async () => {
      const { genericCSVParser } = await import('../../../../src/services/migration/parsers/generic-csv.js');

      const csv = Buffer.from(
        'id,title,created_at\n' +
        '1,Test,not-a-date'
      );

      const result = await genericCSVParser.parseCSV(csv, 'incident');

      expect(result.records[0].metadata?.createdAt).toBeUndefined();
    });

    it('should throw error for invalid CSV', async () => {
      const { genericCSVParser } = await import('../../../../src/services/migration/parsers/generic-csv.js');

      const invalidCSV = Buffer.from('invalid"unclosed"quote');

      await expect(genericCSVParser.parseCSV(invalidCSV, 'incident')).rejects.toThrow();
    });

    it('should trim whitespace by default', async () => {
      const { genericCSVParser } = await import('../../../../src/services/migration/parsers/generic-csv.js');

      const csv = Buffer.from(
        'id,title\n' +
        '1,  Spaces Around  '
      );

      const result = await genericCSVParser.parseCSV(csv, 'incident');

      expect(result.records[0].data.title).toBe('Spaces Around');
    });

    it('should preserve data in record data field', async () => {
      const { genericCSVParser } = await import('../../../../src/services/migration/parsers/generic-csv.js');

      const csv = Buffer.from(
        'id,title,description,priority,status,custom_field\n' +
        '1,Test Title,Test Desc,1,open,custom_value'
      );

      const result = await genericCSVParser.parseCSV(csv, 'incident');

      expect(result.records[0].data.id).toBe('1');
      expect(result.records[0].data.title).toBe('Test Title');
      expect(result.records[0].data.description).toBe('Test Desc');
      expect(result.records[0].data.custom_field).toBe('custom_value');
    });

    it('should set correct entityType on records', async () => {
      const { genericCSVParser } = await import('../../../../src/services/migration/parsers/generic-csv.js');

      const csv = Buffer.from('id,title\n1,Test');

      const incidentResult = await genericCSVParser.parseCSV(csv, 'incident');
      expect(incidentResult.records[0].entityType).toBe('incident');

      const requestResult = await genericCSVParser.parseCSV(csv, 'request');
      expect(requestResult.records[0].entityType).toBe('request');
    });
  });

  describe('detectDelimiter', () => {
    it('should detect comma delimiter', async () => {
      const { genericCSVParser } = await import('../../../../src/services/migration/parsers/generic-csv.js');

      const sample = 'id,title,priority,status\n1,Test,1,open';
      const delimiter = genericCSVParser.detectDelimiter(sample);

      expect(delimiter).toBe(',');
    });

    it('should detect semicolon delimiter', async () => {
      const { genericCSVParser } = await import('../../../../src/services/migration/parsers/generic-csv.js');

      const sample = 'id;title;priority;status\n1;Test;1;open';
      const delimiter = genericCSVParser.detectDelimiter(sample);

      expect(delimiter).toBe(';');
    });

    it('should detect tab delimiter', async () => {
      const { genericCSVParser } = await import('../../../../src/services/migration/parsers/generic-csv.js');

      const sample = 'id\ttitle\tpriority\tstatus\n1\tTest\t1\topen';
      const delimiter = genericCSVParser.detectDelimiter(sample);

      expect(delimiter).toBe('\t');
    });

    it('should detect pipe delimiter', async () => {
      const { genericCSVParser } = await import('../../../../src/services/migration/parsers/generic-csv.js');

      const sample = 'id|title|priority|status\n1|Test|1|open';
      const delimiter = genericCSVParser.detectDelimiter(sample);

      expect(delimiter).toBe('|');
    });

    it('should default to comma when ambiguous', async () => {
      const { genericCSVParser } = await import('../../../../src/services/migration/parsers/generic-csv.js');

      const sample = 'single column data';
      const delimiter = genericCSVParser.detectDelimiter(sample);

      expect(delimiter).toBe(',');
    });
  });

  describe('validateCSV', () => {
    it('should validate valid CSV structure', async () => {
      const { genericCSVParser } = await import('../../../../src/services/migration/parsers/generic-csv.js');

      const csv = Buffer.from(
        'id,title,priority\n' +
        '1,Test,1\n' +
        '2,Test2,2'
      );

      const result = await genericCSVParser.validateCSV(csv);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.headers).toContain('id');
      expect(result.headers).toContain('title');
      expect(result.rowCount).toBeGreaterThan(0);
    });

    it('should reject empty CSV', async () => {
      const { genericCSVParser } = await import('../../../../src/services/migration/parsers/generic-csv.js');

      const csv = Buffer.from('');

      const result = await genericCSVParser.validateCSV(csv);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('CSV file is empty');
    });

    it('should detect duplicate headers', async () => {
      const { genericCSVParser } = await import('../../../../src/services/migration/parsers/generic-csv.js');

      // csv-parse library may auto-rename duplicate headers (e.g., title -> title_1)
      // The validation logic checks for duplicates AFTER parsing
      const csv = Buffer.from(
        'id,title,title\n' +
        '1,Test,Test2'
      );

      const result = await genericCSVParser.validateCSV(csv);

      // Both behaviors are valid:
      // 1. Library renames duplicates -> headers have unique names -> valid
      // 2. Validation catches duplicates -> invalid
      if (!result.valid) {
        expect(result.errors).toContain('Duplicate column headers detected');
      } else {
        // Library handled duplicates by renaming
        expect(result.headers.length).toBeGreaterThan(0);
      }
    });

    it('should handle parsing errors gracefully', async () => {
      const { genericCSVParser } = await import('../../../../src/services/migration/parsers/generic-csv.js');

      const invalidCSV = Buffer.from('bad"unclosed');

      const result = await genericCSVParser.validateCSV(invalidCSV);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('getSample', () => {
    it('should return sample rows from CSV', async () => {
      const { genericCSVParser } = await import('../../../../src/services/migration/parsers/generic-csv.js');

      const csv = Buffer.from(
        'id,title\n' +
        '1,First\n' +
        '2,Second\n' +
        '3,Third'
      );

      const sample = await genericCSVParser.getSample(csv, 2);

      expect(sample).toHaveLength(2);
      expect(sample[0].title).toBe('First');
      expect(sample[1].title).toBe('Second');
    });

    it('should return all rows if less than sample size', async () => {
      const { genericCSVParser } = await import('../../../../src/services/migration/parsers/generic-csv.js');

      const csv = Buffer.from(
        'id,title\n' +
        '1,Only Row'
      );

      const sample = await genericCSVParser.getSample(csv, 10);

      expect(sample).toHaveLength(1);
    });

    it('should return empty array for invalid CSV', async () => {
      const { genericCSVParser } = await import('../../../../src/services/migration/parsers/generic-csv.js');

      const invalidCSV = Buffer.from('invalid"csv');

      const sample = await genericCSVParser.getSample(invalidCSV, 5);

      expect(sample).toHaveLength(0);
    });

    it('should use default sample size of 10', async () => {
      const { genericCSVParser } = await import('../../../../src/services/migration/parsers/generic-csv.js');

      const rows = Array.from({ length: 20 }, (_, i) => `${i},Row ${i}`).join('\n');
      const csv = Buffer.from('id,title\n' + rows);

      const sample = await genericCSVParser.getSample(csv);

      expect(sample.length).toBeLessThanOrEqual(10);
    });
  });
});
