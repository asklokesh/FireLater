import { Job, Worker } from 'bullmq';
import { config } from '../../config/index.js';
import { pool } from '../../config/database.js';
import { logger } from '../../utils/logger.js';
import { tenantService } from '../../services/tenant.js';

// Redis connection for worker
const connection = {
  host: new URL(config.redis.url).hostname || 'localhost',
  port: parseInt(new URL(config.redis.url).port || '6379', 10),
};

// ============================================
// JOB DATA TYPES
// ============================================

export interface SyncCloudAccountJobData {
  accountId: string;
  tenantSlug: string;
  syncType: 'resources' | 'costs' | 'all';
}

export interface SyncAllAccountsJobData {
  tenantSlug: string;
  syncType: 'resources' | 'costs' | 'all';
}

export interface CloudSyncResult {
  accountId: string;
  provider: string;
  resourcesUpdated: number;
  costsUpdated: number;
  errors: string[];
}

// ============================================
// CLOUD PROVIDER SYNC (PLACEHOLDERS)
// ============================================

interface CloudResource {
  resourceId: string;
  resourceType: string;
  name: string;
  region: string;
  status: string;
  metadata: Record<string, unknown>;
}

interface CloudCost {
  resourceId?: string;
  serviceName: string;
  cost: number;
  currency: string;
  periodStart: Date;
  periodEnd: Date;
}

async function syncAwsResources(_credentials: Record<string, unknown>): Promise<CloudResource[]> {
  // TODO: Implement with AWS SDK
  logger.info('AWS resource sync would run (SDK not configured)');
  return [];
}

async function syncAwsCosts(_credentials: Record<string, unknown>): Promise<CloudCost[]> {
  // TODO: Implement with AWS Cost Explorer API
  logger.info('AWS cost sync would run (SDK not configured)');
  return [];
}

async function syncAzureResources(_credentials: Record<string, unknown>): Promise<CloudResource[]> {
  // TODO: Implement with Azure SDK
  logger.info('Azure resource sync would run (SDK not configured)');
  return [];
}

async function syncAzureCosts(_credentials: Record<string, unknown>): Promise<CloudCost[]> {
  // TODO: Implement with Azure Cost Management API
  logger.info('Azure cost sync would run (SDK not configured)');
  return [];
}

async function syncGcpResources(_credentials: Record<string, unknown>): Promise<CloudResource[]> {
  // TODO: Implement with GCP SDK
  logger.info('GCP resource sync would run (SDK not configured)');
  return [];
}

async function syncGcpCosts(_credentials: Record<string, unknown>): Promise<CloudCost[]> {
  // TODO: Implement with GCP Billing API
  logger.info('GCP cost sync would run (SDK not configured)');
  return [];
}

// ============================================
// SYNC FUNCTIONS
// ============================================

async function getCloudAccount(schema: string, accountId: string): Promise<{
  id: string;
  provider: string;
  credentials_encrypted: string;
  status: string;
} | null> {
  const result = await pool.query(`
    SELECT id, provider, credentials_encrypted, status
    FROM ${schema}.cloud_accounts
    WHERE id = $1
  `, [accountId]);

  return result.rows[0] || null;
}

async function decryptCredentials(encrypted: string): Promise<Record<string, unknown>> {
  // TODO: Implement proper encryption/decryption for cloud credentials
  // Production requirements:
  // 1. Use a key management service (AWS KMS, HashiCorp Vault, etc.)
  // 2. Encrypt credentials at rest using AES-256-GCM
  // 3. Store encryption key separately from encrypted data
  // 4. Implement key rotation strategy
  // 5. Consider using IAM roles for AWS instead of access keys
  // 6. For Azure, use managed identities
  // 7. For GCP, use service account impersonation
  //
  // Current implementation: credentials stored as plain JSON (NOT SECURE - development only)
  try {
    return JSON.parse(encrypted);
  } catch {
    return {};
  }
}

async function updateResources(
  schema: string,
  accountId: string,
  resources: CloudResource[]
): Promise<number> {
  let updated = 0;

  for (const resource of resources) {
    await pool.query(`
      INSERT INTO ${schema}.cloud_resources (
        cloud_account_id, resource_id, resource_type, name, region, status, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (cloud_account_id, resource_id) DO UPDATE SET
        resource_type = EXCLUDED.resource_type,
        name = EXCLUDED.name,
        region = EXCLUDED.region,
        status = EXCLUDED.status,
        metadata = EXCLUDED.metadata,
        last_synced = NOW()
    `, [
      accountId,
      resource.resourceId,
      resource.resourceType,
      resource.name,
      resource.region,
      resource.status,
      JSON.stringify(resource.metadata),
    ]);
    updated++;
  }

  return updated;
}

async function updateCosts(
  schema: string,
  accountId: string,
  costs: CloudCost[]
): Promise<number> {
  let updated = 0;

  for (const cost of costs) {
    await pool.query(`
      INSERT INTO ${schema}.cloud_cost_reports (
        cloud_account_id, period_start, period_end, period_type,
        total_cost, cost_by_service, currency
      ) VALUES ($1, $2, $3, 'daily', $4, $5, $6)
      ON CONFLICT DO NOTHING
    `, [
      accountId,
      cost.periodStart,
      cost.periodEnd,
      cost.cost,
      JSON.stringify({ [cost.serviceName]: cost.cost }),
      cost.currency,
    ]);
    updated++;
  }

  return updated;
}

