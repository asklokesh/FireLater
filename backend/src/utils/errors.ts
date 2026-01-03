export class AppError extends Error {
  statusCode: number;
  error: string;
  details?: any;

  constructor(statusCode: number, error: string, message: string, details?: any) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.error = error;
    this.details = details;
  }

  toJSON() {
    const json: any = {
      statusCode: this.statusCode,
      error: this.error,
      message: this.message,
    };
    if (this.details) {
      json.details = this.details;
    }
    return json;
  }
}

export class NotFoundError extends Error {
  statusCode = 404;
  error = 'Not Found';

  constructor(resource: string, identifier?: string) {
    super(identifier ? `${resource} with id '${identifier}' not found` : `${resource} not found`);
    this.name = 'NotFoundError';
  }
}

export class BadRequestError extends Error {
  statusCode = 400;
  error = 'Bad Request';

  constructor(message: string) {
    super(message);
    this.name = 'BadRequestError';
  }
}

export class ValidationError extends Error {
  statusCode = 400;
  error = 'Validation Error';
  details: any;

  constructor(details: any) {
    super('Validation failed');
    this.name = 'ValidationError';
    this.details = details;
  }
}

export class UnauthorizedError extends Error {
  statusCode = 401;
  error = 'Unauthorized';

  constructor(message: string = 'Unauthorized') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends Error {
  statusCode = 403;
  error = 'Forbidden';

  constructor(message: string = 'Forbidden') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

export class ConflictError extends Error {
  statusCode = 409;
  error = 'Conflict';

  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}

export const getSafeErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    // For validation or user-facing errors, return the message
    if (error.name === 'ValidationError' || error.name === 'AuthenticationError') {
      return error.message;
    }
    // For other errors, return a generic message to avoid leaking internals
    return 'An unexpected error occurred';
  }
  return 'An unexpected error occurred';
};

export const isValidUUID = (uuid: string): boolean => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
};
