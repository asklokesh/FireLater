import { pool } from '../config/database.js';
import { tenantService } from './tenant.js';
import { NotFoundError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import type { PaginationParams } from '../types/index.js';
import { getOffset } from '../utils/pagination.js';
import { cacheService } from '../utils/cache.js';

// ============================================
// CATEGORIES
// ============================================

// Cache TTL for catalog categories (10 minutes - admin-configured, moderate change frequency)
const CATALOG_CACHE_TTL = 600;

interface CreateCategoryParams {
  name: string;
  description?: string;
  icon?: string;
  parentId?: string;
  sortOrder?: number;
  metadata?: Record<string, unknown>;
}

interface UpdateCategoryParams {
  name?: string;
  description?: string;
  icon?: string;
  parentId?: string | null;
  sortOrder?: number;
  isActive?: boolean;
  metadata?: Record<string, unknown>;
}

interface Category {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  parent_id: string | null;
  sort_order: number;
  is_active: boolean;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

export class CatalogCategoryService {
  async list(tenantSlug: string, includeInactive: boolean = false): Promise<Category[]> {
    const cacheKey = `${tenantSlug}:catalog:categories:${includeInactive}`;

    return cacheService.getOrSet(
      cacheKey,
      async () => {
        const schema = tenantService.getSchemaName(tenantSlug);

        const whereClause = includeInactive ? '' : 'WHERE is_active = true';

        const result = await pool.query(
          `SELECT c.*,
                  (SELECT COUNT(*) FROM ${schema}.catalog_items WHERE category_id = c.id AND is_active = true) as item_count,
                  p.name as parent_name
           FROM ${schema}.catalog_categories c
           LEFT JOIN ${schema}.catalog_categories p ON c.parent_id = p.id
           ${whereClause}
           ORDER BY c.sort_order, c.name`
        );

        return result.rows;
      },
      { ttl: CATALOG_CACHE_TTL }
    );
  }

  async findById(tenantSlug: string, categoryId: string): Promise<Category | null> {
    const cacheKey = `${tenantSlug}:catalog:category:${categoryId}`;

    return cacheService.getOrSet(
      cacheKey,
      async () => {
        const schema = tenantService.getSchemaName(tenantSlug);

        const result = await pool.query(
          `SELECT c.*,
                  (SELECT COUNT(*) FROM ${schema}.catalog_items WHERE category_id = c.id) as item_count,
                  p.name as parent_name
           FROM ${schema}.catalog_categories c
           LEFT JOIN ${schema}.catalog_categories p ON c.parent_id = p.id
           WHERE c.id = $1`,
          [categoryId]
        );

        return result.rows[0] || null;
      },
      { ttl: CATALOG_CACHE_TTL }
    );
  }

  async create(tenantSlug: string, params: CreateCategoryParams, createdBy: string): Promise<Category> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(
      `INSERT INTO ${schema}.catalog_categories (name, description, icon, parent_id, sort_order, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        params.name,
        params.description || null,
        params.icon || null,
        params.parentId || null,
        params.sortOrder || 0,
        JSON.stringify(params.metadata || {}),
      ]
    );

    const category = result.rows[0];

    await pool.query(
      `INSERT INTO ${schema}.audit_logs (user_id, action, entity_type, entity_id, changes)
       VALUES ($1, 'create', 'catalog_category', $2, $3)`,
      [createdBy, category.id, JSON.stringify({ name: params.name })]
    );

    // Invalidate catalog cache
    await cacheService.invalidateTenant(tenantSlug, 'catalog');

    logger.info({ categoryId: category.id }, 'Catalog category created');
    return this.findById(tenantSlug, category.id) as Promise<Category>;
  }

  async update(tenantSlug: string, categoryId: string, params: UpdateCategoryParams, _updatedBy: string): Promise<Category> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const existing = await this.findById(tenantSlug, categoryId);
    if (!existing) {
      throw new NotFoundError('Catalog category', categoryId);
    }

    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (params.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(params.name);
    }
    if (params.description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(params.description);
    }
    if (params.icon !== undefined) {
      updates.push(`icon = $${paramIndex++}`);
      values.push(params.icon);
    }
    if (params.parentId !== undefined) {
      updates.push(`parent_id = $${paramIndex++}`);
      values.push(params.parentId);
    }
    if (params.sortOrder !== undefined) {
      updates.push(`sort_order = $${paramIndex++}`);
      values.push(params.sortOrder);
    }
    if (params.isActive !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      values.push(params.isActive);
    }
    if (params.metadata !== undefined) {
      updates.push(`metadata = $${paramIndex++}`);
      values.push(JSON.stringify(params.metadata));
    }

    if (updates.length === 0) {
      return existing;
    }

    updates.push(`updated_at = NOW()`);
    values.push(categoryId);

    await pool.query(
      `UPDATE ${schema}.catalog_categories SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
      values
    );

    // Invalidate catalog cache
    await cacheService.invalidateTenant(tenantSlug, 'catalog');

    logger.info({ categoryId }, 'Catalog category updated');
    return this.findById(tenantSlug, categoryId) as Promise<Category>;
  }

  async delete(tenantSlug: string, categoryId: string, _deletedBy: string): Promise<void> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const existing = await this.findById(tenantSlug, categoryId);
    if (!existing) {
      throw new NotFoundError('Catalog category', categoryId);
    }

    // Soft delete
    await pool.query(
      `UPDATE ${schema}.catalog_categories SET is_active = false, updated_at = NOW() WHERE id = $1`,
      [categoryId]
    );

    // Invalidate catalog cache
    await cacheService.invalidateTenant(tenantSlug, 'catalog');

    logger.info({ categoryId }, 'Catalog category deleted');
  }
}

