import { ZodIssue } from 'zod';

export type ValidationLocation = 'body' | 'params' | 'query';

export interface ValidationErrorDetail {
  location: ValidationLocation;
  field: string;
  message: string;
  code: string;
}

export interface ValidationErrorResponse {
  statusCode: 400;
  error: 'Validation Error';
  message: string;
  details: ValidationErrorDetail[];
}

/**
 * Convert Zod issues for one request location into flat, client-friendly details.
 */
export function formatZodIssues(location: ValidationLocation, issues: ZodIssue[]): ValidationErrorDetail[] {
  return issues.map((issue) => ({
    location,
    field: issue.path.length > 0 ? issue.path.join('.') : '(root)',
    message: issue.message,
    code: issue.code,
  }));
}

/**
 * Build the single, consistent 400 payload returned for every validation failure.
 */
export function buildValidationError(details: ValidationErrorDetail[], summary?: string): ValidationErrorResponse {
  const shown = details.slice(0, 5).map((d) => `${d.location}.${d.field}: ${d.message}`);
  const more = details.length > shown.length ? ` (+${details.length - shown.length} more)` : '';
  return {
    statusCode: 400,
    error: 'Validation Error',
    message: summary ?? `Validation failed: ${shown.join('; ')}${more}`,
    details,
  };
}
