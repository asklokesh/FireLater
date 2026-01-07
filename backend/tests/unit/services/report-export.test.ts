import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock ExcelJS
const mockAddRow = vi.fn().mockReturnValue({ font: {}, fill: {}, getCell: () => ({ font: {} }) });
const mockAddWorksheet = vi.fn().mockReturnValue({
  addRow: mockAddRow,
  mergeCells: vi.fn(),
  getRow: vi.fn().mockReturnValue({ font: {} }),
  columns: [],
});
const mockWriteBuffer = vi.fn().mockResolvedValue(Buffer.from('excel-content'));

vi.mock('exceljs', () => ({
  default: {
    Workbook: vi.fn().mockImplementation(() => ({
      creator: '',
      created: null,
      addWorksheet: mockAddWorksheet,
      xlsx: {
        writeBuffer: mockWriteBuffer,
      },
    })),
  },
}));

// Mock fs
vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn().mockReturnValue(false),
  },
}));

// Mock logger
vi.mock('../../../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock puppeteer-core (will fail to import for fallback testing)
vi.mock('puppeteer-core', () => {
  throw new Error('Puppeteer not available');
});

import { reportExportService, ExportFormat } from '../../../src/services/report-export.js';

describe('ReportExportService', () => {
  const sampleReport = {
    title: 'Test Report',
    subtitle: 'Monthly Summary',
    generatedAt: new Date('2025-01-07T12:00:00Z'),
    dateRange: {
      start: new Date('2025-01-01'),
      end: new Date('2025-01-31'),
    },
    data: [
      { id: '1', name: 'Item 1', value: 100 },
      { id: '2', name: 'Item 2', value: 200 },
    ],
    summary: {
      totalItems: 2,
      totalValue: 300,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockAddRow.mockReturnValue({ font: {}, fill: {}, getCell: () => ({ font: {} }) });
  });

  // ============================================
  // JSON EXPORT
  // ============================================

  describe('exportToJson', () => {
    it('should export report data as formatted JSON string', () => {
      const result = reportExportService.exportToJson(sampleReport);
      const parsed = JSON.parse(result);

      expect(parsed.metadata.title).toBe('Test Report');
      expect(parsed.metadata.subtitle).toBe('Monthly Summary');
      expect(parsed.metadata.generatedAt).toBe('2025-01-07T12:00:00.000Z');
      expect(parsed.data).toEqual(sampleReport.data);
      expect(parsed.summary).toEqual(sampleReport.summary);
    });

    it('should include date range in metadata', () => {
      const result = reportExportService.exportToJson(sampleReport);
      const parsed = JSON.parse(result);

      expect(parsed.metadata.dateRange).toBeDefined();
      expect(parsed.metadata.dateRange.start).toBe('2025-01-01T00:00:00.000Z');
    });

    it('should handle report without date range', () => {
      const reportWithoutRange = { ...sampleReport, dateRange: undefined };
      const result = reportExportService.exportToJson(reportWithoutRange);
      const parsed = JSON.parse(result);

      expect(parsed.metadata.dateRange).toBeUndefined();
    });

    it('should handle report without subtitle', () => {
      const reportWithoutSubtitle = { ...sampleReport, subtitle: undefined };
      const result = reportExportService.exportToJson(reportWithoutSubtitle);
      const parsed = JSON.parse(result);

      expect(parsed.metadata.subtitle).toBeUndefined();
    });

    it('should handle report without summary', () => {
      const reportWithoutSummary = { ...sampleReport, summary: undefined };
      const result = reportExportService.exportToJson(reportWithoutSummary);
      const parsed = JSON.parse(result);

      expect(parsed.summary).toBeUndefined();
    });

    it('should handle single object data', () => {
      const reportWithObject = {
        ...sampleReport,
        data: { id: '1', name: 'Single Item' },
      };
      const result = reportExportService.exportToJson(reportWithObject);
      const parsed = JSON.parse(result);

      expect(parsed.data).toEqual({ id: '1', name: 'Single Item' });
    });
  });

  // ============================================
  // CSV EXPORT
  // ============================================

  describe('exportToCsv', () => {
    it('should export report data as CSV string', () => {
      const result = reportExportService.exportToCsv(sampleReport);
      const lines = result.split('\n');

      // Header row should contain all keys
      expect(lines[0]).toContain('id');
      expect(lines[0]).toContain('name');
      expect(lines[0]).toContain('value');

      // Data rows
      expect(lines[1]).toContain('1');
      expect(lines[1]).toContain('Item 1');
      expect(lines[1]).toContain('100');
    });

    it('should handle empty data array', () => {
      const emptyReport = { ...sampleReport, data: [] };
      const result = reportExportService.exportToCsv(emptyReport);

      expect(result).toBe('');
    });

    it('should escape values with commas', () => {
      const reportWithComma = {
        ...sampleReport,
        data: [{ name: 'Item, with comma', value: 100 }],
      };
      const result = reportExportService.exportToCsv(reportWithComma);

      expect(result).toContain('"Item, with comma"');
    });

    it('should escape values with quotes', () => {
      const reportWithQuotes = {
        ...sampleReport,
        data: [{ name: 'Item with "quotes"', value: 100 }],
      };
      const result = reportExportService.exportToCsv(reportWithQuotes);

      expect(result).toContain('"Item with ""quotes"""');
    });

    it('should escape values with newlines', () => {
      const reportWithNewline = {
        ...sampleReport,
        data: [{ name: 'Line1\nLine2', value: 100 }],
      };
      const result = reportExportService.exportToCsv(reportWithNewline);

      expect(result).toContain('"Line1\nLine2"');
    });

    it('should handle null and undefined values', () => {
      const reportWithNulls = {
        ...sampleReport,
        data: [
          { name: null, value: undefined, other: 'test' },
        ],
      };
      const result = reportExportService.exportToCsv(reportWithNulls);
      const lines = result.split('\n');

      // Empty values for null/undefined
      expect(lines[1]).toMatch(/^,.*test/);
    });

    it('should convert single object to array', () => {
      const reportWithObject = {
        ...sampleReport,
        data: { id: '1', name: 'Single' },
      };
      const result = reportExportService.exportToCsv(reportWithObject);
      const lines = result.split('\n');

      expect(lines.length).toBe(2); // header + 1 data row
    });

    it('should stringify object values', () => {
      const reportWithObject = {
        ...sampleReport,
        data: [{ name: 'Test', nested: { a: 1, b: 2 } }],
      };
      const result = reportExportService.exportToCsv(reportWithObject);

      // The JSON is escaped for CSV (quotes doubled), so check for escaped version
      expect(result).toContain('"a"');
      expect(result).toContain('"b"');
    });

    it('should handle objects with different keys', () => {
      const reportWithDifferentKeys = {
        ...sampleReport,
        data: [
          { a: 1, b: 2 },
          { b: 3, c: 4 },
        ],
      };
      const result = reportExportService.exportToCsv(reportWithDifferentKeys);
      const lines = result.split('\n');

      // Header should include all keys
      expect(lines[0]).toContain('a');
      expect(lines[0]).toContain('b');
      expect(lines[0]).toContain('c');
    });
  });

  // ============================================
  // EXCEL EXPORT
  // ============================================

  describe('exportToExcel', () => {
    it('should create workbook with title and data', async () => {
      const result = await reportExportService.exportToExcel(sampleReport);

      expect(result).toBeInstanceOf(Buffer);
      expect(mockAddWorksheet).toHaveBeenCalledWith('Report Data');
      expect(mockAddRow).toHaveBeenCalled();
    });

    it('should add subtitle when present', async () => {
      await reportExportService.exportToExcel(sampleReport);

      // Check that addRow was called with subtitle
      const calls = mockAddRow.mock.calls;
      const subtitleCall = calls.find((call: unknown[]) =>
        Array.isArray(call[0]) && call[0].includes('Monthly Summary')
      );
      expect(subtitleCall).toBeDefined();
    });

    it('should handle report without subtitle', async () => {
      const reportWithoutSubtitle = { ...sampleReport, subtitle: undefined };
      await reportExportService.exportToExcel(reportWithoutSubtitle);

      // The function should complete without error even without subtitle
      expect(mockAddWorksheet).toHaveBeenCalledWith('Report Data');
    });

    it('should add summary sheet when summary exists', async () => {
      await reportExportService.exportToExcel(sampleReport);

      expect(mockAddWorksheet).toHaveBeenCalledWith('Summary');
    });

    it('should handle empty data array', async () => {
      const emptyReport = { ...sampleReport, data: [] };
      const result = await reportExportService.exportToExcel(emptyReport);

      expect(result).toBeInstanceOf(Buffer);
    });

    it('should handle single object data', async () => {
      const reportWithObject = {
        ...sampleReport,
        data: { id: '1', name: 'Single' },
      };
      const result = await reportExportService.exportToExcel(reportWithObject);

      expect(result).toBeInstanceOf(Buffer);
    });

    it('should return buffer from writeBuffer', async () => {
      const expectedBuffer = Buffer.from('test-excel-content');
      mockWriteBuffer.mockResolvedValueOnce(expectedBuffer);

      const result = await reportExportService.exportToExcel(sampleReport);

      expect(result).toEqual(expectedBuffer);
    });
  });

  // ============================================
  // PDF EXPORT
  // ============================================

  describe('exportToPdf', () => {
    it('should return HTML buffer when puppeteer not available', async () => {
      const result = await reportExportService.exportToPdf(sampleReport);

      expect(result).toBeInstanceOf(Buffer);
      const html = result.toString('utf-8');
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('Test Report');
    });

    it('should include subtitle in HTML', async () => {
      const result = await reportExportService.exportToPdf(sampleReport);
      const html = result.toString('utf-8');

      expect(html).toContain('Monthly Summary');
    });

    it('should include data table in HTML', async () => {
      const result = await reportExportService.exportToPdf(sampleReport);
      const html = result.toString('utf-8');

      expect(html).toContain('<table>');
      expect(html).toContain('Item 1');
      expect(html).toContain('Item 2');
    });

    it('should include summary section in HTML', async () => {
      const result = await reportExportService.exportToPdf(sampleReport);
      const html = result.toString('utf-8');

      expect(html).toContain('Summary');
      expect(html).toContain('Total Items');
    });

    it('should handle report without summary', async () => {
      const reportWithoutSummary = { ...sampleReport, summary: undefined };
      const result = await reportExportService.exportToPdf(reportWithoutSummary);
      const html = result.toString('utf-8');

      expect(html).not.toContain('class="summary"');
    });

    it('should handle empty data array', async () => {
      const emptyReport = { ...sampleReport, data: [] };
      const result = await reportExportService.exportToPdf(emptyReport);
      const html = result.toString('utf-8');

      expect(html).toContain('<!DOCTYPE html>');
      expect(html).not.toContain('<table>');
    });

    it('should handle null values in data', async () => {
      const reportWithNulls = {
        ...sampleReport,
        data: [{ name: null, value: undefined }],
      };
      const result = await reportExportService.exportToPdf(reportWithNulls);
      const html = result.toString('utf-8');

      expect(html).toContain('<td></td>');
    });

    it('should include date range in metadata when present', async () => {
      const result = await reportExportService.exportToPdf(sampleReport);
      const html = result.toString('utf-8');

      expect(html).toContain('Date Range');
    });
  });

  // ============================================
  // UNIFIED EXPORT METHOD
  // ============================================

  describe('export', () => {
    it('should export as JSON with correct mime type', async () => {
      const result = await reportExportService.export(sampleReport, 'json');

      expect(result.mimeType).toBe('application/json');
      expect(result.extension).toBe('.json');
      expect(typeof result.content).toBe('string');
    });

    it('should export as CSV with correct mime type', async () => {
      const result = await reportExportService.export(sampleReport, 'csv');

      expect(result.mimeType).toBe('text/csv');
      expect(result.extension).toBe('.csv');
      expect(typeof result.content).toBe('string');
    });

    it('should export as XLSX with correct mime type', async () => {
      const result = await reportExportService.export(sampleReport, 'xlsx');

      expect(result.mimeType).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      expect(result.extension).toBe('.xlsx');
      expect(result.content).toBeInstanceOf(Buffer);
    });

    it('should export as PDF with correct mime type', async () => {
      const result = await reportExportService.export(sampleReport, 'pdf');

      expect(result.mimeType).toBe('application/pdf');
      expect(result.extension).toBe('.pdf');
      expect(result.content).toBeInstanceOf(Buffer);
    });

    it('should throw error for unsupported format', async () => {
      await expect(
        reportExportService.export(sampleReport, 'invalid' as ExportFormat)
      ).rejects.toThrow('Unsupported export format: invalid');
    });
  });

  // ============================================
  // FORMATTING UTILITIES
  // ============================================

  describe('formatting utilities', () => {
    it('should format snake_case keys to Title Case', async () => {
      const reportWithSnakeCase = {
        ...sampleReport,
        summary: { total_items: 2, average_value: 150 },
      };
      const result = await reportExportService.exportToPdf(reportWithSnakeCase);
      const html = result.toString('utf-8');

      expect(html).toContain('Total items');
      expect(html).toContain('Average value');
    });

    it('should format camelCase keys to Title Case', async () => {
      const reportWithCamelCase = {
        ...sampleReport,
        summary: { totalItems: 2, averageValue: 150 },
      };
      const result = await reportExportService.exportToPdf(reportWithCamelCase);
      const html = result.toString('utf-8');

      expect(html).toContain('Total Items');
      expect(html).toContain('Average Value');
    });
  });

  // ============================================
  // CHROME DETECTION
  // ============================================

  describe('Chrome detection (findChrome)', () => {
    it('should return undefined when no Chrome path exists', async () => {
      // The mock sets existsSync to return false for all paths
      const result = await reportExportService.exportToPdf(sampleReport);

      // With no Chrome and puppeteer throwing, should return HTML fallback
      expect(result).toBeInstanceOf(Buffer);
      const html = result.toString('utf-8');
      expect(html).toContain('<!DOCTYPE html>');
    });
  });

  // ============================================
  // EDGE CASES
  // ============================================

  describe('edge cases', () => {
    it('should handle very large data arrays', async () => {
      const largeData = Array.from({ length: 1000 }, (_, i) => ({
        id: String(i),
        name: `Item ${i}`,
        value: i * 10,
      }));
      const largeReport = { ...sampleReport, data: largeData };

      const result = await reportExportService.export(largeReport, 'csv');
      const lines = result.content.toString().split('\n');

      expect(lines.length).toBe(1001); // header + 1000 rows
    });

    it('should handle special characters in data', async () => {
      const reportWithSpecialChars = {
        ...sampleReport,
        data: [{ name: '<script>alert("xss")</script>', value: '&amp;' }],
      };

      const jsonResult = reportExportService.exportToJson(reportWithSpecialChars);
      expect(jsonResult).toContain('<script>');

      const csvResult = reportExportService.exportToCsv(reportWithSpecialChars);
      expect(csvResult).toContain('<script>');
    });

    it('should handle numeric strings', async () => {
      const reportWithNumericStrings = {
        ...sampleReport,
        data: [{ id: '001', zipCode: '10001', value: '1000' }],
      };

      const csvResult = reportExportService.exportToCsv(reportWithNumericStrings);
      expect(csvResult).toContain('001');
      expect(csvResult).toContain('10001');
    });

    it('should handle boolean values', async () => {
      const reportWithBooleans = {
        ...sampleReport,
        data: [{ active: true, deleted: false }],
      };

      const csvResult = reportExportService.exportToCsv(reportWithBooleans);
      expect(csvResult).toContain('true');
      expect(csvResult).toContain('false');
    });

    it('should handle Date objects in data', async () => {
      const date = new Date('2025-01-07');
      const reportWithDates = {
        ...sampleReport,
        data: [{ createdAt: date, name: 'Test' }],
      };

      const csvResult = reportExportService.exportToCsv(reportWithDates);
      // Date will be converted to string via String(val)
      expect(csvResult).toContain('2025');
    });
  });
});