// ============================================
// CATALOG ITEMS
// ============================================

interface FormField {
  name: string;
  label: string;
  type: string;
  required?: boolean;
  options?: Array<{ value: string; label: string }>;
  placeholder?: string;
  helpText?: string;
  defaultValue?: unknown;
  validation?: Record<string, unknown>;
  conditional?: {
    field: string;
    operator: string;
    value?: unknown;
  };
}

interface FormSchema {
  fields: FormField[];
  sections?: Array<{
    name: string;
    label: string;
    fields: string[];
  }>;
}

interface CreateItemParams {
  name: string;
  shortDescription?: string;
  description?: string;
  categoryId?: string;
  icon?: string;
  imageUrl?: string;
  formSchema: FormSchema;
  fulfillmentGroupId?: string;
  approvalRequired?: boolean;
  approvalGroupId?: string;
  expectedCompletionDays?: number;
  costCenter?: string;
  price?: number;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

interface UpdateItemParams {
  name?: string;
  shortDescription?: string;
  description?: string;
  categoryId?: string | null;
  icon?: string;
  imageUrl?: string;
  formSchema?: FormSchema;
  fulfillmentGroupId?: string | null;
  approvalRequired?: boolean;
  approvalGroupId?: string | null;
  expectedCompletionDays?: number;
  costCenter?: string;
  price?: number;
  isActive?: boolean;
  sortOrder?: number;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

interface CatalogItem {
  id: string;
  name: string;
  short_description: string | null;
  description: string | null;
  category_id: string | null;
  icon: string | null;
  image_url: string | null;
  form_schema: FormSchema;
  fulfillment_group_id: string | null;
  approval_required: boolean;
  approval_group_id: string | null;
  expected_completion_days: number;
  cost_center: string | null;
  price: number | null;
  is_active: boolean;
  sort_order: number;
  tags: string[] | null;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

export class CatalogItemService {
  async list(tenantSlug: string, params: PaginationParams, filters?: {
    categoryId?: string;
    search?: string;
    isActive?: boolean;
    tags?: string[];
  }): Promise<{ items: CatalogItem[]; total: number }> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const offset = getOffset(params);

    let whereClause = 'WHERE 1=1';
    const values: unknown[] = [];
    let paramIndex = 1;

    if (filters?.categoryId) {
      whereClause += ` AND i.category_id = $${paramIndex++}`;
      values.push(filters.categoryId);
    }
    if (filters?.isActive !== undefined) {
      whereClause += ` AND i.is_active = $${paramIndex++}`;
      values.push(filters.isActive);
    }
    if (filters?.search) {
      whereClause += ` AND (i.name ILIKE $${paramIndex} OR i.short_description ILIKE $${paramIndex} OR i.description ILIKE $${paramIndex})`;
      values.push(`%${filters.search}%`);
      paramIndex++;
    }
    if (filters?.tags && filters.tags.length > 0) {
      whereClause += ` AND i.tags && $${paramIndex++}`;
      values.push(filters.tags);
    }

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM ${schema}.catalog_items i ${whereClause}`,
      values
    );
    const total = parseInt(countResult.rows[0].count, 10);

    const result = await pool.query(
      `SELECT i.*,
              c.name as category_name,
              fg.name as fulfillment_group_name,
              ag.name as approval_group_name
       FROM ${schema}.catalog_items i
       LEFT JOIN ${schema}.catalog_categories c ON i.category_id = c.id
       LEFT JOIN ${schema}.groups fg ON i.fulfillment_group_id = fg.id
       LEFT JOIN ${schema}.groups ag ON i.approval_group_id = ag.id
       ${whereClause}
       ORDER BY i.sort_order, i.name
       LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      [...values, params.perPage, offset]
    );

    return { items: result.rows, total };
  }

  async findById(tenantSlug: string, itemId: string): Promise<CatalogItem | null> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(
      `SELECT i.*,
              c.name as category_name,
              fg.name as fulfillment_group_name,
              ag.name as approval_group_name
       FROM ${schema}.catalog_items i
       LEFT JOIN ${schema}.catalog_categories c ON i.category_id = c.id
       LEFT JOIN ${schema}.groups fg ON i.fulfillment_group_id = fg.id
       LEFT JOIN ${schema}.groups ag ON i.approval_group_id = ag.id
       WHERE i.id = $1`,
      [itemId]
    );

