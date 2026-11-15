import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SearchPage from '../page';
import { searchApi } from '@/lib/api';

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(''),
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/lib/api', () => ({
  searchApi: {
    search: vi.fn(),
    suggest: vi.fn(),
    listTemplates: vi.fn(),
    createTemplate: vi.fn(),
    updateTemplate: vi.fn(),
    deleteTemplate: vi.fn(),
    getHistory: vi.fn(),
    clearHistory: vi.fn(),
  },
}));

const mocked = searchApi as unknown as Record<string, ReturnType<typeof vi.fn>>;

const searchResponse = {
  data: [{ id: 'i1', issue_number: 'ISS-1', title: 'VPN down', status: 'new', priority: 'high', rank: 0.5 }],
  pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
  facets: {
    status: [{ value: 'new', count: 3 }, { value: 'closed', count: 1 }],
    priority: [{ value: 'high', count: 2 }],
    severity: [],
    assigned_group: [],
    application_id: [],
  },
};

const lastFilters = () => {
  const calls = mocked.search.mock.calls;
  return calls[calls.length - 1][0].filters;
};

describe('SearchPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocked.search.mockResolvedValue(searchResponse);
    mocked.suggest.mockResolvedValue({ data: [{ id: 'i1', issue_number: 'ISS-1', title: 'VPN down' }] });
    mocked.listTemplates.mockResolvedValue({ data: [] });
    mocked.getHistory.mockResolvedValue({ data: [{ query: 'old search' }] });
    mocked.createTemplate.mockResolvedValue({});
    mocked.deleteTemplate.mockResolvedValue(undefined);
  });

  it('renders ranked results and shows autocomplete suggestions', async () => {
    render(<SearchPage />);
    expect(await screen.findByText(/ISS-1 VPN down/)).toBeInTheDocument();
    const box = screen.getByLabelText('Search issues');
    fireEvent.focus(box);
    fireEvent.change(box, { target: { value: 'vp' } });
    await waitFor(() => expect(mocked.suggest).toHaveBeenCalledWith('vp'), { timeout: 2000 });
    expect(await screen.findByRole('option', { name: /ISS-1 VPN down/ })).toBeInTheDocument();
  });

  it('shows recent searches when empty and focused', async () => {
    render(<SearchPage />);
    await waitFor(() => expect(mocked.getHistory).toHaveBeenCalled());
    fireEvent.focus(screen.getByLabelText('Search issues'));
    expect(await screen.findByText('old search')).toBeInTheDocument();
  });

  it('selects facets across dimensions and clears them individually', async () => {
    render(<SearchPage />);
    await screen.findByText('Status');
    fireEvent.click(await screen.findByLabelText('new'));
    fireEvent.click(await screen.findByLabelText('high'));
    await waitFor(() =>
      expect(lastFilters()).toEqual({
        op: 'and',
        conditions: [
          { field: 'status', op: 'in', value: ['new'] },
          { field: 'priority', op: 'in', value: ['high'] },
        ],
      })
    );
    fireEvent.click(screen.getByLabelText('Clear Status: new'));
    await waitFor(() =>
      expect(lastFilters()).toEqual({
        op: 'and',
        conditions: [{ field: 'priority', op: 'in', value: ['high'] }],
      })
    );
  });

  it('serializes the filter builder and shows server validation errors', async () => {
    render(<SearchPage />);
    await screen.findByText(/ISS-1 VPN down/);
    fireEvent.change(screen.getByLabelText('Group operator'), { target: { value: 'or' } });
    fireEvent.click(screen.getByText('Add condition'));
    fireEvent.change(screen.getByLabelText('Field 1'), { target: { value: 'priority' } });
    fireEvent.change(screen.getByLabelText('Operator 1'), { target: { value: 'in' } });
    fireEvent.change(screen.getByLabelText('Value 1'), { target: { value: 'high, low' } });
    mocked.search.mockRejectedValueOnce({ response: { data: { message: 'Unknown filter field: x' } } });
    fireEvent.click(screen.getByText('Apply filters'));
    await waitFor(() =>
      expect(lastFilters()).toEqual({
        op: 'and',
        conditions: [{ op: 'or', conditions: [{ field: 'priority', op: 'in', value: ['high', 'low'] }] }],
      })
    );
    expect(await screen.findByText('Unknown filter field: x')).toBeInTheDocument();
  });

  it('saves, loads and deletes templates', async () => {
    const tpl = {
      id: 't1',
      name: 'My tpl',
      query: 'net',
      filters: { op: 'and', conditions: [{ field: 'status', op: 'eq', value: 'new' }] },
    };
    mocked.listTemplates.mockResolvedValue({ data: [tpl] });
    render(<SearchPage />);
    await screen.findByText(/ISS-1 VPN down/);

    fireEvent.change(screen.getByLabelText('Search issues'), { target: { value: 'abc' } });
    fireEvent.change(screen.getByLabelText('Template name'), { target: { value: 'Saved' } });
    fireEvent.click(screen.getByText('Save template'));
    await waitFor(() =>
      expect(mocked.createTemplate).toHaveBeenCalledWith({ name: 'Saved', query: 'abc', filters: null })
    );

    fireEvent.click(await screen.findByText('My tpl'));
    await waitFor(() => expect(lastFilters()).toEqual({ op: 'and', conditions: [tpl.filters] }));
    expect((screen.getByLabelText('Search issues') as HTMLInputElement).value).toBe('net');

    fireEvent.click(screen.getByLabelText('Delete template My tpl'));
    await waitFor(() => expect(mocked.deleteTemplate).toHaveBeenCalledWith('t1'));
  });
});
