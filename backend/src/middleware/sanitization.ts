import { FastifyInstance, FastifyRequest } from 'fastify';

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export const sanitizeInput = (input: string): string => {
  // Strip script/style blocks including their content, then any remaining markup characters
  const withoutBlocks = input
    .replace(/<\s*(script|style)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*(script|style)\b[^>]*>/gi, '');
  return withoutBlocks
    .replace(CONTROL_CHARS, '')
    .replace(/[<>{}[\]|\\^`]/g, '')
    .trim();
};

export const sanitizeValue = (value: unknown): unknown => {
  if (typeof value === 'string') return sanitizeInput(value);
  if (Array.isArray(value)) return value.map(sanitizeValue);
  if (typeof value === 'object' && value !== null) return sanitizeObject(value as Record<string, unknown>);
  return value;
};

// Credentials must reach validation unmodified
const SENSITIVE_KEY = /password|token|secret/i;

export const sanitizeObject = (obj: Record<string, any>): Record<string, any> => {
  const sanitized: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
    sanitized[key] = SENSITIVE_KEY.test(key) ? value : sanitizeValue(value);
  }
  return sanitized;
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