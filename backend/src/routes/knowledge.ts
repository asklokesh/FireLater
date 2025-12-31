import { FastifyInstance, FastifyRequest } from 'fastify';
import { knowledgeService } from '../services/knowledge.js';
import { authenticateTenant, validateTenantAccess } from '../middleware/auth.js';
import { BadRequestError, NotFoundError } from '../utils/errors.js';

// Add validation for UUID format
function validateUUID(id: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
}

// Add this validation function for article status
function validateArticleStatus(status?: string): void {
  const validStatuses = ['draft', 'published', 'archived'];
  if (status && !validStatuses.includes(status)) {
    throw new BadRequestError(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
  }
}