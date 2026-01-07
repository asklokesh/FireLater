import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { createTestApp, generateTestToken, createAuthHeader } from '../helpers.js';

interface MockAsset {
  id: string;
  name: string;
  asset_type: string;
  category: string;
  status: string;
  serial_number: string | null;
  owner_id: string | null;
  assigned_to_id: string | null;
  department: string | null;
  created_at: string;
  updated_at: string;
}

const validAssetTypes = ['hardware', 'software', 'network', 'cloud', 'virtual', 'other'];
const validCategories = [
  'server', 'workstation', 'laptop', 'mobile', 'printer', 'network_device',
  'storage', 'software_license', 'saas_subscription', 'virtual_machine',
  'container', 'database', 'application', 'other'
];
const validStatuses = ['active', 'inactive', 'maintenance', 'retired', 'disposed', 'ordered', 'in_storage'];

describe('Assets Routes', () => {
  let app: FastifyInstance;
  const assets: MockAsset[] = [];
  let assetIdCounter = 0;

  beforeAll(async () => {
    app = await createTestApp();

    // GET /v1/assets/stats/overview - Asset statistics
    app.get('/v1/assets/stats/overview', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const byType: Record<string, number> = {};
      const byStatus: Record<string, number> = {};
      const byCategory: Record<string, number> = {};

      for (const asset of assets) {
        byType[asset.asset_type] = (byType[asset.asset_type] || 0) + 1;
        byStatus[asset.status] = (byStatus[asset.status] || 0) + 1;
        byCategory[asset.category] = (byCategory[asset.category] || 0) + 1;
      }

      return {
        total: assets.length,
        by_type: byType,
        by_status: byStatus,
        by_category: byCategory,
      };
    });

    // GET /v1/assets - List assets
    app.get('/v1/assets', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const query = request.query as {
        asset_type?: string;
        category?: string;
        status?: string;
        search?: string;
        owner_id?: string;
        department?: string;
        page?: string;
        per_page?: string;
      };

      // Validate enum values
      if (query.asset_type && !validAssetTypes.includes(query.asset_type)) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Validation Error',
          message: 'Invalid asset_type value',
        });
      }
      if (query.category && !validCategories.includes(query.category)) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Validation Error',
          message: 'Invalid category value',
        });
      }
      if (query.status && !validStatuses.includes(query.status)) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Validation Error',
          message: 'Invalid status value',
        });
      }

      let filteredAssets = [...assets];

      if (query.asset_type) {
        filteredAssets = filteredAssets.filter(a => a.asset_type === query.asset_type);
      }
      if (query.category) {
        filteredAssets = filteredAssets.filter(a => a.category === query.category);
      }
      if (query.status) {
        filteredAssets = filteredAssets.filter(a => a.status === query.status);
      }
      if (query.search) {
        const q = query.search.toLowerCase();
        filteredAssets = filteredAssets.filter(a =>
          a.name.toLowerCase().includes(q) ||
          (a.serial_number && a.serial_number.toLowerCase().includes(q))
        );
      }
      if (query.owner_id) {
        filteredAssets = filteredAssets.filter(a => a.owner_id === query.owner_id);
      }
      if (query.department) {
        filteredAssets = filteredAssets.filter(a => a.department === query.department);
      }

      const page = parseInt(query.page || '1');
      const perPage = parseInt(query.per_page || '20');
      const start = (page - 1) * perPage;
      const end = start + perPage;

      return {
        data: filteredAssets.slice(start, end),
        meta: {
          page,
          per_page: perPage,
          total: filteredAssets.length,
          total_pages: Math.ceil(filteredAssets.length / perPage),
        },
      };
    });

    // GET /v1/assets/:id - Get asset by ID
    app.get('/v1/assets/:id', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const { id } = request.params as { id: string };
      const asset = assets.find(a => a.id === id);

      if (!asset) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Asset with id '${id}' not found`,
        });
      }

      return asset;
    });

    // POST /v1/assets - Create asset
    app.post('/v1/assets', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const body = request.body as {
        name?: string;
        asset_type?: string;
        category?: string;
        status?: string;
        serial_number?: string;
        department?: string;
      };

      if (!body.name) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Validation Error',
          message: 'Name is required',
        });
      }

      if (body.asset_type && !validAssetTypes.includes(body.asset_type)) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Validation Error',
          message: 'Invalid asset_type value',
        });
      }

      const newAsset: MockAsset = {
        id: `ast-${++assetIdCounter}`,
        name: body.name,
        asset_type: body.asset_type || 'hardware',
        category: body.category || 'other',
        status: body.status || 'active',
        serial_number: body.serial_number || null,
        owner_id: null,
        assigned_to_id: null,
        department: body.department || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      assets.push(newAsset);
      reply.status(201).send(newAsset);
    });

    // PUT /v1/assets/:id - Update asset
    app.put('/v1/assets/:id', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const { id } = request.params as { id: string };
      const assetIndex = assets.findIndex(a => a.id === id);

      if (assetIndex === -1) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Asset with id '${id}' not found`,
        });
      }

      const body = request.body as Partial<MockAsset>;

      if (body.status && !validStatuses.includes(body.status)) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Validation Error',
          message: 'Invalid status value',
        });
      }

      assets[assetIndex] = {
        ...assets[assetIndex],
        ...body,
        updated_at: new Date().toISOString(),
      };

      return assets[assetIndex];
    });

    // DELETE /v1/assets/:id - Delete asset
    app.delete('/v1/assets/:id', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const { id } = request.params as { id: string };
      const assetIndex = assets.findIndex(a => a.id === id);

      if (assetIndex === -1) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Asset with id '${id}' not found`,
        });
      }

      assets.splice(assetIndex, 1);
      reply.status(204).send();
    });

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /v1/assets/stats/overview', () => {
    it('should return empty stats initially', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/assets/stats/overview',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.total).toBe(0);
    });

    it('should return 401 without auth', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/assets/stats/overview',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('POST /v1/assets', () => {
    it('should create an asset', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'POST',
        url: '/v1/assets',
        headers: createAuthHeader(token),
        payload: {
          name: 'Dell Server R740',
          asset_type: 'hardware',
          category: 'server',
          serial_number: 'SN123456',
          department: 'IT',
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.name).toBe('Dell Server R740');
      expect(body.asset_type).toBe('hardware');
    });

    it('should return 400 for missing name', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'POST',
        url: '/v1/assets',
        headers: createAuthHeader(token),
        payload: {
          asset_type: 'hardware',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 for invalid asset_type', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'POST',
        url: '/v1/assets',
        headers: createAuthHeader(token),
        payload: {
          name: 'Test Asset',
          asset_type: 'invalid',
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /v1/assets', () => {
    beforeAll(async () => {
      const token = generateTestToken(app);
      // Add more test assets
      for (const assetData of [
        { name: 'MacBook Pro', asset_type: 'hardware', category: 'laptop', department: 'Engineering' },
        { name: 'Office 365', asset_type: 'software', category: 'saas_subscription' },
        { name: 'Cisco Router', asset_type: 'network', category: 'network_device', department: 'IT' },
      ]) {
        await app.inject({
          method: 'POST',
          url: '/v1/assets',
          headers: createAuthHeader(token),
          payload: assetData,
        });
      }
    });

    it('should list assets with pagination', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/assets?page=1&per_page=10',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toBeDefined();
      expect(body.meta.page).toBe(1);
    });

    it('should filter by asset_type', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/assets?asset_type=hardware',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.every((a: MockAsset) => a.asset_type === 'hardware')).toBe(true);
    });

    it('should filter by department', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/assets?department=IT',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.every((a: MockAsset) => a.department === 'IT')).toBe(true);
    });

    it('should search by name', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/assets?search=Dell',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.length).toBeGreaterThan(0);
    });

    it('should return 400 for invalid asset_type', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/assets?asset_type=invalid',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 for invalid category', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/assets?category=invalid',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 for invalid status', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/assets?status=invalid',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /v1/assets/:id', () => {
    it('should get an asset by id', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/assets/ast-1',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.id).toBe('ast-1');
    });

    it('should return 404 for non-existent asset', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/assets/non-existent',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('PUT /v1/assets/:id', () => {
    it('should update an asset', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'PUT',
        url: '/v1/assets/ast-1',
        headers: createAuthHeader(token),
        payload: {
          name: 'Dell Server R740 Updated',
          status: 'maintenance',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.name).toBe('Dell Server R740 Updated');
      expect(body.status).toBe('maintenance');
    });

    it('should return 404 for non-existent asset', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'PUT',
        url: '/v1/assets/non-existent',
        headers: createAuthHeader(token),
        payload: { name: 'Test' },
      });

      expect(response.statusCode).toBe(404);
    });

    it('should return 400 for invalid status', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'PUT',
        url: '/v1/assets/ast-1',
        headers: createAuthHeader(token),
        payload: { status: 'invalid' },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('DELETE /v1/assets/:id', () => {
    it('should delete an asset', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'DELETE',
        url: '/v1/assets/ast-1',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(204);
    });

    it('should return 404 when deleting non-existent asset', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'DELETE',
        url: '/v1/assets/non-existent',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('Stats after modifications', () => {
    it('should update stats correctly', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/assets/stats/overview',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.total).toBeGreaterThan(0);
      expect(body.by_type).toBeDefined();
      expect(body.by_status).toBeDefined();
    });
  });
});
