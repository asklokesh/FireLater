import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash } from 'crypto';

/**
 * Unit tests for StorageService
 * Testing file upload, download, deletion, and URL generation
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

// Mock S3 client - we'll test local storage path (when S3 not configured)
const mockSend = vi.fn();
vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn().mockImplementation(() => ({
    send: (...args: unknown[]) => mockSend(...args),
  })),
  PutObjectCommand: vi.fn(),
  GetObjectCommand: vi.fn(),
  DeleteObjectCommand: vi.fn(),
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

// Mock config - S3 not configured to test local storage path
vi.mock('../../../src/config/index.js', () => ({
  config: {
    s3: {
      bucket: '',
      accessKey: '',
      secretKey: '',
      region: 'us-east-1',
      endpoint: undefined,
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
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'json': 'application/json',
      'csv': 'text/csv',
      'zip': 'application/zip',
      'exe': 'application/x-msdownload',
    };
    return mimeTypes[ext || ''] || false;
  },
}));

import { NotFoundError, BadRequestError } from '../../../src/utils/errors.js';

describe('StorageService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);
    mockUnlink.mockResolvedValue(undefined);
    process.env.API_URL = 'http://localhost:3001';
  });

  describe('isConfigured', () => {
    it('should return false when S3 is not configured', async () => {
      const { storageService } = await import('../../../src/services/storage.js');
      expect(storageService.isConfigured()).toBe(false);
    });
  });

  describe('upload', () => {
    it('should throw BadRequestError for disallowed mime type', async () => {
      const { storageService } = await import('../../../src/services/storage.js');

      await expect(
        storageService.upload({
          tenantSlug: 'test-tenant',
          entityType: 'issue',
          entityId: 'issue-1',
          filename: 'malware.exe',
          content: Buffer.from('malicious content'),
          mimeType: 'application/x-msdownload',
          uploadedBy: 'user-1',
        })
      ).rejects.toThrow(BadRequestError);
    });

    it('should throw BadRequestError for files exceeding size limit', async () => {
      const { storageService } = await import('../../../src/services/storage.js');

      // Create buffer larger than 50MB
      const largeContent = Buffer.alloc(51 * 1024 * 1024);

      await expect(
        storageService.upload({
          tenantSlug: 'test-tenant',
          entityType: 'issue',
          entityId: 'issue-1',
          filename: 'large.pdf',
          content: largeContent,
          mimeType: 'application/pdf',
          uploadedBy: 'user-1',
        })
      ).rejects.toThrow(/File too large/);
    });

    it('should upload file to local storage when S3 not configured', async () => {
      const { storageService } = await import('../../../src/services/storage.js');

      const content = Buffer.from('test file content');
      const checksum = createHash('sha256').update(content).digest('hex');

      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'attachment-1',
          filename: 'abc123xyz789.pdf',
          original_filename: 'document.pdf',
          file_size: content.length,
          mime_type: 'application/pdf',
          storage_key: 'test-tenant/issue/issue-1/abc123xyz789.pdf',
          checksum,
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

      expect(mockMkdir).toHaveBeenCalled();
      expect(mockWriteFile).toHaveBeenCalled();
      expect(result.originalFilename).toBe('document.pdf');
      expect(result.mimeType).toBe('application/pdf');
    });

    it('should detect mime type from filename when not provided', async () => {
      const { storageService } = await import('../../../src/services/storage.js');

      const content = Buffer.from('image data');

      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'attachment-1',
          filename: 'abc123xyz789.png',
          original_filename: 'screenshot.png',
          file_size: content.length,
          mime_type: 'image/png',
          storage_key: 'test-tenant/issue/issue-1/abc123xyz789.png',
        }],
      });

      const result = await storageService.upload({
        tenantSlug: 'test-tenant',
        entityType: 'issue',
        entityId: 'issue-1',
        filename: 'screenshot.png',
        content,
        uploadedBy: 'user-1',
        // mimeType not provided
      });

      expect(result.mimeType).toBe('image/png');
    });

    it('should generate unique storage key', async () => {
      const { storageService } = await import('../../../src/services/storage.js');

      const content = Buffer.from('test');

      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'attachment-1',
          storage_key: 'test-tenant/change/change-1/abc123xyz789.txt',
        }],
      });

      await storageService.upload({
        tenantSlug: 'test-tenant',
        entityType: 'change',
        entityId: 'change-1',
        filename: 'notes.txt',
        content,
        uploadedBy: 'user-1',
      });

      // Verify INSERT was called with proper storage key format
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO'),
        expect.arrayContaining([
          'change', // entityType
          'change-1', // entityId
        ])
      );
    });
  });

  describe('getDownloadUrl', () => {
    it('should throw NotFoundError for non-existent attachment', async () => {
      const { storageService } = await import('../../../src/services/storage.js');

      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        storageService.getDownloadUrl('test-tenant', 'non-existent-id')
      ).rejects.toThrow(NotFoundError);
    });

    it('should return local endpoint URL when S3 not configured', async () => {
      const { storageService } = await import('../../../src/services/storage.js');

      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'attachment-1',
          storage_key: 'test-tenant/issue/issue-1/file.pdf',
          storage_bucket: 'test-bucket',
          original_filename: 'document.pdf',
        }],
      });

      const url = await storageService.getDownloadUrl('test-tenant', 'attachment-1');

      expect(url).toContain('/api/attachments/attachment-1/download');
      expect(url).toContain('tenant=test-tenant');
    });
  });

  describe('getViewUrl', () => {
    it('should throw NotFoundError for non-existent attachment', async () => {
      const { storageService } = await import('../../../src/services/storage.js');

      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        storageService.getViewUrl('test-tenant', 'non-existent-id')
      ).rejects.toThrow(NotFoundError);
    });

    it('should return view endpoint URL when S3 not configured', async () => {
      const { storageService } = await import('../../../src/services/storage.js');

      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'attachment-1',
          storage_key: 'test-tenant/issue/issue-1/image.png',
          storage_bucket: 'test-bucket',
          mime_type: 'image/png',
        }],
      });

      const url = await storageService.getViewUrl('test-tenant', 'attachment-1');

      expect(url).toContain('/api/attachments/attachment-1/view');
      expect(url).toContain('tenant=test-tenant');
    });
  });

  describe('download', () => {
    it('should throw NotFoundError for non-existent attachment', async () => {
      const { storageService } = await import('../../../src/services/storage.js');

      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        storageService.download('test-tenant', 'non-existent-id')
      ).rejects.toThrow(NotFoundError);
    });

    it('should read file from local storage when S3 not configured', async () => {
      const { storageService } = await import('../../../src/services/storage.js');

      const fileContent = Buffer.from('file content');
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'attachment-1',
          storage_key: 'test-tenant/issue/issue-1/file.txt',
          original_filename: 'document.txt',
          mime_type: 'text/plain',
        }],
      });
      mockReadFile.mockResolvedValueOnce(fileContent);

      const result = await storageService.download('test-tenant', 'attachment-1');

      expect(result.content).toEqual(fileContent);
      expect(result.filename).toBe('document.txt');
      expect(result.mimeType).toBe('text/plain');
    });

    it('should throw NotFoundError when local file does not exist', async () => {
      const { storageService } = await import('../../../src/services/storage.js');

      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'attachment-1',
          storage_key: 'test-tenant/issue/issue-1/missing.txt',
          original_filename: 'missing.txt',
          mime_type: 'text/plain',
        }],
      });
      mockReadFile.mockRejectedValueOnce(new Error('ENOENT'));

      await expect(
        storageService.download('test-tenant', 'attachment-1')
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('delete (soft delete)', () => {
    it('should throw NotFoundError for non-existent attachment', async () => {
      const { storageService } = await import('../../../src/services/storage.js');

      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        storageService.delete('test-tenant', 'non-existent-id', 'user-1')
      ).rejects.toThrow(NotFoundError);
    });

    it('should soft delete attachment by marking it deleted', async () => {
      const { storageService } = await import('../../../src/services/storage.js');

      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'attachment-1',
          storage_key: 'test-tenant/issue/issue-1/file.pdf',
        }],
      });
      mockQuery.mockResolvedValueOnce({ rows: [] }); // UPDATE

      await storageService.delete('test-tenant', 'attachment-1', 'user-1');

      expect(mockQuery).toHaveBeenCalledTimes(2);
      expect(mockQuery.mock.calls[1][0]).toContain('is_deleted = true');
    });
  });

  describe('hardDelete', () => {
    it('should do nothing for non-existent attachment', async () => {
      const { storageService } = await import('../../../src/services/storage.js');

      mockQuery.mockResolvedValueOnce({ rows: [] });

      await storageService.hardDelete('test-tenant', 'non-existent-id');

      // Should not throw, just return
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it('should delete file from local storage and database', async () => {
      const { storageService } = await import('../../../src/services/storage.js');

      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'attachment-1',
          storage_key: 'test-tenant/issue/issue-1/file.pdf',
          storage_bucket: 'test-bucket',
        }],
      });
      mockQuery.mockResolvedValueOnce({ rows: [] }); // DELETE

      await storageService.hardDelete('test-tenant', 'attachment-1');

      expect(mockUnlink).toHaveBeenCalled();
      expect(mockQuery.mock.calls[1][0]).toContain('DELETE FROM');
    });

    it('should handle file deletion errors gracefully', async () => {
      const { storageService } = await import('../../../src/services/storage.js');

      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'attachment-1',
          storage_key: 'test-tenant/issue/issue-1/file.pdf',
        }],
      });
      mockQuery.mockResolvedValueOnce({ rows: [] }); // DELETE
      mockUnlink.mockRejectedValueOnce(new Error('ENOENT'));

      // Should not throw even if file deletion fails
      await expect(
        storageService.hardDelete('test-tenant', 'attachment-1')
      ).resolves.toBeUndefined();
    });
  });

  describe('listByEntity', () => {
    it('should return attachments for entity', async () => {
      const { storageService } = await import('../../../src/services/storage.js');

      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'attachment-1',
            entity_type: 'issue',
            entity_id: 'issue-1',
            original_filename: 'doc1.pdf',
            uploaded_by_name: 'John',
          },
          {
            id: 'attachment-2',
            entity_type: 'issue',
            entity_id: 'issue-1',
            original_filename: 'doc2.pdf',
            uploaded_by_name: 'Jane',
          },
        ],
      });

      const results = await storageService.listByEntity('test-tenant', 'issue', 'issue-1');

      expect(results).toHaveLength(2);
      expect(results[0].original_filename).toBe('doc1.pdf');
    });

    it('should return empty array when no attachments', async () => {
      const { storageService } = await import('../../../src/services/storage.js');

      mockQuery.mockResolvedValueOnce({ rows: [] });

      const results = await storageService.listByEntity('test-tenant', 'change', 'change-1');

      expect(results).toEqual([]);
    });
  });

  describe('getById', () => {
    it('should return attachment record', async () => {
      const { storageService } = await import('../../../src/services/storage.js');

      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'attachment-1',
          original_filename: 'report.pdf',
          uploaded_by_name: 'Admin',
        }],
      });

      const result = await storageService.getById('test-tenant', 'attachment-1');

      expect(result?.original_filename).toBe('report.pdf');
    });

    it('should return null for non-existent attachment', async () => {
      const { storageService } = await import('../../../src/services/storage.js');

      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await storageService.getById('test-tenant', 'non-existent');

      expect(result).toBeNull();
    });
  });

  describe('getStorageUsage', () => {
    it('should aggregate storage usage by entity type', async () => {
      const { storageService } = await import('../../../src/services/storage.js');

      mockQuery.mockResolvedValueOnce({
        rows: [
          { entity_type: 'issue', total_files: '10', total_size: '5000000' },
          { entity_type: 'change', total_files: '5', total_size: '2500000' },
        ],
      });

      const usage = await storageService.getStorageUsage('test-tenant');

      expect(usage.totalFiles).toBe(15);
      expect(usage.totalSize).toBe(7500000);
      expect(usage.byEntityType.issue.files).toBe(10);
      expect(usage.byEntityType.change.files).toBe(5);
    });

    it('should return zeros when no storage usage', async () => {
      const { storageService } = await import('../../../src/services/storage.js');

      mockQuery.mockResolvedValueOnce({ rows: [] });

      const usage = await storageService.getStorageUsage('test-tenant');

      expect(usage.totalFiles).toBe(0);
      expect(usage.totalSize).toBe(0);
      expect(usage.byEntityType).toEqual({});
    });
  });

  describe('generateUploadUrl', () => {
    it('should throw BadRequestError for disallowed mime type', async () => {
      const { storageService } = await import('../../../src/services/storage.js');

      await expect(
        storageService.generateUploadUrl(
          'test-tenant',
          'issue',
          'issue-1',
          'malware.exe',
          'application/x-msdownload',
          1000
        )
      ).rejects.toThrow(BadRequestError);
    });

    it('should throw BadRequestError for oversized files', async () => {
      const { storageService } = await import('../../../src/services/storage.js');

      await expect(
        storageService.generateUploadUrl(
          'test-tenant',
          'issue',
          'issue-1',
          'large.pdf',
          'application/pdf',
          51 * 1024 * 1024 // 51 MB
        )
      ).rejects.toThrow(/File too large/);
    });

    it('should return local upload endpoint when S3 not configured', async () => {
      const { storageService } = await import('../../../src/services/storage.js');

      const result = await storageService.generateUploadUrl(
        'test-tenant',
        'issue',
        'issue-1',
        'document.pdf',
        'application/pdf',
        1000
      );

      expect(result.uploadUrl).toContain('/api/attachments/upload');
      expect(result.storageKey).toContain('test-tenant/issue/issue-1');
      expect(result.expiresAt).toBeInstanceOf(Date);
    });
  });

  describe('Migration files', () => {
    describe('uploadMigrationFile', () => {
      it('should upload migration file to local storage', async () => {
        const { storageService } = await import('../../../src/services/storage.js');

        const content = Buffer.from('migration data');

        const storageKey = await storageService.uploadMigrationFile(
          'test-tenant',
          'import.json',
          content,
          { source: 'servicenow' }
        );

        expect(storageKey).toContain('test-tenant/migrations');
        expect(mockMkdir).toHaveBeenCalled();
        expect(mockWriteFile).toHaveBeenCalled();
      });
    });

    describe('downloadMigrationFile', () => {
      it('should download migration file from local storage', async () => {
        const { storageService } = await import('../../../src/services/storage.js');

        const fileContent = Buffer.from('migration content');
        mockReadFile.mockResolvedValueOnce(fileContent);

        const result = await storageService.downloadMigrationFile('test-tenant/migrations/file.json');

        expect(result).toEqual(fileContent);
      });

      it('should throw NotFoundError when file not found', async () => {
        const { storageService } = await import('../../../src/services/storage.js');

        mockReadFile.mockRejectedValueOnce(new Error('ENOENT'));

        await expect(
          storageService.downloadMigrationFile('test-tenant/migrations/missing.json')
        ).rejects.toThrow(NotFoundError);
      });
    });

    describe('deleteMigrationFile', () => {
      it('should delete migration file from local storage', async () => {
        const { storageService } = await import('../../../src/services/storage.js');

        await storageService.deleteMigrationFile('test-tenant/migrations/file.json');

        expect(mockUnlink).toHaveBeenCalled();
      });

      it('should handle deletion errors gracefully', async () => {
        const { storageService } = await import('../../../src/services/storage.js');

        mockUnlink.mockRejectedValueOnce(new Error('ENOENT'));

        // Should not throw
        await expect(
          storageService.deleteMigrationFile('test-tenant/migrations/missing.json')
        ).resolves.toBeUndefined();
      });
    });
  });
});

describe('File Extension Handling', () => {
  it('should extract extension correctly', async () => {
    // This tests the private getExtension method indirectly through upload
    const { storageService } = await import('../../../src/services/storage.js');

    const content = Buffer.from('test');
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: 'attachment-1',
        filename: 'abc123xyz789.pdf',
      }],
    });

    await storageService.upload({
      tenantSlug: 'test-tenant',
      entityType: 'issue',
      entityId: 'issue-1',
      filename: 'document.Report.FINAL.pdf',
      content,
      uploadedBy: 'user-1',
    });

    // The INSERT should include the extension
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT'),
      expect.arrayContaining(['.pdf'])
    );
  });

  it('should handle files without extension', async () => {
    const { storageService } = await import('../../../src/services/storage.js');

    const content = Buffer.from('test');
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: 'attachment-1',
        filename: 'abc123xyz789',
        mime_type: 'application/octet-stream',
      }],
    });

    // Should not throw for files without extension
    await expect(
      storageService.upload({
        tenantSlug: 'test-tenant',
        entityType: 'issue',
        entityId: 'issue-1',
        filename: 'README',
        content,
        mimeType: 'text/plain',
        uploadedBy: 'user-1',
      })
    ).resolves.toBeDefined();
  });
});

describe('Allowed MIME Types', () => {
  it('should allow PDF files', async () => {
    const { storageService } = await import('../../../src/services/storage.js');

    const content = Buffer.from('test');
    mockQuery.mockResolvedValueOnce({ rows: [{ id: '1' }] });

    await expect(
      storageService.upload({
        tenantSlug: 'test-tenant',
        entityType: 'issue',
        entityId: 'issue-1',
        filename: 'doc.pdf',
        content,
        mimeType: 'application/pdf',
        uploadedBy: 'user-1',
      })
    ).resolves.toBeDefined();
  });

  it('should allow image files (PNG, JPEG)', async () => {
    const { storageService } = await import('../../../src/services/storage.js');

    const content = Buffer.from('test');
    mockQuery.mockResolvedValueOnce({ rows: [{ id: '1' }] });

    await expect(
      storageService.upload({
        tenantSlug: 'test-tenant',
        entityType: 'issue',
        entityId: 'issue-1',
        filename: 'screenshot.png',
        content,
        mimeType: 'image/png',
        uploadedBy: 'user-1',
      })
    ).resolves.toBeDefined();
  });

  it('should allow archive files (ZIP)', async () => {
    const { storageService } = await import('../../../src/services/storage.js');

    const content = Buffer.from('test');
    mockQuery.mockResolvedValueOnce({ rows: [{ id: '1' }] });

    await expect(
      storageService.upload({
        tenantSlug: 'test-tenant',
        entityType: 'issue',
        entityId: 'issue-1',
        filename: 'logs.zip',
        content,
        mimeType: 'application/zip',
        uploadedBy: 'user-1',
      })
    ).resolves.toBeDefined();
  });

  it('should reject executable files', async () => {
    const { storageService } = await import('../../../src/services/storage.js');

    const content = Buffer.from('test');

    await expect(
      storageService.upload({
        tenantSlug: 'test-tenant',
        entityType: 'issue',
        entityId: 'issue-1',
        filename: 'malware.exe',
        content,
        mimeType: 'application/x-msdownload',
        uploadedBy: 'user-1',
      })
    ).rejects.toThrow(BadRequestError);
  });
});
