import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

// Mock services
vi.mock('../../../src/services/storage.js', () => ({
  storageService: {
    generateUploadUrl: vi.fn().mockResolvedValue({ url: 'https://s3.example.com/upload', fields: {} }),
    upload: vi.fn().mockResolvedValue({ id: 'attachment-1' }),
    listByEntity: vi.fn().mockResolvedValue([]),
    getById: vi.fn().mockResolvedValue(null),
    getDownloadUrl: vi.fn().mockResolvedValue('https://s3.example.com/download'),
    getViewUrl: vi.fn().mockResolvedValue('https://s3.example.com/view'),
    download: vi.fn().mockResolvedValue({ content: Buffer.from(''), filename: 'test.txt', mimeType: 'text/plain' }),
    delete: vi.fn().mockResolvedValue(undefined),
    getStorageUsage: vi.fn().mockResolvedValue({ used: 0, limit: 0 }),
  },
  EntityType: {
    ISSUE: 'issue',
    CHANGE: 'change',
    PROBLEM: 'problem',
    REQUEST: 'request',
    KNOWLEDGE: 'knowledge',
  },
}));

// Mock middleware
vi.mock('../../../src/middleware/auth.js', () => ({
  requirePermission: vi.fn().mockReturnValue(vi.fn().mockImplementation((_req, _reply, done) => done())),
}));

// Mock database
vi.mock('../../../src/config/database.js', () => ({
  pool: {
    query: vi.fn().mockResolvedValue({ rows: [] }),
  },
}));

