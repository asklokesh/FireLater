import fs from 'fs';
import ExcelJS from 'exceljs';
import { logger } from '../utils/logger.js';

// ============================================
// REPORT EXPORT SERVICE
// ============================================
// Generates PDF and Excel exports of reports

export type ExportFormat = 'json' | 'csv' | 'xlsx' | 'pdf';

interface ReportData {
  title: string;
  subtitle?: string;
  generatedAt: Date;
  dateRange?: { start: Date; end: Date };
  data: Record<string, unknown> | Record<string, unknown>[];
  summary?: Record<string, unknown>;
}

class ReportExportService {
  // ============================================
  // JSON EXPORT
  // ============================================

  exportToJson(report: ReportData): string {
    return JSON.stringify({
      metadata: {
        title: report.title,
        subtitle: report.subtitle,
        generatedAt: report.generatedAt.toISOString(),
        dateRange: report.dateRange
          ? {
              start: report.dateRange.start.toISOString(),
              end: report.dateRange.end.toISOString(),
            }
          : undefined,
      },
      data: report.data,
      summary: report.summary,
    }, null, 2);
  }

  // ============================================
  // CSV EXPORT
  // ============================================

  exportToCsv(report: ReportData): string {
    const data = Array.isArray(report.data) ? report.data : [report.data];

    if (data.length === 0) {
      return '';
    }

    // Get all unique keys across all objects
    const allKeys = new Set<string>();
    for (const row of data) {
      Object.keys(row).forEach(key => allKeys.add(key));
    }
    const headers = Array.from(allKeys);

    // Build CSV
    const lines: string[] = [];

    // Header line
    lines.push(headers.map(h => this.escapeCsvValue(h)).join(','));

    // Data lines
    for (const row of data) {
      const values = headers.map(h => {
        const val = row[h];
        return this.escapeCsvValue(val);
      });
      lines.push(values.join(','));
    }

    return lines.join('\n');
  }

  private escapeCsvValue(value: unknown): string {
    if (value === null || value === undefined) {
      return '';
    }

    const str = typeof value === 'object' ? JSON.stringify(value) : String(value);

    // Escape quotes and wrap in quotes if contains comma, newline, or quote
    if (str.includes(',') || str.includes('\n') || str.includes('"')) {
      return `"${str.replace(/"/g, '""')}"`;
    }

    return str;
  }

  // ============================================
  // EXCEL EXPORT
  // ============================================

  async exportToExcel(report: ReportData): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'FireLater ITSM';
    workbook.created = report.generatedAt;

    // Create main data worksheet
    const dataSheet = workbook.addWorksheet('Report Data');

    // Add title row
    const titleRow = dataSheet.addRow([report.title]);
    titleRow.font = { bold: true, size: 16 };
    dataSheet.mergeCells(1, 1, 1, 6);

    // Add subtitle if present
    if (report.subtitle) {
      const subtitleRow = dataSheet.addRow([report.subtitle]);
      subtitleRow.font = { italic: true, size: 12 };
      dataSheet.mergeCells(2, 1, 2, 6);
    }

    // Add generated date
    const dateRow = dataSheet.addRow([`Generated: ${report.generatedAt.toISOString()}`]);
    dateRow.font = { size: 10, color: { argb: '666666' } };

    // Add blank row
    dataSheet.addRow([]);

    // Add data
    const data = Array.isArray(report.data) ? report.data : [report.data];

