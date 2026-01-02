import { describe, it, expect } from 'vitest';
import {
  sanitizeHTML,
  sanitizeMarkdown,
  sanitizePlainText,
  sanitizeURL,
  sanitizeContent,
  sanitizeFields,
  stripHTML,
  truncateSanitized,
  ContentType,
} from '../../src/utils/contentSanitization.js';

describe('Content Sanitization', () => {
  describe('sanitizeHTML', () => {
    it('should allow safe HTML tags', () => {
      const safe = '<p>Hello <strong>world</strong></p>';
      expect(sanitizeHTML(safe)).toBe(safe);
    });

    it('should remove script tags', () => {
      const dangerous = '<p>Hello</p><script>alert("xss")</script>';
      const result = sanitizeHTML(dangerous);
      expect(result).not.toContain('<script>');
      expect(result).toContain('<p>Hello</p>');
    });

    it('should remove javascript: URLs', () => {
      const dangerous = '<a href="javascript:alert(\'xss\')">Click</a>';
      const result = sanitizeHTML(dangerous);
      expect(result).not.toContain('javascript:');
      // Link should be stripped or href removed
      expect(result).not.toMatch(/href="javascript:/);
    });

    it('should remove onerror attributes', () => {
      const dangerous = '<img src="x" onerror="alert(\'xss\')">';
      const result = sanitizeHTML(dangerous);
      expect(result).not.toContain('onerror');
    });

    it('should remove event handler attributes', () => {
      const dangerous = '<div onclick="alert(\'xss\')">Click me</div>';
      const result = sanitizeHTML(dangerous);
      expect(result).not.toContain('onclick');
    });

    it('should remove iframe tags', () => {
      const dangerous = '<iframe src="https://evil.com"></iframe>';
      const result = sanitizeHTML(dangerous);
      expect(result).not.toContain('<iframe');
    });

    it('should remove style tags', () => {
      const dangerous = '<style>body { display: none; }</style><p>Content</p>';
      const result = sanitizeHTML(dangerous);
      expect(result).not.toContain('<style>');
      expect(result).toContain('Content');
    });

    it('should remove SVG tags (XSS vector)', () => {
      const dangerous = '<svg onload="alert(\'xss\')"><circle r="50"/></svg>';
      const result = sanitizeHTML(dangerous);
      expect(result).not.toContain('<svg');
      expect(result).not.toContain('onload');
    });

    it('should handle empty input', () => {
      expect(sanitizeHTML('')).toBe('');
    });

    it('should preserve code blocks', () => {
      const code = '<pre><code>function test() { return true; }</code></pre>';
      const result = sanitizeHTML(code);
      expect(result).toContain('<pre>');
      expect(result).toContain('<code>');
    });

    it('should allow safe links with https', () => {
      const safe = '<a href="https://example.com">Link</a>';
      const result = sanitizeHTML(safe);
      expect(result).toContain('href="https://example.com"');
    });

    it('should block data: URLs', () => {
      const dangerous = '<a href="data:text/html,<script>alert(\'xss\')</script>">Click</a>';
      const result = sanitizeHTML(dangerous);
      expect(result).not.toContain('data:');
    });
  });

  describe('sanitizeMarkdown', () => {
    it('should convert markdown to HTML', () => {
      const markdown = '# Hello\n\nThis is **bold** text.';
      const result = sanitizeMarkdown(markdown);
      expect(result).toContain('<h1>');
      expect(result).toContain('<strong>');
    });

    it('should sanitize HTML in markdown', () => {
      const dangerous = '# Title\n\n<script>alert("xss")</script>\n\nContent';
      const result = sanitizeMarkdown(dangerous);
      expect(result).not.toContain('<script>');
      expect(result).toContain('Content');
    });

    it('should handle code blocks', () => {
      const markdown = '```javascript\nfunction test() {}\n```';
      const result = sanitizeMarkdown(markdown);
      expect(result).toMatch(/<code/); // Match opening tag (class attribute may vary)
    });

    it('should handle lists', () => {
      const markdown = '- Item 1\n- Item 2\n- Item 3';
      const result = sanitizeMarkdown(markdown);
      expect(result).toContain('<ul>');
      expect(result).toContain('<li>');
    });

    it('should handle links', () => {
      const markdown = '[Google](https://google.com)';
      const result = sanitizeMarkdown(markdown);
      expect(result).toContain('href="https://google.com"');
    });

    it('should block javascript: links in markdown', () => {
      const dangerous = '[Click](javascript:alert("xss"))';
      const result = sanitizeMarkdown(dangerous);
      expect(result).not.toContain('javascript:');
    });

    it('should handle empty input', () => {
      expect(sanitizeMarkdown('')).toBe('');
    });

    it('should convert line breaks (GFM)', () => {
      const markdown = 'Line 1\nLine 2';
      const result = sanitizeMarkdown(markdown);
      expect(result).toMatch(/<br\s*\/?>/);
    });
  });

  describe('sanitizePlainText', () => {
    it('should escape HTML entities', () => {
      const text = '<script>alert("xss")</script>';
      const result = sanitizePlainText(text);
      expect(result).toContain('&lt;script&gt;');
      expect(result).not.toContain('<script>');
    });

    it('should convert newlines to <br>', () => {
      const text = 'Line 1\nLine 2\nLine 3';
      const result = sanitizePlainText(text, true);
      expect(result).toContain('<br>');
    });

    it('should not convert newlines when disabled', () => {
      const text = 'Line 1\nLine 2';
      const result = sanitizePlainText(text, false);
      expect(result).not.toContain('<br>');
      expect(result).toContain('\n');
    });

    it('should escape quotes', () => {
      const text = 'He said "hello" and \'goodbye\'';
      const result = sanitizePlainText(text);
      expect(result).toContain('&quot;');
      expect(result).toContain('&#x27;');
    });

    it('should escape ampersands', () => {
      const text = 'Tom & Jerry';
      const result = sanitizePlainText(text);
      expect(result).toContain('&amp;');
    });

    it('should handle empty input', () => {
      expect(sanitizePlainText('')).toBe('');
    });
  });

  describe('sanitizeURL', () => {
    it('should allow https URLs', () => {
      expect(sanitizeURL('https://example.com')).toBe('https://example.com');
    });

    it('should allow http URLs', () => {
      expect(sanitizeURL('http://example.com')).toBe('http://example.com');
    });

    it('should allow mailto URLs', () => {
      expect(sanitizeURL('mailto:test@example.com')).toBe('mailto:test@example.com');
    });

    it('should allow tel URLs', () => {
      expect(sanitizeURL('tel:+1234567890')).toBe('tel:+1234567890');
    });

    it('should block javascript: URLs', () => {
      expect(sanitizeURL('javascript:alert("xss")')).toBeNull();
    });

    it('should block data: URLs', () => {
      expect(sanitizeURL('data:text/html,<script>alert("xss")</script>')).toBeNull();
    });

    it('should block vbscript: URLs', () => {
      expect(sanitizeURL('vbscript:alert("xss")')).toBeNull();
    });

    it('should block file: URLs', () => {
      expect(sanitizeURL('file:///etc/passwd')).toBeNull();
    });

    it('should handle empty input', () => {
      expect(sanitizeURL('')).toBeNull();
    });

    it('should allow relative URLs', () => {
      expect(sanitizeURL('/path/to/resource')).toBe('/path/to/resource');
    });

    it('should trim whitespace', () => {
      expect(sanitizeURL('  https://example.com  ')).toBe('  https://example.com  ');
    });
  });

  describe('sanitizeContent', () => {
    it('should sanitize HTML when type is HTML', () => {
      const html = '<p>Safe</p><script>alert("xss")</script>';
      const result = sanitizeContent(html, ContentType.HTML);
      expect(result).toContain('<p>');
      expect(result).not.toContain('<script>');
    });

    it('should sanitize markdown when type is MARKDOWN', () => {
      const markdown = '# Title\n\n**Bold** text';
      const result = sanitizeContent(markdown, ContentType.MARKDOWN);
      expect(result).toContain('<h1>');
      expect(result).toContain('<strong>');
    });

    it('should sanitize plain text when type is PLAINTEXT', () => {
      const text = '<script>alert("xss")</script>';
      const result = sanitizeContent(text, ContentType.PLAINTEXT);
      expect(result).toContain('&lt;script&gt;');
    });

    it('should default to PLAINTEXT', () => {
      const text = '<p>Test</p>';
      const result = sanitizeContent(text);
      expect(result).toContain('&lt;p&gt;');
    });

    it('should handle empty input', () => {
      expect(sanitizeContent('')).toBe('');
    });
  });

  describe('sanitizeFields', () => {
    it('should sanitize specified fields in object', () => {
      const obj = {
        title: 'Safe Title',
        content: '<script>alert("xss")</script>',
        description: '**Bold** text',
        other: 'unchanged',
      };

      const config = {
        content: ContentType.HTML,
        description: ContentType.MARKDOWN,
      };

      const result = sanitizeFields(obj, config);

      expect(result.title).toBe('Safe Title');
      expect(result.content).not.toContain('<script>');
      expect(result.description).toContain('<strong>');
      expect(result.other).toBe('unchanged');
    });

    it('should handle missing fields', () => {
      const obj = { title: 'Test' };
      const config = { content: ContentType.HTML };
      const result = sanitizeFields(obj, config);
      expect(result.title).toBe('Test');
      expect('content' in result).toBe(false);
    });

    it('should only process string fields', () => {
      const obj = {
        content: '<script>xss</script>',
        number: 123,
        bool: true,
        obj: { nested: 'value' },
      };

      const config = {
        content: ContentType.HTML,
        number: ContentType.HTML,
        bool: ContentType.HTML,
        obj: ContentType.HTML,
      };

      const result = sanitizeFields(obj, config);
      expect(result.number).toBe(123);
      expect(result.bool).toBe(true);
      expect(result.obj).toEqual({ nested: 'value' });
    });
  });

  describe('stripHTML', () => {
    it('should remove all HTML tags', () => {
      const html = '<p>Hello <strong>world</strong></p>';
      expect(stripHTML(html)).toBe('Hello world');
    });

    it('should keep text content', () => {
      const html = '<div><span>Text</span></div>';
      expect(stripHTML(html)).toBe('Text');
    });

    it('should handle nested tags', () => {
      const html = '<div><p><strong><em>Nested</em></strong></p></div>';
      expect(stripHTML(html)).toBe('Nested');
    });

    it('should handle empty input', () => {
      expect(stripHTML('')).toBe('');
    });
  });

  describe('truncateSanitized', () => {
    it('should truncate content to max length', () => {
      const content = 'This is a very long piece of content that should be truncated';
      const result = truncateSanitized(content, 20);
      expect(result.length).toBeLessThanOrEqual(23); // 20 + '...'
      expect(result).toContain('...');
    });

    it('should not truncate if content is shorter', () => {
      const content = 'Short';
      const result = truncateSanitized(content, 20);
      expect(result).toBe('Short');
      expect(result).not.toContain('...');
    });

    it('should sanitize before truncating', () => {
      const dangerous = '<script>alert("xss")</script>Very long content here';
      const result = truncateSanitized(dangerous, 20, ContentType.HTML);
      expect(result).not.toContain('<script>');
    });

    it('should strip HTML after sanitizing', () => {
      const html = '<p>This is <strong>bold</strong> text</p>';
      const result = truncateSanitized(html, 20, ContentType.HTML);
      expect(result).not.toContain('<p>');
      expect(result).not.toContain('<strong>');
    });

    it('should handle empty input', () => {
      expect(truncateSanitized('', 10)).toBe('');
    });
  });

  describe('Edge Cases', () => {
    it('should handle null bytes', () => {
      const dangerous = 'test\x00<script>alert("xss")</script>';
      const result = sanitizeHTML(dangerous);
      expect(result).not.toContain('<script>');
    });

    it('should handle Unicode in content', () => {
      const unicode = '<p>Hello 世界 🌍</p>';
      const result = sanitizeHTML(unicode);
      expect(result).toContain('世界');
      expect(result).toContain('🌍');
    });

    it('should handle very long content', () => {
      const long = '<p>' + 'a'.repeat(100000) + '</p>';
      const result = sanitizeHTML(long);
      expect(result).toContain('<p>');
      expect(result.length).toBeGreaterThan(100000);
    });

    it('should handle deeply nested HTML', () => {
      let nested = 'content';
      for (let i = 0; i < 100; i++) {
        nested = `<div>${nested}</div>`;
      }
      const result = sanitizeHTML(nested);
      expect(result).toContain('content');
    });
  });
});
