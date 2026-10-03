import { FastifyInstance, FastifyRequest } from 'fastify';

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

const HTML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
  '`': '&#96;',
};

/**
 * Escapes HTML-significant characters instead of stripping them, so content
 * like free-text descriptions survives sanitization while remaining safe to
 * render. Use this where preserving the original text (minus XSS risk) matters
 * more than character removal.
 */
export const escapeHtml = (input: string): string => {
  if (typeof input !== 'string') return '';
  return input.replace(/[&<>"'`]/g, (char) => HTML_ESCAPE_MAP[char]).trim();
};

export const escapeHtmlDeep = (obj: Record<string, any>): Record<string, any> => {
  const escaped: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      escaped[key] = escapeHtml(value);
    } else if (Array.isArray(value)) {
      escaped[key] = value.map((item) =>
        typeof item === 'string'
          ? escapeHtml(item)
          : item && typeof item === 'object'
            ? escapeHtmlDeep(item)
            : item
      );
    } else if (value && typeof value === 'object') {
      escaped[key] = escapeHtmlDeep(value);
    } else {
      escaped[key] = value;
    }
  }
  return escaped;
};

export const inputSanitizationHook = async (request: FastifyRequest, _reply: any) => {
  // Sanitize query parameters
  if (request.query) {
    request.query = sanitizeObject(request.query);
  }
  
  // Sanitize body parameters
  if (request.body) {
    request.body = sanitizeObject(request.body);
  }
  
  // Sanitize params
  if (request.params) {
    request.params = sanitizeObject(request.params);
  }
};

export default function registerSanitization(fastify: FastifyInstance) {
  fastify.addHook('preHandler', inputSanitizationHook);
}