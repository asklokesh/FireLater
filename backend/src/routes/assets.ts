import { Router, Request, Response, NextFunction } from 'express';
import { assetService } from '../services/asset.js';
import { authMiddleware, requirePermission } from '../middleware/auth.js';
import { validateTenant } from '../middleware/tenant.js';
import { logger } from '../utils/logger.js';

const router = Router();

// ============================================
// ASSET ROUTES
// ============================================

/**
 * GET /api/assets
 * List assets with optional filters and pagination
 * Uses batch loading for relationships to avoid N+1 queries
 */
router.get(
  '/',
  authMiddleware,
  validateTenant,
  requirePermission('assets', 'read'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantSlug = req.tenantSlug!;
      const {
        assetType,
        category,
        status,
        search,
        ownerId,
        assignedToId,
        department,
        page,
        limit,
        includeRelationships,
      } = req.query;

      const filters = {
        assetType: assetType as string | undefined,
        category: category as string | undefined,
        status: status as string | undefined,
        search: search as string | undefined,
        ownerId: ownerId as string | undefined,
        assignedToId: assignedToId as string | undefined,
        department: department as string | undefined,
        page: page ? parseInt(page as string) : 1,
        limit: limit ? parseInt(limit as string) : 50,
      };

      const result = await assetService.listAssets(tenantSlug, filters);

      // Batch load relationships if requested to avoid N+1 queries
      if (includeRelationships === 'true' && result.assets.length > 0) {
        const assetIds = result.assets.map((a: any) => a.id);
        const relationshipsMap = await assetService.batchGetAssetRelationships(
          tenantSlug,
          assetIds
        );

        // Attach relationships to each asset
        const assetsWithRelationships = result.assets.map((asset: any) => ({
          ...asset,
          relationships: relationshipsMap.get(asset.id) || { parents: [], children: [] },
        }));

        return res.json({
          assets: assetsWithRelationships,
          total: result.total,
          page: filters.page,
          perPage: filters.limit,
        });
      }

      res.json({
        assets: result.assets,
        total: result.total,
        page: filters.page,
        perPage: filters.limit,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to list assets');
      next(error);
    }
  }
);

/**
 * GET /api/assets/:id
 * Get single asset with relationships
 */
router.get(
  '/:id',
  authMiddleware,
  validateTenant,
  requirePermission('assets', 'read'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantSlug = req.tenantSlug!;
      const { id } = req.params;

      const asset = await assetService.getAsset(tenantSlug, id);

      if (!asset) {
        return res.status(404).json({ error: 'Asset not found' });
      }

      // Load relationships for single asset
      const relationships = await assetService.getAssetRelationships(tenantSlug, id);

      res.json({
        ...asset,
        relationships,
      });
    } catch (error) {
      logger.error({ error, assetId: req.params.id }, 'Failed to get asset');
      next(error);
    }
  }
);

/**
 * POST /api/assets
 * Create new asset
 */
router.post(
  '/',
  authMiddleware,
  validateTenant,
  requirePermission('assets', 'create'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantSlug = req.tenantSlug!;
      const userId = req.userId!;

      const asset = await assetService.createAsset(tenantSlug, req.body, userId);

      logger.info({ tenantSlug, assetId: asset.id }, 'Asset created via API');

      res.status(201).json(asset);
    } catch (error) {
      logger.error({ error }, 'Failed to create asset');
      next(error);
    }
  }
);

/**
 * PATCH /api/assets/:id
 * Update asset
 */
router.patch(
  '/:id',
  authMiddleware,
  validateTenant,
  requirePermission('assets', 'update'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantSlug = req.tenantSlug!;
      const { id } = req.params;

      const asset = await assetService.updateAsset(tenantSlug, id, req.body);

      if (!asset) {
        return res.status(404).json({ error: 'Asset not found' });
      }

      res.json(asset);
    } catch (error) {
      logger.error({ error, assetId: req.params.id }, 'Failed to update asset');
      next(error);
    }
  }
);

/**
 * DELETE /api/assets/:id
 * Delete asset
 */
router.delete(
  '/:id',
  authMiddleware,
  validateTenant,
  requirePermission('assets', 'delete'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantSlug = req.tenantSlug!;
      const { id } = req.params;

      const deleted = await assetService.deleteAsset(tenantSlug, id);

      if (!deleted) {
        return res.status(404).json({ error: 'Asset not found' });
      }

      res.status(204).send();
    } catch (error) {
      logger.error({ error, assetId: req.params.id }, 'Failed to delete asset');
      next(error);
    }
  }
);

