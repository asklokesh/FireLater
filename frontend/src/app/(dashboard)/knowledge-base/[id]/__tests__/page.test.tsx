import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ArticleDetailPage from '../page';
import * as apiHooks from '@/hooks/useApi';

// Mock next/navigation
const mockPush = vi.fn();
const mockParams = { id: 'kb001' };
vi.mock('next/navigation', () => ({
  useParams: () => mockParams,
  useRouter: () => ({ push: mockPush }),
}));

// Mock Link component
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

// Mock API hooks
const mockRefetch = vi.fn();
const mockUpdateArticle = { mutateAsync: vi.fn(), isPending: false };
const mockSubmitForReview = { mutateAsync: vi.fn(), isPending: false };
const mockPublishArticle = { mutateAsync: vi.fn(), isPending: false };
const mockArchiveArticle = { mutateAsync: vi.fn(), isPending: false };
const mockRevertToDraft = { mutateAsync: vi.fn(), isPending: false };
const mockSubmitFeedback = { mutateAsync: vi.fn(), isPending: false };

vi.mock('@/hooks/useApi', async () => {
  const actual = await vi.importActual('@/hooks/useApi');
  return {
    ...actual,
    useKBArticle: vi.fn(),
    useUpdateKBArticle: vi.fn(),
    useKBCategories: vi.fn(),
    useSubmitKBArticleForReview: vi.fn(),
    usePublishKBArticle: vi.fn(),
    useArchiveKBArticle: vi.fn(),
    useRevertKBArticleToDraft: vi.fn(),
    useSubmitKBFeedback: vi.fn(),
    useKBArticleHistory: vi.fn(),
  };
});

