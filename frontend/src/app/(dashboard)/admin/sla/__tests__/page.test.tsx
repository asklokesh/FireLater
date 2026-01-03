import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SLAManagementPage from '../page';

// Mock the hooks
vi.mock('@/hooks/useApi', () => ({
  useSlaPolicies: vi.fn(),
  useCreateSlaPolicy: vi.fn(),
  useUpdateSlaPolicy: vi.fn(),
  useDeleteSlaPolicy: vi.fn(),
  useCreateSlaTarget: vi.fn(),
  useUpdateSlaTarget: vi.fn(),
  useDeleteSlaTarget: vi.fn(),
  useSlaStats: vi.fn(),
}));

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  Plus: ({ className }: { className?: string }) => <div className={className} data-testid="plus-icon" />,
  Clock: ({ className }: { className?: string }) => <div className={className} data-testid="clock-icon" />,
  AlertTriangle: ({ className }: { className?: string }) => <div className={className} data-testid="alert-triangle-icon" />,
  CheckCircle: ({ className }: { className?: string }) => <div className={className} data-testid="check-circle-icon" />,
  XCircle: ({ className }: { className?: string }) => <div className={className} data-testid="x-circle-icon" />,
  Edit2: ({ className }: { className?: string }) => <div className={className} data-testid="edit2-icon" />,
  Trash2: ({ className }: { className?: string }) => <div className={className} data-testid="trash2-icon" />,
  ChevronDown: ({ className }: { className?: string }) => <div className={className} data-testid="chevron-down-icon" />,
  ChevronUp: ({ className }: { className?: string }) => <div className={className} data-testid="chevron-up-icon" />,
  Loader2: ({ className }: { className?: string }) => <div className={className} data-testid="loader-icon" />,
  BarChart3: ({ className }: { className?: string }) => <div className={className} data-testid="bar-chart-icon" />,
  Target: ({ className }: { className?: string }) => <div className={className} data-testid="target-icon" />,
  AlertCircle: ({ className }: { className?: string }) => <div className={className} data-testid="alert-circle-icon" />,
  FileText: ({ className }: { className?: string }) => <div className={className} data-testid="file-text-icon" />,
}));

import {
  useSlaPolicies,
  useCreateSlaPolicy,
  useUpdateSlaPolicy,
  useDeleteSlaPolicy,
  useCreateSlaTarget,
  useUpdateSlaTarget,
  useDeleteSlaTarget,
  useSlaStats,
} from '@/hooks/useApi';

