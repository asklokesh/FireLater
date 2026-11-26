import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  tenant: z.string().min(1).optional(), // Optional - can come from header
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1).optional(), // Optional - can come from cookie
  tenant: z.string().min(1).optional(), // Optional - can come from header
});

export const changePasswordSchema = z.object({
  oldPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

export const forgotPasswordSchema = z.object({
  tenant: z.string().min(1),
  email: z.string().email(),
});

export const resetPasswordSchema = z.object({
  tenant: z.string().min(1),
  token: z.string().min(1),
  newPassword: z.string().min(8),
});

export const verifyEmailSchema = z.object({
  tenant: z.string().min(1),
  token: z.string().min(1),
});

export const resendVerificationSchema = z.object({
  tenant: z.string().min(1),
  email: z.string().email(),
});

export const registerTenantSchema = z.object({
  tenantName: z.string().min(2).max(255),
  tenantSlug: z.string().min(2).max(100).regex(/^[a-z0-9-]+$/),
  adminEmail: z.string().email(),
  adminName: z.string().min(2).max(255),
  adminPassword: z.string().min(8),
});

export const registerUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(2).max(255),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;
export type ResendVerificationInput = z.infer<typeof resendVerificationSchema>;
export type RegisterTenantInput = z.infer<typeof registerTenantSchema>;
export type RegisterUserInput = z.infer<typeof registerUserSchema>;
