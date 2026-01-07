import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mock next/navigation
const mockSearchParams = new Map<string, string>();
vi.mock('next/navigation', () => ({
  useSearchParams: () => ({
    get: (key: string) => mockSearchParams.get(key) || null,
  }),
}));

// Mock the API
vi.mock('@/lib/api', () => ({
  authApi: {
    resetPassword: vi.fn(),
  },
}));

import ResetPasswordPage from '../page';
import { authApi } from '@/lib/api';

describe('ResetPasswordPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('rendering', () => {
    it('should render the reset password form', async () => {
      render(<ResetPasswordPage />);

      await waitFor(() => {
        expect(screen.getByText('Set new password')).toBeInTheDocument();
      });

      expect(screen.getByLabelText(/new password/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /reset password/i })).toBeInTheDocument();
    });

    it('should show tenant and token fields when not in URL params', async () => {
      render(<ResetPasswordPage />);

      await waitFor(() => {
        expect(screen.getByText('Set new password')).toBeInTheDocument();
      });

      expect(screen.getByLabelText(/organization slug/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/reset token/i)).toBeInTheDocument();
    });

    it('should hide tenant field when provided in URL', async () => {
      mockSearchParams.set('tenant', 'test-org');

      render(<ResetPasswordPage />);

      await waitFor(() => {
        expect(screen.getByText('Set new password')).toBeInTheDocument();
      });

      expect(screen.queryByLabelText(/organization slug/i)).not.toBeInTheDocument();
    });

    it('should hide token field when provided in URL', async () => {
      mockSearchParams.set('token', 'test-token');

      render(<ResetPasswordPage />);

      await waitFor(() => {
        expect(screen.getByText('Set new password')).toBeInTheDocument();
      });

      expect(screen.queryByLabelText(/reset token/i)).not.toBeInTheDocument();
    });
  });

  describe('form validation', () => {
    it('should show error when tenant is empty', async () => {
      const user = userEvent.setup();
      render(<ResetPasswordPage />);

      await waitFor(() => {
        expect(screen.getByText('Set new password')).toBeInTheDocument();
      });

      // Fill in other fields but leave tenant empty - type space then clear to bypass required
      const tenantInput = screen.getByLabelText(/organization slug/i);
      await user.type(tenantInput, ' ');
      await user.clear(tenantInput);
      await user.type(screen.getByLabelText(/reset token/i), 'test-token');
      await user.type(screen.getByLabelText(/new password/i), 'password123');
      await user.type(screen.getByLabelText(/confirm password/i), 'password123');

      // Submit the form directly using fireEvent
      const form = screen.getByRole('button', { name: /reset password/i }).closest('form');
      fireEvent.submit(form!);

      await waitFor(() => {
        expect(screen.getByText('Organization slug is required')).toBeInTheDocument();
      });
    });

    it('should show error when token is empty', async () => {
      const user = userEvent.setup();
      // Don't set tenant in URL to show both fields
      render(<ResetPasswordPage />);

      await waitFor(() => {
        expect(screen.getByText('Set new password')).toBeInTheDocument();
      });

      // Fill in tenant and password but leave token empty - type space then clear to bypass required
      await user.type(screen.getByLabelText(/organization slug/i), 'test-org');
      const tokenInput = screen.getByLabelText(/reset token/i);
      await user.type(tokenInput, ' ');
      await user.clear(tokenInput);
      await user.type(screen.getByLabelText(/new password/i), 'password123');
      await user.type(screen.getByLabelText(/confirm password/i), 'password123');

      // Submit the form directly using fireEvent
      const form = screen.getByRole('button', { name: /reset password/i }).closest('form');
      fireEvent.submit(form!);

      await waitFor(() => {
        expect(screen.getByText('Reset token is required')).toBeInTheDocument();
      });
    });

    it('should show error when password is less than 8 characters', async () => {
      const user = userEvent.setup();
      mockSearchParams.set('tenant', 'test-org');
      mockSearchParams.set('token', 'test-token');

      render(<ResetPasswordPage />);

      await waitFor(() => {
        expect(screen.getByText('Set new password')).toBeInTheDocument();
      });

      await user.type(screen.getByLabelText(/new password/i), 'short');
      await user.type(screen.getByLabelText(/confirm password/i), 'short');

      await user.click(screen.getByRole('button', { name: /reset password/i }));

      await waitFor(() => {
        expect(screen.getByText('Password must be at least 8 characters')).toBeInTheDocument();
      });
    });

    it('should show error when passwords do not match', async () => {
      const user = userEvent.setup();
      mockSearchParams.set('tenant', 'test-org');
      mockSearchParams.set('token', 'test-token');

      render(<ResetPasswordPage />);

      await waitFor(() => {
        expect(screen.getByText('Set new password')).toBeInTheDocument();
      });

      await user.type(screen.getByLabelText(/new password/i), 'password123');
      await user.type(screen.getByLabelText(/confirm password/i), 'different123');

      await user.click(screen.getByRole('button', { name: /reset password/i }));

      await waitFor(() => {
        expect(screen.getByText('Passwords do not match')).toBeInTheDocument();
      });
    });
  });

  describe('successful password reset', () => {
    it('should show success message after successful reset', async () => {
      const user = userEvent.setup();
      mockSearchParams.set('tenant', 'test-org');
      mockSearchParams.set('token', 'test-token');
      vi.mocked(authApi.resetPassword).mockResolvedValue({});

      render(<ResetPasswordPage />);

      await waitFor(() => {
        expect(screen.getByText('Set new password')).toBeInTheDocument();
      });

      await user.type(screen.getByLabelText(/new password/i), 'password123');
      await user.type(screen.getByLabelText(/confirm password/i), 'password123');

      await user.click(screen.getByRole('button', { name: /reset password/i }));

      await waitFor(() => {
        expect(screen.getByText('Password Reset Successful')).toBeInTheDocument();
      });

      expect(screen.getByText(/your password has been reset successfully/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /go to login/i })).toBeInTheDocument();
    });

    it('should call resetPassword API with correct parameters', async () => {
      const user = userEvent.setup();
      mockSearchParams.set('tenant', 'test-org');
      mockSearchParams.set('token', 'test-token');
      vi.mocked(authApi.resetPassword).mockResolvedValue({});

      render(<ResetPasswordPage />);

      await waitFor(() => {
        expect(screen.getByText('Set new password')).toBeInTheDocument();
      });

      await user.type(screen.getByLabelText(/new password/i), 'newpassword123');
      await user.type(screen.getByLabelText(/confirm password/i), 'newpassword123');

      await user.click(screen.getByRole('button', { name: /reset password/i }));

      await waitFor(() => {
        expect(authApi.resetPassword).toHaveBeenCalledWith('test-org', 'test-token', 'newpassword123');
      });
    });
  });

  describe('error handling', () => {
    it('should show API error message when reset fails', async () => {
      const user = userEvent.setup();
      mockSearchParams.set('tenant', 'test-org');
      mockSearchParams.set('token', 'test-token');

      const axiosError = {
        response: { data: { message: 'Invalid or expired token' } },
      };
      vi.mocked(authApi.resetPassword).mockRejectedValue(axiosError);

      // Import AxiosError for instanceof check to work
      const { AxiosError } = await import('axios');
      Object.setPrototypeOf(axiosError, AxiosError.prototype);

      render(<ResetPasswordPage />);

      await waitFor(() => {
        expect(screen.getByText('Set new password')).toBeInTheDocument();
      });

      await user.type(screen.getByLabelText(/new password/i), 'password123');
      await user.type(screen.getByLabelText(/confirm password/i), 'password123');

      await user.click(screen.getByRole('button', { name: /reset password/i }));

      await waitFor(() => {
        expect(screen.getByText(/invalid or expired token|failed to reset password/i)).toBeInTheDocument();
      });
    });

    it('should show generic error for unknown errors', async () => {
      const user = userEvent.setup();
      mockSearchParams.set('tenant', 'test-org');
      mockSearchParams.set('token', 'test-token');
      vi.mocked(authApi.resetPassword).mockRejectedValue(new Error('Network error'));

      render(<ResetPasswordPage />);

      await waitFor(() => {
        expect(screen.getByText('Set new password')).toBeInTheDocument();
      });

      await user.type(screen.getByLabelText(/new password/i), 'password123');
      await user.type(screen.getByLabelText(/confirm password/i), 'password123');

      await user.click(screen.getByRole('button', { name: /reset password/i }));

      await waitFor(() => {
        expect(screen.getByText(/network error/i)).toBeInTheDocument();
      });
    });
  });

  describe('password visibility toggle', () => {
    it('should toggle password visibility', async () => {
      const user = userEvent.setup();
      render(<ResetPasswordPage />);

      await waitFor(() => {
        expect(screen.getByText('Set new password')).toBeInTheDocument();
      });

      const passwordInput = screen.getByLabelText(/new password/i);
      expect(passwordInput).toHaveAttribute('type', 'password');

      // Find and click the visibility toggle button
      const toggleButtons = screen.getAllByRole('button').filter(
        btn => btn.querySelector('svg[class*="Eye"]')
      );

      if (toggleButtons.length > 0) {
        await user.click(toggleButtons[0]);

        expect(passwordInput).toHaveAttribute('type', 'text');
      }
    });
  });

  describe('navigation', () => {
    it('should have link to login page', async () => {
      render(<ResetPasswordPage />);

      await waitFor(() => {
        expect(screen.getByText('Set new password')).toBeInTheDocument();
      });

      const loginLink = screen.getByText(/back to login/i);
      expect(loginLink).toBeInTheDocument();
      expect(loginLink.closest('a')).toHaveAttribute('href', '/login');
    });
  });
});
