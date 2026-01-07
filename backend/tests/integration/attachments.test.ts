import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import { createTestApp, generateTestToken, createAuthHeader } from '../helpers.js';

// Mock data stores
interface MockAttachment {
  id: string;
  entityType: string;
  entityId: string;
  filename: string;
  originalFilename: string;
  fileSize: number;
  mimeType: string;
  fileExtension: string;
  storageKey: string;
  checksum?: string;
  metadata: Record<string, unknown>;
  uploadedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const attachments: MockAttachment[] = [];

function resetMockData() {
  attachments.length = 0;
}

describe('Attachments Routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp();

    // Get presigned URL for direct upload
    app.post('/v1/attachments/upload-url', async (request, reply) => {
      const body = request.body as {
        entityType: string;
        entityId: string;
        filename: string;
        mimeType: string;
        fileSize: number;
      };

      if (!body.entityType || !body.entityId || !body.filename || !body.mimeType) {
        return reply.status(400).send({ error: 'Missing required fields' });
      }

      // Check file size limit (50 MB)
      if (body.fileSize > 50 * 1024 * 1024) {
        return reply.status(400).send({ error: 'File size exceeds limit (50 MB)' });
      }

      const storageKey = `tenant-test/${body.entityType}/${body.entityId}/${Date.now()}-${body.filename}`;

      reply.send({
        uploadUrl: `https://s3.example.com/presigned?key=${storageKey}`,
        storageKey,
        expiresIn: 3600,
      });
    });

    // Confirm upload (after direct upload to S3)
    app.post('/v1/attachments/confirm-upload', async (request, reply) => {
      const body = request.body as {
        entityType: string;
        entityId: string;
        storageKey: string;
        filename: string;
        mimeType: string;
        fileSize: number;
        checksum?: string;
        metadata?: Record<string, unknown>;
      };

      if (!body.entityType || !body.entityId || !body.storageKey || !body.filename) {
        return reply.status(400).send({ error: 'Missing required fields' });
      }

      const attachment: MockAttachment = {
        id: `att-${Date.now()}`,
        entityType: body.entityType,
        entityId: body.entityId,
        filename: body.storageKey.split('/').pop() || body.filename,
        originalFilename: body.filename,
        fileSize: body.fileSize,
        mimeType: body.mimeType,
        fileExtension: body.filename.includes('.') ? body.filename.substring(body.filename.lastIndexOf('.')) : '',
        storageKey: body.storageKey,
        checksum: body.checksum,
        metadata: body.metadata || {},
        uploadedBy: 'user-123',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      attachments.push(attachment);
      reply.send(attachment);
    });

    // Upload file directly (multipart)
    app.post<{ Params: { entityType: string; entityId: string } }>('/v1/attachments/:entityType/:entityId', async (request, reply) => {
      const { entityType, entityId } = request.params;

      // Simulate file upload
      const body = request.body as {
        filename: string;
        content: string;
        mimeType: string;
      };

      if (!body.filename) {
        return reply.status(400).send({ error: 'No file uploaded' });
      }

      const storageKey = `tenant-test/${entityType}/${entityId}/${Date.now()}-${body.filename}`;
      const fileSize = body.content ? body.content.length : 0;

      const attachment: MockAttachment = {
        id: `att-${Date.now()}`,
        entityType,
        entityId,
        filename: storageKey.split('/').pop() || body.filename,
        originalFilename: body.filename,
        fileSize,
        mimeType: body.mimeType || 'application/octet-stream',
        fileExtension: body.filename.includes('.') ? body.filename.substring(body.filename.lastIndexOf('.')) : '',
        storageKey,
        metadata: {},
        uploadedBy: 'user-123',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      attachments.push(attachment);
      reply.send(attachment);
    });

    // List attachments for an entity
    app.get<{ Params: { entityType: string; entityId: string } }>('/v1/attachments/:entityType/:entityId', async (request, reply) => {
      const { entityType, entityId } = request.params;
      const entityAttachments = attachments.filter(a => a.entityType === entityType && a.entityId === entityId);
      reply.send({ attachments: entityAttachments });
    });

    // Get single attachment details
    app.get<{ Params: { id: string } }>('/v1/attachments/file/:id', async (request, reply) => {
      const attachment = attachments.find(a => a.id === request.params.id);
      if (!attachment) {
        return reply.status(404).send({ statusCode: 404, message: 'Attachment not found' });
      }
      reply.send(attachment);
    });

    // Get download URL
    app.get<{ Params: { id: string }; Querystring: { expires?: string } }>('/v1/attachments/file/:id/download-url', async (request, reply) => {
      const attachment = attachments.find(a => a.id === request.params.id);
      if (!attachment) {
        return reply.status(404).send({ statusCode: 404, message: 'Attachment not found' });
      }

      const expiresIn = parseInt(request.query.expires || '3600', 10);
      const url = `https://s3.example.com/download?key=${attachment.storageKey}&expires=${expiresIn}`;

      reply.send({ url, expiresIn });
    });

    // Get view URL (inline display)
    app.get<{ Params: { id: string }; Querystring: { expires?: string } }>('/v1/attachments/file/:id/view-url', async (request, reply) => {
      const attachment = attachments.find(a => a.id === request.params.id);
      if (!attachment) {
        return reply.status(404).send({ statusCode: 404, message: 'Attachment not found' });
      }

      const expiresIn = parseInt(request.query.expires || '3600', 10);
      const url = `https://s3.example.com/view?key=${attachment.storageKey}&expires=${expiresIn}&inline=true`;

      reply.send({ url, expiresIn });
    });

    // Download file directly
    app.get<{ Params: { id: string } }>('/v1/attachments/file/:id/download', async (request, reply) => {
      const attachment = attachments.find(a => a.id === request.params.id);
      if (!attachment) {
        return reply.status(404).send({ statusCode: 404, message: 'Attachment not found' });
      }

      reply
        .header('Content-Type', attachment.mimeType)
        .header('Content-Disposition', `attachment; filename="${attachment.originalFilename}"`)
        .send(Buffer.from('file content'));
    });

    // Delete attachment
    app.delete<{ Params: { id: string } }>('/v1/attachments/file/:id', async (request, reply) => {
      const index = attachments.findIndex(a => a.id === request.params.id);
      if (index === -1) {
        return reply.status(404).send({ statusCode: 404, message: 'Attachment not found' });
      }

      attachments.splice(index, 1);
      reply.send({ success: true });
    });

    // Get storage usage
    app.get('/v1/attachments/usage', async (request, reply) => {
      const totalSize = attachments.reduce((sum, a) => sum + a.fileSize, 0);
      const byEntityType: Record<string, { count: number; size: number }> = {};

      for (const a of attachments) {
        if (!byEntityType[a.entityType]) {
          byEntityType[a.entityType] = { count: 0, size: 0 };
        }
        byEntityType[a.entityType].count++;
        byEntityType[a.entityType].size += a.fileSize;
      }

      reply.send({
        totalSize,
        totalCount: attachments.length,
        byEntityType,
        limit: 10 * 1024 * 1024 * 1024, // 10 GB
        usage: totalSize / (10 * 1024 * 1024 * 1024),
      });
    });

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    resetMockData();
  });

  // ============================================
  // PRESIGNED UPLOAD URL TESTS
  // ============================================

  describe('POST /v1/attachments/upload-url', () => {
    it('should generate presigned upload URL', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'POST',
        url: '/v1/attachments/upload-url',
        headers: createAuthHeader(token),
        payload: {
          entityType: 'issue',
          entityId: 'iss-123',
          filename: 'screenshot.png',
          mimeType: 'image/png',
          fileSize: 1024 * 100, // 100 KB
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.uploadUrl).toContain('https://s3.example.com/presigned');
      expect(body.storageKey).toContain('screenshot.png');
      expect(body.expiresIn).toBe(3600);
    });

    it('should reject files exceeding size limit', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'POST',
        url: '/v1/attachments/upload-url',
        headers: createAuthHeader(token),
        payload: {
          entityType: 'issue',
          entityId: 'iss-123',
          filename: 'large-file.zip',
          mimeType: 'application/zip',
          fileSize: 100 * 1024 * 1024, // 100 MB (exceeds 50 MB limit)
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('size exceeds');
    });

    it('should reject missing required fields', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'POST',
        url: '/v1/attachments/upload-url',
        headers: createAuthHeader(token),
        payload: {
          filename: 'test.txt',
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  // ============================================
  // CONFIRM UPLOAD TESTS
  // ============================================

  describe('POST /v1/attachments/confirm-upload', () => {
    it('should confirm upload and create attachment record', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'POST',
        url: '/v1/attachments/confirm-upload',
        headers: createAuthHeader(token),
        payload: {
          entityType: 'issue',
          entityId: 'iss-123',
          storageKey: 'tenant-test/issue/iss-123/123456-document.pdf',
          filename: 'document.pdf',
          mimeType: 'application/pdf',
          fileSize: 1024 * 500,
          checksum: 'abc123',
          metadata: { description: 'Test document' },
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.id).toBeDefined();
      expect(body.entityType).toBe('issue');
      expect(body.entityId).toBe('iss-123');
      expect(body.originalFilename).toBe('document.pdf');
      expect(body.mimeType).toBe('application/pdf');
    });

    it('should reject missing required fields', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'POST',
        url: '/v1/attachments/confirm-upload',
        headers: createAuthHeader(token),
        payload: {
          filename: 'test.txt',
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  // ============================================
  // DIRECT UPLOAD TESTS
  // ============================================

  describe('POST /v1/attachments/:entityType/:entityId', () => {
    it('should upload file directly', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'POST',
        url: '/v1/attachments/issue/iss-456',
        headers: createAuthHeader(token),
        payload: {
          filename: 'test-image.jpg',
          content: 'base64content',
          mimeType: 'image/jpeg',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.id).toBeDefined();
      expect(body.entityType).toBe('issue');
      expect(body.entityId).toBe('iss-456');
      expect(body.originalFilename).toBe('test-image.jpg');
    });

    it('should reject when no file provided', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'POST',
        url: '/v1/attachments/issue/iss-456',
        headers: createAuthHeader(token),
        payload: {},
      });

      expect(response.statusCode).toBe(400);
    });
  });

  // ============================================
  // LIST ATTACHMENTS TESTS
  // ============================================

  describe('GET /v1/attachments/:entityType/:entityId', () => {
    it('should return empty list when no attachments exist', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/attachments/issue/iss-123',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.attachments).toEqual([]);
    });

    it('should return attachments for specific entity', async () => {
      // Add some attachments
      attachments.push({
        id: 'att-1',
        entityType: 'issue',
        entityId: 'iss-123',
        filename: 'file1.pdf',
        originalFilename: 'document.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
        fileExtension: '.pdf',
        storageKey: 'tenant-test/issue/iss-123/file1.pdf',
        metadata: {},
        uploadedBy: 'user-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      attachments.push({
        id: 'att-2',
        entityType: 'issue',
        entityId: 'iss-123',
        filename: 'file2.png',
        originalFilename: 'screenshot.png',
        fileSize: 2048,
        mimeType: 'image/png',
        fileExtension: '.png',
        storageKey: 'tenant-test/issue/iss-123/file2.png',
        metadata: {},
        uploadedBy: 'user-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      attachments.push({
        id: 'att-3',
        entityType: 'change',
        entityId: 'chg-456',
        filename: 'file3.txt',
        originalFilename: 'notes.txt',
        fileSize: 512,
        mimeType: 'text/plain',
        fileExtension: '.txt',
        storageKey: 'tenant-test/change/chg-456/file3.txt',
        metadata: {},
        uploadedBy: 'user-2',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/attachments/issue/iss-123',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.attachments).toHaveLength(2);
      expect(body.attachments.every((a: { entityId: string }) => a.entityId === 'iss-123')).toBe(true);
    });
  });

  // ============================================
  // GET SINGLE ATTACHMENT TESTS
  // ============================================

  describe('GET /v1/attachments/file/:id', () => {
    it('should return attachment details', async () => {
      attachments.push({
        id: 'att-single',
        entityType: 'issue',
        entityId: 'iss-123',
        filename: 'test.pdf',
        originalFilename: 'report.pdf',
        fileSize: 5000,
        mimeType: 'application/pdf',
        fileExtension: '.pdf',
        storageKey: 'tenant-test/issue/iss-123/test.pdf',
        checksum: 'checksum123',
        metadata: { pages: 10 },
        uploadedBy: 'user-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/attachments/file/att-single',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.id).toBe('att-single');
      expect(body.originalFilename).toBe('report.pdf');
      expect(body.fileSize).toBe(5000);
    });

    it('should return 404 for non-existent attachment', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/attachments/file/non-existent',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(404);
    });
  });

  // ============================================
  // DOWNLOAD URL TESTS
  // ============================================

  describe('GET /v1/attachments/file/:id/download-url', () => {
    it('should return download URL with default expiration', async () => {
      attachments.push({
        id: 'att-dl',
        entityType: 'issue',
        entityId: 'iss-123',
        filename: 'download.zip',
        originalFilename: 'archive.zip',
        fileSize: 10000,
        mimeType: 'application/zip',
        fileExtension: '.zip',
        storageKey: 'tenant-test/issue/iss-123/download.zip',
        metadata: {},
        uploadedBy: 'user-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/attachments/file/att-dl/download-url',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.url).toContain('https://s3.example.com/download');
      expect(body.expiresIn).toBe(3600);
    });

    it('should return download URL with custom expiration', async () => {
      attachments.push({
        id: 'att-dl-custom',
        entityType: 'issue',
        entityId: 'iss-123',
        filename: 'download.zip',
        originalFilename: 'archive.zip',
        fileSize: 10000,
        mimeType: 'application/zip',
        fileExtension: '.zip',
        storageKey: 'tenant-test/issue/iss-123/download.zip',
        metadata: {},
        uploadedBy: 'user-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/attachments/file/att-dl-custom/download-url?expires=7200',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.expiresIn).toBe(7200);
    });

    it('should return 404 for non-existent attachment', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/attachments/file/non-existent/download-url',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(404);
    });
  });

  // ============================================
  // VIEW URL TESTS
  // ============================================

  describe('GET /v1/attachments/file/:id/view-url', () => {
    it('should return view URL for inline display', async () => {
      attachments.push({
        id: 'att-view',
        entityType: 'issue',
        entityId: 'iss-123',
        filename: 'image.png',
        originalFilename: 'screenshot.png',
        fileSize: 5000,
        mimeType: 'image/png',
        fileExtension: '.png',
        storageKey: 'tenant-test/issue/iss-123/image.png',
        metadata: {},
        uploadedBy: 'user-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/attachments/file/att-view/view-url',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.url).toContain('https://s3.example.com/view');
      expect(body.url).toContain('inline=true');
    });
  });

  // ============================================
  // DIRECT DOWNLOAD TESTS
  // ============================================

  describe('GET /v1/attachments/file/:id/download', () => {
    it('should download file directly', async () => {
      attachments.push({
        id: 'att-direct-dl',
        entityType: 'issue',
        entityId: 'iss-123',
        filename: 'direct.txt',
        originalFilename: 'readme.txt',
        fileSize: 100,
        mimeType: 'text/plain',
        fileExtension: '.txt',
        storageKey: 'tenant-test/issue/iss-123/direct.txt',
        metadata: {},
        uploadedBy: 'user-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/attachments/file/att-direct-dl/download',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toBe('text/plain');
      expect(response.headers['content-disposition']).toContain('readme.txt');
    });

    it('should return 404 for non-existent attachment', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/attachments/file/non-existent/download',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(404);
    });
  });

  // ============================================
  // DELETE ATTACHMENT TESTS
  // ============================================

  describe('DELETE /v1/attachments/file/:id', () => {
    it('should delete an attachment', async () => {
      attachments.push({
        id: 'att-delete',
        entityType: 'issue',
        entityId: 'iss-123',
        filename: 'todelete.pdf',
        originalFilename: 'delete-me.pdf',
        fileSize: 1000,
        mimeType: 'application/pdf',
        fileExtension: '.pdf',
        storageKey: 'tenant-test/issue/iss-123/todelete.pdf',
        metadata: {},
        uploadedBy: 'user-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'DELETE',
        url: '/v1/attachments/file/att-delete',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(attachments.find(a => a.id === 'att-delete')).toBeUndefined();
    });

    it('should return 404 for non-existent attachment', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'DELETE',
        url: '/v1/attachments/file/non-existent',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(404);
    });
  });

  // ============================================
  // STORAGE USAGE TESTS
  // ============================================

  describe('GET /v1/attachments/usage', () => {
    it('should return storage usage statistics', async () => {
      attachments.push({
        id: 'att-1',
        entityType: 'issue',
        entityId: 'iss-1',
        filename: 'file1.pdf',
        originalFilename: 'doc1.pdf',
        fileSize: 1000,
        mimeType: 'application/pdf',
        fileExtension: '.pdf',
        storageKey: 'test/file1.pdf',
        metadata: {},
        uploadedBy: 'user-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      attachments.push({
        id: 'att-2',
        entityType: 'issue',
        entityId: 'iss-2',
        filename: 'file2.png',
        originalFilename: 'img.png',
        fileSize: 2000,
        mimeType: 'image/png',
        fileExtension: '.png',
        storageKey: 'test/file2.png',
        metadata: {},
        uploadedBy: 'user-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      attachments.push({
        id: 'att-3',
        entityType: 'change',
        entityId: 'chg-1',
        filename: 'file3.txt',
        originalFilename: 'notes.txt',
        fileSize: 500,
        mimeType: 'text/plain',
        fileExtension: '.txt',
        storageKey: 'test/file3.txt',
        metadata: {},
        uploadedBy: 'user-2',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/attachments/usage',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.totalSize).toBe(3500);
      expect(body.totalCount).toBe(3);
      expect(body.byEntityType.issue.count).toBe(2);
      expect(body.byEntityType.issue.size).toBe(3000);
      expect(body.byEntityType.change.count).toBe(1);
      expect(body.byEntityType.change.size).toBe(500);
      expect(body.limit).toBe(10 * 1024 * 1024 * 1024);
    });

    it('should return empty stats when no attachments exist', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/attachments/usage',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.totalSize).toBe(0);
      expect(body.totalCount).toBe(0);
    });
  });
});
