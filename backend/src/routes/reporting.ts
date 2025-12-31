// Add import for validateUUID function at the top
import { validateUUID } from './knowledge.js';

// Add validation for report generation endpoint
fastify.post('/reporting/generate', {
  preHandler: [authenticate, authorize('create:reports')],
  schema: {
    tags: ['Reporting'],
    body: {
      type: 'object',
      required: ['reportType'],
      properties: {
        reportType: { 
          type: 'string',
          enum: ['incident-summary', 'service-availability', 'change-history', 'oncall-coverage']
        },
        startDate: { type: 'string', format: 'date-time' },
        endDate: { type: 'string', format: 'date-time' },
        templateId: { 
          type: 'string', 
          pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' 
        }
      }
    }
  }
}, async (request: FastifyRequest<{ 
  Body: { 
    reportType: string; 
    startDate?: string; 
    endDate?: string; 
    templateId?: string 
  } 
}>) => {
  const { reportType, startDate, endDate, templateId } = request.body;
  
  if (!request.tenantSlug) {
    throw new BadRequestError('Tenant context required');
  }
  
  // Validate templateId if provided
  if (templateId && !validateUUID(templateId)) {
    throw new BadRequestError('Invalid templateId format');
  }
  
  // Validate date range
  if (startDate && endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    if (start > end) {
      throw new BadRequestError('startDate must be before endDate');
    }
    
    // Limit date range to 1 year
    const oneYear = 365 * 24 * 60 * 60 * 1000;
    if (end.getTime() - start.getTime() > oneYear) {
      throw new BadRequestError('Date range cannot exceed 1 year');
    }
  }
  
  const report = await reportingService.generateReport(
    request.tenantSlug,
    reportType,
    startDate,
    endDate,
    templateId
  );
  
  return report;
});