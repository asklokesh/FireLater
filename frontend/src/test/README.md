# Frontend Testing Infrastructure

## Overview

This directory contains the testing infrastructure for the FireLater frontend application using Vitest + React Testing Library.

## Setup Files

- **setup.ts**: Global test configuration and mocks
- **utils.tsx**: Custom render function with React Query provider

## Running Tests

```bash
# Run all tests once
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with UI
npm run test:ui

# Generate coverage report
npm run test:coverage
```

## Writing Tests

### Basic Component Test

```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@/test/utils';
import { MyComponent } from '../MyComponent';

describe('MyComponent', () => {
  it('renders correctly', () => {
    render(<MyComponent />);
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });
});
```

### Testing User Interactions

```typescript
import { userEvent } from '@testing-library/user-event';

it('handles click events', async () => {
  const handleClick = vi.fn();
  const user = userEvent.setup();

  render(<Button onClick={handleClick}>Click me</Button>);

  await user.click(screen.getByRole('button'));

  expect(handleClick).toHaveBeenCalledTimes(1);
});
```

### Testing with React Query

The custom `render` function automatically wraps components with QueryClientProvider:

```typescript
import { render, screen } from '@/test/utils';
import { useQuery } from '@tanstack/react-query';

function DataComponent() {
  const { data } = useQuery({
    queryKey: ['test'],
    queryFn: () => Promise.resolve({ message: 'Hello' }),
  });

  return <div>{data?.message}</div>;
}

it('fetches and displays data', async () => {
  render(<DataComponent />);
  expect(await screen.findByText('Hello')).toBeInTheDocument();
});
```

## Mocked Modules

### Next.js Router

The Next.js navigation hooks are automatically mocked:

```typescript
// useRouter, usePathname, useSearchParams are mocked
import { useRouter } from 'next/navigation';

// Use in tests without configuration
```

### window.matchMedia

Media queries are automatically mocked for testing responsive components.

## Test Organization

```
src/
├── components/
│   └── ui/
│       ├── button.tsx
│       └── __tests__/
│           └── button.test.tsx
├── hooks/
│   ├── useApi.ts
│   └── __tests__/
│       └── useApi.test.ts
└── test/
    ├── setup.ts
    ├── utils.tsx
    └── README.md
```

## Coverage Goals

- **Target**: 80% coverage for all components and hooks
- **Priority**: Core user flows (authentication, issue creation, approvals)
- **Reports**: HTML coverage reports generated in `coverage/` directory

## Best Practices

1. **Test user behavior**, not implementation details
2. **Use semantic queries** (getByRole, getByLabelText) over test IDs
3. **Avoid testing library internals** (React Query cache, Zustand store)
4. **Mock external dependencies** (API calls, localStorage)
5. **Keep tests focused** - one assertion per test when possible

## Troubleshooting

### Tests timing out

Increase timeout for async operations:

```typescript
it('fetches data', async () => {
  render(<Component />);
  expect(await screen.findByText('Data', {}, { timeout: 3000 })).toBeInTheDocument();
});
```

### Module not found errors

Check the path alias in `vitest.config.ts` matches your imports:

```typescript
resolve: {
  alias: {
    '@': path.resolve(__dirname, './src'),
  },
}
```

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [React Testing Library](https://testing-library.com/react)
- [Testing Library Queries](https://testing-library.com/docs/queries/about)
- [Common Mistakes](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library)
