import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { schemaRegistry } from '../../../src/schemas/index.js';

/**
 * Route coverage: every route declared in src/routes/*.ts (with its prefix from src/index.ts) and every inline
 * route declared in src/index.ts must have an explicit entry in the schema registry.
 */
const SRC = join(__dirname, '../../../src');
const indexSrc = readFileSync(join(SRC, 'index.ts'), 'utf8');
const imports = Object.fromEntries(
  [...indexSrc.matchAll(/import (?:\{\s*)?(\w+)(?:\s*\})? from '\.\/routes\/([\w-]+)\.js'/g)].map((m) => [m[1], m[2]]),
);
const prefixes: Record<string, string> = {};
for (const m of indexSrc.matchAll(/register\((\w+), \{ prefix: '([^']+)' \}\)/g)) {
  if (imports[m[1]]) prefixes[imports[m[1]]] = m[2];
}
// Handles multi-line generics: app.get<{ ... }>(\n '/path'
const ROUTE_RE = /^\s{2,}(?:app|fastify)\.(get|post|put|patch|delete)(?:<[\s\S]*?>)?\(\s*(['"`])([^'"`]*)\2/gm;
const BULK_OPERATIONS = ['update', 'delete', 'status', 'assign'];

function key(method: string, path: string) {
  return `${method.toUpperCase()} ${path.replace(/^\/v1/, '').replace(/\/+$/, '') || '/'}`;
}

function declaredRoutes(): string[] {
  const keys: string[] = [];
  for (const file of readdirSync(join(SRC, 'routes')).filter((f) => f.endsWith('.ts'))) {
    const name = file.slice(0, -3);
    if (!prefixes[name]) continue;
    const src = readFileSync(join(SRC, 'routes', file), 'utf8');
    for (const m of src.matchAll(ROUTE_RE)) {
      const paths = m[3].includes('${operation}') ? BULK_OPERATIONS.map((op) => m[3].replace('${operation}', op)) : [m[3]];
      for (const p of paths) keys.push(key(m[1], prefixes[name] + (p === '/' ? '' : p)));
    }
  }
  for (const m of indexSrc.matchAll(/^ {2}app\.(get|post|put|patch|delete)\(\s*'([^']+)'/gm)) keys.push(key(m[1], m[2]));
  return keys;
}

describe('schema registry route coverage', () => {
  const routes = declaredRoutes();

  it('knows the prefix of every route module (so no module is silently skipped)', () => {
    const modules = readdirSync(join(SRC, 'routes')).filter((f) => f.endsWith('.ts')).map((f) => f.slice(0, -3));
    expect(modules.filter((m) => !prefixes[m])).toEqual([]);
  });

  it('finds the real routes', () => {
    expect(routes.length).toBeGreaterThan(450);
  });

  it('has a registry entry for every declared route (100% coverage)', () => {
    const missing = routes.filter((k) => !schemaRegistry[k]);
    expect(missing).toEqual([]);
  });

  it('has no registry entry for a route that does not exist', () => {
    const declared = new Set(routes);
    const orphans = Object.keys(schemaRegistry).filter((k) => !declared.has(k));
    expect(orphans).toEqual([]);
  });
});
