# Tab Switching Test Pattern Issue

**Date:** 2026-01-03
**Context:** Iteration 28 - TEST-002 (Unit tests for React components)

## Problem

Tests for multi-tab components (Reports, Integrations pages) fail when switching tabs. The tab content doesn't render even though:
- Mocked hooks return `isLoading: false`
- Mocked hooks return valid data
- Tests use `waitFor()` and `async/await`

## Symptoms

```typescript
// Test clicks tab button
fireEvent.click(screen.getByText('Scheduled Reports'));

// Waits for content
await waitFor(() => {
  expect(screen.getByText('Monthly Incident Report')).toBeInTheDocument();
});
// FAILS: "Unable to find an element with the text: Monthly Incident Report"
```

Debug output shows loading spinner still visible, suggesting `schedulesLoading` is `true` despite mock.

## Root Cause

Vi.mock() creates static mocks at module load time. When a component:
1. Renders initially (tab 1 active)
2. User clicks tab 2 button
3. Component state changes (`activeTab: 'tab2'`)
4. Component rerenders with new tab state

The hook mocks don't re-evaluate - they return the same static values from initial render.

## Current Test Pattern (BROKEN)

```typescript
vi.mock('@/hooks/useApi', () => ({
  useReportSchedules: () => ({
    data: mockSchedulesData,
    isLoading: false,  // Static - doesn't respond to state changes
  }),
}));

it('displays schedules', async () => {
  render(<ReportsPage />);
  fireEvent.click(screen.getByText('Scheduled Reports'));  // Changes state
  await waitFor(() => {
    expect(screen.getByText('Schedule 1')).toBeInTheDocument();  // FAILS
  });
});
```

## Working Pattern (Users Page)

Users page has no tabs - single view with filters. All mocked hooks are called immediately on render:

```typescript
const { data: usersData } = useUsers();
const users = usersData?.data || [];

// Filters applied client-side
const filteredUsers = users.filter(/*...*/);
```

This works because the component doesn't conditionally call hooks based on state.

## Attempted Fixes (UNSUCCESSFUL)

1. ✗ Added `await waitFor()` after tab click
2. ✗ Made `beforeEach` async
3. ✗ Used `rerender()` after tab click
4. ✗ Changed mock return values mid-test

## Solution Approaches (TO TRY)

### Option 1: Mock at Component Level
Instead of mocking hooks, mock the data fetching layer:

```typescript
// Mock the API client, not the hooks
vi.mock('@/lib/api', () => ({
  reportsApi: {
    listSchedules: vi.fn().mockResolvedValue(mockSchedulesData),
  },
}));
```

### Option 2: Use MSW (Mock Service Worker)
Mock at HTTP layer instead of hook layer:

```typescript
import { setupServer } from 'msw/node';
import { rest } from 'msw';

const server = setupServer(
  rest.get('/api/reports/schedules', (req, res, ctx) => {
    return res(ctx.json(mockSchedulesData));
  })
);
```

### Option 3: Test Each Tab Separately
Instead of clicking tabs in tests, render component with tab pre-selected:

```typescript
it('displays schedules', async () => {
  // Add initialTab prop or mock URL param
  render(<ReportsPage initialTab="scheduled" />);
  await waitFor(() => {
    expect(screen.getByText('Schedule 1')).toBeInTheDocument();
  });
});
```

### Option 4: Dynamic Mock Returns
Use `mockReturnValue` with functions:

```typescript
let currentTab = 'templates';

vi.mock('@/hooks/useApi', () => ({
  useReportSchedules: () => {
    const isActive = currentTab === 'scheduled';
    return {
      data: isActive ? mockSchedulesData : null,
      isLoading: !isActive,
    };
  },
}));
```

## Impact

- Reports page: 24 failing tests (48/72 passing)
- Integrations page: 5 failing tests
- Total impact: 29 failing tests

## Recommendation for Next Iteration

Try Option 3 (Test Each Tab Separately) first - least invasive, maintains current test structure. If that fails, try Option 1 (Mock at Component Level) to avoid hook mocking issues entirely.

## Related Files

- `frontend/src/app/(dashboard)/reports/__tests__/page.test.tsx`
- `frontend/src/app/(dashboard)/admin/integrations/__tests__/page.test.tsx`
- `frontend/src/app/(dashboard)/reports/page.tsx`
- `frontend/src/app/(dashboard)/admin/integrations/page.tsx`

## References

- Vitest mocking: https://vitest.dev/guide/mocking.html
- React Testing Library async: https://testing-library.com/docs/dom-testing-library/api-async/
- MSW: https://mswjs.io/docs/
