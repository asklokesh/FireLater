import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ForgotPasswordPage from '../page';
import { authApi } from '@/lib/api';
import { AxiosError, type InternalAxiosRequestConfig } from 'axios';

// Mock Next.js Link component
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  Flame: () => <div data-testid="flame-icon" />,
  AlertCircle: () => <div data-testid="alert-circle-icon" />,
  CheckCircle: () => <div data-testid="check-circle-icon" />,
  ArrowLeft: () => <div data-testid="arrow-left-icon" />,
  Loader2: () => <div data-testid="loader-icon" />,
}));

// Mock auth API
vi.mock('@/lib/api', () => ({
  authApi: {
    forgotPassword: vi.fn(),
  },
}));

describe('ForgotPasswordPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Initial Render', () => {
    it('renders the forgot password form', () => {
      render(<ForgotPasswordPage />);

      expect(screen.getByText('FireLater')).toBeInTheDocument();
      expect(screen.getByText('Reset your password')).toBeInTheDocument();
      expect(screen.getByText(/Enter your email address/)).toBeInTheDocument();
    });

    it('renders organization slug input', () => {
      render(<ForgotPasswordPage />);

      const input = screen.getByLabelText('Organization slug');
      expect(input).toBeInTheDocument();
      expect(input).toHaveAttribute('type', 'text');
      expect(input).toHaveAttribute('placeholder', 'your-org');
    });

    it('renders email input', () => {
      render(<ForgotPasswordPage />);

      const input = screen.getByLabelText('Email address');
      expect(input).toBeInTheDocument();
      expect(input).toHaveAttribute('type', 'email');
      expect(input).toHaveAttribute('placeholder', 'you@company.com');
    });

    it('renders submit button', () => {
      render(<ForgotPasswordPage />);

      const button = screen.getByRole('button', { name: /Send Reset Link/i });
      expect(button).toBeInTheDocument();
    });

    it('renders back to login link', () => {
      render(<ForgotPasswordPage />);

      const link = screen.getByText(/Back to Login/i);
      expect(link).toBeInTheDocument();
      expect(link.closest('a')).toHaveAttribute('href', '/login');
    });

    it('renders flame icon', () => {
      render(<ForgotPasswordPage />);

      expect(screen.getByTestId('flame-icon')).toBeInTheDocument();
    });
  });

  describe('Form Validation', () => {
    it('shows error when organization slug is empty', async () => {
      render(<ForgotPasswordPage />);

      const emailInput = screen.getByLabelText('Email address');
      fireEvent.change(emailInput, { target: { value: 'test@example.com' } });

      const form = screen.getByRole('button', { name: /Send Reset Link/i }).closest('form');
      fireEvent.submit(form!);

      await waitFor(() => {
        expect(screen.getByText('Organization slug is required')).toBeInTheDocument();
      });

      expect(authApi.forgotPassword).not.toHaveBeenCalled();
    });

    it('shows error when email is empty', async () => {
      render(<ForgotPasswordPage />);

      const tenantInput = screen.getByLabelText('Organization slug');
      fireEvent.change(tenantInput, { target: { value: 'test-org' } });

      const form = screen.getByRole('button', { name: /Send Reset Link/i }).closest('form');
      fireEvent.submit(form!);

      await waitFor(() => {
        expect(screen.getByText('Email is required')).toBeInTheDocument();
      });

      expect(authApi.forgotPassword).not.toHaveBeenCalled();
    });

    it('shows error for invalid email format', async () => {
      render(<ForgotPasswordPage />);

      const tenantInput = screen.getByLabelText('Organization slug');
      fireEvent.change(tenantInput, { target: { value: 'test-org' } });

      const emailInput = screen.getByLabelText('Email address');
      fireEvent.change(emailInput, { target: { value: 'invalid-email' } });

      const form = screen.getByRole('button', { name: /Send Reset Link/i }).closest('form');
      fireEvent.submit(form!);

      await waitFor(() => {
        expect(screen.getByText('Please enter a valid email address')).toBeInTheDocument();
      });

      expect(authApi.forgotPassword).not.toHaveBeenCalled();
    });

    it('trims whitespace from inputs during validation', async () => {
      render(<ForgotPasswordPage />);

      const tenantInput = screen.getByLabelText('Organization slug');
      fireEvent.change(tenantInput, { target: { value: '   ' } });

      const form = screen.getByRole('button', { name: /Send Reset Link/i }).closest('form');
      fireEvent.submit(form!);

      await waitFor(() => {
        expect(screen.getByText('Organization slug is required')).toBeInTheDocument();
      });
    });
  });

  describe('Successful Password Reset Request', () => {
    it('calls forgotPassword API with correct parameters', async () => {
      vi.mocked(authApi.forgotPassword).mockResolvedValue(undefined);

      render(<ForgotPasswordPage />);

      const tenantInput = screen.getByLabelText('Organization slug');
      fireEvent.change(tenantInput, { target: { value: 'test-org' } });

      const emailInput = screen.getByLabelText('Email address');
      fireEvent.change(emailInput, { target: { value: 'test@example.com' } });

      const submitButton = screen.getByRole('button', { name: /Send Reset Link/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(authApi.forgotPassword).toHaveBeenCalledWith('test-org', 'test@example.com');
      });
    });

    it('displays success message after successful submission', async () => {
      vi.mocked(authApi.forgotPassword).mockResolvedValue(undefined);

      render(<ForgotPasswordPage />);

      const tenantInput = screen.getByLabelText('Organization slug');
      fireEvent.change(tenantInput, { target: { value: 'test-org' } });

      const emailInput = screen.getByLabelText('Email address');
      fireEvent.change(emailInput, { target: { value: 'test@example.com' } });

      const submitButton = screen.getByRole('button', { name: /Send Reset Link/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Check your email')).toBeInTheDocument();
      });

      expect(screen.getByText(/We've sent a password reset link to/)).toBeInTheDocument();
      expect(screen.getByText('test@example.com')).toBeInTheDocument();
    });

    it('displays check circle icon on success', async () => {
      vi.mocked(authApi.forgotPassword).mockResolvedValue(undefined);

      render(<ForgotPasswordPage />);

      const tenantInput = screen.getByLabelText('Organization slug');
      fireEvent.change(tenantInput, { target: { value: 'test-org' } });

      const emailInput = screen.getByLabelText('Email address');
      fireEvent.change(emailInput, { target: { value: 'test@example.com' } });

      const submitButton = screen.getByRole('button', { name: /Send Reset Link/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByTestId('check-circle-icon')).toBeInTheDocument();
      });
    });

    it('shows try again button on success screen', async () => {
      vi.mocked(authApi.forgotPassword).mockResolvedValue(undefined);

      render(<ForgotPasswordPage />);

      const tenantInput = screen.getByLabelText('Organization slug');
      fireEvent.change(tenantInput, { target: { value: 'test-org' } });

      const emailInput = screen.getByLabelText('Email address');
      fireEvent.change(emailInput, { target: { value: 'test@example.com' } });

      const submitButton = screen.getByRole('button', { name: /Send Reset Link/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Check your email')).toBeInTheDocument();
      });

      const tryAgainButton = screen.getByRole('button', { name: /try again/i });
      expect(tryAgainButton).toBeInTheDocument();
    });

    it('returns to form when try again is clicked', async () => {
      vi.mocked(authApi.forgotPassword).mockResolvedValue(undefined);

      render(<ForgotPasswordPage />);

      const tenantInput = screen.getByLabelText('Organization slug');
      fireEvent.change(tenantInput, { target: { value: 'test-org' } });

      const emailInput = screen.getByLabelText('Email address');
      fireEvent.change(emailInput, { target: { value: 'test@example.com' } });

      const submitButton = screen.getByRole('button', { name: /Send Reset Link/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Check your email')).toBeInTheDocument();
      });

      const tryAgainButton = screen.getByRole('button', { name: /try again/i });
      fireEvent.click(tryAgainButton);

      await waitFor(() => {
        expect(screen.getByText('Reset your password')).toBeInTheDocument();
      });

      expect(screen.queryByText('Check your email')).not.toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    it('displays error message from API response', async () => {
      const errorMessage = 'User not found';
      const axiosError = new AxiosError(
        errorMessage,
        'ERR_BAD_REQUEST',
        undefined,
        undefined,
        {
          status: 404,
          statusText: 'Not Found',
          data: { message: errorMessage },
          headers: {},
          config: {} as InternalAxiosRequestConfig,
        }
      );
      vi.mocked(authApi.forgotPassword).mockRejectedValue(axiosError);

      render(<ForgotPasswordPage />);

      const tenantInput = screen.getByLabelText('Organization slug');
      fireEvent.change(tenantInput, { target: { value: 'test-org' } });

      const emailInput = screen.getByLabelText('Email address');
      fireEvent.change(emailInput, { target: { value: 'test@example.com' } });

      const submitButton = screen.getByRole('button', { name: /Send Reset Link/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(errorMessage)).toBeInTheDocument();
      });

      expect(screen.getByTestId('alert-circle-icon')).toBeInTheDocument();
    });

    it('displays generic error message for Error instances', async () => {
      vi.mocked(authApi.forgotPassword).mockRejectedValue(new Error('Network error'));

      render(<ForgotPasswordPage />);

      const tenantInput = screen.getByLabelText('Organization slug');
      fireEvent.change(tenantInput, { target: { value: 'test-org' } });

      const emailInput = screen.getByLabelText('Email address');
      fireEvent.change(emailInput, { target: { value: 'test@example.com' } });

      const submitButton = screen.getByRole('button', { name: /Send Reset Link/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument();
      });
    });

    it('displays fallback error message for unknown errors', async () => {
      vi.mocked(authApi.forgotPassword).mockRejectedValue('Unknown error');

      render(<ForgotPasswordPage />);

      const tenantInput = screen.getByLabelText('Organization slug');
      fireEvent.change(tenantInput, { target: { value: 'test-org' } });

      const emailInput = screen.getByLabelText('Email address');
      fireEvent.change(emailInput, { target: { value: 'test@example.com' } });

      const submitButton = screen.getByRole('button', { name: /Send Reset Link/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Failed to send reset email. Please try again.')).toBeInTheDocument();
      });
    });

    it('clears error when resubmitting form', async () => {
      const errorMessage = 'User not found';
      const axiosError = new AxiosError(
        errorMessage,
        'ERR_BAD_REQUEST',
        undefined,
        undefined,
        {
          status: 404,
          statusText: 'Not Found',
          data: { message: errorMessage },
          headers: {},
          config: {} as InternalAxiosRequestConfig,
        }
      );
      vi.mocked(authApi.forgotPassword).mockRejectedValueOnce(axiosError).mockResolvedValueOnce(undefined);

      render(<ForgotPasswordPage />);

      const tenantInput = screen.getByLabelText('Organization slug');
      fireEvent.change(tenantInput, { target: { value: 'test-org' } });

      const emailInput = screen.getByLabelText('Email address');
      fireEvent.change(emailInput, { target: { value: 'wrong@example.com' } });

      const submitButton = screen.getByRole('button', { name: /Send Reset Link/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('User not found')).toBeInTheDocument();
      });

      fireEvent.change(emailInput, { target: { value: 'correct@example.com' } });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.queryByText('User not found')).not.toBeInTheDocument();
        expect(screen.getByText('Check your email')).toBeInTheDocument();
      });
    });
  });

  describe('Loading State', () => {
    it('disables button and shows loading state during submission', async () => {
      let resolvePromise: () => void;
      const promise = new Promise<void>((resolve) => {
        resolvePromise = resolve;
      });

      vi.mocked(authApi.forgotPassword).mockReturnValue(promise);

      render(<ForgotPasswordPage />);

      const tenantInput = screen.getByLabelText('Organization slug');
      fireEvent.change(tenantInput, { target: { value: 'test-org' } });

      const emailInput = screen.getByLabelText('Email address');
      fireEvent.change(emailInput, { target: { value: 'test@example.com' } });

      const submitButton = screen.getByRole('button', { name: /Send Reset Link/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(submitButton).toBeDisabled();
      });

      resolvePromise!();

      await waitFor(() => {
        expect(screen.getByText('Check your email')).toBeInTheDocument();
      });
    });
  });

  describe('Navigation', () => {
    it('has back to login link in form view', () => {
      render(<ForgotPasswordPage />);

      const links = screen.getAllByText(/Back to Login/i);
      expect(links).toHaveLength(1);
      expect(links[0].closest('a')).toHaveAttribute('href', '/login');
    });

    it('has back to login button in success view', async () => {
      vi.mocked(authApi.forgotPassword).mockResolvedValue(undefined);

      render(<ForgotPasswordPage />);

      const tenantInput = screen.getByLabelText('Organization slug');
      fireEvent.change(tenantInput, { target: { value: 'test-org' } });

      const emailInput = screen.getByLabelText('Email address');
      fireEvent.change(emailInput, { target: { value: 'test@example.com' } });

      const submitButton = screen.getByRole('button', { name: /Send Reset Link/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Check your email')).toBeInTheDocument();
      });

      const backButton = screen.getByRole('button', { name: /Back to Login/i });
      expect(backButton.closest('a')).toHaveAttribute('href', '/login');
    });
  });
});
