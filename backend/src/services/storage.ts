import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createHash } from 'crypto';
import { lookup } from 'mime-types';
import { nanoid } from 'nanoid';
import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { config } from '../config/index.js';
import { pool } from '../config/database.js';
import { tenantService } from './tenant.js';
import { logger } from '../utils/logger.js';
import { NotFoundError, BadRequestError } from '../utils/errors.js';

// Local storage directory for development (when S3 is not configured)
const LOCAL_STORAGE_DIR = join(process.cwd(), 'uploads');

// ============================================
// S3 CLIENT CONFIGURATION
// ============================================

const isConfigured = !!(config.s3.bucket && config.s3.accessKey && config.s3.secretKey);

const s3Client = isConfigured
  ? new S3Client({
      endpoint: config.s3.endpoint,
      region: config.s3.region,
      credentials: {
        accessKeyId: config.s3.accessKey!,
        secretAccessKey: config.s3.secretKey!,
      },
      forcePathStyle: config.s3.forcePathStyle,
    })
  : null;

// ============================================
// TYPES
// ============================================

export type EntityType = 'issue' | 'change' | 'request' | 'application' | 'comment';

export interface UploadOptions {
  tenantSlug: string;
  entityType: EntityType;
  entityId: string;
  filename: string;
  content: Buffer | Uint8Array;
  mimeType?: string;
  uploadedBy: string;
  metadata?: Record<string, unknown>;
}

export interface UploadResult {
  id: string;
  filename: string;
  originalFilename: string;
  fileSize: number;
  mimeType: string;
  storageKey: string;
  checksum: string;
}

export interface AttachmentRecord {
  id: string;
  entity_type: string;
  entity_id: string;
  filename: string;
  original_filename: string;
  file_size: number;
  mime_type: string;
  file_extension: string;
  storage_key: string;
  uploaded_by: string;
  uploaded_at: Date;
  metadata: Record<string, unknown>;
}

// ============================================
// ALLOWED FILE TYPES
// ============================================

const ALLOWED_MIME_TYPES = new Set([
  // Documents
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'text/markdown',
  'application/json',
  'application/xml',
  'text/xml',

  // Images
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'image/bmp',

  // Archives
  'application/zip',
  'application/x-tar',
  'application/gzip',
  'application/x-7z-compressed',

  // Code/logs
  'text/html',
  'text/css',
  'text/javascript',
  'application/javascript',
  'text/x-python',
  'text/x-java',
  'application/x-yaml',
]);

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

// ============================================
// STORAGE SERVICE
// ============================================

class StorageService {
  private bucket: string;

  constructor() {
    this.bucket = config.s3.bucket || 'firelater-attachments';
  }

  isConfigured(): boolean {
    return isConfigured;
  }

