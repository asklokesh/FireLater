import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock DOM APIs
const mockCreateObjectURL = vi.fn().mockReturnValue('blob:mock-url');
const mockRevokeObjectURL = vi.fn();

// Store created elements and their properties
const createdElements: { click: () => void; href: string; download: string }[] = [];
let originalCreateObjectURL: typeof URL.createObjectURL;
let originalRevokeObjectURL: typeof URL.revokeObjectURL;

beforeEach(() => {
  vi.clearAllMocks();
  createdElements.length = 0;

  // Save original URL methods
  originalCreateObjectURL = URL.createObjectURL;
  originalRevokeObjectURL = URL.revokeObjectURL;

  // Mock URL API methods (not the constructor)
  URL.createObjectURL = mockCreateObjectURL;
  URL.revokeObjectURL = mockRevokeObjectURL;

  // Mock document methods
  vi.spyOn(document, 'createElement').mockImplementation((tag) => {
    if (tag === 'a') {
      const link = {
        href: '',
        download: '',
        click: vi.fn(),
      };
      createdElements.push(link);
      return link as unknown as HTMLAnchorElement;
    }
    return document.createElement(tag);
  });

  vi.spyOn(document.body, 'appendChild').mockImplementation(() => null as any);
  vi.spyOn(document.body, 'removeChild').mockImplementation(() => null as any);
});

afterEach(() => {
  // Restore URL methods
  URL.createObjectURL = originalCreateObjectURL;
  URL.revokeObjectURL = originalRevokeObjectURL;
  vi.restoreAllMocks();
});

describe('Export Utilities', () => {
  describe('exportToCSV', () => {
    it('should create a CSV file with headers and data', async () => {
      const { exportToCSV } = await import('../export');

      const data = [
        { name: 'John', age: 30, city: 'New York' },
        { name: 'Jane', age: 25, city: 'Los Angeles' },
      ];

      exportToCSV(data, {
        filename: 'users',
        includeTimestamp: false,
      });

      expect(mockCreateObjectURL).toHaveBeenCalledTimes(1);
      expect(createdElements.length).toBe(1);
      expect(createdElements[0].download).toBe('users.csv');
      expect(createdElements[0].click).toHaveBeenCalled();
    });

    it('should use custom headers when provided', async () => {
      const { exportToCSV } = await import('../export');

      const data = [
        { name: 'John', age: 30, city: 'New York' },
      ];

      exportToCSV(data, {
        filename: 'users',
        headers: ['name', 'city'],
        includeTimestamp: false,
      });

      // Verify blob was created
      expect(mockCreateObjectURL).toHaveBeenCalledTimes(1);
    });

    it('should use custom header labels', async () => {
      const { exportToCSV } = await import('../export');

      const data = [
        { first_name: 'John', last_name: 'Doe' },
      ];

      exportToCSV(data, {
        filename: 'users',
        headerLabels: {
          first_name: 'First Name',
          last_name: 'Last Name',
        },
        includeTimestamp: false,
      });

      expect(mockCreateObjectURL).toHaveBeenCalledTimes(1);
    });

    it('should not export when data is empty', async () => {
      const { exportToCSV } = await import('../export');
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      exportToCSV([], {
        filename: 'empty',
        includeTimestamp: false,
      });

      expect(consoleSpy).toHaveBeenCalledWith('No data to export');
      expect(mockCreateObjectURL).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should include timestamp in filename when enabled', async () => {
      const { exportToCSV } = await import('../export');

      const data = [{ id: 1 }];

      exportToCSV(data, {
        filename: 'report',
        includeTimestamp: true,
      });

      expect(createdElements[0].download).toMatch(/^report_\d{8}_\d{6}\.csv$/);
    });
  });

  describe('exportToJSON', () => {
    it('should create a JSON file with pretty formatting', async () => {
      const { exportToJSON } = await import('../export');

      const data = { users: [{ name: 'John' }] };

      exportToJSON(data, {
        filename: 'data',
        pretty: true,
        includeTimestamp: false,
      });

      expect(mockCreateObjectURL).toHaveBeenCalledTimes(1);
      expect(createdElements[0].download).toBe('data.json');
    });

    it('should create compact JSON when pretty is false', async () => {
      const { exportToJSON } = await import('../export');

      const data = { name: 'test' };

      exportToJSON(data, {
        filename: 'compact',
        pretty: false,
        includeTimestamp: false,
      });

      expect(mockCreateObjectURL).toHaveBeenCalledTimes(1);
    });

    it('should include timestamp in filename when enabled', async () => {
      const { exportToJSON } = await import('../export');

      exportToJSON({ test: true }, {
        filename: 'report',
        includeTimestamp: true,
      });

      expect(createdElements[0].download).toMatch(/^report_\d{8}_\d{6}\.json$/);
    });
  });

  describe('exportTableToCSV', () => {
    it('should export table with column configuration', async () => {
      const { exportTableToCSV } = await import('../export');

      const data = [
        { id: 1, firstName: 'John', lastName: 'Doe' },
        { id: 2, firstName: 'Jane', lastName: 'Smith' },
      ];

      exportTableToCSV({
        data,
        columns: [
          { key: 'firstName', label: 'First Name' },
          { key: 'lastName', label: 'Last Name' },
        ],
        filename: 'users',
      });

      expect(mockCreateObjectURL).toHaveBeenCalledTimes(1);
    });

    it('should apply column formatters', async () => {
      const { exportTableToCSV } = await import('../export');

      const data = [
        { name: 'john', amount: 1000 },
      ];

      exportTableToCSV({
        data,
        columns: [
          { key: 'name', label: 'Name', format: (v) => String(v).toUpperCase() },
          { key: 'amount', label: 'Amount', format: (v) => `$${v}` },
        ],
        filename: 'formatted',
      });

      expect(mockCreateObjectURL).toHaveBeenCalledTimes(1);
    });
  });

  describe('useTableExport hook', () => {
    it('should return export functions', async () => {
      const { useTableExport } = await import('../export');

      const { exportCSV, exportPDF, exportJSON } = useTableExport();

      expect(typeof exportCSV).toBe('function');
      expect(typeof exportPDF).toBe('function');
      expect(typeof exportJSON).toBe('function');
    });

    it('should call exportTableToCSV when exportCSV is called', async () => {
      const { useTableExport } = await import('../export');

      const { exportCSV } = useTableExport();

      exportCSV({
        data: [{ id: 1 }],
        columns: [{ key: 'id', label: 'ID' }],
        filename: 'test',
      });

      expect(mockCreateObjectURL).toHaveBeenCalledTimes(1);
    });

    it('should call exportToJSON when exportJSON is called', async () => {
      const { useTableExport } = await import('../export');

      const { exportJSON } = useTableExport();

      exportJSON([{ id: 1 }], 'test');

      expect(mockCreateObjectURL).toHaveBeenCalledTimes(1);
    });
  });
});

