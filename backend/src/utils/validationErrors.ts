import { ZodError } from 'zod';
import { AppError } from './errors.js';

/**
 * Flattens a ZodError into a field -> messages[] map for consistent API responses.
 */
export function formatZodIssues(error: ZodError): Record<string, string[]> {
  const details: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const path = issue.path.length > 0 ? issue.path.join('.') : '_root';
    if (!details[path]) {
      details[path] = [];
    }
    details[path].push(issue.message);
  }
  return details;
}

/**
 * Converts a ZodError into the project's standard AppError so it flows through
 * the existing centralized error handler.
 */
export function zodErrorToAppError(error: ZodError): AppError {
  return new AppError(400, 'Validation Error', 'Request validation failed', formatZodIssues(error));
}
