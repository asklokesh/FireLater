import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@/test/utils';
import { userEvent } from '@testing-library/user-event';
import { Input } from '../input';

describe('Input Component', () => {
  describe('Rendering', () => {
    it('renders input element', () => {
      render(<Input placeholder="Enter text" />);
      expect(screen.getByPlaceholderText('Enter text')).toBeInTheDocument();
    });

    it('renders with label when provided', () => {
      render(<Input label="Username" id="username" />);
      expect(screen.getByLabelText('Username')).toBeInTheDocument();
    });

    it('renders without label when not provided', () => {
      render(<Input placeholder="No label" />);
      expect(screen.queryByRole('label')).not.toBeInTheDocument();
    });

    it('associates label with input via id', () => {
      render(<Input label="Email" id="email" />);
      const input = screen.getByLabelText('Email');
      expect(input).toHaveAttribute('id', 'email');
    });
  });

  describe('Error State', () => {
    it('displays error message when provided', () => {
      render(<Input error="This field is required" />);
      expect(screen.getByText('This field is required')).toBeInTheDocument();
    });

    it('applies error border class when error exists', () => {
      render(<Input error="Error" />);
      const input = screen.getByRole('textbox');
      expect(input).toHaveClass('border-red-500');
    });

    it('does not show error message when error is undefined', () => {
      render(<Input />);
      const container = screen.getByRole('textbox').closest('div');
      expect(container?.querySelector('.text-red-600')).not.toBeInTheDocument();
    });

    it('applies normal border when no error', () => {
      render(<Input />);
      const input = screen.getByRole('textbox');
      expect(input).toHaveClass('border-gray-300');
    });
  });

  describe('Disabled State', () => {
    it('disables input when disabled prop is true', () => {
      render(<Input disabled />);
      const input = screen.getByRole('textbox');
      expect(input).toBeDisabled();
    });

    it('applies disabled background class', () => {
      render(<Input disabled />);
      const input = screen.getByRole('textbox');
      expect(input).toHaveClass('disabled:bg-gray-100');
    });

    it('does not accept user input when disabled', async () => {
      const user = userEvent.setup();
      render(<Input disabled />);

      const input = screen.getByRole('textbox') as HTMLInputElement;
      await user.type(input, 'test');

      expect(input.value).toBe('');
    });
  });

  describe('User Interaction', () => {
    it('accepts text input', async () => {
      const user = userEvent.setup();
      render(<Input />);

      const input = screen.getByRole('textbox') as HTMLInputElement;
      await user.type(input, 'Hello World');

      expect(input.value).toBe('Hello World');
    });

    it('calls onChange handler when value changes', async () => {
      const handleChange = vi.fn();
      const user = userEvent.setup();

      render(<Input onChange={handleChange} />);

      const input = screen.getByRole('textbox');
      await user.type(input, 'a');

      expect(handleChange).toHaveBeenCalled();
    });

    it('calls onFocus handler when input is focused', async () => {
      const handleFocus = vi.fn();
      const user = userEvent.setup();

      render(<Input onFocus={handleFocus} />);

      const input = screen.getByRole('textbox');
      await user.click(input);

      expect(handleFocus).toHaveBeenCalled();
    });

    it('calls onBlur handler when input loses focus', async () => {
      const handleBlur = vi.fn();
      const user = userEvent.setup();

      render(<Input onBlur={handleBlur} />);

      const input = screen.getByRole('textbox');
      await user.click(input);
      await user.tab();

      expect(handleBlur).toHaveBeenCalled();
    });
  });

  describe('Props and Attributes', () => {
    it('accepts and applies custom className', () => {
      render(<Input className="custom-class" />);
      const input = screen.getByRole('textbox');
      expect(input).toHaveClass('custom-class');
    });

    it('forwards placeholder attribute', () => {
      render(<Input placeholder="Enter email" />);
      expect(screen.getByPlaceholderText('Enter email')).toBeInTheDocument();
    });

    it('forwards type attribute', () => {
      render(<Input type="email" />);
      const input = screen.getByRole('textbox');
      expect(input).toHaveAttribute('type', 'email');
    });

    it('forwards required attribute', () => {
      render(<Input required />);
      const input = screen.getByRole('textbox');
      expect(input).toBeRequired();
    });

    it('forwards maxLength attribute', () => {
      render(<Input maxLength={10} />);
      const input = screen.getByRole('textbox');
      expect(input).toHaveAttribute('maxLength', '10');
    });

    it('forwards value attribute for controlled input', () => {
      render(<Input value="controlled value" onChange={() => {}} />);
      const input = screen.getByRole('textbox') as HTMLInputElement;
      expect(input.value).toBe('controlled value');
    });

    it('forwards defaultValue for uncontrolled input', () => {
      render(<Input defaultValue="default value" />);
      const input = screen.getByRole('textbox') as HTMLInputElement;
      expect(input.value).toBe('default value');
    });
  });

  describe('Input Types', () => {
    it('renders password input', () => {
      const { container } = render(<Input type="password" />);
      const input = container.querySelector('input[type="password"]');
      expect(input).toBeInTheDocument();
      expect(input).toHaveAttribute('type', 'password');
    });

    it('renders email input', () => {
      render(<Input type="email" />);
      const input = screen.getByRole('textbox');
      expect(input).toHaveAttribute('type', 'email');
    });

    it('renders number input', () => {
      render(<Input type="number" />);
      const input = screen.getByRole('spinbutton');
      expect(input).toHaveAttribute('type', 'number');
    });
  });

  describe('Accessibility', () => {
    it('has correct role for text input', () => {
      render(<Input />);
      expect(screen.getByRole('textbox')).toBeInTheDocument();
    });

    it('label for accessibility matches input id', () => {
      render(<Input label="Accessible Input" id="accessible" />);
      const label = screen.getByText('Accessible Input');
      const input = screen.getByLabelText('Accessible Input');
      expect(label).toHaveAttribute('for', 'accessible');
      expect(input).toHaveAttribute('id', 'accessible');
    });

    it('error message has correct text color for screen readers', () => {
      render(<Input error="Error message" />);
      const error = screen.getByText('Error message');
      expect(error).toHaveClass('text-red-600');
    });

    it('is keyboard navigable', async () => {
      const user = userEvent.setup();
      render(
        <div>
          <Input id="first" />
          <Input id="second" />
        </div>
      );

      const firstInput = screen.getAllByRole('textbox')[0];
      const secondInput = screen.getAllByRole('textbox')[1];

      firstInput.focus();
      expect(firstInput).toHaveFocus();

      await user.tab();
      expect(secondInput).toHaveFocus();
    });
  });

  describe('Edge Cases', () => {
    it('handles empty string as value', () => {
      render(<Input value="" onChange={() => {}} />);
      const input = screen.getByRole('textbox') as HTMLInputElement;
      expect(input.value).toBe('');
    });

    it('handles undefined className gracefully', () => {
      render(<Input className={undefined} />);
      const input = screen.getByRole('textbox');
      expect(input).toBeInTheDocument();
    });

    it('renders with both label and error', () => {
      render(<Input label="Name" error="Name is required" id="name" />);
      expect(screen.getByLabelText('Name')).toBeInTheDocument();
      expect(screen.getByText('Name is required')).toBeInTheDocument();
    });
  });
});
