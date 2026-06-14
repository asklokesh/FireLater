'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AlertCircle, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { authApi } from '@/lib/api';

export default function RegisterPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [formData, setFormData] = useState({
    tenantName: '',
    tenantSlug: '',
    adminName: '',
    adminEmail: '',
    adminPassword: '',
    confirmPassword: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.tenantName.trim()) {
      newErrors.tenantName = 'Organization name is required';
    }

    if (!formData.tenantSlug.trim()) {
      newErrors.tenantSlug = 'Organization slug is required';
    } else if (!/^[a-z0-9-]+$/.test(formData.tenantSlug)) {
      newErrors.tenantSlug = 'Slug can only contain lowercase letters, numbers, and hyphens';
    }

    if (!formData.adminName.trim()) {
      newErrors.adminName = 'Name is required';
    }

    if (!formData.adminEmail.trim()) {
      newErrors.adminEmail = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.adminEmail)) {
      newErrors.adminEmail = 'Invalid email format';
    }

    if (!formData.adminPassword) {
      newErrors.adminPassword = 'Password is required';
    } else if (formData.adminPassword.length < 8) {
      newErrors.adminPassword = 'Password must be at least 8 characters';
    }

    if (formData.adminPassword !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!validateForm()) {
      return;
    }

    setIsLoading(true);

    try {
      await authApi.register({
        tenantName: formData.tenantName,
        tenantSlug: formData.tenantSlug,
        adminName: formData.adminName,
        adminEmail: formData.adminEmail,
        adminPassword: formData.adminPassword,
      });

      setSuccess(true);
      setTimeout(() => {
        router.push('/login');
      }, 2000);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Registration failed. Please try again.';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, [field]: e.target.value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: '' }));
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background py-12 px-4">
        <div className="w-full max-w-md text-center bg-surface rounded-2xl border border-border shadow-sm p-8">
          <div className="flex justify-center mb-4">
            <CheckCircle className="h-16 w-16 text-green-600" />
          </div>
          <h2 className="text-2xl font-semibold tracking-tight text-foreground mb-2">Registration Successful!</h2>
          <p className="text-secondary">
            Your account has been created. Redirecting to login...
          </p>
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
            Create your account
          </h2>
          <p className="text-sm text-secondary mb-6">
            Start managing your IT services today
          </p>
        </div>

        <form className="space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="flex items-center gap-2 bg-error-subtle border border-error/20 text-error rounded-lg px-4 py-3 text-sm">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label htmlFor="tenantName" className="text-sm font-medium text-secondary mb-1.5 block">
                Organization Name
              </label>
              <Input
                id="tenantName"
                type="text"
                placeholder="My Company Inc."
                value={formData.tenantName}
                onChange={handleChange('tenantName')}
                error={errors.tenantName}
                required
              />
            </div>

            <div>
              <label htmlFor="tenantSlug" className="text-sm font-medium text-secondary mb-1.5 block">
                Organization Slug
              </label>
              <Input
                id="tenantSlug"
                type="text"
                placeholder="my-company"
                value={formData.tenantSlug}
                onChange={handleChange('tenantSlug')}
                error={errors.tenantSlug}
                required
              />
              <p className="text-xs text-muted mt-1.5">
                This will be your unique organization identifier (e.g., my-company)
              </p>
            </div>

            <div>
              <label htmlFor="adminName" className="text-sm font-medium text-secondary mb-1.5 block">
                Your Full Name
              </label>
              <Input
                id="adminName"
                type="text"
                placeholder="John Doe"
                value={formData.adminName}
                onChange={handleChange('adminName')}
                error={errors.adminName}
                required
              />
            </div>

            <div>
              <label htmlFor="adminEmail" className="text-sm font-medium text-secondary mb-1.5 block">
                Email address
              </label>
              <Input
                id="adminEmail"
                type="email"
                placeholder="you@company.com"
                value={formData.adminEmail}
                onChange={handleChange('adminEmail')}
                error={errors.adminEmail}
                required
                autoComplete="email"
              />
            </div>

            <div>
              <label htmlFor="adminPassword" className="text-sm font-medium text-secondary mb-1.5 block">
                Password
              </label>
              <Input
                id="adminPassword"
                type="password"
                placeholder="Create a strong password"
                value={formData.adminPassword}
                onChange={handleChange('adminPassword')}
                error={errors.adminPassword}
                required
                autoComplete="new-password"
              />
            </div>

            <div>
              <label htmlFor="confirmPassword" className="text-sm font-medium text-secondary mb-1.5 block">
                Confirm Password
              </label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="Confirm your password"
                value={formData.confirmPassword}
                onChange={handleChange('confirmPassword')}
                error={errors.confirmPassword}
                required
                autoComplete="new-password"
              />
            </div>
          </div>

          <div className="flex items-start">
            <input
              id="terms"
              name="terms"
              type="checkbox"
              required
              className="h-4 w-4 rounded border-border-strong accent-primary cursor-pointer mt-1"
            />
            <label htmlFor="terms" className="ml-2 block text-sm text-foreground">
              I agree to the{' '}
              <a href="#" className="text-primary hover:text-primary-hover transition-colors">
                Terms of Service
              </a>{' '}
              and{' '}
              <a href="#" className="text-primary hover:text-primary-hover transition-colors">
                Privacy Policy
              </a>
            </label>
          </div>

          <Button type="submit" isLoading={isLoading}>
            Create Account
          </Button>

          <p className="text-center text-sm text-secondary">
            Already have an account?{' '}
            <Link href="/login" className="font-medium text-primary hover:text-primary-hover transition-colors">
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
