import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SearchPage from '../page';
import { searchApi } from '@/lib/api';

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

const mockPush = vi.fn();
let mockParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => mockParams,
}));

vi.mock('@/lib/api', () => ({
  searchApi: {
    search: vi.fn(),
    history: vi.fn(),
    suggestions: vi.fn(),
    listTemplates: vi.fn(),
    deleteHistory: vi.fn(),
    clearHistory: vi.fn(),
    createTemplate: vi.fn(),
    deleteTemplate: vi.fn(),
  },
}));

vi.mock('@/stores/auth', () => ({
  useAuthStore: (sel: (s: any) => unknown) => sel({ user: { id: 'u1' } }),
}));

const response = {
  data: [
    { id: '1', issue_number: 'ISS-1', title: 'First', status: 'new', priority: 'high', application_name: 'App A', rank: 1 },
    { id: '2', issue_number: 'ISS-2', title: 'Second', status: 'closed', priority: 'low', application_name: 'App B', rank: 0.5 },
  ],
  pagination: { page: 1, perPage: 20, total: 42, totalPages: 3 },
  facets: {
    status: [{ value: 'new', label: 'New', count: 1 }],
    priority: [],
    severity: [],
    application_id: [],
    assigned_to: [],
  },
  tookMs: 7,
};

describe('SearchPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockParams = new URLSearchParams();
    (searchApi.search as any).mockResolvedValue(response);
    (searchApi.history as any).mockResolvedValue([]);
    (searchApi.suggestions as any).mockResolvedValue([]);
    (searchApi.listTemplates as any).mockResolvedValue([]);
  });

  it('initializes state from the URL', async () => {
    const filter = { op: 'and', conditions: [{ field: 'status', operator: 'in', value: ['new'] }] };
    mockParams = new URLSearchParams({ q: 'vpn', filter: JSON.stringify(filter), page: '2' });
    render(<SearchPage />);
    await waitFor(() =>
      expect(searchApi.search).toHaveBeenCalledWith({ q: 'vpn', filter, page: 2 })
    );
    expect((screen.getByLabelText('Search query') as HTMLInputElement).value).toBe('vpn');
  });

  it('submits q to the URL', () => {
    render(<SearchPage />);
    fireEvent.change(screen.getByLabelText('Search query'), { target: { value: 'disk' } });
    fireEvent.submit(screen.getByLabelText('Search query').closest('form')!);
    expect(mockPush).toHaveBeenCalledWith('/search?q=disk');
  });

  it('renders results in order with total and tookMs', async () => {
    mockParams = new URLSearchParams({ q: 'x' });
    render(<SearchPage />);
    expect(await screen.findByText('ISS-1')).toHaveAttribute('href', '/issues/1');
    const text = document.body.textContent ?? '';
    expect(text.indexOf('First')).toBeLessThan(text.indexOf('Second'));
    expect(screen.getByText(/42 results in 7 ms/)).toBeInTheDocument();
    expect(screen.getByText('App A')).toBeInTheDocument();
  });

  it('moves between pages', async () => {
    mockParams = new URLSearchParams({ q: 'x' });
    render(<SearchPage />);
    fireEvent.click(await screen.findByText('Next'));
    expect(mockPush).toHaveBeenCalledWith('/search?q=x&page=2');
  });

  it('shows empty state', async () => {
    (searchApi.search as any).mockResolvedValue({ ...response, data: [] });
    mockParams = new URLSearchParams({ q: 'x' });
    render(<SearchPage />);
    expect(await screen.findByText('No results found')).toBeInTheDocument();
  });

  it('shows error', async () => {
    (searchApi.search as any).mockRejectedValue(new Error('boom'));
    mockParams = new URLSearchParams({ q: 'x' });
    render(<SearchPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('boom');
  });

  it('applies a saved template', async () => {
    const filter = { op: 'and', conditions: [{ field: 'status', operator: 'in', value: ['new'] }] };
    (searchApi.listTemplates as any).mockResolvedValue([
      { id: 't1', name: 'Mine', q: 'vpn', filter, sort: 'created_at', order: 'asc', owner_id: 'u1' },
    ]);
    render(<SearchPage />);
    fireEvent.click(screen.getByText('Saved filters'));
    fireEvent.click(await screen.findByText('Mine'));
    expect(mockPush).toHaveBeenCalledWith(
      `/search?q=vpn&filter=${encodeURIComponent(JSON.stringify(filter))}&sort=created_at&order=asc`
    );
  });

  it('runs the search when a suggestion is chosen', async () => {
    (searchApi.suggestions as any).mockResolvedValue([{ text: 'vpn down', type: 'popular' }]);
    render(<SearchPage />);
    const input = screen.getByLabelText('Search query');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'vp' } });
    fireEvent.click(await screen.findByText('vpn down', {}, { timeout: 2000 }));
    expect(mockPush).toHaveBeenCalledWith('/search?q=vpn+down');
  });
});
