import { describe, it, expect } from 'vitest';
import { sanitizeInput } from '../../src/utils/sanitization.js';

describe('Sanitization Utility', () => {
  describe('sanitizeInput', () => {
    it('should return empty string for non-string input', () => {
      expect(sanitizeInput(null as unknown as string)).toBe('');
      expect(sanitizeInput(undefined as unknown as string)).toBe('');
      expect(sanitizeInput(123 as unknown as string)).toBe('');
      expect(sanitizeInput({} as unknown as string)).toBe('');
      expect(sanitizeInput([] as unknown as string)).toBe('');
    });

    it('should trim whitespace', () => {
      expect(sanitizeInput('  hello  ')).toBe('hello');
      expect(sanitizeInput('\t\nhello\n\t')).toBe('hello');
      expect(sanitizeInput('   ')).toBe('');
    });

    it('should remove angle brackets', () => {
      expect(sanitizeInput('<script>alert("xss")</script>')).toBe('scriptalert("xss")/script');
      expect(sanitizeInput('Hello <b>World</b>')).toBe('Hello bWorld/b');
      expect(sanitizeInput('1 < 2 > 0')).toBe('1  2  0');
    });

    it('should handle mixed content', () => {
      expect(sanitizeInput('  <test>  ')).toBe('test');
      expect(sanitizeInput('<>empty<>')).toBe('empty');
    });

    it('should preserve non-angle-bracket special characters', () => {
      expect(sanitizeInput('Hello & World!')).toBe('Hello & World!');
      expect(sanitizeInput('Test "quotes" here')).toBe('Test "quotes" here');
      expect(sanitizeInput("It's working")).toBe("It's working");
    });

    it('should handle empty string', () => {
      expect(sanitizeInput('')).toBe('');
    });

    it('should handle string with only angle brackets', () => {
      expect(sanitizeInput('<><><>')).toBe('');
      expect(sanitizeInput('<')).toBe('');
      expect(sanitizeInput('>')).toBe('');
    });

    it('should handle normal text without special characters', () => {
      expect(sanitizeInput('Hello World')).toBe('Hello World');
      expect(sanitizeInput('This is a test')).toBe('This is a test');
    });
  });
});
