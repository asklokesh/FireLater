import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mock next/navigation
const mockPush = vi.fn();
const mockSearchParams = new Map<string, string>();
vi.mock('next/navigation', () => ({
  useSearchParams: () => ({
    get: (key: string) => mockSearchParams.get(key) || null,
  }),
  useRouter: () => ({
    push: mockPush,
  }),
}));

// Mock the API
vi.mock('@/lib/api', () => ({
  authApi: {
    verifyEmail: vi.fn(),
    resendVerification: vi.fn(),
  },
}));

import VerifyEmailPage from '../page';
import { authApi } from '@/lib/api';

describe('VerifyEmailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams.clear();
    mockPush.mockClear();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('auto-verification with token', () => {
    it('should show verifying state initially', async () => {
      mockSearchParams.set('tenant', 'test-org');
      mockSearchParams.set('token', 'test-token');
      vi.mocked(authApi.verifyEmail).mockImplementation(() => new Promise(() => {})); // Hang

      render(<VerifyEmailPage />);

      await waitFor(() => {
        expect(screen.getByText('Verifying your email')).toBeInTheDocument();
      });
    });

    it('should show success state after successful verification', async () => {
      mockSearchParams.set('tenant', 'test-org');
      mockSearchParams.set('token', 'test-token');
      vi.mocked(authApi.verifyEmail).mockResolvedValue({});

      render(<VerifyEmailPage />);

      await waitFor(() => {
        expect(screen.getByText('Email Verified')).toBeInTheDocument();
      });

      expect(screen.getByText(/your email has been verified successfully/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /go to login/i })).toBeInTheDocument();
    });

    it('should call verifyEmail API with correct params', async () => {
      mockSearchParams.set('tenant', 'test-org');
      mockSearchParams.set('token', 'test-token');
      vi.mocked(authApi.verifyEmail).mockResolvedValue({});

      render(<VerifyEmailPage />);

      await waitFor(() => {
        expect(authApi.verifyEmail).toHaveBeenCalledWith('test-org', 'test-token');
      });
    });

    it('should redirect to login after successful verification', async () => {
      mockSearchParams.set('tenant', 'test-org');
      mockSearchParams.set('token', 'test-token');
      vi.mocked(authApi.verifyEmail).mockResolvedValue({});

      render(<VerifyEmailPage />);

      await waitFor(() => {
        expect(screen.getByText('Email Verified')).toBeInTheDocument();
      });

      // Advance timers to trigger redirect
      vi.advanceTimersByTime(3000);

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/login');
      });
    });

    it('should show error state when verification fails', async () => {
      mockSearchParams.set('tenant', 'test-org');
      mockSearchParams.set('token', 'test-token');
      vi.mocked(authApi.verifyEmail).mockRejectedValue(new Error('Token expired'));

      render(<VerifyEmailPage />);

      await waitFor(() => {
        expect(screen.getByText('Verification Failed')).toBeInTheDocument();
      });

      expect(screen.getByText(/token expired/i)).toBeInTheDocument();
    });

    it('should show request new link button on error', async () => {
      mockSearchParams.set('tenant', 'test-org');
      mockSearchParams.set('token', 'test-token');
      vi.mocked(authApi.verifyEmail).mockRejectedValue(new Error('Invalid token'));

      render(<VerifyEmailPage />);

      await waitFor(() => {
        expect(screen.getByText('Verification Failed')).toBeInTheDocument();
      });

      expect(screen.getByRole('button', { name: /request new verification link/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /back to login/i })).toBeInTheDocument();
    });
  });

  describe('resend verification flow', () => {
    it('should show resend form when no token is provided', async () => {
      mockSearchParams.set('tenant', 'test-org');
      // No token set

      render(<VerifyEmailPage />);

      await waitFor(() => {
        expect(screen.getByText('Verify Your Email')).toBeInTheDocument();
      });

      expect(screen.getByText(/enter your email to receive a new verification link/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    });

    it('should show resend form when no tenant is provided', async () => {
      // No tenant or token set
      render(<VerifyEmailPage />);

      await waitFor(() => {
        expect(screen.getByText('Verify Your Email')).toBeInTheDocument();
      });
    });

    it('should switch to resend form when clicking request new link', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      mockSearchParams.set('tenant', 'test-org');
      mockSearchParams.set('token', 'test-token');
      vi.mocked(authApi.verifyEmail).mockRejectedValue(new Error('Invalid'));

      render(<VerifyEmailPage />);

      await waitFor(() => {
        expect(screen.getByText('Verification Failed')).toBeInTheDocument();
      });

      // Find button and click it
      const requestButton = screen.getByRole('button', { name: /request new verification link/i });
      fireEvent.click(requestButton);

      // Wait for the resend form to appear
      await waitFor(() => {
        expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
      });
    });

    it('should send resend request with correct params', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      mockSearchParams.set('tenant', 'test-org');
      vi.mocked(authApi.resendVerification).mockResolvedValue({});

      render(<VerifyEmailPage />);

      await waitFor(() => {
        expect(screen.getByText('Verify Your Email')).toBeInTheDocument();
      });

      await user.type(screen.getByLabelText(/email address/i), 'test@example.com');
      await user.click(screen.getByRole('button', { name: /send verification link/i }));

      await waitFor(() => {
        expect(authApi.resendVerification).toHaveBeenCalledWith('test-org', 'test@example.com');
      });
    });

    it('should show success message after resend', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      mockSearchParams.set('tenant', 'test-org');
      vi.mocked(authApi.resendVerification).mockResolvedValue({});

      render(<VerifyEmailPage />);

      await waitFor(() => {
        expect(screen.getByText('Verify Your Email')).toBeInTheDocument();
      });

      await user.type(screen.getByLabelText(/email address/i), 'test@example.com');
      await user.click(screen.getByRole('button', { name: /send verification link/i }));

      await waitFor(() => {
        expect(screen.getByText(/a new verification link has been sent/i)).toBeInTheDocument();
      });
    });

    it('should show error when resend fails', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      mockSearchParams.set('tenant', 'test-org');
      vi.mocked(authApi.resendVerification).mockRejectedValue(new Error('Email not found'));

      render(<VerifyEmailPage />);

      await waitFor(() => {
        expect(screen.getByText('Verify Your Email')).toBeInTheDocument();
      });

      await user.type(screen.getByLabelText(/email address/i), 'test@example.com');
      await user.click(screen.getByRole('button', { name: /send verification link/i }));

      await waitFor(() => {
        expect(screen.getByText(/email not found/i)).toBeInTheDocument();
      });
    });
  });

  describe('navigation', () => {
    it('should have back to login link in resend form', async () => {
      mockSearchParams.set('tenant', 'test-org');

      render(<VerifyEmailPage />);

      await waitFor(() => {
        expect(screen.getByText('Verify Your Email')).toBeInTheDocument();
      });

      const loginLink = screen.getByText(/back to login/i);
      expect(loginLink).toBeInTheDocument();
      expect(loginLink.closest('a')).toHaveAttribute('href', '/login');
    });

    it('should have go to login link after success', async () => {
      mockSearchParams.set('tenant', 'test-org');
      mockSearchParams.set('token', 'test-token');
      vi.mocked(authApi.verifyEmail).mockResolvedValue({});

      render(<VerifyEmailPage />);

      await waitFor(() => {
        expect(screen.getByText('Email Verified')).toBeInTheDocument();
      });

      const loginLink = screen.getByRole('button', { name: /go to login/i });
      expect(loginLink.closest('a')).toHaveAttribute('href', '/login');
    });
  });
});
