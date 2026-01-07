import { describe, it, expect } from 'vitest';
import {
  AppError,
  NotFoundError,
  BadRequestError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  getSafeErrorMessage,
} from '../../src/utils/errors.js';

/**
 * Unit tests for custom error classes
 * Testing error construction, serialization, and safe message extraction
 */

describe('Error Classes', () => {
  describe('AppError', () => {
    it('should create error with all properties', () => {
      const error = new AppError(500, 'Internal Server Error', 'Something went wrong', { code: 'ERR_001' });

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(AppError);
      expect(error.statusCode).toBe(500);
      expect(error.error).toBe('Internal Server Error');
      expect(error.message).toBe('Something went wrong');
      expect(error.details).toEqual({ code: 'ERR_001' });
      expect(error.name).toBe('AppError');
    });

    it('should create error without details', () => {
      const error = new AppError(400, 'Bad Request', 'Invalid input');

      expect(error.statusCode).toBe(400);
      expect(error.details).toBeUndefined();
    });

    it('should serialize to JSON correctly', () => {
      const error = new AppError(404, 'Not Found', 'Resource not found', { id: '123' });
      const json = error.toJSON();

      expect(json).toEqual({
        statusCode: 404,
        error: 'Not Found',
        message: 'Resource not found',
        details: { id: '123' },
      });
    });

    it('should omit details in JSON when undefined', () => {
      const error = new AppError(500, 'Error', 'Test');
      const json = error.toJSON();

      expect(json).not.toHaveProperty('details');
    });
  });

  describe('NotFoundError', () => {
    it('should create error with resource and identifier', () => {
      const error = new NotFoundError('User', 'user-123');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(NotFoundError);
      expect(error.statusCode).toBe(404);
      expect(error.error).toBe('Not Found');
      expect(error.message).toBe("User with id 'user-123' not found");
      expect(error.name).toBe('NotFoundError');
    });

    it('should create error with resource only', () => {
      const error = new NotFoundError('Configuration');

      expect(error.message).toBe('Configuration not found');
    });

    it('should handle different resource types', () => {
      const issueError = new NotFoundError('Issue', 'ISS-001');
      const changeError = new NotFoundError('Change Request', 'CHG-002');

      expect(issueError.message).toBe("Issue with id 'ISS-001' not found");
      expect(changeError.message).toBe("Change Request with id 'CHG-002' not found");
    });
  });

  describe('BadRequestError', () => {
    it('should create error with message', () => {
      const error = new BadRequestError('Invalid email format');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(BadRequestError);
      expect(error.statusCode).toBe(400);
      expect(error.error).toBe('Bad Request');
      expect(error.message).toBe('Invalid email format');
      expect(error.name).toBe('BadRequestError');
    });
  });

  describe('ValidationError', () => {
    it('should create error with validation details', () => {
      const details = {
        email: 'Invalid email format',
        password: 'Password too short',
      };
      const error = new ValidationError(details);

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(ValidationError);
      expect(error.statusCode).toBe(400);
      expect(error.error).toBe('Validation Error');
      expect(error.message).toBe('Validation failed');
      expect(error.details).toEqual(details);
      expect(error.name).toBe('ValidationError');
    });

    it('should handle array of validation errors', () => {
      const details = [
        { field: 'email', message: 'Required' },
        { field: 'name', message: 'Too short' },
      ];
      const error = new ValidationError(details);

      expect(error.details).toEqual(details);
    });

    it('should handle Zod error format', () => {
      const zodErrors = {
        issues: [
          { path: ['email'], message: 'Invalid email' },
          { path: ['password'], message: 'Too weak' },
        ],
      };
      const error = new ValidationError(zodErrors);

      expect(error.details).toEqual(zodErrors);
    });
  });

  describe('UnauthorizedError', () => {
    it('should create error with custom message', () => {
      const error = new UnauthorizedError('Invalid credentials');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(UnauthorizedError);
      expect(error.statusCode).toBe(401);
      expect(error.error).toBe('Unauthorized');
      expect(error.message).toBe('Invalid credentials');
      expect(error.name).toBe('UnauthorizedError');
    });

    it('should create error with default message', () => {
      const error = new UnauthorizedError();

      expect(error.message).toBe('Unauthorized');
    });
  });

  describe('ForbiddenError', () => {
    it('should create error with custom message', () => {
      const error = new ForbiddenError('Access denied to this resource');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(ForbiddenError);
      expect(error.statusCode).toBe(403);
      expect(error.error).toBe('Forbidden');
      expect(error.message).toBe('Access denied to this resource');
      expect(error.name).toBe('ForbiddenError');
    });

    it('should create error with default message', () => {
      const error = new ForbiddenError();

      expect(error.message).toBe('Forbidden');
    });
  });

  describe('ConflictError', () => {
    it('should create error with message', () => {
      const error = new ConflictError('Resource already exists');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(ConflictError);
      expect(error.statusCode).toBe(409);
      expect(error.error).toBe('Conflict');
      expect(error.message).toBe('Resource already exists');
      expect(error.name).toBe('ConflictError');
    });

    it('should handle duplicate key scenarios', () => {
      const error = new ConflictError('Email address is already registered');

      expect(error.message).toBe('Email address is already registered');
    });
  });
});

