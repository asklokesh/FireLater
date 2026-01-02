import { Job, Worker } from 'bullmq';
import { EC2Client, DescribeInstancesCommand, DescribeVpcsCommand } from '@aws-sdk/client-ec2';
import { RDSClient, DescribeDBInstancesCommand } from '@aws-sdk/client-rds';
import { LambdaClient, ListFunctionsCommand } from '@aws-sdk/client-lambda';
import { CostExplorerClient, GetCostAndUsageCommand } from '@aws-sdk/client-cost-explorer';
import { ClientSecretCredential } from '@azure/identity';
import { ResourceManagementClient } from '@azure/arm-resources';
import { ComputeManagementClient } from '@azure/arm-compute';
import { CostManagementClient } from '@azure/arm-costmanagement';
import { InstancesClient, DisksClient } from '@google-cloud/compute';
import crypto from 'crypto';
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

// ============================================
// AWS SYNC IMPLEMENTATION
// ============================================

interface AwsCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  assumeRoleArn?: string;
}

async function syncAwsResources(credentials: Record<string, unknown>): Promise<CloudResource[]> {
  const awsCreds = credentials as unknown as AwsCredentials;

  if (!awsCreds.accessKeyId || !awsCreds.secretAccessKey) {
    logger.warn('AWS credentials not configured, skipping resource sync');
    return [];
  }

  const resources: CloudResource[] = [];
  const clientConfig = {
    region: awsCreds.region || 'us-east-1',
    credentials: {
      accessKeyId: awsCreds.accessKeyId,
      secretAccessKey: awsCreds.secretAccessKey,
    },
  };

  try {
    // Sync EC2 Instances
    const ec2Client = new EC2Client(clientConfig);
    const ec2Response = await ec2Client.send(new DescribeInstancesCommand({}));

    for (const reservation of ec2Response.Reservations || []) {
      for (const instance of reservation.Instances || []) {
        const nameTag = instance.Tags?.find(t => t.Key === 'Name');
        resources.push({
          resourceId: instance.InstanceId || '',
          resourceType: 'ec2:instance',
          name: nameTag?.Value || instance.InstanceId || 'Unnamed Instance',
          region: awsCreds.region || 'us-east-1',
          status: instance.State?.Name || 'unknown',
          metadata: {
            instanceType: instance.InstanceType,
            platform: instance.Platform || 'linux',
            privateIp: instance.PrivateIpAddress,
            publicIp: instance.PublicIpAddress,
            vpcId: instance.VpcId,
            launchTime: instance.LaunchTime?.toISOString(),
            tags: instance.Tags?.reduce((acc, t) => ({ ...acc, [t.Key || '']: t.Value }), {}),
          },
        });
      }
    }

    // Sync VPCs
    const vpcResponse = await ec2Client.send(new DescribeVpcsCommand({}));
    for (const vpc of vpcResponse.Vpcs || []) {
      const nameTag = vpc.Tags?.find(t => t.Key === 'Name');
      resources.push({
        resourceId: vpc.VpcId || '',
        resourceType: 'ec2:vpc',
        name: nameTag?.Value || vpc.VpcId || 'Unnamed VPC',
        region: awsCreds.region || 'us-east-1',
        status: vpc.State || 'unknown',
        metadata: {
          cidrBlock: vpc.CidrBlock,
          isDefault: vpc.IsDefault,
          tags: vpc.Tags?.reduce((acc, t) => ({ ...acc, [t.Key || '']: t.Value }), {}),
        },
      });
    }

    // Sync RDS Instances
    const rdsClient = new RDSClient(clientConfig);
    const rdsResponse = await rdsClient.send(new DescribeDBInstancesCommand({}));

    for (const db of rdsResponse.DBInstances || []) {
      resources.push({
        resourceId: db.DBInstanceIdentifier || '',
        resourceType: 'rds:instance',
        name: db.DBInstanceIdentifier || 'Unnamed Database',
        region: awsCreds.region || 'us-east-1',
        status: db.DBInstanceStatus || 'unknown',
        metadata: {
          engine: db.Engine,
          engineVersion: db.EngineVersion,
          instanceClass: db.DBInstanceClass,
          allocatedStorage: db.AllocatedStorage,
          multiAz: db.MultiAZ,
          endpoint: db.Endpoint?.Address,
          port: db.Endpoint?.Port,
        },
      });
    }

    // Sync Lambda Functions
    const lambdaClient = new LambdaClient(clientConfig);
    const lambdaResponse = await lambdaClient.send(new ListFunctionsCommand({}));

    for (const fn of lambdaResponse.Functions || []) {
      resources.push({
        resourceId: fn.FunctionArn || '',
        resourceType: 'lambda:function',
        name: fn.FunctionName || 'Unnamed Function',
        region: awsCreds.region || 'us-east-1',
        status: fn.State || 'Active',
        metadata: {
          runtime: fn.Runtime,
          handler: fn.Handler,
          memorySize: fn.MemorySize,
          timeout: fn.Timeout,
          lastModified: fn.LastModified,
          codeSize: fn.CodeSize,
        },
      });
    }

    logger.info({ resourceCount: resources.length }, 'AWS resources synced successfully');
  } catch (error) {
    logger.error({ error }, 'Failed to sync AWS resources');
    throw error;
  }

  return resources;
}

