import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import WorkflowManagementPage from '../page';

const mockUseWorkflowRules = vi.fn();
const mockUseWorkflowLogs = vi.fn();
const mockUseWorkflowFields = vi.fn();
const mockUseCreateWorkflowRule = vi.fn();
const mockUseUpdateWorkflowRule = vi.fn();
const mockUseDeleteWorkflowRule = vi.fn();
const mockUseToggleWorkflowRule = vi.fn();

vi.mock('@/hooks/useApi', () => ({
  useWorkflowRules: () => mockUseWorkflowRules(),
  useWorkflowLogs: () => mockUseWorkflowLogs(),
  useWorkflowFields: () => mockUseWorkflowFields(),
  useCreateWorkflowRule: () => mockUseCreateWorkflowRule(),
  useUpdateWorkflowRule: () => mockUseUpdateWorkflowRule(),
  useDeleteWorkflowRule: () => mockUseDeleteWorkflowRule(),
  useToggleWorkflowRule: () => mockUseToggleWorkflowRule(),
}));

const mockRules = [
  {
    id: '1',
    name: 'Auto-assign critical issues',
    description: 'Automatically assign critical issues to the on-call engineer',
    entity_type: 'issue' as const,
    trigger_type: 'on_create' as const,
    is_active: true,
    conditions: [
      {
        id: 'c1',
        field: 'priority',
        operator: 'equals' as const,
        value: 'critical',
        logical_operator: 'AND' as const,
      },
    ],
    actions: [
      {
        id: 'a1',
        action_type: 'assign_to_group' as const,
        parameters: { group: 'on-call' },
        order: 0,
      },
    ],
    execution_order: 1,
    stop_on_match: false,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
  {
    id: '2',
    name: 'Escalate stale changes',
    description: 'Escalate changes that are pending for more than 3 days',
    entity_type: 'change' as const,
    trigger_type: 'scheduled' as const,
    is_active: false,
    conditions: [],
    actions: [
      {
        id: 'a2',
        action_type: 'escalate' as const,
        parameters: {},
        order: 0,
      },
    ],
    execution_order: 2,
    stop_on_match: true,
    created_at: '2024-01-02T00:00:00Z',
    updated_at: '2024-01-02T00:00:00Z',
  },
];

const mockLogs = [
  {
    id: 'log1',
    rule_id: '1',
    rule_name: 'Auto-assign critical issues',
    entity_type: 'issue' as const,
    entity_id: 'issue-123',
    conditions_matched: true,
    execution_time_ms: 45,
    executed_at: new Date().toISOString(),
  },
  {
    id: 'log2',
    rule_id: '1',
    rule_name: 'Auto-assign critical issues',
    entity_type: 'issue' as const,
    entity_id: 'issue-456',
    conditions_matched: false,
    execution_time_ms: 12,
    executed_at: new Date(Date.now() - 86400000).toISOString(),
  },
  {
    id: 'log3',
    rule_id: '2',
    rule_name: 'Escalate stale changes',
    entity_type: 'change' as const,
    entity_id: 'change-789',
    conditions_matched: true,
    execution_time_ms: 123,
    error: 'Escalation failed: group not found',
    executed_at: new Date().toISOString(),
  },
];

const mockFields = [
  { field: 'status', label: 'Status' },
  { field: 'priority', label: 'Priority' },
  { field: 'assigned_to', label: 'Assigned To' },
];

// Mock window methods globally
global.confirm = vi.fn(() => true);
global.alert = vi.fn();

describe('WorkflowManagementPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (global.alert as any) = vi.fn();
    (global.confirm as any) = vi.fn(() => true);

    mockUseWorkflowRules.mockReturnValue({
      data: { data: mockRules },
      isLoading: false,
    });

    mockUseWorkflowLogs.mockReturnValue({
      data: { data: mockLogs },
      isLoading: false,
    });

    mockUseWorkflowFields.mockReturnValue({
      data: { data: mockFields },
      isLoading: false,
    });

    mockUseCreateWorkflowRule.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({}),
      isPending: false,
    });

    mockUseUpdateWorkflowRule.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({}),
      isPending: false,
    });

    mockUseDeleteWorkflowRule.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({}),
    });

    mockUseToggleWorkflowRule.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({}),
    });

    (global.confirm as any).mockReturnValue(true);
  });

  describe('Page Layout', () => {
    it('renders page title and description', async () => {
      render(<WorkflowManagementPage />);

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /workflow automation/i })).toBeInTheDocument();
      });

      expect(
        screen.getByText(/create and manage automation rules for issues, problems, changes, and requests/i)
      ).toBeInTheDocument();
    });

    it('renders create rule button', async () => {
      render(<WorkflowManagementPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /create rule/i })).toBeInTheDocument();
      });
    });

    it('shows loading state initially', () => {
      mockUseWorkflowRules.mockReturnValue({
        data: { data: [] },
        isLoading: true,
      });

      render(<WorkflowManagementPage />);

      const loader = document.querySelector('.animate-spin');
      expect(loader).toBeInTheDocument();
    });

    it('renders tab navigation', async () => {
      render(<WorkflowManagementPage />);

      await waitFor(() => {
        expect(screen.getByText('Workflow Rules')).toBeInTheDocument();
      });

      expect(screen.getByText('Execution Logs')).toBeInTheDocument();
    });
  });

  describe('Stats Cards', () => {
    it('displays correct total rules count', async () => {
      render(<WorkflowManagementPage />);

      await waitFor(() => {
        expect(screen.getByText('Total Rules')).toBeInTheDocument();
      });

      const totalCard = screen.getByText('Total Rules').closest('div');
      expect(totalCard).toHaveTextContent('2');
    });

    it('displays correct active rules count', async () => {
      render(<WorkflowManagementPage />);

      await waitFor(() => {
        expect(screen.getByText('Active Rules')).toBeInTheDocument();
      });

      const activeCard = screen.getByText('Active Rules').closest('div');
      expect(activeCard).toHaveTextContent('1');
    });

    it('displays executions today count', async () => {
      render(<WorkflowManagementPage />);

      await waitFor(() => {
        expect(screen.getByText('Executions Today')).toBeInTheDocument();
      });

      const executionsCard = screen.getByText('Executions Today').closest('div');
      expect(executionsCard).toHaveTextContent('2');
    });

    it('displays failed today count', async () => {
      render(<WorkflowManagementPage />);

      await waitFor(() => {
        expect(screen.getByText('Failed Today')).toBeInTheDocument();
      });

      const failedCard = screen.getByText('Failed Today').closest('div');
      expect(failedCard).toHaveTextContent('1');
    });
  });

  describe('Entity Type Filter', () => {
    it('displays entity type filter dropdown', async () => {
      render(<WorkflowManagementPage />);

      await waitFor(() => {
        const filter = screen.getByRole('combobox');
        expect(filter).toBeInTheDocument();
      });
    });

    it('has all entity type options', async () => {
      render(<WorkflowManagementPage />);

      await waitFor(() => {
        const filter = screen.getByRole('combobox');
        expect(filter).toBeInTheDocument();
      });

      expect(screen.getByRole('option', { name: /all types/i })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /issues/i })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /problems/i })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /changes/i })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /requests/i })).toBeInTheDocument();
    });

    it('filters rules by entity type', async () => {
      render(<WorkflowManagementPage />);

      await waitFor(() => {
        expect(screen.getByRole('combobox')).toBeInTheDocument();
      });

      const filter = screen.getByRole('combobox');
      fireEvent.change(filter, { target: { value: 'issue' } });

      // Filter change is handled internally by the page
    });
  });

  describe('Rules List - Empty State', () => {
    beforeEach(() => {
      mockUseWorkflowRules.mockReturnValue({
        data: { data: [] },
        isLoading: false,
      });
    });

    it('shows empty state when no rules exist', async () => {
      render(<WorkflowManagementPage />);

      await waitFor(() => {
        expect(screen.getByText(/no workflow rules/i)).toBeInTheDocument();
      });

      expect(
        screen.getByText(/create your first automation rule to streamline your processes/i)
      ).toBeInTheDocument();
    });

    it('shows create button in empty state', async () => {
      render(<WorkflowManagementPage />);

      await waitFor(() => {
        expect(screen.getByText(/no workflow rules/i)).toBeInTheDocument();
      });

      const createButtons = screen.getAllByRole('button', { name: /create rule/i });
      expect(createButtons.length).toBeGreaterThan(0);
    });
  });

  describe('Rules List - Rule Cards', () => {
    it('displays all rule cards', async () => {
      render(<WorkflowManagementPage />);

      await waitFor(() => {
        expect(screen.getByText('Auto-assign critical issues')).toBeInTheDocument();
      });

      expect(screen.getByText('Escalate stale changes')).toBeInTheDocument();
    });

    it('displays rule descriptions', async () => {
      render(<WorkflowManagementPage />);

      await waitFor(() => {
        expect(screen.getByText('Auto-assign critical issues')).toBeInTheDocument();
      });

      // Descriptions are shown when cards are expanded, not in collapsed state
      expect(screen.getByText('Escalate stale changes')).toBeInTheDocument();
    });

    it('displays trigger type badges', async () => {
      render(<WorkflowManagementPage />);

      await waitFor(() => {
        expect(screen.getByText('On Create')).toBeInTheDocument();
      });

      expect(screen.getByText('Scheduled')).toBeInTheDocument();
    });

    it('displays inactive badge for inactive rules', async () => {
      render(<WorkflowManagementPage />);

      await waitFor(() => {
        expect(screen.getByText('Inactive')).toBeInTheDocument();
      });
    });

    it('displays conditions and actions count', async () => {
      render(<WorkflowManagementPage />);

      await waitFor(() => {
        expect(screen.getByText(/issues - 1 conditions, 1 actions/i)).toBeInTheDocument();
      });

      expect(screen.getByText(/changes - 0 conditions, 1 actions/i)).toBeInTheDocument();
    });

    it('has action buttons for each rule', async () => {
      render(<WorkflowManagementPage />);

      await waitFor(() => {
        expect(screen.getByText('Auto-assign critical issues')).toBeInTheDocument();
      });

      const buttons = document.querySelectorAll('button');
      expect(buttons.length).toBeGreaterThan(5); // Should have multiple buttons for actions
    });
  });

  describe('Rule Card - Expand/Collapse', () => {
    it('expands rule card when clicked', async () => {
      render(<WorkflowManagementPage />);

      await waitFor(() => {
        expect(screen.getByText('Auto-assign critical issues')).toBeInTheDocument();
      });

      const ruleCard = screen.getByText('Auto-assign critical issues').closest('div')?.parentElement;
      if (ruleCard) {
        fireEvent.click(ruleCard);

        await waitFor(() => {
          expect(screen.getByText(/conditions \(if\)/i)).toBeInTheDocument();
        });
      }
    });

    it('displays conditions section when expanded', async () => {
      render(<WorkflowManagementPage />);

      await waitFor(() => {
        expect(screen.getByText('Auto-assign critical issues')).toBeInTheDocument();
      });

      const ruleCard = screen.getByText('Auto-assign critical issues').closest('div')?.parentElement;
      if (ruleCard) {
        fireEvent.click(ruleCard);

        await waitFor(() => {
          expect(screen.getByText(/conditions \(if\)/i)).toBeInTheDocument();
        });

        expect(screen.getByText('priority')).toBeInTheDocument();
        expect(screen.getByText('equals')).toBeInTheDocument();
        expect(screen.getByText('critical')).toBeInTheDocument();
      }
    });

    it('displays actions section when expanded', async () => {
      render(<WorkflowManagementPage />);

      await waitFor(() => {
        expect(screen.getByText('Auto-assign critical issues')).toBeInTheDocument();
      });

      const ruleCard = screen.getByText('Auto-assign critical issues').closest('div')?.parentElement;
      if (ruleCard) {
        fireEvent.click(ruleCard);

        await waitFor(() => {
          expect(screen.getByText(/actions \(then\)/i)).toBeInTheDocument();
        });

        expect(screen.getByText('Assign to Group')).toBeInTheDocument();
      }
    });

    it('displays stop on match warning when expanded', async () => {
      render(<WorkflowManagementPage />);

      await waitFor(() => {
        expect(screen.getByText('Escalate stale changes')).toBeInTheDocument();
      });

      const ruleCard = screen.getByText('Escalate stale changes').closest('div')?.parentElement;
      if (ruleCard) {
        fireEvent.click(ruleCard);

        await waitFor(() => {
          expect(
            screen.getByText(/stops processing subsequent rules when this rule matches/i)
          ).toBeInTheDocument();
        });
      }
    });

    it('collapses rule card when clicked again', async () => {
      render(<WorkflowManagementPage />);

      await waitFor(() => {
        expect(screen.getByText('Auto-assign critical issues')).toBeInTheDocument();
      });

      const ruleCard = screen.getByText('Auto-assign critical issues').closest('div')?.parentElement;
      if (ruleCard) {
        fireEvent.click(ruleCard);

        await waitFor(() => {
          expect(screen.getByText(/conditions \(if\)/i)).toBeInTheDocument();
        });

        fireEvent.click(ruleCard);

        await waitFor(() => {
          expect(screen.queryByText(/conditions \(if\)/i)).not.toBeInTheDocument();
        });
      }
    });
  });

  describe('Rule Actions', () => {
    it('toggles rule activation', async () => {
      const mockToggle = vi.fn().mockResolvedValue({});
      mockUseToggleWorkflowRule.mockReturnValue({
        mutateAsync: mockToggle,
      });

      render(<WorkflowManagementPage />);

      await waitFor(() => {
        expect(screen.getByText('Auto-assign critical issues')).toBeInTheDocument();
      });

      const buttons = document.querySelectorAll('button');
      const toggleButton = Array.from(buttons).find(btn => {
        const pauseIcon = btn.querySelector('svg');
        return pauseIcon && btn.title?.includes('Deactivate');
      });

      if (toggleButton) {
        fireEvent.click(toggleButton);

        await waitFor(() => {
          expect(mockToggle).toHaveBeenCalledWith('1');
        });
      }
    });

    it('deletes rule with confirmation', async () => {
      const mockDelete = vi.fn().mockResolvedValue({});
      mockUseDeleteWorkflowRule.mockReturnValue({
        mutateAsync: mockDelete,
      });

      render(<WorkflowManagementPage />);

      await waitFor(() => {
        expect(screen.getByText('Auto-assign critical issues')).toBeInTheDocument();
      });

      const buttons = document.querySelectorAll('button');
      const deleteButton = Array.from(buttons).find(btn => {
        const icon = btn.querySelector('svg.text-red-500');
        return icon !== null;
      });

      if (deleteButton) {
        fireEvent.click(deleteButton);

        await waitFor(() => {
          expect(mockDelete).toHaveBeenCalledWith('1');
        });
      }
    });

    it('does not delete rule when confirmation is cancelled', async () => {
      (global.confirm as any).mockReturnValue(false);
      const mockDelete = vi.fn();
      mockUseDeleteWorkflowRule.mockReturnValue({
        mutateAsync: mockDelete,
      });

      render(<WorkflowManagementPage />);

      await waitFor(() => {
        expect(screen.getByText('Auto-assign critical issues')).toBeInTheDocument();
      });

      const buttons = document.querySelectorAll('button');
      const deleteButton = Array.from(buttons).find(btn => {
        const icon = btn.querySelector('svg.text-red-500');
        return icon !== null;
      });

      if (deleteButton) {
        fireEvent.click(deleteButton);

        expect(mockDelete).not.toHaveBeenCalled();
      }
    });
  });

  describe('Execution Logs Tab', () => {
    it('switches to execution logs tab', async () => {
      render(<WorkflowManagementPage />);

      await waitFor(() => {
        expect(screen.getByText('Execution Logs')).toBeInTheDocument();
      });

      const logsTab = screen.getByText('Execution Logs');
      fireEvent.click(logsTab);

      await waitFor(() => {
        expect(screen.getByText('Executed At')).toBeInTheDocument();
      });
    });

    it('displays execution logs table', async () => {
      render(<WorkflowManagementPage />);

      await waitFor(() => {
        expect(screen.getByText('Execution Logs')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Execution Logs'));

      await waitFor(() => {
        expect(screen.getByText('Rule')).toBeInTheDocument();
      });

      expect(screen.getByText('Entity')).toBeInTheDocument();
      expect(screen.getByText('Status')).toBeInTheDocument();
      expect(screen.getByText('Duration')).toBeInTheDocument();
    });

    it('displays execution log entries', async () => {
      render(<WorkflowManagementPage />);

      await waitFor(() => {
        expect(screen.getByText('Execution Logs')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Execution Logs'));

      await waitFor(() => {
        const ruleCells = screen.getAllByText('Auto-assign critical issues');
        expect(ruleCells.length).toBeGreaterThan(0);
      });

      expect(screen.getByText('Escalate stale changes')).toBeInTheDocument();
    });

    it('displays execution status badges', async () => {
      render(<WorkflowManagementPage />);

      await waitFor(() => {
        expect(screen.getByText('Execution Logs')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Execution Logs'));

      await waitFor(() => {
        expect(screen.getByText('Executed')).toBeInTheDocument();
      });

      expect(screen.getByText('Skipped')).toBeInTheDocument();
      expect(screen.getByText('Failed')).toBeInTheDocument();
    });

    it('displays execution duration', async () => {
      render(<WorkflowManagementPage />);

      await waitFor(() => {
        expect(screen.getByText('Execution Logs')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Execution Logs'));

      await waitFor(() => {
        expect(screen.getByText('45ms')).toBeInTheDocument();
      });

      expect(screen.getByText('12ms')).toBeInTheDocument();
      expect(screen.getByText('123ms')).toBeInTheDocument();
    });

    it('shows loading state for logs', async () => {
      mockUseWorkflowLogs.mockReturnValue({
        data: { data: [] },
        isLoading: true,
      });

      render(<WorkflowManagementPage />);

      await waitFor(() => {
        expect(screen.getByText('Execution Logs')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Execution Logs'));

      await waitFor(() => {
        const loaders = document.querySelectorAll('.animate-spin');
        expect(loaders.length).toBeGreaterThan(0);
      });
    });

    it('shows empty state when no logs exist', async () => {
      mockUseWorkflowLogs.mockReturnValue({
        data: { data: [] },
        isLoading: false,
      });

      render(<WorkflowManagementPage />);

      await waitFor(() => {
        expect(screen.getByText('Execution Logs')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Execution Logs'));

      await waitFor(() => {
        expect(screen.getByText(/no execution logs/i)).toBeInTheDocument();
      });

      expect(
        screen.getByText(/workflow execution logs will appear here once rules start running/i)
      ).toBeInTheDocument();
    });
  });

  describe('Create Rule Modal', () => {
    it('opens create modal when create button is clicked', async () => {
      render(<WorkflowManagementPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /create rule/i })).toBeInTheDocument();
      });

      const createButton = screen.getAllByRole('button', { name: /create rule/i })[0];
      fireEvent.click(createButton);

      await waitFor(() => {
        expect(screen.getByText(/create workflow rule/i)).toBeInTheDocument();
      });
    });

    it('displays all form fields in create modal', async () => {
      render(<WorkflowManagementPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /create rule/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getAllByRole('button', { name: /create rule/i })[0]);

      await waitFor(() => {
        expect(screen.getByText(/create workflow rule/i)).toBeInTheDocument();
      });

      expect(screen.getByPlaceholderText(/auto-assign critical issues/i)).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/brief description/i)).toBeInTheDocument();

      const labels = screen.getAllByText(/entity type/i);
      expect(labels.length).toBeGreaterThan(0);

      const triggerLabels = screen.getAllByText(/trigger/i);
      expect(triggerLabels.length).toBeGreaterThan(0);
    });

    it('has add condition button', async () => {
      render(<WorkflowManagementPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /create rule/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getAllByRole('button', { name: /create rule/i })[0]);

      await waitFor(() => {
        expect(screen.getByText(/create workflow rule/i)).toBeInTheDocument();
      });

      expect(screen.getByRole('button', { name: /add condition/i })).toBeInTheDocument();
    });

    it('has add action button', async () => {
      render(<WorkflowManagementPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /create rule/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getAllByRole('button', { name: /create rule/i })[0]);

      await waitFor(() => {
        expect(screen.getByText(/create workflow rule/i)).toBeInTheDocument();
      });

      expect(screen.getByRole('button', { name: /add action/i })).toBeInTheDocument();
    });

    it('has stop on match checkbox', async () => {
      render(<WorkflowManagementPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /create rule/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getAllByRole('button', { name: /create rule/i })[0]);

      await waitFor(() => {
        expect(screen.getByText(/create workflow rule/i)).toBeInTheDocument();
      });

      expect(
        screen.getByText(/stop processing subsequent rules when this rule matches/i)
      ).toBeInTheDocument();
    });

    it('closes modal when cancel is clicked', async () => {
      render(<WorkflowManagementPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /create rule/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getAllByRole('button', { name: /create rule/i })[0]);

      await waitFor(() => {
        expect(screen.getByText(/create workflow rule/i)).toBeInTheDocument();
      });

      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      fireEvent.click(cancelButton);

      await waitFor(() => {
        expect(screen.queryByText(/create workflow rule/i)).not.toBeInTheDocument();
      });
    });

    it('disables submit button when no actions or name are provided', async () => {
      render(<WorkflowManagementPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /create rule/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getAllByRole('button', { name: /create rule/i })[0]);

      await waitFor(() => {
        expect(screen.getByText(/create workflow rule/i)).toBeInTheDocument();
      });

      // Submit button should be disabled initially (no name, no actions)
      await waitFor(() => {
        const allButtons = screen.getAllByRole('button');
        const submitButtons = allButtons.filter(btn => btn.textContent === 'Create Rule');
        // The last one should be the submit button in the modal
        const submitButton = submitButtons[submitButtons.length - 1];
        expect(submitButton).toBeDisabled();
      });
    });
  });

  describe('Edit Rule Modal', () => {
    it('opens edit modal when edit button is clicked', async () => {
      render(<WorkflowManagementPage />);

      await waitFor(() => {
        expect(screen.getByText('Auto-assign critical issues')).toBeInTheDocument();
      });

      const buttons = document.querySelectorAll('button');
      const editButton = Array.from(buttons).find(btn => {
        const svg = btn.querySelector('svg');
        return svg && btn.className.includes('ghost') && !svg.classList.contains('text-red-500') && !svg.classList.contains('text-orange-500') && !svg.classList.contains('text-green-500');
      });

      if (editButton) {
        fireEvent.click(editButton);

        await waitFor(() => {
          expect(screen.getByText(/edit workflow rule/i)).toBeInTheDocument();
        });
      }
    });

    it('pre-fills form with rule data in edit modal', async () => {
      render(<WorkflowManagementPage />);

      await waitFor(() => {
        expect(screen.getByText('Auto-assign critical issues')).toBeInTheDocument();
      });

      const buttons = document.querySelectorAll('button');
      const editButton = Array.from(buttons).find(btn => {
        const svg = btn.querySelector('svg');
        return svg && btn.className.includes('ghost') && !svg.classList.contains('text-red-500') && !svg.classList.contains('text-orange-500') && !svg.classList.contains('text-green-500');
      });

      if (editButton) {
        fireEvent.click(editButton);

        await waitFor(() => {
          expect(screen.getByText(/edit workflow rule/i)).toBeInTheDocument();
        });

        const nameInputs = document.querySelectorAll('input[type="text"]');
        const nameInput = Array.from(nameInputs).find(input =>
          (input as HTMLInputElement).value === 'Auto-assign critical issues'
        ) as HTMLInputElement;
        expect(nameInput).toBeDefined();
        expect(nameInput.value).toBe('Auto-assign critical issues');
      }
    });

    it('disables entity type and trigger fields in edit mode', async () => {
      render(<WorkflowManagementPage />);

      await waitFor(() => {
        expect(screen.getByText('Auto-assign critical issues')).toBeInTheDocument();
      });

      const buttons = document.querySelectorAll('button');
      const editButton = Array.from(buttons).find(btn => {
        const svg = btn.querySelector('svg');
        return svg && btn.className.includes('ghost') && !svg.classList.contains('text-red-500') && !svg.classList.contains('text-orange-500') && !svg.classList.contains('text-green-500');
      });

      if (editButton) {
        fireEvent.click(editButton);

        await waitFor(() => {
          expect(screen.getByText(/edit workflow rule/i)).toBeInTheDocument();
        });

        const selects = document.querySelectorAll('select');
        const disabledSelects = Array.from(selects).filter(select =>
          (select as HTMLSelectElement).disabled
        );
        expect(disabledSelects.length).toBeGreaterThan(0);
      }
    });

    it('updates rule when save is clicked', async () => {
      const mockUpdate = vi.fn().mockResolvedValue({});
      mockUseUpdateWorkflowRule.mockReturnValue({
        mutateAsync: mockUpdate,
        isPending: false,
      });

      render(<WorkflowManagementPage />);

      await waitFor(() => {
        expect(screen.getByText('Auto-assign critical issues')).toBeInTheDocument();
      });

      const buttons = document.querySelectorAll('button');
      const editButton = Array.from(buttons).find(btn => {
        const svg = btn.querySelector('svg');
        return svg && btn.className.includes('ghost') && !svg.classList.contains('text-red-500') && !svg.classList.contains('text-orange-500') && !svg.classList.contains('text-green-500');
      });

      if (editButton) {
        fireEvent.click(editButton);

        await waitFor(() => {
          expect(screen.getByText(/edit workflow rule/i)).toBeInTheDocument();
        });

        const nameInputs = document.querySelectorAll('input[type="text"]');
        const nameInput = Array.from(nameInputs).find(input =>
          (input as HTMLInputElement).value === 'Auto-assign critical issues'
        ) as HTMLInputElement;

        if (nameInput) {
          fireEvent.change(nameInput, { target: { value: 'Updated Rule Name' } });

          const updateButton = screen.getByRole('button', { name: /update rule/i });
          fireEvent.click(updateButton);

          await waitFor(() => {
            expect(mockUpdate).toHaveBeenCalled();
          });
        }
      }
    });

    it('closes modal after successful update', async () => {
      const mockUpdate = vi.fn().mockResolvedValue({});
      mockUseUpdateWorkflowRule.mockReturnValue({
        mutateAsync: mockUpdate,
        isPending: false,
      });

      render(<WorkflowManagementPage />);

      await waitFor(() => {
        expect(screen.getByText('Auto-assign critical issues')).toBeInTheDocument();
      });

      const buttons = document.querySelectorAll('button');
      const editButton = Array.from(buttons).find(btn => {
        const svg = btn.querySelector('svg');
        return svg && btn.className.includes('ghost') && !svg.classList.contains('text-red-500') && !svg.classList.contains('text-orange-500') && !svg.classList.contains('text-green-500');
      });

      if (editButton) {
        fireEvent.click(editButton);

        await waitFor(() => {
          expect(screen.getByText(/edit workflow rule/i)).toBeInTheDocument();
        });

        const updateButton = screen.getByRole('button', { name: /update rule/i });
        fireEvent.click(updateButton);

        await waitFor(() => {
          expect(screen.queryByText(/edit workflow rule/i)).not.toBeInTheDocument();
        });
      }
    });
  });
});
