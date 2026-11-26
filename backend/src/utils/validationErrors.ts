import type { ZodError } from 'zod';

export type ValidationLocation = 'body' | 'params' | 'query';

export interface ValidationIssue {
  location: ValidationLocation;
  /** Dotted field path, e.g. "roleIds.0" ('' for the root value). */
  field: string;
  message: string;
  code: string;
  path: (string | number)[];
}

export interface ValidationErrorResponse {
  statusCode: 400;
  error: 'Validation Error';
  message: string;
  details: ValidationIssue[];
}

/** Convert a ZodError into flat, client-friendly issues. */
export function formatZodIssues(error: ZodError, location: ValidationLocation): ValidationIssue[] {
  return error.issues.map((issue) => ({
    location,
    field: issue.path.join('.'),
    message: issue.message,
    code: issue.code,
    path: issue.path,
  }));
}

/** Build the standard 400 response body used by every validated route. */
export function buildValidationErrorResponse(issues: ValidationIssue[]): ValidationErrorResponse {
  const summary = issues
    .slice(0, 3)
    .map((i) => (i.field ? `${i.location}.${i.field}: ${i.message}` : `${i.location}: ${i.message}`))
    .join('; ');
  return {
    statusCode: 400,
    error: 'Validation Error',
    message: summary ? `Request validation failed - ${summary}${issues.length > 3 ? ` (+${issues.length - 3} more)` : ''}` : 'Request validation failed',
    details: issues,
  };
}