async function syncAwsCosts(credentials: Record<string, unknown>): Promise<CloudCost[]> {
  const awsCreds = credentials as unknown as AwsCredentials;

  if (!awsCreds.accessKeyId || !awsCreds.secretAccessKey) {
    logger.warn('AWS credentials not configured, skipping cost sync');
    return [];
  }

  const costs: CloudCost[] = [];

  try {
    const costClient = new CostExplorerClient({
      region: 'us-east-1', // Cost Explorer is only available in us-east-1
      credentials: {
        accessKeyId: awsCreds.accessKeyId,
        secretAccessKey: awsCreds.secretAccessKey,
      },
    });

    // Get costs for the last 30 days
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);

    const costResponse = await costClient.send(new GetCostAndUsageCommand({
      TimePeriod: {
        Start: startDate.toISOString().split('T')[0],
        End: endDate.toISOString().split('T')[0],
      },
      Granularity: 'DAILY',
      Metrics: ['UnblendedCost'],
      GroupBy: [{ Type: 'DIMENSION', Key: 'SERVICE' }],
    }));

    for (const result of costResponse.ResultsByTime || []) {
      for (const group of result.Groups || []) {
        const serviceName = group.Keys?.[0] || 'Unknown Service';
        const amount = parseFloat(group.Metrics?.UnblendedCost?.Amount || '0');

        if (amount > 0) {
          costs.push({
            serviceName,
            cost: amount,
            currency: group.Metrics?.UnblendedCost?.Unit || 'USD',
            periodStart: new Date(result.TimePeriod?.Start || ''),
            periodEnd: new Date(result.TimePeriod?.End || ''),
          });
        }
      }
    }

    logger.info({ costEntries: costs.length }, 'AWS costs synced successfully');
  } catch (error) {
    logger.error({ error }, 'Failed to sync AWS costs');
    throw error;
  }

  return costs;
}

// ============================================
// AZURE SYNC IMPLEMENTATION (Placeholder with structure)
// ============================================

interface AzureCredentials {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  subscriptionId: string;
}

async function syncAzureResources(credentials: Record<string, unknown>): Promise<CloudResource[]> {
  const azureCreds = credentials as unknown as AzureCredentials;

  if (!azureCreds.tenantId || !azureCreds.clientId || !azureCreds.clientSecret) {
    logger.info('Azure credentials not configured, skipping resource sync');
    return [];
  }

  const resources: CloudResource[] = [];

  try {
    const credential = new ClientSecretCredential(
      azureCreds.tenantId,
      azureCreds.clientId,
      azureCreds.clientSecret
    );

    // Sync all Azure resources
    const resourceClient = new ResourceManagementClient(credential, azureCreds.subscriptionId);
    const resourceIterator = resourceClient.resources.list();

    for await (const resource of resourceIterator) {
      resources.push({
        resourceId: resource.id || '',
        resourceType: resource.type || 'unknown',
        name: resource.name || 'Unnamed Resource',
        region: resource.location || 'unknown',
        status: 'available',
        metadata: {
          kind: resource.kind,
          sku: resource.sku,
          plan: resource.plan,
          tags: resource.tags,
          managedBy: resource.managedBy,
        },
      });
    }

    // Sync VMs with detailed info
    const computeClient = new ComputeManagementClient(credential, azureCreds.subscriptionId);
    const vmIterator = computeClient.virtualMachines.listAll();

    for await (const vm of vmIterator) {
      // Find and update the existing VM resource with more details
      const existingIdx = resources.findIndex(r => r.resourceId === vm.id);
      const vmResource: CloudResource = {
        resourceId: vm.id || '',
        resourceType: 'Microsoft.Compute/virtualMachines',
        name: vm.name || 'Unnamed VM',
        region: vm.location || 'unknown',
        status: vm.provisioningState || 'unknown',
        metadata: {
          vmSize: vm.hardwareProfile?.vmSize,
          osType: vm.storageProfile?.osDisk?.osType,
          osDiskSize: vm.storageProfile?.osDisk?.diskSizeGB,
          imageReference: vm.storageProfile?.imageReference,
          networkInterfaces: vm.networkProfile?.networkInterfaces?.map(nic => nic.id),
          availabilitySet: vm.availabilitySet?.id,
          zones: vm.zones,
          tags: vm.tags,
        },
      };

      if (existingIdx >= 0) {
        resources[existingIdx] = vmResource;
      } else {
        resources.push(vmResource);
      }
    }

    logger.info({ resourceCount: resources.length }, 'Azure resources synced successfully');
  } catch (error) {
    logger.error({ error }, 'Failed to sync Azure resources');
    throw error;
  }

  return resources;
}

