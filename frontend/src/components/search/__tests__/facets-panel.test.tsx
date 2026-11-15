import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FacetsPanel } from '../facets-panel';

const facets = {
  status: [{ value: 'new', label: 'New', count: 3 }],
  priority: [{ value: 'high', label: 'High', count: 2 }],
  severity: [],
  application_id: [],
  assigned_to: [],
};

describe('FacetsPanel', () => {
  it('renders labels and counts', () => {
    render(<FacetsPanel facets={facets} onChange={vi.fn()} />);
    expect(screen.getByText('New')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('adds an in condition on click', () => {
    const onChange = vi.fn();
    render(<FacetsPanel facets={facets} onChange={onChange} />);
    fireEvent.click(screen.getByText('New'));
    expect(onChange).toHaveBeenCalledWith({
      op: 'and',
      conditions: [{ field: 'status', operator: 'in', value: ['new'] }],
    });
  });

  it('marks selected and removes on second click, combining facets with AND', () => {
    const onChange = vi.fn();
    const filter = { op: 'and' as const, conditions: [{ field: 'status', operator: 'in', value: ['new'] }] };
    render(<FacetsPanel facets={facets} filter={filter} onChange={onChange} />);
    expect(screen.getByText('New').closest('button')).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByText('High'));
    expect(onChange).toHaveBeenLastCalledWith({
      op: 'and',
      conditions: [
        { field: 'status', operator: 'in', value: ['new'] },
        { field: 'priority', operator: 'in', value: ['high'] },
      ],
    });
    fireEvent.click(screen.getByText('New'));
    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });
});
