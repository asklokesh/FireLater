import { test, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '..', '..', '..');

function walk(dir: string, out: string[] = []): string[] {
  let names: string[] = [];
  try { names = readdirSync(dir); } catch { return out; }
  for (const n of names) {
    if (n === 'node_modules' || n === '.git' || n === 'dist' || n.startsWith('loki_wall_')) continue;
    const p = join(dir, n);
    let s;
    try { s = statSync(p); } catch { continue; }
    if (s.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const all = walk(root);
const read = (p: string) => readFileSync(p, 'utf8');
const isTest = (p: string) => /\.(test|spec)\.[tj]sx?$/.test(p);
const src = all.filter((p) => /\.(ts|tsx|js)$/.test(p) && !isTest(p) && !/playwright/.test(p));
const backend = src.filter((p) => p.includes(join('backend', 'src')));
const wsRe = /websocket|\bws\b/i;
const wsBackend = backend.filter((p) => wsRe.test(p) || /@fastify\/websocket|new WebSocketServer|\{ websocket: true \}/.test(read(p)));
const wsText = wsBackend.map(read).join('\n');

test('websocket server with Fastify plugin', () => {
  const pkg = JSON.parse(read(join(root, 'backend', 'package.json')));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  expect(Object.keys(deps).some((d) => /websocket|^ws$/.test(d))).toBe(true);
  expect(wsBackend.length).toBeGreaterThan(0);
  expect(wsText).toMatch(/register\(|websocket/i);
  expect(Object.keys(deps)).not.toContain('definitely-not-a-ws-lib');
});

test('subscription and message protocol', () => {
  expect(wsText).toMatch(/subscribe/i);
  expect(wsText).toMatch(/unsubscribe/i);
  expect(wsText).toMatch(/JSON\.parse/);
  expect(wsText).toMatch(/tenant/i);
  expect(wsText).toMatch(/catch|invalid|error/i);
});

test('redis pub/sub propagation', () => {
  expect(wsText).toMatch(/publish/);
  expect(wsText).toMatch(/subscribe\(/);
  expect(wsText).toMatch(/redis/i);
  expect(wsText).toMatch(/on\(\s*['"]message['"]/);
});

test('presence tracking and collision detection', () => {
  expect(wsText).toMatch(/presence/i);
  expect(wsText).toMatch(/editing|collision|conflict|version/i);
  expect(wsText).toMatch(/disconnect|close|leave|remove|delete/i);
});

test('react hooks consuming websocket data', () => {
  const hooks = all.filter((p) => /\.(tsx?|jsx?)$/.test(p) && !isTest(p) && !p.includes('node_modules') && /use[A-Z]\w*(Socket|Realtime|RealTime|Live)/.test(read(p)));
  expect(hooks.length).toBeGreaterThan(0);
  const text = hooks.map(read).join('\n');
  expect(text).toMatch(/export (default )?function use|export const use/);
  expect(text).toMatch(/useEffect/);
  expect(text).toMatch(/new WebSocket|WebSocket\(/);
});

test('reconnection and polling fallback', () => {
  const client = all.filter((p) => /\.(tsx?|jsx?)$/.test(p) && !isTest(p) && /new WebSocket\(/.test(read(p)));
  expect(client.length).toBeGreaterThan(0);
  const text = client.map(read).join('\n');
  expect(text).toMatch(/reconnect/i);
  expect(text).toMatch(/backoff|attempt|retry|delay/i);
  expect(text).toMatch(/poll|setInterval|fallback/i);
  expect(text).toMatch(/onclose|addEventListener\(\s*['"]close/);
});

test('comprehensive realtime tests exist', () => {
  const tests = all.filter((p) => isTest(p) && /websocket|realtime|real-time|presence/i.test(p));
  expect(tests.length).toBeGreaterThan(0);
  const text = tests.map(read).join('\n');
  expect((text.match(/\b(it|test)\(/g) || []).length).toBeGreaterThanOrEqual(5);
  expect(text).toMatch(/expect\(/);
});

test('websocket api and client documentation', () => {
  const docs = all.filter((p) => /\.md$/i.test(p) && /websocket/i.test(read(p)) && /subscribe/i.test(read(p)));
  const nonChangelog = docs.filter((p) => !/CHANGELOG|PROGRESS|TODO|IMPLEMENTATION_PLAN/i.test(p));
  expect(nonChangelog.length).toBeGreaterThan(0);
  const text = nonChangelog.map(read).join('\n');
  expect(text).toMatch(/reconnect/i);
  expect(text).toMatch(/use[A-Z]\w+/);
});
