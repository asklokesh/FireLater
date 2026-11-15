import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FilterBuilder, FILTER_FIELDS } from '../filter-builder';

describe('FilterBuilder', () => {
  it('adds a condition and applies it', () => {
    const onApply = vi.fn();
    render(<FilterBuilder onApply={onApply} />);
    fireEvent.click(screen.getByText('Add condition'));
    fireEvent.change(screen.getByLabelText('Value'), { target: { value: 'new' } });
    fireEvent.click(screen.getByText('Apply filters'));
    expect(onApply).toHaveBeenCalledWith({
      op: 'and',
      conditions: [{ field: FILTER_FIELDS[0], operator: 'eq', value: 'new' }],
    });
  });

  it('removes a condition', () => {
    const onApply = vi.fn();
    render(<FilterBuilder onApply={onApply} />);
    fireEvent.click(screen.getByText('Add condition'));
    fireEvent.click(screen.getByLabelText('Remove condition'));
    expect(screen.queryByTestId('filter-condition')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Apply filters'));
    expect(onApply).toHaveBeenCalledWith(undefined);
  });

  it('switches to OR and adds a nested group', () => {
    const onApply = vi.fn();
    render(<FilterBuilder onApply={onApply} />);
    fireEvent.change(screen.getByLabelText('Group operator'), { target: { value: 'or' } });
    fireEvent.click(screen.getByText('Add group'));
    expect(screen.getAllByTestId('filter-group')).toHaveLength(2);
    fireEvent.click(screen.getByText('Apply filters'));
    const arg = onApply.mock.calls[0][0];
    expect(arg.op).toBe('or');
    expect(arg.conditions[0].op).toBe('and');
    expect(arg.conditions[0].conditions).toHaveLength(1);
  });

  it('limits fields to the whitelist and parses in values', () => {
    const onApply = vi.fn();
    render(<FilterBuilder onApply={onApply} />);
    fireEvent.click(screen.getByText('Add condition'));
    const opts = Array.from((screen.getByLabelText('Field') as HTMLSelectElement).options).map((o) => o.value);
    expect(opts).toEqual(FILTER_FIELDS);
    fireEvent.change(screen.getByLabelText('Operator'), { target: { value: 'in' } });
    fireEvent.change(screen.getByLabelText('Value'), { target: { value: 'a, b' } });
    fireEvent.click(screen.getByText('Apply filters'));
    expect(onApply.mock.calls[0][0].conditions[0].value).toEqual(['a', 'b']);
  });
});
