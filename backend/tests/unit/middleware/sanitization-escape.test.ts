import { describe, it, expect } from 'vitest';
import { escapeHtml, escapeHtmlDeep } from '../../../src/middleware/sanitization.js';

describe('escapeHtml', () => {
  it('escapes angle brackets, quotes, ampersands, and backticks', () => {
    expect(escapeHtml('<script>alert(1)</script>')).toBe(
      '&lt;script&gt;alert(1)&lt;/script&gt;'
    );
    expect(escapeHtml(`"'&\``)).toBe('&quot;&#39;&amp;&#96;');
  });

  it('preserves the underlying text content (no stripping)', () => {
    const payload = '<img src="x" onerror="alert(\'XSS\')">';
    const escaped = escapeHtml(payload);

    expect(escaped).not.toContain('<img');
    expect(escaped).toContain('img');
    expect(escaped).toContain('onerror');
  });

  it('trims whitespace', () => {
    expect(escapeHtml('  hello  ')).toBe('hello');
  });

  it('returns empty string for non-string input', () => {
    expect(escapeHtml(null as unknown as string)).toBe('');
    expect(escapeHtml(undefined as unknown as string)).toBe('');
    expect(escapeHtml(42 as unknown as string)).toBe('');
  });

  it('leaves safe text unchanged', () => {
    expect(escapeHtml('Hello World 123')).toBe('Hello World 123');
  });
});

describe('escapeHtmlDeep', () => {
  it('escapes nested string fields', () => {
    const input = {
      title: '<b>Title</b>',
      nested: { comment: "<script>alert('x')</script>" },
    };

    const result = escapeHtmlDeep(input);

    expect(result.title).toBe('&lt;b&gt;Title&lt;/b&gt;');
    expect(result.nested.comment).toBe('&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;');
  });

  it('escapes strings within arrays while preserving non-string items', () => {
    const input = { tags: ['<a>', 'safe', 42] };
    const result = escapeHtmlDeep(input);

    expect(result.tags[0]).toBe('&lt;a&gt;');
    expect(result.tags[1]).toBe('safe');
    expect(result.tags[2]).toBe(42);
  });

  it('preserves non-string primitive values', () => {
    const input = { count: 5, active: true, nothing: null };
    const result = escapeHtmlDeep(input);

    expect(result.count).toBe(5);
    expect(result.active).toBe(true);
    expect(result.nothing).toBeNull();
  });
});
