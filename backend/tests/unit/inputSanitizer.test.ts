import { describe, it, expect } from 'vitest';
import { sanitizeString as s, sanitizeInput, isDangerousUrl } from '../../src/utils/inputSanitizer.js';

describe('sanitizer keeps legitimate text', () => {
  it.each([
    'Set online = true and one = 2',
    'The button is on  = wrong place; onload = slow',
    'use javascript: URLs sparingly',
    'a < b and b > c, 1<2',
    "O'Brien; DROP TABLE x;--",
    'text <!-- never closed, but the tail stays',
  ])('leaves %j readable', (text) => {
    const out = s(text, 'description');
    expect(out.length).toBeGreaterThan(text.length - 10);
    expect(out).toContain(text.slice(-12));
  });
  it('keeps the text around an unterminated <style tag, escaping the tag opener', () => {
    expect(s('the <style tag is broken, steps: restart', 'description')).toBe('the &lt;style tag is broken, steps: restart');
  });
  it('keeps harmless markup and attributes', () => {
    expect(s('<b>ok</b> <a href="https://x.y" title="t">l</a>', 'description')).toBe('<b>ok</b> <a href="https://x.y" title="t">l</a>');
  });
  it('does not delete the rest of the text after an unterminated script tag', () => {
    expect(s('before <script src=x tail text', 'description')).toBe('before &lt;script src=x tail text');
  });
});

describe('sanitizer blocks XSS vectors', () => {
  it.each([
    ['<svg/onload=alert(1)>', 'onload'],
    ['<img src="x"onerror=alert(1)>', 'onerror'],
    ['<img src=x onerror=alert(1)>', 'onerror'],
    ['<body\tonpageshow=alert(1)>', 'onpageshow'],
    ['<a href="jav&#x61;script:alert(1)">x</a>', 'script:'],
    ['<a href="&#106;avascript&colon;alert(1)">x</a>', 'avascript'],
    ['<a href=" java\nscript:alert(1)">x</a>', 'script:'],
    ['<iframe srcdoc="<script>alert(1)</script>"></iframe>', '<'],
    ['<scr<script>ipt>alert(1)</scr</script>ipt>', '<script'],
    ['<script>alert(1)</script>', 'alert'],
    ['<style>*{x:y}</style>x', 'style'],
    ['<img src=x onerror=alert(1)', 'onerror'],
  ])('neutralises %j', (payload, needle) => {
    expect(s(payload, 'description').toLowerCase()).not.toContain(needle);
  });
  it('strips all tags in plain fields', () => {
    expect(s('  <b>Bob</b> ', 'name')).toBe('Bob');
    expect(s('<script>x</script>Bob', 'title')).toBe('Bob');
  });
  it('blanks script/file URLs in url fields', () => {
    expect(s('javascript:alert(1)', 'webhookUrl')).toBe('');
    expect(s('data:text/html,<b>x</b>', 'webhookUrl')).toBe('');
    expect(s('https://ok.example/x', 'webhookUrl')).toBe('https://ok.example/x');
    expect(isDangerousUrl(' JaVa&Tab;Script:1')).toBe(true);
  });
  it('never touches secrets and drops prototype-pollution keys', () => {
    expect(s('<p>x</p> on=1', 'password')).toBe('<p>x</p> on=1');
    const { value } = sanitizeInput(JSON.parse('{"__proto__":{"a":1},"ok":"x"}'));
    expect(value).toEqual({ ok: 'x' });
  });
});

describe('sanitizer runs in linear time on hostile input', () => {
  const timed = (fn: () => void) => { const t = Date.now(); fn(); return Date.now() - t; };
  it('handles floods of "<a", whitespace, attributes and nesting', () => {
    expect(timed(() => s('<a'.repeat(1_000_000), 'description'))).toBeLessThan(3000);
    expect(timed(() => s('a' + ' '.repeat(3_000_000) + 'on x', 'description'))).toBeLessThan(3000);
    expect(timed(() => s('<a ' + ' x'.repeat(1_000_000), 'description'))).toBeLessThan(3000);
    expect(timed(() => s('<s'.repeat(300_000) + '>', 'name'))).toBeLessThan(3000);
    expect(timed(() => s('<!--'.repeat(500_000), 'description'))).toBeLessThan(3000);
  });
});
