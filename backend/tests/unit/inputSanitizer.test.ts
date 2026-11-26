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

describe('sanitizer ends a tag where a browser does (quoted attribute values)', () => {
  // A quoted value may hold '>' and '<'; ending the tag at the first '>' or splitting it at the
  // next '<' left the handler after it in a live tag (PR 76 review, D1).
  it.each([
    ['<img src=x title=">" onerror=alert(1)>', 'onerror'],
    ["<img src=x title='>' onerror=alert(1)>", 'onerror'],
    ['<a title="<" onclick=alert(1)>x</a>', 'onclick'],
    ["<a title='<' onclick=alert(1)>x</a>", 'onclick'],
    ['<a title="a" title2=\'>\' href="javascript:alert(1)">x</a>', 'javascript'],
    ['<img src=x alt="' + 'A'.repeat(5000) + '" onerror=alert(1)>', 'onerror'],
    ['<img<x src=x onmouseover=alert(1)>', 'onmouseover'],
    ['<script>x</script x=">"><img src=x onerror=alert(1)>', 'onerror'],
    // a quote or a leading '=' is an attribute-name character, so the quoted value after it hides nothing
    ['<a b"=">" onclick=alert(1)>x</a>', 'onclick'],
    ['<a "=">" onclick=alert(1)>x</a>', 'onclick'],
    ['<a ==">" onclick=alert(1)>x</a>', 'onclick'],
    // '<' inside a tag name stays part of the name in a browser
    ['<img</onclick=alert(1)>', 'onclick'],
    ['<svg"javascript:`</onclick><a>', 'onclick'],
  ])('neutralises %j', (payload, needle) => {
    expect(s(payload, 'description').toLowerCase()).not.toContain(needle);
  });
  it('does not treat a backtick as a quote (the tag ends at the first ">")', () => {
    expect(s('<a title=`>` onclick=alert(1)>x</a>', 'description')).toBe('<a title=`>` onclick=alert(1)>x</a>');
  });
  it('keeps a quoted ">" in a harmless attribute', () => {
    const html = '<a href="https://example.com/?a=1&b=2" title="x > y">ok</a>';
    expect(s(html, 'description')).toBe(html);
    expect(s('<img src=x title=">" onerror=alert(1)>', 'description')).toBe('<img src=x title=">">');
  });
});

describe('sanitizer keeps the scheme-bypass guards (tab, newline, CR, entities)', () => {
  it.each([
    '<a href="java\tscript:alert(1)">x</a>',
    '<a href="java\nscript:alert(1)">x</a>',
    '<a href="java\rscript:alert(1)">x</a>',
    '<a href="&#106;avascript:alert(1)">x</a>',
    '<a href=" javascript:alert(1)">x</a>',
    '<math><a xlink:href="javascript:alert(1)">x</a></math>',
    '<form action="javascript:alert(1)"><button formaction="javascript:alert(1)">',
  ])('removes the script URL attribute from %j', (payload) => {
    expect(s(payload, 'description').toLowerCase()).not.toMatch(/(href|action)=/);
  });
  it.each([
    'java\tscript:alert(1)',
    'java\nscript:alert(1)',
    'java\rscript:alert(1)',
    ' javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    'vbscript:msgbox(1)',
    'java&#9;script:alert(1)',
  ])('blanks %j in a url field', (url) => {
    expect(s(url, 'webhookUrl')).toBe('');
    expect(s(url, 'url')).toBe('');
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
    // every '<a' opens a tag that only a quoted '>' at the very end could close
    expect(timed(() => s('<a'.repeat(500_000) + ' x=">"', 'description'))).toBeLessThan(3000);
    expect(timed(() => s('<a x="'.repeat(200_000) + '>', 'description'))).toBeLessThan(3000);
  });
});
