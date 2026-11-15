import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SavedFiltersMenu } from '../saved-filters-menu';
import { searchApi } from '@/lib/api';

vi.mock('@/lib/api', () => ({
  searchApi: { listTemplates: vi.fn(), createTemplate: vi.fn(), deleteTemplate: vi.fn() },
}));
vi.mock('@/stores/auth', () => ({
  useAuthStore: (sel: (s: any) => unknown) => sel({ user: { id: 'u1' } }),
}));

const filter = { op: 'and' as const, conditions: [{ field: 'status', operator: 'in', value: ['new'] }] };
const templates = [
  { id: 't1', name: 'Mine', q: 'vpn', filter, sort: 'created_at', order: 'desc', owner_id: 'u1', shared: false },
  { id: 't2', name: 'Theirs', q: 'disk', owner_id: 'u2', owner_name: 'Alice', shared: true },
];

describe('SavedFiltersMenu', () => {
  const onApply = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();
    (searchApi.listTemplates as any).mockResolvedValue(templates);
  });

  it('applies a template and labels shared owner', async () => {
    render(<SavedFiltersMenu q="" onApply={onApply} />);
    fireEvent.click(screen.getByText('Saved filters'));
    expect(await screen.findByText(/shared by Alice/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Mine'));
    expect(onApply).toHaveBeenCalledWith({ q: 'vpn', filter, sort: 'created_at', order: 'desc' });
  });

  it('shows delete only for owned templates', async () => {
    (searchApi.deleteTemplate as any).mockResolvedValue({});
    render(<SavedFiltersMenu q="" onApply={onApply} />);
    fireEvent.click(screen.getByText('Saved filters'));
    await screen.findByText('Mine');
    expect(screen.queryByLabelText('Delete Theirs')).toBeNull();
    fireEvent.click(screen.getByLabelText('Delete Mine'));
    expect(searchApi.deleteTemplate).toHaveBeenCalledWith('t1');
    await waitFor(() => expect(screen.queryByText('Mine')).toBeNull());
  });

  it('saves the current search', async () => {
    (searchApi.createTemplate as any).mockResolvedValue({});
    render(<SavedFiltersMenu q="net" filter={filter} onApply={onApply} />);
    fireEvent.click(screen.getByText('Saved filters'));
    fireEvent.click(await screen.findByText('Save current search'));
    fireEvent.change(screen.getByLabelText('Template name'), { target: { value: 'Net' } });
    fireEvent.click(screen.getByLabelText('Shared'));
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() =>
      expect(searchApi.createTemplate).toHaveBeenCalledWith({ name: 'Net', shared: true, q: 'net', filter })
    );
    await waitFor(() => expect(screen.queryByLabelText('Template name')).toBeNull());
  });

  it('keeps the form open on 409', async () => {
    (searchApi.createTemplate as any).mockRejectedValue({ response: { status: 409 } });
    render(<SavedFiltersMenu q="net" onApply={onApply} />);
    fireEvent.click(screen.getByText('Saved filters'));
    fireEvent.click(await screen.findByText('Save current search'));
    fireEvent.change(screen.getByLabelText('Template name'), { target: { value: 'Mine' } });
    fireEvent.click(screen.getByText('Save'));
    expect(await screen.findByRole('alert')).toHaveTextContent(/already exists/);
    expect(screen.getByLabelText('Template name')).toBeInTheDocument();
  });
});
