export class AppError extends Error {
  statusCode: number;
  error: string;
  details?: any;
  /** Optional i18n key (see src/locales); when set, the error handler returns the localized text. */
  messageKey?: string;

  constructor(statusCode: number, error: string, message: string, details?: any, messageKey?: string) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.error = error;
    this.details = details;
    this.messageKey = messageKey;
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
  resource: string;
  identifier?: string;

  constructor(resource: string, identifier?: string) {
    super(identifier ? `${resource} with id '${identifier}' not found` : `${resource} not found`);
    this.name = 'NotFoundError';
    this.resource = resource;
    this.identifier = identifier;
  }
}

export class BadRequestError extends Error {
  statusCode = 400;
  error = 'Bad Request';

  messageKey?: string;

  constructor(message: string, messageKey?: string) {
    super(message);
    this.messageKey = messageKey;
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

  messageKey?: string;

  constructor(message: string = 'Unauthorized', messageKey?: string) {
    super(message);
    this.messageKey = messageKey;
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends Error {
  statusCode = 403;
  error = 'Forbidden';

  messageKey?: string;

  constructor(message: string = 'Forbidden', messageKey?: string) {
    super(message);
    this.messageKey = messageKey;
    this.name = 'ForbiddenError';
  }
}

export class ConflictError extends Error {
  statusCode = 409;
  error = 'Conflict';

  messageKey?: string;

  constructor(message: string, messageKey?: string) {
    super(message);
    this.messageKey = messageKey;
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
