#!/usr/bin/env tsx
/**
 * Credential Rotation Script
 * Migrates plaintext integration credentials to encrypted format
 *
 * Usage:
 *   tsx scripts/rotate-credentials.ts --tenant yourslug --dry-run
 *   tsx scripts/rotate-credentials.ts --tenant yourslug
 *   tsx scripts/rotate-credentials.ts --all-tenants
 *   tsx scripts/rotate-credentials.ts --tenant yourslug --integration <id>
 */

import { pool } from '../src/config/database.js';
import { encrypt } from '../src/utils/encryption.js';
import { logger } from '../src/utils/logger.js';

interface Options {
  tenant?: string;
  allTenants?: boolean;
  integrationId?: string;
  dryRun?: boolean;
}

interface Integration {
  id: string;
  name: string;
  type: string;
  credentials: string;
}

async function rotateCredentials(options: Options): Promise<void> {
  console.log('🔄 Credential Rotation Tool v1.0');
  console.log('━'.repeat(40));
  console.log('');

  // Validate encryption key
  if (!process.env.ENCRYPTION_KEY) {
    console.error('❌ ENCRYPTION_KEY not set in environment');
    console.error('   Please set ENCRYPTION_KEY before running this script');
    process.exit(1);
  }

  console.log('Configuration:');
  console.log(`  Tenant: ${options.tenant || 'ALL'}`);
  console.log(`  Mode: ${options.dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log(`  ENCRYPTION_KEY: Set ✓`);
  if (options.integrationId) {
    console.log(`  Integration: ${options.integrationId}`);
  }
  console.log('');

  if (options.dryRun) {
    console.log('⚠️  DRY RUN MODE - No changes will be made');
    console.log('');
  }

  // Get tenants to process
  const tenants = options.allTenants
    ? await getAllTenants()
    : [options.tenant];

  let totalProcessed = 0;
  let totalAlreadyEncrypted = 0;
  let totalEncrypted = 0;
  let totalErrors = 0;

  for (const tenant of tenants) {
    if (!tenant) continue;

    console.log(`📦 Processing tenant: ${tenant}`);
    console.log('');

    const schema = `tenant_${tenant.replace(/-/g, '_')}`;

    try {
      // Check if schema exists
      const schemaCheck = await pool.query(
        `SELECT schema_name FROM information_schema.schemata WHERE schema_name = $1`,
        [schema]
      );

      if (schemaCheck.rows.length === 0) {
        console.log(`  ⚠️  Schema ${schema} not found - skipping`);
        console.log('');
        continue;
      }

      // Get integrations
      const query = options.integrationId
        ? `SELECT id, name, type, credentials FROM ${schema}.integrations WHERE id = $1 AND credentials IS NOT NULL`
        : `SELECT id, name, type, credentials FROM ${schema}.integrations WHERE credentials IS NOT NULL`;

      const params = options.integrationId ? [options.integrationId] : [];
      const result = await pool.query<Integration>(query, params);

      if (result.rows.length === 0) {
        console.log(`  ℹ️  No integrations found`);
        console.log('');
        continue;
      }

      console.log(`  Found ${result.rows.length} integration(s) with credentials`);
      console.log('');

      for (const integration of result.rows) {
        totalProcessed++;

        try {
          // Check if already encrypted (format: iv:authTag:ciphertext)
          const isEncrypted = integration.credentials.includes(':') &&
                            integration.credentials.split(':').length === 3 &&
                            /^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/i.test(integration.credentials);

          if (isEncrypted) {
            console.log(`  ✓ ${integration.name} (${integration.type})`);
            console.log(`    ID: ${integration.id}`);
            console.log(`    Status: Already encrypted - skipping`);
            console.log('');
            totalAlreadyEncrypted++;
            continue;
          }

          console.log(`  🔐 ${integration.name} (${integration.type})`);
          console.log(`    ID: ${integration.id}`);
          console.log(`    Status: Plaintext credentials detected`);

          // Re-encrypt credentials
          const encrypted = encrypt(integration.credentials);

          if (!options.dryRun) {
            await pool.query(
              `UPDATE ${schema}.integrations SET credentials = $1, updated_at = NOW() WHERE id = $2`,
              [encrypted, integration.id]
            );
            console.log(`    ✓ Encrypted successfully`);
            logger.info({ integrationId: integration.id, tenant }, 'Credentials encrypted');
          } else {
            console.log(`    → Would encrypt (dry run)`);
          }

          totalEncrypted++;
          console.log('');

        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.error(`  ❌ ${integration.name} (${integration.type})`);
          console.error(`    ID: ${integration.id}`);
          console.error(`    Error: ${errorMessage}`);
          console.log('');
          logger.error(
            { integrationId: integration.id, tenant, error: errorMessage },
            'Credential rotation failed'
          );
          totalErrors++;
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`  ❌ Error processing tenant ${tenant}: ${errorMessage}`);
      console.log('');
      logger.error({ tenant, error: errorMessage }, 'Tenant processing failed');
      totalErrors++;
    }
  }

  console.log('');
  console.log('📊 Summary');
  console.log('━'.repeat(40));
  console.log(`  Total integrations processed: ${totalProcessed}`);
  console.log(`  Already encrypted: ${totalAlreadyEncrypted}`);
  console.log(`  Newly encrypted: ${totalEncrypted}`);
  console.log(`  Errors: ${totalErrors}`);
  console.log('');

  if (options.dryRun) {
    console.log('✅ DRY RUN COMPLETE - No changes made');
    console.log('   Run without --dry-run to apply changes');
  } else {
    if (totalErrors === 0) {
      console.log('✅ Rotation complete - All credentials encrypted successfully');
    } else {
      console.log(`⚠️  Rotation complete with ${totalErrors} error(s)`);
      console.log('   Please review the errors above and retry failed integrations');
    }
  }
  console.log('');
}

async function getAllTenants(): Promise<string[]> {
  try {
    const result = await pool.query('SELECT slug FROM public.tenants WHERE status = $1', ['active']);
    return result.rows.map((r: { slug: string }) => r.slug);
  } catch (error) {
    console.error('Error fetching tenants:', error);
    return [];
  }
}

// Parse command line arguments
const args = process.argv.slice(2);

if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
  console.log('Credential Rotation Tool');
  console.log('');
  console.log('Usage:');
  console.log('  tsx scripts/rotate-credentials.ts --tenant <slug> [options]');
  console.log('  tsx scripts/rotate-credentials.ts --all-tenants [options]');
  console.log('');
  console.log('Options:');
  console.log('  --tenant <slug>         Process specific tenant');
  console.log('  --all-tenants           Process all active tenants');
  console.log('  --integration <id>      Process specific integration only');
  console.log('  --dry-run               Preview changes without applying them');
  console.log('  --help, -h              Show this help message');
  console.log('');
  console.log('Examples:');
  console.log('  tsx scripts/rotate-credentials.ts --tenant acme --dry-run');
  console.log('  tsx scripts/rotate-credentials.ts --tenant acme');
  console.log('  tsx scripts/rotate-credentials.ts --all-tenants');
  console.log('  tsx scripts/rotate-credentials.ts --tenant acme --integration abc123');
  console.log('');
  process.exit(0);
}

const options: Options = {
  dryRun: args.includes('--dry-run'),
  allTenants: args.includes('--all-tenants'),
};

const tenantIndex = args.indexOf('--tenant');
if (tenantIndex !== -1 && args[tenantIndex + 1]) {
  options.tenant = args[tenantIndex + 1];
}

const integrationIndex = args.indexOf('--integration');
if (integrationIndex !== -1 && args[integrationIndex + 1]) {
  options.integrationId = args[integrationIndex + 1];
}

// Validate
if (!options.tenant && !options.allTenants) {
  console.error('❌ Error: Must specify --tenant <slug> or --all-tenants');
  console.error('   Use --help for usage information');
  process.exit(1);
}

// Run rotation
rotateCredentials(options)
  .then(() => {
    pool.end();
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Fatal error:', error);
    logger.error({ error }, 'Credential rotation fatal error');
    pool.end();
    process.exit(1);
  });
