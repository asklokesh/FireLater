import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import NewArticlePage from '../page';
import * as useApiHooks from '@/hooks/useApi';

// Mock Next.js navigation
const mockPush = vi.fn();
const mockBack = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    back: mockBack,
  }),
}));

// Mock Next.js Link
vi.mock('next/link', () => ({
  default: ({ children, href }: any) => <a href={href}>{children}</a>,
}));

describe('NewArticlePage', () => {
  const mockCategories = [
    { id: 'cat-1', name: 'Getting Started', slug: 'getting-started' },
    { id: 'cat-2', name: 'Troubleshooting', slug: 'troubleshooting' },
  ];

  let mockUseCreateKBArticle: ReturnType<typeof vi.fn>;
  let mockUseKBCategories: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockUseCreateKBArticle = vi.fn(() => ({
      mutateAsync: vi.fn(),
      isPending: false,
    }));

    mockUseKBCategories = vi.fn(() => ({
      data: mockCategories,
      isLoading: false,
    }));

    vi.spyOn(useApiHooks, 'useCreateKBArticle').mockImplementation(mockUseCreateKBArticle);
    vi.spyOn(useApiHooks, 'useKBCategories').mockImplementation(mockUseKBCategories);
  });

  describe('Basic Rendering', () => {
    it('renders page title and description', () => {
      render(<NewArticlePage />);

      expect(screen.getByText('New Article')).toBeInTheDocument();
      expect(screen.getByText('Create a new knowledge base article')).toBeInTheDocument();
    });

    it('renders back link to knowledge base', () => {
      render(<NewArticlePage />);

      const backLink = screen.getByRole('link', { name: '' });
      expect(backLink).toHaveAttribute('href', '/knowledge-base');
    });

    it('renders form element', () => {
      render(<NewArticlePage />);

      const form = screen.getByRole('form');
      expect(form).toBeInTheDocument();
    });
  });

  describe('Form Fields', () => {
    it('renders title input with required indicator', () => {
      render(<NewArticlePage />);

      expect(screen.getByLabelText(/title/i)).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Enter article title')).toBeInTheDocument();
      expect(screen.getByLabelText(/title/i)).toHaveAttribute('required');
    });

    it('renders summary textarea', () => {
      render(<NewArticlePage />);

      expect(screen.getByLabelText(/summary/i)).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Brief summary of the article')).toBeInTheDocument();
    });

    it('renders content textarea with required indicator', () => {
      render(<NewArticlePage />);

      expect(screen.getByLabelText(/^content/i)).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Article content (Markdown supported)')).toBeInTheDocument();
      expect(screen.getByText('Supports Markdown formatting')).toBeInTheDocument();
      expect(screen.getByLabelText(/^content/i)).toHaveAttribute('required');
    });

    it('renders article type dropdown with all options', () => {
      render(<NewArticlePage />);

      const typeSelect = screen.getByLabelText(/article type/i);
      expect(typeSelect).toBeInTheDocument();

      const options = typeSelect.querySelectorAll('option');
      expect(options).toHaveLength(6);
      expect(options[0]).toHaveTextContent('How-To Guide');
      expect(options[1]).toHaveTextContent('Troubleshooting');
      expect(options[2]).toHaveTextContent('FAQ');
      expect(options[3]).toHaveTextContent('Reference');
      expect(options[4]).toHaveTextContent('Policy');
      expect(options[5]).toHaveTextContent('Known Error');
    });

    it('renders visibility dropdown with all options', () => {
      render(<NewArticlePage />);

      const visibilitySelect = screen.getByLabelText(/visibility/i);
      expect(visibilitySelect).toBeInTheDocument();

      const options = visibilitySelect.querySelectorAll('option');
      expect(options).toHaveLength(3);
      expect(options[0]).toHaveTextContent('Public');
      expect(options[1]).toHaveTextContent('Internal');
      expect(options[2]).toHaveTextContent('Restricted');
    });

    it('renders category dropdown with categories from API', () => {
      render(<NewArticlePage />);

      const categorySelect = screen.getByLabelText(/category/i);
      expect(categorySelect).toBeInTheDocument();

      const options = categorySelect.querySelectorAll('option');
      expect(options).toHaveLength(3); // No Category + 2 mock categories
      expect(options[0]).toHaveTextContent('No Category');
      expect(options[1]).toHaveTextContent('Getting Started');
      expect(options[2]).toHaveTextContent('Troubleshooting');
    });

    it('renders tags input with helper text', () => {
      render(<NewArticlePage />);

      expect(screen.getByLabelText(/^tags$/i)).toBeInTheDocument();
      expect(screen.getByPlaceholderText('tag1, tag2, tag3')).toBeInTheDocument();
      expect(screen.getByText('Comma-separated list')).toBeInTheDocument();
    });

    it('renders keywords input with helper text', () => {
      render(<NewArticlePage />);

      expect(screen.getByLabelText(/keywords/i)).toBeInTheDocument();
      expect(screen.getByPlaceholderText('keyword1, keyword2, keyword3')).toBeInTheDocument();
      expect(screen.getByText('Comma-separated list for search')).toBeInTheDocument();
    });
  });

  describe('Form Actions', () => {
    it('renders cancel button linking to knowledge base', () => {
      render(<NewArticlePage />);

      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      expect(cancelButton).toBeInTheDocument();
      expect(cancelButton.closest('a')).toHaveAttribute('href', '/knowledge-base');
    });

    it('renders create article button', () => {
      render(<NewArticlePage />);

      expect(screen.getByRole('button', { name: /create article/i })).toBeInTheDocument();
    });
  });

  describe('Form Input Handling', () => {
    it('updates title when typed', () => {
      render(<NewArticlePage />);

      const titleInput = screen.getByLabelText(/title/i);
      fireEvent.change(titleInput, { target: { value: 'My Test Article' } });

      expect(titleInput).toHaveValue('My Test Article');
    });

    it('updates summary when typed', () => {
      render(<NewArticlePage />);

      const summaryInput = screen.getByLabelText(/summary/i);
      fireEvent.change(summaryInput, { target: { value: 'This is a summary' } });

      expect(summaryInput).toHaveValue('This is a summary');
    });

    it('updates content when typed', () => {
      render(<NewArticlePage />);

      const contentInput = screen.getByLabelText(/^content/i);
      fireEvent.change(contentInput, { target: { value: 'Article content here' } });

      expect(contentInput).toHaveValue('Article content here');
    });

    it('updates article type when changed', () => {
      render(<NewArticlePage />);

      const typeSelect = screen.getByLabelText(/article type/i);
      fireEvent.change(typeSelect, { target: { value: 'faq' } });

      expect(typeSelect).toHaveValue('faq');
    });

    it('updates visibility when changed', () => {
      render(<NewArticlePage />);

      const visibilitySelect = screen.getByLabelText(/visibility/i);
      fireEvent.change(visibilitySelect, { target: { value: 'public' } });

      expect(visibilitySelect).toHaveValue('public');
    });

    it('updates category when changed', () => {
      render(<NewArticlePage />);

      const categorySelect = screen.getByLabelText(/category/i);
      fireEvent.change(categorySelect, { target: { value: 'cat-1' } });

      expect(categorySelect).toHaveValue('cat-1');
    });

    it('updates tags when typed', () => {
      render(<NewArticlePage />);

      const tagsInput = screen.getByLabelText(/^tags$/i);
      fireEvent.change(tagsInput, { target: { value: 'tag1, tag2' } });

      expect(tagsInput).toHaveValue('tag1, tag2');
    });

    it('updates keywords when typed', () => {
      render(<NewArticlePage />);

      const keywordsInput = screen.getByLabelText(/keywords/i);
      fireEvent.change(keywordsInput, { target: { value: 'keyword1, keyword2' } });

      expect(keywordsInput).toHaveValue('keyword1, keyword2');
    });
  });

  describe('Form Validation', () => {
    it('shows error when title is too short', async () => {
      render(<NewArticlePage />);

      const titleInput = screen.getByLabelText(/title/i);
      const contentInput = screen.getByLabelText(/^content/i);
      const submitButton = screen.getByRole('button', { name: /create article/i });

      fireEvent.change(titleInput, { target: { value: 'Hi' } });
      fireEvent.change(contentInput, { target: { value: 'Valid content here' } });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Title must be at least 5 characters')).toBeInTheDocument();
      });
    });

    it('shows error when title is empty', async () => {
      render(<NewArticlePage />);

      const titleInput = screen.getByLabelText(/title/i);
      const contentInput = screen.getByLabelText(/^content/i);
      const submitButton = screen.getByRole('button', { name: /create article/i });

      fireEvent.change(titleInput, { target: { value: '   ' } });
      fireEvent.change(contentInput, { target: { value: 'Valid content here' } });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Title must be at least 5 characters')).toBeInTheDocument();
      });
    });

    it('shows error when content is too short', async () => {
      render(<NewArticlePage />);

      const titleInput = screen.getByLabelText(/title/i);
      const contentInput = screen.getByLabelText(/^content/i);
      const submitButton = screen.getByRole('button', { name: /create article/i });

      fireEvent.change(titleInput, { target: { value: 'Valid Title' } });
      fireEvent.change(contentInput, { target: { value: 'Short' } });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Content must be at least 10 characters')).toBeInTheDocument();
      });
    });

    it('shows error when content is empty', async () => {
      render(<NewArticlePage />);

      const titleInput = screen.getByLabelText(/title/i);
      const contentInput = screen.getByLabelText(/^content/i);
      const submitButton = screen.getByRole('button', { name: /create article/i });

      fireEvent.change(titleInput, { target: { value: 'Valid Title' } });
      fireEvent.change(contentInput, { target: { value: '   ' } });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Content must be at least 10 characters')).toBeInTheDocument();
      });
    });

    it('clears error when validation passes', async () => {
      render(<NewArticlePage />);

      const titleInput = screen.getByLabelText(/title/i);
      const contentInput = screen.getByLabelText(/^content/i);
      const submitButton = screen.getByRole('button', { name: /create article/i });

      // First submit with invalid data
      fireEvent.change(titleInput, { target: { value: 'Hi' } });
      fireEvent.change(contentInput, { target: { value: 'Valid content here' } });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Title must be at least 5 characters')).toBeInTheDocument();
      });

      // Fix the title and submit again
      fireEvent.change(titleInput, { target: { value: 'Valid Title' } });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.queryByText('Title must be at least 5 characters')).not.toBeInTheDocument();
      });
    });
  });

  describe('Form Submission', () => {
    it('calls createArticle API with form data on submit', async () => {
      const mockMutateAsync = vi.fn().mockResolvedValue({});
      mockUseCreateKBArticle.mockReturnValue({
        mutateAsync: mockMutateAsync,
        isPending: false,
      });

      render(<NewArticlePage />);

      fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'Test Article' } });
      fireEvent.change(screen.getByLabelText(/summary/i), { target: { value: 'Test summary' } });
      fireEvent.change(screen.getByLabelText(/^content/i), { target: { value: 'This is the article content' } });
      fireEvent.change(screen.getByLabelText(/article type/i), { target: { value: 'troubleshooting' } });
      fireEvent.change(screen.getByLabelText(/visibility/i), { target: { value: 'public' } });
      fireEvent.change(screen.getByLabelText(/category/i), { target: { value: 'cat-1' } });
      fireEvent.change(screen.getByLabelText(/^tags$/i), { target: { value: 'tag1, tag2' } });
      fireEvent.change(screen.getByLabelText(/keywords/i), { target: { value: 'keyword1, keyword2' } });

      fireEvent.click(screen.getByRole('button', { name: /create article/i }));

      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalledWith({
          title: 'Test Article',
          summary: 'Test summary',
          content: 'This is the article content',
          type: 'troubleshooting',
          visibility: 'public',
          categoryId: 'cat-1',
          tags: ['tag1', 'tag2'],
          keywords: ['keyword1', 'keyword2'],
        });
      });
    });

    it('redirects to knowledge base list after successful submission', async () => {
      const mockMutateAsync = vi.fn().mockResolvedValue({});
      mockUseCreateKBArticle.mockReturnValue({
        mutateAsync: mockMutateAsync,
        isPending: false,
      });

      render(<NewArticlePage />);

      fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'Test Article' } });
      fireEvent.change(screen.getByLabelText(/^content/i), { target: { value: 'This is the article content' } });

      fireEvent.click(screen.getByRole('button', { name: /create article/i }));

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/knowledge-base');
      });
    });

    it('omits optional fields when empty', async () => {
      const mockMutateAsync = vi.fn().mockResolvedValue({});
      mockUseCreateKBArticle.mockReturnValue({
        mutateAsync: mockMutateAsync,
        isPending: false,
      });

      render(<NewArticlePage />);

      fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'Minimal Article' } });
      fireEvent.change(screen.getByLabelText(/^content/i), { target: { value: 'Just the required content' } });

      fireEvent.click(screen.getByRole('button', { name: /create article/i }));

      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalledWith({
          title: 'Minimal Article',
          content: 'Just the required content',
          type: 'how_to',
          visibility: 'internal',
          summary: undefined,
          categoryId: undefined,
          tags: undefined,
          keywords: undefined,
        });
      });
    });

    it('trims whitespace from title, summary, and content', async () => {
      const mockMutateAsync = vi.fn().mockResolvedValue({});
      mockUseCreateKBArticle.mockReturnValue({
        mutateAsync: mockMutateAsync,
        isPending: false,
      });

      render(<NewArticlePage />);

      fireEvent.change(screen.getByLabelText(/title/i), { target: { value: '  Test Article  ' } });
      fireEvent.change(screen.getByLabelText(/summary/i), { target: { value: '  Test summary  ' } });
      fireEvent.change(screen.getByLabelText(/^content/i), { target: { value: '  Article content  ' } });

      fireEvent.click(screen.getByRole('button', { name: /create article/i }));

      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'Test Article',
            summary: 'Test summary',
            content: 'Article content',
          })
        );
      });
    });

    it('parses tags correctly, filtering empty values', async () => {
      const mockMutateAsync = vi.fn().mockResolvedValue({});
      mockUseCreateKBArticle.mockReturnValue({
        mutateAsync: mockMutateAsync,
        isPending: false,
      });

      render(<NewArticlePage />);

      fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'Test Article' } });
      fireEvent.change(screen.getByLabelText(/^content/i), { target: { value: 'Article content here' } });
      fireEvent.change(screen.getByLabelText(/^tags$/i), { target: { value: 'tag1,  , tag2,  tag3  ' } });

      fireEvent.click(screen.getByRole('button', { name: /create article/i }));

      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalledWith(
          expect.objectContaining({
            tags: ['tag1', 'tag2', 'tag3'],
          })
        );
      });
    });

    it('parses keywords correctly, filtering empty values', async () => {
      const mockMutateAsync = vi.fn().mockResolvedValue({});
      mockUseCreateKBArticle.mockReturnValue({
        mutateAsync: mockMutateAsync,
        isPending: false,
      });

      render(<NewArticlePage />);

      fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'Test Article' } });
      fireEvent.change(screen.getByLabelText(/^content/i), { target: { value: 'Article content here' } });
      fireEvent.change(screen.getByLabelText(/keywords/i), { target: { value: 'key1,  , key2,  key3  ' } });

      fireEvent.click(screen.getByRole('button', { name: /create article/i }));

      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalledWith(
          expect.objectContaining({
            keywords: ['key1', 'key2', 'key3'],
          })
        );
      });
    });

    it('shows error message on API failure', async () => {
      const mockMutateAsync = vi.fn().mockRejectedValue(new Error('Network error'));
      mockUseCreateKBArticle.mockReturnValue({
        mutateAsync: mockMutateAsync,
        isPending: false,
      });

      render(<NewArticlePage />);

      fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'Test Article' } });
      fireEvent.change(screen.getByLabelText(/^content/i), { target: { value: 'Article content here' } });

      fireEvent.click(screen.getByRole('button', { name: /create article/i }));

      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument();
      });
    });

    it('shows generic error message on unknown failure', async () => {
      const mockMutateAsync = vi.fn().mockRejectedValue('Unknown error');
      mockUseCreateKBArticle.mockReturnValue({
        mutateAsync: mockMutateAsync,
        isPending: false,
      });

      render(<NewArticlePage />);

      fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'Test Article' } });
      fireEvent.change(screen.getByLabelText(/^content/i), { target: { value: 'Article content here' } });

      fireEvent.click(screen.getByRole('button', { name: /create article/i }));

      await waitFor(() => {
        expect(screen.getByText('Failed to create article')).toBeInTheDocument();
      });
    });

    it('disables submit button while creating', () => {
      mockUseCreateKBArticle.mockReturnValue({
        mutateAsync: vi.fn(),
        isPending: true,
      });

      render(<NewArticlePage />);

      const submitButton = screen.getByRole('button', { name: /creating/i });
      expect(submitButton).toBeDisabled();
    });

    it('shows loading state while creating', () => {
      mockUseCreateKBArticle.mockReturnValue({
        mutateAsync: vi.fn(),
        isPending: true,
      });

      render(<NewArticlePage />);

      expect(screen.getByText('Creating...')).toBeInTheDocument();
    });
  });

  describe('Categories Loading', () => {
    it('handles empty categories list', () => {
      mockUseKBCategories.mockReturnValue({
        data: undefined,
        isLoading: false,
      });

      render(<NewArticlePage />);

      const categorySelect = screen.getByLabelText(/category/i);
      const options = categorySelect.querySelectorAll('option');

      expect(options).toHaveLength(1);
      expect(options[0]).toHaveTextContent('No Category');
    });

    it('handles null categories data', () => {
      mockUseKBCategories.mockReturnValue({
        data: null,
        isLoading: false,
      });

      render(<NewArticlePage />);

      const categorySelect = screen.getByLabelText(/category/i);
      const options = categorySelect.querySelectorAll('option');

      expect(options).toHaveLength(1);
      expect(options[0]).toHaveTextContent('No Category');
    });
  });

  describe('Default Values', () => {
    it('defaults article type to how_to', () => {
      render(<NewArticlePage />);

      const typeSelect = screen.getByLabelText(/article type/i);
      expect(typeSelect).toHaveValue('how_to');
    });

    it('defaults visibility to internal', () => {
      render(<NewArticlePage />);

      const visibilitySelect = screen.getByLabelText(/visibility/i);
      expect(visibilitySelect).toHaveValue('internal');
    });

    it('defaults category to empty', () => {
      render(<NewArticlePage />);

      const categorySelect = screen.getByLabelText(/category/i);
      expect(categorySelect).toHaveValue('');
    });
  });
});
