import { describe, it, expect } from 'vitest';
import { formatCurrency, formatDate, formatNumber } from '../format';

describe('format helpers', () => {
  it('formats per language/region', () => {
    const d = new Date(Date.UTC(2026, 11, 25, 12));
    expect(formatDate(d, 'en-US', { dateStyle: 'short' }, 'UTC')).toBe('12/25/26');
    expect(formatDate(d, 'en-GB', { dateStyle: 'short' }, 'UTC')).toBe('25/12/2026');
    expect(formatNumber(9876.5, 'fr-FR').replace(/\s/g, ' ')).toBe('9 876,5');
    expect(formatCurrency(5, 'GBP', 'en-GB')).toBe('£5.00');
  });
  it('returns empty string for invalid dates', () => {
    expect(formatDate('nope')).toBe('');
  });
});