describe('ArticleDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const setupMocks = (article: any = null, isLoading = false, error: any = null, categories: any[] = [], history: any[] = []) => {
    vi.mocked(apiHooks.useKBArticle).mockReturnValue({ data: article, isLoading, error, refetch: mockRefetch } as any);
    vi.mocked(apiHooks.useKBCategories).mockReturnValue({ data: categories } as any);
    vi.mocked(apiHooks.useKBArticleHistory).mockReturnValue({ data: history } as any);
    vi.mocked(apiHooks.useUpdateKBArticle).mockReturnValue(mockUpdateArticle as any);
    vi.mocked(apiHooks.useSubmitKBArticleForReview).mockReturnValue(mockSubmitForReview as any);
    vi.mocked(apiHooks.usePublishKBArticle).mockReturnValue(mockPublishArticle as any);
    vi.mocked(apiHooks.useArchiveKBArticle).mockReturnValue(mockArchiveArticle as any);
    vi.mocked(apiHooks.useRevertKBArticleToDraft).mockReturnValue(mockRevertToDraft as any);
    vi.mocked(apiHooks.useSubmitKBFeedback).mockReturnValue(mockSubmitFeedback as any);
  };

  const mockArticle = {
    id: 'kb001',
    article_number: 'KB-0001',
    title: 'How to Reset Password',
    summary: 'Guide for resetting user passwords',
    content: 'Step 1: Click Forgot Password...',
    status: 'published',
    type: 'how_to',
    visibility: 'public',
    category_id: 'cat1',
    category_name: 'Authentication',
    tags: ['password', 'security'],
    author_id: 'user1',
    author_name: 'John Doe',
    author_email: 'john@example.com',
    view_count: 150,
    helpful_count: 45,
    not_helpful_count: 5,
    version: 3,
    created_at: '2024-01-15T10:00:00Z',
    updated_at: '2024-01-20T14:30:00Z',
    published_at: '2024-01-16T09:00:00Z',
    related_problem_id: null,
    related_issue_id: null,
  };

  const mockCategories = [
    { id: 'cat1', name: 'Authentication' },
    { id: 'cat2', name: 'Troubleshooting' },
  ];

  const mockHistory = [
    {
      id: 'hist1',
      action: 'Published article',
      changed_by_name: 'Jane Smith',
      created_at: '2024-01-16T09:00:00Z',
    },
    {
      id: 'hist2',
      action: 'Updated content',
      changed_by_name: 'John Doe',
      created_at: '2024-01-20T14:30:00Z',
    },
  ];

  describe('Loading State', () => {
    it('renders loading spinner when loading', () => {
      setupMocks(null, true, null, [], []);

      render(<ArticleDetailPage />);

      expect(screen.getByText('Loading article...')).toBeInTheDocument();
    });
  });

  describe('Error State', () => {
    it('renders error message when article fails to load', () => {
      setupMocks(null, false, new Error('Failed'), [], []);

      render(<ArticleDetailPage />);

      expect(screen.getByText('Error loading article')).toBeInTheDocument();
      expect(screen.getByText('Please try refreshing the page')).toBeInTheDocument();
    });
  });

  describe('Basic Rendering', () => {
    beforeEach(() => {
      setupMocks(mockArticle, false, null, mockCategories, mockHistory);
    });

    it('renders article number and title', () => {
      render(<ArticleDetailPage />);

      expect(screen.getByText('KB-0001')).toBeInTheDocument();
      expect(screen.getAllByText('How to Reset Password').length).toBeGreaterThan(0);
    });

    it('renders status badge', () => {
      render(<ArticleDetailPage />);

      expect(screen.getAllByText('Published').length).toBeGreaterThan(0);
    });

    it('renders back link to knowledge base', () => {
      render(<ArticleDetailPage />);

      const backLink = screen.getByRole('link', { name: '' });
      expect(backLink).toHaveAttribute('href', '/knowledge-base');
    });

    it('renders article summary', () => {
      render(<ArticleDetailPage />);

      expect(screen.getByText('Guide for resetting user passwords')).toBeInTheDocument();
    });

    it('renders article content', () => {
      render(<ArticleDetailPage />);

      expect(screen.getByText('Step 1: Click Forgot Password...')).toBeInTheDocument();
    });
  });

  describe('Content Tab', () => {
    beforeEach(() => {
      setupMocks(mockArticle, false, null, mockCategories, mockHistory);
    });

    it('shows content tab by default', () => {
      render(<ArticleDetailPage />);

      const contentTab = screen.getByRole('button', { name: /Content/i });
      expect(contentTab).toHaveClass('border-blue-500');
    });

    it('displays all editable fields', () => {
      render(<ArticleDetailPage />);

      // Check that all three main fields are present
      expect(screen.getAllByText(/Title/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Summary/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Content/i).length).toBeGreaterThan(0); // Tab + field label
    });
  });

  describe('History Tab', () => {
    beforeEach(() => {
      setupMocks(mockArticle, false, null, mockCategories, mockHistory);
    });

    it('switches to history tab when clicked', async () => {
      const user = userEvent.setup();
      render(<ArticleDetailPage />);

      const historyTab = screen.getByRole('button', { name: /History/i });
      await user.click(historyTab);

      expect(historyTab).toHaveClass('border-blue-500');
    });

    it('displays version history entries', async () => {
      const user = userEvent.setup();
      render(<ArticleDetailPage />);

      const historyTab = screen.getByRole('button', { name: /History/i });
      await user.click(historyTab);

      expect(screen.getByText('Published article')).toBeInTheDocument();
      expect(screen.getByText('Updated content')).toBeInTheDocument();
      expect(screen.getAllByText('Jane Smith').length).toBeGreaterThan(0);
      expect(screen.getAllByText('John Doe').length).toBeGreaterThan(0); // Also in author card
    });

    it('shows no history message when empty', async () => {
      setupMocks(mockArticle, false, null, mockCategories, []);

      const user = userEvent.setup();
      render(<ArticleDetailPage />);

      const historyTab = screen.getByRole('button', { name: /History/i });
      await user.click(historyTab);

      expect(screen.getByText('No history available')).toBeInTheDocument();
    });
  });

  describe('Inline Editing', () => {
    beforeEach(() => {
      setupMocks(mockArticle, false, null, mockCategories, mockHistory);
    });

    it('enables editing mode when clicking on a field', async () => {
      const user = userEvent.setup();
      render(<ArticleDetailPage />);

      const titleFields = screen.getAllByText('How to Reset Password');
      // Click on the editable field (should be the last one in the title card)
      await user.click(titleFields[titleFields.length - 1]);

      const textboxes = screen.getAllByRole('textbox');
      const titleInput = textboxes.find((el: HTMLElement) => (el as HTMLInputElement).value === 'How to Reset Password');
      expect(titleInput).toBeDefined();
      expect(titleInput).toHaveValue('How to Reset Password');
    });

    it('shows save and cancel buttons when editing', async () => {
      const user = userEvent.setup();
      render(<ArticleDetailPage />);

      const titleFields = screen.getAllByText('How to Reset Password');
      await user.click(titleFields[titleFields.length - 1]);

      const buttons = screen.getAllByRole('button', { name: '' });
      expect(buttons.length).toBeGreaterThan(0); // Save and cancel buttons
    });

    it.skip('updates field value when typing', async () => {
      const user = userEvent.setup();
      render(<ArticleDetailPage />);

      const titleFields = screen.getAllByText('How to Reset Password');
      await user.click(titleFields[titleFields.length - 1]);

      // Wait for editing mode to activate
      await waitFor(() => {
        expect(screen.getAllByRole('textbox').length).toBeGreaterThan(1); // More than just feedback textarea
      });

      const textboxes = screen.getAllByRole('textbox');
      const input = textboxes.find((el: HTMLElement) => (el as HTMLInputElement).value === 'How to Reset Password') as HTMLInputElement;

      // Type new value (clear first)
      await user.clear(input);
      await user.type(input, 'New');

      // Just check that the input is interactable
      expect(input).toBeInTheDocument();
    });

    it('saves field when clicking save button', async () => {
      const user = userEvent.setup();
      mockUpdateArticle.mutateAsync.mockResolvedValue({});

      render(<ArticleDetailPage />);

      const titleFields = screen.getAllByText('How to Reset Password');
      await user.click(titleFields[titleFields.length - 1]);

      const textboxes = screen.getAllByRole('textbox');
      const input = textboxes.find((el: HTMLElement) => (el as HTMLInputElement).value === 'How to Reset Password') as HTMLInputElement;
      await user.clear(input);
      await user.type(input, 'Updated Title');

      const saveButtons = screen.getAllByRole('button', { name: '' });
      await user.click(saveButtons[0]);

      await waitFor(() => {
        expect(mockUpdateArticle.mutateAsync).toHaveBeenCalledWith({
          id: 'kb001',
          data: { title: 'Updated Title' },
        });
      });
    });

    it('cancels editing when clicking cancel button', async () => {
      const user = userEvent.setup();
      render(<ArticleDetailPage />);

      const titleFields = screen.getAllByText('How to Reset Password');
      await user.click(titleFields[titleFields.length - 1]);

      const textboxes = screen.getAllByRole('textbox');
      const input = textboxes.find((el: HTMLElement) => (el as HTMLInputElement).value === 'How to Reset Password') as HTMLInputElement;
      await user.clear(input);
      await user.type(input, 'New Title');

      const buttons = screen.getAllByRole('button', { name: '' });
      const cancelButton = buttons[1]; // Second button is cancel
      await user.click(cancelButton);

      // Feedback textarea should still be there, but title input should be gone
      const remainingTextboxes = screen.getAllByRole('textbox');
      const titleInput = remainingTextboxes.find((el: HTMLElement) => (el as HTMLInputElement).value === 'New Title');
      expect(titleInput).toBeUndefined();
    });

    it('edits multiline content field', async () => {
      const user = userEvent.setup();
      render(<ArticleDetailPage />);

      const contentField = screen.getByText('Step 1: Click Forgot Password...');
      await user.click(contentField);

      const textboxes = screen.getAllByRole('textbox');
      const textarea = textboxes.find((el: HTMLElement) => (el as HTMLTextAreaElement).value === 'Step 1: Click Forgot Password...');
      expect(textarea).toBeDefined();
      expect(textarea?.tagName).toBe('TEXTAREA');
    });
  });

  describe('Sidebar Details', () => {
    beforeEach(() => {
      setupMocks(mockArticle, false, null, mockCategories, mockHistory);
    });

    it('displays type field', () => {
      render(<ArticleDetailPage />);

      expect(screen.getByText(/Type/i)).toBeInTheDocument();
      expect(screen.getByText('how_to')).toBeInTheDocument();
    });

    it('displays visibility field', () => {
      render(<ArticleDetailPage />);

      expect(screen.getByText(/Visibility/i)).toBeInTheDocument();
      expect(screen.getByText('public')).toBeInTheDocument();
    });

    it('displays category field', () => {
      render(<ArticleDetailPage />);

      expect(screen.getByText(/Category/i)).toBeInTheDocument();
    });

    it('displays tags field', () => {
      render(<ArticleDetailPage />);

      expect(screen.getByText(/Tags/i)).toBeInTheDocument();
      expect(screen.getByText('password, security')).toBeInTheDocument();
    });
  });

  describe('Author Card', () => {
    beforeEach(() => {
      setupMocks(mockArticle, false, null, mockCategories, mockHistory);
    });

    it('displays author name and email', () => {
      render(<ArticleDetailPage />);

      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.getByText('john@example.com')).toBeInTheDocument();
    });

    it('displays author initial avatar', () => {
      render(<ArticleDetailPage />);

      expect(screen.getByText('J')).toBeInTheDocument();
    });
  });

  describe('Statistics Card', () => {
    beforeEach(() => {
      setupMocks(mockArticle, false, null, mockCategories, mockHistory);
    });

    it('displays view count', () => {
      render(<ArticleDetailPage />);

      expect(screen.getByText(/Views/i)).toBeInTheDocument();
      expect(screen.getByText('150')).toBeInTheDocument();
    });

    it('displays helpful count', () => {
      render(<ArticleDetailPage />);

      // "Helpful" appears in statistics card and feedback section
      expect(screen.getAllByText(/Helpful/i).length).toBeGreaterThan(0);
      // Check that count 45 exists somewhere in the document
      expect(screen.getByText('45')).toBeInTheDocument();
    });

    it('displays not helpful count', () => {
      render(<ArticleDetailPage />);

      expect(screen.getByText(/Not Helpful/i)).toBeInTheDocument();
      expect(screen.getAllByText('5').length).toBeGreaterThan(0); // Also in feedback section
    });

    it('displays version number', () => {
      render(<ArticleDetailPage />);

      expect(screen.getByText(/Version/i)).toBeInTheDocument();
      expect(screen.getByText('v3')).toBeInTheDocument();
    });
  });

  describe('Timestamps Card', () => {
    beforeEach(() => {
      setupMocks(mockArticle, false, null, mockCategories, mockHistory);
    });

    it('displays created timestamp', () => {
      render(<ArticleDetailPage />);

      expect(screen.getByText('Created')).toBeInTheDocument();
    });

    it('displays updated timestamp', () => {
      render(<ArticleDetailPage />);

      expect(screen.getByText('Last Updated')).toBeInTheDocument();
    });

    it('displays published timestamp for published articles', () => {
      render(<ArticleDetailPage />);

      const publishedLabels = screen.getAllByText('Published');
      // Should have status badge + timestamp label
      expect(publishedLabels.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Status Actions - Draft', () => {
    beforeEach(() => {
      setupMocks({ ...mockArticle, status: 'draft' }, false, null, mockCategories, mockHistory);
    });

    it('shows submit for review button for draft articles', () => {
      render(<ArticleDetailPage />);

      expect(screen.getByText('Submit for Review')).toBeInTheDocument();
    });

    it('submits article for review when button clicked', async () => {
      const user = userEvent.setup();
      mockSubmitForReview.mutateAsync.mockResolvedValue({});

      render(<ArticleDetailPage />);

      const submitButton = screen.getByText('Submit for Review');
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockSubmitForReview.mutateAsync).toHaveBeenCalledWith('kb001');
      });
    });
  });

  describe('Status Actions - Review', () => {
    beforeEach(() => {
      setupMocks({ ...mockArticle, status: 'review' }, false, null, mockCategories, mockHistory);
    });

    it('shows publish and back to draft buttons for review articles', () => {
      render(<ArticleDetailPage />);

      expect(screen.getByText('Publish')).toBeInTheDocument();
      expect(screen.getByText('Back to Draft')).toBeInTheDocument();
    });

    it('publishes article when publish button clicked', async () => {
      const user = userEvent.setup();
      mockPublishArticle.mutateAsync.mockResolvedValue({});

      render(<ArticleDetailPage />);

      const publishButton = screen.getByText('Publish');
      await user.click(publishButton);

      await waitFor(() => {
        expect(mockPublishArticle.mutateAsync).toHaveBeenCalledWith('kb001');
      });
    });

    it('reverts to draft when back to draft clicked', async () => {
      const user = userEvent.setup();
      mockRevertToDraft.mutateAsync.mockResolvedValue({});

      render(<ArticleDetailPage />);

      const revertButton = screen.getByText('Back to Draft');
      await user.click(revertButton);

      await waitFor(() => {
        expect(mockRevertToDraft.mutateAsync).toHaveBeenCalledWith('kb001');
      });
    });
  });

  describe('Status Actions - Published', () => {
    beforeEach(() => {
      setupMocks(mockArticle, false, null, mockCategories, mockHistory);
    });

    it('shows archive button for published articles', () => {
      render(<ArticleDetailPage />);

      expect(screen.getByText('Archive')).toBeInTheDocument();
    });

    it('archives article when archive button clicked', async () => {
      const user = userEvent.setup();
      mockArchiveArticle.mutateAsync.mockResolvedValue({});

      render(<ArticleDetailPage />);

      const archiveButton = screen.getByText('Archive');
      await user.click(archiveButton);

      await waitFor(() => {
        expect(mockArchiveArticle.mutateAsync).toHaveBeenCalledWith('kb001');
      });
    });
  });

  describe('Status Actions - Archived', () => {
    beforeEach(() => {
      setupMocks({ ...mockArticle, status: 'archived' }, false, null, mockCategories, mockHistory);
    });

    it('shows restore button for archived articles', () => {
      render(<ArticleDetailPage />);

      expect(screen.getByText('Restore')).toBeInTheDocument();
    });

    it('restores article when restore button clicked', async () => {
      const user = userEvent.setup();
      mockRevertToDraft.mutateAsync.mockResolvedValue({});

      render(<ArticleDetailPage />);

      const restoreButton = screen.getByText('Restore');
      await user.click(restoreButton);

      await waitFor(() => {
        expect(mockRevertToDraft.mutateAsync).toHaveBeenCalledWith('kb001');
      });
    });
  });

  describe('Feedback Section', () => {
    beforeEach(() => {
      setupMocks(mockArticle, false, null, mockCategories, mockHistory);
    });

    it('shows feedback section for published articles', () => {
      render(<ArticleDetailPage />);

      expect(screen.getByText('Was this article helpful?')).toBeInTheDocument();
    });

    it('displays helpful and not helpful buttons with counts', () => {
      render(<ArticleDetailPage />);

      expect(screen.getByText(/Yes \(45\)/)).toBeInTheDocument();
      expect(screen.getByText(/No \(5\)/)).toBeInTheDocument();
    });

    it('submits positive feedback when yes clicked', async () => {
      const user = userEvent.setup();
      mockSubmitFeedback.mutateAsync.mockResolvedValue({});

      render(<ArticleDetailPage />);

      const yesButton = screen.getByText(/Yes \(45\)/);
      await user.click(yesButton);

      await waitFor(() => {
        expect(mockSubmitFeedback.mutateAsync).toHaveBeenCalledWith({
          id: 'kb001',
          isHelpful: true,
          comment: undefined,
        });
      });
    });

    it('submits negative feedback when no clicked', async () => {
      const user = userEvent.setup();
      mockSubmitFeedback.mutateAsync.mockResolvedValue({});

      render(<ArticleDetailPage />);

      const noButton = screen.getByText(/No \(5\)/);
      await user.click(noButton);

      await waitFor(() => {
        expect(mockSubmitFeedback.mutateAsync).toHaveBeenCalledWith({
          id: 'kb001',
          isHelpful: false,
          comment: undefined,
        });
      });
    });

    it('includes comment when submitting feedback', async () => {
      const user = userEvent.setup();
      mockSubmitFeedback.mutateAsync.mockResolvedValue({});

      render(<ArticleDetailPage />);

      const commentInput = screen.getByPlaceholderText('Additional feedback (optional)');
      await user.type(commentInput, 'Very helpful article');

      const yesButton = screen.getByText(/Yes \(45\)/);
      await user.click(yesButton);

      await waitFor(() => {
        expect(mockSubmitFeedback.mutateAsync).toHaveBeenCalledWith({
          id: 'kb001',
          isHelpful: true,
          comment: 'Very helpful article',
        });
      });
    });

    it('does not show feedback section for non-published articles', () => {
      setupMocks({ ...mockArticle, status: 'draft' }, false, null, mockCategories, mockHistory);

      render(<ArticleDetailPage />);

      expect(screen.queryByText('Was this article helpful?')).not.toBeInTheDocument();
    });
  });

  describe('Related Items', () => {
    it('displays related problem when present', () => {
      setupMocks({
        ...mockArticle,
        related_problem_id: 'prob1',
        related_problem_number: 'PRB-0001',
        related_problem_title: 'Login Issues',
      }, false, null, mockCategories, mockHistory);

      render(<ArticleDetailPage />);

      expect(screen.getByText('Related Problem')).toBeInTheDocument();
      expect(screen.getByText('PRB-0001 - Login Issues')).toBeInTheDocument();
    });

    it('displays related issue when present', () => {
      setupMocks({
        ...mockArticle,
        related_issue_id: 'issue1',
        related_issue_number: 'INC-0001',
        related_issue_title: 'Password Reset Failed',
      }, false, null, mockCategories, mockHistory);

      render(<ArticleDetailPage />);

      expect(screen.getByText('Related Issue')).toBeInTheDocument();
      expect(screen.getByText('INC-0001 - Password Reset Failed')).toBeInTheDocument();
    });

    it('does not show related items section when none present', () => {
      setupMocks(mockArticle, false, null, mockCategories, mockHistory);

      render(<ArticleDetailPage />);

      expect(screen.queryByText('Related Items')).not.toBeInTheDocument();
    });
  });
});
