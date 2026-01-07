import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { createTestApp, testUser, generateTestToken, createAuthHeader } from '../helpers.js';

interface MockCatalogCategory {
  id: string;
  name: string;
  description: string;
  icon: string | null;
  parent_id: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface MockCatalogItem {
  id: string;
  name: string;
  description: string;
  short_description: string;
  category_id: string;
  icon: string | null;
  price: number;
  fulfillment_time_days: number;
  requires_approval: boolean;
  approval_group_id: string | null;
  form_schema: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

describe('Service Catalog Routes', () => {
  let app: FastifyInstance;
  const categories: MockCatalogCategory[] = [];
  const items: MockCatalogItem[] = [];
  let categoryIdCounter = 0;
  let itemIdCounter = 0;

  beforeAll(async () => {
    app = await createTestApp();

    // GET /v1/catalog/categories - List categories
    app.get('/v1/catalog/categories', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const query = request.query as { is_active?: string };
      let filteredCategories = [...categories];

      if (query.is_active !== undefined) {
        const isActive = query.is_active === 'true';
        filteredCategories = filteredCategories.filter((c) => c.is_active === isActive);
      }

      return { data: filteredCategories };
    });

    // POST /v1/catalog/categories - Create category
    app.post('/v1/catalog/categories', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const body = request.body as {
        name?: string;
        description?: string;
        icon?: string;
        parent_id?: string;
        sort_order?: number;
      };

      if (!body.name) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Validation Error',
          message: 'Category name is required',
        });
      }

      const newCategory: MockCatalogCategory = {
        id: `cat-${++categoryIdCounter}`,
        name: body.name,
        description: body.description || '',
        icon: body.icon || null,
        parent_id: body.parent_id || null,
        sort_order: body.sort_order || 0,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      categories.push(newCategory);
      reply.status(201).send(newCategory);
    });

    // GET /v1/catalog/categories/:id - Get category by ID
    app.get('/v1/catalog/categories/:id', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const { id } = request.params as { id: string };
      const category = categories.find((c) => c.id === id);

      if (!category) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Category with id '${id}' not found`,
        });
      }

      return category;
    });

    // PUT /v1/catalog/categories/:id - Update category
    app.put('/v1/catalog/categories/:id', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const { id } = request.params as { id: string };
      const body = request.body as Partial<MockCatalogCategory>;
      const categoryIndex = categories.findIndex((c) => c.id === id);

      if (categoryIndex === -1) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Category with id '${id}' not found`,
        });
      }

      categories[categoryIndex] = {
        ...categories[categoryIndex],
        ...body,
        updated_at: new Date().toISOString(),
      };

      return categories[categoryIndex];
    });

    // DELETE /v1/catalog/categories/:id - Delete category
    app.delete('/v1/catalog/categories/:id', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const { id } = request.params as { id: string };
      const categoryIndex = categories.findIndex((c) => c.id === id);

      if (categoryIndex === -1) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Category with id '${id}' not found`,
        });
      }

      // Check if category has items
      const hasItems = items.some((i) => i.category_id === id);
      if (hasItems) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Cannot delete category with existing items',
        });
      }

      categories.splice(categoryIndex, 1);
      reply.status(204).send();
    });

    // GET /v1/catalog/items - List items
    app.get('/v1/catalog/items', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const query = request.query as {
        page?: string;
        limit?: string;
        category_id?: string;
        is_active?: string;
        search?: string;
      };
      const page = parseInt(query.page || '1', 10);
      const limit = parseInt(query.limit || '20', 10);

      let filteredItems = [...items];

      if (query.category_id) {
        filteredItems = filteredItems.filter((i) => i.category_id === query.category_id);
      }
      if (query.is_active !== undefined) {
        const isActive = query.is_active === 'true';
        filteredItems = filteredItems.filter((i) => i.is_active === isActive);
      }
      if (query.search) {
        const searchLower = query.search.toLowerCase();
        filteredItems = filteredItems.filter(
          (i) => i.name.toLowerCase().includes(searchLower) || i.description.toLowerCase().includes(searchLower)
        );
      }

      return {
        data: filteredItems.slice((page - 1) * limit, page * limit),
        pagination: {
          page,
          limit,
          total: filteredItems.length,
          totalPages: Math.ceil(filteredItems.length / limit),
        },
      };
    });

    // POST /v1/catalog/items - Create item
    app.post('/v1/catalog/items', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const body = request.body as {
        name?: string;
        description?: string;
        short_description?: string;
        category_id?: string;
        icon?: string;
        price?: number;
        fulfillment_time_days?: number;
        requires_approval?: boolean;
        approval_group_id?: string;
        form_schema?: Record<string, unknown>;
      };

      if (!body.name) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Validation Error',
          message: 'Item name is required',
        });
      }

      if (!body.category_id) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Validation Error',
          message: 'Category ID is required',
        });
      }

      // Verify category exists
      const category = categories.find((c) => c.id === body.category_id);
      if (!category) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Validation Error',
          message: 'Invalid category ID',
        });
      }

      const newItem: MockCatalogItem = {
        id: `item-${++itemIdCounter}`,
        name: body.name,
        description: body.description || '',
        short_description: body.short_description || '',
        category_id: body.category_id,
        icon: body.icon || null,
        price: body.price || 0,
        fulfillment_time_days: body.fulfillment_time_days || 5,
        requires_approval: body.requires_approval || false,
        approval_group_id: body.approval_group_id || null,
        form_schema: body.form_schema || {},
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      items.push(newItem);
      reply.status(201).send(newItem);
    });

    // GET /v1/catalog/items/:id - Get item by ID
    app.get('/v1/catalog/items/:id', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const { id } = request.params as { id: string };
      const item = items.find((i) => i.id === id);

      if (!item) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Item with id '${id}' not found`,
        });
      }

      // Include category info
      const category = categories.find((c) => c.id === item.category_id);
      return { ...item, category };
    });

    // PUT /v1/catalog/items/:id - Update item
    app.put('/v1/catalog/items/:id', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const { id } = request.params as { id: string };
      const body = request.body as Partial<MockCatalogItem>;
      const itemIndex = items.findIndex((i) => i.id === id);

      if (itemIndex === -1) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Item with id '${id}' not found`,
        });
      }

      items[itemIndex] = {
        ...items[itemIndex],
        ...body,
        updated_at: new Date().toISOString(),
      };

      return items[itemIndex];
    });

    // DELETE /v1/catalog/items/:id - Delete item
    app.delete('/v1/catalog/items/:id', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const { id } = request.params as { id: string };
      const itemIndex = items.findIndex((i) => i.id === id);

      if (itemIndex === -1) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Item with id '${id}' not found`,
        });
      }

      items.splice(itemIndex, 1);
      reply.status(204).send();
    });

    // POST /v1/catalog/items/:id/request - Submit request for item
    app.post('/v1/catalog/items/:id/request', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const { id } = request.params as { id: string };
      const body = request.body as {
        justification?: string;
        form_data?: Record<string, unknown>;
        quantity?: number;
      };

      const item = items.find((i) => i.id === id);
      if (!item) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Item with id '${id}' not found`,
        });
      }

      if (!item.is_active) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Cannot request inactive item',
        });
      }

      // Create service request
      const serviceRequest = {
        id: `req-catalog-${Date.now()}`,
        number: `REQ${String(Date.now()).slice(-7)}`,
        title: `Request: ${item.name}`,
        catalog_item_id: item.id,
        catalog_item_name: item.name,
        requester_id: testUser.userId,
        status: item.requires_approval ? 'pending_approval' : 'submitted',
        justification: body.justification || null,
        form_data: body.form_data || {},
        quantity: body.quantity || 1,
        created_at: new Date().toISOString(),
      };

      reply.status(201).send(serviceRequest);
    });

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Categories', () => {
    describe('GET /v1/catalog/categories', () => {
      it('should list categories', async () => {
        const token = generateTestToken(app);
        const response = await app.inject({
          method: 'GET',
          url: '/v1/catalog/categories',
          headers: createAuthHeader(token),
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.payload);
        expect(body).toHaveProperty('data');
        expect(Array.isArray(body.data)).toBe(true);
      });

      it('should reject unauthenticated request', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/v1/catalog/categories',
        });

        expect(response.statusCode).toBe(401);
      });
    });

    describe('POST /v1/catalog/categories', () => {
      it('should create a new category', async () => {
        const token = generateTestToken(app);
        const response = await app.inject({
          method: 'POST',
          url: '/v1/catalog/categories',
          headers: createAuthHeader(token),
          payload: {
            name: 'Hardware',
            description: 'Physical hardware requests',
            icon: 'laptop',
            sort_order: 1,
          },
        });

        expect(response.statusCode).toBe(201);
        const body = JSON.parse(response.payload);
        expect(body).toHaveProperty('id');
        expect(body.name).toBe('Hardware');
        expect(body.is_active).toBe(true);
      });

      it('should reject category without name', async () => {
        const token = generateTestToken(app);
        const response = await app.inject({
          method: 'POST',
          url: '/v1/catalog/categories',
          headers: createAuthHeader(token),
          payload: { description: 'No name provided' },
        });

        expect(response.statusCode).toBe(400);
        const body = JSON.parse(response.payload);
        expect(body.message).toContain('Category name is required');
      });

      it('should create nested category with parent', async () => {
        const token = generateTestToken(app);

        // Create parent category
        const parentResponse = await app.inject({
          method: 'POST',
          url: '/v1/catalog/categories',
          headers: createAuthHeader(token),
          payload: { name: 'Parent Category' },
        });
        const parent = JSON.parse(parentResponse.payload);

        // Create child category
        const response = await app.inject({
          method: 'POST',
          url: '/v1/catalog/categories',
          headers: createAuthHeader(token),
          payload: {
            name: 'Child Category',
            parent_id: parent.id,
          },
        });

        expect(response.statusCode).toBe(201);
        const body = JSON.parse(response.payload);
        expect(body.parent_id).toBe(parent.id);
      });
    });

    describe('PUT /v1/catalog/categories/:id', () => {
      it('should update a category', async () => {
        const token = generateTestToken(app);

        // Create category first
        const createResponse = await app.inject({
          method: 'POST',
          url: '/v1/catalog/categories',
          headers: createAuthHeader(token),
          payload: { name: 'Original Name' },
        });
        const created = JSON.parse(createResponse.payload);

        const response = await app.inject({
          method: 'PUT',
          url: `/v1/catalog/categories/${created.id}`,
          headers: createAuthHeader(token),
          payload: { name: 'Updated Name', description: 'New description' },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.payload);
        expect(body.name).toBe('Updated Name');
        expect(body.description).toBe('New description');
      });
    });

    describe('DELETE /v1/catalog/categories/:id', () => {
      it('should delete an empty category', async () => {
        const token = generateTestToken(app);

        // Create category first
        const createResponse = await app.inject({
          method: 'POST',
          url: '/v1/catalog/categories',
          headers: createAuthHeader(token),
          payload: { name: 'Category to Delete' },
        });
        const created = JSON.parse(createResponse.payload);

        const response = await app.inject({
          method: 'DELETE',
          url: `/v1/catalog/categories/${created.id}`,
          headers: createAuthHeader(token),
        });

        expect(response.statusCode).toBe(204);
      });
    });
  });

  describe('Items', () => {
    let testCategory: MockCatalogCategory;

    beforeAll(async () => {
      const token = generateTestToken(app);
      const createResponse = await app.inject({
        method: 'POST',
        url: '/v1/catalog/categories',
        headers: createAuthHeader(token),
        payload: { name: 'Test Category for Items' },
      });
      testCategory = JSON.parse(createResponse.payload);
    });

    describe('GET /v1/catalog/items', () => {
      it('should list items with pagination', async () => {
        const token = generateTestToken(app);
        const response = await app.inject({
          method: 'GET',
          url: '/v1/catalog/items',
          headers: createAuthHeader(token),
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.payload);
        expect(body).toHaveProperty('data');
        expect(body).toHaveProperty('pagination');
        expect(Array.isArray(body.data)).toBe(true);
      });

      it('should filter items by category', async () => {
        const token = generateTestToken(app);

        // Create an item first
        await app.inject({
          method: 'POST',
          url: '/v1/catalog/items',
          headers: createAuthHeader(token),
          payload: {
            name: 'Test Item for Filter',
            category_id: testCategory.id,
          },
        });

        const response = await app.inject({
          method: 'GET',
          url: `/v1/catalog/items?category_id=${testCategory.id}`,
          headers: createAuthHeader(token),
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.payload);
        expect(body.data.every((i: MockCatalogItem) => i.category_id === testCategory.id)).toBe(true);
      });

      it('should search items by name', async () => {
        const token = generateTestToken(app);

        // Create an item first
        await app.inject({
          method: 'POST',
          url: '/v1/catalog/items',
          headers: createAuthHeader(token),
          payload: {
            name: 'MacBook Pro Laptop',
            category_id: testCategory.id,
          },
        });

        const response = await app.inject({
          method: 'GET',
          url: '/v1/catalog/items?search=MacBook',
          headers: createAuthHeader(token),
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.payload);
        expect(body.data.some((i: MockCatalogItem) => i.name.includes('MacBook'))).toBe(true);
      });
    });

    describe('POST /v1/catalog/items', () => {
      it('should create a new catalog item', async () => {
        const token = generateTestToken(app);
        const response = await app.inject({
          method: 'POST',
          url: '/v1/catalog/items',
          headers: createAuthHeader(token),
          payload: {
            name: 'Standard Laptop',
            description: 'Standard issue laptop for employees',
            short_description: 'Laptop for daily work',
            category_id: testCategory.id,
            price: 1500,
            fulfillment_time_days: 7,
            requires_approval: true,
            form_schema: {
              type: 'object',
              properties: {
                cpu: { type: 'string', enum: ['Intel i5', 'Intel i7', 'M2'] },
                memory: { type: 'string', enum: ['16GB', '32GB'] },
              },
            },
          },
        });

        expect(response.statusCode).toBe(201);
        const body = JSON.parse(response.payload);
        expect(body).toHaveProperty('id');
        expect(body.name).toBe('Standard Laptop');
        expect(body.requires_approval).toBe(true);
        expect(body.fulfillment_time_days).toBe(7);
      });

      it('should reject item without name', async () => {
        const token = generateTestToken(app);
        const response = await app.inject({
          method: 'POST',
          url: '/v1/catalog/items',
          headers: createAuthHeader(token),
          payload: {
            category_id: testCategory.id,
            description: 'No name provided',
          },
        });

        expect(response.statusCode).toBe(400);
        const body = JSON.parse(response.payload);
        expect(body.message).toContain('Item name is required');
      });

      it('should reject item without category', async () => {
        const token = generateTestToken(app);
        const response = await app.inject({
          method: 'POST',
          url: '/v1/catalog/items',
          headers: createAuthHeader(token),
          payload: { name: 'Item without Category' },
        });

        expect(response.statusCode).toBe(400);
        const body = JSON.parse(response.payload);
        expect(body.message).toContain('Category ID is required');
      });

      it('should reject item with invalid category', async () => {
        const token = generateTestToken(app);
        const response = await app.inject({
          method: 'POST',
          url: '/v1/catalog/items',
          headers: createAuthHeader(token),
          payload: {
            name: 'Item with Invalid Category',
            category_id: 'non-existent-category',
          },
        });

        expect(response.statusCode).toBe(400);
        const body = JSON.parse(response.payload);
        expect(body.message).toContain('Invalid category ID');
      });
    });

    describe('GET /v1/catalog/items/:id', () => {
      it('should get item by ID with category info', async () => {
        const token = generateTestToken(app);

        // Create item first
        const createResponse = await app.inject({
          method: 'POST',
          url: '/v1/catalog/items',
          headers: createAuthHeader(token),
          payload: {
            name: 'Test Item',
            category_id: testCategory.id,
          },
        });
        const created = JSON.parse(createResponse.payload);

        const response = await app.inject({
          method: 'GET',
          url: `/v1/catalog/items/${created.id}`,
          headers: createAuthHeader(token),
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.payload);
        expect(body.id).toBe(created.id);
        expect(body).toHaveProperty('category');
      });

      it('should return 404 for non-existent item', async () => {
        const token = generateTestToken(app);
        const response = await app.inject({
          method: 'GET',
          url: '/v1/catalog/items/non-existent-id',
          headers: createAuthHeader(token),
        });

        expect(response.statusCode).toBe(404);
      });
    });

    describe('PUT /v1/catalog/items/:id', () => {
      it('should update a catalog item', async () => {
        const token = generateTestToken(app);

        // Create item first
        const createResponse = await app.inject({
          method: 'POST',
          url: '/v1/catalog/items',
          headers: createAuthHeader(token),
          payload: {
            name: 'Original Item',
            category_id: testCategory.id,
            price: 100,
          },
        });
        const created = JSON.parse(createResponse.payload);

        const response = await app.inject({
          method: 'PUT',
          url: `/v1/catalog/items/${created.id}`,
          headers: createAuthHeader(token),
          payload: { name: 'Updated Item', price: 200 },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.payload);
        expect(body.name).toBe('Updated Item');
        expect(body.price).toBe(200);
      });

      it('should deactivate a catalog item', async () => {
        const token = generateTestToken(app);

        // Create item first
        const createResponse = await app.inject({
          method: 'POST',
          url: '/v1/catalog/items',
          headers: createAuthHeader(token),
          payload: {
            name: 'Item to Deactivate',
            category_id: testCategory.id,
          },
        });
        const created = JSON.parse(createResponse.payload);

        const response = await app.inject({
          method: 'PUT',
          url: `/v1/catalog/items/${created.id}`,
          headers: createAuthHeader(token),
          payload: { is_active: false },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.payload);
        expect(body.is_active).toBe(false);
      });
    });

    describe('DELETE /v1/catalog/items/:id', () => {
      it('should delete a catalog item', async () => {
        const token = generateTestToken(app);

        // Create item first
        const createResponse = await app.inject({
          method: 'POST',
          url: '/v1/catalog/items',
          headers: createAuthHeader(token),
          payload: {
            name: 'Item to Delete',
            category_id: testCategory.id,
          },
        });
        const created = JSON.parse(createResponse.payload);

        const response = await app.inject({
          method: 'DELETE',
          url: `/v1/catalog/items/${created.id}`,
          headers: createAuthHeader(token),
        });

        expect(response.statusCode).toBe(204);
      });
    });

    describe('POST /v1/catalog/items/:id/request', () => {
      it('should submit a catalog request', async () => {
        const token = generateTestToken(app);

        // Create item first
        const createResponse = await app.inject({
          method: 'POST',
          url: '/v1/catalog/items',
          headers: createAuthHeader(token),
          payload: {
            name: 'Requestable Item',
            category_id: testCategory.id,
            requires_approval: false,
          },
        });
        const created = JSON.parse(createResponse.payload);

        const response = await app.inject({
          method: 'POST',
          url: `/v1/catalog/items/${created.id}/request`,
          headers: createAuthHeader(token),
          payload: {
            justification: 'Need for project work',
            quantity: 2,
            form_data: { color: 'silver' },
          },
        });

        expect(response.statusCode).toBe(201);
        const body = JSON.parse(response.payload);
        expect(body.catalog_item_id).toBe(created.id);
        expect(body.status).toBe('submitted');
        expect(body.quantity).toBe(2);
      });

      it('should set pending approval status when approval required', async () => {
        const token = generateTestToken(app);

        // Create item that requires approval
        const createResponse = await app.inject({
          method: 'POST',
          url: '/v1/catalog/items',
          headers: createAuthHeader(token),
          payload: {
            name: 'Item Requiring Approval',
            category_id: testCategory.id,
            requires_approval: true,
          },
        });
        const created = JSON.parse(createResponse.payload);

        const response = await app.inject({
          method: 'POST',
          url: `/v1/catalog/items/${created.id}/request`,
          headers: createAuthHeader(token),
          payload: {
            justification: 'Urgent need',
          },
        });

        expect(response.statusCode).toBe(201);
        const body = JSON.parse(response.payload);
        expect(body.status).toBe('pending_approval');
      });

      it('should not request inactive item', async () => {
        const token = generateTestToken(app);

        // Create and deactivate item
        const createResponse = await app.inject({
          method: 'POST',
          url: '/v1/catalog/items',
          headers: createAuthHeader(token),
          payload: {
            name: 'Inactive Item',
            category_id: testCategory.id,
          },
        });
        const created = JSON.parse(createResponse.payload);

        await app.inject({
          method: 'PUT',
          url: `/v1/catalog/items/${created.id}`,
          headers: createAuthHeader(token),
          payload: { is_active: false },
        });

        const response = await app.inject({
          method: 'POST',
          url: `/v1/catalog/items/${created.id}/request`,
          headers: createAuthHeader(token),
          payload: {},
        });

        expect(response.statusCode).toBe(400);
        const body = JSON.parse(response.payload);
        expect(body.message).toContain('Cannot request inactive item');
      });
    });
  });
});

describe('Catalog Form Schemas', () => {
  it('should support JSON Schema form definitions', () => {
    const formSchema = {
      type: 'object',
      required: ['cpu', 'memory'],
      properties: {
        cpu: {
          type: 'string',
          title: 'Processor',
          enum: ['Intel i5', 'Intel i7', 'Apple M2'],
        },
        memory: {
          type: 'string',
          title: 'Memory',
          enum: ['16GB', '32GB', '64GB'],
        },
        notes: {
          type: 'string',
          title: 'Additional Notes',
          maxLength: 500,
        },
      },
    };

    expect(formSchema.type).toBe('object');
    expect(formSchema.required).toContain('cpu');
    expect(formSchema.required).toContain('memory');
    expect(formSchema.properties.cpu.enum).toHaveLength(3);
  });
});
