// Usage: npx tsx scripts/i18n-export.ts <frontend|backend> [out.csv]
// Thin wrapper over `node scripts/i18n.mjs export`.
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const script = path.resolve(__dirname, 'i18n.mjs');
const result = spawnSync('node', [script, 'export', ...process.argv.slice(2)], { stdio: 'inherit' });
process.exit(result.status ?? 1);
