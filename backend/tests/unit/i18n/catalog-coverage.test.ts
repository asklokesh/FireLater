import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { localizeErrorMessage } from '../../../src/lib/i18n';

const SRC = path.resolve(__dirname, '../../../src');

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === '__tests__' || e.name === 'locales' ? [] : walk(p);
    return p.endsWith('.ts') ? [p] : [];
  });
}

// String literal (or template literal) passed as the message to the user-facing error classes
const CLASSES = 'BadRequestError|ConflictError|ForbiddenError|UnauthorizedError';
const RE_STATIC = new RegExp(`new (?:${CLASSES})\\(\\s*'((?:[^'\\\\]|\\\\.)+)'\\s*[,)]`, 'g');
const RE_TEMPLATE = new RegExp(`new (?:${CLASSES})\\(\\s*\`((?:[^\`\\\\]|\\\\.)*)\`\\s*[,)]`, 'g');

function collect() {
  const statics = new Set<string>();
  const templates = new Set<string>();
  for (const file of walk(SRC)) {
    const text = fs.readFileSync(file, 'utf8');
    for (const m of text.matchAll(RE_STATIC)) statics.add(m[1].replace(/\\'/g, "'"));
    for (const m of text.matchAll(RE_TEMPLATE)) if (m[1].includes('${')) templates.add(m[1]);
  }
  return { statics, templates };
}

const untranslated = (m: string) => localizeErrorMessage('de', { statusCode: 400, message: m }) === m;

describe('error messages are covered by the translation catalog', () => {
  const { statics, templates } = collect();

  it('finds the messages to check', () => {
    expect(statics.size).toBeGreaterThan(60);
    expect(templates.size).toBeGreaterThan(40);
  });

  it('translates every static message (no silent English)', () => {
    expect([...statics].filter(untranslated).sort()).toEqual([]);
  });

  it('translates interpolated messages, except a recorded list that may only shrink', () => {
    // Replace ${expr} with a sample value; the template regexes in errors.msg capture it.
    const uncovered = [...templates]
      .filter((t) => untranslated(t.replace(/\$\{[^}]*\}/g, 'X')))
      .sort();
    const file = path.join(__dirname, 'uncovered-templates.json');
    // UPDATE_UNCOVERED=1 rewrites the recorded list (only use it when messages were translated)
    if (process.env.UPDATE_UNCOVERED) fs.writeFileSync(file, JSON.stringify(uncovered, null, 2) + '\n');
    const recorded: string[] = JSON.parse(fs.readFileSync(file, 'utf8'));
    // New untranslated messages fail the build; when one gets translated, remove it from the JSON file.
    expect(uncovered).toEqual(recorded);
  });
});

describe('localizeErrorMessage fallbacks', () => {
  it('translates default auth/permission messages even for unknown status wording', () => {
    expect(localizeErrorMessage('es', { statusCode: 401, message: 'Unauthorized' })).toBe('Se requiere autenticación');
    expect(localizeErrorMessage('es', { statusCode: 403, message: 'Forbidden' })).toBe('No tienes permiso para realizar esta acción');
  });
  it('keeps specific, unmapped messages as written instead of guessing', () => {
    expect(localizeErrorMessage('es', { statusCode: 401, message: 'Session revoked by an administrator' })).toBe('Session revoked by an administrator');
  });
  it('always translates a message that carries a messageKey, even if reworded', () => {
    expect(localizeErrorMessage('fr', { statusCode: 409, message: 'any reworded text', messageKey: 'errors.msg.noFileUploaded' })).toBe('Aucun fichier téléversé');
  });
  it('translates rate limiting by status', () => {
    expect(localizeErrorMessage('de', { statusCode: 429, message: 'Rate limit exceeded' })).toBe('Zu viele Anfragen. Bitte versuchen Sie es später erneut.');
  });
});

import { UnauthorizedError, BadRequestError, ConflictError, ForbiddenError } from '../../../src/utils/errors';

describe('error classes carry an optional messageKey', () => {
  it('stores it on every user-facing error class', () => {
    expect(new UnauthorizedError('x', 'errors.unauthorized').messageKey).toBe('errors.unauthorized');
    expect(new ForbiddenError('x', 'errors.forbidden').messageKey).toBe('errors.forbidden');
    expect(new BadRequestError('x', 'errors.msg.noFileUploaded').messageKey).toBe('errors.msg.noFileUploaded');
    expect(new ConflictError('x', 'errors.msg.userAlreadyExists').messageKey).toBe('errors.msg.userAlreadyExists');
    expect(new BadRequestError('x').messageKey).toBeUndefined();
  });
});
