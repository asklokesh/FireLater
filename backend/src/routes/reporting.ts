// Add validation for date range parameters in the generate report endpoint
fastify.post('/generate', {
  schema: {
    body: {
      type: 'object',
      required: ['reportType'],
      properties: {
        reportType: { type: 'string' },
        startDate: { type: 'string', format: 'date' },
        endDate: { type: 'string', format: 'date' },
        filters: {
          type: 'object',
          additionalProperties: true
        }
      }
    }
  },
  preHandler: [authMiddleware, tenantMiddleware]
}, async (request, reply) => {
  const { reportType, startDate, endDate, filters } = request.body as {
    reportType: string;
    startDate?: string;
    endDate?: string;
    filters?: Record<string, unknown>;
  };
  
  // Validate date format and range
  if (startDate && !isValidDate(startDate)) {
    throw new BadRequestError('Invalid startDate format');
  }
  
  if (endDate && !isValidDate(endDate)) {
    throw new BadRequestError('Invalid endDate format');
  }
  
  if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
    throw new BadRequestError('startDate must be before endDate');
  }

  // ... rest of the handler
});

// Add helper function for date validation
function isValidDate(dateString: string): boolean {
  const date = new Date(dateString);
  return date instanceof Date && !isNaN(date.getTime());
}