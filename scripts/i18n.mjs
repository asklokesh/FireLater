#!/usr/bin/env node
// Translator workflow helper (no dependencies).
//
//   node scripts/i18n.mjs export <frontend|backend> [out.csv]   one row per key, one column per language
//   node scripts/i18n.mjs import <frontend|backend> <in.csv>    write the columns back to the JSON catalogs
//   node scripts/i18n.mjs check  [frontend|backend]             report missing/extra keys vs English (exit 1 on problems)
//
// Catalogs: frontend -> frontend/messages/<lang>.json, backend -> backend/src/locales/<lang>.json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CATALOGS = {
  frontend: path.join(root, 'frontend', 'messages'),
  backend: path.join(root, 'backend', 'src', 'locales'),
};
const BASE = 'en';

export function flatten(obj, prefix = '') {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== null && typeof v === 'object') Object.assign(out, flatten(v, `${prefix}${k}.`));
    else out[`${prefix}${k}`] = v;
  }
  return out;
}

export function unflatten(flat) {
  const out = {};
  for (const [key, value] of Object.entries(flat)) {
    const parts = key.split('.');
    let cur = out;
    parts.slice(0, -1).forEach((p) => {
      cur[p] = typeof cur[p] === 'object' && cur[p] !== null ? cur[p] : {};
      cur = cur[p];
    });
    cur[parts[parts.length - 1]] = value;
  }
  return out;
}

export function toCsv(rows) {
  const esc = (s) => {
    const v = String(s ?? '');
    return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  };
  return rows.map((r) => r.map(esc).join(',')).join('\n') + '\n';
}

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some((f) => f !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) {
    row.push(field);
    if (row.some((f) => f !== '')) rows.push(row);
  }
  return rows;
}

export function loadCatalogs(dir) {
  const result = {};
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
    result[file.replace(/\.json$/, '')] = flatten(JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')));
  }
  return result;
}

export function exportCsv(dir) {
  const catalogs = loadCatalogs(dir);
  const langs = [BASE, ...Object.keys(catalogs).filter((l) => l !== BASE)];
  const keys = Object.keys(catalogs[BASE]);
  return toCsv([['key', ...langs], ...keys.map((k) => [k, ...langs.map((l) => catalogs[l]?.[k] ?? '')])]);
}

/** Write CSV columns back to <lang>.json. Empty cells are left out so runtime falls back to English. */
export function importCsv(dir, csvText) {
  const [header, ...rows] = parseCsv(csvText);
  if (!header || header[0] !== 'key') throw new Error('CSV must start with a "key" column');
  const langs = header.slice(1);
  const written = [];
  langs.forEach((lang, idx) => {
    if (!/^[a-z]{2,3}(-[A-Za-z0-9]+)?$/.test(lang)) throw new Error(`Invalid language column: ${lang}`);
    const flat = {};
    for (const r of rows) {
      const value = r[idx + 1];
      if (value !== undefined && value !== '') flat[r[0]] = value;
    }
    fs.writeFileSync(path.join(dir, `${lang}.json`), JSON.stringify(unflatten(flat), null, 2) + '\n');
    written.push(lang);
  });
  return written;
}

/** Compare every catalog with English. Placeholders like {url} must match as well. */
export function check(dir) {
  const catalogs = loadCatalogs(dir);
  const base = catalogs[BASE];
  const problems = [];
  const placeholders = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
  for (const [lang, flat] of Object.entries(catalogs)) {
    if (lang === BASE) continue;
    for (const k of Object.keys(base)) {
      if (!(k in flat)) problems.push(`${lang}: missing ${k}`);
      else if (placeholders(flat[k]) !== placeholders(base[k])) problems.push(`${lang}: placeholder mismatch in ${k}`);
    }
    for (const k of Object.keys(flat)) if (!(k in base)) problems.push(`${lang}: extra ${k}`);
  }
  return problems;
}

function main(argv) {
  const [cmd, target, file] = argv;
  const targets = target && CATALOGS[target] ? [target] : cmd === 'check' ? Object.keys(CATALOGS) : [];
  if (!['export', 'import', 'check'].includes(cmd) || targets.length === 0) {
    console.error('usage: i18n.mjs export <frontend|backend> [out.csv] | import <frontend|backend> <in.csv> | check [frontend|backend]');
    return 2;
  }
  if (cmd === 'export') {
    const csv = exportCsv(CATALOGS[target]);
    if (file) fs.writeFileSync(file, csv);
    else process.stdout.write(csv);
    return 0;
  }
  if (cmd === 'import') {
    if (!file) {
      console.error('import needs a CSV file');
      return 2;
    }
    const langs = importCsv(CATALOGS[target], fs.readFileSync(file, 'utf8'));
    console.log(`Imported ${langs.length} languages into ${target}: ${langs.join(', ')}`);
    return 0;
  }
  let failed = false;
  for (const t of targets) {
    const problems = check(CATALOGS[t]);
    problems.forEach((p) => console.error(`${t}: ${p}`));
    if (problems.length) failed = true;
    else console.log(`${t}: all catalogs match English`);
  }
  return failed ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
