// Add validation schema for report parameters
const reportParamsSchema = z.object({
  tenantId: z.string().uuid(),
  reportId: z.string().uuid()
});

// Add validation schema for report generation
const generateReportSchema = z.object({
  type: z.string().min(1).max(50),
  format: z.enum(['pdf', 'csv', 'json']).default('json'),
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
    ],
    schema: {
      tags: ['Reporting'],
      querystring: {
        type: 'object',
        properties: {
          startDate: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
          endDate: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' }
        }
      }
    }
  }, async (request, reply) => {
    // Implementation would now have validated date parameters
  });

  // Add validation for report generation endpoint
  fastify.post('/reports/generate', {
    preHandler: [
      authenticate,
      authorize(['admin', 'manager']),
      validate(generateReportSchema)
    ],
    schema: {
      tags: ['Reporting'],
      body: {
        type: 'object',
        properties: {
          type: { type: 'string', maxLength: 50 },
          format: { type: 'string', enum: ['pdf', 'csv', 'json'] },
          startDate: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
          endDate: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' }
        },
        required: ['type']
      }
    }
  }, async (request, reply) => {
    // Implementation for report generation
  });
}