async function syncAzureCosts(credentials: Record<string, unknown>): Promise<CloudCost[]> {
  const azureCreds = credentials as unknown as AzureCredentials;

  if (!azureCreds.tenantId || !azureCreds.clientId || !azureCreds.clientSecret) {
    logger.info('Azure credentials not configured, skipping cost sync');
    return [];
  }

  const costs: CloudCost[] = [];

  try {
    const credential = new ClientSecretCredential(
      azureCreds.tenantId,
      azureCreds.clientId,
      azureCreds.clientSecret
    );

    const costClient = new CostManagementClient(credential);
    const scope = `/subscriptions/${azureCreds.subscriptionId}`;

    // Get costs for the last 30 days
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);

    const queryResult = await costClient.query.usage(scope, {
      type: 'ActualCost',
      timeframe: 'Custom',
      timePeriod: {
        from: startDate,
        to: endDate,
      },
      dataset: {
        granularity: 'Daily',
        aggregation: {
          totalCost: {
            name: 'Cost',
            function: 'Sum',
          },
        },
        grouping: [
          {
            type: 'Dimension',
            name: 'ServiceName',
          },
        ],
      },
    });

    // Parse the query result
    if (queryResult.rows) {
      for (const row of queryResult.rows) {
        // Row format: [cost, date, serviceName]
        const cost = parseFloat(String(row[0])) || 0;
        const dateStr = String(row[1]);
        const serviceName = String(row[2]) || 'Unknown Service';

        if (cost > 0) {
          const periodDate = new Date(dateStr);
          const periodEnd = new Date(periodDate);
          periodEnd.setDate(periodEnd.getDate() + 1);

          costs.push({
            serviceName,
            cost,
            currency: 'USD',
            periodStart: periodDate,
            periodEnd,
          });
        }
      }
    }

    logger.info({ costEntries: costs.length }, 'Azure costs synced successfully');
  } catch (error) {
    logger.error({ error }, 'Failed to sync Azure costs');
    throw error;
  }

  return costs;
}

// ============================================
// GCP SYNC IMPLEMENTATION (Placeholder with structure)
// ============================================

