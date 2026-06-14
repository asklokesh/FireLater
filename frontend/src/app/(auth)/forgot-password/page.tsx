'use client';

import { useState, FormEvent } from 'react';
import Link from 'next/link';
import { AlertCircle, CheckCircle, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { authApi } from '@/lib/api';
import { AxiosError } from 'axios';

export default function ForgotPasswordPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [email, setEmail] = useState('');
  const [tenant, setTenant] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!tenant.trim()) {
      setError('Organization slug is required');
      return;
    }

    if (!email.trim()) {
      setError('Email is required');
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Please enter a valid email address');
      return;
    }

    setIsLoading(true);

    try {
      await authApi.forgotPassword(tenant, email);
      setSuccess(true);
    } catch (err: unknown) {
      if (err instanceof AxiosError && err.response?.data?.message) {
        setError(err.response.data.message);
      } else {
        const message = err instanceof Error ? err.message : 'Failed to send reset email. Please try again.';
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
          <h2 className="text-2xl font-semibold tracking-tight text-foreground mb-2">Check your email</h2>
          <p className="text-secondary mb-6">
            We&apos;ve sent a password reset link to <strong>{email}</strong>.
            Please check your inbox and follow the instructions.
          </p>
          <p className="text-sm text-muted mb-6">
            Didn&apos;t receive the email? Check your spam folder or{' '}
            <button
              onClick={() => setSuccess(false)}
              className="text-primary hover:text-primary-hover transition-colors"
            >
              try again
            </button>
          </p>
          <Link href="/login">
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Login
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
            Reset your password
          </h2>
          <p className="text-sm text-secondary mb-6">
            Enter your email address and we&apos;ll send you a link to reset your password.
          </p>
        </div>

        <form className="space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="flex items-center gap-2 bg-error-subtle border border-error/20 text-error rounded-lg px-4 py-3 text-sm">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {error}
            </div>
          )}

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

          <div>
            <label htmlFor="email" className="text-sm font-medium text-secondary mb-1.5 block">
              Email address
            </label>
            <Input
              id="email"
              type="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          <Button type="submit" isLoading={isLoading}>
            Send Reset Link
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
