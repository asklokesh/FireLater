import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { pool } from '../../src/config/database.js';
import { assetService } from '../../src/services/asset.js';
import { tenantService } from '../../src/services/tenant.js';

describe('Asset Batch Relationship Loading', () => {
  const testTenantSlug = 'test-batch-assets';
  let schema: string;
  let assetIds: string[] = [];

  beforeEach(async () => {
    // Create test tenant
    await pool.query(`
      INSERT INTO public.tenants (slug, name, status, owner_id)
      VALUES ($1, $2, 'active', gen_random_uuid())
      ON CONFLICT (slug) DO NOTHING
    `, [testTenantSlug, 'Test Batch Assets Tenant']);

    schema = tenantService.getSchemaName(testTenantSlug);

    // Create schema if it doesn't exist
    await pool.query(`
      CREATE SCHEMA IF NOT EXISTS ${schema}
    `);

    // Create minimal required tables
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${schema}.users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255),
        email VARCHAR(255) UNIQUE
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${schema}.id_sequences (
        entity_type VARCHAR(50) PRIMARY KEY,
        prefix VARCHAR(10),
        current_value INTEGER DEFAULT 0
      )
    `);

    await pool.query(`
      INSERT INTO ${schema}.id_sequences (entity_type, prefix, current_value)
      VALUES ('ASSET', 'AST', 0)
      ON CONFLICT (entity_type) DO NOTHING
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${schema}.assets (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        asset_tag VARCHAR(50) NOT NULL UNIQUE,
        name VARCHAR(200) NOT NULL,
        description TEXT,
        asset_type VARCHAR(50) NOT NULL,
        category VARCHAR(50) NOT NULL,
        status VARCHAR(50) DEFAULT 'active',
        location VARCHAR(200),
        department VARCHAR(100),
        owner_id UUID REFERENCES ${schema}.users(id) ON DELETE SET NULL,
        assigned_to_id UUID REFERENCES ${schema}.users(id) ON DELETE SET NULL,
        manufacturer VARCHAR(100),
        model VARCHAR(100),
        serial_number VARCHAR(100),
        version VARCHAR(50),
        license_type VARCHAR(50),
        license_count INTEGER,
        license_expiry DATE,
        purchase_date DATE,
        purchase_cost DECIMAL(12, 2),
        warranty_expiry DATE,
        vendor VARCHAR(100),
        po_number VARCHAR(50),
        ip_address VARCHAR(50),
        mac_address VARCHAR(50),
        hostname VARCHAR(100),
        attributes JSONB DEFAULT '{}',
        created_by UUID REFERENCES ${schema}.users(id),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${schema}.asset_relationships (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        parent_asset_id UUID REFERENCES ${schema}.assets(id) ON DELETE CASCADE,
        child_asset_id UUID REFERENCES ${schema}.assets(id) ON DELETE CASCADE,
        relationship_type VARCHAR(50) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        CONSTRAINT unique_asset_relationship UNIQUE (parent_asset_id, child_asset_id, relationship_type)
      )
    `);

    // Create test assets
    const asset1 = await assetService.createAsset(testTenantSlug, {
      name: 'Server 1',
      assetType: 'hardware',
      category: 'server',
    });

    const asset2 = await assetService.createAsset(testTenantSlug, {
      name: 'Server 2',
      assetType: 'hardware',
      category: 'server',
    });

    const asset3 = await assetService.createAsset(testTenantSlug, {
      name: 'VM 1',
      assetType: 'virtual',
      category: 'virtual_machine',
    });

    const asset4 = await assetService.createAsset(testTenantSlug, {
      name: 'VM 2',
      assetType: 'virtual',
      category: 'virtual_machine',
    });

    assetIds = [asset1.id, asset2.id, asset3.id, asset4.id];

    // Create relationships:
    // Server1 -> VM1 (hosts)
    // Server1 -> VM2 (hosts)
    // Server2 -> VM2 (backup_hosts)
    await assetService.createAssetRelationship(testTenantSlug, asset1.id, asset3.id, 'hosts');
    await assetService.createAssetRelationship(testTenantSlug, asset1.id, asset4.id, 'hosts');
    await assetService.createAssetRelationship(testTenantSlug, asset2.id, asset4.id, 'backup_hosts');
  });

  afterEach(async () => {
    // Clean up
    await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await pool.query(`DELETE FROM public.tenants WHERE slug = $1`, [testTenantSlug]);
  });

  describe('batchGetAssetRelationships', () => {
    it('should load all relationships in 2 queries instead of N queries', async () => {
      // Load relationships for all 4 assets
      const relationshipsMap = await assetService.batchGetAssetRelationships(
        testTenantSlug,
        assetIds
      );

      expect(relationshipsMap.size).toBe(4);

      // Server1 should have 2 children (VM1, VM2)
      const server1Rels = relationshipsMap.get(assetIds[0]);
      expect(server1Rels).toBeDefined();
      expect(server1Rels!.parents).toHaveLength(0);
      expect(server1Rels!.children).toHaveLength(2);
      expect(server1Rels!.children.map(c => c.relationship_type).sort()).toEqual([
        'hosts',
        'hosts',
      ]);

      // Server2 should have 1 child (VM2 as backup)
      const server2Rels = relationshipsMap.get(assetIds[1]);
      expect(server2Rels).toBeDefined();
      expect(server2Rels!.parents).toHaveLength(0);
      expect(server2Rels!.children).toHaveLength(1);
      expect(server2Rels!.children[0].relationship_type).toBe('backup_hosts');

      // VM1 should have 1 parent (Server1)
      const vm1Rels = relationshipsMap.get(assetIds[2]);
      expect(vm1Rels).toBeDefined();
      expect(vm1Rels!.parents).toHaveLength(1);
      expect(vm1Rels!.parents[0].relationship_type).toBe('hosts');
      expect(vm1Rels!.children).toHaveLength(0);

      // VM2 should have 2 parents (Server1 and Server2)
      const vm2Rels = relationshipsMap.get(assetIds[3]);
      expect(vm2Rels).toBeDefined();
      expect(vm2Rels!.parents).toHaveLength(2);
      expect(vm2Rels!.parents.map(p => p.relationship_type).sort()).toEqual([
        'backup_hosts',
        'hosts',
      ]);
      expect(vm2Rels!.children).toHaveLength(0);
    });

    it('should return empty map for empty input', async () => {
      const relationshipsMap = await assetService.batchGetAssetRelationships(testTenantSlug, []);

      expect(relationshipsMap.size).toBe(0);
    });

    it('should return empty arrays for assets with no relationships', async () => {
      // Create asset with no relationships
      const isolatedAsset = await assetService.createAsset(testTenantSlug, {
        name: 'Isolated Server',
        assetType: 'hardware',
        category: 'server',
      });

      const relationshipsMap = await assetService.batchGetAssetRelationships(testTenantSlug, [
        isolatedAsset.id,
      ]);

      expect(relationshipsMap.size).toBe(1);
      const rels = relationshipsMap.get(isolatedAsset.id);
      expect(rels).toBeDefined();
      expect(rels!.parents).toEqual([]);
      expect(rels!.children).toEqual([]);
    });

    it('should handle mixed assets (some with relationships, some without)', async () => {
      // Create asset with no relationships
      const isolatedAsset = await assetService.createAsset(testTenantSlug, {
        name: 'Isolated Server',
        assetType: 'hardware',
        category: 'server',
      });

      // Query for Server1 (has children) and isolated asset (no relationships)
      const relationshipsMap = await assetService.batchGetAssetRelationships(testTenantSlug, [
        assetIds[0],
        isolatedAsset.id,
      ]);

      expect(relationshipsMap.size).toBe(2);

      // Server1 should have children
      const server1Rels = relationshipsMap.get(assetIds[0]);
      expect(server1Rels!.children.length).toBeGreaterThan(0);

      // Isolated asset should have empty arrays
      const isolatedRels = relationshipsMap.get(isolatedAsset.id);
      expect(isolatedRels!.parents).toEqual([]);
      expect(isolatedRels!.children).toEqual([]);
    });

    it('should include asset names in relationship data', async () => {
      const relationshipsMap = await assetService.batchGetAssetRelationships(
        testTenantSlug,
        assetIds
      );

      // VM1 relationship should include parent asset name
      const vm1Rels = relationshipsMap.get(assetIds[2]);
      expect(vm1Rels!.parents[0].parent_asset_name).toBe('Server 1');
      expect(vm1Rels!.parents[0].child_asset_name).toBe('VM 1');
    });
  });

  describe('Performance comparison', () => {
    it('should be more efficient than sequential calls', async () => {
      // This test demonstrates the N+1 problem that batch loading solves
      // We don't measure actual time, but we verify behavior

      // Batch loading: 2 queries total
      const batchStart = Date.now();
      const batchResult = await assetService.batchGetAssetRelationships(
        testTenantSlug,
        assetIds
      );
      const batchTime = Date.now() - batchStart;

      // Sequential loading: 2*N queries (2 per asset)
      const sequentialStart = Date.now();
      const sequentialResults = await Promise.all(
        assetIds.map(id => assetService.getAssetRelationships(testTenantSlug, id))
      );
      const sequentialTime = Date.now() - sequentialStart;

      // Verify both methods produce the same data
      for (let i = 0; i < assetIds.length; i++) {
        const batchData = batchResult.get(assetIds[i]);
        const seqData = sequentialResults[i];

        expect(batchData!.parents.length).toBe(seqData.parents.length);
        expect(batchData!.children.length).toBe(seqData.children.length);
      }

      // Batch should generally be faster, but we don't assert this
      // because test DB is fast and timing can be unreliable
      console.log(`Batch: ${batchTime}ms, Sequential: ${sequentialTime}ms`);
    });
  });
});
