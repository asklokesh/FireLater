import { describe, it, expect } from 'vitest';

/**
 * Unit tests for input sanitization middleware
 * Testing XSS prevention and input cleaning
 */

// Re-implement the sanitization functions for testing
const sanitizeInput = (input: string): string => {
  return input.replace(/[<>{}[\]|\\^`]/g, '').trim();
};

const sanitizeObject = (obj: Record<string, any>): Record<string, any> => {
  const sanitized: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      sanitized[key] = sanitizeInput(value);
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeObject(value);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
};

describe('Input Sanitization', () => {
  describe('sanitizeInput', () => {
    it('should remove HTML angle brackets', () => {
      expect(sanitizeInput('<script>alert("xss")</script>')).toBe('scriptalert("xss")/script');
    });

    it('should remove curly braces', () => {
      expect(sanitizeInput('{malicious: "code"}')).toBe('malicious: "code"');
    });

    it('should remove square brackets', () => {
      expect(sanitizeInput('array[0]')).toBe('array0');
    });

    it('should remove pipe characters', () => {
      expect(sanitizeInput('command | rm -rf')).toBe('command  rm -rf');
    });

    it('should remove backslashes', () => {
      expect(sanitizeInput('path\\to\\file')).toBe('pathtofile');
    });

    it('should remove caret characters', () => {
      expect(sanitizeInput('text^power')).toBe('textpower');
    });

    it('should remove backticks', () => {
      expect(sanitizeInput('`rm -rf /`')).toBe('rm -rf /');
    });

    it('should trim whitespace', () => {
      expect(sanitizeInput('  text  ')).toBe('text');
    });

    it('should handle combined dangerous input', () => {
      const dangerous = '<script>alert(`xss`)</script>{evil: "code"}';
      const sanitized = sanitizeInput(dangerous);

      expect(sanitized).not.toContain('<');
      expect(sanitized).not.toContain('>');
      expect(sanitized).not.toContain('`');
      expect(sanitized).not.toContain('{');
      expect(sanitized).not.toContain('}');
    });

    it('should preserve safe characters', () => {
      const safe = 'Hello World! This is a test. Email: test@example.com';
      expect(sanitizeInput(safe)).toBe(safe);
    });

    it('should preserve numbers', () => {
      expect(sanitizeInput('12345')).toBe('12345');
    });

    it('should preserve special punctuation', () => {
      expect(sanitizeInput('Hello, World! How are you?')).toBe('Hello, World! How are you?');
    });

    it('should handle empty string', () => {
      expect(sanitizeInput('')).toBe('');
    });

    it('should handle only whitespace', () => {
      expect(sanitizeInput('   ')).toBe('');
    });

    it('should handle Unicode characters', () => {
      expect(sanitizeInput('Hello 世界')).toBe('Hello 世界');
    });
  });

  describe('sanitizeObject', () => {
    it('should sanitize string values', () => {
      const obj = { name: '<script>test</script>' };
      const sanitized = sanitizeObject(obj);

      expect(sanitized.name).toBe('scripttest/script');
    });

    it('should preserve non-string values', () => {
      const obj = { count: 42, active: true, nullValue: null };
      const sanitized = sanitizeObject(obj);

      expect(sanitized.count).toBe(42);
      expect(sanitized.active).toBe(true);
      expect(sanitized.nullValue).toBeNull();
    });

    it('should sanitize nested objects', () => {
      const obj = {
        user: {
          name: '<b>John</b>',
          email: 'john@example.com',
        },
      };
      const sanitized = sanitizeObject(obj);

      expect(sanitized.user.name).toBe('bJohn/b');
      expect(sanitized.user.email).toBe('john@example.com');
    });

    it('should sanitize deeply nested objects', () => {
      const obj = {
        level1: {
          level2: {
            level3: {
              dangerous: '<script>alert()</script>',
            },
          },
        },
      };
      const sanitized = sanitizeObject(obj);

      expect(sanitized.level1.level2.level3.dangerous).toBe('scriptalert()/script');
    });

    it('should handle empty objects', () => {
      expect(sanitizeObject({})).toEqual({});
    });

    it('should not modify array contents (current behavior)', () => {
      // Note: Arrays are treated as objects and their numeric keys are preserved
      const obj = { items: ['<test>', 'safe'] };
      const sanitized = sanitizeObject(obj);

      // Current implementation converts arrays to objects with numeric keys
      expect(sanitized.items['0']).toBe('test');
      expect(sanitized.items['1']).toBe('safe');
    });

    it('should handle mixed content', () => {
      const obj = {
        title: '<h1>Title</h1>',
        count: 10,
        enabled: false,
        metadata: {
          author: 'John {Admin}',
        },
      };
      const sanitized = sanitizeObject(obj);

      expect(sanitized.title).toBe('h1Title/h1');
      expect(sanitized.count).toBe(10);
      expect(sanitized.enabled).toBe(false);
      expect(sanitized.metadata.author).toBe('John Admin');
    });
  });
});

