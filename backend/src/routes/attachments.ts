import { FastifyPluginAsync } from 'fastify';
import multipart from '@fastify/multipart';
import { requirePermission } from '../middleware/auth.js';
import { storageService, EntityType } from '../services/storage.js';

// ============================================
// ATTACHMENTS ROUTES
// ============================================

const attachmentsRoutes: FastifyPluginAsync = async (app) => {
  // Register multipart for file uploads in this route only
  await app.register(multipart, {
    limits: {
      fileSize: 50 * 1024 * 1024, // 50 MB
    },
  });
  // Get presigned URL for direct upload
  app.post<{
    Body: {
      entityType: EntityType;
      entityId: string;
      filename: string;
      mimeType: string;
      fileSize: number;
    };
  }>(
    '/upload-url',
    {
      preHandler: [requirePermission('issues:write')],
    },
    async (request, _reply) => {
      const { tenantSlug } = request.user;
      const { entityType, entityId, filename, mimeType, fileSize } = request.body;

      const result = await storageService.generateUploadUrl(
        tenantSlug,
        entityType,
        entityId,
        filename,
        mimeType,
        fileSize
      );

      return result;
    }
  );

  // Confirm upload (after direct upload to S3)
  app.post<{
    Body: {
      entityType: EntityType;
      entityId: string;
      storageKey: string;
      filename: string;
      mimeType: string;
      fileSize: number;
      checksum?: string;
      metadata?: Record<string, unknown>;
    };
  }>(
    '/confirm-upload',
    {
      preHandler: [requirePermission('issues:write')],
    },
    async (request, _reply) => {
      const { tenantSlug, userId } = request.user;
      const { entityType, entityId, storageKey, filename, mimeType, fileSize, checksum, metadata } =
        request.body;

      // Create attachment record (file already uploaded via presigned URL)
      const schema = `tenant_${tenantSlug}`;
      const { pool } = await import('../config/database.js');

      const result = await pool.query(
        `INSERT INTO ${schema}.attachments (
          entity_type, entity_id, filename, original_filename,
          file_size, mime_type, file_extension, storage_key,
          checksum, metadata, uploaded_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *`,
        [
          entityType,
          entityId,
          storageKey.split('/').pop(), // stored filename
          filename,
          fileSize,
          mimeType,
          filename.includes('.') ? filename.substring(filename.lastIndexOf('.')) : '',
          storageKey,
          checksum || null,
          JSON.stringify(metadata || {}),
          userId,
        ]
      );

      return result.rows[0];
    }
  );

  // Upload file directly (for smaller files)
  app.post<{
    Params: { entityType: EntityType; entityId: string };
  }>(
    '/:entityType/:entityId',
    {
      preHandler: [requirePermission('issues:write')],
    },
    async (request, reply) => {
      const { tenantSlug, userId } = request.user;
      const { entityType, entityId } = request.params;

      // Handle multipart upload
      const data = await request.file();

      if (!data) {
        return reply.status(400).send({ error: 'No file uploaded' });
      }

      const buffer = await data.toBuffer();

      const result = await storageService.upload({
        tenantSlug,
        entityType,
        entityId,
        filename: data.filename,
        content: buffer,
        mimeType: data.mimetype,
        uploadedBy: userId,
      });

      return result;
    }
  );

  // List attachments for an entity
  app.get<{
    Params: { entityType: EntityType; entityId: string };
  }>(
    '/:entityType/:entityId',
    {
      preHandler: [requirePermission('issues:read')],
    },
    async (request, _reply) => {
      const { tenantSlug } = request.user;
      const { entityType, entityId } = request.params;

      const attachments = await storageService.listByEntity(tenantSlug, entityType, entityId);

      return { attachments };
    }
  );

  // Get single attachment details
  app.get<{
    Params: { id: string };
  }>(
    '/file/:id',
    {
      preHandler: [requirePermission('issues:read')],
    },
    async (request, _reply) => {
      const { tenantSlug } = request.user;
      const { id } = request.params;

      const attachment = await storageService.getById(tenantSlug, id);

      if (!attachment) {
        throw { statusCode: 404, message: 'Attachment not found' };
      }

      return attachment;
    }
  );

  // Get download URL
  app.get<{
    Params: { id: string };
    Querystring: { expires?: string };
  }>(
    '/file/:id/download-url',
    {
      preHandler: [requirePermission('issues:read')],
    },
    async (request, _reply) => {
      const { tenantSlug } = request.user;
      const { id } = request.params;
      const expiresIn = parseInt(request.query.expires || '3600', 10);

      const url = await storageService.getDownloadUrl(tenantSlug, id, expiresIn);

      return { url, expiresIn };
    }
  );

  // Get view URL (inline display)
  app.get<{
    Params: { id: string };
    Querystring: { expires?: string };
  }>(
    '/file/:id/view-url',
    {
      preHandler: [requirePermission('issues:read')],
    },
    async (request, _reply) => {
      const { tenantSlug } = request.user;
      const { id } = request.params;
      const expiresIn = parseInt(request.query.expires || '3600', 10);

      const url = await storageService.getViewUrl(tenantSlug, id, expiresIn);

      return { url, expiresIn };
    }
  );

  // Download file directly
  app.get<{
    Params: { id: string };
  }>(
    '/file/:id/download',
    {
      preHandler: [requirePermission('issues:read')],
    },
    async (request, reply) => {
      const { tenantSlug } = request.user;
      const { id } = request.params;

      try {
        const { content, filename, mimeType } = await storageService.download(tenantSlug, id);

        return reply
          .header('Content-Type', mimeType)
          .header('Content-Disposition', `attachment; filename="${filename}"`)
          .send(content);
      } catch {
        // Fall back to redirect to presigned URL
        const url = await storageService.getDownloadUrl(tenantSlug, id);
        return reply.redirect(url);
      }
    }
  );

  // Delete attachment
  app.delete<{
    Params: { id: string };
  }>(
    '/file/:id',
    {
      preHandler: [requirePermission('issues:write')],
    },
    async (request, _reply) => {
      const { tenantSlug, userId } = request.user;
      const { id } = request.params;

      await storageService.delete(tenantSlug, id, userId);

      return { success: true };
    }
  );

  // Get storage usage
  app.get(
    '/usage',
    {
      preHandler: [requirePermission('admin:read')],
    },
    async (request, _reply) => {
      const { tenantSlug } = request.user;

      const usage = await storageService.getStorageUsage(tenantSlug);

      return usage;
    }
  );
};

export default attachmentsRoutes;