async function markSyncComplete(schema: string, accountId: string): Promise<void> {
  await pool.query(`
    UPDATE ${schema}.cloud_accounts
    SET last_sync_at = NOW(), sync_status = 'success'
    WHERE id = $1
  `, [accountId]);
}

async function markSyncFailed(schema: string, accountId: string, error: string): Promise<void> {
  await pool.query(`
    UPDATE ${schema}.cloud_accounts
    SET last_sync_at = NOW(), sync_status = 'failed', sync_error = $2
    WHERE id = $1
  `, [accountId, error]);
}

// ============================================
// JOB PROCESSORS
// ============================================

async function processSyncCloudAccount(job: Job<SyncCloudAccountJobData>): Promise<CloudSyncResult> {
  const { accountId, tenantSlug, syncType } = job.data;
  const schema = tenantService.getSchemaName(tenantSlug);

  logger.info({ jobId: job.id, accountId, syncType }, 'Syncing cloud account');

  const result: CloudSyncResult = {
    accountId,
    provider: '',
    resourcesUpdated: 0,
    costsUpdated: 0,
    errors: [],
  };

  try {
    const account = await getCloudAccount(schema, accountId);
    if (!account) {
      throw new Error(`Cloud account not found: ${accountId}`);
    }

    if (account.status !== 'active') {
      logger.info({ accountId }, 'Cloud account is not active, skipping sync');
      return result;
    }

    result.provider = account.provider;
    const credentials = await decryptCredentials(account.credentials_encrypted);

    // Sync resources
    if (syncType === 'resources' || syncType === 'all') {
      let resources: CloudResource[] = [];

      switch (account.provider) {
        case 'aws':
          resources = await syncAwsResources(credentials);
          break;
        case 'azure':
          resources = await syncAzureResources(credentials);
          break;
        case 'gcp':
          resources = await syncGcpResources(credentials);
          break;
      }

      result.resourcesUpdated = await updateResources(schema, accountId, resources);
    }

    // Sync costs
    if (syncType === 'costs' || syncType === 'all') {
      let costs: CloudCost[] = [];

      switch (account.provider) {
        case 'aws':
          costs = await syncAwsCosts(credentials);
          break;
        case 'azure':
          costs = await syncAzureCosts(credentials);
          break;
        case 'gcp':
          costs = await syncGcpCosts(credentials);
          break;
      }

      result.costsUpdated = await updateCosts(schema, accountId, costs);
    }

    await markSyncComplete(schema, accountId);

    logger.info(
      { jobId: job.id, accountId, resourcesUpdated: result.resourcesUpdated, costsUpdated: result.costsUpdated },
      'Cloud account sync completed'
    );
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    result.errors.push(errMsg);
    await markSyncFailed(schema, accountId, errMsg);
    logger.error({ err: error, accountId }, 'Cloud account sync failed');
  }

  return result;
}

async function processSyncAllAccounts(
  job: Job<SyncAllAccountsJobData>
): Promise<{ total: number; results: CloudSyncResult[] }> {
  const { tenantSlug, syncType } = job.data;
  const schema = tenantService.getSchemaName(tenantSlug);

  logger.info({ jobId: job.id, tenantSlug, syncType }, 'Syncing all cloud accounts');

  const accountsResult = await pool.query(`
    SELECT id FROM ${schema}.cloud_accounts WHERE status = 'active'
  `);

  const results: CloudSyncResult[] = [];

  for (let i = 0; i < accountsResult.rows.length; i++) {
    const account = accountsResult.rows[i];

    const syncJob = {
      data: {
        accountId: account.id,
        tenantSlug,
        syncType,
      },
    } as Job<SyncCloudAccountJobData>;

    const result = await processSyncCloudAccount(syncJob);
    results.push(result);

    await job.updateProgress(((i + 1) / accountsResult.rows.length) * 100);
  }

  logger.info(
    { jobId: job.id, total: results.length },
    'Completed syncing all cloud accounts'
  );

  return { total: results.length, results };
}

// ============================================
// WORKER
// ============================================

export const cloudSyncWorker = new Worker<SyncCloudAccountJobData | SyncAllAccountsJobData>(
  'cloud-sync',
  async (job) => {
    if (job.name === 'sync-account') {
      return processSyncCloudAccount(job as Job<SyncCloudAccountJobData>);
    } else if (job.name === 'sync-all') {
      return processSyncAllAccounts(job as Job<SyncAllAccountsJobData>);
    }
    throw new Error(`Unknown job name: ${job.name}`);
  },
  {
    connection,
    concurrency: 2,
    limiter: {
      max: 5,
      duration: 60000,
    },
  }
);

cloudSyncWorker.on('completed', (job) => {
  logger.debug({ jobId: job.id, jobName: job.name }, 'Cloud sync job completed');
});

cloudSyncWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, jobName: job?.name, err }, 'Cloud sync job failed');
});

// ============================================
// SCHEDULER
// ============================================

export async function scheduleCloudSync(): Promise<number> {
  const { cloudSyncQueue } = await import('../queues.js');

  // Get all active tenants
  const tenantsResult = await pool.query(`
    SELECT slug FROM tenants WHERE status = 'active'
  `);

  let queuedCount = 0;

  for (const tenant of tenantsResult.rows) {
    await cloudSyncQueue.add(
      'sync-all',
      {
        tenantSlug: tenant.slug,
        syncType: 'all',
      },
      {
        jobId: `cloud-sync-${tenant.slug}-${Date.now()}`,
      }
    );
    queuedCount++;
  }

  logger.info({ count: queuedCount }, 'Scheduled cloud sync jobs');

  return queuedCount;
}
