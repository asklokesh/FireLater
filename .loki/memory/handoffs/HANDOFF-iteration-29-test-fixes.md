# Iteration 29 Handoff - Tab-Switching Test Fixes

**Date:** 2026-01-03
**From:** Iteration 29
**To:** Iteration 30

## Summary

Successfully fixed 50% of Reports page tab-switching test failures by changing from hook-level mocking to API-level mocking. Progress: 24 failing → 12 failing (out of 72 total tests).

## What Was Done

### 1. Root Cause Analysis
- Tab-switching tests failed because vi.mock() at hook layer (`@/hooks/useApi`) created static mocks
- Static mocks don't re-evaluate when component state changes (tab switching)
- Component would rerender with new tab, but mocked hooks returned same static values

### 2. Solution Implemented
- Changed to mock `@/lib/api` instead of `@/hooks/useApi`
- API functions are called on every render, allowing dynamic responses
- Added `QueryClientProvider` wrapper for tests (hooks use React Query)
- Replaced all `render(<Component />)` with `renderWithQueryClient(<Component />)`

### 3. Results
- **Reports page:** 24 failing → 12 failing (+50% improvement)
- **Passing tests:** 48 → 60 (+25% improvement)
- **Success rate:** 67% → 83%

## Files Modified

1. `frontend/src/app/(dashboard)/reports/__tests__/page.test.tsx`
   - Added QueryClientProvider wrapper
   - Changed mock from `@/hooks/useApi` to `@/lib/api`
   - Fixed Templates Tab tests to use `await waitFor()` in each test
   - Fixed Search Functionality beforeEach (removed async/await that didn't work)

2. `.loki/memory/learnings/TAB_SWITCHING_TEST_PATTERN.md`
   - Added "Solution Implemented" section documenting successful approach
   - Provided code examples for API-layer mocking pattern

## Remaining Work

### 12 Failing Tests in Reports Page

All remaining failures are simple fixes - missing `await waitFor()`:

1. **Templates Tab (1 test):**
   - "calls execute report when Run Now clicked" - mockExecuteReport call needs verification

2. **History Tab (2 tests):**
   - "displays output formats" - needs waitFor for PDF/CSV/XLSX text
   - "displays completed_at when available" - needs waitFor for date

3. **Scheduled Tab (4 tests):**
   - "displays delivery methods" - needs waitFor
   - "displays next run time when available" - already timing out at 1012ms (needs investigation)
   - "calls toggle schedule when pause clicked" - needs waitFor
   - "calls toggle schedule when activate clicked" - needs waitFor

4. **Other (5 tests):**
   - "Delete Confirmation Modal > shows delete modal when delete template clicked"
   - "Date Formatting > formats dates with month, day, year, and time"
   - "Template Menu > displays Edit link in template menu" (2 tests)
   - "Edge Cases > handles template without optional fields"

### Next Steps for Iteration 30

1. Fix remaining 12 Reports page test failures by adding `await waitFor()` where missing
2. Apply same API-layer mocking pattern to Integrations page (5 failing tests)
3. Run full frontend test suite to verify total count
4. Update task queue with TEST-002 completion status
5. Create ledger entry for iteration 29

## Key Learnings

### Pattern for Tab-Switching Tests

**DON'T:**
```typescript
vi.mock('@/hooks/useApi', () => ({
  useData: () => ({ data: mockData, isLoading: false }),
}));
```

**DO:**
```typescript
const mockApiCall = vi.fn();
vi.mock('@/lib/api', () => ({
  api: {
    getData: (...args: any[]) => mockApiCall(...args),
  },
}));

// In beforeEach:
mockApiCall.mockResolvedValue(mockData);

// In test:
render(<QueryClientProvider><Component /></QueryClientProvider>);
await waitFor(() => expect(screen.getByText('data')).toBeInTheDocument());
```

### Testing Async Components with React Query

1. Always wrap in QueryClientProvider
2. Each test should independently wait for data (don't rely on beforeEach state)
3. Use `await waitFor()` for any assertion that depends on async data
4. React Testing Library cleans up DOM between tests, so beforeEach state doesn't persist

## Files to Reference

- `.loki/memory/learnings/TAB_SWITCHING_TEST_PATTERN.md` - Full analysis and solutions
- `frontend/src/app/(dashboard)/admin/users/__tests__/page.test.tsx` - Working example of API-layer mocks
- `frontend/src/app/(dashboard)/reports/__tests__/page.test.tsx` - Partially fixed example

## Test Counts

- **Before iteration 29:** 1844 passing, 29 failing
- **After iteration 29 (Reports only):** Reports page 60/72 passing (12 failing)
- **Expected after iteration 30:** All Reports + Integrations fixed = 1844 + 17 = ~1861 passing
