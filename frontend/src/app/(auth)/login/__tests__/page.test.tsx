import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LoginPage from '../page';

// Mock Next.js navigation
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => '/login',
  useSearchParams: () => new URLSearchParams(),
}));

// Mock Next.js Link
vi.mock('next/link', () => ({
  default: ({ children, href, className }: any) => (
    <a href={href} className={className}>{children}</a>
  ),
}));

// Mock auth store
const mockLogin = vi.fn();
const mockClearError = vi.fn();
const mockAuthStore: {
  login: typeof mockLogin;
  isLoading: boolean;
  error: string | null;
  clearError: typeof mockClearError;
} = {
  login: mockLogin,
  isLoading: false,
  error: null,
  clearError: mockClearError,
};

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => mockAuthStore,
}));

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthStore.isLoading = false;
    mockAuthStore.error = null;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Basic Rendering', () => {
    it('renders the login page', () => {
      render(<LoginPage />);
      expect(screen.getByText('Sign in to your account')).toBeInTheDocument();
    });

    it('renders FireLater logo and title', () => {
      render(<LoginPage />);
      expect(screen.getByText('FireLater')).toBeInTheDocument();
      expect(screen.getByText('IT Service Management Platform')).toBeInTheDocument();
    });

    it('renders all form fields', () => {
      render(<LoginPage />);
      expect(screen.getByLabelText('Organization')).toBeInTheDocument();
      expect(screen.getByLabelText('Email address')).toBeInTheDocument();
      expect(screen.getByLabelText('Password')).toBeInTheDocument();
    });

    it('renders submit button', () => {
      render(<LoginPage />);
      expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    });

    it('renders remember me checkbox', () => {
      render(<LoginPage />);
      expect(screen.getByLabelText('Remember me')).toBeInTheDocument();
    });

    it('renders forgot password link', () => {
      render(<LoginPage />);
      const forgotLink = screen.getByText('Forgot your password?');
      expect(forgotLink).toBeInTheDocument();
      expect(forgotLink.closest('a')).toHaveAttribute('href', '/forgot-password');
    });

    it('renders sign up link', () => {
      render(<LoginPage />);
      const signUpLink = screen.getByText('Sign up');
      expect(signUpLink).toBeInTheDocument();
      expect(signUpLink.closest('a')).toHaveAttribute('href', '/register');
    });
  });

  describe('Form Input', () => {
    it('allows entering organization slug', async () => {
      const user = userEvent.setup();
      render(<LoginPage />);

      const orgInput = screen.getByLabelText('Organization') as HTMLInputElement;
      await user.type(orgInput, 'acme-corp');

      expect(orgInput.value).toBe('acme-corp');
    });

    it('converts organization slug to lowercase', async () => {
      const user = userEvent.setup();
      render(<LoginPage />);

      const orgInput = screen.getByLabelText('Organization') as HTMLInputElement;
      await user.type(orgInput, 'ACME-Corp');

      expect(orgInput.value).toBe('acme-corp');
    });

    it('allows entering email', async () => {
      const user = userEvent.setup();
      render(<LoginPage />);

      const emailInput = screen.getByLabelText('Email address') as HTMLInputElement;
      await user.type(emailInput, 'user@example.com');

      expect(emailInput.value).toBe('user@example.com');
    });

    it('allows entering password', async () => {
      const user = userEvent.setup();
      render(<LoginPage />);

      const passwordInput = screen.getByLabelText('Password') as HTMLInputElement;
      await user.type(passwordInput, 'password123');

      expect(passwordInput.value).toBe('password123');
    });

    it('password field is type password', () => {
      render(<LoginPage />);
      const passwordInput = screen.getByLabelText('Password');
      expect(passwordInput).toHaveAttribute('type', 'password');
    });
  });

  describe('Form Submission', () => {
    it('calls login with correct credentials on submit', async () => {
      const user = userEvent.setup();
      mockLogin.mockResolvedValue(undefined);
      render(<LoginPage />);

      await user.type(screen.getByLabelText('Organization'), 'acme-corp');
      await user.type(screen.getByLabelText('Email address'), 'user@example.com');
      await user.type(screen.getByLabelText('Password'), 'password123');

      await user.click(screen.getByRole('button', { name: 'Sign in' }));

      expect(mockLogin).toHaveBeenCalledWith('acme-corp', 'user@example.com', 'password123');
    });

    it('clears error before submission', async () => {
      const user = userEvent.setup();
      mockLogin.mockResolvedValue(undefined);
      render(<LoginPage />);

      await user.type(screen.getByLabelText('Organization'), 'acme-corp');
      await user.type(screen.getByLabelText('Email address'), 'user@example.com');
      await user.type(screen.getByLabelText('Password'), 'password123');

      await user.click(screen.getByRole('button', { name: 'Sign in' }));

      expect(mockClearError).toHaveBeenCalled();
    });

    it('redirects to dashboard on successful login', async () => {
      const user = userEvent.setup();
      mockLogin.mockResolvedValue(undefined);
      render(<LoginPage />);

      await user.type(screen.getByLabelText('Organization'), 'acme-corp');
      await user.type(screen.getByLabelText('Email address'), 'user@example.com');
      await user.type(screen.getByLabelText('Password'), 'password123');

      await user.click(screen.getByRole('button', { name: 'Sign in' }));

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/dashboard');
      });
    });

    it('handles login errors gracefully', async () => {
      const user = userEvent.setup();
      mockLogin.mockRejectedValue(new Error('Invalid credentials'));
      render(<LoginPage />);

      await user.type(screen.getByLabelText('Organization'), 'acme-corp');
      await user.type(screen.getByLabelText('Email address'), 'user@example.com');
      await user.type(screen.getByLabelText('Password'), 'wrong');

      await user.click(screen.getByRole('button', { name: 'Sign in' }));

      // Error is handled by the store, component just catches the error
      expect(mockLogin).toHaveBeenCalled();
    });

    it('prevents default form submission', async () => {
      const user = userEvent.setup();
      mockLogin.mockResolvedValue(undefined);
      render(<LoginPage />);

      const form = screen.getByRole('button', { name: 'Sign in' }).closest('form');
      const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
      const preventDefaultSpy = vi.spyOn(submitEvent, 'preventDefault');

      form?.dispatchEvent(submitEvent);

      expect(preventDefaultSpy).toHaveBeenCalled();
    });
  });

  describe('Loading State', () => {
    it('shows loading state on submit button', () => {
      mockAuthStore.isLoading = true;
      render(<LoginPage />);

      const submitButton = screen.getByRole('button', { name: /sign in/i });
      expect(submitButton).toBeInTheDocument();
    });

    it('disables submit button while loading', () => {
      mockAuthStore.isLoading = true;
      render(<LoginPage />);

      const submitButton = screen.getByRole('button', { name: /sign in/i });
      expect(submitButton).toBeDisabled();
    });
  });

  describe('Error Display', () => {
    it('displays error message when error exists', () => {
      mockAuthStore.error = 'Invalid credentials';
      render(<LoginPage />);

      expect(screen.getByText('Invalid credentials')).toBeInTheDocument();
    });

    it('shows error alert with icon', () => {
      mockAuthStore.error = 'Network error';
      const { container } = render(<LoginPage />);

      expect(screen.getByText('Network error')).toBeInTheDocument();
      // Check for alert container styling
      const alert = container.querySelector('.bg-red-100');
      expect(alert).toBeInTheDocument();
    });

    it('does not display error when error is null', () => {
      mockAuthStore.error = null;
      const { container } = render(<LoginPage />);

      const alert = container.querySelector('.bg-red-100');
      expect(alert).not.toBeInTheDocument();
    });
  });

  describe('Form Validation', () => {
    it('organization field is required', () => {
      render(<LoginPage />);
      const orgInput = screen.getByLabelText('Organization');
      expect(orgInput).toHaveAttribute('required');
    });

    it('email field is required', () => {
      render(<LoginPage />);
      const emailInput = screen.getByLabelText('Email address');
      expect(emailInput).toHaveAttribute('required');
    });

    it('password field is required', () => {
      render(<LoginPage />);
      const passwordInput = screen.getByLabelText('Password');
      expect(passwordInput).toHaveAttribute('required');
    });

    it('email field has correct type', () => {
      render(<LoginPage />);
      const emailInput = screen.getByLabelText('Email address');
      expect(emailInput).toHaveAttribute('type', 'email');
    });
  });

  describe('Placeholders', () => {
    it('shows placeholder for organization', () => {
      render(<LoginPage />);
      expect(screen.getByPlaceholderText('your-organization')).toBeInTheDocument();
    });

    it('shows placeholder for email', () => {
      render(<LoginPage />);
      expect(screen.getByPlaceholderText('you@company.com')).toBeInTheDocument();
    });

    it('shows placeholder for password', () => {
      render(<LoginPage />);
      expect(screen.getByPlaceholderText('Enter your password')).toBeInTheDocument();
    });
  });

  describe('Styling', () => {
    it('has centered layout', () => {
      const { container } = render(<LoginPage />);
      const mainDiv = container.querySelector('.min-h-screen.flex.items-center.justify-center');
      expect(mainDiv).toBeInTheDocument();
    });

    it('has gray background', () => {
      const { container } = render(<LoginPage />);
      const mainDiv = container.querySelector('.bg-gray-50');
      expect(mainDiv).toBeInTheDocument();
    });

    it('submit button spans full width', () => {
      render(<LoginPage />);
      const submitButton = screen.getByRole('button', { name: /sign in/i });
      expect(submitButton).toHaveClass('w-full');
    });
  });

  describe('Accessibility', () => {
    it('has proper heading hierarchy', () => {
      render(<LoginPage />);
      const heading = screen.getByRole('heading', { name: 'Sign in to your account' });
      expect(heading).toBeInTheDocument();
    });

    it('all inputs have labels', () => {
      render(<LoginPage />);
      expect(screen.getByLabelText('Organization')).toBeInTheDocument();
      expect(screen.getByLabelText('Email address')).toBeInTheDocument();
      expect(screen.getByLabelText('Password')).toBeInTheDocument();
    });

    it('remember me checkbox has label', () => {
      render(<LoginPage />);
      expect(screen.getByLabelText('Remember me')).toBeInTheDocument();
    });

    it('email input has autocomplete', () => {
      render(<LoginPage />);
      const emailInput = screen.getByLabelText('Email address');
      expect(emailInput).toHaveAttribute('autoComplete', 'email');
    });

    it('password input has autocomplete', () => {
      render(<LoginPage />);
      const passwordInput = screen.getByLabelText('Password');
      expect(passwordInput).toHaveAttribute('autoComplete', 'current-password');
    });
  });

  describe('Help Text', () => {
    it('shows organization slug help text', () => {
      render(<LoginPage />);
      expect(screen.getByText(/Enter your organization slug/)).toBeInTheDocument();
    });
  });

  describe('Keyboard Navigation', () => {
    it('can submit form with Enter key', async () => {
      const user = userEvent.setup();
      mockLogin.mockResolvedValue(undefined);
      render(<LoginPage />);

      await user.type(screen.getByLabelText('Organization'), 'acme-corp');
      await user.type(screen.getByLabelText('Email address'), 'user@example.com');
      await user.type(screen.getByLabelText('Password'), 'password123');
      await user.keyboard('{Enter}');

      expect(mockLogin).toHaveBeenCalled();
    });
  });
});
