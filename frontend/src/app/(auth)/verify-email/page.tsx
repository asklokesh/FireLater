'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Flame, CheckCircle, XCircle, Loader2, Mail } from 'lucide-react';
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
      <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4">
        <div className="max-w-md w-full text-center">
          <div className="flex justify-center mb-6">
            <div className="flex items-center space-x-2">
              <Flame className="h-10 w-10 text-orange-500" />
              <span className="text-3xl font-bold text-gray-900">FireLater</span>
            </div>
          </div>
          <div className="flex justify-center mb-4">
            <Loader2 className="h-12 w-12 text-blue-500 animate-spin" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Verifying your email</h2>
          <p className="text-gray-600">Please wait while we verify your email address...</p>
        </div>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4">
        <div className="max-w-md w-full text-center">
          <div className="flex justify-center mb-6">
            <div className="flex items-center space-x-2">
              <Flame className="h-10 w-10 text-orange-500" />
              <span className="text-3xl font-bold text-gray-900">FireLater</span>
            </div>
          </div>
          <div className="flex justify-center mb-4">
            <CheckCircle className="h-16 w-16 text-green-500" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Email Verified</h2>
          <p className="text-gray-600 mb-6">
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
      <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4">
        <div className="max-w-md w-full text-center">
          <div className="flex justify-center mb-6">
            <div className="flex items-center space-x-2">
              <Flame className="h-10 w-10 text-orange-500" />
              <span className="text-3xl font-bold text-gray-900">FireLater</span>
            </div>
          </div>
          <div className="flex justify-center mb-4">
            <XCircle className="h-16 w-16 text-red-500" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Verification Failed</h2>
          <p className="text-gray-600 mb-6">
            {error || 'The verification link is invalid or has expired.'}
          </p>
          <div className="space-y-4">
            <Button onClick={() => setStatus('resend')} variant="outline" className="w-full">
              Request New Verification Link
            </Button>
            <Link href="/login">
              <Button variant="ghost" className="w-full">Back to Login</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Resend form
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <div className="flex justify-center">
            <div className="flex items-center space-x-2">
              <Flame className="h-10 w-10 text-orange-500" />
              <span className="text-3xl font-bold text-gray-900">FireLater</span>
            </div>
          </div>
          <div className="flex justify-center mt-6">
            <Mail className="h-16 w-16 text-blue-500" />
          </div>
          <h2 className="mt-4 text-center text-2xl font-bold text-gray-900">
            Verify Your Email
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Enter your email to receive a new verification link
          </p>
        </div>

        {resendSuccess ? (
          <div className="bg-green-50 border border-green-200 rounded-md p-4 text-center">
            <CheckCircle className="h-8 w-8 text-green-500 mx-auto mb-2" />
            <p className="text-green-800">
              If your email is registered and not yet verified, a new verification link has been sent.
            </p>
            <Link href="/login" className="mt-4 inline-block">
              <Button>Back to Login</Button>
            </Link>
          </div>
        ) : (
          <form className="mt-8 space-y-6" onSubmit={handleResend}>
            {error && (
              <div className="flex items-center gap-2 p-3 text-sm text-red-800 bg-red-100 rounded-md">
                <XCircle className="h-4 w-4" />
                {error}
              </div>
            )}

            <div className="space-y-4">
              <Input
                id="tenant"
                type="text"
                label="Organization Slug"
                placeholder="my-company"
                value={tenant || ''}
                disabled={!!tenant}
                onChange={() => {}}
                required
              />

              <Input
                id="email"
                type="email"
                label="Email Address"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </div>

            <Button type="submit" className="w-full" isLoading={isLoading}>
              Send Verification Link
            </Button>

            <p className="text-center text-sm text-gray-600">
              <Link href="/login" className="font-medium text-blue-600 hover:text-blue-500">
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
      <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4">
        <div className="max-w-md w-full text-center">
          <div className="flex justify-center mb-4">
            <Loader2 className="h-12 w-12 text-blue-500 animate-spin" />
          </div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    }>
      <VerifyEmailContent />
    </Suspense>
  );
}