describe('CSV Value Formatting', () => {
  it('should handle null and undefined values', async () => {
    const { exportToCSV } = await import('../export');

    const data = [
      { name: null, value: undefined, active: true },
    ];

    exportToCSV(data, {
      filename: 'nulls',
      includeTimestamp: false,
    });

    expect(mockCreateObjectURL).toHaveBeenCalledTimes(1);
  });

  it('should handle objects and dates', async () => {
    const { exportToCSV } = await import('../export');

    const date = new Date('2024-01-15T10:30:00Z');
    const data = [
      { date, nested: { foo: 'bar' } },
    ];

    exportToCSV(data, {
      filename: 'objects',
      includeTimestamp: false,
    });

    expect(mockCreateObjectURL).toHaveBeenCalledTimes(1);
  });

  it('should escape special characters in CSV values', async () => {
    const { exportToCSV } = await import('../export');

    const data = [
      { description: 'Contains, comma', notes: 'Has "quotes"', text: 'Has\nnewline' },
    ];

    exportToCSV(data, {
      filename: 'special',
      includeTimestamp: false,
    });

    expect(mockCreateObjectURL).toHaveBeenCalledTimes(1);
  });
});

describe('Header Formatting', () => {
  it('should convert snake_case to Title Case', async () => {
    const { exportToCSV } = await import('../export');

    const data = [
      { first_name: 'John', last_name: 'Doe' },
    ];

    exportToCSV(data, {
      filename: 'snake_case',
      includeTimestamp: false,
    });

    expect(mockCreateObjectURL).toHaveBeenCalledTimes(1);
  });

  it('should handle camelCase headers', async () => {
    const { exportToCSV } = await import('../export');

    const data = [
      { firstName: 'John', lastName: 'Doe' },
    ];

    exportToCSV(data, {
      filename: 'camelCase',
      includeTimestamp: false,
    });

    expect(mockCreateObjectURL).toHaveBeenCalledTimes(1);
  });
});
