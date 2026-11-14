import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SearchPage from '../page';
import { searchApi } from '@/lib/api';

vi.mock('@/lib/api', () => ({
  searchApi: {
    search: vi.fn(),
    suggest: vi.fn().mockResolvedValue({ data: [] }),
    history: vi.fn().mockResolvedValue({ data: [] }),
    listTemplates: vi.fn().mockResolvedValue({ data: [] }),
    createTemplate: vi.fn(),
    deleteTemplate: vi.fn(),
  },
}));

const pagination = { page: 1, perPage: 20, total: 1, totalPages: 1 };

describe('SearchPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders results and re-runs on facet selection', async () => {
    vi.mocked(searchApi.search).mockResolvedValue({
      data: [{ id: '1', issue_number: 'ISS-1', title: 'Broken', status: 'new', priority: 'high', rank: 1 }],
      pagination,
      facets: { status: [{ value: 'new', count: 1 }] },
    });
    render(<SearchPage />);
    expect(await screen.findByText('ISS-1')).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText(/new/));
    await waitFor(() =>
      expect(searchApi.search).toHaveBeenLastCalledWith(
        expect.objectContaining({
          filter: { op: 'and', conditions: [{ field: 'status', operator: 'in', value: ['new'] }] },
        })
      )
    );
  });

  it('renders empty state', async () => {
    vi.mocked(searchApi.search).mockResolvedValue({ data: [], pagination });
    render(<SearchPage />);
    expect(await screen.findByText('No results found')).toBeInTheDocument();
  });

  it('renders error state', async () => {
    vi.mocked(searchApi.search).mockRejectedValue(new Error('x'));
    render(<SearchPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Search failed');
  });
});