    if (data.length > 0) {
      // Get headers
      const allKeys = new Set<string>();
      for (const row of data) {
        Object.keys(row).forEach(key => allKeys.add(key));
      }
      const headers = Array.from(allKeys);

      // Add header row
      const headerRow = dataSheet.addRow(headers);
      headerRow.font = { bold: true };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: '2563EB' },
      };
      headerRow.font = { bold: true, color: { argb: 'FFFFFF' } };

      // Add data rows
      for (const row of data) {
        const values = headers.map(h => {
          const val = row[h];
          if (val === null || val === undefined) return '';
          if (typeof val === 'object') return JSON.stringify(val);
          return val;
        });
        dataSheet.addRow(values);
      }

      // Auto-fit columns
      dataSheet.columns.forEach((column, index) => {
        let maxLength = headers[index]?.length || 10;
        data.forEach(row => {
          const val = row[headers[index]];
          const cellLength = val ? String(val).length : 0;
          if (cellLength > maxLength) {
            maxLength = Math.min(cellLength, 50);
          }
        });
        column.width = maxLength + 2;
      });
    }

    // Add summary sheet if present
    if (report.summary) {
      const summarySheet = workbook.addWorksheet('Summary');

      summarySheet.addRow(['Report Summary']);
      summarySheet.getRow(1).font = { bold: true, size: 14 };
      summarySheet.addRow([]);

      for (const [key, value] of Object.entries(report.summary)) {
        const row = summarySheet.addRow([this.formatKey(key), value]);
        row.getCell(1).font = { bold: true };
      }

      summarySheet.columns = [
        { width: 25 },
        { width: 30 },
      ];
    }

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  private formatKey(key: string): string {
    // Convert snake_case or camelCase to Title Case
    return key
      .replace(/_/g, ' ')
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase())
      .trim();
  }

  // ============================================
  // PDF EXPORT
  // ============================================

  async exportToPdf(report: ReportData): Promise<Buffer> {
    // Generate HTML for the report
    const html = this.generatePdfHtml(report);

    // For PDF generation, we have a few options:
    // 1. Use puppeteer (heavy, requires browser)
    // 2. Use pdfkit (lightweight, code-based)
    // 3. Use an external service

    // For now, we'll return HTML that can be converted to PDF client-side
    // or by a separate PDF generation service

    // If puppeteer is available, use it
    try {
      // Dynamic import to avoid bundling issues
      const puppeteer = await import('puppeteer-core');

      // Try to find Chrome
      const executablePath = this.findChrome();

      if (executablePath) {
        const browser = await puppeteer.default.launch({
          executablePath,
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });

        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'networkidle0' });

        const pdfBuffer = await page.pdf({
          format: 'A4',
          printBackground: true,
          margin: {
            top: '20mm',
            bottom: '20mm',
            left: '15mm',
            right: '15mm',
          },
        });

        await browser.close();

        logger.info({ title: report.title }, 'PDF generated successfully');
        return Buffer.from(pdfBuffer);
      }
    } catch (error) {
      logger.warn({ error }, 'Puppeteer not available, returning HTML for client-side PDF generation');
    }

    // Fallback: return HTML buffer
    return Buffer.from(html, 'utf-8');
  }

  private findChrome(): string | undefined {
    const paths = [
      // macOS
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      // Linux
      '/usr/bin/google-chrome',
      '/usr/bin/chromium-browser',
      '/usr/bin/chromium',
      // Windows
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    ];

    for (const path of paths) {
      try {
        if (fs.existsSync(path)) {
          return path;
        }
      } catch {
        continue;
      }
    }

    return undefined;
  }

  private generatePdfHtml(report: ReportData): string {
    const data = Array.isArray(report.data) ? report.data : [report.data];

    let tableHtml = '';
    if (data.length > 0) {
      const allKeys = new Set<string>();
      for (const row of data) {
        Object.keys(row).forEach(key => allKeys.add(key));
      }
      const headers = Array.from(allKeys);

      tableHtml = `
<table>
  <thead>
    <tr>
      ${headers.map(h => `<th>${this.formatKey(h)}</th>`).join('')}
    </tr>
  </thead>
  <tbody>
    ${data.map(row => `
    <tr>
      ${headers.map(h => {
        const val = row[h];
        const display = val === null || val === undefined ? '' : String(val);
        return `<td>${display}</td>`;
      }).join('')}
    </tr>
    `).join('')}
  </tbody>
</table>`;
    }

    let summaryHtml = '';
    if (report.summary) {
      summaryHtml = `
<div class="summary">
  <h2>Summary</h2>
  <dl>
    ${Object.entries(report.summary).map(([key, value]) => `
    <div class="summary-item">
      <dt>${this.formatKey(key)}</dt>
      <dd>${value}</dd>
    </div>
    `).join('')}
  </dl>
</div>`;
    }

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${report.title}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      color: #1f2937;
      max-width: 1000px;
      margin: 0 auto;
      padding: 20px;
    }
    .header {
      border-bottom: 2px solid #2563eb;
      padding-bottom: 20px;
      margin-bottom: 30px;
    }
    h1 {
      font-size: 24px;
      color: #1f2937;
      margin: 0 0 8px 0;
    }
    .subtitle {
      font-size: 14px;
      color: #6b7280;
      margin: 0;
    }
    .meta {
      font-size: 12px;
      color: #9ca3af;
      margin-top: 10px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
      font-size: 13px;
    }
    th, td {
      border: 1px solid #e5e7eb;
      padding: 10px 12px;
      text-align: left;
    }
    th {
      background: #2563eb;
      color: white;
      font-weight: 600;
    }
    tr:nth-child(even) {
      background: #f9fafb;
    }
    .summary {
      background: #f3f4f6;
      padding: 20px;
      border-radius: 8px;
      margin-top: 30px;
    }
    .summary h2 {
      margin: 0 0 15px 0;
      font-size: 18px;
    }
    .summary dl {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 15px;
      margin: 0;
    }
    .summary-item {
      background: white;
      padding: 12px;
      border-radius: 6px;
    }
    .summary-item dt {
      font-size: 12px;
      color: #6b7280;
      margin-bottom: 4px;
    }
    .summary-item dd {
      font-size: 18px;
      font-weight: 600;
      color: #1f2937;
      margin: 0;
    }
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #e5e7eb;
      font-size: 11px;
      color: #9ca3af;
      text-align: center;
    }
    @media print {
      body { padding: 0; }
      .header { page-break-after: avoid; }
      table { page-break-inside: auto; }
      tr { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>${report.title}</h1>
    ${report.subtitle ? `<p class="subtitle">${report.subtitle}</p>` : ''}
    <p class="meta">
      Generated: ${report.generatedAt.toLocaleString()}
      ${report.dateRange ? ` | Date Range: ${report.dateRange.start.toLocaleDateString()} - ${report.dateRange.end.toLocaleDateString()}` : ''}
    </p>
  </div>

  ${tableHtml}
  ${summaryHtml}

  <div class="footer">
    <p>Generated by FireLater ITSM | ${new Date().getFullYear()}</p>
  </div>
</body>
</html>`;
  }

  // ============================================
  // UNIFIED EXPORT METHOD
  // ============================================

  async export(
    report: ReportData,
    format: ExportFormat
  ): Promise<{ content: Buffer | string; mimeType: string; extension: string }> {
    switch (format) {
      case 'json':
        return {
          content: this.exportToJson(report),
          mimeType: 'application/json',
          extension: '.json',
        };

      case 'csv':
        return {
          content: this.exportToCsv(report),
          mimeType: 'text/csv',
          extension: '.csv',
        };

      case 'xlsx':
        return {
          content: await this.exportToExcel(report),
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          extension: '.xlsx',
        };

      case 'pdf':
        return {
          content: await this.exportToPdf(report),
          mimeType: 'application/pdf',
          extension: '.pdf',
        };

      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }
}

export const reportExportService = new ReportExportService();