  async upload(options: UploadOptions): Promise<UploadResult> {
    const {
      tenantSlug,
      entityType,
      entityId,
      filename,
      content,
      mimeType,
      uploadedBy,
      metadata = {},
    } = options;

    // Validate file
    const detectedMimeType = mimeType || lookup(filename) || 'application/octet-stream';

    if (!ALLOWED_MIME_TYPES.has(detectedMimeType)) {
      throw new BadRequestError(`File type not allowed: ${detectedMimeType}`);
    }

    const fileSize = content.length;
    if (fileSize > MAX_FILE_SIZE) {
      throw new BadRequestError(`File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB`);
    }

    // Generate storage key
    const fileExtension = this.getExtension(filename);
    const uniqueId = nanoid(12);
    const storedFilename = `${uniqueId}${fileExtension}`;
    const storageKey = `${tenantSlug}/${entityType}/${entityId}/${storedFilename}`;

    // Calculate checksum
    const checksum = createHash('sha256').update(content).digest('hex');

    // Upload to S3 or local storage
    if (s3Client) {
      await s3Client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: storageKey,
          Body: content,
          ContentType: detectedMimeType,
          Metadata: {
            originalFilename: filename,
            uploadedBy,
            checksum,
          },
        })
      );
    } else {
      // Fall back to local storage for development
      const localPath = join(LOCAL_STORAGE_DIR, storageKey);
      await fs.mkdir(dirname(localPath), { recursive: true });
      await fs.writeFile(localPath, content);
      logger.info({ storageKey, fileSize, localPath }, 'File uploaded to local storage');
    }

    // Save to database
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(
      `INSERT INTO ${schema}.attachments (
        entity_type, entity_id, filename, original_filename,
        file_size, mime_type, file_extension, storage_key,
        storage_bucket, checksum, metadata, uploaded_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *`,
      [
        entityType,
        entityId,
        storedFilename,
        filename,
        fileSize,
        detectedMimeType,
        fileExtension,
        storageKey,
        this.bucket,
        checksum,
        JSON.stringify(metadata),
        uploadedBy,
      ]
    );

    logger.info(
      { attachmentId: result.rows[0].id, storageKey, fileSize },
      'File uploaded successfully'
    );

    return {
      id: result.rows[0].id,
      filename: storedFilename,
      originalFilename: filename,
      fileSize,
      mimeType: detectedMimeType,
      storageKey,
      checksum,
    };
  }

  async getDownloadUrl(
    tenantSlug: string,
    attachmentId: string,
    expiresIn: number = 3600
  ): Promise<string> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(
      `SELECT * FROM ${schema}.attachments WHERE id = $1 AND is_deleted = false`,
      [attachmentId]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Attachment', attachmentId);
    }

    const attachment = result.rows[0];

    if (!s3Client) {
      // Return URL to local file endpoint (handled by attachments route)
      const baseUrl = process.env.API_URL || 'http://localhost:3001';
      return `${baseUrl}/api/attachments/${attachmentId}/download?tenant=${tenantSlug}`;
    }

    const command = new GetObjectCommand({
      Bucket: attachment.storage_bucket || this.bucket,
      Key: attachment.storage_key,
      ResponseContentDisposition: `attachment; filename="${attachment.original_filename}"`,
    });

    return getSignedUrl(s3Client, command, { expiresIn });
  }

  async getViewUrl(
    tenantSlug: string,
    attachmentId: string,
    expiresIn: number = 3600
  ): Promise<string> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(
      `SELECT * FROM ${schema}.attachments WHERE id = $1 AND is_deleted = false`,
      [attachmentId]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Attachment', attachmentId);
    }

    const attachment = result.rows[0];

    if (!s3Client) {
      // Return URL to local file endpoint (handled by attachments route)
      const baseUrl = process.env.API_URL || 'http://localhost:3001';
      return `${baseUrl}/api/attachments/${attachmentId}/view?tenant=${tenantSlug}`;
    }

    const command = new GetObjectCommand({
      Bucket: attachment.storage_bucket || this.bucket,
      Key: attachment.storage_key,
      ResponseContentType: attachment.mime_type,
    });

    return getSignedUrl(s3Client, command, { expiresIn });
  }

  async download(tenantSlug: string, attachmentId: string): Promise<{
    content: Buffer;
    filename: string;
    mimeType: string;
  }> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(
      `SELECT * FROM ${schema}.attachments WHERE id = $1 AND is_deleted = false`,
      [attachmentId]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Attachment', attachmentId);
    }

    const attachment = result.rows[0];

    let content: Buffer;

    if (s3Client) {
      const response = await s3Client.send(
        new GetObjectCommand({
          Bucket: attachment.storage_bucket || this.bucket,
          Key: attachment.storage_key,
        })
      );
      content = Buffer.from(await response.Body!.transformToByteArray());
    } else {
      // Read from local storage
      const localPath = join(LOCAL_STORAGE_DIR, attachment.storage_key);
      try {
        content = await fs.readFile(localPath);
      } catch (error) {
        logger.error({ error, localPath, attachmentId }, 'Failed to read file from local storage');
        throw new NotFoundError('Attachment file', attachmentId);
      }
    }

    return {
      content,
      filename: attachment.original_filename,
      mimeType: attachment.mime_type,
    };
  }

  async delete(tenantSlug: string, attachmentId: string, deletedBy: string): Promise<void> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(
      `SELECT * FROM ${schema}.attachments WHERE id = $1 AND is_deleted = false`,
      [attachmentId]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Attachment', attachmentId);
    }

    const attachment = result.rows[0];

    // Soft delete in database
    await pool.query(
      `UPDATE ${schema}.attachments
       SET is_deleted = true, deleted_at = NOW(), deleted_by = $2
       WHERE id = $1`,
      [attachmentId, deletedBy]
    );

    // Optionally delete from S3 (or keep for a retention period)
    // For now, we'll keep the file but mark it as deleted
    logger.info(
      { attachmentId, storageKey: attachment.storage_key },
      'Attachment marked as deleted'
    );
  }

  async hardDelete(tenantSlug: string, attachmentId: string): Promise<void> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(
      `SELECT * FROM ${schema}.attachments WHERE id = $1`,
      [attachmentId]
    );

    if (result.rows.length === 0) {
      return;
    }

    const attachment = result.rows[0];

    // Delete from storage
    if (s3Client) {
      try {
        await s3Client.send(
          new DeleteObjectCommand({
            Bucket: attachment.storage_bucket || this.bucket,
            Key: attachment.storage_key,
          })
        );
      } catch (error) {
        logger.warn({ err: error, storageKey: attachment.storage_key }, 'Failed to delete from S3');
      }
    } else {
      // Delete from local storage
      const localPath = join(LOCAL_STORAGE_DIR, attachment.storage_key);
      try {
        await fs.unlink(localPath);
      } catch (error) {
        logger.warn({ err: error, localPath }, 'Failed to delete from local storage');
      }
    }

    // Delete from database
    await pool.query(`DELETE FROM ${schema}.attachments WHERE id = $1`, [attachmentId]);

    logger.info({ attachmentId, storageKey: attachment.storage_key }, 'Attachment permanently deleted');
  }

  async listByEntity(
    tenantSlug: string,
    entityType: EntityType,
    entityId: string
  ): Promise<AttachmentRecord[]> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(
      `SELECT a.*, u.name as uploaded_by_name
       FROM ${schema}.attachments a
       LEFT JOIN ${schema}.users u ON a.uploaded_by = u.id
       WHERE a.entity_type = $1 AND a.entity_id = $2 AND a.is_deleted = false
       ORDER BY a.uploaded_at DESC`,
      [entityType, entityId]
    );

    return result.rows;
  }

  async getById(tenantSlug: string, attachmentId: string): Promise<AttachmentRecord | null> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(
      `SELECT a.*, u.name as uploaded_by_name
       FROM ${schema}.attachments a
       LEFT JOIN ${schema}.users u ON a.uploaded_by = u.id
       WHERE a.id = $1 AND a.is_deleted = false`,
      [attachmentId]
    );

    return result.rows[0] || null;
  }

  async getStorageUsage(tenantSlug: string): Promise<{
    totalFiles: number;
    totalSize: number;
    byEntityType: Record<string, { files: number; size: number }>;
  }> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(
      `SELECT entity_type, total_files, total_size
       FROM ${schema}.storage_usage`
    );

    let totalFiles = 0;
    let totalSize = 0;
    const byEntityType: Record<string, { files: number; size: number }> = {};

    for (const row of result.rows) {
      totalFiles += parseInt(row.total_files, 10);
      totalSize += parseInt(row.total_size, 10);
      byEntityType[row.entity_type] = {
        files: parseInt(row.total_files, 10),
        size: parseInt(row.total_size, 10),
      };
    }

    return { totalFiles, totalSize, byEntityType };
  }

  private getExtension(filename: string): string {
    const lastDot = filename.lastIndexOf('.');
    if (lastDot === -1) return '';
    return filename.substring(lastDot).toLowerCase();
  }

  async generateUploadUrl(
    tenantSlug: string,
    entityType: EntityType,
    entityId: string,
    filename: string,
    mimeType: string,
    fileSize: number,
    expiresIn: number = 3600
  ): Promise<{
    uploadUrl: string;
    storageKey: string;
    expiresAt: Date;
  }> {
    // Validate
    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      throw new BadRequestError(`File type not allowed: ${mimeType}`);
    }
    if (fileSize > MAX_FILE_SIZE) {
      throw new BadRequestError(`File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB`);
    }

    const fileExtension = this.getExtension(filename);
    const uniqueId = nanoid(12);
    const storedFilename = `${uniqueId}${fileExtension}`;
    const storageKey = `${tenantSlug}/${entityType}/${entityId}/${storedFilename}`;

    if (!s3Client) {
      // For local storage, use the regular upload endpoint
      const baseUrl = process.env.API_URL || 'http://localhost:3001';
      return {
        uploadUrl: `${baseUrl}/api/attachments/upload?tenant=${tenantSlug}&entityType=${entityType}&entityId=${entityId}`,
        storageKey,
        expiresAt: new Date(Date.now() + expiresIn * 1000),
      };
    }

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: storageKey,
      ContentType: mimeType,
      ContentLength: fileSize,
    });

    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn });

    return {
      uploadUrl,
      storageKey,
      expiresAt: new Date(Date.now() + expiresIn * 1000),
    };
  }
}

export const storageService = new StorageService();
