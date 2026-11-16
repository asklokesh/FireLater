import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@/test/utils';
import userEvent from '@testing-library/user-event';
import SearchPage from '../page';
import { searchApi } from '@/lib/api';

const mockReplace = vi.fn();
const mockPush = vi.fn();
let mockQ: string | null = null;

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
  useSearchParams: () => ({ get: (key: string) => (key === 'q' ? mockQ : null) }),
}));

vi.mock('next/link', () => ({
  default: ({ children, href, className }: { children: React.ReactNode; href: string; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...actual,
    searchApi: {
      search: vi.fn(),
      fields: vi.fn(),
      suggest: vi.fn(),
      history: vi.fn(),
      clearHistory: vi.fn(),
      deleteHistoryEntry: vi.fn(),
      listTemplates: vi.fn(),
      createTemplate: vi.fn(),
      updateTemplate: vi.fn(),
      deleteTemplate: vi.fn(),
      useTemplate: vi.fn(),
      analytics: vi.fn(),
    },
  };
});

const response = {
  results: [
    {
      entityType: 'issue',
      id: 'i1',
      number: 'ISS-00001',
      title: 'VPN connection drops',
      snippet: 'Users report the VPN tunnel disconnects',
      status: 'new',
      priority: 'high',
      assignedTo: null,
      createdAt: '2026-11-01T00:00:00.000Z',
      updatedAt: '2026-11-02T00:00:00.000Z',
      rank: 0.5,
      url: '/issues/i1',
    },
    {
      entityType: 'knowledge',
      id: 'k1',
      number: 'KB-00001',
      title: 'Reset your VPN password',
      snippet: '',
      status: 'published',
      priority: null,
      assignedTo: null,
      createdAt: '2026-11-01T00:00:00.000Z',
      updatedAt: '2026-11-02T00:00:00.000Z',
      rank: 0.4,
      url: '/knowledge-base/k1',
    },
  ],
  total: 2,
  page: 1,
  perPage: 20,
  totalPages: 1,
  facets: {
    entityType: [
      { value: 'issue', count: 1 },
      { value: 'knowledge', count: 1 },
    ],
    status: [
      { value: 'new', count: 1 },
      { value: 'published', count: 1 },
    ],
    priority: [{ value: 'high', count: 1 }],
  },
  query: { text: 'vpn', entityTypes: ['issue', 'knowledge'], sort: 'relevance', warnings: [] },
  tookMs: 7,
};

const api = vi.mocked(searchApi);

describe('SearchPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQ = null;
    api.search.mockResolvedValue(response as never);
    api.fields.mockResolvedValue({
      operators: ['eq'],
      entities: [{ type: 'issue', fields: [{ name: 'status', type: 'text' }, { name: 'created', type: 'date' }] }],
    } as never);
    api.suggest.mockResolvedValue({ history: ['vpn reset'], popular: [], records: [] });
    api.history.mockResolvedValue([]);
    api.listTemplates.mockResolvedValue([]);
    api.useTemplate.mockResolvedValue({} as never);
  });

  it('shows the empty prompt and does not search without criteria', async () => {
    render(<SearchPage />);
    expect(await screen.findByText(/enter a search term/i)).toBeInTheDocument();
    expect(api.search).not.toHaveBeenCalled();
  });

  it('searches with ?q= and renders results, highlights and facets', async () => {
    mockQ = 'vpn';
    render(<SearchPage />);

    expect(await screen.findByText('VPN connection drops')).toBeInTheDocument();
    expect(api.search).toHaveBeenCalledWith(expect.objectContaining({ q: 'vpn', page: 1, perPage: 20 }));
    expect(screen.getByText('2 results')).toBeInTheDocument();

    const mark = screen.getByText('VPN', { selector: 'mark' });
    expect(mark).toBeInTheDocument();
    expect(screen.getByText('VPN connection drops').closest('a')).toHaveAttribute('href', '/issues/i1');

    expect(screen.getByRole('checkbox', { name: /issues/i })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /published/i })).toBeInTheDocument();
  });

  it('submitting the search box updates the URL and runs the query', async () => {
    const user = userEvent.setup();
    render(<SearchPage />);
    const box = screen.getByRole('combobox', { name: 'Search' });
    await user.type(box, 'printer{Enter}');
    await waitFor(() => expect(api.search).toHaveBeenCalledWith(expect.objectContaining({ q: 'printer' })));
    expect(mockReplace).toHaveBeenCalledWith('/search?q=printer');
  });

  it('toggling facets sends entity types and a status filter', async () => {
    mockQ = 'vpn';
    const user = userEvent.setup();
    render(<SearchPage />);
    await screen.findByText('VPN connection drops');

    await user.click(screen.getByRole('checkbox', { name: /issues/i }));
    await user.click(screen.getByRole('checkbox', { name: /new/i }));

    await waitFor(() =>
      expect(api.search).toHaveBeenLastCalledWith(
        expect.objectContaining({
          entityTypes: ['issue'],
          filters: { op: 'and', conditions: [{ field: 'status', operator: 'in', value: ['new'] }] },
        })
      )
    );
  });

  it('builds advanced filters from the filter builder', async () => {
    mockQ = 'vpn';
    const user = userEvent.setup();
    render(<SearchPage />);
    await screen.findByText('VPN connection drops');

    await user.click(screen.getByRole('button', { name: /filters/i }));
    await user.click(screen.getByRole('button', { name: /add condition/i }));
    const filterRow = screen.getByTestId('filter-row');
    await user.selectOptions(within(filterRow).getByLabelText('Field'), 'created');
    await user.selectOptions(within(filterRow).getByLabelText('Operator'), 'gt');
    await user.type(within(filterRow).getByLabelText('Value'), '7d');

    await waitFor(() =>
      expect(api.search).toHaveBeenLastCalledWith(
        expect.objectContaining({
          filters: {
            op: 'and',
            conditions: [{ op: 'and', conditions: [{ field: 'created', operator: 'gt', value: '7d' }] }],
          },
        })
      )
    );
    // The half-typed "7" is never sent, and typing does not fire a search per keystroke.
    const sent = JSON.stringify(api.search.mock.calls.map((c) => c[0].filters));
    expect(sent).not.toContain('"value":"7"');
    expect(api.search.mock.calls.filter((c) => c[0].filters !== null)).toHaveLength(1);
  });

  it('shows autocomplete suggestions and runs the chosen one', async () => {
    const user = userEvent.setup();
    render(<SearchPage />);
    await user.type(screen.getByRole('combobox', { name: 'Search' }), 'vp');
    const option = await screen.findByRole('option', { name: /vpn reset/i });
    expect(api.suggest).toHaveBeenCalledWith('vp');
    await user.click(option);
    await waitFor(() => expect(api.search).toHaveBeenCalledWith(expect.objectContaining({ q: 'vpn reset' })));
  });

  it('saves the current search as a template', async () => {
    mockQ = 'vpn';
    api.createTemplate.mockResolvedValue({ id: 't1' } as never);
    const user = userEvent.setup();
    render(<SearchPage />);
    await screen.findByText('VPN connection drops');

    await user.type(screen.getByLabelText('Saved search name'), 'My VPN');
    await user.click(screen.getByLabelText(/share with my team/i));
    await user.click(screen.getByRole('button', { name: /save current search/i }));

    await waitFor(() =>
      expect(api.createTemplate).toHaveBeenCalledWith({ queryText: 'vpn', filters: null, entityTypes: [], name: 'My VPN', isShared: true })
    );
  });

  it('loads a saved template into the search and records its use', async () => {
    api.listTemplates.mockResolvedValue([
      {
        id: 't9',
        name: 'Critical open',
        description: null,
        queryText: 'outage',
        filters: { op: 'and', conditions: [{ field: 'priority', operator: 'in', value: ['critical'] }] },
        entityTypes: ['issue'],
        isShared: false,
        isOwner: true,
        useCount: 0,
        lastUsedAt: null,
        createdAt: '',
        updatedAt: '',
      },
    ]);
    const user = userEvent.setup();
    render(<SearchPage />);
    await user.click(await screen.findByRole('button', { name: 'Critical open' }));

    await waitFor(() =>
      expect(api.search).toHaveBeenCalledWith(
        expect.objectContaining({
          q: 'outage',
          entityTypes: ['issue'],
          filters: { op: 'and', conditions: [{ field: 'priority', operator: 'in', value: ['critical'] }] },
        })
      )
    );
    expect(api.useTemplate).toHaveBeenCalledWith('t9');
  });

  it('shows the API error message', async () => {
    mockQ = 'x';
    api.search.mockRejectedValue({
      response: { status: 400, data: { message: 'Search took too long. Add more specific terms or filters.' } },
    });
    render(<SearchPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Search took too long');
    // 4xx responses are not retried.
    expect(api.search).toHaveBeenCalledTimes(1);
  });

  it('shows a no-matches state', async () => {
    mockQ = 'zzz';
    api.search.mockResolvedValue({ ...response, results: [], total: 0, totalPages: 0 } as never);
    render(<SearchPage />);
    expect(await screen.findByText('No matches')).toBeInTheDocument();
  });
});
