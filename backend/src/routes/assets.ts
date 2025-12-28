import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { assetService } from '../services/asset.js';

// ============================================
// SCHEMAS
// ============================================

const assetTypeEnum = z.enum(['hardware', 'software', 'network', 'cloud', 'virtual', 'other']);
const assetStatusEnum = z.enum(['active', 'inactive', 'maintenance', 'retired', 'disposed', 'ordered', 'in_storage']);
const assetCategoryEnum = z.enum([
  'server', 'workstation', 'laptop', 'mobile', 'printer', 'network_device', 'storage',
  'software_license', 'saas_subscription', 'virtual_machine', 'container', 'database', 'application', 'other',
]);

const createAssetSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  assetType: assetTypeEnum,
  category: assetCategoryEnum,
  status: assetStatusEnum.optional(),
  location: z.string().max(200).optional(),
  department: z.string().max(100).optional(),
  ownerId: z.string().uuid().optional(),
  assignedToId: z.string().uuid().optional(),
  manufacturer: z.string().max(100).optional(),
  model: z.string().max(100).optional(),
  serialNumber: z.string().max(100).optional(),
  version: z.string().max(50).optional(),
  licenseType: z.string().max(50).optional(),
  licenseCount: z.number().int().min(0).optional(),
  licenseExpiry: z.string().optional(),
  purchaseDate: z.string().optional(),
  purchaseCost: z.number().min(0).optional(),
  warrantyExpiry: z.string().optional(),
  vendor: z.string().max(100).optional(),
  poNumber: z.string().max(50).optional(),
  ipAddress: z.string().max(50).optional(),
  macAddress: z.string().max(50).optional(),
  hostname: z.string().max(100).optional(),
  attributes: z.record(z.unknown()).optional(),
});

const updateAssetSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional().nullable(),
  status: assetStatusEnum.optional(),
  location: z.string().max(200).optional().nullable(),
  department: z.string().max(100).optional().nullable(),
  ownerId: z.string().uuid().optional().nullable(),
  assignedToId: z.string().uuid().optional().nullable(),
  manufacturer: z.string().max(100).optional().nullable(),
  model: z.string().max(100).optional().nullable(),
  serialNumber: z.string().max(100).optional().nullable(),
  version: z.string().max(50).optional().nullable(),
  licenseType: z.string().max(50).optional().nullable(),
  licenseCount: z.number().int().min(0).optional().nullable(),
  licenseExpiry: z.string().optional().nullable(),
  purchaseDate: z.string().optional().nullable(),
  purchaseCost: z.number().min(0).optional().nullable(),
  warrantyExpiry: z.string().optional().nullable(),
  vendor: z.string().max(100).optional().nullable(),
  poNumber: z.string().max(50).optional().nullable(),
  ipAddress: z.string().max(50).optional().nullable(),
  macAddress: z.string().max(50).optional().nullable(),
  hostname: z.string().max(100).optional().nullable(),
  attributes: z.record(z.unknown()).optional(),
});

// ============================================
// ROUTES
// ============================================

