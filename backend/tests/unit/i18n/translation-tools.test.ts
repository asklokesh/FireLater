import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
// @ts-expect-error plain ESM script without type declarations
import * as tools from '../../../../scripts/i18n.mjs';

describe('translator export/import workflow', () => {
  it('real catalogs pass the consistency check', () => {
    expect(tools.check(tools.CATALOGS.backend)).toEqual([]);
    expect(tools.check(tools.CATALOGS.frontend)).toEqual([]);
  });

  it('round-trips CSV including commas, quotes and newlines', () => {
    const rows = [['key', 'en'], ['a.b', 'He said "hi", ok\nnext']];
    expect(tools.parseCsv(tools.toCsv(rows))).toEqual(rows);
  });

  it('exports every language and imports translator edits back', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-'));
    fs.writeFileSync(path.join(dir, 'en.json'), JSON.stringify({ a: { b: 'Hello {name}' }, c: 'Bye' }));
    fs.writeFileSync(path.join(dir, 'fr.json'), JSON.stringify({ a: { b: 'Bonjour {name}' } }));
    const csv = tools.exportCsv(dir) as string;
    expect(csv.split('\n')[0]).toBe('key,en,fr');
    const edited = csv.replace('Bonjour {name}', 'Salut {name}').replace('c,Bye,', 'c,Bye,Au revoir');
    tools.importCsv(dir, edited);
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'fr.json'), 'utf8'))).toEqual({ a: { b: 'Salut {name}' }, c: 'Au revoir' });
    fs.writeFileSync(path.join(dir, 'de.json'), JSON.stringify({ a: { b: 'Hallo' } }));
    expect(tools.check(dir)).toEqual(['de: placeholder mismatch in a.b', 'de: missing c']);
  });
});
