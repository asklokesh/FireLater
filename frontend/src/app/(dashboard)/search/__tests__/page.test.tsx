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
  searchApi: { search: vi.fn() },
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
});
