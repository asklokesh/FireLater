// Add validation middleware for date parameters
import { FastifyInstance } from 'fastify';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validation.js';
import { z } from 'zod';

// Add date validation schema
const dateRangeSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format').optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format').optional()
});

export default async function reportingRoutes(fastify: FastifyInstance) {
  // Add validation to routes that accept date parameters
  fastify.get('/reports/usage', {
    preHandler: [
      authenticate,
      authorize(['admin', 'manager']),
      validate(dateRangeSchema)
    ]
  }, async (request, reply) => {
    // Implementation would now have validated date parameters
  });
}