import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================
// PDF EXPORT WITH PUPPETEER - SUCCESS PATHS
// ============================================
// This test file covers the successful puppeteer PDF generation paths
// that require different mocks than the main test file

// Mock fs to return true for Chrome path detection
const mockExistsSync = vi.fn();
vi.mock('fs', () => ({
  default: {
    existsSync: (...args: unknown[]) => mockExistsSync(...args),
  },
}));

// Mock ExcelJS (needed for module import)
vi.mock('exceljs', () => ({
  default: {
    Workbook: vi.fn().mockImplementation(() => ({
      creator: '',
      created: null,
      addWorksheet: vi.fn().mockReturnValue({
        addRow: vi.fn().mockReturnValue({ font: {}, fill: {}, getCell: () => ({ font: {} }) }),
        mergeCells: vi.fn(),
        getRow: vi.fn().mockReturnValue({ font: {} }),
        columns: [],
      }),
      xlsx: {
        writeBuffer: vi.fn().mockResolvedValue(Buffer.from('excel-content')),
      },
    })),
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

// Mock puppeteer-core with successful behavior
const mockPdfBuffer = Buffer.from('PDF-CONTENT-GENERATED-BY-PUPPETEER');
const mockClose = vi.fn();
const mockPdf = vi.fn().mockResolvedValue(mockPdfBuffer);
const mockSetContent = vi.fn().mockResolvedValue(undefined);
const mockNewPage = vi.fn().mockResolvedValue({
  setContent: mockSetContent,
  pdf: mockPdf,
});
const mockLaunch = vi.fn().mockResolvedValue({
  newPage: mockNewPage,
  close: mockClose,
});

vi.mock('puppeteer-core', () => ({
  default: {
    launch: (...args: unknown[]) => mockLaunch(...args),
  },
}));

import { reportExportService } from '../../../src/services/report-export.js';
import { logger } from '../../../src/utils/logger.js';

describe('ReportExportService - PDF with Puppeteer', () => {
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
    // Default: no Chrome found
    mockExistsSync.mockReturnValue(false);
  });

  // ============================================
  // SUCCESSFUL PUPPETEER PDF GENERATION
  // ============================================

  describe('exportToPdf with puppeteer', () => {
    it('should generate PDF using puppeteer when Chrome is found (macOS)', async () => {
      // Mock Chrome found at macOS path
      mockExistsSync.mockImplementation((path: string) => {
        return path === '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
      });

      const result = await reportExportService.exportToPdf(sampleReport);

      // Should return the puppeteer-generated PDF
      expect(result).toEqual(mockPdfBuffer);

      // Verify puppeteer was called correctly
      expect(mockLaunch).toHaveBeenCalledWith({
        executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
      expect(mockNewPage).toHaveBeenCalled();
      expect(mockSetContent).toHaveBeenCalledWith(
        expect.stringContaining('<!DOCTYPE html>'),
        { waitUntil: 'networkidle0' }
      );
      expect(mockPdf).toHaveBeenCalledWith({
        format: 'A4',
        printBackground: true,
        margin: {
          top: '20mm',
          bottom: '20mm',
          left: '15mm',
          right: '15mm',
        },
      });
      expect(mockClose).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        { title: 'Test Report' },
        'PDF generated successfully'
      );
    });

    it('should generate PDF using Chromium on macOS', async () => {
      mockExistsSync.mockImplementation((path: string) => {
        return path === '/Applications/Chromium.app/Contents/MacOS/Chromium';
      });

      const result = await reportExportService.exportToPdf(sampleReport);

      expect(result).toEqual(mockPdfBuffer);
      expect(mockLaunch).toHaveBeenCalledWith(
        expect.objectContaining({
          executablePath: '/Applications/Chromium.app/Contents/MacOS/Chromium',
        })
      );
    });

    it('should generate PDF using Chrome on Linux', async () => {
      mockExistsSync.mockImplementation((path: string) => {
        return path === '/usr/bin/google-chrome';
      });

      const result = await reportExportService.exportToPdf(sampleReport);

      expect(result).toEqual(mockPdfBuffer);
      expect(mockLaunch).toHaveBeenCalledWith(
        expect.objectContaining({
          executablePath: '/usr/bin/google-chrome',
        })
      );
    });

    it('should generate PDF using chromium-browser on Linux', async () => {
      mockExistsSync.mockImplementation((path: string) => {
        return path === '/usr/bin/chromium-browser';
      });

      const result = await reportExportService.exportToPdf(sampleReport);

      expect(result).toEqual(mockPdfBuffer);
      expect(mockLaunch).toHaveBeenCalledWith(
        expect.objectContaining({
          executablePath: '/usr/bin/chromium-browser',
        })
      );
    });

    it('should generate PDF using chromium on Linux', async () => {
      mockExistsSync.mockImplementation((path: string) => {
        return path === '/usr/bin/chromium';
      });

      const result = await reportExportService.exportToPdf(sampleReport);

      expect(result).toEqual(mockPdfBuffer);
      expect(mockLaunch).toHaveBeenCalledWith(
        expect.objectContaining({
          executablePath: '/usr/bin/chromium',
        })
      );
    });

    it('should generate PDF using Chrome on Windows (Program Files)', async () => {
      mockExistsSync.mockImplementation((path: string) => {
        return path === 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
      });

      const result = await reportExportService.exportToPdf(sampleReport);

      expect(result).toEqual(mockPdfBuffer);
      expect(mockLaunch).toHaveBeenCalledWith(
        expect.objectContaining({
          executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        })
      );
    });

    it('should generate PDF using Chrome on Windows (Program Files x86)', async () => {
      mockExistsSync.mockImplementation((path: string) => {
        return path === 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';
      });

      const result = await reportExportService.exportToPdf(sampleReport);

      expect(result).toEqual(mockPdfBuffer);
      expect(mockLaunch).toHaveBeenCalledWith(
        expect.objectContaining({
          executablePath: 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        })
      );
    });

    it('should use first available Chrome path', async () => {
      // Return true for multiple paths - should use first one found
      mockExistsSync.mockImplementation((path: string) => {
        return (
          path === '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' ||
          path === '/usr/bin/google-chrome'
        );
      });

      const result = await reportExportService.exportToPdf(sampleReport);

      expect(result).toEqual(mockPdfBuffer);
      // Should use the first matching path (macOS)
      expect(mockLaunch).toHaveBeenCalledWith(
        expect.objectContaining({
          executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        })
      );
    });

    it('should pass report content to page.setContent', async () => {
      mockExistsSync.mockImplementation((path: string) => {
        return path === '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
      });

      await reportExportService.exportToPdf(sampleReport);

      const htmlArg = mockSetContent.mock.calls[0][0];
      expect(htmlArg).toContain('Test Report');
      expect(htmlArg).toContain('Monthly Summary');
      expect(htmlArg).toContain('Item 1');
      expect(htmlArg).toContain('Item 2');
    });

    it('should handle report without subtitle in PDF', async () => {
      mockExistsSync.mockImplementation((path: string) => {
        return path === '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
      });

      const reportWithoutSubtitle = { ...sampleReport, subtitle: undefined };
      await reportExportService.exportToPdf(reportWithoutSubtitle);

      const htmlArg = mockSetContent.mock.calls[0][0];
      expect(htmlArg).toContain('Test Report');
      expect(htmlArg).not.toContain('class="subtitle"');
    });

    it('should handle report without date range in PDF', async () => {
      mockExistsSync.mockImplementation((path: string) => {
        return path === '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
      });

      const reportWithoutDateRange = { ...sampleReport, dateRange: undefined };
      await reportExportService.exportToPdf(reportWithoutDateRange);

      const htmlArg = mockSetContent.mock.calls[0][0];
      expect(htmlArg).not.toContain('Date Range');
    });
  });

  // ============================================
  // PUPPETEER ERROR HANDLING
  // ============================================

  describe('exportToPdf error handling', () => {
    it('should fall back to HTML when puppeteer.launch throws', async () => {
      mockExistsSync.mockImplementation((path: string) => {
        return path === '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
      });
      mockLaunch.mockRejectedValueOnce(new Error('Browser failed to launch'));

      const result = await reportExportService.exportToPdf(sampleReport);

      // Should return HTML fallback
      const html = result.toString('utf-8');
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('Test Report');
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.any(Error) }),
        'Puppeteer not available, returning HTML for client-side PDF generation'
      );
    });

    it('should fall back to HTML when page.setContent throws', async () => {
      mockExistsSync.mockImplementation((path: string) => {
        return path === '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
      });
      mockSetContent.mockRejectedValueOnce(new Error('Page navigation failed'));

      const result = await reportExportService.exportToPdf(sampleReport);

      const html = result.toString('utf-8');
      expect(html).toContain('<!DOCTYPE html>');
    });

    it('should fall back to HTML when page.pdf throws', async () => {
      mockExistsSync.mockImplementation((path: string) => {
        return path === '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
      });
      mockPdf.mockRejectedValueOnce(new Error('PDF generation failed'));

      const result = await reportExportService.exportToPdf(sampleReport);

      const html = result.toString('utf-8');
      expect(html).toContain('<!DOCTYPE html>');
    });

    it('should fall back to HTML when no Chrome is found', async () => {
      // All paths return false
      mockExistsSync.mockReturnValue(false);

      const result = await reportExportService.exportToPdf(sampleReport);

      const html = result.toString('utf-8');
      expect(html).toContain('<!DOCTYPE html>');
      // puppeteer.launch should NOT be called
      expect(mockLaunch).not.toHaveBeenCalled();
    });
  });

  // ============================================
  // CHROME DETECTION (findChrome)
  // ============================================

  describe('Chrome detection edge cases', () => {
    it('should handle fs.existsSync throwing an error', async () => {
      mockExistsSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const result = await reportExportService.exportToPdf(sampleReport);

      // Should fall back to HTML when all paths throw
      const html = result.toString('utf-8');
      expect(html).toContain('<!DOCTYPE html>');
      expect(mockLaunch).not.toHaveBeenCalled();
    });

    it('should continue checking paths after one throws', async () => {
      let callCount = 0;
      mockExistsSync.mockImplementation((path: string) => {
        callCount++;
        // First few paths throw
        if (callCount < 5) {
          throw new Error('Permission denied');
        }
        // Then return true for chromium
        return path === '/usr/bin/chromium';
      });

      const result = await reportExportService.exportToPdf(sampleReport);

      expect(result).toEqual(mockPdfBuffer);
      expect(mockLaunch).toHaveBeenCalledWith(
        expect.objectContaining({
          executablePath: '/usr/bin/chromium',
        })
      );
    });
  });

  // ============================================
  // UNIFIED EXPORT METHOD WITH PUPPETEER
  // ============================================

  describe('export method with PDF format', () => {
    it('should return puppeteer PDF via unified export method', async () => {
      mockExistsSync.mockImplementation((path: string) => {
        return path === '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
      });

      const result = await reportExportService.export(sampleReport, 'pdf');

      expect(result.content).toEqual(mockPdfBuffer);
      expect(result.mimeType).toBe('application/pdf');
      expect(result.extension).toBe('.pdf');
    });
  });
});