describe('SLAManagementPage', () => {
  const mockPolicies = [
    {
      id: 'policy-1',
      name: 'Critical Issues SLA',
      description: 'SLA for critical priority issues',
      entity_type: 'issue' as const,
      is_active: true,
      is_default: true,
      targets: [
        {
          id: 'target-1',
          metric_type: 'response_time' as const,
          priority: 'critical' as const,
          target_minutes: 60,
          warning_threshold_percent: 80,
        },
        {
          id: 'target-2',
          metric_type: 'resolution_time' as const,
          priority: 'critical' as const,
          target_minutes: 240,
          warning_threshold_percent: 75,
        },
      ],
    },
    {
      id: 'policy-2',
      name: 'Standard Problems SLA',
      description: null,
      entity_type: 'problem' as const,
      is_active: false,
      is_default: false,
      targets: [],
    },
  ];

  const mockStats = {
    total: 150,
    met: 135,
    breached: 15,
    met_percentage: 90,
  };

  const mockMutations = {
    mutateAsync: vi.fn(),
    isPending: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(useSlaPolicies).mockReturnValue({
      data: { data: mockPolicies },
      isLoading: false,
    } as any);

    vi.mocked(useSlaStats).mockReturnValue({
      data: { data: mockStats },
      isLoading: false,
    } as any);

    vi.mocked(useCreateSlaPolicy).mockReturnValue(mockMutations as any);
    vi.mocked(useUpdateSlaPolicy).mockReturnValue(mockMutations as any);
    vi.mocked(useDeleteSlaPolicy).mockReturnValue(mockMutations as any);
    vi.mocked(useCreateSlaTarget).mockReturnValue(mockMutations as any);
    vi.mocked(useUpdateSlaTarget).mockReturnValue(mockMutations as any);
    vi.mocked(useDeleteSlaTarget).mockReturnValue(mockMutations as any);
  });

  describe('Basic Rendering', () => {
    it('renders page title', () => {
      render(<SLAManagementPage />);
      expect(screen.getByText('SLA Management')).toBeInTheDocument();
    });

    it('renders page description', () => {
      render(<SLAManagementPage />);
      expect(screen.getByText('Configure Service Level Agreement policies and targets')).toBeInTheDocument();
    });

    it('renders Create Policy button', () => {
      render(<SLAManagementPage />);
      expect(screen.getByText('Create Policy')).toBeInTheDocument();
    });

    it('displays loading spinner when loading', () => {
      vi.mocked(useSlaPolicies).mockReturnValue({
        data: undefined,
        isLoading: true,
      } as any);

      render(<SLAManagementPage />);
      expect(screen.getByTestId('loader-icon')).toBeInTheDocument();
    });
  });

  describe('Stats Cards', () => {
    it('displays Total Policies count', () => {
      render(<SLAManagementPage />);
      expect(screen.getByText('Total Policies')).toBeInTheDocument();
      expect(screen.getByText('2')).toBeInTheDocument();
    });

    it('displays Active Policies count', () => {
      render(<SLAManagementPage />);
      const activePoliciesCard = screen.getByText('Active Policies').closest('.bg-white');
      expect(activePoliciesCard).toHaveTextContent('1');
    });

    it('displays Default Policies count', () => {
      render(<SLAManagementPage />);
      expect(screen.getByText('Default Policies')).toBeInTheDocument();
    });

    it('displays SLA Met Rate', () => {
      render(<SLAManagementPage />);
      expect(screen.getByText('SLA Met Rate')).toBeInTheDocument();
      expect(screen.getByText('90.0%')).toBeInTheDocument();
    });

    it('displays dash when stats unavailable', () => {
      vi.mocked(useSlaStats).mockReturnValue({
        data: undefined,
        isLoading: false,
      } as any);

      render(<SLAManagementPage />);
      expect(screen.getByText('-')).toBeInTheDocument();
    });
  });

  describe('Tabs', () => {
    it('renders Policies tab', () => {
      render(<SLAManagementPage />);
      expect(screen.getByText('Policies')).toBeInTheDocument();
    });

    it('renders Statistics tab', () => {
      render(<SLAManagementPage />);
      expect(screen.getByText('Statistics')).toBeInTheDocument();
    });

    it('defaults to Policies tab', () => {
      render(<SLAManagementPage />);
      const policiesTab = screen.getByText('Policies').closest('button');
      expect(policiesTab).toHaveClass('border-blue-500', 'text-blue-600');
    });

    it('switches to Statistics tab', () => {
      render(<SLAManagementPage />);
      fireEvent.click(screen.getByText('Statistics'));

      const statsTab = screen.getByText('Statistics').closest('button');
      expect(statsTab).toHaveClass('border-blue-500', 'text-blue-600');
    });
  });

  describe('Entity Type Filter', () => {
    it('displays entity type filter', () => {
      render(<SLAManagementPage />);
      expect(screen.getByText('Entity Type:')).toBeInTheDocument();
    });

    it('displays all filter options', () => {
      render(<SLAManagementPage />);
      const select = screen.getByDisplayValue('All Types') as HTMLSelectElement;
      expect(select.options).toHaveLength(4);
      expect(screen.getByText('All Types')).toBeInTheDocument();
      expect(screen.getByText('Issues')).toBeInTheDocument();
      expect(screen.getByText('Problems')).toBeInTheDocument();
      expect(screen.getByText('Changes')).toBeInTheDocument();
    });

    it('allows changing filter', () => {
      render(<SLAManagementPage />);
      const select = screen.getByDisplayValue('All Types') as HTMLSelectElement;
      fireEvent.change(select, { target: { value: 'issue' } });
      expect(select.value).toBe('issue');
    });
  });

  describe('Policies List', () => {
    it('displays all policies', () => {
      render(<SLAManagementPage />);
      expect(screen.getByText('Critical Issues SLA')).toBeInTheDocument();
      expect(screen.getByText('Standard Problems SLA')).toBeInTheDocument();
    });

    it('displays policy descriptions', () => {
      render(<SLAManagementPage />);
      fireEvent.click(screen.getByText('Critical Issues SLA'));
      expect(screen.getByText('SLA for critical priority issues')).toBeInTheDocument();
    });

    it('displays entity types', () => {
      render(<SLAManagementPage />);
      expect(screen.getByText(/Issues - 2 targets/)).toBeInTheDocument();
      expect(screen.getByText(/Problems - 0 targets/)).toBeInTheDocument();
    });

    it('displays Default badge for default policies', () => {
      render(<SLAManagementPage />);
      expect(screen.getByText('Default')).toBeInTheDocument();
    });

    it('displays Inactive badge for inactive policies', () => {
      render(<SLAManagementPage />);
      expect(screen.getByText('Inactive')).toBeInTheDocument();
    });

    it('shows empty state when no policies', () => {
      vi.mocked(useSlaPolicies).mockReturnValue({
        data: { data: [] },
        isLoading: false,
      } as any);

      render(<SLAManagementPage />);
      expect(screen.getByText('No SLA Policies')).toBeInTheDocument();
      expect(screen.getByText('Create your first SLA policy to get started')).toBeInTheDocument();
    });

    it('displays action buttons for each policy', () => {
      render(<SLAManagementPage />);
      expect(screen.getAllByTestId('edit2-icon')).toHaveLength(2);
      expect(screen.getAllByTestId('trash2-icon')).toHaveLength(2);
    });

    it('displays chevron down icon when collapsed', () => {
      render(<SLAManagementPage />);
      expect(screen.getAllByTestId('chevron-down-icon').length).toBeGreaterThan(0);
    });
  });

  describe('Policy Expansion', () => {
    it('expands policy when clicked', () => {
      render(<SLAManagementPage />);
      fireEvent.click(screen.getByText('Critical Issues SLA'));

      expect(screen.getByText('SLA Targets')).toBeInTheDocument();
    });

    it('displays Add Target button when expanded', () => {
      render(<SLAManagementPage />);
      fireEvent.click(screen.getByText('Critical Issues SLA'));

      expect(screen.getByText('Add Target')).toBeInTheDocument();
    });

    it('displays targets table when expanded', () => {
      render(<SLAManagementPage />);
      fireEvent.click(screen.getByText('Critical Issues SLA'));

      expect(screen.getByText('Priority')).toBeInTheDocument();
      expect(screen.getByText('Metric')).toBeInTheDocument();
      expect(screen.getByText('Target')).toBeInTheDocument();
      expect(screen.getByText('Warning At')).toBeInTheDocument();
      expect(screen.getByText('Actions')).toBeInTheDocument();
    });

    it('displays target details in table', () => {
      render(<SLAManagementPage />);
      fireEvent.click(screen.getByText('Critical Issues SLA'));

      expect(screen.getAllByText('Critical').length).toBeGreaterThan(0);
      expect(screen.getByText('First Response Time')).toBeInTheDocument();
      expect(screen.getByText('Resolution Time')).toBeInTheDocument();
      const targetCells = screen.getAllByText(/^(1h|4h)$/);
      expect(targetCells.length).toBe(2);
      expect(screen.getByText('80%')).toBeInTheDocument();
      expect(screen.getByText('75%')).toBeInTheDocument();
    });

    it('shows empty state when policy has no targets', () => {
      render(<SLAManagementPage />);
      fireEvent.click(screen.getByText('Standard Problems SLA'));

      expect(screen.getByText('No targets configured')).toBeInTheDocument();
    });

    it('collapses policy when clicked again', () => {
      render(<SLAManagementPage />);
      const policyCard = screen.getByText('Critical Issues SLA');

      fireEvent.click(policyCard);
      expect(screen.getByText('SLA Targets')).toBeInTheDocument();

      fireEvent.click(policyCard);
      expect(screen.queryByText('SLA Targets')).not.toBeInTheDocument();
    });

    it('shows chevron up when expanded', () => {
      render(<SLAManagementPage />);
      fireEvent.click(screen.getByText('Critical Issues SLA'));

      expect(screen.getByTestId('chevron-up-icon')).toBeInTheDocument();
    });
  });

  describe('Statistics Tab', () => {
    beforeEach(() => {
      render(<SLAManagementPage />);
      fireEvent.click(screen.getByText('Statistics'));
    });

    it('displays Total Evaluated stat', () => {
      expect(screen.getByText('Total Evaluated')).toBeInTheDocument();
      expect(screen.getByText('150')).toBeInTheDocument();
    });

    it('displays SLA Met stat', () => {
      expect(screen.getByText('SLA Met')).toBeInTheDocument();
      expect(screen.getByText('135')).toBeInTheDocument();
    });

    it('displays SLA Breached stat', () => {
      expect(screen.getByText('SLA Breached')).toBeInTheDocument();
      expect(screen.getByText('15')).toBeInTheDocument();
    });

    it('displays Compliance Rate', () => {
      expect(screen.getByText('Compliance Rate')).toBeInTheDocument();
      expect(screen.getAllByText('90.0%')[1]).toBeInTheDocument(); // Second instance in stats tab
    });

    it('displays compliance overview section', () => {
      expect(screen.getByText('SLA Compliance Overview')).toBeInTheDocument();
      expect(screen.getByText(/Met \(135\)/)).toBeInTheDocument();
      expect(screen.getByText(/Breached \(15\)/)).toBeInTheDocument();
    });

    it('displays improvement tips', () => {
      expect(screen.getByText('Improve Your SLA Compliance')).toBeInTheDocument();
      expect(screen.getByText(/To improve SLA compliance/)).toBeInTheDocument();
    });

    it('shows loading spinner when stats loading', () => {
      vi.mocked(useSlaStats).mockReturnValue({
        data: undefined,
        isLoading: true,
      } as any);

      const { container } = render(<SLAManagementPage />);
      const statsButtons = screen.getAllByText('Statistics');
      fireEvent.click(statsButtons[statsButtons.length - 1]);

      const loaders = container.querySelectorAll('[data-testid="loader-icon"]');
      expect(loaders.length).toBeGreaterThan(0);
    });

    it('shows empty state when no stats available', async () => {
      vi.mocked(useSlaStats).mockReturnValue({
        data: undefined,
        isLoading: false,
      } as any);

      render(<SLAManagementPage />);
      const statsButtons = screen.getAllByText('Statistics');
      fireEvent.click(statsButtons[statsButtons.length - 1]);

      await waitFor(() => {
        expect(screen.getByText('No Statistics Available')).toBeInTheDocument();
      });
      expect(screen.getByText('SLA statistics will appear once there are resolved issues')).toBeInTheDocument();
    });
  });

  describe('Create Policy Modal', () => {
    it('opens modal when Create Policy clicked', () => {
      render(<SLAManagementPage />);
      fireEvent.click(screen.getAllByText('Create Policy')[0]);

      expect(screen.getByText('Create SLA Policy')).toBeInTheDocument();
    });

    it('displays policy form fields', () => {
      render(<SLAManagementPage />);
      fireEvent.click(screen.getAllByText('Create Policy')[0]);

      expect(screen.getByText('Policy Name *')).toBeInTheDocument();
      expect(screen.getByText('Description')).toBeInTheDocument();
      expect(screen.getByText('Entity Type *')).toBeInTheDocument();
      expect(screen.getByText('Set as default policy for this entity type')).toBeInTheDocument();
    });

    it('displays entity type options in modal', () => {
      render(<SLAManagementPage />);
      fireEvent.click(screen.getAllByText('Create Policy')[0]);

      const selects = screen.getAllByDisplayValue('Issues');
      expect(selects.length).toBeGreaterThan(0);
    });

    it('displays Cancel and Create buttons', () => {
      render(<SLAManagementPage />);
      fireEvent.click(screen.getAllByText('Create Policy')[0]);

      expect(screen.getByText('Cancel')).toBeInTheDocument();
      const createButtons = screen.getAllByText('Create Policy');
      expect(createButtons.length).toBe(2); // One in header, one in modal
    });

    it('closes modal when Cancel clicked', () => {
      render(<SLAManagementPage />);
      fireEvent.click(screen.getAllByText('Create Policy')[0]);
      fireEvent.click(screen.getByText('Cancel'));

      expect(screen.queryByText('Create SLA Policy')).not.toBeInTheDocument();
    });
  });

  describe('Time Formatting', () => {
    it('formats minutes correctly', () => {
      const policiesWithVariousTimes = [
        {
          ...mockPolicies[0],
          targets: [
            {
              id: 't1',
              metric_type: 'response_time' as const,
              priority: 'critical' as const,
              target_minutes: 30,
              warning_threshold_percent: 80,
            },
            {
              id: 't2',
              metric_type: 'response_time' as const,
              priority: 'high' as const,
              target_minutes: 120,
              warning_threshold_percent: 80,
            },
            {
              id: 't3',
              metric_type: 'response_time' as const,
              priority: 'medium' as const,
              target_minutes: 1440,
              warning_threshold_percent: 80,
            },
          ],
        },
      ];

      vi.mocked(useSlaPolicies).mockReturnValue({
        data: { data: policiesWithVariousTimes },
        isLoading: false,
      } as any);

      render(<SLAManagementPage />);
      fireEvent.click(screen.getByText('Critical Issues SLA'));

      expect(screen.getByText('30m')).toBeInTheDocument();
      expect(screen.getByText('2h')).toBeInTheDocument();
      expect(screen.getByText('1d')).toBeInTheDocument();
    });
  });

  describe('Priority Badges', () => {
    it('displays priority badges with correct colors', () => {
      render(<SLAManagementPage />);
      fireEvent.click(screen.getByText('Critical Issues SLA'));

      const criticalBadges = screen.getAllByText('Critical');
      expect(criticalBadges.length).toBeGreaterThan(0);
      criticalBadges.forEach(badge => {
        expect(badge.className).toContain('bg-red-100');
        expect(badge.className).toContain('text-red-800');
      });
    });
  });

  describe('Policy Actions', () => {
    it('allows toggling policy active status', async () => {
      render(<SLAManagementPage />);

      const toggleButtons = screen.getAllByTestId('x-circle-icon');
      fireEvent.click(toggleButtons[0].closest('button')!);

      await waitFor(() => {
        expect(mockMutations.mutateAsync).toHaveBeenCalled();
      });
    });

    it('disables delete button for default policies', () => {
      render(<SLAManagementPage />);

      const deleteButtons = screen.getAllByTestId('trash2-icon')
        .map(icon => icon.closest('button'));

      const defaultPolicyDeleteButton = deleteButtons[0];
      expect(defaultPolicyDeleteButton).toBeDisabled();
    });
  });

  describe('Empty States', () => {
    it('shows empty policies message', () => {
      vi.mocked(useSlaPolicies).mockReturnValue({
        data: { data: [] },
        isLoading: false,
      } as any);

      render(<SLAManagementPage />);

      expect(screen.getByText('No SLA Policies')).toBeInTheDocument();
      expect(screen.getByTestId('clock-icon')).toBeInTheDocument();
    });
  });

  describe('Icons Display', () => {
    it('displays stat card icons', () => {
      render(<SLAManagementPage />);

      expect(screen.getAllByTestId('file-text-icon').length).toBeGreaterThan(0);
      expect(screen.getAllByTestId('check-circle-icon').length).toBeGreaterThan(0);
      expect(screen.getAllByTestId('target-icon').length).toBeGreaterThan(0);
      expect(screen.getAllByTestId('bar-chart-icon').length).toBeGreaterThan(0);
    });

    it('displays policy card icons', () => {
      render(<SLAManagementPage />);

      expect(screen.getAllByTestId('clock-icon').length).toBeGreaterThan(0);
    });
  });
});
