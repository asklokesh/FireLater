'use client';

import { Suspense } from 'react';
import { useState, FormEvent, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { AlertCircle, CheckCircle, ArrowLeft, Eye, EyeOff, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { authApi } from '@/lib/api';
import { AxiosError } from 'axios';

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [tenant, setTenant] = useState('');
  const [token, setToken] = useState('');

  useEffect(() => {
    const tenantParam = searchParams.get('tenant');
    const tokenParam = searchParams.get('token');
    if (tenantParam) setTenant(tenantParam);
    if (tokenParam) setToken(tokenParam);
  }, [searchParams]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!tenant.trim()) {
      setError('Organization slug is required');
      return;
    }

    if (!token.trim()) {
      setError('Reset token is required');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setIsLoading(true);

    try {
      await authApi.resetPassword(tenant, token, password);
      setSuccess(true);
    } catch (err: unknown) {
      if (err instanceof AxiosError && err.response?.data?.message) {
        setError(err.response.data.message);
      } else {
        const message = err instanceof Error ? err.message : 'Failed to reset password. Please try again.';
        setError(message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background py-12 px-4">
        <div className="w-full max-w-md text-center bg-surface rounded-2xl border border-border shadow-sm p-8">
          <div className="flex justify-center mb-4">
            <CheckCircle className="h-16 w-16 text-success" />
          </div>
          <h2 className="text-2xl font-semibold tracking-tight text-foreground mb-2">Password Reset Successful</h2>
          <p className="text-secondary mb-6">
            Your password has been reset successfully. You can now login with your new password.
          </p>
          <Link href="/login">
            <Button>
              Go to Login
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background py-12 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-md bg-surface rounded-2xl border border-border shadow-sm p-8">
        <div>
          <div className="flex items-center justify-center gap-2 mb-6">
            <div className="h-8 w-8 rounded-lg bg-primary" />
            <span className="text-xl font-semibold tracking-tight text-foreground">
              FireLater
            </span>
          </div>
          <h2 className="text-2xl font-semibold tracking-tight text-foreground mt-6 mb-1">
            Set new password
          </h2>
          <p className="text-sm text-secondary mb-6">
            Enter your new password below.
          </p>
        </div>

        <form className="space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="flex items-center gap-2 bg-error-subtle border border-error/20 text-error rounded-lg px-4 py-3 text-sm">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {!searchParams.get('tenant') && (
            <div>
              <label htmlFor="tenant" className="text-sm font-medium text-secondary mb-1.5 block">
                Organization slug
              </label>
              <Input
                id="tenant"
                type="text"
                placeholder="your-org"
                value={tenant}
                onChange={(e) => setTenant(e.target.value)}
                required
              />
            </div>
          )}

          {!searchParams.get('token') && (
            <div>
              <label htmlFor="token" className="text-sm font-medium text-secondary mb-1.5 block">
                Reset token
              </label>
              <Input
                id="token"
                type="text"
                placeholder="Enter the token from your email"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                required
              />
            </div>
          )}

          <div>
            <label htmlFor="password" className="text-sm font-medium text-secondary mb-1.5 block">
              New password
            </label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Enter new password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="new-password"
              />
              <button
                type="button"
                className="absolute right-3 top-2.5 text-muted hover:text-secondary transition-colors"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="confirmPassword" className="text-sm font-medium text-secondary mb-1.5 block">
              Confirm password
            </label>
            <Input
              id="confirmPassword"
              type={showPassword ? 'text' : 'password'}
              placeholder="Confirm new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
            />
          </div>

          <Button type="submit" isLoading={isLoading}>
            Reset Password
          </Button>

          <div className="text-center">
            <Link
              href="/login"
              className="text-sm font-medium text-primary hover:text-primary-hover transition-colors flex items-center justify-center"
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back to Login
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    }>
      <ResetPasswordContent />
    </Suspense>
  );
}
