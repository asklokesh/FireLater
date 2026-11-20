'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthStore } from '@/stores/auth';
import { useT } from '@/i18n/useT';
import { LanguageSwitcher } from '@/components/i18n/LanguageSwitcher';

export default function LoginPage() {
  const router = useRouter();
  const t = useT('auth.login');
  const { login, isLoading, error, clearError } = useAuthStore();
  const [tenant, setTenant] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    clearError();

    try {
      await login(tenant, email, password);
      router.push('/dashboard');
    } catch {
      // Error is handled by the store
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background py-12 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-md bg-surface rounded-2xl border border-border shadow-sm p-8">
        <div>
          <div className="flex justify-end mb-2">
            <LanguageSwitcher />
          </div>
          <div className="flex items-center justify-center gap-2 mb-6">
            <div className="h-8 w-8 rounded-lg bg-primary" />
            <span className="text-xl font-semibold tracking-tight text-foreground">
              FireLater
            </span>
          </div>
          <h2 className="text-2xl font-semibold tracking-tight text-foreground mt-6 mb-1">
            {t('title')}
          </h2>
          <p className="text-sm text-secondary mb-6">
            {t('subtitle')}
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
              <label htmlFor="tenant" className="text-sm font-medium text-secondary mb-1.5 block">
                {t('organization')}
              </label>
              <Input
                id="tenant"
                type="text"
                placeholder="your-organization"
                value={tenant}
                onChange={(e) => setTenant(e.target.value.toLowerCase())}
                required
              />
              <p className="text-xs text-muted mt-1.5">
                {t('organizationHint')}
              </p>
            </div>

            <div>
              <label htmlFor="email" className="text-sm font-medium text-secondary mb-1.5 block">
                {t('email')}
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

            <div>
              <label htmlFor="password" className="text-sm font-medium text-secondary mb-1.5 block">
                {t('password')}
              </label>
              <Input
                id="password"
                type="password"
                placeholder={t('passwordPlaceholder')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <input
                id="remember-me"
                name="remember-me"
                type="checkbox"
                className="h-4 w-4 rounded border-border-strong accent-primary cursor-pointer"
              />
              <label htmlFor="remember-me" className="ms-2 block text-sm text-foreground">
                {t('rememberMe')}
              </label>
            </div>

            <div className="text-sm">
              <Link href="/forgot-password" className="font-medium text-primary hover:text-primary-hover transition-colors">
                {t('forgotPassword')}
              </Link>
            </div>
          </div>

          <Button type="submit" isLoading={isLoading}>
            {t('signIn')}
          </Button>

          <p className="text-center text-sm text-secondary">
            {t('noAccount')}{' '}
            <Link href="/register" className="font-medium text-primary hover:text-primary-hover transition-colors">
              {t('signUp')}
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
