# Iteration 13 - Register Page Test Fixes

## Problem
15 failing tests in register page:
- 10 validation tests timing out (~1000ms)
- 3 form submission tests timing out (5000ms)
- 2 duplicate success state tests (removed)

## Root Cause Analysis

### Validation Tests Issue
Tests try to trigger JavaScript validation by clicking submit with empty fields. However:
1. Form inputs have HTML5 `required` attributes
2. In JSDOM (vitest test environment), native form validation may prevent onSubmit from firing
3. Tests click terms checkbox to bypass one required field, but other required fields block submission
4. The validateForm() function in handleSubmit is never reached

### Form Submission Tests Issue
- "redirects to login after successful registration" - Uses fake timers, may interfere with async/await
- "displays error message on registration failure" - Times out waiting for error message
- "handles generic error on registration failure" - Times out waiting for generic error

## Changes Made
1. Removed duplicate "Success State" describe block (2 tests that were covered by "Form Submission")
2. Added waitFor() to all validation tests
3. Modified validation tests to click terms checkbox before submitting
4. Changed redirect test to use advanceTimersByTimeAsync
5. Simplified test patterns (removed userEvent in favor of fireEvent for consistency)

## Current Status
- Still 13 failures
- Validation tests: Form submission not triggering due to HTML5 validation in JSDOM
- Form submission error tests: Need investigation

## Next Steps
1. Check if JSDOM supports native form validation or if we need to mock it
2. Consider removing `required` attributes in tests or mocking form.submit()
3. Investigate why error tests are timing out - check mock setup
4. May need to test validation differently (unit test validateForm function separately)

## Key Insights
- HTML5 validation vs JavaScript validation creates testing complexity
- JSDOM environment may not fully support native form validation
- Working tests ("calls register API") use fillValidForm() which fills ALL fields
- Validation tests need a different approach - possibly submit form programmatically