export default async function assetRoutes(fastify: FastifyInstance) {
  // Require authentication for all routes
  fastify.addHook('onRequest', async (request, reply) => {
    const tenant = (request as any).tenant;
    if (!tenant) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
  });

  // ----------------------------------------
  // LIST ASSETS
  // ----------------------------------------
  fastify.get('/', async (request, _reply) => {
    const tenant = (request as any).tenant;
    const query = request.query as any;

    const result = await assetService.listAssets(tenant.slug, {
      assetType: query.assetType,
      category: query.category,
      status: query.status,
      search: query.search,
      ownerId: query.ownerId,
      assignedToId: query.assignedToId,
      department: query.department,
      page: query.page || 1,
      limit: query.limit || 50,
    });

    return {
      data: result.assets,
      meta: {
        total: result.total,
        page: query.page || 1,
        limit: query.limit || 50,
      },
    };
  });

  // ----------------------------------------
  // GET ASSET BY ID
  // ----------------------------------------
  fastify.get('/:id', async (request, reply) => {
    const tenant = (request as any).tenant;
    const { id } = request.params as { id: string };

    const asset = await assetService.getAsset(tenant.slug, id);

    if (!asset) {
      return reply.code(404).send({ error: 'Asset not found' });
    }

    return { data: asset };
  });

  // ----------------------------------------
  // CREATE ASSET
  // ----------------------------------------
  fastify.post('/', async (request, reply) => {
    const tenant = (request as any).tenant;
    const user = (request as any).user;
    const body = createAssetSchema.parse(request.body);

    try {
      const asset = await assetService.createAsset(tenant.slug, body, user?.id);
      return reply.code(201).send({ data: asset });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create asset';
      return reply.code(400).send({ error: message });
    }
  });

  // ----------------------------------------
  // UPDATE ASSET
  // ----------------------------------------
  fastify.patch('/:id', async (request, reply) => {
    const tenant = (request as any).tenant;
    const { id } = request.params as { id: string };
    const body = updateAssetSchema.parse(request.body);

    try {
      // Convert null values to undefined for the service
      const updateData = Object.fromEntries(
        Object.entries(body).map(([key, value]) => [key, value === null ? undefined : value])
      );
      const asset = await assetService.updateAsset(tenant.slug, id, updateData);

      if (!asset) {
        return reply.code(404).send({ error: 'Asset not found' });
      }

      return { data: asset };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update asset';
      return reply.code(400).send({ error: message });
    }
  });

  // ----------------------------------------
  // DELETE ASSET
  // ----------------------------------------
  fastify.delete('/:id', async (request, reply) => {
    const tenant = (request as any).tenant;
    const { id } = request.params as { id: string };

    try {
      const deleted = await assetService.deleteAsset(tenant.slug, id);

      if (!deleted) {
        return reply.code(404).send({ error: 'Asset not found' });
      }

      return reply.code(204).send();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete asset';
      return reply.code(400).send({ error: message });
    }
  });

  // ----------------------------------------
  // GET ASSET RELATIONSHIPS
  // ----------------------------------------
  fastify.get('/:id/relationships', async (request, _reply) => {
    const tenant = (request as any).tenant;
    const { id } = request.params as { id: string };

    const relationships = await assetService.getAssetRelationships(tenant.slug, id);

    return { data: relationships };
  });

  // ----------------------------------------
  // CREATE ASSET RELATIONSHIP
  // ----------------------------------------
  fastify.post('/:id/relationships', async (request, reply) => {
    const tenant = (request as any).tenant;
    const { id } = request.params as { id: string };
    const { childAssetId, relationshipType } = request.body as { childAssetId: string; relationshipType: string };

    try {
      const relationship = await assetService.createAssetRelationship(
        tenant.slug,
        id,
        childAssetId,
        relationshipType
      );
      return reply.code(201).send({ data: relationship });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create relationship';
      return reply.code(400).send({ error: message });
    }
  });

  // ----------------------------------------
  // DELETE ASSET RELATIONSHIP
  // ----------------------------------------
  fastify.delete('/relationships/:relationshipId', async (request, reply) => {
    const tenant = (request as any).tenant;
    const { relationshipId } = request.params as { relationshipId: string };

    try {
      const deleted = await assetService.deleteAssetRelationship(tenant.slug, relationshipId);

      if (!deleted) {
        return reply.code(404).send({ error: 'Relationship not found' });
      }

      return reply.code(204).send();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete relationship';
      return reply.code(400).send({ error: message });
    }
  });

  // ----------------------------------------
  // GET ASSET LINKED ISSUES
  // ----------------------------------------
  fastify.get('/:id/issues', async (request, _reply) => {
    const tenant = (request as any).tenant;
    const { id } = request.params as { id: string };

    const issues = await assetService.getAssetIssues(tenant.slug, id);

    return { data: issues };
  });

  // ----------------------------------------
  // LINK ASSET TO ISSUE
  // ----------------------------------------
  fastify.post('/:id/issues/:issueId', async (request, reply) => {
    const tenant = (request as any).tenant;
    const { id, issueId } = request.params as { id: string; issueId: string };

    try {
      await assetService.linkAssetToIssue(tenant.slug, id, issueId);
      return reply.code(201).send({ success: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to link asset to issue';
      return reply.code(400).send({ error: message });
    }
  });

  // ----------------------------------------
  // UNLINK ASSET FROM ISSUE
  // ----------------------------------------
  fastify.delete('/:id/issues/:issueId', async (request, reply) => {
    const tenant = (request as any).tenant;
    const { id, issueId } = request.params as { id: string; issueId: string };

    try {
      await assetService.unlinkAssetFromIssue(tenant.slug, id, issueId);
      return reply.code(204).send();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to unlink asset from issue';
      return reply.code(400).send({ error: message });
    }
  });

  // ----------------------------------------
  // GET ASSET LINKED CHANGES
  // ----------------------------------------
  fastify.get('/:id/changes', async (request, _reply) => {
    const tenant = (request as any).tenant;
    const { id } = request.params as { id: string };

    const changes = await assetService.getAssetChanges(tenant.slug, id);

    return { data: changes };
  });

  // ----------------------------------------
  // GET ASSET STATISTICS
  // ----------------------------------------
  fastify.get('/stats/overview', async (request, _reply) => {
    const tenant = (request as any).tenant;

    const stats = await assetService.getAssetStats(tenant.slug);

    return { data: stats };
  });
}