    return result.rows[0] || null;
  }

  async create(tenantSlug: string, params: CreateItemParams, createdBy: string): Promise<CatalogItem> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(
      `INSERT INTO ${schema}.catalog_items
       (name, short_description, description, category_id, icon, image_url, form_schema,
        fulfillment_group_id, approval_required, approval_group_id, expected_completion_days,
        cost_center, price, tags, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       RETURNING *`,
      [
        params.name,
        params.shortDescription || null,
        params.description || null,
        params.categoryId || null,
        params.icon || null,
        params.imageUrl || null,
        JSON.stringify(params.formSchema),
        params.fulfillmentGroupId || null,
        params.approvalRequired || false,
        params.approvalGroupId || null,
        params.expectedCompletionDays || 5,
        params.costCenter || null,
        params.price || null,
        params.tags || null,
        JSON.stringify(params.metadata || {}),
      ]
    );

    const item = result.rows[0];

    await pool.query(
      `INSERT INTO ${schema}.audit_logs (user_id, action, entity_type, entity_id, changes)
       VALUES ($1, 'create', 'catalog_item', $2, $3)`,
      [createdBy, item.id, JSON.stringify({ name: params.name })]
    );

    logger.info({ itemId: item.id }, 'Catalog item created');
    return this.findById(tenantSlug, item.id) as Promise<CatalogItem>;
  }

  async update(tenantSlug: string, itemId: string, params: UpdateItemParams, _updatedBy: string): Promise<CatalogItem> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const existing = await this.findById(tenantSlug, itemId);
    if (!existing) {
      throw new NotFoundError('Catalog item', itemId);
    }

    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (params.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(params.name);
    }
    if (params.shortDescription !== undefined) {
      updates.push(`short_description = $${paramIndex++}`);
      values.push(params.shortDescription);
    }
    if (params.description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(params.description);
    }
    if (params.categoryId !== undefined) {
      updates.push(`category_id = $${paramIndex++}`);
      values.push(params.categoryId);
    }
    if (params.icon !== undefined) {
      updates.push(`icon = $${paramIndex++}`);
      values.push(params.icon);
    }
    if (params.imageUrl !== undefined) {
      updates.push(`image_url = $${paramIndex++}`);
      values.push(params.imageUrl);
    }
    if (params.formSchema !== undefined) {
      updates.push(`form_schema = $${paramIndex++}`);
      values.push(JSON.stringify(params.formSchema));
    }
    if (params.fulfillmentGroupId !== undefined) {
      updates.push(`fulfillment_group_id = $${paramIndex++}`);
      values.push(params.fulfillmentGroupId);
    }
    if (params.approvalRequired !== undefined) {
      updates.push(`approval_required = $${paramIndex++}`);
      values.push(params.approvalRequired);
    }
    if (params.approvalGroupId !== undefined) {
      updates.push(`approval_group_id = $${paramIndex++}`);
      values.push(params.approvalGroupId);
    }
    if (params.expectedCompletionDays !== undefined) {
      updates.push(`expected_completion_days = $${paramIndex++}`);
      values.push(params.expectedCompletionDays);
    }
    if (params.costCenter !== undefined) {
      updates.push(`cost_center = $${paramIndex++}`);
      values.push(params.costCenter);
    }
    if (params.price !== undefined) {
      updates.push(`price = $${paramIndex++}`);
      values.push(params.price);
    }
    if (params.isActive !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      values.push(params.isActive);
    }
    if (params.sortOrder !== undefined) {
      updates.push(`sort_order = $${paramIndex++}`);
      values.push(params.sortOrder);
    }
    if (params.tags !== undefined) {
      updates.push(`tags = $${paramIndex++}`);
      values.push(params.tags);
    }
    if (params.metadata !== undefined) {
      updates.push(`metadata = $${paramIndex++}`);
      values.push(JSON.stringify(params.metadata));
    }

    if (updates.length === 0) {
      return existing;
    }

    updates.push(`updated_at = NOW()`);
    values.push(itemId);

    await pool.query(
      `UPDATE ${schema}.catalog_items SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
      values
    );

    logger.info({ itemId }, 'Catalog item updated');
    return this.findById(tenantSlug, itemId) as Promise<CatalogItem>;
  }

  async delete(tenantSlug: string, itemId: string, _deletedBy: string): Promise<void> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const existing = await this.findById(tenantSlug, itemId);
    if (!existing) {
      throw new NotFoundError('Catalog item', itemId);
    }

    // Soft delete
    await pool.query(
      `UPDATE ${schema}.catalog_items SET is_active = false, updated_at = NOW() WHERE id = $1`,
      [itemId]
    );

    logger.info({ itemId }, 'Catalog item deleted');
  }
}

export const catalogCategoryService = new CatalogCategoryService();
export const catalogItemService = new CatalogItemService();
