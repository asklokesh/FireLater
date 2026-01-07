import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Readable } from 'stream';

/**
 * Unit tests for StorageService S3 paths
 * Testing S3-specific code paths for migration files
 */

// Mock database
const mockQuery = vi.fn();
vi.mock('../../../src/config/database.js', () => ({
  pool: {
    query: (...args: unknown[]) => mockQuery(...args),
  },
}));

// Mock tenant service
vi.mock('../../../src/services/tenant.js', () => ({
  tenantService: {
    getSchemaName: vi.fn((slug: string) => `tenant_${slug.replace(/-/g, '_')}`),
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

// Mock S3 client - configured to test S3 code paths
const mockSend = vi.fn();
const mockS3Client = {
  send: (...args: unknown[]) => mockSend(...args),
};
vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn().mockImplementation(() => mockS3Client),
  PutObjectCommand: vi.fn().mockImplementation((params) => ({ ...params, _type: 'PutObjectCommand' })),
  GetObjectCommand: vi.fn().mockImplementation((params) => ({ ...params, _type: 'GetObjectCommand' })),
  DeleteObjectCommand: vi.fn().mockImplementation((params) => ({ ...params, _type: 'DeleteObjectCommand' })),
}));

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://mock-presigned-url.s3.amazonaws.com/key'),
}));

// Mock fs promises
const mockWriteFile = vi.fn();
const mockReadFile = vi.fn();
const mockUnlink = vi.fn();
const mockMkdir = vi.fn();
vi.mock('fs', async () => {
  const actual = await vi.importActual('fs');
  return {
    ...actual,
    promises: {
      writeFile: (...args: unknown[]) => mockWriteFile(...args),
      readFile: (...args: unknown[]) => mockReadFile(...args),
      unlink: (...args: unknown[]) => mockUnlink(...args),
      mkdir: (...args: unknown[]) => mockMkdir(...args),
    },
  };
});

// Mock config - S3 IS configured to test S3 paths
vi.mock('../../../src/config/index.js', () => ({
  config: {
    s3: {
      bucket: 'test-bucket',
      accessKey: 'test-access-key',
      secretKey: 'test-secret-key',
      region: 'us-east-1',
      endpoint: 'https://s3.us-east-1.amazonaws.com',
      forcePathStyle: false,
    },
  },
}));

// Mock cache service - bypass caching entirely
vi.mock('../../../src/utils/cache.js', () => ({
  cacheService: {
    getOrSet: vi.fn(async (_key: string, fetcher: () => Promise<unknown>) => fetcher()),
    invalidate: vi.fn().mockResolvedValue(1),
    invalidateTenant: vi.fn().mockResolvedValue(1),
  },
}));

// Mock nanoid
vi.mock('nanoid', () => ({
  nanoid: () => 'abc123xyz789',
}));

// Mock mime-types
vi.mock('mime-types', () => ({
  lookup: (filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase();
    const mimeTypes: Record<string, string> = {
      'pdf': 'application/pdf',
      'txt': 'text/plain',
      'png': 'image/png',
      'json': 'application/json',
    };
    return mimeTypes[ext || ''] || false;
  },
}));

import { NotFoundError } from '../../../src/utils/errors.js';

// Helper to create a mock S3 response body stream
function createMockS3Body(data: Buffer): { transformToByteArray: () => Promise<Uint8Array> } {
  return {
    transformToByteArray: async () => new Uint8Array(data),
  };
}

