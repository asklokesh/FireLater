import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { render, screen } from '@/test/utils';

const nav = vi.hoisted(() => ({ pathname: '/issues' }));
const report = vi.hoisted(() => ({ fn: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => nav.pathname,
}));
vi.mock('@/components/layout/sidebar', () => ({ Sidebar: () => <nav>sidebar</nav> }));
vi.mock('@/components/layout/header', () => ({ Header: () => <header>header</header> }));
vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({ isAuthenticated: true, isLoading: false, checkAuth: vi.fn(), _hasHydrated: true }),
}));
vi.mock('@/lib/api', () => ({ reportClientError: report.fn }));

import DashboardLayout from '../layout';

function Broken(): never {
  throw new Error('page exploded');
}

describe('DashboardLayout error boundary', () => {
  const original = console.error;
  beforeAll(() => { console.error = vi.fn(); });
  afterAll(() => { console.error = original; });

  it('shows a friendly error, reports it, and clears it after navigating to another page', () => {
    nav.pathname = '/issues';
    const { rerender } = render(<DashboardLayout><Broken /></DashboardLayout>);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('sidebar')).toBeInTheDocument();
    expect(report.fn).toHaveBeenCalledTimes(1);
    expect(report.fn.mock.calls[0][0]).toBeInstanceOf(Error);

    nav.pathname = '/problems';
    rerender(<DashboardLayout><div>problems page</div></DashboardLayout>);
    expect(screen.getByText('problems page')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
