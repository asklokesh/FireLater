import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import KnowledgeBasePage from '../page';
import * as useApiModule from '@/hooks/useApi';

// Mock Next.js Link component
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

// Mock useApi hook
vi.mock('@/hooks/useApi', () => ({
  useKBArticles: vi.fn(),
  useKBCategories: vi.fn(),
}));

// Mock UI components
vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, variant, size, disabled, className }: any) => (
    <button onClick={onClick} disabled={disabled} className={className}>
      {children}
    </button>
  ),
}));

const mockArticles = [
  {
    id: '1',
    article_number: 'KB-001',
    title: 'How to Reset Your Password',
    summary: 'Step-by-step guide for password reset',
    status: 'published',
    type: 'how_to',
    visibility: 'public',
    author_name: 'John Doe',
    category_name: 'User Guides',
    view_count: 150,
    helpful_count: 45,
    created_at: '2024-01-15T10:00:00Z',
    updated_at: '2024-01-20T14:30:00Z',
  },
  {
    id: '2',
    article_number: 'KB-002',
    title: 'Troubleshooting Login Issues',
    summary: 'Common login problems and solutions',
    status: 'published',
    type: 'troubleshooting',
    visibility: 'internal',
    author_name: 'Jane Smith',
    category_name: 'Troubleshooting',
    view_count: 89,
    helpful_count: 23,
    created_at: '2024-01-10T09:00:00Z',
    updated_at: '2024-01-18T11:20:00Z',
  },
  {
    id: '3',
    article_number: 'KB-003',
    title: 'API Documentation',
    summary: 'Reference documentation for REST API',
    status: 'draft',
    type: 'reference',
    visibility: 'internal',
    author_name: null,
    category_name: null,
    view_count: 0,
    helpful_count: 0,
    created_at: '2024-01-05T08:00:00Z',
    updated_at: '2024-01-17T09:15:00Z',
  },
];

const mockCategories = [
  { id: 'cat-1', name: 'User Guides' },
  { id: 'cat-2', name: 'Troubleshooting' },
  { id: 'cat-3', name: 'API Documentation' },
];