describe('StorageService S3 Paths', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);
    mockUnlink.mockResolvedValue(undefined);
    process.env.API_URL = 'http://localhost:3001';
  });

  describe('downloadMigrationFile with S3', () => {
    it('should download migration file from S3', async () => {
      const { storageService } = await import('../../../src/services/storage.js');

      const fileContent = Buffer.from('migration data from S3');
      mockSend.mockResolvedValueOnce({
        Body: createMockS3Body(fileContent),
      });

      const result = await storageService.downloadMigrationFile('test-tenant/migrations/file.json');

      expect(mockSend).toHaveBeenCalled();
      expect(result).toEqual(fileContent);
    });

    it('should throw NotFoundError when S3 response has no Body', async () => {
      const { storageService } = await import('../../../src/services/storage.js');

      mockSend.mockResolvedValueOnce({
        Body: null,
      });

      await expect(
        storageService.downloadMigrationFile('test-tenant/migrations/missing.json')
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw NotFoundError when S3 response Body is undefined', async () => {
      const { storageService } = await import('../../../src/services/storage.js');

      mockSend.mockResolvedValueOnce({});

      await expect(
        storageService.downloadMigrationFile('test-tenant/migrations/missing.json')
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('deleteMigrationFile with S3', () => {
    it('should delete migration file from S3 successfully', async () => {
      const { storageService } = await import('../../../src/services/storage.js');

      mockSend.mockResolvedValueOnce({});

      await storageService.deleteMigrationFile('test-tenant/migrations/file.json');

      expect(mockSend).toHaveBeenCalled();
    });

    it('should handle S3 deletion errors gracefully', async () => {
      const { storageService } = await import('../../../src/services/storage.js');

      mockSend.mockRejectedValueOnce(new Error('S3 deletion failed'));

      // Should not throw, just log warning
      await expect(
        storageService.deleteMigrationFile('test-tenant/migrations/file.json')
      ).resolves.toBeUndefined();
    });

    it('should handle S3 access denied errors gracefully', async () => {
      const { storageService } = await import('../../../src/services/storage.js');

      const accessDeniedError = new Error('Access Denied');
      (accessDeniedError as unknown as { Code: string }).Code = 'AccessDenied';
      mockSend.mockRejectedValueOnce(accessDeniedError);

      // Should not throw, just log warning
      await expect(
        storageService.deleteMigrationFile('test-tenant/migrations/protected.json')
      ).resolves.toBeUndefined();
    });
  });

  describe('uploadMigrationFile with S3', () => {
    it('should upload migration file to S3', async () => {
      const { storageService } = await import('../../../src/services/storage.js');

      mockSend.mockResolvedValueOnce({});

      const content = Buffer.from('migration data');
      const storageKey = await storageService.uploadMigrationFile(
        'test-tenant',
        'import.json',
        content,
        { source: 'servicenow' }
      );

      expect(mockSend).toHaveBeenCalled();
      expect(storageKey).toContain('test-tenant/migrations');
    });
  });

  describe('isConfigured', () => {
    it('should return true when S3 is configured', async () => {
      const { storageService } = await import('../../../src/services/storage.js');
      expect(storageService.isConfigured()).toBe(true);
    });
  });

  describe('generateUploadUrl with S3', () => {
    it('should generate S3 presigned URL', async () => {
      const { storageService } = await import('../../../src/services/storage.js');

      const result = await storageService.generateUploadUrl(
        'test-tenant',
        'issue',
        'issue-1',
        'document.pdf',
        'application/pdf',
        1000
      );

      // Should return presigned URL from mock
      expect(result.uploadUrl).toContain('mock-presigned-url');
      expect(result.storageKey).toContain('test-tenant/issue/issue-1');
      expect(result.expiresAt).toBeInstanceOf(Date);
    });

    it('should generate presigned URL with correct content type', async () => {
      const { storageService } = await import('../../../src/services/storage.js');

      const result = await storageService.generateUploadUrl(
        'test-tenant',
        'change',
        'change-1',
        'screenshot.png',
        'image/png',
        2000
      );

      expect(result.uploadUrl).toBeDefined();
      expect(result.storageKey).toContain('.png');
    });
  });

  describe('hardDelete with S3', () => {
    it('should delete file from S3 when attachment exists', async () => {
      const { storageService } = await import('../../../src/services/storage.js');

      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'attachment-1',
          storage_key: 'test-tenant/issue/issue-1/file.pdf',
          storage_bucket: 'test-bucket',
        }],
      });
      mockQuery.mockResolvedValueOnce({ rows: [] }); // DELETE from DB
      mockSend.mockResolvedValueOnce({}); // S3 delete success

      await storageService.hardDelete('test-tenant', 'attachment-1');

      expect(mockSend).toHaveBeenCalled();
      expect(mockQuery).toHaveBeenCalledTimes(2);
    });

    it('should handle S3 deletion errors gracefully during hardDelete', async () => {
      const { storageService } = await import('../../../src/services/storage.js');

      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'attachment-1',
          storage_key: 'test-tenant/issue/issue-1/file.pdf',
          storage_bucket: 'test-bucket',
        }],
      });
      mockQuery.mockResolvedValueOnce({ rows: [] }); // DELETE from DB
      mockSend.mockRejectedValueOnce(new Error('S3 delete failed')); // S3 error

      // Should not throw - should continue to delete from database
      await expect(
        storageService.hardDelete('test-tenant', 'attachment-1')
      ).resolves.toBeUndefined();

      // Should still delete from database
      expect(mockQuery).toHaveBeenCalledTimes(2);
    });
  });

  describe('download with S3', () => {
    it('should download file from S3 when attachment exists', async () => {
      const { storageService } = await import('../../../src/services/storage.js');

      const fileContent = Buffer.from('file content from S3');
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'attachment-1',
          storage_key: 'test-tenant/issue/issue-1/file.txt',
          original_filename: 'document.txt',
          mime_type: 'text/plain',
        }],
      });
      mockSend.mockResolvedValueOnce({
        Body: createMockS3Body(fileContent),
      });

      const result = await storageService.download('test-tenant', 'attachment-1');

      expect(mockSend).toHaveBeenCalled();
      expect(result.content).toEqual(fileContent);
      expect(result.filename).toBe('document.txt');
    });

    it('should throw error when S3 response has no Body', async () => {
      const { storageService } = await import('../../../src/services/storage.js');

      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'attachment-1',
          storage_key: 'test-tenant/issue/issue-1/file.txt',
          original_filename: 'document.txt',
          mime_type: 'text/plain',
        }],
      });
      mockSend.mockResolvedValueOnce({ Body: null });

      // The code uses Body! assertion, so null Body causes TypeError
      await expect(
        storageService.download('test-tenant', 'attachment-1')
      ).rejects.toThrow(TypeError);
    });
  });

  describe('upload with S3', () => {
    it('should upload file to S3', async () => {
      const { storageService } = await import('../../../src/services/storage.js');

      const content = Buffer.from('test file content');
      mockSend.mockResolvedValueOnce({}); // S3 put success

      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'attachment-1',
          filename: 'abc123xyz789.pdf',
          original_filename: 'document.pdf',
          file_size: content.length,
          mime_type: 'application/pdf',
          storage_key: 'test-tenant/issue/issue-1/abc123xyz789.pdf',
        }],
      });

      const result = await storageService.upload({
        tenantSlug: 'test-tenant',
        entityType: 'issue',
        entityId: 'issue-1',
        filename: 'document.pdf',
        content,
        mimeType: 'application/pdf',
        uploadedBy: 'user-1',
      });

      expect(mockSend).toHaveBeenCalled();
      expect(result.originalFilename).toBe('document.pdf');
    });
  });
});