describe('getSafeErrorMessage', () => {
  it('should return message for ValidationError', () => {
    const error = new ValidationError({ email: 'Invalid' });
    error.name = 'ValidationError';

    const message = getSafeErrorMessage(error);

    expect(message).toBe('Validation failed');
  });

  it('should return generic message for unknown errors', () => {
    const error = new Error('Database connection failed');

    const message = getSafeErrorMessage(error);

    expect(message).toBe('An unexpected error occurred');
  });

  it('should return generic message for non-Error types', () => {
    expect(getSafeErrorMessage('string error')).toBe('An unexpected error occurred');
    expect(getSafeErrorMessage(null)).toBe('An unexpected error occurred');
    expect(getSafeErrorMessage(undefined)).toBe('An unexpected error occurred');
    expect(getSafeErrorMessage(123)).toBe('An unexpected error occurred');
    expect(getSafeErrorMessage({})).toBe('An unexpected error occurred');
  });

  it('should handle AuthenticationError', () => {
    const error = new Error('Invalid token');
    error.name = 'AuthenticationError';

    const message = getSafeErrorMessage(error);

    expect(message).toBe('Invalid token');
  });

  it('should not leak stack traces', () => {
    const error = new TypeError('Cannot read property of undefined');

    const message = getSafeErrorMessage(error);

    expect(message).toBe('An unexpected error occurred');
    expect(message).not.toContain('stack');
    expect(message).not.toContain('Cannot read property');
  });

  it('should not leak database errors', () => {
    const error = new Error('ECONNREFUSED: Connection refused to postgres://user:password@localhost');

    const message = getSafeErrorMessage(error);

    expect(message).toBe('An unexpected error occurred');
    expect(message).not.toContain('postgres');
    expect(message).not.toContain('password');
  });
});

describe('Error Stack Trace', () => {
  it('all errors should have stack traces', () => {
    const errors = [
      new AppError(500, 'Error', 'Test'),
      new NotFoundError('Test'),
      new BadRequestError('Test'),
      new ValidationError({}),
      new UnauthorizedError(),
      new ForbiddenError(),
      new ConflictError('Test'),
    ];

    errors.forEach((error) => {
      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('Error');
    });
  });
});

describe('Error instanceof checks', () => {
  it('all errors should be instanceof Error', () => {
    const errors = [
      new AppError(500, 'Error', 'Test'),
      new NotFoundError('Test'),
      new BadRequestError('Test'),
      new ValidationError({}),
      new UnauthorizedError(),
      new ForbiddenError(),
      new ConflictError('Test'),
    ];

    errors.forEach((error) => {
      expect(error).toBeInstanceOf(Error);
    });
  });
});

describe('HTTP Status Codes', () => {
  it('should use standard HTTP status codes', () => {
    expect(new NotFoundError('Test').statusCode).toBe(404);
    expect(new BadRequestError('Test').statusCode).toBe(400);
    expect(new ValidationError({}).statusCode).toBe(400);
    expect(new UnauthorizedError().statusCode).toBe(401);
    expect(new ForbiddenError().statusCode).toBe(403);
    expect(new ConflictError('Test').statusCode).toBe(409);
  });

  it('AppError should support any status code', () => {
    expect(new AppError(200, 'OK', 'Success').statusCode).toBe(200);
    expect(new AppError(301, 'Redirect', 'Moved').statusCode).toBe(301);
    expect(new AppError(500, 'Error', 'Internal').statusCode).toBe(500);
    expect(new AppError(503, 'Unavailable', 'Service down').statusCode).toBe(503);
  });
});
