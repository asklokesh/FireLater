import type { RouteSchemaMap } from './types.js';
import {
  loginSchema, refreshSchema, changePasswordSchema, forgotPasswordSchema, resetPasswordSchema,
  verifyEmailSchema, resendVerificationSchema, registerTenantSchema, registerUserSchema,
} from './auth.js';

const authLimit = { max: 20, timeWindow: '1 minute' };

export const authRouteSchemas: RouteSchemaMap = {
  // Header x-tenant-slug present => register a user in that tenant, otherwise create a tenant.
  'POST /auth/register': {
    body: (req) => (req.headers['x-tenant-slug'] ? registerUserSchema : registerTenantSchema),
    rateLimit: authLimit,
  },
  'POST /auth/login': { body: loginSchema, rateLimit: authLimit },
  'POST /auth/refresh': { body: refreshSchema },
  'PUT /auth/password': { body: changePasswordSchema },
  'POST /auth/forgot-password': { body: forgotPasswordSchema, rateLimit: authLimit },
  'POST /auth/reset-password': { body: resetPasswordSchema, rateLimit: authLimit },
  'POST /auth/verify-email': { body: verifyEmailSchema },
  'POST /auth/resend-verification': { body: resendVerificationSchema, rateLimit: authLimit },
};
