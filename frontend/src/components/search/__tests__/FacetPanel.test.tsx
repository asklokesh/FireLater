import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FacetPanel } from '../FacetPanel';

const facets = { status: [{ value: 'new', count: 3 }], priority: [{ value: 'high', count: 2 }] };

describe('FacetPanel', () => {
  it('renders groups with counts and toggles values', async () => {
    const onChange = vi.fn();
    render(<FacetPanel facets={facets} selected={{ priority: ['high'] }} onChange={onChange} />);
    expect(screen.getByText('3')).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText(/new/));
    expect(onChange).toHaveBeenCalledWith({ priority: ['high'], status: ['new'] });
    await userEvent.click(screen.getByLabelText(/high/));
    expect(onChange).toHaveBeenCalledWith({});
  });
});
