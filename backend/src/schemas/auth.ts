import { z } from 'zod';

export const loginBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  tenant: z.string().min(1).optional(),
});

export const refreshBodySchema = z.object({
  refreshToken: z.string().min(1).optional(),
  tenant: z.string().min(1).optional(),
});

export const changePasswordBodySchema = z.object({
  oldPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

export const forgotPasswordBodySchema = z.object({
  tenant: z.string().min(1),
  email: z.string().email(),
});

export const resetPasswordBodySchema = z.object({
  tenant: z.string().min(1),
  token: z.string().min(1),
  newPassword: z.string().min(8),
});

export const verifyEmailBodySchema = z.object({
  tenant: z.string().min(1),
  token: z.string().min(1),
});

export const resendVerificationBodySchema = z.object({
  tenant: z.string().min(1),
  email: z.string().email(),
});

export type LoginBody = z.infer<typeof loginBodySchema>;
export type RefreshBody = z.infer<typeof refreshBodySchema>;
export type ChangePasswordBody = z.infer<typeof changePasswordBodySchema>;
export type ForgotPasswordBody = z.infer<typeof forgotPasswordBodySchema>;
export type ResetPasswordBody = z.infer<typeof resetPasswordBodySchema>;
export type VerifyEmailBody = z.infer<typeof verifyEmailBodySchema>;
export type ResendVerificationBody = z.infer<typeof resendVerificationBodySchema>;
