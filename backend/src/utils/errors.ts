export class AppError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number = 500) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
  }
}

export class NotFoundError extends Error {
  statusCode = 404;

  constructor(resource: string, identifier?: string) {
    super(identifier ? `${resource} with ID ${identifier} not found` : `${resource} not found`);
    this.name = 'NotFoundError';
  }
}

export class BadRequestError extends Error {
  statusCode = 400;

  constructor(message: string) {
    super(message);
    this.name = 'BadRequestError';
  }
}

export class UnauthorizedError extends Error {
  statusCode = 401;

  constructor(message: string = 'Unauthorized') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends Error {
  statusCode = 403;

  constructor(message: string = 'Forbidden') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

export class ConflictError extends Error {
  statusCode = 409;

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