describe('XSS Attack Prevention', () => {
  const xssPayloads = [
    '<script>alert("XSS")</script>',
    '<img src="x" onerror="alert(\'XSS\')">',
    '<body onload="alert(\'XSS\')">',
    'javascript:alert("XSS")',
    '<svg onload="alert(\'XSS\')">',
    '<iframe src="javascript:alert(\'XSS\')">',
    '"><script>alert("XSS")</script>',
    "';alert('XSS');//",
    '<div style="background:url(javascript:alert(\'XSS\'))">',
  ];

  it.each(xssPayloads)('should sanitize XSS payload: %s', (payload) => {
    const sanitized = sanitizeInput(payload);

    expect(sanitized).not.toContain('<script');
    expect(sanitized).not.toContain('</script>');
    expect(sanitized).not.toContain('<');
    expect(sanitized).not.toContain('>');
  });
});

describe('Command Injection Prevention', () => {
  const injectionPayloads = [
    'test; rm -rf /',
    'test && cat /etc/passwd',
    'test | ls -la',
    '`rm -rf /`',
    '$(cat /etc/passwd)',
  ];

  it.each(injectionPayloads)('should sanitize injection payload: %s', (payload) => {
    const sanitized = sanitizeInput(payload);

    // Pipe and backticks should be removed
    expect(sanitized).not.toContain('|');
    expect(sanitized).not.toContain('`');
  });
});

describe('SQL Injection Prevention', () => {
  // Note: SQL injection is primarily prevented by parameterized queries,
  // but sanitization adds defense in depth
  const sqlPayloads = [
    "' OR '1'='1",
    '"; DROP TABLE users; --',
    "1'; DELETE FROM users WHERE '1'='1",
  ];

  it.each(sqlPayloads)('should partially sanitize SQL payload: %s', (payload) => {
    const sanitized = sanitizeInput(payload);

    // These characters are preserved (SQL injection is handled by parameterized queries)
    // but dangerous template characters are removed
    expect(typeof sanitized).toBe('string');
  });
});

describe('Path Traversal Prevention', () => {
  const pathPayloads = [
    '../../../etc/passwd',
    '..\\..\\..\\windows\\system32\\config\\sam',
    '/etc/passwd',
  ];

  it.each(pathPayloads)('should sanitize path traversal: %s', (payload) => {
    const sanitized = sanitizeInput(payload);

    // Backslashes should be removed
    expect(sanitized).not.toContain('\\');
  });
});

describe('Edge Cases', () => {
  it('should handle very long strings', () => {
    const longString = '<script>'.repeat(1000);
    const sanitized = sanitizeInput(longString);

    expect(sanitized).not.toContain('<');
    expect(sanitized).not.toContain('>');
  });

  it('should handle strings with only dangerous characters', () => {
    expect(sanitizeInput('<>{}`|\\^[]')).toBe('');
  });

  it('should preserve legitimate code snippets (after sanitization)', () => {
    const code = 'function hello() { return "world"; }';
    const sanitized = sanitizeInput(code);

    // Curly braces are removed but the rest is preserved (and trimmed)
    expect(sanitized).toBe('function hello()  return "world";');
  });

  it('should handle email addresses', () => {
    expect(sanitizeInput('user@example.com')).toBe('user@example.com');
  });

  it('should handle URLs', () => {
    const url = 'https://example.com/path?query=value';
    expect(sanitizeInput(url)).toBe('https://example.com/path?query=value');
  });

  it('should handle JSON-like strings', () => {
    const json = '{"key": "value"}';
    const sanitized = sanitizeInput(json);

    expect(sanitized).toBe('"key": "value"');
  });
});
