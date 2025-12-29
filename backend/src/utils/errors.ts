import { FastifyReply } from 'fastify';

// UUID validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidUUID(str: string): boolean {
  return UUID_REGEX.test(str);
}

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public error: string,
    message: string,
    public details?: Record<string, string[]>
  ) {
    super(message);
    this.name = 'AppError';
  }

  toJSON() {
    return {
      statusCode: this.statusCode,
      error: this.error,
      message: this.message,
      ...(this.details && { details: this.details }),
    };
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    const message = id ? `${resource} with id '${id}' not found` : `${resource} not found`;
    super(404, 'Not Found', message);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(401, 'Unauthorized', message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(403, 'Forbidden', message);
  }
}

export class BadRequestError extends AppError {
  constructor(message: string, details?: Record<string, string[]>) {
    super(400, 'Bad Request', message, details);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(409, 'Conflict', message);
  }
}

export class ValidationError extends AppError {
  constructor(details: Record<string, string[]>) {
    super(400, 'Validation Error', 'Validation failed', details);
  }
}

export function sendError(reply: FastifyReply, error: AppError | Error): void {
  if (error instanceof AppError) {
    reply.status(error.statusCode).send(error.toJSON());
  } else {
    reply.status(500).send({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'An unexpected error occurred',
    });
  }
}
