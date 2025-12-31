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
    },
    response: {
      200: {
        type: 'object',
        properties: {
          reportId: { type: 'string' },
          status: { type: 'string' },
          message: { type: 'string' }
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
  
  // Validate reportType is one of allowed values
  const allowedReportTypes = ['incident-summary', 'service-availability', 'change-history', 'oncall-coverage'];
  if (!allowedReportTypes.includes(reportType)) {
    throw new BadRequestError('Invalid reportType');
  }

  // Validate date format and range with better error handling
  if (startDate) {
    const start = new Date(startDate);
    if (isNaN(start.getTime())) {
      throw new BadRequestError('Invalid startDate format');
    }
  }
  
  if (endDate) {
    const end = new Date(endDate);
    if (isNaN(end.getTime())) {
      throw new BadRequestError('Invalid endDate format');
    }
  }
  
  if (startDate && endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (start > end) {
      throw new BadRequestError('startDate must be before or equal to endDate');
    }
  }
  
  // Additional validation: Check if dates are not in the future
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  if (startDate) {
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    if (start > today) {
      throw new BadRequestError('startDate cannot be in the future');
    }
  }
  
  if (endDate) {
    const end = new Date(endDate);
    end.setHours(0, 0, 0, 0);
    if (end > today) {
      throw new BadRequestError('endDate cannot be in the future');
    }
  }
  
  // Validate filters structure with protection against prototype pollution
  if (filters) {
    // Prevent prototype pollution
    if (Object.prototype.hasOwnProperty.call(filters, '__proto__') || 
        Object.prototype.hasOwnProperty.call(filters, 'constructor')) {
      throw new BadRequestError('Invalid filter keys');
    }
    
    const validFilterTypes = ['string', 'number', 'boolean'];
    for (const [key, value] of Object.entries(filters)) {
      // Prevent prototype pollution and invalid keys
      if (key === '__proto__' || key === 'constructor' || typeof key !== 'string') {
        throw new BadRequestError('Invalid filter keys');
      }
      
      // Sanitize key to prevent injection
      if (!/^[a-zA-Z0-9_-]+$/.test(key)) {
        throw new BadRequestError(`Invalid characters in filter key: ${key}`);
      }
      
      if (Array.isArray(value)) {
        if (value.some(item => !validFilterTypes.includes(typeof item))) {
          throw new BadRequestError(`Invalid filter value type in array for key: ${key}`);
        }
      } else if (value !== null && typeof value === 'object') {
        // Handle nested objects by flattening or rejecting
        throw new BadRequestError(`Nested objects not allowed in filters for key: ${key}`);
      } else if (value !== null && !validFilterTypes.includes(typeof value)) {
        throw new BadRequestError(`Invalid filter value type for key: ${key}`);
      }
    }
  }

  // ... rest of the handler
});