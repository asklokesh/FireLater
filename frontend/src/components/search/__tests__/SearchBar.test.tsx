import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@/test/utils';
import { SearchBar } from '../SearchBar';

vi.mock('@/hooks/useApi', () => ({
  useSearchSuggestions: (q: string) => ({ data: q ? { suggestions: ['vpn login'] } : undefined }),
  useSearchHistory: () => ({ data: { history: [{ query: 'old search' }] } }),
}));

describe('SearchBar', () => {
  it('submits the trimmed query', () => {
    const onSubmit = vi.fn();
    render(<SearchBar value="" onSubmit={onSubmit} />);
    const input = screen.getByLabelText('Search');
    fireEvent.change(input, { target: { value: '  vpn  ' } });
    fireEvent.submit(input.closest('form') as HTMLFormElement);
    expect(onSubmit).toHaveBeenCalledWith('vpn');
  });

  it('shows recent searches on focus when empty', () => {
    render(<SearchBar value="" onSubmit={vi.fn()} />);
    fireEvent.focus(screen.getByLabelText('Search'));
    expect(screen.getByText('old search')).toBeInTheDocument();
  });

  it('shows suggestions while typing and submits the chosen one', async () => {
    const onSubmit = vi.fn();
    render(<SearchBar value="" onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'vp' } });
    fireEvent.mouseDown(await screen.findByText('vpn login'));
    expect(onSubmit).toHaveBeenCalledWith('vpn login');
  });
});
