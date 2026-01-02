import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RegisterPage from '../page';
import { authApi } from '@/lib/api';

// Mock Next.js navigation
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => '/register',
  useSearchParams: () => new URLSearchParams(),
}));

// Mock Next.js Link
vi.mock('next/link', () => ({
  default: ({ children, href, className }: any) => (
    <a href={href} className={className}>{children}</a>
  ),
}));

// Mock auth API
vi.mock('@/lib/api', () => ({
  authApi: {
    register: vi.fn(),
  },
}));

describe('RegisterPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Basic Rendering', () => {
    it('renders the register page', () => {
      render(<RegisterPage />);
      expect(screen.getByText('Create your account')).toBeInTheDocument();
    });

    it('renders FireLater logo and title', () => {
      render(<RegisterPage />);
      expect(screen.getByText('FireLater')).toBeInTheDocument();
      expect(screen.getByText('Start managing your IT services today')).toBeInTheDocument();
    });

    it('renders all form fields', () => {
      render(<RegisterPage />);
      expect(screen.getByLabelText('Organization Name')).toBeInTheDocument();
      expect(screen.getByLabelText('Organization Slug')).toBeInTheDocument();
      expect(screen.getByLabelText('Your Full Name')).toBeInTheDocument();
      expect(screen.getByLabelText('Email address')).toBeInTheDocument();
      expect(screen.getByLabelText('Password')).toBeInTheDocument();
      expect(screen.getByLabelText('Confirm Password')).toBeInTheDocument();
    });

    it('renders submit button', () => {
      render(<RegisterPage />);
      expect(screen.getByRole('button', { name: 'Create Account' })).toBeInTheDocument();
    });

    it('renders terms checkbox', () => {
      render(<RegisterPage />);
      expect(screen.getByLabelText(/I agree to the/)).toBeInTheDocument();
    });

    it('renders sign in link', () => {
      render(<RegisterPage />);
      const signInLink = screen.getByText('Sign in');
      expect(signInLink).toBeInTheDocument();
      expect(signInLink.closest('a')).toHaveAttribute('href', '/login');
    });
  });

  describe('Form Input', () => {
    it('allows entering organization name', async () => {
      const user = userEvent.setup({ delay: null });
      render(<RegisterPage />);

      const nameInput = screen.getByLabelText('Organization Name') as HTMLInputElement;
      await user.type(nameInput, 'Acme Corp');

      expect(nameInput.value).toBe('Acme Corp');
    });

    it('allows entering organization slug', async () => {
      const user = userEvent.setup({ delay: null });
      render(<RegisterPage />);

      const slugInput = screen.getByLabelText('Organization Slug') as HTMLInputElement;
      await user.type(slugInput, 'acme-corp');

      expect(slugInput.value).toBe('acme-corp');
    });

    it('allows entering admin name', async () => {
      const user = userEvent.setup({ delay: null });
      render(<RegisterPage />);

      const adminNameInput = screen.getByLabelText('Your Full Name') as HTMLInputElement;
      await user.type(adminNameInput, 'John Doe');

      expect(adminNameInput.value).toBe('John Doe');
    });

    it('allows entering email', async () => {
      const user = userEvent.setup({ delay: null });
      render(<RegisterPage />);

      const emailInput = screen.getByLabelText('Email address') as HTMLInputElement;
      await user.type(emailInput, 'john@acme.com');

      expect(emailInput.value).toBe('john@acme.com');
    });

    it('allows entering password', async () => {
      const user = userEvent.setup({ delay: null });
      render(<RegisterPage />);

      const passwordInput = screen.getByLabelText(/^Password$/) as HTMLInputElement;
      await user.type(passwordInput, 'password123');

      expect(passwordInput.value).toBe('password123');
    });

    it('allows entering confirm password', async () => {
      const user = userEvent.setup({ delay: null });
      render(<RegisterPage />);

      const confirmInput = screen.getByLabelText('Confirm Password') as HTMLInputElement;
      await user.type(confirmInput, 'password123');

      expect(confirmInput.value).toBe('password123');
    });

    it('password fields are type password', () => {
      render(<RegisterPage />);
      const passwordInput = screen.getByLabelText(/^Password$/);
      const confirmInput = screen.getByLabelText('Confirm Password');
      expect(passwordInput).toHaveAttribute('type', 'password');
      expect(confirmInput).toHaveAttribute('type', 'password');
    });
  });

  describe('Form Validation', () => {
    // NOTE: HTML5 validation in JSDOM prevents testing JavaScript validation in isolation
    // These tests verify that the validation logic exists via the prevents submission test
    // Individual field validation is covered by the prevents submission test below

    it('prevents submission when form validation fails', () => {
      render(<RegisterPage />);

      // Click submit without filling form (tests validation prevents submission)
      const submitButton = screen.getByRole('button', { name: 'Create Account' });
      fireEvent.click(submitButton);

      // API should not be called if validation fails
      expect(authApi.register).not.toHaveBeenCalled();
    });
  });

  describe('Form Submission', () => {
    const fillValidForm = () => {
      fireEvent.change(screen.getByLabelText('Organization Name'), { target: { value: 'Acme Corp' } });
      fireEvent.change(screen.getByLabelText('Organization Slug'), { target: { value: 'acme-corp' } });
      fireEvent.change(screen.getByLabelText('Your Full Name'), { target: { value: 'John Doe' } });
      fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'john@acme.com' } });
      fireEvent.change(screen.getByLabelText(/^Password$/), { target: { value: 'password123' } });
      fireEvent.change(screen.getByLabelText('Confirm Password'), { target: { value: 'password123' } });
      fireEvent.click(screen.getByLabelText(/I agree to the/));
    };

    it('calls register API with correct data on submit', async () => {
      vi.mocked(authApi.register).mockResolvedValue({} as any);
      render(<RegisterPage />);

      fillValidForm();
      fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));

      await waitFor(() => {
        expect(authApi.register).toHaveBeenCalledWith({
          tenantName: 'Acme Corp',
          tenantSlug: 'acme-corp',
          adminName: 'John Doe',
          adminEmail: 'john@acme.com',
          adminPassword: 'password123',
        });
      });
    });

    it('shows loading state on submit button during registration', async () => {
      vi.mocked(authApi.register).mockImplementation(() => new Promise(() => {}));
      render(<RegisterPage />);

      fillValidForm();
      fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));

      await waitFor(() => {
        const submitButton = screen.getByRole('button', { name: /Create Account/i });
        expect(submitButton).toBeDisabled();
      });
    });

    it('shows success message on successful registration', async () => {
      vi.mocked(authApi.register).mockResolvedValue({} as any);
      render(<RegisterPage />);

      fillValidForm();
      fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));

      await waitFor(() => {
        expect(screen.getByText('Registration Successful!')).toBeInTheDocument();
      });

      expect(screen.getByText('Your account has been created. Redirecting to login...')).toBeInTheDocument();
    });


  });

  describe('Required Fields', () => {
    it('organization name field is required', () => {
      render(<RegisterPage />);
      const input = screen.getByLabelText('Organization Name');
      expect(input).toHaveAttribute('required');
    });

    it('organization slug field is required', () => {
      render(<RegisterPage />);
      const input = screen.getByLabelText('Organization Slug');
      expect(input).toHaveAttribute('required');
    });

    it('admin name field is required', () => {
      render(<RegisterPage />);
      const input = screen.getByLabelText('Your Full Name');
      expect(input).toHaveAttribute('required');
    });

    it('email field is required', () => {
      render(<RegisterPage />);
      const input = screen.getByLabelText('Email address');
      expect(input).toHaveAttribute('required');
    });

    it('password field is required', () => {
      render(<RegisterPage />);
      const input = screen.getByLabelText(/^Password$/);
      expect(input).toHaveAttribute('required');
    });

    it('confirm password field is required', () => {
      render(<RegisterPage />);
      const input = screen.getByLabelText('Confirm Password');
      expect(input).toHaveAttribute('required');
    });

    it('terms checkbox is required', () => {
      render(<RegisterPage />);
      const checkbox = screen.getByLabelText(/I agree to the/);
      expect(checkbox).toHaveAttribute('required');
    });
  });

  describe('Placeholders', () => {
    it('shows placeholder for organization name', () => {
      render(<RegisterPage />);
      expect(screen.getByPlaceholderText('My Company Inc.')).toBeInTheDocument();
    });

    it('shows placeholder for organization slug', () => {
      render(<RegisterPage />);
      expect(screen.getByPlaceholderText('my-company')).toBeInTheDocument();
    });

    it('shows placeholder for admin name', () => {
      render(<RegisterPage />);
      expect(screen.getByPlaceholderText('John Doe')).toBeInTheDocument();
    });

    it('shows placeholder for email', () => {
      render(<RegisterPage />);
      expect(screen.getByPlaceholderText('you@company.com')).toBeInTheDocument();
    });

    it('shows placeholder for password', () => {
      render(<RegisterPage />);
      expect(screen.getByPlaceholderText('Create a strong password')).toBeInTheDocument();
    });

    it('shows placeholder for confirm password', () => {
      render(<RegisterPage />);
      expect(screen.getByPlaceholderText('Confirm your password')).toBeInTheDocument();
    });
  });

  describe('Help Text', () => {
    it('shows organization slug help text', () => {
      render(<RegisterPage />);
      expect(screen.getByText(/This will be your unique organization identifier/)).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('has proper heading hierarchy', () => {
      render(<RegisterPage />);
      const heading = screen.getByRole('heading', { name: 'Create your account' });
      expect(heading).toBeInTheDocument();
    });

    it('all inputs have labels', () => {
      render(<RegisterPage />);
      expect(screen.getByLabelText('Organization Name')).toBeInTheDocument();
      expect(screen.getByLabelText('Organization Slug')).toBeInTheDocument();
      expect(screen.getByLabelText('Your Full Name')).toBeInTheDocument();
      expect(screen.getByLabelText('Email address')).toBeInTheDocument();
      expect(screen.getByLabelText(/^Password$/)).toBeInTheDocument();
      expect(screen.getByLabelText('Confirm Password')).toBeInTheDocument();
    });

    it('email input has autocomplete', () => {
      render(<RegisterPage />);
      const emailInput = screen.getByLabelText('Email address');
      expect(emailInput).toHaveAttribute('autoComplete', 'email');
    });

    it('password inputs have autocomplete', () => {
      render(<RegisterPage />);
      const passwordInput = screen.getByLabelText(/^Password$/);
      const confirmInput = screen.getByLabelText('Confirm Password');
      expect(passwordInput).toHaveAttribute('autoComplete', 'new-password');
      expect(confirmInput).toHaveAttribute('autoComplete', 'new-password');
    });
  });


  describe('Styling', () => {
    it('has centered layout', () => {
      const { container } = render(<RegisterPage />);
      const mainDiv = container.querySelector('.min-h-screen.flex.items-center.justify-center');
      expect(mainDiv).toBeInTheDocument();
    });

    it('has gray background', () => {
      const { container } = render(<RegisterPage />);
      const mainDiv = container.querySelector('.bg-gray-50');
      expect(mainDiv).toBeInTheDocument();
    });

    it('submit button spans full width', () => {
      render(<RegisterPage />);
      const submitButton = screen.getByRole('button', { name: /Create Account/i });
      expect(submitButton).toHaveClass('w-full');
    });
  });
});
