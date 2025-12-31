import { describe, it, beforeEach, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { createTestApp, TestApp } from '../utils/test-app.js';
import { createTestTenant, TestTenant } from '../utils/test-tenant.js';
import { createTestUser, TestUser } from '../utils/test-user.js';
import { assetService } from '../../src/services/assets.js';

describe('Assets - Multi-tenant Isolation', () => {
  let app: TestApp;
  let tenant1: TestTenant;
  let tenant2: TestTenant;
  let user1: TestUser;
  let user2: TestUser;

  beforeEach(async () => {
    app = await createTestApp();
    tenant1 = await createTestTenant(app);
    tenant2 = await createTestTenant(app);
    user1 = await createTestUser(app, tenant1);
    user2 = await createTestUser(app, tenant2);
  });

  afterEach(async () => {
    await app.close();
  });

  it('should isolate assets between tenants', async () => {
    // Create asset for tenant1
    const asset1 = await assetService.createAsset(tenant1.slug, {
      name: 'Server 1',
      type: 'server',
      status: 'active',
    }, user1.userId);

    // Create asset for tenant2
    const asset2 = await assetService.createAsset(tenant2.slug, {
      name: 'Server 2',
      type: 'server',
      status: 'active',
    }, user2.userId);

    // Verify tenant1 cannot access tenant2's asset
    const tenant1Assets = await assetService.listAssets(tenant1.slug, { page: 1, limit: 10 });
    assert.equal(tenant1Assets.assets.length, 1);
    assert.equal(tenant1Assets.assets[0].id, asset1.id);
    assert.notEqual(tenant1Assets.assets[0].id, asset2.id);

    // Verify tenant2 cannot access tenant1's asset
    const tenant2Assets = await assetService.listAssets(tenant2.slug, { page: 1, limit: 10 });
    assert.equal(tenant2Assets.assets.length, 1);
    assert.equal(tenant2Assets.assets[0].id, asset2.id);
    assert.notEqual(tenant2Assets.assets[0].id, asset1.id);

    // Verify tenant1 cannot get tenant2's asset by ID
    await assert.rejects(
      () => assetService.getAssetById(tenant1.slug, asset2.id),
      { message: 'Asset not found' }
    );

    // Verify tenant2 cannot get tenant1's asset by ID
    await assert.rejects(
      () => assetService.getAssetById(tenant2.slug, asset1.id),
      { message: 'Asset not found' }
    );
  });

  it('should prevent cross-tenant asset updates', async () => {
    // Create asset for tenant1
    const asset1 = await assetService.createAsset(tenant1.slug, {
      name: 'Server 1',
      type: 'server',
      status: 'active',
    }, user1.userId);

    // Verify tenant2 cannot update tenant1's asset
    await assert.rejects(
      () => assetService.updateAsset(tenant2.slug, asset1.id, { name: 'Hacked Server' }),
      { message: 'Asset not found' }
    );

    // Verify asset was not modified
    const unchangedAsset = await assetService.getAssetById(tenant1.slug, asset1.id);
    assert.equal(unchangedAsset.name, 'Server 1');
  });

  it('should prevent cross-tenant asset deletion', async () => {
    // Create asset for tenant1
    const asset1 = await assetService.createAsset(tenant1.slug, {
      name: 'Server 1',
      type: 'server',
      status: 'active',
    }, user1.userId);

    // Verify tenant2 cannot delete tenant1's asset
    await assert.rejects(
      () => assetService.deleteAsset(tenant2.slug, asset1.id),
      { message: 'Asset not found' }
    );

    // Verify asset still exists
    const existingAsset = await assetService.getAssetById(tenant1.slug, asset1.id);
    assert.equal(existingAsset.id, asset1.id);
  });
});