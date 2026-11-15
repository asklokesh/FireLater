import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { useState } from 'react';
import { SearchAutocomplete } from '../search-autocomplete';
import { searchApi } from '@/lib/api';

vi.mock('@/lib/api', () => ({
  searchApi: { history: vi.fn(), suggestions: vi.fn(), deleteHistory: vi.fn(), clearHistory: vi.fn() },
}));

const onSelect = vi.fn();
function Harness() {
  const [v, setV] = useState('');
  return <SearchAutocomplete value={v} onChange={setV} onSelect={onSelect} />;
}
const flush = async (ms = 0) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

describe('SearchAutocomplete', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    (searchApi.history as any).mockResolvedValue([{ id: 'h1', query: 'old one' }, { id: 'h2', query: 'old two' }]);
    (searchApi.suggestions as any).mockResolvedValue([
      { text: 'vpn history', type: 'history' },
      { text: 'vpn popular', type: 'popular' },
    ]);
    (searchApi.deleteHistory as any).mockResolvedValue({});
    (searchApi.clearHistory as any).mockResolvedValue({});
  });
  afterEach(() => vi.useRealTimers());

  it('debounces suggestions and distinguishes kinds', async () => {
    render(<Harness />);
    const input = screen.getByLabelText('Search query');
    fireEvent.focus(input);
    await flush();
    fireEvent.change(input, { target: { value: 'v' } });
    await flush(300);
    expect(searchApi.suggestions).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: 'vp' } });
    await flush(100);
    expect(searchApi.suggestions).not.toHaveBeenCalled();
    await flush(150);
    expect(searchApi.suggestions).toHaveBeenCalledTimes(1);
    const opts = screen.getAllByRole('option');
    expect(opts[0]).toHaveAttribute('data-kind', 'history');
    expect(opts[1]).toHaveAttribute('data-kind', 'popular');
  });

  it('supports keyboard navigation, Enter and Escape', async () => {
    render(<Harness />);
    const input = screen.getByLabelText('Search query');
    fireEvent.focus(input);
    await flush();
    fireEvent.change(input, { target: { value: 'vp' } });
    await flush(250);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(screen.getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith('vpn history');
    fireEvent.change(input, { target: { value: 'vpx' } });
    await flush(250);
    expect(screen.queryAllByRole('option').length).toBe(2);
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryAllByRole('option').length).toBe(0);
  });

  it('shows history when empty, removes and clears', async () => {
    render(<Harness />);
    fireEvent.focus(screen.getByLabelText('Search query'));
    await flush();
    expect(searchApi.history).toHaveBeenCalledWith(8);
    fireEvent.click(screen.getByLabelText('Remove old one from history'));
    expect(searchApi.deleteHistory).toHaveBeenCalledWith('h1');
    expect(screen.queryByText('old one')).toBeNull();
    fireEvent.click(screen.getByText('Clear history'));
    expect(searchApi.clearHistory).toHaveBeenCalled();
    await flush();
    expect(screen.queryByText('old two')).toBeNull();
  });

  it('swallows request failures', async () => {
    (searchApi.history as any).mockRejectedValue(new Error('x'));
    (searchApi.suggestions as any).mockRejectedValue(new Error('x'));
    render(<Harness />);
    const input = screen.getByLabelText('Search query');
    fireEvent.focus(input);
    await flush();
    fireEvent.change(input, { target: { value: 'vp' } });
    await flush(250);
    expect((input as HTMLInputElement).value).toBe('vp');
    expect(screen.queryAllByRole('option').length).toBe(0);
  });
});
