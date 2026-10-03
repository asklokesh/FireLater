import type { ZodTypeAny } from 'zod';
import {
  loginBodySchema,
  refreshBodySchema,
  changePasswordBodySchema,
  forgotPasswordBodySchema,
  resetPasswordBodySchema,
  verifyEmailBodySchema,
  resendVerificationBodySchema,
} from './auth.js';

export interface RouteSchema {
  body?: ZodTypeAny;
  params?: ZodTypeAny;
  query?: ZodTypeAny;
}

// Keys are "METHOD /route" using the full route pattern (including prefix).
export const schemaRegistry: Record<string, RouteSchema> = {
  'POST /auth/login': { body: loginBodySchema },
  'POST /auth/refresh': { body: refreshBodySchema },
  'PUT /auth/password': { body: changePasswordBodySchema },
  'POST /auth/forgot-password': { body: forgotPasswordBodySchema },
  'POST /auth/reset-password': { body: resetPasswordBodySchema },
  'POST /auth/verify-email': { body: verifyEmailBodySchema },
  'POST /auth/resend-verification': { body: resendVerificationBodySchema },
};

export function routeKey(method: string, url: string): string {
  return `${method.toUpperCase()} ${url}`;
}

export function getRouteSchema(method: string, url: string): RouteSchema | undefined {
  return schemaRegistry[routeKey(method, url)];
}

export * from './common.js';
export * from './auth.js';
