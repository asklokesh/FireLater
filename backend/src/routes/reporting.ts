// Add input validation middleware before route handlers
import { FastifyInstance } from 'fastify';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validation.js';

// Add this validation schema for report listing
const reportListSchema = {
  querystring: {
    type: 'object',
    properties: {
      page: { type: 'integer', minimum: 1, default: 1 },
      perPage: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
      reportType: { 
        type: 'string',
        enum: ['incident_summary', 'service_availability', 'user_activity', 'asset_inventory'] // Add all valid report types
      },
      isPublic: { type: 'boolean' }
    },
    additionalProperties: false
  }
};

export default async function reportingRoutes(fastify: FastifyInstance) {
  // Apply validation to the list route
  fastify.get('/templates', {
    preHandler: [authenticate, authorize(['read:reports']), validate(reportListSchema)],
    handler: async (request, reply) => {
      // ... existing implementation
    }
  });
}