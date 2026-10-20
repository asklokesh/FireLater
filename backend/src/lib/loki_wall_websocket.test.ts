import { test, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative, extname } from 'path';

const REPO_ROOT = join(__dirname, '..', '..', '..');
const SKIP = new Set(['node_modules', '.git', 'dist', 'build', 'playwright-report', 'coverage']);
const NEWLINE = String.fromCharCode(10);

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (SKIP.has(name)) continue;
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const ALL_FILES = walk(REPO_ROOT);

function isOwnFile(f: string): boolean {
  return /loki_wall_/.test(f);
}

function codeFiles(pathRe: RegExp): string[] {
  return ALL_FILES.filter(
    (f) =>
      !isOwnFile(f) &&
      ['.ts', '.tsx', '.js', '.jsx', '.mjs'].includes(extname(f)) &&
      pathRe.test(relative(REPO_ROOT, f).replace(/\\/g, '/'))
  );
}

function sourceOf(files: string[]): string {
  return files.map((f) => readFileSync(f, 'utf8')).join(NEWLINE);
}

function backendSource(): string {
  return sourceOf(codeFiles(/^backend\/src\/(?!.*\.test\.).*/));
}

function realtimeSource(): string {
  return sourceOf(codeFiles(/^backend\/src\/.*(websocket|realtime|real-time|presence|ws)[^/]*\.(ts|js)$/i));
}

function frontendHookSource(): string {
  return sourceOf(
    codeFiles(/^(?!backend\/).*use[A-Z][A-Za-z0-9]*\.(ts|tsx|js|jsx)$/)
  );
}

test('AC1: Fastify WebSocket plugin is a dependency and registers websocket routes', () => {
  const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'backend', 'package.json'), 'utf8'));
  const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  expect(deps['@fastify/websocket'] ?? deps['fastify-websocket']).toBeDefined();
  const src = backendSource();
  expect(src).toMatch(/register\(\s*[A-Za-z_$][\w$]*/);
  expect(src).toMatch(/websocket:\s*true/);
  expect(src).not.toMatch(/socket\.io/i);
});

test('AC2: subscription and message protocol handles subscribe, unsubscribe and entity change messages', () => {
  const src = realtimeSource();
  expect(src).toMatch(/subscribe/i);
  expect(src).toMatch(/unsubscribe/i);
  expect(src).toMatch(/entity/i);
  expect(src).toMatch(/JSON\.parse/);
  expect(src).toMatch(/invalid|malformed|unknown|unsupported/i);
});

test('AC3: entity changes propagate across instances through Redis Pub/Sub', () => {
  const src = realtimeSource();
  expect(src).toMatch(/redis/i);
  expect(src).toMatch(/\.publish\(/);
  expect(src).toMatch(/\.subscribe\(|\.psubscribe\(/);
  expect(src).toMatch(/tenant/i);
});

test('AC4: presence tracking records joins and leaves and detects collisions', () => {
  const src = realtimeSource();
  expect(src).toMatch(/presence/i);
  expect(src).toMatch(/join|leave|heartbeat/i);
  expect(src).toMatch(/collision|conflict/i);
});

test('AC5: React hooks consume the WebSocket feed and clean up on unmount', () => {
  const src = frontendHookSource();
  expect(src).toMatch(/WebSocket|websocket/);
  expect(src).toMatch(/export\s+(function|const)\s+use[A-Z]/);
  expect(src).toMatch(/useEffect/);
  expect(src).toMatch(/\.close\(\)/);
});

test('AC6: reconnection uses backoff and falls back to polling when the socket is unavailable', () => {
  const src = [realtimeSource(), frontendHookSource()].join(NEWLINE);
  expect(src).toMatch(/reconnect/i);
  expect(src).toMatch(/backoff|setTimeout/i);
  expect(src).toMatch(/polling|fallback/i);
  expect(src).toMatch(/onclose|on\('close'|onClose/);
});

test('AC7: real-time scenarios have their own test coverage', () => {
  const testFiles = ALL_FILES.filter(
    (f) =>
      !isOwnFile(f) &&
      /\.(test|spec)\.(ts|tsx|js|jsx)$/.test(f) &&
      /websocket|realtime|real-time|presence/i.test(relative(REPO_ROOT, f))
  );
  expect(testFiles.length).toBeGreaterThan(0);
  const body = sourceOf(testFiles);
  expect(body).toMatch(/subscribe|presence|publish|reconnect/i);
  expect(body).not.toMatch(/^\s*$/);
});

test('AC8: WebSocket API and client usage are documented', () => {
  const docs = ALL_FILES.filter(
    (f) => !isOwnFile(f) && extname(f) === '.md' && /websocket|realtime|real-time/i.test(relative(REPO_ROOT, f))
  );
  expect(docs.length).toBeGreaterThan(0);
  const body = sourceOf(docs);
  expect(body.length).toBeGreaterThan(500);
  expect(body).toMatch(/subscribe/i);
  expect(body).toMatch(/ws:\/\/|wss:\/\/|\/ws/);
});
