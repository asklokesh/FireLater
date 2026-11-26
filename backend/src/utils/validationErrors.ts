import type { ZodError, ZodIssue } from 'zod';

export type ValidationLocation = 'body' | 'params' | 'query';

export interface FormattedValidationIssue {
  location: ValidationLocation;
  field: string;
  message: string;
  code: string;
  path: (string | number)[];
}

export interface ValidationErrorResponse {
  statusCode: 400;
  error: 'Validation Error';
  message: string;
  details: FormattedValidationIssue[];
}

function describe(issue: ZodIssue): string {
  switch (issue.code) {
    case 'invalid_type':
      return issue.received === 'undefined' ? 'Required' : `Expected ${issue.expected}, received ${issue.received}`;
    case 'invalid_enum_value':
      return `Must be one of: ${issue.options.join(', ')}`;
    case 'unrecognized_keys':
      return `Unrecognized field(s): ${issue.keys.join(', ')}`;
    default:
      return issue.message;
  }
}

export function formatZodIssues(location: ValidationLocation, error: ZodError): FormattedValidationIssue[] {
  return error.issues.map((issue) => ({
    location,
    field: issue.path.length ? issue.path.join('.') : '(root)',
    message: describe(issue),
    code: issue.code,
    path: issue.path,
  }));
}

export function buildValidationError(details: FormattedValidationIssue[], message = 'Request validation failed'): ValidationErrorResponse {
  return { statusCode: 400, error: 'Validation Error', message, details };
}
