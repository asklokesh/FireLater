import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SearchBar } from '../SearchBar';
import { searchApi } from '@/lib/api';

vi.mock('@/lib/api', () => ({
  searchApi: { suggest: vi.fn(), history: vi.fn() },
}));

describe('SearchBar', () => {
  beforeEach(() => {
    vi.mocked(searchApi.suggest).mockResolvedValue({ data: ['printer jam'] });
    vi.mocked(searchApi.history).mockResolvedValue({
      data: [{ id: '1', query: 'old query', resultCount: 1, createdAt: '' }],
    });
  });

  it('shows recent searches on empty focus', async () => {
    render(<SearchBar value="" onSubmit={vi.fn()} />);
    await userEvent.click(screen.getByRole('searchbox'));
    expect(await screen.findByText('old query')).toBeInTheDocument();
  });

  it('shows suggestions and submits on Enter', async () => {
    const onSubmit = vi.fn();
    render(<SearchBar value="" onSubmit={onSubmit} debounceMs={10} />);
    await userEvent.type(screen.getByRole('searchbox'), 'pri');
    await waitFor(() => expect(searchApi.suggest).toHaveBeenCalledWith('pri'));
    expect(await screen.findByText('printer jam')).toBeInTheDocument();
    await userEvent.type(screen.getByRole('searchbox'), '{Enter}');
    expect(onSubmit).toHaveBeenCalledWith('pri');
  });
});