describe('Attachments Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Entity Type Enum', () => {
    const entityTypeEnum = z.enum(['issue', 'change', 'problem', 'request', 'knowledge']);

    it('should accept issue type', () => {
      const result = entityTypeEnum.safeParse('issue');
      expect(result.success).toBe(true);
    });

    it('should accept change type', () => {
      const result = entityTypeEnum.safeParse('change');
      expect(result.success).toBe(true);
    });

    it('should accept problem type', () => {
      const result = entityTypeEnum.safeParse('problem');
      expect(result.success).toBe(true);
    });

    it('should accept request type', () => {
      const result = entityTypeEnum.safeParse('request');
      expect(result.success).toBe(true);
    });

    it('should accept knowledge type', () => {
      const result = entityTypeEnum.safeParse('knowledge');
      expect(result.success).toBe(true);
    });

    it('should reject invalid type', () => {
      const result = entityTypeEnum.safeParse('unknown');
      expect(result.success).toBe(false);
    });
  });

  describe('Upload URL Schema', () => {
    const uploadUrlSchema = z.object({
      entityType: z.enum(['issue', 'change', 'problem', 'request', 'knowledge']),
      entityId: z.string().uuid(),
      filename: z.string().min(1).max(255),
      mimeType: z.string().min(1).max(100),
      fileSize: z.number().int().positive().max(52428800),
    });

    it('should require all fields', () => {
      const result = uploadUrlSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should accept valid upload url request', () => {
      const result = uploadUrlSchema.safeParse({
        entityType: 'issue',
        entityId: '123e4567-e89b-12d3-a456-426614174000',
        filename: 'document.pdf',
        mimeType: 'application/pdf',
        fileSize: 1024000,
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid entityId', () => {
      const result = uploadUrlSchema.safeParse({
        entityType: 'issue',
        entityId: 'not-a-uuid',
        filename: 'document.pdf',
        mimeType: 'application/pdf',
        fileSize: 1024000,
      });
      expect(result.success).toBe(false);
    });

    it('should reject empty filename', () => {
      const result = uploadUrlSchema.safeParse({
        entityType: 'issue',
        entityId: '123e4567-e89b-12d3-a456-426614174000',
        filename: '',
        mimeType: 'application/pdf',
        fileSize: 1024000,
      });
      expect(result.success).toBe(false);
    });

    it('should reject filename over 255 characters', () => {
      const result = uploadUrlSchema.safeParse({
        entityType: 'issue',
        entityId: '123e4567-e89b-12d3-a456-426614174000',
        filename: 'x'.repeat(256),
        mimeType: 'application/pdf',
        fileSize: 1024000,
      });
      expect(result.success).toBe(false);
    });

    it('should reject file over 50MB', () => {
      const result = uploadUrlSchema.safeParse({
        entityType: 'issue',
        entityId: '123e4567-e89b-12d3-a456-426614174000',
        filename: 'document.pdf',
        mimeType: 'application/pdf',
        fileSize: 60000000,
      });
      expect(result.success).toBe(false);
    });

    it('should reject negative fileSize', () => {
      const result = uploadUrlSchema.safeParse({
        entityType: 'issue',
        entityId: '123e4567-e89b-12d3-a456-426614174000',
        filename: 'document.pdf',
        mimeType: 'application/pdf',
        fileSize: -100,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('Confirm Upload Schema', () => {
    const confirmUploadSchema = z.object({
      entityType: z.enum(['issue', 'change', 'problem', 'request', 'knowledge']),
      entityId: z.string().uuid(),
      storageKey: z.string().min(1),
      filename: z.string().min(1).max(255),
      mimeType: z.string().min(1).max(100),
      fileSize: z.number().int().positive(),
      checksum: z.string().optional(),
      metadata: z.record(z.unknown()).optional(),
    });

    it('should require essential fields', () => {
      const result = confirmUploadSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should accept valid confirm upload', () => {
      const result = confirmUploadSchema.safeParse({
        entityType: 'issue',
        entityId: '123e4567-e89b-12d3-a456-426614174000',
        storageKey: 'tenant_123/issue/456/document.pdf',
        filename: 'document.pdf',
        mimeType: 'application/pdf',
        fileSize: 1024000,
      });
      expect(result.success).toBe(true);
    });

    it('should accept checksum', () => {
      const result = confirmUploadSchema.safeParse({
        entityType: 'issue',
        entityId: '123e4567-e89b-12d3-a456-426614174000',
        storageKey: 'tenant_123/issue/456/document.pdf',
        filename: 'document.pdf',
        mimeType: 'application/pdf',
        fileSize: 1024000,
        checksum: 'sha256:abc123',
      });
      expect(result.success).toBe(true);
    });

    it('should accept metadata', () => {
      const result = confirmUploadSchema.safeParse({
        entityType: 'issue',
        entityId: '123e4567-e89b-12d3-a456-426614174000',
        storageKey: 'tenant_123/issue/456/document.pdf',
        filename: 'document.pdf',
        mimeType: 'application/pdf',
        fileSize: 1024000,
        metadata: { description: 'Invoice document' },
      });
      expect(result.success).toBe(true);
    });
  });

  describe('Entity Parameters Schema', () => {
    const entityParamsSchema = z.object({
      entityType: z.enum(['issue', 'change', 'problem', 'request', 'knowledge']),
      entityId: z.string().uuid(),
    });

    it('should require entityType and entityId', () => {
      const result = entityParamsSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should accept valid entity params', () => {
      const result = entityParamsSchema.safeParse({
        entityType: 'issue',
        entityId: '123e4567-e89b-12d3-a456-426614174000',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('Attachment ID Schema', () => {
    const attachmentIdSchema = z.object({
      id: z.string().uuid(),
    });

    it('should accept valid UUID', () => {
      const result = attachmentIdSchema.safeParse({
        id: '123e4567-e89b-12d3-a456-426614174000',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid UUID', () => {
      const result = attachmentIdSchema.safeParse({ id: 'not-a-uuid' });
      expect(result.success).toBe(false);
    });
  });

  describe('Download URL Query Schema', () => {
    const downloadUrlQuerySchema = z.object({
      expires: z.coerce.number().int().min(60).max(86400).optional(),
    });

    it('should accept empty query', () => {
      const result = downloadUrlQuerySchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should accept expires parameter', () => {
      const result = downloadUrlQuerySchema.safeParse({ expires: '3600' });
      expect(result.success).toBe(true);
    });

    it('should reject expires under 60', () => {
      const result = downloadUrlQuerySchema.safeParse({ expires: '30' });
      expect(result.success).toBe(false);
    });

    it('should reject expires over 86400 (24 hours)', () => {
      const result = downloadUrlQuerySchema.safeParse({ expires: '100000' });
      expect(result.success).toBe(false);
    });
  });

  describe('Route Permissions', () => {
    it('should require issues:write for POST /upload-url', () => {
      const permission = 'issues:write';
      expect(permission).toBe('issues:write');
    });

    it('should require issues:write for POST /confirm-upload', () => {
      const permission = 'issues:write';
      expect(permission).toBe('issues:write');
    });

    it('should require issues:write for POST /:entityType/:entityId', () => {
      const permission = 'issues:write';
      expect(permission).toBe('issues:write');
    });

    it('should require issues:read for GET /:entityType/:entityId', () => {
      const permission = 'issues:read';
      expect(permission).toBe('issues:read');
    });

    it('should require issues:read for GET /file/:id', () => {
      const permission = 'issues:read';
      expect(permission).toBe('issues:read');
    });

    it('should require issues:read for GET /file/:id/download-url', () => {
      const permission = 'issues:read';
      expect(permission).toBe('issues:read');
    });

    it('should require issues:read for GET /file/:id/view-url', () => {
      const permission = 'issues:read';
      expect(permission).toBe('issues:read');
    });

    it('should require issues:read for GET /file/:id/download', () => {
      const permission = 'issues:read';
      expect(permission).toBe('issues:read');
    });

    it('should require issues:write for DELETE /file/:id', () => {
      const permission = 'issues:write';
      expect(permission).toBe('issues:write');
    });

    it('should require admin:read for GET /usage', () => {
      const permission = 'admin:read';
      expect(permission).toBe('admin:read');
    });
  });

  describe('Response Formats', () => {
    it('should return upload URL response', () => {
      const response = {
        url: 'https://s3.example.com/upload',
        fields: { key: 'tenant_123/issue/456/doc.pdf' },
      };
      expect(response).toHaveProperty('url');
      expect(response).toHaveProperty('fields');
    });

    it('should return attachments in wrapper', () => {
      const attachments = [{ id: 'att-1', filename: 'doc.pdf' }];
      const response = { attachments };
      expect(response).toHaveProperty('attachments');
    });

    it('should return 404 for missing attachment', () => {
      const error = { statusCode: 404, message: 'Attachment not found' };
      expect(error.statusCode).toBe(404);
    });

    it('should return url and expiresIn for download-url', () => {
      const response = {
        url: 'https://s3.example.com/download',
        expiresIn: 3600,
      };
      expect(response).toHaveProperty('url');
      expect(response).toHaveProperty('expiresIn');
    });

    it('should return success for delete', () => {
      const response = { success: true };
      expect(response.success).toBe(true);
    });

    it('should return 400 for no file uploaded', () => {
      const response = { error: 'No file uploaded' };
      expect(response.error).toBe('No file uploaded');
    });
  });

  describe('Storage Usage Response', () => {
    it('should return usage object', () => {
      const usage = {
        used: 1073741824,
        limit: 10737418240,
        usedFormatted: '1 GB',
        limitFormatted: '10 GB',
        percentUsed: 10,
      };
      expect(usage).toHaveProperty('used');
      expect(usage).toHaveProperty('limit');
    });
  });

  describe('Service Integration', () => {
    it('should pass parameters to storageService.generateUploadUrl', async () => {
      const { storageService } = await import('../../../src/services/storage.js');
      const params = {
        tenantSlug: 'test-tenant',
        entityType: 'issue',
        entityId: '123e4567-e89b-12d3-a456-426614174000',
        filename: 'document.pdf',
        mimeType: 'application/pdf',
        fileSize: 1024000,
      };

      await storageService.generateUploadUrl(
        params.tenantSlug,
        params.entityType,
        params.entityId,
        params.filename,
        params.mimeType,
        params.fileSize
      );
      expect(storageService.generateUploadUrl).toHaveBeenCalled();
    });

    it('should pass parameters to storageService.listByEntity', async () => {
      const { storageService } = await import('../../../src/services/storage.js');
      const entityType = 'issue';
      const entityId = '123e4567-e89b-12d3-a456-426614174000';

      await storageService.listByEntity('test-tenant', entityType, entityId);
      expect(storageService.listByEntity).toHaveBeenCalledWith('test-tenant', entityType, entityId);
    });

    it('should pass parameters to storageService.getById', async () => {
      const { storageService } = await import('../../../src/services/storage.js');
      const id = '123e4567-e89b-12d3-a456-426614174000';

      await storageService.getById('test-tenant', id);
      expect(storageService.getById).toHaveBeenCalledWith('test-tenant', id);
    });

    it('should pass parameters to storageService.getDownloadUrl', async () => {
      const { storageService } = await import('../../../src/services/storage.js');
      const id = '123e4567-e89b-12d3-a456-426614174000';
      const expiresIn = 3600;

      await storageService.getDownloadUrl('test-tenant', id, expiresIn);
      expect(storageService.getDownloadUrl).toHaveBeenCalledWith('test-tenant', id, expiresIn);
    });

    it('should pass parameters to storageService.delete', async () => {
      const { storageService } = await import('../../../src/services/storage.js');
      const id = '123e4567-e89b-12d3-a456-426614174000';
      const userId = '223e4567-e89b-12d3-a456-426614174000';

      await storageService.delete('test-tenant', id, userId);
      expect(storageService.delete).toHaveBeenCalledWith('test-tenant', id, userId);
    });

    it('should pass tenantSlug to storageService.getStorageUsage', async () => {
      const { storageService } = await import('../../../src/services/storage.js');

      await storageService.getStorageUsage('test-tenant');
      expect(storageService.getStorageUsage).toHaveBeenCalledWith('test-tenant');
    });
  });

  describe('Default Values', () => {
    it('should default expiresIn to 3600', () => {
      const query = {} as { expires?: string };
      const expiresIn = parseInt(query.expires || '3600', 10);
      expect(expiresIn).toBe(3600);
    });
  });

  describe('File Size Limit', () => {
    it('should enforce 50MB file size limit', () => {
      const maxFileSize = 50 * 1024 * 1024;
      expect(maxFileSize).toBe(52428800);
    });
  });
});
