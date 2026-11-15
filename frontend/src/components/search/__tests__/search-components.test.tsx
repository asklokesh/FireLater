import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { SearchBox } from '../search-box';
import { FilterBuilder } from '../filter-builder';
import { FacetPanel, toggleFacetFilter } from '../facet-panel';
import { SavedFiltersMenu } from '../saved-filters-menu';

vi.mock('@/lib/api', () => ({
  searchApi: {
    suggestions: vi.fn(),
    history: vi.fn(),
    listTemplates: vi.fn(),
    createTemplate: vi.fn(),
    deleteTemplate: vi.fn(),
  },
}));
vi.mock('@/stores/auth', () => ({ useAuthStore: () => ({ user: { id: 'me' } }) }));

import { searchApi } from '@/lib/api';
const api = searchApi as any;

beforeEach(() => {
  vi.clearAllMocks();
  api.suggestions.mockResolvedValue({ data: ['disk full', 'disk slow'] });
  api.history.mockResolvedValue({ data: ['recent one'] });
  api.listTemplates.mockResolvedValue({ data: [] });
});

describe('SearchBox', () => {
  it('shows recent searches on focus', async () => {
    render(<SearchBox value="" onSubmit={vi.fn()} debounceMs={0} />);
    fireEvent.focus(screen.getByRole('combobox'));
    expect(await screen.findByText('recent one')).toBeInTheDocument();
  });

  it('debounces suggestions, supports arrows + Enter', async () => {
    const onSubmit = vi.fn();
    render(<SearchBox value="" onSubmit={onSubmit} debounceMs={20} />);
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'd' } });
    fireEvent.change(input, { target: { value: 'di' } });
    await screen.findByText('disk full');
    expect(api.suggestions).toHaveBeenCalledTimes(1);
    expect(api.suggestions).toHaveBeenCalledWith('di');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSubmit).toHaveBeenCalledWith('disk slow');
  });

  it('Enter submits typed text and Escape closes', async () => {
    const onSubmit = vi.fn();
    render(<SearchBox value="" onSubmit={onSubmit} debounceMs={0} />);
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'di' } });
    await screen.findByText('disk full');
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByText('disk full')).not.toBeInTheDocument();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSubmit).toHaveBeenCalledWith('di');
  });
});

describe('FilterBuilder', () => {
  it('adds, removes, groups and toggles logic', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <FilterBuilder value={{ logic: 'AND', conditions: [] }} onChange={onChange} />
    );
    fireEvent.click(screen.getByText('AND'));
    expect(onChange).toHaveBeenLastCalledWith({ logic: 'OR', conditions: [] });
    fireEvent.click(screen.getByText('Add condition'));
    expect(onChange).toHaveBeenLastCalledWith({
      logic: 'AND',
      conditions: [{ field: 'status', op: 'eq', value: '' }],
    });
    fireEvent.click(screen.getByText('Add group'));
    expect(onChange.mock.calls.at(-1)![0].conditions[0].logic).toBe('OR');
    rerender(
      <FilterBuilder
        value={{ logic: 'AND', conditions: [{ field: 'status', op: 'eq', value: 'new' }] }}
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByLabelText('Remove condition'));
    expect(onChange).toHaveBeenLastCalledWith({ logic: 'AND', conditions: [] });
  });
});

describe('FacetPanel', () => {
  const facets = {
    status: [{ value: 'new', count: 3 }],
    priority: [{ value: 'high', count: 2 }],
  };
  it('renders several dimensions and toggles a value', () => {
    const onChange = vi.fn();
    render(<FacetPanel facets={facets} filters={{ logic: 'AND', conditions: [] }} onChange={onChange} />);
    expect(screen.getByText('status')).toBeInTheDocument();
    expect(screen.getByText('priority')).toBeInTheDocument();
    fireEvent.click(screen.getByText('high'));
    expect(onChange).toHaveBeenCalledWith({
      logic: 'AND',
      conditions: [{ field: 'priority', op: 'eq', value: 'high' }],
    });
  });
  it('removes on second click', () => {
    const f = { logic: 'AND' as const, conditions: [{ field: 'priority', op: 'eq', value: 'high' }] };
    expect(toggleFacetFilter(f, 'priority', 'high')).toEqual({ logic: 'AND', conditions: [] });
  });
});

describe('SavedFiltersMenu', () => {
  it('saves, loads, deletes own and marks shared read-only', async () => {
    api.listTemplates.mockResolvedValue({
      data: [
        { id: 'a', owner_id: 'me', name: 'Mine', query: 'disk', filter: null, is_shared: false },
        { id: 'b', owner_id: 'other', name: 'Theirs', query: null, filter: null, is_shared: true },
      ],
    });
    api.createTemplate.mockResolvedValue({});
    api.deleteTemplate.mockResolvedValue(undefined);
    const onLoad = vi.fn();
    render(<SavedFiltersMenu query="x" filters={{ logic: 'AND', conditions: [] }} onLoad={onLoad} />);
    await screen.findByText('Mine');
    expect(screen.queryByLabelText('Delete Theirs')).not.toBeInTheDocument();
    expect(screen.getByText('Shared (read-only)')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Mine'));
    expect(onLoad).toHaveBeenCalledWith('disk', { logic: 'AND', conditions: [] });
    fireEvent.click(screen.getByLabelText('Delete Mine'));
    await waitFor(() => expect(api.deleteTemplate).toHaveBeenCalledWith('a'));
    fireEvent.change(screen.getByLabelText('Filter name'), { target: { value: 'N' } });
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() =>
      expect(api.createTemplate).toHaveBeenCalledWith({ name: 'N', entity: 'issues', query: 'x', filter: null })
    );
  });
});
