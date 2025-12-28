/**
 * Export utilities for generating CSV and PDF files
 */

// CSV Export
export interface CSVExportOptions {
  filename: string;
  headers?: string[];
  headerLabels?: Record<string, string>;
  includeTimestamp?: boolean;
}

export function exportToCSV<T extends Record<string, unknown>>(
  data: T[],
  options: CSVExportOptions
): void {
  if (data.length === 0) {
    console.warn('No data to export');
    return;
  }

  const { filename, headers, headerLabels = {}, includeTimestamp = true } = options;

  // Determine headers from data if not provided
  const columns = headers || Object.keys(data[0]);

  // Create header row with labels
  const headerRow = columns.map((col) => headerLabels[col] || formatHeader(col));

  // Create data rows
  const rows = data.map((item) =>
    columns.map((col) => {
      const value = item[col];
      return formatCSVValue(value);
    })
  );

  // Combine header and data
  const csvContent = [headerRow, ...rows]
    .map((row) => row.join(','))
    .join('\n');

  // Generate filename with timestamp
  const timestamp = includeTimestamp ? `_${formatTimestamp(new Date())}` : '';
  const fullFilename = `${filename}${timestamp}.csv`;

  // Download
  downloadFile(csvContent, fullFilename, 'text/csv;charset=utf-8;');
}

// Format a value for CSV (handle special characters, quotes, etc.)
function formatCSVValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'object') {
    if (value instanceof Date) {
      return value.toISOString();
    }
    return JSON.stringify(value);
  }

  const stringValue = String(value);

  // Escape quotes and wrap in quotes if contains special characters
  if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }

  return stringValue;
}

// Format header (convert snake_case to Title Case)
function formatHeader(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

// Format timestamp for filenames
function formatTimestamp(date: Date): string {
  return date.toISOString().slice(0, 19).replace(/[:-]/g, '').replace('T', '_');
}

// Download file helper
function downloadFile(content: string | Blob, filename: string, mimeType: string): void {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // Clean up
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

// JSON Export
export interface JSONExportOptions {
  filename: string;
  pretty?: boolean;
  includeTimestamp?: boolean;
}

export function exportToJSON<T>(data: T, options: JSONExportOptions): void {
  const { filename, pretty = true, includeTimestamp = true } = options;

  const content = pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);

  const timestamp = includeTimestamp ? `_${formatTimestamp(new Date())}` : '';
  const fullFilename = `${filename}${timestamp}.json`;

  downloadFile(content, fullFilename, 'application/json;charset=utf-8;');
}

// PDF Export (using browser print functionality - basic version)
export interface PDFExportOptions {
  filename: string;
  title?: string;
  orientation?: 'portrait' | 'landscape';
}

export function exportToPDF<T extends Record<string, unknown>>(
  data: T[],
  options: PDFExportOptions
): void {
  const { title, orientation = 'portrait' } = options;

  // Create a new window for printing
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    console.error('Could not open print window');
    return;
  }

  const headers = data.length > 0 ? Object.keys(data[0]) : [];

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>${title || 'Report'}</title>
      <style>
        @page {
          size: ${orientation === 'landscape' ? 'landscape' : 'portrait'};
          margin: 1cm;
        }
        body {
          font-family: Arial, sans-serif;
          font-size: 12px;
          line-height: 1.4;
        }
        h1 {
          font-size: 18px;
          margin-bottom: 10px;
        }
        .meta {
          font-size: 10px;
          color: #666;
          margin-bottom: 20px;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 10px;
        }
        th, td {
          border: 1px solid #ddd;
          padding: 8px;
          text-align: left;
        }
        th {
          background-color: #f5f5f5;
          font-weight: bold;
        }
        tr:nth-child(even) {
          background-color: #fafafa;
        }
        @media print {
          .no-print { display: none; }
        }
      </style>
    </head>
    <body>
      ${title ? `<h1>${title}</h1>` : ''}
      <div class="meta">
        Generated: ${new Date().toLocaleString()}
        | Total Records: ${data.length}
      </div>
      <table>
        <thead>
          <tr>
            ${headers.map((h) => `<th>${formatHeader(h)}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${data.map((row) => `
            <tr>
              ${headers.map((h) => `<td>${formatPDFValue(row[h])}</td>`).join('')}
            </tr>
          `).join('')}
        </tbody>
      </table>
      <script>
        window.onload = function() {
          window.print();
          window.onafterprint = function() {
            window.close();
          };
        };
      </script>
    </body>
    </html>
  `;

  printWindow.document.write(html);
  printWindow.document.close();
}

function formatPDFValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '-';
  }

  if (typeof value === 'object') {
    if (value instanceof Date) {
      return value.toLocaleDateString();
    }
    return JSON.stringify(value);
  }

  return String(value);
}

// Table-specific export with common patterns
export interface TableExportConfig<T> {
  data: T[];
  columns: {
    key: keyof T;
    label: string;
    format?: (value: unknown) => string;
  }[];
  filename: string;
  title?: string;
}

export function exportTableToCSV<T extends Record<string, unknown>>(
  config: TableExportConfig<T>
): void {
  const { data, columns, filename } = config;

  const headers = columns.map((c) => c.key as string);
  const headerLabels = Object.fromEntries(
    columns.map((c) => [c.key, c.label])
  );

  const formattedData = data.map((row) => {
    const newRow: Record<string, unknown> = {};
    columns.forEach((col) => {
      const value = row[col.key];
      newRow[col.key as string] = col.format ? col.format(value) : value;
    });
    return newRow;
  });

  exportToCSV(formattedData, { filename, headers, headerLabels });
}

export function exportTableToPDF<T extends Record<string, unknown>>(
  config: TableExportConfig<T>
): void {
  const { data, columns, filename, title } = config;

  const formattedData = data.map((row) => {
    const newRow: Record<string, unknown> = {};
    columns.forEach((col) => {
      const value = row[col.key];
      newRow[col.label] = col.format ? col.format(value) : value;
    });
    return newRow;
  });

  exportToPDF(formattedData, { filename, title });
}

// Hook for easy integration with table components
export function useTableExport<T extends Record<string, unknown>>() {
  const exportCSV = (config: TableExportConfig<T>) => {
    exportTableToCSV(config);
  };

  const exportPDF = (config: TableExportConfig<T>) => {
    exportTableToPDF(config);
  };

  const exportJSON = (data: T[], filename: string) => {
    exportToJSON(data, { filename });
  };

  return {
    exportCSV,
    exportPDF,
    exportJSON,
  };
}