/**
 * GET /api/assets/stats
 * Get asset statistics
 */
router.get(
  '/stats/summary',
  authMiddleware,
  validateTenant,
  requirePermission('assets', 'read'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantSlug = req.tenantSlug!;

      const stats = await assetService.getAssetStats(tenantSlug);

      res.json(stats);
    } catch (error) {
      logger.error({ error }, 'Failed to get asset stats');
      next(error);
    }
  }
);

// ============================================
// ASSET RELATIONSHIP ROUTES
// ============================================

/**
 * POST /api/assets/:id/relationships
 * Create asset relationship
 */
router.post(
  '/:id/relationships',
  authMiddleware,
  validateTenant,
  requirePermission('asset_relationships', 'create'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantSlug = req.tenantSlug!;
      const parentAssetId = req.params.id;
      const { childAssetId, relationshipType } = req.body;

      if (!childAssetId || !relationshipType) {
        return res.status(400).json({
          error: 'Missing required fields: childAssetId, relationshipType',
        });
      }

      const relationship = await assetService.createAssetRelationship(
        tenantSlug,
        parentAssetId,
        childAssetId,
        relationshipType
      );

      res.status(201).json(relationship);
    } catch (error) {
      logger.error({ error }, 'Failed to create asset relationship');
      next(error);
    }
  }
);

/**
 * DELETE /api/assets/:id/relationships/:relationshipId
 * Delete asset relationship
 */
router.delete(
  '/:id/relationships/:relationshipId',
  authMiddleware,
  validateTenant,
  requirePermission('asset_relationships', 'delete'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantSlug = req.tenantSlug!;
      const { relationshipId } = req.params;

      const deleted = await assetService.deleteAssetRelationship(tenantSlug, relationshipId);

      if (!deleted) {
        return res.status(404).json({ error: 'Relationship not found' });
      }

      res.status(204).send();
    } catch (error) {
      logger.error({ error }, 'Failed to delete asset relationship');
      next(error);
    }
  }
);

// ============================================
// ASSET LINK ROUTES (Issues/Changes)
// ============================================

/**
 * POST /api/assets/:id/issues/:issueId
 * Link asset to issue
 */
router.post(
  '/:id/issues/:issueId',
  authMiddleware,
  validateTenant,
  requirePermission('assets', 'link'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantSlug = req.tenantSlug!;
      const { id: assetId, issueId } = req.params;

      await assetService.linkAssetToIssue(tenantSlug, assetId, issueId);

      res.status(204).send();
    } catch (error) {
      logger.error({ error }, 'Failed to link asset to issue');
      next(error);
    }
  }
);

/**
 * DELETE /api/assets/:id/issues/:issueId
 * Unlink asset from issue
 */
router.delete(
  '/:id/issues/:issueId',
  authMiddleware,
  validateTenant,
  requirePermission('assets', 'link'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantSlug = req.tenantSlug!;
      const { id: assetId, issueId } = req.params;

      await assetService.unlinkAssetFromIssue(tenantSlug, assetId, issueId);

      res.status(204).send();
    } catch (error) {
      logger.error({ error }, 'Failed to unlink asset from issue');
      next(error);
    }
  }
);

/**
 * GET /api/assets/:id/issues
 * Get issues linked to asset
 */
router.get(
  '/:id/issues',
  authMiddleware,
  validateTenant,
  requirePermission('assets', 'read'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantSlug = req.tenantSlug!;
      const { id } = req.params;

      const issues = await assetService.getAssetIssues(tenantSlug, id);

      res.json({ issues });
    } catch (error) {
      logger.error({ error }, 'Failed to get asset issues');
      next(error);
    }
  }
);

/**
 * GET /api/assets/:id/changes
 * Get changes linked to asset
 */
router.get(
  '/:id/changes',
  authMiddleware,
  validateTenant,
  requirePermission('assets', 'read'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantSlug = req.tenantSlug!;
      const { id } = req.params;

      const changes = await assetService.getAssetChanges(tenantSlug, id);

      res.json({ changes });
    } catch (error) {
      logger.error({ error }, 'Failed to get asset changes');
      next(error);
    }
  }
);

export default router;