interface GcpCredentials {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

async function syncGcpResources(credentials: Record<string, unknown>): Promise<CloudResource[]> {
  const gcpCreds = credentials as unknown as GcpCredentials;

  if (!gcpCreds.projectId || !gcpCreds.clientEmail || !gcpCreds.privateKey) {
    logger.info('GCP credentials not configured, skipping resource sync');
    return [];
  }

  const resources: CloudResource[] = [];

  try {
    const authOptions = {
      projectId: gcpCreds.projectId,
      credentials: {
        client_email: gcpCreds.clientEmail,
        private_key: gcpCreds.privateKey.replace(/\\n/g, '\n'),
      },
    };

    // Sync Compute Engine instances
    const instancesClient = new InstancesClient(authOptions);
    const aggListRequest = instancesClient.aggregatedListAsync({
      project: gcpCreds.projectId,
    });

    for await (const [zone, instancesObject] of aggListRequest) {
      const instances = instancesObject.instances || [];
      for (const instance of instances) {
        resources.push({
          resourceId: String(instance.id) || '',
          resourceType: 'compute:instance',
          name: instance.name || 'Unnamed Instance',
          region: zone.replace(/^zones\//, ''),
          status: instance.status || 'UNKNOWN',
          metadata: {
            machineType: instance.machineType?.split('/').pop(),
            zone: zone,
            networkInterfaces: instance.networkInterfaces?.map(ni => ({
              network: ni.network?.split('/').pop(),
              internalIp: ni.networkIP,
              externalIp: ni.accessConfigs?.[0]?.natIP,
            })),
            disks: instance.disks?.map(d => ({
              name: d.source?.split('/').pop(),
              sizeGb: d.diskSizeGb,
              type: d.type,
            })),
            labels: instance.labels,
            creationTimestamp: instance.creationTimestamp,
          },
        });
      }
    }

    // Sync Persistent Disks
    const disksClient = new DisksClient(authOptions);
    const diskAggListRequest = disksClient.aggregatedListAsync({
      project: gcpCreds.projectId,
    });

    for await (const [zone, disksObject] of diskAggListRequest) {
      const disks = disksObject.disks || [];
      for (const disk of disks) {
        resources.push({
          resourceId: String(disk.id) || '',
          resourceType: 'compute:disk',
          name: disk.name || 'Unnamed Disk',
          region: zone.replace(/^zones\//, ''),
          status: disk.status || 'UNKNOWN',
          metadata: {
            sizeGb: disk.sizeGb,
            type: disk.type?.split('/').pop(),
            sourceImage: disk.sourceImage?.split('/').pop(),
            users: disk.users?.map(u => u.split('/').pop()),
            labels: disk.labels,
            creationTimestamp: disk.creationTimestamp,
          },
        });
      }
    }

    logger.info({ resourceCount: resources.length }, 'GCP resources synced successfully');
  } catch (error) {
    logger.error({ error }, 'Failed to sync GCP resources');
    throw error;
  }

  return resources;
}

interface GcpCredentialsExtended extends GcpCredentials {
  billingAccountId?: string;
  billingDataset?: string;
  billingTable?: string;
}

async function syncGcpCosts(credentials: Record<string, unknown>): Promise<CloudCost[]> {
  const gcpCreds = credentials as unknown as GcpCredentialsExtended;

  if (!gcpCreds.projectId || !gcpCreds.clientEmail || !gcpCreds.privateKey) {
    logger.info('GCP credentials not configured, skipping cost sync');
    return [];
  }

  // GCP costs require BigQuery billing export to be configured
  // If billing dataset info is not provided, we can't query costs
  if (!gcpCreds.billingDataset || !gcpCreds.billingTable) {
    logger.info({
      projectId: gcpCreds.projectId,
    }, 'GCP billing dataset not configured. To enable cost sync, export billing to BigQuery and provide billingDataset and billingTable in credentials.');
    return [];
  }

  const costs: CloudCost[] = [];

  try {
    // Dynamic import for BigQuery to avoid requiring it when not used
    const { BigQuery } = await import('@google-cloud/bigquery');

    const bigquery = new BigQuery({
      projectId: gcpCreds.projectId,
      credentials: {
        client_email: gcpCreds.clientEmail,
        private_key: gcpCreds.privateKey.replace(/\\n/g, '\n'),
      },
    });

    // Get costs for the last 30 days
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);

    const query = `
      SELECT
        DATE(usage_start_time) as usage_date,
        service.description as service_name,
        SUM(cost) as total_cost,
        currency
      FROM \`${gcpCreds.projectId}.${gcpCreds.billingDataset}.${gcpCreds.billingTable}\`
      WHERE DATE(usage_start_time) >= DATE('${startDate.toISOString().split('T')[0]}')
        AND DATE(usage_start_time) < DATE('${endDate.toISOString().split('T')[0]}')
      GROUP BY usage_date, service_name, currency
      HAVING total_cost > 0
      ORDER BY usage_date DESC, total_cost DESC
    `;

    const [rows] = await bigquery.query({ query });

    for (const row of rows) {
      const periodDate = new Date(row.usage_date.value);
      const periodEnd = new Date(periodDate);
      periodEnd.setDate(periodEnd.getDate() + 1);

      costs.push({
        serviceName: row.service_name || 'Unknown Service',
        cost: parseFloat(row.total_cost) || 0,
        currency: row.currency || 'USD',
        periodStart: periodDate,
        periodEnd,
      });
    }

    logger.info({ costEntries: costs.length }, 'GCP costs synced successfully');
  } catch (error) {
    // Check if it's a "module not found" error for BigQuery
    if (error instanceof Error && error.message.includes('Cannot find module')) {
      logger.info('GCP cost sync requires @google-cloud/bigquery package. Install with: npm install @google-cloud/bigquery');
      return [];
    }
    logger.error({ error }, 'Failed to sync GCP costs');
    throw error;
  }

  return costs;
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

// Encryption algorithm for cloud credentials
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const _AUTH_TAG_LENGTH = 16; // Used for documentation - auth tag is extracted from ciphertext

function getEncryptionKey(): Buffer | null {
  const key = config.encryption?.key;
  if (!key) {
    return null;
  }
  // Key should be 32 bytes for AES-256
  return crypto.createHash('sha256').update(key).digest();
}

function encryptCredentials(credentials: Record<string, unknown>): string {
  const key = getEncryptionKey();
  if (!key) {
    // Development mode: store as plain JSON (not secure)
    logger.warn('ENCRYPTION_KEY not set - storing credentials as plain JSON (NOT SECURE)');
    return JSON.stringify(credentials);
  }

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const plaintext = JSON.stringify(credentials);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Format: iv:authTag:encrypted (all base64)
  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
}

async function decryptCredentials(encrypted: string): Promise<Record<string, unknown>> {
  const key = getEncryptionKey();

  // Check if this is encrypted format (contains colons)
  if (!encrypted.includes(':')) {
    // Legacy format: plain JSON (development mode)
    try {
      return JSON.parse(encrypted);
    } catch {
      logger.error('Failed to parse credentials as JSON');
      throw new Error('Invalid credentials format');
    }
  }

  if (!key) {
    logger.error('ENCRYPTION_KEY not set but credentials appear to be encrypted');
    throw new Error('ENCRYPTION_KEY environment variable is required for encrypted credentials');
  }

  try {
    const parts = encrypted.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted credential format');
    }

    const iv = Buffer.from(parts[0], 'base64');
    const authTag = Buffer.from(parts[1], 'base64');
    const encryptedData = Buffer.from(parts[2], 'base64');

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(encryptedData), decipher.final()]);
    return JSON.parse(decrypted.toString('utf8'));
  } catch (error) {
    logger.error({ error }, 'Failed to decrypt credentials');
    throw new Error('Failed to decrypt cloud credentials');
  }
}

