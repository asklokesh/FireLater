import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SearchPage from '../page';

const push = vi.fn();
let qs = 'q=disk&page=2';
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams(qs),
}));
vi.mock('next/link', () => ({ default: ({ children, href }: any) => <a href={href}>{children}</a> }));
vi.mock('@/stores/auth', () => ({ useAuthStore: () => ({ user: { id: 'me' } }) }));
vi.mock('@/lib/api', () => ({
  searchApi: {
    search: vi.fn(),
    suggestions: vi.fn().mockResolvedValue({ data: [] }),
    history: vi.fn().mockResolvedValue({ data: [] }),
    listTemplates: vi.fn().mockResolvedValue({ data: [] }),
  },
}));
import { searchApi } from '@/lib/api';
const api = searchApi as any;

beforeEach(() => {
  vi.clearAllMocks();
  qs = 'q=disk&page=2';
});

describe('SearchPage', () => {
  it('shows loading then ranked results, reading q and page from URL', async () => {
    api.search.mockResolvedValue({
      results: [{ id: '1', title: 'Disk full', rank: 0.9 }, { id: '2', title: 'Disk slow', rank: 0.5 }],
      total: 45,
      facets: { status: [{ value: 'new', count: 2 }] },
    });
    render(<SearchPage />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(await screen.findByText('Disk full')).toBeInTheDocument();
    expect(api.search).toHaveBeenCalledWith({
      q: 'disk',
      filters: { logic: 'AND', conditions: [] },
      page: 2,
      per_page: 20,
    });
    expect(screen.getByText('Page 2 of 3')).toBeInTheDocument();
  });

  it('shows empty state', async () => {
    api.search.mockResolvedValue({ results: [], total: 0, facets: {} });
    render(<SearchPage />);
    expect(await screen.findByText('No results found')).toBeInTheDocument();
  });

  it('clicking a facet pushes filter into the URL', async () => {
    api.search.mockResolvedValue({
      results: [], total: 0, facets: { status: [{ value: 'new', count: 2 }] },
    });
    render(<SearchPage />);
    fireEvent.click(await screen.findByText('new'));
    const url = push.mock.calls[0][0] as string;
    expect(url).toContain('q=disk');
    expect(decodeURIComponent(url)).toContain('"field":"status"');
  });

  it('reads filters from the URL', async () => {
    const f = { logic: 'OR', conditions: [{ field: 'status', op: 'eq', value: 'new' }] };
    qs = 'filters=' + encodeURIComponent(JSON.stringify(f));
    api.search.mockResolvedValue({ results: [], total: 0, facets: {} });
    render(<SearchPage />);
    await waitFor(() =>
      expect(api.search).toHaveBeenCalledWith({ q: '', filters: f, page: 1, per_page: 20 })
    );
  });
});
