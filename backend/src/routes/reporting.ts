// Add validation for date range parameters in the generate report endpoint
fastify.post('/generate', {
  schema: {
    body: {
      type: 'object',
      required: ['reportType'],
      properties: {
        reportType: { 
          type: 'string',
          enum: ['incident-summary', 'service-availability', 'change-history', 'oncall-coverage'] 
        },
        startDate: { type: 'string', format: 'date' },
        endDate: { type: 'string', format: 'date' },
        filters: {
          type: 'object',
          additionalProperties: {
            anyOf: [
              { type: 'string' },
              { type: 'number' },
              { type: 'boolean' },
              {
                type: 'array',
                items: {
                  anyOf: [
                    { type: 'string' },
                    { type: 'number' },
                    { type: 'boolean' }
                  ]
                }
              }
            ]
          }
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
  
  // Validate filters structure
  if (filters) {
    const validFilterTypes = ['string', 'number', 'boolean'];
    for (const [key, value] of Object.entries(filters)) {
      if (Array.isArray(value)) {
        if (value.some(item => !validFilterTypes.includes(typeof item))) {
          throw new BadRequestError(`Invalid filter value type in array for key: ${key}`);
        }
      } else if (!validFilterTypes.includes(typeof value)) {
        throw new BadRequestError(`Invalid filter value type for key: ${key}`);
      }
    }
  }

  // ... rest of the handler
});