// Export for use by cloud service
export { encryptCredentials, decryptCredentials };

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

  logger.info({ jobId: job.id, accountId, syncType, attemptNumber: job.attemptsMade }, 'Syncing cloud account');

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

      try {
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
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        result.errors.push(`Resource sync failed: ${errMsg}`);
        logger.error({ err: error, accountId, provider: account.provider }, 'Resource sync error');
        // Don't throw - allow cost sync to proceed
      }
    }

    // Sync costs
    if (syncType === 'costs' || syncType === 'all') {
      let costs: CloudCost[] = [];

      try {
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
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        result.errors.push(`Cost sync failed: ${errMsg}`);
        logger.error({ err: error, accountId, provider: account.provider }, 'Cost sync error');
        // Don't throw - mark partial success
      }
    }

    await markSyncComplete(schema, accountId);

    logger.info(
      { jobId: job.id, accountId, resourcesUpdated: result.resourcesUpdated, costsUpdated: result.costsUpdated, errorCount: result.errors.length },
      'Cloud account sync completed'
    );

    // If both resource and cost sync failed, throw to trigger retry
    if (result.resourcesUpdated === 0 && result.costsUpdated === 0 && result.errors.length > 0) {
      throw new Error(`Complete sync failure: ${result.errors.join('; ')}`);
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    result.errors.push(errMsg);
    await markSyncFailed(schema, accountId, errMsg);
    logger.error({ err: error, accountId }, 'Cloud account sync failed');
    throw error; // Re-throw to trigger BullMQ retry
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
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000, // Start with 5 seconds for external API calls
        },
        removeOnComplete: { count: 50 },
        removeOnFail: { count: 200 },
      }
    );
    queuedCount++;
  }

  logger.info({ count: queuedCount }, 'Scheduled cloud sync jobs');

  return queuedCount;
}