describe('KnowledgeBasePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Basic Rendering', () => {
    it('renders page title and description', () => {
      vi.mocked(useApiModule.useKBArticles).mockReturnValue({
        data: { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 } },
        isLoading: false,
        error: null,
      } as any);
      vi.mocked(useApiModule.useKBCategories).mockReturnValue({
        data: [],
      } as any);

      render(<KnowledgeBasePage />);

      expect(screen.getByText('Knowledge Base')).toBeInTheDocument();
      expect(screen.getByText('Documentation, guides, and troubleshooting articles')).toBeInTheDocument();
    });

    it('renders new article button', () => {
      vi.mocked(useApiModule.useKBArticles).mockReturnValue({
        data: { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 } },
        isLoading: false,
        error: null,
      } as any);
      vi.mocked(useApiModule.useKBCategories).mockReturnValue({
        data: [],
      } as any);

      render(<KnowledgeBasePage />);

      const newButton = screen.getByRole('button', { name: /new article/i });
      expect(newButton).toBeInTheDocument();
      expect(newButton.closest('a')).toHaveAttribute('href', '/knowledge-base/new');
    });
  });

  describe('Quick Stats', () => {
    it('displays total articles count', () => {
      vi.mocked(useApiModule.useKBArticles).mockReturnValue({
        data: { data: mockArticles, pagination: { page: 1, limit: 20, total: 25, totalPages: 2 } },
        isLoading: false,
        error: null,
      } as any);
      vi.mocked(useApiModule.useKBCategories).mockReturnValue({
        data: mockCategories,
      } as any);

      render(<KnowledgeBasePage />);

      expect(screen.getByText('Total Articles')).toBeInTheDocument();
      expect(screen.getByText('25')).toBeInTheDocument();
    });

    it('displays published articles count', () => {
      vi.mocked(useApiModule.useKBArticles).mockReturnValue({
        data: { data: mockArticles, pagination: { page: 1, limit: 20, total: 25, totalPages: 2 } },
        isLoading: false,
        error: null,
      } as any);
      vi.mocked(useApiModule.useKBCategories).mockReturnValue({
        data: mockCategories,
      } as any);

      render(<KnowledgeBasePage />);

      const publishedLabels = screen.getAllByText('Published');
      expect(publishedLabels.length).toBeGreaterThan(0);
      const publishedCount = mockArticles.filter(a => a.status === 'published').length;
      expect(screen.getByText(publishedCount.toString())).toBeInTheDocument();
    });

    it('displays drafts count', () => {
      vi.mocked(useApiModule.useKBArticles).mockReturnValue({
        data: { data: mockArticles, pagination: { page: 1, limit: 20, total: 25, totalPages: 2 } },
        isLoading: false,
        error: null,
      } as any);
      vi.mocked(useApiModule.useKBCategories).mockReturnValue({
        data: mockCategories,
      } as any);

      render(<KnowledgeBasePage />);

      expect(screen.getByText('Drafts')).toBeInTheDocument();
      const draftCount = mockArticles.filter(a => a.status === 'draft').length;
      expect(screen.getByText(draftCount.toString())).toBeInTheDocument();
    });

    it('displays categories count', () => {
      vi.mocked(useApiModule.useKBArticles).mockReturnValue({
        data: { data: mockArticles, pagination: { page: 1, limit: 20, total: 25, totalPages: 2 } },
        isLoading: false,
        error: null,
      } as any);
      vi.mocked(useApiModule.useKBCategories).mockReturnValue({
        data: mockCategories,
      } as any);

      render(<KnowledgeBasePage />);

      expect(screen.getByText('Categories')).toBeInTheDocument();
      expect(screen.getByText('3')).toBeInTheDocument();
    });
  });

  describe('Search and Filters', () => {
    it('renders search input', () => {
      vi.mocked(useApiModule.useKBArticles).mockReturnValue({
        data: { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 } },
        isLoading: false,
        error: null,
      } as any);
      vi.mocked(useApiModule.useKBCategories).mockReturnValue({
        data: [],
      } as any);

      render(<KnowledgeBasePage />);

      expect(screen.getByPlaceholderText('Search articles...')).toBeInTheDocument();
    });

    it('allows typing in search field', () => {
      vi.mocked(useApiModule.useKBArticles).mockReturnValue({
        data: { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 } },
        isLoading: false,
        error: null,
      } as any);
      vi.mocked(useApiModule.useKBCategories).mockReturnValue({
        data: [],
      } as any);

      render(<KnowledgeBasePage />);

      const searchInput = screen.getByPlaceholderText('Search articles...') as HTMLInputElement;
      fireEvent.change(searchInput, { target: { value: 'password' } });
      expect(searchInput.value).toBe('password');
    });

    it('renders filters button', () => {
      vi.mocked(useApiModule.useKBArticles).mockReturnValue({
        data: { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 } },
        isLoading: false,
        error: null,
      } as any);
      vi.mocked(useApiModule.useKBCategories).mockReturnValue({
        data: [],
      } as any);

      render(<KnowledgeBasePage />);

      expect(screen.getByRole('button', { name: /filters/i })).toBeInTheDocument();
    });

    it('toggles filter visibility when filters button clicked', () => {
      vi.mocked(useApiModule.useKBArticles).mockReturnValue({
        data: { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 } },
        isLoading: false,
        error: null,
      } as any);
      vi.mocked(useApiModule.useKBCategories).mockReturnValue({
        data: mockCategories,
      } as any);

      render(<KnowledgeBasePage />);

      expect(screen.queryByText('All Status')).not.toBeInTheDocument();

      const filtersButton = screen.getByRole('button', { name: /filters/i });
      fireEvent.click(filtersButton);

      expect(screen.getByText('All Status')).toBeInTheDocument();
      expect(screen.getByText('All Types')).toBeInTheDocument();
      expect(screen.getByText('All Categories')).toBeInTheDocument();
    });

    it('renders status filter options when filters shown', () => {
      vi.mocked(useApiModule.useKBArticles).mockReturnValue({
        data: { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 } },
        isLoading: false,
        error: null,
      } as any);
      vi.mocked(useApiModule.useKBCategories).mockReturnValue({
        data: mockCategories,
      } as any);

      render(<KnowledgeBasePage />);

      fireEvent.click(screen.getByRole('button', { name: /filters/i }));

      expect(screen.getByText('All Status')).toBeInTheDocument();
      expect(screen.getByText('Draft')).toBeInTheDocument();
      expect(screen.getByText('In Review')).toBeInTheDocument();
      expect(screen.getByText('Archived')).toBeInTheDocument();
    });

    it('renders type filter options when filters shown', () => {
      vi.mocked(useApiModule.useKBArticles).mockReturnValue({
        data: { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 } },
        isLoading: false,
        error: null,
      } as any);
      vi.mocked(useApiModule.useKBCategories).mockReturnValue({
        data: mockCategories,
      } as any);

      render(<KnowledgeBasePage />);

      fireEvent.click(screen.getByRole('button', { name: /filters/i }));

      expect(screen.getByText('All Types')).toBeInTheDocument();
      expect(screen.getByText('FAQ')).toBeInTheDocument();
      expect(screen.getByText('Policy')).toBeInTheDocument();
      expect(screen.getByText('Known Error')).toBeInTheDocument();
    });

    it('renders category filter with categories', () => {
      vi.mocked(useApiModule.useKBArticles).mockReturnValue({
        data: { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 } },
        isLoading: false,
        error: null,
      } as any);
      vi.mocked(useApiModule.useKBCategories).mockReturnValue({
        data: mockCategories,
      } as any);

      render(<KnowledgeBasePage />);

      fireEvent.click(screen.getByRole('button', { name: /filters/i }));

      expect(screen.getByText('All Categories')).toBeInTheDocument();
      expect(screen.getByText('User Guides')).toBeInTheDocument();
      expect(screen.getByText('API Documentation')).toBeInTheDocument();
    });
  });

  describe('Articles List', () => {
    it('displays article information', () => {
      vi.mocked(useApiModule.useKBArticles).mockReturnValue({
        data: { data: mockArticles, pagination: { page: 1, limit: 20, total: 3, totalPages: 1 } },
        isLoading: false,
        error: null,
      } as any);
      vi.mocked(useApiModule.useKBCategories).mockReturnValue({
        data: mockCategories,
      } as any);

      render(<KnowledgeBasePage />);

      expect(screen.getByText('KB-001')).toBeInTheDocument();
      expect(screen.getByText('How to Reset Your Password')).toBeInTheDocument();
      expect(screen.getByText('KB-002')).toBeInTheDocument();
      expect(screen.getByText('Troubleshooting Login Issues')).toBeInTheDocument();
    });

    it('displays article type labels', () => {
      vi.mocked(useApiModule.useKBArticles).mockReturnValue({
        data: { data: mockArticles, pagination: { page: 1, limit: 20, total: 3, totalPages: 1 } },
        isLoading: false,
        error: null,
      } as any);
      vi.mocked(useApiModule.useKBCategories).mockReturnValue({
        data: mockCategories,
      } as any);

      render(<KnowledgeBasePage />);

      const typeLabels = screen.getAllByText(/How-To|Troubleshooting|Reference/);
      expect(typeLabels.length).toBeGreaterThanOrEqual(3);
    });

    it('displays status badges', () => {
      vi.mocked(useApiModule.useKBArticles).mockReturnValue({
        data: { data: mockArticles, pagination: { page: 1, limit: 20, total: 3, totalPages: 1 } },
        isLoading: false,
        error: null,
      } as any);
      vi.mocked(useApiModule.useKBCategories).mockReturnValue({
        data: mockCategories,
      } as any);

      render(<KnowledgeBasePage />);

      const publishedBadges = screen.getAllByText('Published');
      expect(publishedBadges.length).toBeGreaterThan(0);
      expect(screen.getByText('Draft')).toBeInTheDocument();
    });

    it('displays visibility badges', () => {
      vi.mocked(useApiModule.useKBArticles).mockReturnValue({
        data: { data: mockArticles, pagination: { page: 1, limit: 20, total: 3, totalPages: 1 } },
        isLoading: false,
        error: null,
      } as any);
      vi.mocked(useApiModule.useKBCategories).mockReturnValue({
        data: mockCategories,
      } as any);

      render(<KnowledgeBasePage />);

      expect(screen.getByText('Public')).toBeInTheDocument();
      const internalBadges = screen.getAllByText('Internal');
      expect(internalBadges.length).toBeGreaterThan(0);
    });

    it('displays author names', () => {
      vi.mocked(useApiModule.useKBArticles).mockReturnValue({
        data: { data: mockArticles, pagination: { page: 1, limit: 20, total: 3, totalPages: 1 } },
        isLoading: false,
        error: null,
      } as any);
      vi.mocked(useApiModule.useKBCategories).mockReturnValue({
        data: mockCategories,
      } as any);

      render(<KnowledgeBasePage />);

      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.getByText('Jane Smith')).toBeInTheDocument();
    });

    it('displays Unknown for articles without author', () => {
      vi.mocked(useApiModule.useKBArticles).mockReturnValue({
        data: { data: mockArticles, pagination: { page: 1, limit: 20, total: 3, totalPages: 1 } },
        isLoading: false,
        error: null,
      } as any);
      vi.mocked(useApiModule.useKBCategories).mockReturnValue({
        data: mockCategories,
      } as any);

      render(<KnowledgeBasePage />);

      expect(screen.getByText('Unknown')).toBeInTheDocument();
    });

    it('displays view and helpful counts', () => {
      vi.mocked(useApiModule.useKBArticles).mockReturnValue({
        data: { data: mockArticles, pagination: { page: 1, limit: 20, total: 3, totalPages: 1 } },
        isLoading: false,
        error: null,
      } as any);
      vi.mocked(useApiModule.useKBCategories).mockReturnValue({
        data: mockCategories,
      } as any);

      render(<KnowledgeBasePage />);

      expect(screen.getByText('150')).toBeInTheDocument();
      expect(screen.getByText('45')).toBeInTheDocument();
      expect(screen.getByText('89')).toBeInTheDocument();
      expect(screen.getByText('23')).toBeInTheDocument();
    });

    it('renders article links correctly', () => {
      vi.mocked(useApiModule.useKBArticles).mockReturnValue({
        data: { data: mockArticles, pagination: { page: 1, limit: 20, total: 3, totalPages: 1 } },
        isLoading: false,
        error: null,
      } as any);
      vi.mocked(useApiModule.useKBCategories).mockReturnValue({
        data: mockCategories,
      } as any);

      render(<KnowledgeBasePage />);

      const link1 = screen.getByText('KB-001').closest('a');
      expect(link1).toHaveAttribute('href', '/knowledge-base/1');

      const link2 = screen.getByText('KB-002').closest('a');
      expect(link2).toHaveAttribute('href', '/knowledge-base/2');
    });
  });

  describe('Loading State', () => {
    it('displays loading spinner when loading', () => {
      vi.mocked(useApiModule.useKBArticles).mockReturnValue({
        data: undefined,
        isLoading: true,
        error: null,
      } as any);
      vi.mocked(useApiModule.useKBCategories).mockReturnValue({
        data: [],
      } as any);

      render(<KnowledgeBasePage />);

      expect(screen.getByText('Loading articles...')).toBeInTheDocument();
    });
  });

  describe('Error State', () => {
    it('displays error message when error occurs', () => {
      vi.mocked(useApiModule.useKBArticles).mockReturnValue({
        data: undefined,
        isLoading: false,
        error: new Error('Failed to load'),
      } as any);
      vi.mocked(useApiModule.useKBCategories).mockReturnValue({
        data: [],
      } as any);

      render(<KnowledgeBasePage />);

      expect(screen.getByText('Error loading knowledge base')).toBeInTheDocument();
      expect(screen.getByText('Please try refreshing the page')).toBeInTheDocument();
    });
  });

  describe('Empty State', () => {
    it('displays empty state when no articles found', () => {
      vi.mocked(useApiModule.useKBArticles).mockReturnValue({
        data: { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 } },
        isLoading: false,
        error: null,
      } as any);
      vi.mocked(useApiModule.useKBCategories).mockReturnValue({
        data: [],
      } as any);

      render(<KnowledgeBasePage />);

      expect(screen.getByText('No articles found')).toBeInTheDocument();
      expect(screen.getByText('Try adjusting your search or filters, or create a new article')).toBeInTheDocument();
    });
  });

  describe('Pagination', () => {
    it('displays pagination information', () => {
      vi.mocked(useApiModule.useKBArticles).mockReturnValue({
        data: { data: mockArticles, pagination: { page: 1, limit: 20, total: 50, totalPages: 3 } },
        isLoading: false,
        error: null,
      } as any);
      vi.mocked(useApiModule.useKBCategories).mockReturnValue({
        data: [],
      } as any);

      render(<KnowledgeBasePage />);

      expect(screen.getByText('Showing 3 of 50 articles')).toBeInTheDocument();
    });

    it('renders previous and next buttons', () => {
      vi.mocked(useApiModule.useKBArticles).mockReturnValue({
        data: { data: mockArticles, pagination: { page: 1, limit: 20, total: 50, totalPages: 3 } },
        isLoading: false,
        error: null,
      } as any);
      vi.mocked(useApiModule.useKBCategories).mockReturnValue({
        data: [],
      } as any);

      render(<KnowledgeBasePage />);

      expect(screen.getByRole('button', { name: /previous/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /next/i })).toBeInTheDocument();
    });

    it('disables previous button on first page', () => {
      vi.mocked(useApiModule.useKBArticles).mockReturnValue({
        data: { data: mockArticles, pagination: { page: 1, limit: 20, total: 50, totalPages: 3 } },
        isLoading: false,
        error: null,
      } as any);
      vi.mocked(useApiModule.useKBCategories).mockReturnValue({
        data: [],
      } as any);

      render(<KnowledgeBasePage />);

      const prevButton = screen.getByRole('button', { name: /previous/i });
      expect(prevButton).toBeDisabled();
    });

    it('disables next button on last page', () => {
      vi.mocked(useApiModule.useKBArticles).mockReturnValue({
        data: { data: mockArticles, pagination: { page: 1, limit: 20, total: 3, totalPages: 1 } },
        isLoading: false,
        error: null,
      } as any);
      vi.mocked(useApiModule.useKBCategories).mockReturnValue({
        data: [],
      } as any);

      render(<KnowledgeBasePage />);

      const nextButton = screen.getByRole('button', { name: /next/i });
      expect(nextButton).toBeDisabled();
    });
  });

  describe('Table Headers', () => {
    it('displays all table column headers', () => {
      vi.mocked(useApiModule.useKBArticles).mockReturnValue({
        data: { data: mockArticles, pagination: { page: 1, limit: 20, total: 3, totalPages: 1 } },
        isLoading: false,
        error: null,
      } as any);
      vi.mocked(useApiModule.useKBCategories).mockReturnValue({
        data: [],
      } as any);

      render(<KnowledgeBasePage />);

      expect(screen.getByText('Article')).toBeInTheDocument();
      expect(screen.getByText('Type / Category')).toBeInTheDocument();
      expect(screen.getByText('Status')).toBeInTheDocument();
      expect(screen.getByText('Author')).toBeInTheDocument();
      expect(screen.getByText('Views / Helpful')).toBeInTheDocument();
      expect(screen.getByText('Updated')).toBeInTheDocument();
      expect(screen.getByText('Actions')).toBeInTheDocument();
    });
  });
});
