import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FilterBuilder } from '../FilterBuilder';

describe('FilterBuilder', () => {
  it('adds a condition', async () => {
    const onChange = vi.fn();
    render(<FilterBuilder onChange={onChange} />);
    await userEvent.type(screen.getByLabelText('Value'), 'new');
    await userEvent.click(screen.getByText('Add condition'));
    expect(onChange).toHaveBeenCalledWith({
      op: 'and',
      conditions: [{ field: 'status', operator: 'eq', value: 'new' }],
    });
  });
  it('switches op and removes', async () => {
    const onChange = vi.fn();
    const value = { op: 'and' as const, conditions: [{ field: 'status', operator: 'eq' as const, value: 'new' }] };
    render(<FilterBuilder value={value} onChange={onChange} />);
    await userEvent.selectOptions(screen.getByLabelText('Group operator'), 'or');
    expect(onChange).toHaveBeenCalledWith({ ...value, op: 'or' });
    await userEvent.click(screen.getByLabelText('Remove condition 1'));
    expect(onChange).toHaveBeenCalledWith(undefined);
  });
});
