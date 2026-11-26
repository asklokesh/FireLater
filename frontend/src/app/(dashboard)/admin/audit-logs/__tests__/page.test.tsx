import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AuditLogsPage from '../page';

const mockGet = vi.hoisted(() => vi.fn());
const mockPost = vi.hoisted(() => vi.fn());
const mockPatch = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api', () => ({
  api: { get: mockGet, post: mockPost, patch: mockPatch },
}));

const entry = {
  id: 'log-1',
  user_id: 'u1',
  user_email: 'admin@acme.test',
  action: 'update',
  entity_type: 'issue',
  entity_id: 'i1',
  entity_name: 'Printer on fire',
  outcome: 'success',
  ip_address: '10.0.0.1',
  changed_fields: ['priority'],
  old_values: { priority: 'low' },
  new_values: { priority: 'high' },
  record_hash: 'a'.repeat(64),
  created_at: '2026-01-02T03:04:05.000Z',
};

describe('AuditLogsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockImplementation((url: string) => {
      if (url === '/v1/audit/search') return Promise.resolve({ data: { logs: [entry], total: 1 } });
      if (url === '/v1/audit/alerts')
        return Promise.resolve({
          data: {
            alerts: [
              {
                id: 'al-1',
                rule_name: 'Repeated failed logins',
                severity: 'high',
                group_key: 'viewer@acme.test',
                event_count: 6,
                status: 'open',
                created_at: '2026-01-02T03:04:05.000Z',
              },
            ],
            total: 1,
          },
        });
      if (url === '/v1/audit/alert-rules')
        return Promise.resolve({
          data: {
            rules: [
              { id: 'r1', name: 'Mass deletion', description: null, threshold: 10, window_minutes: 10, group_by: 'user', severity: 'high', enabled: true },
            ],
          },
        });
      if (url === '/v1/audit/retention/stats')
        return Promise.resolve({
          data: {
            settings: { retention_days: 365, archive_after_days: null, log_reads: false, log_exports: true, alerts_enabled: true },
            storage: { liveCount: 12, archivedCount: 3, legalHoldCount: 1 },
          },
        });
      if (url === '/v1/audit/verify') return Promise.resolve({ data: { valid: true, checkedCount: 12 } });
      return Promise.resolve({ data: {} });
    });
    mockPost.mockResolvedValue({ data: {} });
    mockPatch.mockResolvedValue({ data: {} });
  });

  it('searches the audit trail through the search endpoint with the typed query', async () => {
    render(<AuditLogsPage />);
    await waitFor(() => expect(screen.getByText('admin@acme.test')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Search audit logs'), { target: { value: 'printer' } });
    await waitFor(() =>
      expect(mockGet).toHaveBeenCalledWith(
        '/v1/audit/search',
        expect.objectContaining({ params: expect.objectContaining({ q: 'printer', limit: 50, offset: 0 }) })
      )
    );
  });

  it('shows field-level old and new values when a row is expanded', async () => {
    render(<AuditLogsPage />);
    const row = await screen.findByText('Printer on fire', { exact: false });
    fireEvent.click(row);
    expect(await screen.findByText('priority')).toBeInTheDocument();
    expect(screen.getByText('"low"')).toBeInTheDocument();
    expect(screen.getByText('"high"')).toBeInTheDocument();
  });

  it('exports the filtered trail as CSV', async () => {
    window.URL.createObjectURL = vi.fn().mockReturnValue('blob:x');
    window.URL.revokeObjectURL = vi.fn();
    mockGet.mockImplementationOnce(() => Promise.resolve({ data: { logs: [], total: 0 } }));
    render(<AuditLogsPage />);
    await screen.findByText('Export CSV');
    mockGet.mockResolvedValueOnce({ data: new Blob(['a,b']) });
    fireEvent.click(screen.getByText('Export CSV'));
    await waitFor(() =>
      expect(mockGet).toHaveBeenCalledWith(
        '/v1/audit/export',
        expect.objectContaining({ responseType: 'blob', params: expect.objectContaining({ format: 'csv' }) })
      )
    );
  });

  it('lists alerts and acknowledges one', async () => {
    render(<AuditLogsPage />);
    fireEvent.click(screen.getByText('Alerts'));
    expect(await screen.findByText('Repeated failed logins', { exact: false })).toBeInTheDocument();
    expect(await screen.findByText('Mass deletion')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Acknowledge'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('/v1/audit/alerts/al-1/acknowledge'));
  });

  it('saves a retention policy and runs retention', async () => {
    render(<AuditLogsPage />);
    fireEvent.click(screen.getByText('Retention'));
    expect(await screen.findByText('Archived records')).toBeInTheDocument();

    fireEvent.change(screen.getByDisplayValue('365'), { target: { value: '730' } });
    fireEvent.click(screen.getByText('Save policy'));
    await waitFor(() =>
      expect(mockPatch).toHaveBeenCalledWith('/v1/audit/settings', {
        retention_days: 730,
        archive_after_days: null,
      })
    );

    mockPost.mockResolvedValueOnce({ data: { result: { archived: 2, purgedLive: 0, purgedArchive: 1 } } });
    fireEvent.click(screen.getByText('Run retention now'));
    expect(await screen.findByText('Archived 2, purged 1 records')).toBeInTheDocument();
  });

  it('verifies the chain', async () => {
    render(<AuditLogsPage />);
    fireEvent.click(screen.getByText('Chain Verification'));
    fireEvent.click(screen.getByText('Verify Integrity'));
    expect(await screen.findByText('12 records verified.')).toBeInTheDocument();
  });
});
