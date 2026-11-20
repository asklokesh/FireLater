// Usage: npx tsx scripts/i18n-import.ts <frontend|backend> <in.csv>
// Thin wrapper over `node scripts/i18n.mjs import`.
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const script = path.resolve(__dirname, 'i18n.mjs');
const result = spawnSync('node', [script, 'import', ...process.argv.slice(2)], { stdio: 'inherit' });
process.exit(result.status ?? 1);
