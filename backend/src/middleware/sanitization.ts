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