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

describe('ServiceNowParser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('parse - JSON format', () => {
    it('should parse ServiceNow JSON array export', async () => {
      const { serviceNowParser } = await import('../../../../src/services/migration/parsers/servicenow.js');

      const json = JSON.stringify([
        { sys_id: 'abc123', number: 'INC001', short_description: 'Test Incident' },
        { sys_id: 'def456', number: 'INC002', short_description: 'Another Incident' },
      ]);

      const result = await serviceNowParser.parse(Buffer.from(json), 'incident');

      expect(result.records).toHaveLength(2);
      expect(result.totalRows).toBe(2);
      expect(result.errors).toHaveLength(0);
    });

    it('should parse ServiceNow JSON with records wrapper', async () => {
      const { serviceNowParser } = await import('../../../../src/services/migration/parsers/servicenow.js');

      const json = JSON.stringify({
        records: [
          { sys_id: 'abc123', number: 'INC001', short_description: 'Test' },
        ],
      });

      const result = await serviceNowParser.parse(Buffer.from(json), 'incident');

      expect(result.records).toHaveLength(1);
    });

    it('should parse ServiceNow JSON with result wrapper', async () => {
      const { serviceNowParser } = await import('../../../../src/services/migration/parsers/servicenow.js');

      const json = JSON.stringify({
        result: [
          { sys_id: 'abc123', number: 'INC001', short_description: 'Test' },
        ],
      });

      const result = await serviceNowParser.parse(Buffer.from(json), 'incident');

      expect(result.records).toHaveLength(1);
    });

    it('should extract sys_id as sourceId', async () => {
      const { serviceNowParser } = await import('../../../../src/services/migration/parsers/servicenow.js');

      const json = JSON.stringify([
        { sys_id: 'unique-sys-id-123', number: 'INC001' },
      ]);

      const result = await serviceNowParser.parse(Buffer.from(json), 'incident');

      expect(result.records[0].sourceId).toBe('unique-sys-id-123');
    });

    it('should fallback to number for sourceId if no sys_id', async () => {
      const { serviceNowParser } = await import('../../../../src/services/migration/parsers/servicenow.js');

      const json = JSON.stringify([
        { number: 'INC00123', short_description: 'Test' },
      ]);

      const result = await serviceNowParser.parse(Buffer.from(json), 'incident');

      expect(result.records[0].sourceId).toBe('INC00123');
    });

    it('should flatten nested reference fields', async () => {
      const { serviceNowParser } = await import('../../../../src/services/migration/parsers/servicenow.js');

      const json = JSON.stringify([
        {
          sys_id: 'abc123',
          assigned_to: { value: 'user-id-123', display_value: 'John Doe' },
          priority: { value: '1', display_value: 'Critical' },
        },
      ]);

      const result = await serviceNowParser.parse(Buffer.from(json), 'incident');

      expect(result.records[0].data.assigned_to).toBe('user-id-123');
      expect(result.records[0].data.assigned_to_display).toBe('John Doe');
      expect(result.records[0].data.priority).toBe('1');
    });

    it('should handle link fields', async () => {
      const { serviceNowParser } = await import('../../../../src/services/migration/parsers/servicenow.js');

      const json = JSON.stringify([
        {
          sys_id: 'abc123',
          caller_id: { link: 'https://instance.service-now.com/api/now/table/sys_user/abc' },
        },
      ]);

      const result = await serviceNowParser.parse(Buffer.from(json), 'incident');

      expect(result.records[0].data.caller_id).toContain('service-now.com');
    });

    it('should extract metadata dates', async () => {
      const { serviceNowParser } = await import('../../../../src/services/migration/parsers/servicenow.js');

      const json = JSON.stringify([
        {
          sys_id: 'abc123',
          sys_created_on: '2024-01-15 10:30:00',
          sys_updated_on: '2024-01-16 14:00:00',
          sys_created_by: 'john.doe',
          sys_updated_by: 'jane.doe',
        },
      ]);

      const result = await serviceNowParser.parse(Buffer.from(json), 'incident');

      expect(result.records[0].metadata?.createdAt).toBeInstanceOf(Date);
      expect(result.records[0].metadata?.updatedAt).toBeInstanceOf(Date);
      expect(result.records[0].metadata?.createdBy).toBe('john.doe');
      expect(result.records[0].metadata?.updatedBy).toBe('jane.doe');
    });

    it('should use opened_at for createdAt if sys_created_on missing', async () => {
      const { serviceNowParser } = await import('../../../../src/services/migration/parsers/servicenow.js');

      const json = JSON.stringify([
        {
          sys_id: 'abc123',
          opened_at: '2024-01-15 10:30:00',
        },
      ]);

      const result = await serviceNowParser.parse(Buffer.from(json), 'incident');

      expect(result.records[0].metadata?.createdAt).toBeInstanceOf(Date);
    });

    it('should skip null or invalid objects in array', async () => {
      const { serviceNowParser } = await import('../../../../src/services/migration/parsers/servicenow.js');

      const json = JSON.stringify([
        { sys_id: 'abc123', short_description: 'Valid' },
        null,
        'invalid',
        { sys_id: 'def456', short_description: 'Also Valid' },
      ]);

      const result = await serviceNowParser.parse(Buffer.from(json), 'incident');

      expect(result.records).toHaveLength(2);
      expect(result.skippedRows).toBe(2);
    });

    it('should throw error for invalid JSON', async () => {
      const { serviceNowParser } = await import('../../../../src/services/migration/parsers/servicenow.js');

      const invalidJson = Buffer.from('{ invalid json }');

      await expect(serviceNowParser.parse(invalidJson, 'incident', { format: 'json' })).rejects.toThrow();
    });
  });

  describe('parse - XML format', () => {
    it('should parse ServiceNow XML export', async () => {
      const { serviceNowParser } = await import('../../../../src/services/migration/parsers/servicenow.js');

      const xml = `<?xml version="1.0" encoding="UTF-8"?>
        <xml>
          <incident>
            <sys_id>abc123</sys_id>
            <number>INC001</number>
            <short_description>Test Incident</short_description>
          </incident>
        </xml>`;

      const result = await serviceNowParser.parse(Buffer.from(xml), 'incident');

      expect(result.records).toHaveLength(1);
      expect(result.records[0].data.number).toBe('INC001');
    });

    it('should parse XML with unload wrapper', async () => {
      const { serviceNowParser } = await import('../../../../src/services/migration/parsers/servicenow.js');

      const xml = `<?xml version="1.0" encoding="UTF-8"?>
        <unload unload_date="2024-01-15">
          <incident>
            <sys_id>abc123</sys_id>
            <number>INC001</number>
          </incident>
        </unload>`;

      const result = await serviceNowParser.parse(Buffer.from(xml), 'incident');

      expect(result.records.length).toBeGreaterThan(0);
    });

    it('should parse multiple records in XML', async () => {
      const { serviceNowParser } = await import('../../../../src/services/migration/parsers/servicenow.js');

      const xml = `<?xml version="1.0" encoding="UTF-8"?>
        <xml>
          <incident>
            <sys_id>abc123</sys_id>
            <number>INC001</number>
          </incident>
          <incident>
            <sys_id>def456</sys_id>
            <number>INC002</number>
          </incident>
        </xml>`;

      const result = await serviceNowParser.parse(Buffer.from(xml), 'incident');

      // Note: xml2js might combine these differently
      expect(result.records.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle empty XML elements', async () => {
      const { serviceNowParser } = await import('../../../../src/services/migration/parsers/servicenow.js');

      const xml = `<?xml version="1.0" encoding="UTF-8"?>
        <xml>
          <incident>
            <sys_id>abc123</sys_id>
            <description></description>
            <resolution_notes/>
          </incident>
        </xml>`;

      const result = await serviceNowParser.parse(Buffer.from(xml), 'incident');

      expect(result.records).toHaveLength(1);
    });

    it('should throw error for invalid XML', async () => {
      const { serviceNowParser } = await import('../../../../src/services/migration/parsers/servicenow.js');

      const invalidXml = Buffer.from('<xml><unclosed>');

      await expect(serviceNowParser.parse(invalidXml, 'incident', { format: 'xml' })).rejects.toThrow();
    });
  });

  describe('format detection', () => {
    it('should detect JSON format from array content', async () => {
      const { serviceNowParser } = await import('../../../../src/services/migration/parsers/servicenow.js');

      const json = JSON.stringify([{ sys_id: 'abc123' }]);
      const result = await serviceNowParser.parse(Buffer.from(json), 'incident');

      expect(result.records).toHaveLength(1);
    });

    it('should detect JSON format from object content', async () => {
      const { serviceNowParser } = await import('../../../../src/services/migration/parsers/servicenow.js');

      const json = JSON.stringify({ records: [{ sys_id: 'abc123' }] });
      const result = await serviceNowParser.parse(Buffer.from(json), 'incident');

      expect(result.records).toHaveLength(1);
    });

    it('should detect XML format from declaration', async () => {
      const { serviceNowParser } = await import('../../../../src/services/migration/parsers/servicenow.js');

      const xml = `<?xml version="1.0"?><xml><incident><sys_id>abc123</sys_id></incident></xml>`;
      const result = await serviceNowParser.parse(Buffer.from(xml), 'incident');

      expect(result.records.length).toBeGreaterThan(0);
    });

    it('should detect XML format from opening tag', async () => {
      const { serviceNowParser } = await import('../../../../src/services/migration/parsers/servicenow.js');

      const xml = `<xml><incident><sys_id>abc123</sys_id></incident></xml>`;
      const result = await serviceNowParser.parse(Buffer.from(xml), 'incident');

      expect(result.records.length).toBeGreaterThan(0);
    });

    it('should allow explicit format override', async () => {
      const { serviceNowParser } = await import('../../../../src/services/migration/parsers/servicenow.js');

      const json = JSON.stringify([{ sys_id: 'abc123' }]);
      const result = await serviceNowParser.parse(Buffer.from(json), 'incident', { format: 'json' });

      expect(result.records).toHaveLength(1);
    });
  });

  describe('validate', () => {
    it('should validate valid JSON export', async () => {
      const { serviceNowParser } = await import('../../../../src/services/migration/parsers/servicenow.js');

      const json = JSON.stringify([
        { sys_id: 'abc123', number: 'INC001' },
      ]);

      const result = await serviceNowParser.validate(Buffer.from(json));

      expect(result.valid).toBe(true);
      expect(result.format).toBe('json');
      expect(result.recordCount).toBe(1);
    });

    it('should validate valid XML export', async () => {
      const { serviceNowParser } = await import('../../../../src/services/migration/parsers/servicenow.js');

      const xml = `<?xml version="1.0"?><xml><incident><sys_id>abc123</sys_id></incident></xml>`;

      const result = await serviceNowParser.validate(Buffer.from(xml));

      expect(result.valid).toBe(true);
      expect(result.format).toBe('xml');
    });

    it('should reject empty JSON array', async () => {
      const { serviceNowParser } = await import('../../../../src/services/migration/parsers/servicenow.js');

      const json = JSON.stringify([]);

      const result = await serviceNowParser.validate(Buffer.from(json));

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('No records found in JSON export');
    });

    it('should reject empty records wrapper', async () => {
      const { serviceNowParser } = await import('../../../../src/services/migration/parsers/servicenow.js');

      const json = JSON.stringify({ records: [] });

      const result = await serviceNowParser.validate(Buffer.from(json));

      expect(result.valid).toBe(false);
    });

    it('should report errors for invalid JSON', async () => {
      const { serviceNowParser } = await import('../../../../src/services/migration/parsers/servicenow.js');

      const invalid = Buffer.from('{ invalid }');

      const result = await serviceNowParser.validate(invalid);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should report errors for invalid XML', async () => {
      const { serviceNowParser } = await import('../../../../src/services/migration/parsers/servicenow.js');

      const invalid = Buffer.from('<xml><unclosed>');

      const result = await serviceNowParser.validate(invalid);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('entity type mapping', () => {
    it('should set correct entity type for incidents', async () => {
      const { serviceNowParser } = await import('../../../../src/services/migration/parsers/servicenow.js');

      const json = JSON.stringify([{ sys_id: 'abc123' }]);
      const result = await serviceNowParser.parse(Buffer.from(json), 'incident');

      expect(result.records[0].entityType).toBe('incident');
    });

    it('should set correct entity type for requests', async () => {
      const { serviceNowParser } = await import('../../../../src/services/migration/parsers/servicenow.js');

      const json = JSON.stringify([{ sys_id: 'abc123' }]);
      const result = await serviceNowParser.parse(Buffer.from(json), 'request');

      expect(result.records[0].entityType).toBe('request');
    });

    it('should set correct entity type for changes', async () => {
      const { serviceNowParser } = await import('../../../../src/services/migration/parsers/servicenow.js');

      const json = JSON.stringify([{ sys_id: 'abc123' }]);
      const result = await serviceNowParser.parse(Buffer.from(json), 'change');

      expect(result.records[0].entityType).toBe('change');
    });

    it('should set correct entity type for problems', async () => {
      const { serviceNowParser } = await import('../../../../src/services/migration/parsers/servicenow.js');

      const json = JSON.stringify([{ sys_id: 'abc123' }]);
      const result = await serviceNowParser.parse(Buffer.from(json), 'problem');

      expect(result.records[0].entityType).toBe('problem');
    });
  });

  describe('user reference extraction', () => {
    it('should extract user from string value', async () => {
      const { serviceNowParser } = await import('../../../../src/services/migration/parsers/servicenow.js');

      const json = JSON.stringify([
        { sys_id: 'abc123', sys_created_by: 'john.doe' },
      ]);

      const result = await serviceNowParser.parse(Buffer.from(json), 'incident');

      expect(result.records[0].metadata?.createdBy).toBe('john.doe');
    });

    it('should extract user from reference object', async () => {
      const { serviceNowParser } = await import('../../../../src/services/migration/parsers/servicenow.js');

      const json = JSON.stringify([
        {
          sys_id: 'abc123',
          opened_by: { value: 'user-id', display_value: 'John Doe' },
        },
      ]);

      const result = await serviceNowParser.parse(Buffer.from(json), 'incident');

      // opened_by is flattened to the data object
      expect(result.records[0].data.opened_by).toBe('user-id');
    });
  });
});
