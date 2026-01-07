import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mock next/navigation
const mockPush = vi.fn();
const mockBack = vi.fn();
const mockParams = { id: 'item-123' };
vi.mock('next/navigation', () => ({
  useParams: () => mockParams,
  useRouter: () => ({
    push: mockPush,
    back: mockBack,
  }),
}));

// Mock the API hooks
vi.mock('@/hooks/useApi', () => ({
  useCatalogItem: vi.fn(),
  useSubmitCatalogRequest: vi.fn(),
}));

import CatalogItemPage from '../page';
import { useCatalogItem, useSubmitCatalogRequest } from '@/hooks/useApi';

describe('CatalogItemPage', () => {
  const mockItem = {
    id: 'item-123',
    name: 'Software License Request',
    description: 'Request a software license for your workstation.',
    category: { id: 'cat-1', name: 'Software' },
    estimatedTime: '2-3 business days',
    approvalRequired: true,
    popularity: 42,
    includes: [
      'License installation',
      'Initial configuration',
      'User training',
    ],
    requirements: [
      'Manager approval required',
      'Budget code must be provided',
    ],
    options: [
      {
        id: 'software-type',
        name: 'Software Type',
        type: 'select',
        required: true,
        choices: [
          { label: 'Microsoft Office', value: 'office' },
          { label: 'Adobe Creative Suite', value: 'adobe' },
        ],
      },
      {
        id: 'justification',
        name: 'Business Justification',
        type: 'textarea',
        required: true,
        placeholder: 'Explain why you need this software',
      },
      {
        id: 'budget-code',
        name: 'Budget Code',
        type: 'text',
        required: false,
        placeholder: 'e.g., IT-2024-001',
      },
    ],
    relatedItems: [
      { id: 'item-456', name: 'Hardware Request', estimatedTime: '5-7 business days' },
    ],
  };

  const mockSubmitRequest = {
    mutateAsync: vi.fn(),
    isPending: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockPush.mockClear();
    mockBack.mockClear();
    vi.mocked(useCatalogItem).mockReturnValue({
      data: mockItem,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useCatalogItem>);
    vi.mocked(useSubmitCatalogRequest).mockReturnValue(mockSubmitRequest as unknown as ReturnType<typeof useSubmitCatalogRequest>);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('loading state', () => {
    it('should show loading spinner while fetching', async () => {
      vi.mocked(useCatalogItem).mockReturnValue({
        data: undefined,
        isLoading: true,
        error: null,
      } as unknown as ReturnType<typeof useCatalogItem>);

      render(<CatalogItemPage />);

      const spinner = document.querySelector('.animate-spin');
      expect(spinner).toBeInTheDocument();
    });
  });

  describe('error state', () => {
    it('should show error message when item not found', async () => {
      vi.mocked(useCatalogItem).mockReturnValue({
        data: undefined,
        isLoading: false,
        error: new Error('Not found'),
      } as unknown as ReturnType<typeof useCatalogItem>);

      render(<CatalogItemPage />);

      expect(screen.getByText('Service not found')).toBeInTheDocument();
      expect(screen.getByText(/doesn't exist or you don't have access/i)).toBeInTheDocument();
    });

    it('should have back to catalog button on error', async () => {
      vi.mocked(useCatalogItem).mockReturnValue({
        data: undefined,
        isLoading: false,
        error: new Error('Not found'),
      } as unknown as ReturnType<typeof useCatalogItem>);

      render(<CatalogItemPage />);

      const backButton = screen.getByRole('button', { name: /back to catalog/i });
      expect(backButton).toBeInTheDocument();

      await userEvent.click(backButton);
      expect(mockPush).toHaveBeenCalledWith('/catalog');
    });
  });

  describe('item details rendering', () => {
    it('should render item name and description', async () => {
      render(<CatalogItemPage />);

      expect(screen.getByText('Software License Request')).toBeInTheDocument();
      expect(screen.getByText(/request a software license/i)).toBeInTheDocument();
    });

    it('should render breadcrumb navigation', async () => {
      render(<CatalogItemPage />);

      expect(screen.getByText('Service Catalog')).toBeInTheDocument();
      expect(screen.getByText('Software')).toBeInTheDocument();
    });

    it('should render what\'s included section', async () => {
      render(<CatalogItemPage />);

      expect(screen.getByText("What's Included")).toBeInTheDocument();
      expect(screen.getByText('License installation')).toBeInTheDocument();
      expect(screen.getByText('Initial configuration')).toBeInTheDocument();
      expect(screen.getByText('User training')).toBeInTheDocument();
    });

    it('should render quick info section', async () => {
      render(<CatalogItemPage />);

      expect(screen.getByText('Quick Info')).toBeInTheDocument();
      expect(screen.getByText('2-3 business days')).toBeInTheDocument();
      expect(screen.getByText('Required')).toBeInTheDocument();
      expect(screen.getByText('42 requests this month')).toBeInTheDocument();
    });

    it('should show auto-approved when no approval required', async () => {
      vi.mocked(useCatalogItem).mockReturnValue({
        data: { ...mockItem, approvalRequired: false },
        isLoading: false,
        error: null,
      } as unknown as ReturnType<typeof useCatalogItem>);

      render(<CatalogItemPage />);

      expect(screen.getByText('Auto-approved')).toBeInTheDocument();
    });

    it('should render requirements section', async () => {
      render(<CatalogItemPage />);

      expect(screen.getByText('Requirements')).toBeInTheDocument();
      expect(screen.getByText('Manager approval required')).toBeInTheDocument();
      expect(screen.getByText('Budget code must be provided')).toBeInTheDocument();
    });

    it('should render related services section', async () => {
      render(<CatalogItemPage />);

      expect(screen.getByText('Related Services')).toBeInTheDocument();
      expect(screen.getByText('Hardware Request')).toBeInTheDocument();
      expect(screen.getByText('5-7 business days')).toBeInTheDocument();
    });
  });

  describe('form rendering', () => {
    it('should render all form options', async () => {
      render(<CatalogItemPage />);

      expect(screen.getByText('Request Details')).toBeInTheDocument();
      expect(screen.getByText('Software Type')).toBeInTheDocument();
      expect(screen.getByText('Business Justification')).toBeInTheDocument();
      expect(screen.getByText('Budget Code')).toBeInTheDocument();
    });

    it('should render select dropdown with choices', async () => {
      render(<CatalogItemPage />);

      const select = screen.getByLabelText(/software type/i);
      expect(select).toBeInTheDocument();
      expect(select.tagName).toBe('SELECT');

      // Check options exist
      expect(screen.getByText('Select an option')).toBeInTheDocument();
      expect(screen.getByText('Microsoft Office')).toBeInTheDocument();
      expect(screen.getByText('Adobe Creative Suite')).toBeInTheDocument();
    });

    it('should render textarea field', async () => {
      render(<CatalogItemPage />);

      const textarea = screen.getByPlaceholderText(/explain why you need/i);
      expect(textarea).toBeInTheDocument();
      expect(textarea.tagName).toBe('TEXTAREA');
    });

    it('should show required indicators for required fields', async () => {
      render(<CatalogItemPage />);

      // Required fields have a red asterisk
      const requiredIndicators = document.querySelectorAll('.text-red-500');
      expect(requiredIndicators.length).toBeGreaterThan(0);
    });
  });

  describe('form validation', () => {
    it('should show validation errors for empty required fields', async () => {
      render(<CatalogItemPage />);

      // Submit form without filling required fields
      const form = screen.getByRole('button', { name: /submit request/i }).closest('form');
      fireEvent.submit(form!);

      await waitFor(() => {
        expect(screen.getByText('Software Type is required')).toBeInTheDocument();
        expect(screen.getByText('Business Justification is required')).toBeInTheDocument();
      });
    });

    it('should not submit form with validation errors', async () => {
      render(<CatalogItemPage />);

      const form = screen.getByRole('button', { name: /submit request/i }).closest('form');
      fireEvent.submit(form!);

      await waitFor(() => {
        expect(mockSubmitRequest.mutateAsync).not.toHaveBeenCalled();
      });
    });

    it('should clear error when field is filled', async () => {
      const user = userEvent.setup();
      render(<CatalogItemPage />);

      // Submit to trigger errors
      const form = screen.getByRole('button', { name: /submit request/i }).closest('form');
      fireEvent.submit(form!);

      await waitFor(() => {
        expect(screen.getByText('Software Type is required')).toBeInTheDocument();
      });

      // Fill the field
      const select = screen.getByLabelText(/software type/i);
      await user.selectOptions(select, 'office');

      // Error should be cleared
      expect(screen.queryByText('Software Type is required')).not.toBeInTheDocument();
    });
  });

  describe('form submission', () => {
    it('should submit form with correct data', async () => {
      const user = userEvent.setup();
      mockSubmitRequest.mutateAsync.mockResolvedValue({ number: 'REQ-001' });

      render(<CatalogItemPage />);

      // Fill required fields
      await user.selectOptions(screen.getByLabelText(/software type/i), 'office');
      await user.type(screen.getByPlaceholderText(/explain why/i), 'Need for project');

      // Submit
      await user.click(screen.getByRole('button', { name: /submit request/i }));

      await waitFor(() => {
        expect(mockSubmitRequest.mutateAsync).toHaveBeenCalledWith({
          itemId: 'item-123',
          formData: {
            'software-type': 'office',
            'justification': 'Need for project',
          },
        });
      });
    });

    it('should show success message after submission', async () => {
      const user = userEvent.setup();
      mockSubmitRequest.mutateAsync.mockResolvedValue({ number: 'REQ-001' });

      render(<CatalogItemPage />);

      // Fill required fields
      await user.selectOptions(screen.getByLabelText(/software type/i), 'adobe');
      await user.type(screen.getByPlaceholderText(/explain why/i), 'Design work');

      // Submit
      await user.click(screen.getByRole('button', { name: /submit request/i }));

      await waitFor(() => {
        expect(screen.getByText('Request Submitted!')).toBeInTheDocument();
      });

      expect(screen.getByText(/has been submitted successfully/i)).toBeInTheDocument();
      expect(screen.getByText(/REQ-001/)).toBeInTheDocument();
    });

    it('should show navigation links after success', async () => {
      const user = userEvent.setup();
      mockSubmitRequest.mutateAsync.mockResolvedValue({ number: 'REQ-002' });

      render(<CatalogItemPage />);

      // Fill and submit
      await user.selectOptions(screen.getByLabelText(/software type/i), 'office');
      await user.type(screen.getByPlaceholderText(/explain why/i), 'Needed');
      await user.click(screen.getByRole('button', { name: /submit request/i }));

      await waitFor(() => {
        expect(screen.getByText('Request Submitted!')).toBeInTheDocument();
      });

      expect(screen.getByRole('link', { name: /back to catalog/i })).toHaveAttribute('href', '/catalog');
      expect(screen.getByRole('link', { name: /view my requests/i })).toHaveAttribute('href', '/catalog?tab=requests');
    });

    it('should handle submission error gracefully', async () => {
      const user = userEvent.setup();
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockSubmitRequest.mutateAsync.mockRejectedValue(new Error('Submission failed'));

      render(<CatalogItemPage />);

      // Fill and submit
      await user.selectOptions(screen.getByLabelText(/software type/i), 'office');
      await user.type(screen.getByPlaceholderText(/explain why/i), 'Needed');
      await user.click(screen.getByRole('button', { name: /submit request/i }));

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith('Failed to submit request:', expect.any(Error));
      });

      // Form should still be visible (not showing success)
      expect(screen.queryByText('Request Submitted!')).not.toBeInTheDocument();
      consoleSpy.mockRestore();
    });
  });

  describe('navigation', () => {
    it('should call router.back when clicking back button', async () => {
      const user = userEvent.setup();
      render(<CatalogItemPage />);

      const backButton = document.querySelector('button[class*="hover:bg-gray-100"]');
      expect(backButton).toBeInTheDocument();

      await user.click(backButton!);
      expect(mockBack).toHaveBeenCalled();
    });

    it('should have correct breadcrumb links', async () => {
      render(<CatalogItemPage />);

      const catalogLink = screen.getByRole('link', { name: /service catalog/i });
      expect(catalogLink).toHaveAttribute('href', '/catalog');

      const categoryLink = screen.getByRole('link', { name: /software/i });
      expect(categoryLink).toHaveAttribute('href', '/catalog/category/cat-1');
    });

    it('should have correct related item links', async () => {
      render(<CatalogItemPage />);

      const relatedLink = screen.getByRole('link', { name: /hardware request/i });
      expect(relatedLink).toHaveAttribute('href', '/catalog/item-456');
    });
  });
});
