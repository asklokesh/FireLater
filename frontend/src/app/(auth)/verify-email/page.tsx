'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle, XCircle, Loader2, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { authApi } from '@/lib/api';

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<'verifying' | 'success' | 'error' | 'resend'>('verifying');
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);

  const token = searchParams.get('token');
  const tenant = searchParams.get('tenant');

  useEffect(() => {
    if (!token || !tenant) {
      setStatus('resend');
      return;
    }

    const verifyEmail = async () => {
      try {
        await authApi.verifyEmail(tenant, token);
        setStatus('success');
        setTimeout(() => {
          router.push('/login');
        }, 3000);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Verification failed. The link may be expired or invalid.';
        setError(message);
        setStatus('error');
      }
    };

    verifyEmail();
  }, [token, tenant, router]);

  const handleResend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !tenant) return;

    setIsLoading(true);
    setError(null);

    try {
      await authApi.resendVerification(tenant, email);
      setResendSuccess(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to send verification email.';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  if (status === 'verifying') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background py-12 px-4">
        <div className="w-full max-w-md text-center bg-surface rounded-2xl border border-border shadow-sm p-8">
          <div className="flex items-center justify-center gap-2 mb-6">
            <div className="h-8 w-8 rounded-lg bg-primary" />
            <span className="text-xl font-semibold tracking-tight text-foreground">
              FireLater
            </span>
          </div>
          <div className="flex justify-center mb-4">
            <Loader2 className="h-12 w-12 text-primary animate-spin" />
          </div>
          <h2 className="text-2xl font-semibold tracking-tight text-foreground mb-2">Verifying your email</h2>
          <p className="text-secondary">Please wait while we verify your email address...</p>
        </div>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background py-12 px-4">
        <div className="w-full max-w-md text-center bg-surface rounded-2xl border border-border shadow-sm p-8">
          <div className="flex items-center justify-center gap-2 mb-6">
            <div className="h-8 w-8 rounded-lg bg-primary" />
            <span className="text-xl font-semibold tracking-tight text-foreground">
              FireLater
            </span>
          </div>
          <div className="flex justify-center mb-4">
            <CheckCircle className="h-16 w-16 text-green-600" />
          </div>
          <h2 className="text-2xl font-semibold tracking-tight text-foreground mb-2">Email Verified</h2>
          <p className="text-secondary mb-6">
            Your email has been verified successfully. Redirecting to login...
          </p>
          <Link href="/login">
            <Button>Go to Login</Button>
          </Link>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background py-12 px-4">
        <div className="w-full max-w-md text-center bg-surface rounded-2xl border border-border shadow-sm p-8">
          <div className="flex items-center justify-center gap-2 mb-6">
            <div className="h-8 w-8 rounded-lg bg-primary" />
            <span className="text-xl font-semibold tracking-tight text-foreground">
              FireLater
            </span>
          </div>
          <div className="flex justify-center mb-4">
            <XCircle className="h-16 w-16 text-error" />
          </div>
          <h2 className="text-2xl font-semibold tracking-tight text-foreground mb-2">Verification Failed</h2>
          <p className="text-secondary mb-6">
            {error || 'The verification link is invalid or has expired.'}
          </p>
          <div className="space-y-4">
            <Button onClick={() => setStatus('resend')} variant="outline">
              Request New Verification Link
            </Button>
            <Link href="/login">
              <Button variant="ghost">Back to Login</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Resend form
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
          <div className="flex justify-center mt-6">
            <Mail className="h-16 w-16 text-primary" />
          </div>
          <h2 className="mt-4 text-center text-2xl font-semibold tracking-tight text-foreground">
            Verify Your Email
          </h2>
          <p className="mt-2 text-center text-sm text-secondary">
            Enter your email to receive a new verification link
          </p>
        </div>

        {resendSuccess ? (
          <div className="mt-8 bg-success-subtle border border-success/20 rounded-lg p-4 text-center">
            <CheckCircle className="h-8 w-8 text-green-600 mx-auto mb-2" />
            <p className="text-success">
              If your email is registered and not yet verified, a new verification link has been sent.
            </p>
            <Link href="/login" className="mt-4 inline-block">
              <Button>Back to Login</Button>
            </Link>
          </div>
        ) : (
          <form className="mt-8 space-y-6" onSubmit={handleResend}>
            {error && (
              <div className="flex items-center gap-2 bg-error-subtle border border-error/20 text-error rounded-lg px-4 py-3 text-sm">
                <XCircle className="h-4 w-4 flex-shrink-0" />
                {error}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label htmlFor="tenant" className="text-sm font-medium text-secondary mb-1.5 block">
                  Organization Slug
                </label>
                <Input
                  id="tenant"
                  type="text"
                  placeholder="my-company"
                  value={tenant || ''}
                  disabled={!!tenant}
                  onChange={() => {}}
                  required
                />
              </div>

              <div>
                <label htmlFor="email" className="text-sm font-medium text-secondary mb-1.5 block">
                  Email Address
                </label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
              </div>
            </div>

            <Button type="submit" isLoading={isLoading}>
              Send Verification Link
            </Button>

            <p className="text-center text-sm text-secondary">
              <Link href="/login" className="font-medium text-primary hover:text-primary-hover transition-colors">
                Back to Login
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-background py-12 px-4">
        <div className="w-full max-w-md text-center">
          <div className="flex justify-center mb-4">
            <Loader2 className="h-12 w-12 text-primary animate-spin" />
          </div>
          <p className="text-secondary">Loading...</p>
        </div>
      </div>
    }>
      <VerifyEmailContent />
    </Suspense>
  );
}
