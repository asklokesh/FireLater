import { FastifyInstance, FastifyRequest } from 'fastify';
import { reportingService } from '../services/reporting.js';
import { authenticateTenant } from '../middleware/auth.js';
import { validateDateRange } from '../middleware/validation.js';

// Add date range validation middleware
async function validateReportingParams(request: FastifyRequest) {
  const { fromDate, toDate, page, perPage, reportType, isPublic } = request.query as { 
    fromDate?: string; 
    toDate?: string;
    page?: number;
    perPage?: number;
    reportType?: string;
    isPublic?: boolean;
  };
  
  if (fromDate && isNaN(Date.parse(fromDate))) {
    throw new Error('Invalid fromDate parameter');
  }
  
  if (toDate && isNaN(Date.parse(toDate))) {
    throw new Error('Invalid toDate parameter');
  }
  
  if (fromDate && toDate && new Date(fromDate) > new Date(toDate)) {
    throw new Error('fromDate must be before toDate');
  }
  
  if (page !== undefined && (isNaN(page) || page < 1)) {
    throw new Error('Page must be a positive integer');
  }
  
  if (perPage !== undefined && (isNaN(perPage) || perPage < 1 || perPage > 100)) {
    throw new Error('PerPage must be between 1 and 100');
  }
  
  if (reportType !== undefined && typeof reportType !== 'string') {
    throw new Error('reportType must be a string');
  }
  
  if (isPublic !== undefined && typeof isPublic !== 'boolean') {
    throw new Error('isPublic must be a boolean');
  }
}